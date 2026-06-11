import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type GenerateRequest = {
  api_key?: string;
  base_url?: string;
  model?: string;
  prompt?: string;
  duration?: number;
  render?: boolean;
};

type SceneSpec = {
  title: string;
  subtitle: string;
  narration: string;
  bullets: string[];
  accent: string;
  duration: number;
};

type VideoSpec = {
  title: string;
  subtitle: string;
  scenes: SceneSpec[];
};

type DeepSeekPayload = {
  spec?: VideoSpec;
  component_code?: string;
};

const root = process.cwd();
const generatedDir = path.join(root, 'public', 'generated');
const specPath = path.join(generatedDir, 'deepseek-video.json');
const codePath = path.join(generatedDir, 'deepseek-video-code.tsx.txt');
const outputPath = path.join(root, 'out', 'deepseek-generated.mp4');
const port = Number(process.env.DEEPSEEK_VIDEO_API_PORT || 8795);
const palette = ['#2563eb', '#0f766e', '#ea580c', '#8b5cf6', '#dc2626', '#0891b2'];

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJSON(res, 204, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/api/generated-video') {
      const spec = await readJSON<VideoSpec>(specPath);
      const code = await readFile(codePath, 'utf8').catch(() => '');
      sendJSON(res, 200, { spec, code, output_path: outputPath });
      return;
    }
    if (req.method === 'POST' && req.url === '/api/generate-video') {
      const body = await readBody<GenerateRequest>(req);
      const apiKey = body.api_key || process.env.DEEPSEEK_API_KEY || '';
      if (!apiKey.trim()) throw new Error('缺少 DeepSeek Key：请输入 api_key 或设置 DEEPSEEK_API_KEY');
      if (!body.prompt?.trim()) throw new Error('请先输入视频提示词');

      const generated = await generateWithDeepSeek({
        apiKey,
        baseURL: body.base_url || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
        model: body.model || process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        prompt: body.prompt,
        duration: body.duration || 45
      });

      await mkdir(generatedDir, { recursive: true });
      await writeFile(specPath, JSON.stringify(generated.spec, null, 2), 'utf8');
      await writeFile(codePath, generated.componentCode, 'utf8');

      let renderResult: { output_path: string; log: string } | null = null;
      if (body.render) {
        renderResult = await renderVideo();
      }

      sendJSON(res, 200, {
        ok: true,
        spec: generated.spec,
        code: generated.componentCode,
        output_path: renderResult?.output_path || '',
        render_log: renderResult?.log || ''
      });
      return;
    }
    sendJSON(res, 404, { error: 'not found' });
  } catch (err) {
    sendJSON(res, 500, { error: (err as Error).message });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`DeepSeek video API: http://127.0.0.1:${port}`);
});

async function generateWithDeepSeek(options: {
  apiKey: string;
  baseURL: string;
  model: string;
  prompt: string;
  duration: number;
}) {
  const sceneCount = Math.min(8, Math.max(4, Math.round(options.duration / 8)));
  const system = [
    '你是资深 Remotion 视频导演和前端工程师。',
    '根据用户提示词生成 16:9 横版中文讲解视频。',
    '必须只返回 JSON 对象，不要 Markdown，不要代码块。',
    'JSON 格式：{"spec": {"title": string, "subtitle": string, "scenes": Scene[]}, "component_code": string}',
    'Scene 格式：{"title": string, "subtitle": string, "narration": string, "bullets": string[], "accent": "#2563eb", "duration": number}',
    `scenes 数量约 ${sceneCount} 个，总时长约 ${options.duration} 秒。`,
    'title 要短，画面文字要大，narration 是字幕/口播句子，不要空泛。bullets 每场 3-4 条。',
    'component_code 输出一个可读的 Remotion React 组件示例代码，使用输入 spec 渲染，不要访问网络，不要读写文件，不要引入第三方库。'
  ].join('\n');

  const user = [
    `视频提示词：${options.prompt}`,
    `目标时长：${options.duration} 秒`,
    '请生成结构化分镜和示例 Remotion TSX 代码。'
  ].join('\n');

  const response = await fetch(`${options.baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' }
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`DeepSeek 请求失败：${response.status} ${text.slice(0, 500)}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content || '';
  const parsed = parseModelJSON(content);
  const spec = sanitizeSpec(parsed.spec, options.duration);
  const componentCode = String(parsed.component_code || '').trim() || defaultComponentCode();
  return { spec, componentCode };
}

function parseModelJSON(content: string): DeepSeekPayload {
  const raw = content.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(raw) as DeepSeekPayload;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('DeepSeek 没有返回可解析 JSON');
    return JSON.parse(match[0]) as DeepSeekPayload;
  }
}

function sanitizeSpec(input: VideoSpec | undefined, targetDuration: number): VideoSpec {
  const scenes = Array.isArray(input?.scenes) ? input.scenes.slice(0, 10) : [];
  if (!scenes.length) throw new Error('DeepSeek 返回的 scenes 为空');
  const normalizedScenes = scenes.map((scene, index) => ({
    title: clean(scene.title, `第 ${index + 1} 场`),
    subtitle: clean(scene.subtitle, ''),
    narration: clean(scene.narration, scene.subtitle || scene.title || ''),
    bullets: normalizeBullets(scene.bullets),
    accent: /^#[0-9a-fA-F]{6}$/.test(scene.accent || '') ? scene.accent : palette[index % palette.length],
    duration: Math.min(14, Math.max(4, Number(scene.duration) || Math.round(targetDuration / scenes.length)))
  }));
  return {
    title: clean(input?.title, 'DeepSeek 生成视频'),
    subtitle: clean(input?.subtitle, '由提示词自动生成的横版视频'),
    scenes: normalizedScenes
  };
}

function normalizeBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return ['核心观点', '关键步骤', '行动建议'];
  return value.map((item) => clean(String(item), '')).filter(Boolean).slice(0, 4);
}

function clean(value: unknown, fallback: string): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

async function renderVideo() {
  await mkdir(path.join(root, 'out'), { recursive: true });
  const log = await run('npx', [
    'remotion',
    'render',
    'remotion/index.ts',
    'DeepSeekGenerated',
    'out/deepseek-generated.mp4',
    '--codec=h264',
    '--public-dir=public'
  ]);
  return { output_path: outputPath, log };
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      shell: process.platform === 'win32',
      env: process.env
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(output || `${command} exited with ${code}`));
    });
  });
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
}

async function readJSON<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, 'utf8')) as T;
}

function sendJSON(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  if (status === 204) {
    res.end();
    return;
  }
  res.end(JSON.stringify(payload));
}

function defaultComponentCode() {
  return [
    "import { AbsoluteFill } from 'remotion';",
    '',
    'export function GeneratedVideo({ spec }) {',
    '  return <AbsoluteFill>{spec.title}</AbsoluteFill>;',
    '}',
    ''
  ].join('\n');
}
