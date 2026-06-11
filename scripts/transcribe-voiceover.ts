import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

type Caption = {
  start: number;
  end: number;
  text: string;
};

type CaptionsFile = {
  source: string;
  model: string;
  audio: string;
  generated_at: string;
  captions: Caption[];
};

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(args.input || 'public/audio/xiaohongshu-narration.wav');
const output = path.resolve(args.output || 'public/audio/xiaohongshu-captions.json');
const provider = resolveProvider(args.provider || process.env.VOICEOVER_STT_PROVIDER || 'auto');

if (!existsSync(input)) {
  throw new Error(`Voiceover audio not found: ${input}`);
}

if (provider === 'faster-whisper') {
  await transcribeWithFasterWhisper(input, output);
} else if (provider === 'local') {
  await transcribeWithLocalWhisper(input, output);
} else if (provider === 'openai') {
  await transcribeWithOpenAI(input, output);
} else {
  throw new Error(`Unsupported provider: ${provider}. Use auto, faster-whisper, local, or openai.`);
}

function resolveProvider(provider: string) {
  if (provider !== 'auto') return provider;
  const localPython = process.env.FASTER_WHISPER_PYTHON || String.raw`D:\Ev\BiliSummaryASR\Scripts\python.exe`;
  const localModel = process.env.FASTER_WHISPER_MODEL || String.raw`D:\Ev\BiliSummaryASR\models\faster-whisper-small`;
  if (existsSync(localPython) && existsSync(localModel)) return 'faster-whisper';
  return 'openai';
}

async function transcribeWithFasterWhisper(inputPath: string, outputPath: string) {
  const defaultPython = String.raw`D:\Ev\BiliSummaryASR\Scripts\python.exe`;
  const defaultModel = String.raw`D:\Ev\BiliSummaryASR\models\faster-whisper-small`;
  const python = args.python || process.env.FASTER_WHISPER_PYTHON || (existsSync(defaultPython) ? defaultPython : 'python');
  const model = args.model || process.env.FASTER_WHISPER_MODEL || (existsSync(defaultModel) ? defaultModel : 'small');
  const device = args.device || process.env.WHISPER_DEVICE || 'auto';
  const script = String.raw`
import json
import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
model_name = sys.argv[2]
device = sys.argv[3]

def load_model():
    if device == "auto":
        try:
            print(f"loading faster-whisper {model_name} on cuda", file=sys.stderr, flush=True)
            return WhisperModel(model_name, device="cuda", compute_type="float16")
        except Exception as exc:
            print(f"cuda failed, fallback to cpu: {exc}", file=sys.stderr, flush=True)
            return WhisperModel(model_name, device="cpu", compute_type="int8")
    compute_type = "float16" if device == "cuda" else "int8"
    print(f"loading faster-whisper {model_name} on {device}", file=sys.stderr, flush=True)
    return WhisperModel(model_name, device=device, compute_type=compute_type)

model = load_model()
segments, info = model.transcribe(
    audio_path,
    language="zh",
    vad_filter=True,
    beam_size=5,
    word_timestamps=False,
)
out = []
for seg in segments:
    text = (seg.text or "").strip()
    if text:
        out.append({"start": float(seg.start), "end": float(seg.end), "text": text})
print(json.dumps({"segments": out}, ensure_ascii=False))
`;
  const result = await runCapture(python, ['-c', script, inputPath, model, device]);
  const parsed = JSON.parse(result.stdout) as { segments?: Array<{ start: number; end: number; text: string }> };
  if (!parsed.segments?.length) {
    throw new Error('faster-whisper did not return segment timestamps.');
  }
  const captions = parsed.segments.map(cleanCaption).filter((item) => item.text);
  assertHealthyCaptions(captions, 'faster-whisper');
  await writeCaptions(outputPath, {
    source: 'faster_whisper',
    model,
    audio: slash(path.relative(process.cwd(), inputPath)),
    generated_at: new Date().toISOString(),
    captions
  });
}

