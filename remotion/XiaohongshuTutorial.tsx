import { AbsoluteFill, Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties, ReactNode } from 'react';
import captionsFile from '../public/audio/xiaohongshu-captions.json';

const FPS = 30;

type Caption = {
  start: number;
  end: number;
  text: string;
};

type SceneKey = 'pain' | 'parse' | 'correct' | 'notes' | 'batch' | 'open';

type Scene = {
  key: SceneKey;
  start: number;
  end: number;
  tag: string;
  title: string;
  subtitle: string;
  accent: string;
};

const sec = (value: number) => Math.round(value * FPS);

const captions = getCaptions();

function getCaptions(): Caption[] {
  const rawCaptions = (captionsFile as { captions?: Caption[] }).captions || [];
  if (rawCaptions.length === 0) {
    throw new Error('Missing captions. Run: npm run video:captions');
  }

  return rawCaptions
    .map((caption) => ({
      start: sec(caption.start),
      end: sec(Math.max(caption.end, caption.start + 0.25)),
      text: caption.text.trim()
    }))
    .filter((caption) => caption.text);
}

const scenes: Scene[] = [
  {
    key: 'pain',
    start: sec(0),
    end: sec(31),
    tag: '01 痛点',
    title: '长教程看完，复现还是卡住',
    subtitle: '步骤、参数、插件名、模型路径，需要变成能检索的学习笔记。',
    accent: '#ef4444'
  },
  {
    key: 'parse',
    start: sec(31),
    end: sec(47),
    tag: '02 解析',
    title: '粘贴 B站链接，先拆视频结构',
    subtitle: 'BV、分 P、合集列表、公开字幕和 ASR 兜底都在后端处理。',
    accent: '#2563eb'
  },
  {
    key: 'correct',
    start: sec(47),
    end: sec(64),
    tag: '03 校正',
    title: '先修字幕错词，再开始总结',
    subtitle: '把“咖啡优爱”“工作留”这种识别错误修成 ComfyUI、工作流。',
    accent: '#8b5cf6'
  },
  {
    key: 'notes',
    start: sec(64),
    end: sec(80),
    tag: '04 笔记',
    title: '输出能照着做的教程笔记',
    subtitle: '课程目标、时间轴、操作步骤、易错点、复习清单都结构化。',
    accent: '#059669'
  },
  {
    key: 'batch',
    start: sec(80),
    end: sec(111),
    tag: '05 合集',
    title: '合集并发跑，标题自动变短',
    subtitle: '每集生成 10 字以内标题，自动加 01、02、03 序号并同步飞书。',
    accent: '#ea580c'
  },
  {
    key: 'open',
    start: sec(111),
    end: sec(180),
    tag: '06 开源',
    title: 'BYOK 架构，模型和密钥都可替换',
    subtitle: 'DeepSeek、Ollama、Dify、OpenAI compatible 都能接，密钥留在本地配置。',
    accent: '#0f766e'
  }
];

const steps = ['解析链接', '读取字幕', 'ASR 兜底', 'AI 校正', '生成笔记', '飞书同步'];

function activeByFrame<T extends { start: number; end: number }>(items: T[], frame: number) {
  return items.find((item) => frame >= item.start && frame < item.end) || items[items.length - 1];
}

function clampProgress(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
}

function sceneIn(frame: number, scene: Scene) {
  return clampProgress(frame, scene.start, scene.start + sec(1.2));
}

export function XiaohongshuTutorial() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scene = activeByFrame(scenes, frame);
  const caption = activeByFrame(captions, frame);
  const progress = clampProgress(frame, 0, durationInFrames);
  const appear = sceneIn(frame, scene);

  return (
    <AbsoluteFill style={styles.screen}>
      <Audio src={staticFile('audio/xiaohongshu-narration.wav')} />
      <div style={styles.backdrop} />
      <div style={{ ...styles.colorWash, background: scene.accent }} />
      <div style={styles.progressTrack}>
        <div style={{ ...styles.progressBar, width: `${progress * 100}%`, background: scene.accent }} />
      </div>

      <TopBar scene={scene} />

      <main style={styles.main}>
        <section style={{ ...styles.left, opacity: appear, transform: `translateX(${(1 - appear) * -28}px)` }}>
          <SceneVisual scene={scene} frame={frame} />
        </section>

        <aside style={{ ...styles.right, opacity: appear, transform: `translateX(${(1 - appear) * 28}px)` }}>
          <SceneSummary scene={scene} frame={frame} />
          <StepRail scene={scene} frame={frame} />
        </aside>
      </main>

      <CaptionBar caption={caption} scene={scene} frame={frame} />
    </AbsoluteFill>
  );
}

