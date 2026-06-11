import fs from 'node:fs/promises';
import path from 'node:path';

type Caption = {
  start: number;
  end: number;
  text: string;
  raw_text?: string;
};

type CaptionsFile = {
  source: string;
  model: string;
  audio: string;
  generated_at: string;
  captions: Caption[];
  correction?: {
    provider: string;
    model: string;
    script: string;
    generated_at: string;
    fallback_used: boolean;
  };
};

type CorrectionItem = {
  index: number;
  text: string;
};

const args = parseArgs(process.argv.slice(2));
const input = path.resolve(args.input || 'public/audio/xiaohongshu-captions.json');
const output = path.resolve(args.output || input);
const scriptPath = path.resolve(args.script || 'public/audio/xiaohongshu-narration.txt');
const ollamaUrl = (args.ollamaUrl || process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
const model = args.model || process.env.CAPTION_CORRECTION_MODEL || 'qwen2.5-7b-local:latest';

const captionsFile = JSON.parse(await fs.readFile(input, 'utf8')) as CaptionsFile;
const script = normalizeScript(await fs.readFile(scriptPath, 'utf8'));

if (!captionsFile.captions?.length) {
  throw new Error(`No captions found in ${input}`);
}
if (!script) {
  throw new Error(`Voiceover script is empty: ${scriptPath}`);
}

const rawCaptions = captionsFile.captions.map((caption) => ({
  ...caption,
  raw_text: caption.raw_text || caption.text
}));

let fallbackUsed = false;
let correctedTexts: string[];
const fallbackTexts = splitScriptByCaptionWeights(script, rawCaptions);

try {
  correctedTexts = await correctWithQwen(script, rawCaptions, fallbackTexts);
  correctedTexts = mergeQwenWithScriptFallback(script, correctedTexts, fallbackTexts);
  correctedTexts = preserveScriptCoverage(script, correctedTexts, fallbackTexts);
} catch (error) {
  fallbackUsed = true;
  console.warn(`Qwen correction failed, using deterministic script alignment: ${(error as Error).message}`);
  correctedTexts = fallbackTexts;
}

const correctedCaptions = rawCaptions.map((caption, index) => ({
  ...caption,
  text: normalizeCaptionText(correctedTexts[index] || caption.text)
}));

validateCorrectedTexts(
  correctedCaptions.map((caption) => caption.text),
  rawCaptions.length
);

const out: CaptionsFile = {
  ...captionsFile,
  source: buildCorrectedSource(captionsFile.source),
  generated_at: new Date().toISOString(),
  captions: correctedCaptions,
  correction: {
    provider: fallbackUsed ? 'deterministic_script_alignment' : 'ollama',
    model: fallbackUsed ? 'local-script-aligner' : model,
    script: slash(path.relative(process.cwd(), scriptPath)),
    generated_at: new Date().toISOString(),
    fallback_used: fallbackUsed
  }
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(
  `Corrected ${correctedCaptions.length} captions with ${out.correction?.provider} -> ${slash(path.relative(process.cwd(), output))}`
);

async function correctWithQwen(scriptText: string, captions: Caption[], fallbackTexts: string[]) {
  const debug: Array<{ index: number; raw: string; fallback: string; response: string; used: string }> = [];
  const result: string[] = [];

  for (let index = 0; index < captions.length; index += 1) {
    const caption = captions[index];
    const fallback = fallbackTexts[index] || caption.text;
    const prompt = [
      '你要校正单条中文口播字幕。',
      '只输出 JSON 对象，格式：{"text":"校正后的字幕"}。',
      '不要解释，不要输出 Markdown，不要输出 start/end。',
      '候选字幕来自标准口播稿，优先原样使用候选字幕。',
      'Whisper 原文只用于修正明显错词，不能用来扩写候选字幕。',
      '禁止总结、扩写、补充上下文、吞并上一条或下一条；字幕必须和当前候选长度接近。',
      '重点术语：B站、ComfyUI、AI、ASR、BV、分 P、DeepSeek、Ollama、Dify、OpenAI compatible、API Key、BYOK、Markdown、Obsidian、TODO、飞书。',
      '',
      `完整口播稿：${scriptText}`,
      '',
      `上一条候选：${fallbackTexts[index - 1] || ''}`,
      `当前候选：${fallback}`,
      `下一条候选：${fallbackTexts[index + 1] || ''}`,
      `Whisper 原文：${caption.raw_text || caption.text}`,
      '',
      '现在只输出 JSON：'
    ].join('\n');

    let used = fallback;
    let rawResponse = '';
    try {
      const response = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          system: '你是严格的 JSON 生成器。只输出合法 JSON，不输出解释、Markdown 或代码块。',
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0,
            top_p: 0.2,
            num_ctx: 32768
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as { response?: string };
      rawResponse = body.response || '';
      const parsed = parseJsonFromModel(rawResponse);
      const candidate = normalizeCaptionText(typeof parsed.text === 'string' ? parsed.text : '');
      used = candidate || fallback;
    } catch {
      used = fallback;
    }

    debug.push({ index, raw: caption.raw_text || caption.text, fallback, response: rawResponse, used });
    result.push(used);
    console.log(`Qwen caption ${index + 1}/${captions.length}`);
  }

  await writeQwenDebug(JSON.stringify(debug, null, 2));
  return result;
}

async function writeQwenDebug(value: string) {
  await fs.mkdir(path.resolve('out'), { recursive: true });
  await fs.writeFile(path.resolve('out/qwen-caption-correction-response.txt'), value, 'utf8');
}

function parseJsonFromModel(value: string): any {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1]?.trim();
  const candidate = fenced || extractFirstJson(trimmed);
  if (!candidate) {
    throw new Error(`No JSON found in Qwen output: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(candidate);
}

function extractFirstJson(value: string) {
  const startArray = value.indexOf('[');
  const startObject = value.indexOf('{');
  const starts = [startArray, startObject].filter((item) => item >= 0);
  if (!starts.length) return '';
  const start = Math.min(...starts);
  const open = value[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < value.length; i += 1) {
    const char = value[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return value.slice(start, i + 1);
    }
  }
  return '';
}

function splitScriptByCaptionWeights(scriptText: string, captions: Caption[]) {
  const compact = scriptText.replace(/\s+/g, ' ').trim();
  const totalWeight = captions.reduce((sum, caption) => sum + captionWeight(caption), 0);
  const result: string[] = [];
  let start = 0;
  let usedWeight = 0;

  captions.forEach((caption, index) => {
    if (index === captions.length - 1) {
      result.push(compact.slice(start));
      return;
    }
    usedWeight += captionWeight(caption);
    const target = Math.round((compact.length * usedWeight) / totalWeight);
    const end = findBestBoundary(compact, target, start + 6);
    result.push(compact.slice(start, end));
    start = end;
  });

  return result.map(normalizeCaptionText);
}

function captionWeight(caption: Caption) {
  const duration = Math.max(0.2, caption.end - caption.start);
  const textLength = Math.max(4, (caption.raw_text || caption.text).length);
  return duration * 0.55 + textLength * 0.45;
}

function findBestBoundary(text: string, target: number, min: number) {
  const punctuation = new Set(['。', '，', '；', '：', '、', '！', '？', ',', '.', ';', ':', '!', '?']);
  const left = Math.max(min, target - 24);
  const right = Math.min(text.length - 1, target + 24);
  let best = Math.max(min, Math.min(target, text.length));
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = left; i <= right; i += 1) {
    if (!punctuation.has(text[i])) continue;
    const distance = Math.abs(i - target);
    if (distance < bestDistance) {
      best = i + 1;
      bestDistance = distance;
    }
  }
  if (text[best - 1] === '、') {
    const nextBoundary = findNextBoundary(text, best, 12);
    if (nextBoundary > best) {
      best = nextBoundary;
    }
  }

  return Math.max(min, Math.min(best, text.length));
}

function findNextBoundary(text: string, start: number, maxDistance: number) {
  const punctuation = new Set(['。', '，', '；', '：', '、', '！', '？', ',', '.', ';', ':', '!', '?']);
  const end = Math.min(text.length, start + maxDistance);
  for (let i = start; i < end; i += 1) {
    if (punctuation.has(text[i])) {
      return i + 1;
    }
  }
  return start;
}

function validateCorrectedTexts(texts: string[], expectedCount: number) {
  if (texts.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} corrected captions, got ${texts.length}.`);
  }
  const joined = texts.join('');
  if (!joined.trim()) {
    throw new Error('Corrected captions are empty.');
  }
  if (/\uFFFD|\u951f\u65a4\u62f7/.test(joined)) {
    throw new Error('Corrected captions contain mojibake markers.');
  }
  const emptyIndex = texts.findIndex((text) => !text.trim());
  if (emptyIndex >= 0) {
    throw new Error(`Corrected caption ${emptyIndex} is empty.`);
  }
}

function mergeQwenWithScriptFallback(scriptText: string, qwenTexts: string[], fallbackTexts: string[]) {
  const scriptCompact = simplifyForCompare(scriptText);
  return qwenTexts.map((text, index) => {
    const current = normalizeCaptionText(text);
    const fallback = fallbackTexts[index] || current;
    const currentCompact = simplifyForCompare(current);
    const fallbackCompact = simplifyForCompare(fallback);
    const previousCompact = simplifyForCompare(fallbackTexts[index - 1] || '');
    const nextCompact = simplifyForCompare(fallbackTexts[index + 1] || '');
    const tooLong = fallbackCompact.length > 0 && currentCompact.length > fallbackCompact.length * 1.25 + 6;
    const tooShort = fallbackCompact.length > 12 && currentCompact.length < fallbackCompact.length * 0.84;
    const outsideScript = currentCompact.length > 0 && !scriptCompact.includes(currentCompact);
    const swallowedPrevious =
      previousCompact.length > 10 &&
      currentCompact.includes(previousCompact.slice(0, Math.min(18, previousCompact.length)));
    const swallowedNext =
      nextCompact.length > 10 &&
      currentCompact.includes(nextCompact.slice(0, Math.min(18, nextCompact.length)));
    const notCloseEnough =
      fallbackCompact.length > 0 &&
      currentCompact.length > 0 &&
      similarity(currentCompact, fallbackCompact) < 0.62;

    return tooLong || tooShort || outsideScript || swallowedPrevious || swallowedNext || notCloseEnough
      ? fallback
      : current;
  });
}

function preserveScriptCoverage(scriptText: string, qwenTexts: string[], fallbackTexts: string[]) {
  const scriptCompact = simplifyForCompare(scriptText);
  const qwenCompact = simplifyForCompare(qwenTexts.join(''));
  if (qwenCompact === scriptCompact) {
    return qwenTexts;
  }

  console.warn('Qwen captions changed total script coverage, using deterministic script alignment for text.');
  return fallbackTexts;
}

function similarity(left: string, right: string) {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const maxLength = Math.max(left.length, right.length);
  return longestCommonSubsequenceLength(left, right) / maxLength;
}

function longestCommonSubsequenceLength(left: string, right: string) {
  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = left[i - 1] === right[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

function simplifyForCompare(value: string) {
  return value
    .replace(/\s+/g, '')
    .replace(/[，。！？；：、,.!?;:"“”'‘’（）()【】\[\]《》<>]/g, '')
    .toLowerCase();
}

function normalizeScript(value: string) {
  return value
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('');
}

function normalizeCaptionText(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/'([^']+)'/g, '“$1”')
    .replace(/‘([^’]+)’/g, '“$1”')
    .replace(/ ,/g, '，')
    .replace(/,/g, '，')
    .replace(/\s+([。？！；：，、])/g, '$1')
    .trim();
}

function buildCorrectedSource(source: string) {
  const parts = source
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part && part !== 'qwen_corrected');
  parts.push('qwen_corrected');
  return parts.join('+');
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