async function transcribeWithOpenAI(inputPath: string, outputPath: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for provider=openai.');
  }
  const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.WHISPER_MODEL || 'whisper-1';
  const data = await fs.readFile(inputPath);
  const form = new FormData();
  form.append('model', model);
  form.append('file', new Blob([data]), path.basename(inputPath));
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  });

  if (!res.ok) {
    throw new Error(`Whisper API HTTP ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as {
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  if (!body.segments?.length) {
    throw new Error('Whisper did not return segment timestamps. Do not fall back to manual timing.');
  }
  const captions = body.segments.map(cleanCaption).filter((item) => item.text);
  assertHealthyCaptions(captions, 'OpenAI Whisper');

  await writeCaptions(outputPath, {
    source: 'openai_whisper',
    model,
    audio: slash(path.relative(process.cwd(), inputPath)),
    generated_at: new Date().toISOString(),
    captions
  });
}

async function transcribeWithLocalWhisper(inputPath: string, outputPath: string) {
  const model = process.env.WHISPER_MODEL || 'medium';
  const workDir = path.resolve('notes/voiceover-whisper');
  await fs.mkdir(workDir, { recursive: true });
  const baseName = path.basename(inputPath, path.extname(inputPath));
  await run('whisper', [
    inputPath,
    '--language',
    'Chinese',
    '--model',
    model,
    '--output_format',
    'json',
    '--output_dir',
    workDir
  ]);
  const whisperJson = JSON.parse(await fs.readFile(path.join(workDir, `${baseName}.json`), 'utf8')) as {
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  if (!whisperJson.segments?.length) {
    throw new Error('Local whisper did not return segment timestamps.');
  }
  const captions = whisperJson.segments.map(cleanCaption).filter((item) => item.text);
  assertHealthyCaptions(captions, 'local whisper');
  await writeCaptions(outputPath, {
    source: 'local_whisper',
    model,
    audio: slash(path.relative(process.cwd(), inputPath)),
    generated_at: new Date().toISOString(),
    captions
  });
}

async function writeCaptions(outputPath: string, data: CaptionsFile) {
  assertReadableCaptions(data.captions);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${data.captions.length} captions to ${slash(path.relative(process.cwd(), outputPath))}`);
}

function assertReadableCaptions(captions: Caption[]) {
  const text = captions.map((item) => item.text).join('');
  if (!text.trim()) {
    throw new Error('Whisper returned empty captions.');
  }
  if (hasMojibakeMarkers(text)) {
    throw new Error(
      [
        'Whisper captions look garbled.',
        'The source audio was probably generated from mojibake text.',
        'Replace public/audio/xiaohongshu-narration.wav with a clean voiceover, then run npm run video:captions again.'
      ].join(' ')
    );
  }
}

function cleanCaption(input: { start: number; end: number; text: string }): Caption {
  return {
    start: round(input.start),
    end: round(input.end),
    text: input.text.replace(/\s+/g, ' ').trim()
  };
}

function assertHealthyCaptions(captions: Caption[], providerName: string) {
  const text = captions.map((item) => item.text).join('');
  const brokenCount = countMatches(text, /(?:\uFFFD|\u951f\u65a4\u62f7)/g);
  const ratio = text.length === 0 ? 1 : brokenCount / text.length;
  if (ratio > 0.03) {
    throw new Error(
      `${providerName} ran, but the transcription looks like broken-encoding audio. ` +
        'Replace public/audio/xiaohongshu-narration.wav with a correctly exported voiceover, then run npm run video:captions again.'
    );
  }
}

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length || 0;
}

function hasMojibakeMarkers(value: string) {
  return /\uFFFD|\u951f\u65a4\u62f7/.test(value);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
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

function slash(value: string) {
  return value.replace(/\\/g, '/');
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function runCapture(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
      process.stderr.write(String(chunk));
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}