function TopBar({ scene }: { scene: Scene }) {
  return (
    <header style={styles.topBar}>
      <div style={styles.brandMark}>B</div>
      <div style={styles.brandText}>
        <div style={styles.brandTitle}>B站视频总结工具</div>
        <div style={styles.brandSub}>字幕获取 / AI 校正 / 教程笔记 / 飞书同步</div>
      </div>
      <div style={{ ...styles.sceneTag, color: scene.accent, borderColor: scene.accent }}>{scene.tag}</div>
    </header>
  );
}

function SceneVisual({ scene, frame }: { scene: Scene; frame: number }) {
  const content: Record<SceneKey, ReactNode> = {
    pain: <PainScene scene={scene} frame={frame} />,
    parse: <ParseScene scene={scene} frame={frame} />,
    correct: <CorrectScene scene={scene} frame={frame} />,
    notes: <NotesScene scene={scene} frame={frame} />,
    batch: <BatchScene scene={scene} frame={frame} />,
    open: <OpenScene scene={scene} frame={frame} />
  };

  return <div style={styles.visualCard}>{content[scene.key]}</div>;
}

function SceneSummary({ scene, frame }: { scene: Scene; frame: number }) {
  return (
    <div style={styles.summaryCard}>
      <div style={{ ...styles.summaryKicker, color: scene.accent }}>{scene.tag}</div>
      <h1 style={styles.summaryTitle}>{scene.title}</h1>
      <p style={styles.summaryText}>{scene.subtitle}</p>
      <VoiceMeter frame={frame} color={scene.accent} />
    </div>
  );
}

function PainScene({ scene, frame }: { scene: Scene; frame: number }) {
  const seek = clampProgress(frame, sec(10), sec(26));
  return (
    <div style={styles.browser}>
      <BrowserHeader url="bilibili.com/video/BV1d4EJ6cENS" accent={scene.accent} />
      <div style={styles.painGrid}>
        <div style={styles.videoPane}>
          <div style={styles.videoLabel}>ComfyUI 基础教程</div>
          <div style={styles.videoBigText}>01:24:18</div>
          <div style={styles.videoSub}>长教程 / 参数多 / 插件多</div>
          <div style={styles.videoTimeline}>
            <div style={{ ...styles.videoTimelineFill, width: `${seek * 100}%`, background: scene.accent }} />
          </div>
          <div style={{ ...styles.seekBubble, left: `${12 + seek * 72}%` }}>反复拖进度条</div>
        </div>
        <div style={styles.problemPane}>
          <BigProblem text="步骤找不到" frame={frame} delay={0} />
          <BigProblem text="参数记不住" frame={frame} delay={6} />
          <BigProblem text="插件名听错" frame={frame} delay={12} />
          <BigProblem text="模型路径漏掉" frame={frame} delay={18} />
        </div>
      </div>
    </div>
  );
}

function BigProblem({ text, frame, delay }: { text: string; frame: number; delay: number }) {
  const opacity = clampProgress(frame, sec(8) + delay, sec(9.2) + delay);
  return (
    <div style={{ ...styles.problemItem, opacity, transform: `translateY(${(1 - opacity) * 20}px)` }}>
      <span style={styles.problemIcon}>!</span>
      {text}
    </div>
  );
}

