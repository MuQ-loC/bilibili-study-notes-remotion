import fs from 'node:fs/promises';
import path from 'node:path';

const input = path.resolve('docs/xiaohongshu-video.md');
const output = path.resolve('public/audio/xiaohongshu-narration.txt');

const markdown = await fs.readFile(input, 'utf8');
const match = markdown.match(/## 正式口播稿\s+```text\s+([\s\S]*?)\s+```/);

if (!match?.[1]?.trim()) {
  throw new Error('Cannot find the voiceover block in docs/xiaohongshu-video.md.');
}

const script = match[1]
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .join('\n');

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${script}\n`, 'utf8');

console.log(`Wrote voiceover script to ${path.relative(process.cwd(), output).replace(/\\/g, '/')}`);
