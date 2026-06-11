import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const args = parseArgs(process.argv.slice(2));
const provider = args.provider || process.env.TTS_PROVIDER || 'indextts';

const indexTtsRoot = path.resolve(args.indexTtsRoot || process.env.INDEX_TTS_ROOT || String.raw`D:\Ai\index-tts`);
const python = path.join(indexTtsRoot, '.venv', 'Scripts', 'python.exe');
const input = path.resolve(args.input || 'public/audio/xiaohongshu-narration.txt');
const output = path.resolve(args.output || 'public/audio/xiaohongshu-narration.wav');
const referenceInput = args.reference || process.env.INDEX_TTS_REFERENCE || '';
const reference = referenceInput ? path.resolve(referenceInput) : '';
const emotion =
  args.emotion ||
  process.env.INDEX_TTS_EMOTION ||
  '兴奋、有力、节奏快，有一点咆哮感，但吐字清楚，适合小红书教程口播。';

if (!existsSync(python)) {
  throw new Error(`IndexTTS2 Python not found: ${python}`);
}
if (!existsSync(input)) {
  throw new Error(`Voiceover text not found: ${input}. Run npm run video:script first.`);
}

await fs.mkdir(path.dirname(output), { recursive: true });

if (provider === 'volcengine') {
  await generateWithVolcengine(input, output);
} else if (provider === 'indextts') {
  await generateWithIndexTTS();
} else {
  throw new Error(`Unsupported TTS provider: ${provider}. Use indextts or volcengine.`);
}

async function generateWithIndexTTS() {
  if (!existsSync(python)) {
    throw new Error(`IndexTTS2 Python not found: ${python}`);
  }
  if (!referenceInput || !reference || !existsSync(reference)) {
    throw new Error(
      'Reference voice audio is required. Use: npm run video:tts -- --reference D:\\path\\voice.wav'
    );
  }

const script = String.raw`
import os
import re
import sys
import tempfile

import numpy as np
import soundfile as sf
from indextts.infer_v2 import IndexTTS2

root, text_path, reference, output_path, emotion = sys.argv[1:6]

with open(text_path, "r", encoding="utf-8-sig") as f:
    text = f.read().strip()

def split_text(value, limit=180):
    parts = [p.strip() for p in re.split(r"(?<=[。！？!?])\s*", value) if p.strip()]
    chunks = []
    current = ""
    for part in parts:
        if len(current) + len(part) <= limit:
            current += part
        else:
            if current:
                chunks.append(current)
            current = part
    if current:
        chunks.append(current)
    return chunks

print("Loading IndexTTS2...", flush=True)
tts = IndexTTS2(
    cfg_path=os.path.join(root, "checkpoints", "config.yaml"),
    model_dir=os.path.join(root, "checkpoints"),
    use_fp16=True,
    use_cuda_kernel=False,
    use_deepspeed=False,
)

chunks = split_text(text)
if not chunks:
    raise RuntimeError("Voiceover text is empty.")
print(f"Generating {len(chunks)} chunks...", flush=True)

audios = []
sample_rate = None
with tempfile.TemporaryDirectory() as tmp:
    for index, chunk in enumerate(chunks, start=1):
        chunk_path = os.path.join(tmp, f"chunk_{index:03d}.wav")
        print(f"[{index}/{len(chunks)}] {chunk[:60]}", flush=True)
        kwargs = dict(
            spk_audio_prompt=reference,
            text=chunk,
            output_path=chunk_path,
            verbose=True,
        )
        if emotion:
            kwargs.update(
                use_emo_text=True,
                emo_text=emotion,
                emo_alpha=0.6,
                use_random=False,
            )
        tts.infer(**kwargs)
        audio, sr = sf.read(chunk_path, dtype="float32")
        if sample_rate is None:
            sample_rate = sr
        if audio.ndim == 1:
            audio = audio[:, None]
        audios.append(audio)
        audios.append(np.zeros((int(sr * 0.18), audio.shape[1]), dtype=np.float32))

merged = np.concatenate(audios, axis=0)
if merged.shape[1] == 1:
    merged = merged[:, 0]
sf.write(output_path, merged, sample_rate)
print(f"Wrote {output_path}", flush=True)
`;

  await run(python, ['-c', script, indexTtsRoot, input, reference, output, emotion], {
    HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
    INDEXTTS_W2V_BERT_PATH:
      process.env.INDEXTTS_W2V_BERT_PATH || path.join(indexTtsRoot, 'external', 'facebook-w2v-bert-2.0'),
    INDEXTTS_MASKGCT_SEMANTIC_CODEC:
      process.env.INDEXTTS_MASKGCT_SEMANTIC_CODEC ||
      path.join(indexTtsRoot, 'external', 'MaskGCT', 'semantic_codec', 'model.safetensors'),
    INDEXTTS_CAMPPLUS_MODEL:
      process.env.INDEXTTS_CAMPPLUS_MODEL ||
      path.join(indexTtsRoot, 'external', 'campplus', 'campplus_cn_common.bin'),
    INDEXTTS_BIGVGAN_PATH:
      process.env.INDEXTTS_BIGVGAN_PATH || path.join(indexTtsRoot, 'external', 'bigvgan_v2_22khz_80band_256x'),
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONPATH: `${indexTtsRoot}${path.delimiter}${process.env.PYTHONPATH || ''}`
  });
}