function ParseScene({ scene, frame }: { scene: Scene; frame: number }) {
  return (
    <div style={styles.browser}>
      <BrowserHeader url="localhost:8793" accent={scene.accent} />
      <div style={styles.appLayout}>
        <div style={styles.inputPanel}>
          <div style={styles.panelTitle}>输入链接</div>
          <div style={styles.urlInput}>https://www.bilibili.com/video/BV1d4EJ6cENS</div>
          <div style={{ ...styles.primaryButton, background: scene.accent }}>开始解析</div>
        </div>
        <div style={styles.parseResult}>
          {[
            ['BV 号', 'BV1d4EJ6cENS'],
            ['分 P', 'P1 / P2 / P3'],
            ['字幕', '公开字幕优先'],
            ['兜底', '云端 ASR']
          ].map(([label, value], index) => {
            const show = clampProgress(frame, scene.start + sec(2 + index * 2), scene.start + sec(3 + index * 2));
            return (
              <div key={label} style={{ ...styles.resultRow, opacity: 0.38 + show * 0.62 }}>
                <div style={styles.resultLabel}>{label}</div>
                <div style={styles.resultValue}>{show > 0.15 ? value : '等待解析...'}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CorrectScene({ scene, frame }: { scene: Scene; frame: number }) {
  const rows = [
    ['咖啡优爱', 'ComfyUI'],
    ['工作留', '工作流'],
    ['可执行滔斗', '可执行 TODO'],
    ['DeepSeq Alama', 'DeepSeek / Ollama']
  ];

  return (
    <div style={styles.browser}>
      <BrowserHeader url="AI 校正模块" accent={scene.accent} />
      <div style={styles.correctionBoard}>
        <div style={styles.columnTitle}>Whisper 原始字幕</div>
        <div style={styles.columnTitle}>Qwen 校正后</div>
        {rows.map(([raw, fixed], index) => {
          const show = clampProgress(frame, scene.start + sec(2 + index * 2), scene.start + sec(3.2 + index * 2));
          return (
            <CorrectionRow key={raw} raw={raw} fixed={fixed} accent={scene.accent} opacity={show} />
          );
        })}
      </div>
    </div>
  );
}

function CorrectionRow({
  raw,
  fixed,
  accent,
  opacity
}: {
  raw: string;
  fixed: string;
  accent: string;
  opacity: number;
}) {
  return (
    <>
      <div style={{ ...styles.rawCell, opacity }}>{raw}</div>
      <div style={{ ...styles.fixedCell, opacity, borderColor: accent }}>
        <span style={{ color: accent }}>修正为</span>
        <strong>{fixed}</strong>
      </div>
    </>
  );
}

function NotesScene({ scene, frame }: { scene: Scene; frame: number }) {
  const blocks = [
    ['课程目标', '这节课到底要学会什么'],
    ['时间轴目录', '按视频进度拆出章节'],
    ['操作步骤', '保留参数、命令和配置项'],
    ['易错点', '把踩坑位置单独列出来'],
    ['复习清单', '看完之后能按清单复现']
  ];

  return (
    <div style={styles.document}>
      <div style={styles.docTop}>
        <div>
          <div style={styles.docTitle}>ComfyUI 入门课学习笔记</div>
          <div style={styles.docMeta}>由字幕校正结果自动生成</div>
        </div>
        <div style={{ ...styles.docStatus, background: scene.accent }}>Markdown</div>
      </div>
      <div style={styles.docBody}>
        {blocks.map(([title, body], index) => {
          const show = clampProgress(frame, scene.start + sec(1 + index * 1.7), scene.start + sec(2 + index * 1.7));
          return (
            <div key={title} style={{ ...styles.docBlock, opacity: show, transform: `translateX(${(1 - show) * 24}px)` }}>
              <div style={{ ...styles.docMarker, background: scene.accent }} />
              <div>
                <div style={styles.docBlockTitle}>{title}</div>
                <div style={styles.docBlockText}>{body}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BatchScene({ scene, frame }: { scene: Scene; frame: number }) {
  const videos = ['01 工具定位', '02 字幕校正', '03 笔记生成', '04 飞书同步', '05 本地配置'];

  return (
    <div style={styles.batchScene}>
      <div style={styles.batchLeft}>
        <div style={styles.panelTitle}>合集任务队列</div>
        {videos.map((video, index) => {
          const show = clampProgress(frame, scene.start + sec(index * 2), scene.start + sec(1 + index * 2));
          return (
            <div key={video} style={{ ...styles.queueItem, opacity: show }}>
              <span style={{ ...styles.queueIndex, background: scene.accent }}>{index + 1}</span>
              <span>{video}</span>
              <span style={styles.queueState}>已完成</span>
            </div>
          );
        })}
      </div>
      <div style={styles.batchRight}>
        <div style={styles.panelTitle}>飞书云文档</div>
        <div style={styles.feishuPage}>
          <div style={styles.feishuTitle}>B站教程知识库</div>
          <div style={styles.feishuLineBig}>01 工具定位</div>
          <div style={styles.feishuLine}>课程目标 / 时间轴 / 操作步骤</div>
          <div style={styles.feishuLineBig}>02 字幕校正</div>
          <div style={styles.feishuLine}>错词修正 / 术语统一 / 可执行 TODO</div>
          <div style={styles.feishuCode}>config.json / api_key / document_id</div>
        </div>
      </div>
    </div>
  );
}

function OpenScene({ scene, frame }: { scene: Scene; frame: number }) {
  const providers = ['DeepSeek', 'Ollama', 'Dify', 'OpenAI compatible'];
  return (
    <div style={styles.openScene}>
      <div style={styles.archCenter}>
        <div style={{ ...styles.archCore, borderColor: scene.accent }}>
          <div style={styles.archCoreTitle}>BYOK</div>
          <div style={styles.archCoreSub}>自带密钥</div>
        </div>
      </div>
      {providers.map((provider, index) => {
        const angle = (-42 + index * 28) * (Math.PI / 180);
        const x = Math.cos(angle) * 330;
        const y = Math.sin(angle) * 190;
        const show = clampProgress(frame, scene.start + sec(2 + index * 2), scene.start + sec(3 + index * 2));
        return (
          <div
            key={provider}
            style={{
              ...styles.providerNode,
              left: 470 + x,
              top: 260 + y,
              opacity: show,
              borderColor: scene.accent
            }}
          >
            {provider}
          </div>
        );
      })}
      <div style={styles.openFooter}>API Key 只放在用户自己的配置里，项目本身不绑定平台。</div>
    </div>
  );
}

function BrowserHeader({ url, accent }: { url: string; accent: string }) {
  return (
    <div style={styles.browserHeader}>
      <div style={styles.windowDots}>
        <span style={{ ...styles.dot, background: '#fb7185' }} />
        <span style={{ ...styles.dot, background: '#facc15' }} />
        <span style={{ ...styles.dot, background: '#22c55e' }} />
      </div>
      <div style={styles.address}>{url}</div>
      <div style={{ ...styles.headerButton, background: accent }}>运行</div>
    </div>
  );
}

function StepRail({ scene, frame }: { scene: Scene; frame: number }) {
  const sceneIndex = scenes.findIndex((item) => item.key === scene.key);
  return (
    <div style={styles.stepRail}>
      {steps.map((step, index) => {
        const active = index <= sceneIndex;
        const show = clampProgress(frame, sec(5 + index * 9), sec(6 + index * 9));
        return (
          <div key={step} style={{ ...styles.stepItem, opacity: show }}>
            <div style={{ ...styles.stepDot, background: active ? scene.accent : '#cbd5e1', color: active ? '#fff' : '#475569' }}>
              {active ? '✓' : index + 1}
            </div>
            <div style={styles.stepText}>{step}</div>
          </div>
        );
      })}
    </div>
  );
}

function VoiceMeter({ frame, color }: { frame: number; color: string }) {
  return (
    <div style={styles.voiceMeter}>
      {Array.from({ length: 18 }).map((_, index) => {
        const height = 18 + Math.abs(Math.sin(frame / 5 + index * 0.75)) * 54;
        return <span key={index} style={{ ...styles.voiceBar, height, background: color }} />;
      })}
    </div>
  );
}

function CaptionBar({ caption, scene, frame }: { caption: Caption; scene: Scene; frame: number }) {
  const local = frame - caption.start;
  const duration = Math.max(1, caption.end - caption.start);
  const fade = Math.max(1, Math.min(8, Math.floor(duration / 4)));
  const opacity = interpolate(local, [0, fade, duration - fade, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  return (
    <div style={styles.captionShell}>
      <div style={{ ...styles.captionMarker, background: scene.accent }} />
      <div style={{ ...styles.captionText, opacity }}>{caption.text}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: {
    background: '#eef2f7',
    color: '#0f172a',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif',
    overflow: 'hidden'
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(15,23,42,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.055) 1px, transparent 1px)',
    backgroundSize: '64px 64px'
  },
  colorWash: {
    position: 'absolute',
    right: -220,
    top: -260,
    width: 760,
    height: 760,
    borderRadius: 999,
    opacity: 0.16,
    filter: 'blur(10px)'
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 8,
    background: '#d7dee9'
  },
  progressBar: {
    height: '100%'
  },
  topBar: {
    position: 'absolute',
    top: 34,
    left: 56,
    right: 56,
    height: 82,
    display: 'flex',
    alignItems: 'center',
    gap: 18
  },
  brandMark: {
    width: 66,
    height: 66,
    borderRadius: 18,
    background: '#111827',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 34,
    fontWeight: 950,
    boxShadow: '0 16px 34px rgba(15,23,42,0.22)'
  },
  brandText: {
    flex: 1
  },
  brandTitle: {
    fontSize: 31,
    fontWeight: 950
  },
  brandSub: {
    marginTop: 5,
    color: '#526174',
    fontSize: 18,
    fontWeight: 800
  },
  sceneTag: {
    height: 48,
    minWidth: 128,
    borderRadius: 14,
    border: '3px solid',
    display: 'grid',
    placeItems: 'center',
    fontSize: 22,
    fontWeight: 950,
    background: 'rgba(255,255,255,0.82)'
  },
  main: {
    position: 'absolute',
    top: 138,
    left: 56,
    right: 56,
    bottom: 180,
    display: 'grid',
    gridTemplateColumns: '1.42fr 0.78fr',
    gap: 28
  },
  left: {
    minWidth: 0
  },
  right: {
    minWidth: 0,
    display: 'grid',
    gridTemplateRows: '1fr 238px',
    gap: 22
  },
  visualCard: {
    height: '100%',
    borderRadius: 28,
    background: '#fff',
    border: '2px solid #dde5f0',
    boxShadow: '0 28px 80px rgba(15,23,42,0.18)',
    overflow: 'hidden'
  },
  summaryCard: {
    borderRadius: 28,
    background: 'rgba(255,255,255,0.94)',
    border: '2px solid #dde5f0',
    padding: '34px 34px 28px',
    boxShadow: '0 24px 60px rgba(15,23,42,0.13)'
  },
  summaryKicker: {
    fontSize: 22,
    fontWeight: 950,
    marginBottom: 16
  },
  summaryTitle: {
    margin: 0,
    fontSize: 48,
    lineHeight: 1.12,
    letterSpacing: 0,
    fontWeight: 950
  },
  summaryText: {
    margin: '24px 0 0',
    fontSize: 25,
    lineHeight: 1.42,
    color: '#475569',
    fontWeight: 850
  },
  voiceMeter: {
    marginTop: 36,
    height: 86,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  voiceBar: {
    width: 9,
    borderRadius: 99,
    opacity: 0.85
  },
  stepRail: {
    borderRadius: 24,
    background: '#111827',
    padding: 18,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12
  },
  stepItem: {
    borderRadius: 16,
    background: 'rgba(255,255,255,0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 13px'
  },
  stepDot: {
    width: 34,
    height: 34,
    borderRadius: 11,
    display: 'grid',
    placeItems: 'center',
    fontSize: 16,
    fontWeight: 950,
    flex: '0 0 auto'
  },
  stepText: {
    color: '#fff',
    fontSize: 18,
    lineHeight: 1.15,
    fontWeight: 900
  },
  browser: {
    height: '100%',
    display: 'grid',
    gridTemplateRows: '74px 1fr',
    background: '#f8fafc'
  },
  browserHeader: {
    borderBottom: '2px solid #dde5f0',
    background: '#fff',
    padding: '0 22px',
    display: 'flex',
    alignItems: 'center',
    gap: 16
  },
  windowDots: {
    display: 'flex',
    gap: 9
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 99,
    display: 'block'
  },
  address: {
    flex: 1,
    height: 42,
    borderRadius: 13,
    background: '#eef2f7',
    color: '#334155',
    display: 'flex',
    alignItems: 'center',
    padding: '0 16px',
    fontSize: 18,
    fontWeight: 850,
    whiteSpace: 'nowrap',
    overflow: 'hidden'
  },
  headerButton: {
    width: 86,
    height: 42,
    borderRadius: 12,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 19,
    fontWeight: 950
  },
  painGrid: {
    padding: 28,
    display: 'grid',
    gridTemplateColumns: '1.12fr 0.88fr',
    gap: 24
  },
  videoPane: {
    position: 'relative',
    minHeight: 570,
    borderRadius: 24,
    background: '#111827',
    color: '#fff',
    padding: 40,
    overflow: 'hidden'
  },
  videoLabel: {
    display: 'inline-flex',
    height: 42,
    borderRadius: 999,
    border: '2px solid rgba(255,255,255,0.3)',
    alignItems: 'center',
    padding: '0 18px',
    fontSize: 20,
    fontWeight: 900
  },
  videoBigText: {
    marginTop: 96,
    fontSize: 108,
    lineHeight: 1,
    fontWeight: 950
  },
  videoSub: {
    marginTop: 20,
    color: '#cbd5e1',
    fontSize: 28,
    fontWeight: 850
  },
  videoTimeline: {
    position: 'absolute',
    left: 40,
    right: 40,
    bottom: 76,
    height: 16,
    borderRadius: 99,
    background: 'rgba(255,255,255,0.2)',
    overflow: 'hidden'
  },
  videoTimelineFill: {
    height: '100%',
    borderRadius: 99
  },
  seekBubble: {
    position: 'absolute',
    bottom: 110,
    transform: 'translateX(-50%)',
    height: 42,
    borderRadius: 12,
    background: '#fff',
    color: '#111827',
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
    fontSize: 18,
    fontWeight: 950
  },
  problemPane: {
    display: 'grid',
    gap: 18,
    alignContent: 'center'
  },
  problemItem: {
    height: 96,
    borderRadius: 22,
    background: '#fff',
    border: '2px solid #dde5f0',
    boxShadow: '0 14px 34px rgba(15,23,42,0.1)',
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    padding: '0 24px',
    fontSize: 31,
    fontWeight: 950
  },
  problemIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    background: '#fee2e2',
    color: '#ef4444',
    display: 'grid',
    placeItems: 'center',
    fontWeight: 950
  },
  appLayout: {
    padding: 34,
    display: 'grid',
    gridTemplateColumns: '0.9fr 1.1fr',
    gap: 28
  },
  inputPanel: {
    borderRadius: 24,
    background: '#fff',
    border: '2px solid #dde5f0',
    padding: 28,
    display: 'grid',
    alignContent: 'start',
    gap: 22
  },
  panelTitle: {
    fontSize: 30,
    fontWeight: 950
  },
  urlInput: {
    minHeight: 96,
    borderRadius: 18,
    background: '#eef2f7',
    color: '#334155',
    padding: 22,
    fontSize: 23,
    lineHeight: 1.35,
    fontWeight: 850
  },
  primaryButton: {
    height: 62,
    borderRadius: 17,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 24,
    fontWeight: 950
  },
  parseResult: {
    borderRadius: 24,
    background: '#111827',
    padding: 26,
    display: 'grid',
    gap: 18
  },
  resultRow: {
    borderRadius: 18,
    background: 'rgba(255,255,255,0.1)',
    padding: '20px 22px',
    display: 'grid',
    gridTemplateColumns: '130px 1fr',
    alignItems: 'center'
  },
  resultLabel: {
    color: '#cbd5e1',
    fontSize: 22,
    fontWeight: 900
  },
  resultValue: {
    color: '#fff',
    fontSize: 30,
    fontWeight: 950
  },
  correctionBoard: {
    padding: 34,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 18,
    alignContent: 'start'
  },
  columnTitle: {
    fontSize: 28,
    fontWeight: 950,
    color: '#334155',
    paddingBottom: 8
  },
  rawCell: {
    minHeight: 86,
    borderRadius: 18,
    border: '2px solid #e2e8f0',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    padding: '0 24px',
    color: '#64748b',
    fontSize: 29,
    fontWeight: 850
  },
  fixedCell: {
    minHeight: 86,
    borderRadius: 18,
    border: '3px solid',
    background: '#fff',
    display: 'grid',
    gridTemplateColumns: '110px 1fr',
    alignItems: 'center',
    padding: '0 24px',
    fontSize: 29,
    fontWeight: 950
  },
  document: {
    height: '100%',
    padding: 34,
    background: '#f8fafc'
  },
  docTop: {
    height: 96,
    borderRadius: 24,
    background: '#fff',
    border: '2px solid #dde5f0',
    padding: '0 26px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22
  },
  docTitle: {
    fontSize: 33,
    fontWeight: 950
  },
  docMeta: {
    marginTop: 6,
    fontSize: 19,
    color: '#64748b',
    fontWeight: 850
  },
  docStatus: {
    width: 138,
    height: 45,
    borderRadius: 14,
    display: 'grid',
    placeItems: 'center',
    color: '#fff',
    fontSize: 20,
    fontWeight: 950
  },
  docBody: {
    display: 'grid',
    gap: 14
  },
  docBlock: {
    minHeight: 86,
    borderRadius: 19,
    background: '#fff',
    border: '2px solid #dde5f0',
    display: 'grid',
    gridTemplateColumns: '12px 1fr',
    gap: 18,
    padding: 18
  },
  docMarker: {
    width: 12,
    borderRadius: 99
  },
  docBlockTitle: {
    fontSize: 25,
    fontWeight: 950,
    marginBottom: 6
  },
  docBlockText: {
    fontSize: 20,
    color: '#475569',
    fontWeight: 850
  },
  batchScene: {
    height: '100%',
    padding: 34,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 28,
    background: '#f8fafc'
  },
  batchLeft: {
    borderRadius: 24,
    background: '#fff',
    border: '2px solid #dde5f0',
    padding: 28,
    display: 'grid',
    gap: 14,
    alignContent: 'start'
  },
  batchRight: {
    borderRadius: 24,
    background: '#111827',
    color: '#fff',
    padding: 28
  },
  queueItem: {
    height: 72,
    borderRadius: 17,
    background: '#f8fafc',
    border: '2px solid #dde5f0',
    display: 'grid',
    gridTemplateColumns: '44px 1fr 96px',
    alignItems: 'center',
    gap: 14,
    padding: '0 16px',
    fontSize: 24,
    fontWeight: 950
  },
  queueIndex: {
    width: 38,
    height: 38,
    borderRadius: 12,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 19,
    fontWeight: 950
  },
  queueState: {
    color: '#16a34a',
    fontSize: 20,
    textAlign: 'right'
  },
  feishuPage: {
    marginTop: 22,
    borderRadius: 20,
    background: '#fff',
    color: '#0f172a',
    padding: 26,
    display: 'grid',
    gap: 14
  },
  feishuTitle: {
    fontSize: 30,
    fontWeight: 950,
    marginBottom: 8
  },
  feishuLineBig: {
    height: 54,
    borderRadius: 14,
    background: '#eef2f7',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 18,
    fontSize: 24,
    fontWeight: 950
  },
  feishuLine: {
    height: 42,
    borderRadius: 12,
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 18,
    color: '#475569',
    fontSize: 19,
    fontWeight: 850
  },
  feishuCode: {
    height: 54,
    borderRadius: 14,
    background: '#111827',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 18,
    fontSize: 20,
    fontWeight: 850,
    fontFamily: 'Consolas, monospace'
  },
  openScene: {
    position: 'relative',
    height: '100%',
    background: '#111827',
    overflow: 'hidden'
  },
  archCenter: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center'
  },
  archCore: {
    width: 250,
    height: 250,
    borderRadius: 40,
    border: '5px solid',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    alignContent: 'center',
    gap: 12,
    boxShadow: '0 28px 90px rgba(0,0,0,0.35)'
  },
  archCoreTitle: {
    fontSize: 56,
    fontWeight: 950
  },
  archCoreSub: {
    color: '#cbd5e1',
    fontSize: 25,
    fontWeight: 900
  },
  providerNode: {
    position: 'absolute',
    width: 250,
    height: 78,
    borderRadius: 20,
    border: '3px solid',
    background: '#fff',
    display: 'grid',
    placeItems: 'center',
    color: '#0f172a',
    fontSize: 24,
    fontWeight: 950
  },
  openFooter: {
    position: 'absolute',
    left: 48,
    right: 48,
    bottom: 44,
    borderRadius: 22,
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '24px 28px',
    fontSize: 27,
    lineHeight: 1.35,
    fontWeight: 900,
    textAlign: 'center'
  },
  captionShell: {
    position: 'absolute',
    left: 56,
    right: 56,
    bottom: 36,
    height: 116,
    borderRadius: 28,
    background: 'rgba(15,23,42,0.96)',
    display: 'grid',
    gridTemplateColumns: '12px 1fr',
    overflow: 'hidden',
    boxShadow: '0 24px 62px rgba(15,23,42,0.32)'
  },
  captionMarker: {
    width: 12
  },
  captionText: {
    color: '#fff',
    fontSize: 38,
    lineHeight: 1.28,
    fontWeight: 950,
    display: 'flex',
    alignItems: 'center',
    padding: '0 34px'
  }
};
