import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = parseArgs(process.argv.slice(2));
const input = args.input ? path.resolve(args.input) : '';
const name = sanitizeName(args.name || (input ? path.basename(input, path.extname(input)) : 'custom-voice'));
const start = args.start ? parseTimestamp(args.start) : 0;
const end = args.end ? parseTimestamp(args.end) : 0;
const clipSeconds = Number(args.clipSeconds || 12);
const maxClips = Number(args.clips || 4);
const outputRoot = path.resolve(args.output || path.join('public/audio/voice-samples/custom', name));

const ffmpeg = resolveBinary('ffmpeg.exe');
const ffprobe = resolveBinary('ffprobe.exe');

if (!input || !existsSync(input)) {
  throw new Error('Use: npm run voice:import -- --input D:\\path\\voice-video.mp4 --name roar');
}
if (end > 0 && end <= start) {
  throw new Error('--end must be greater than --start.');
}
if (!Number.isFinite(clipSeconds) || clipSeconds < 4) {
  throw new Error('--clipSeconds must be at least 4.');
}
if (!Number.isFinite(maxClips) || maxClips < 1) {
  throw new Error('--clips must be at least 1.');
}

await fs.mkdir(outputRoot, { recursive: true });

const fullReference = path.join(outputRoot, 'reference_full.wav');
const extractionArgs = ['-y'];
if (start > 0) extractionArgs.push('-ss', String(start));
extractionArgs.push('-i', input);
if (end > 0) extractionArgs.push('-t', String(end - start));
extractionArgs.push(
  '-vn',
  '-ac',
  '1',
  '-ar',
  '24000',
  '-af',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  '-c:a',
  'pcm_s16le',
  fullReference
);

await run(ffmpeg, extractionArgs);
const duration = await probeDuration(fullReference);
if (duration < 3) {
  throw new Error(`Reference audio is too short after extraction: ${duration.toFixed(2)}s`);
}

const clips = await createClips(fullReference, duration);
await writeManifest(fullReference, duration, clips);
await writePreviewPage(clips);

console.log(`Imported reference voice -> ${slash(path.relative(process.cwd(), outputRoot))}`);
console.log(`Full reference: ${slash(path.relative(process.cwd(), fullReference))}`);
for (const clip of clips) {
  console.log(`Clip: ${slash(path.relative(process.cwd(), clip.file))} (${clip.duration.toFixed(2)}s)`);
}
console.log('');
console.log(
  `Use one clip with: npm run video:tts -- --reference "${slash(path.relative(process.cwd(), clips[0]?.file || fullReference))}"`
);

async function createClips(fullPath: string, totalDuration: number) {
  const usableClipSeconds = Math.min(clipSeconds, Math.max(3, totalDuration));
  const count = totalDuration <= usableClipSeconds ? 1 : Math.min(maxClips, Math.ceil(totalDuration / usableClipSeconds));
  const maxOffset = Math.max(0, totalDuration - usableClipSeconds);
  const offsets = Array.from({ length: count }, (_, index) =>
    count === 1 ? 0 : Math.round(((maxOffset * index) / (count - 1)) * 100) / 100
  );
  const clips: Array<{ file: string; duration: number; start: number }> = [];

  for (let index = 0; index < offsets.length; index += 1) {
    const clipPath = path.join(outputRoot, `reference_${String(index + 1).padStart(2, '0')}.wav`);
    await run(ffmpeg, [
      '-y',
      '-ss',
      String(offsets[index]),
      '-i',
      fullPath,
      '-t',
      String(usableClipSeconds),
      '-ac',
      '1',
      '-ar',
      '24000',
      '-c:a',
      'pcm_s16le',
      clipPath
    ]);
    const duration = await probeDuration(clipPath);
    if (duration >= 3) {
      clips.push({ file: clipPath, duration, start: offsets[index] });
    }
  }

  if (!clips.length) {
    throw new Error('No valid reference clips were created.');
  }
  return clips;
}

async function writeManifest(
  fullReference: string,
  duration: number,
  clips: Array<{ file: string; duration: number; start: number }>
) {
  const manifest = {
    source_video: input,
    generated_at: new Date().toISOString(),
    license_note: 'Use only voice material you own or have permission to use.',
    full_reference: slash(path.relative(outputRoot, fullReference)),
    duration,
    clips: clips.map((clip) => ({
      file: slash(path.relative(outputRoot, clip.file)),
      duration: clip.duration,
      start: clip.start
    }))
  };
  await fs.writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function writePreviewPage(clips: Array<{ file: string; duration: number; start: number }>) {
  const clipItems = clips
    .map((clip) => {
      const file = slash(path.basename(clip.file));
      return `<div class="item"><div class="name">${escapeHtml(file)} · ${clip.duration.toFixed(
        2
      )}s</div><audio controls src="${escapeHtml(file)}"></audio></div>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(name)} reference voice</title>
    <style>
      body { margin: 0; padding: 28px; font-family: "Microsoft YaHei", sans-serif; background: #f6f7fb; color: #111827; }
      h1 { margin: 0 0 8px; font-size: 26px; }
      p { margin: 0 0 18px; color: #64748b; line-height: 1.6; }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 14px; }
      .item { border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; padding: 14px; }
      .name { font-size: 15px; font-weight: 800; margin-bottom: 10px; word-break: break-all; }
      audio { width: 100%; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(name)} 参考音色</h1>
    <p>这些是从本地视频抽出来的参考片段。挑一段人声最干净、情绪最像的 wav，作为 video:tts 的 --reference。</p>
    <div class="grid">${clipItems}</div>
  </body>
</html>
`;
  await fs.writeFile(path.join(outputRoot, 'index.html'), html, 'utf8');
}

function probeDuration(file: string): Promise<number> {
  return runCapture(ffprobe, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    file
  ]).then((result) => {
    const duration = Number(result.stdout.trim());
    if (!Number.isFinite(duration)) {
      throw new Error(`Unable to read audio duration: ${file}`);
    }
    return duration;
  });
}

function resolveBinary(name: 'ffmpeg.exe' | 'ffprobe.exe') {
  const candidates = [
    path.resolve('node_modules/@remotion/compositor-win32-x64-msvc', name),
    path.resolve('../node_modules/@remotion/compositor-win32-x64-msvc', name)
  ];
  return candidates.find((candidate) => existsSync(candidate)) || name.replace(/\.exe$/, '');
}

function parseTimestamp(value: string) {
  if (/^\d+(\.\d+)?$/.test(value)) return Number(value);
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function sanitizeName(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'custom-voice';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

function run(command: string, argv: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function runCapture(command: string, argv: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
    });
  });
}

function slash(value: string) {
  return value.replace(/\\/g, '/');
}