async function generateWithVolcengine(inputPath: string, outputPath: string) {
  const appid = args.appid || process.env.VOLCENGINE_TTS_APP_ID || '';
  const token = args.token || process.env.VOLCENGINE_TTS_ACCESS_TOKEN || '';
  const cluster = args.cluster || process.env.VOLCENGINE_TTS_CLUSTER || 'volcano_tts';
  const voiceType = args.voiceType || process.env.VOLCENGINE_TTS_VOICE_TYPE || '';
  const endpoint = args.endpoint || process.env.VOLCENGINE_TTS_ENDPOINT || 'https://openspeech.bytedance.com/api/v1/tts';
  const speedRatio = Number(args.speed || process.env.VOLCENGINE_TTS_SPEED || '1.08');
  const pitchRatio = Number(args.pitch || process.env.VOLCENGINE_TTS_PITCH || '1.0');
  const volumeRatio = Number(args.volume || process.env.VOLCENGINE_TTS_VOLUME || '1.0');
  const voiceEmotion = args.emotion || process.env.VOLCENGINE_TTS_EMOTION || 'happy';

  if (!appid || !token || !voiceType) {
    throw new Error(
      'Volcengine TTS requires VOLCENGINE_TTS_APP_ID, VOLCENGINE_TTS_ACCESS_TOKEN and VOLCENGINE_TTS_VOICE_TYPE.'
    );
  }

  const text = (await fs.readFile(inputPath, 'utf8')).replace(/^\uFEFF/, '').trim();
  const chunks = splitText(text, 260);
  if (!chunks.length) {
    throw new Error(`Voiceover text is empty: ${inputPath}`);
  }

  const tmpDir = path.resolve('out/volcengine-tts');
  await fs.mkdir(tmpDir, { recursive: true });
  const chunkFiles: string[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const text = chunks[index];
    const reqid = crypto.randomUUID();
    console.log(`[volcengine ${index + 1}/${chunks.length}] ${text.slice(0, 60)}`);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer;${token}`
      },
      body: JSON.stringify({
        app: {
          appid,
          token,
          cluster
        },
        user: {
          uid: 'bilibili-study-notes'
        },
        audio: {
          voice_type: voiceType,
          encoding: 'mp3',
          rate: 24000,
          speed_ratio: speedRatio,
          volume_ratio: volumeRatio,
          pitch_ratio: pitchRatio,
          emotion: voiceEmotion,
          language: 'cn'
        },
        request: {
          reqid,
          text,
          text_type: 'plain',
          operation: 'query'
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Volcengine TTS HTTP ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as { code?: number; message?: string; data?: string };
    if (body.code !== 3000 || !body.data) {
      throw new Error(`Volcengine TTS failed: ${body.code} ${body.message || ''}`.trim());
    }
    const file = path.join(tmpDir, `chunk_${String(index + 1).padStart(3, '0')}.mp3`);
    await fs.writeFile(file, Buffer.from(body.data, 'base64'));
    chunkFiles.push(file);
  }

  const listPath = path.join(tmpDir, 'concat.txt');
  await fs.writeFile(
    listPath,
    chunkFiles.map((file) => `file '${file.replace(/'/g, "'\\''").replace(/\\/g, '/')}'`).join('\n'),
    'utf8'
  );

  const ffmpeg = resolveFfmpeg();
  await run(ffmpeg, [
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-ac',
    '1',
    '-ar',
    '24000',
    '-c:a',
    'pcm_s16le',
    outputPath
  ]);
}

function splitText(value: string, limit: number) {
  const sentences = value
    .split(/(?<=[。！？!?；;])\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > limit) {
      chunks.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function resolveFfmpeg() {
  const candidates = [
    path.resolve('node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe'),
    path.resolve('../node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe')
  ];
  return candidates.find((candidate) => existsSync(candidate)) || 'ffmpeg';
}

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) out[key] = 'true';
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function run(command: string, argv: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, {
      stdio: 'inherit',
      env: { ...process.env, ...env }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
