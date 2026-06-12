import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';
import videoSpec from '../public/generated/deepseek-video.json';

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
  style?: string;
  scenes: SceneSpec[];
};

const FPS = 30;
const spec = videoSpec as VideoSpec;
const scenes = normalizeScenes(spec.scenes);

export function getDeepSeekDurationInFrames() {
  return Math.max(180, scenes.reduce((total, scene) => total + Math.round(scene.duration * FPS), 0));
}

export function DeepSeekGeneratedVideo() {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const active = activeScene(frame);
  const sceneStart = sceneStartFrame(active.index);
  const local = Math.max(0, frame - sceneStart);
  const enter = interpolate(local, [0, 18], [0.92, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const theme = getTheme(spec.style);
  const sideFirst = theme.layout === 'side-first';
  const centered = theme.layout === 'centered';

  return (
    <AbsoluteFill style={{ ...styles.screen, background: theme.background, color: theme.text, fontFamily: theme.fontFamily }}>
      <div style={{ ...styles.grid, opacity: theme.gridOpacity, backgroundSize: theme.gridSize }} />
      <div style={{ ...styles.wash, background: active.scene.accent, opacity: theme.washOpacity }} />
      {theme.texture === 'chalk' && <div style={styles.chalkTexture} />}
      {theme.texture === 'cyber' && <div style={styles.cyberLines} />}
      <div style={{ ...styles.progressTrack, background: theme.track }}>
        <div style={{ ...styles.progressBar, width: `${progress * 100}%`, background: active.scene.accent }} />
      </div>

      <header style={styles.header}>
        <div style={{ ...styles.logo, background: theme.logoBg, color: theme.logoText, borderRadius: theme.logoRadius }}>AI</div>
        <div>
          <div style={styles.brand}>{spec.title || 'DeepSeek 生成视频'}</div>
          <div style={{ ...styles.subBrand, color: theme.muted }}>{spec.subtitle || 'Remotion automated video'}</div>
        </div>
        <div style={{ ...styles.scenePill, color: active.scene.accent, borderColor: active.scene.accent, background: theme.panel }}>
          {String(active.index + 1).padStart(2, '0')} / {scenes.length}
        </div>
      </header>

      <main style={{ ...styles.main, gridTemplateColumns: centered ? '1fr' : sideFirst ? '0.78fr 1.35fr' : '1.35fr 0.75fr' }}>
        {sideFirst && <SidePanel active={active.scene} enter={enter} frame={frame} theme={theme} />}
        <section
          style={{
            ...styles.stage,
            borderRadius: theme.radius,
            background: theme.panel,
            borderColor: theme.border,
            boxShadow: theme.shadow,
            opacity: enter,
            transform: `translateY(${(1 - enter) * 26}px)`
          }}
        >
          <div style={{ ...styles.stageTop, background: active.scene.accent }}>
            <span>{theme.label}</span>
            <span>{Math.round(active.scene.duration)}s</span>
          </div>
          <div style={styles.stageBody}>
            <div style={{ ...styles.kicker, color: theme.muted }}>Scene {active.index + 1}</div>
            <h1 style={styles.title}>{active.scene.title}</h1>
            <p style={{ ...styles.subtitle, color: theme.muted }}>{active.scene.subtitle}</p>
            <div style={{ ...styles.cards, gridTemplateColumns: centered ? 'repeat(4, 1fr)' : '1fr 1fr' }}>
              {active.scene.bullets.slice(0, 4).map((bullet, index) => {
                const itemIn = interpolate(local, [18 + index * 8, 36 + index * 8], [0, 1], {
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp'
                });
                return (
                  <div
                    key={bullet}
                    style={{
                      ...styles.bulletCard,
                      background: theme.card,
                      borderColor: theme.border,
                      borderRadius: theme.itemRadius,
                      opacity: itemIn,
                      transform: `translateX(${(1 - itemIn) * 24}px)`
                    }}
                  >
                    <span style={{ ...styles.bulletIndex, background: active.scene.accent }}>{index + 1}</span>
                    <span>{bullet}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {!sideFirst && !centered && <SidePanel active={active.scene} enter={enter} frame={frame} theme={theme} />}
      </main>

      <footer style={{ ...styles.caption, borderRadius: theme.captionRadius, background: theme.captionBg }}>
        <span style={{ ...styles.captionMark, background: active.scene.accent }} />
        <span>{active.scene.narration}</span>
      </footer>
    </AbsoluteFill>
  );
}

function SidePanel({ active, enter, frame, theme }: { active: SceneSpec; enter: number; frame: number; theme: Theme }) {
  return (
    <aside style={{ ...styles.side, background: theme.sideBg, color: theme.sideText, borderRadius: theme.radius, opacity: enter }}>
      <div style={{ ...styles.sideTitle, color: theme.sideMuted }}>口播重点</div>
      <div style={styles.narration}>{active.narration}</div>
      <div style={styles.wave}>
        {Array.from({ length: 24 }).map((_, index) => (
          <span
            key={index}
            style={{
              ...styles.waveBar,
              height: 18 + Math.abs(Math.sin((frame + index * 7) / 8)) * 58,
              background: active.accent
            }}
          />
        ))}
      </div>
    </aside>
  );
}

function normalizeScenes(input: SceneSpec[] | undefined): SceneSpec[] {
  const fallback = [
    {
      title: '等待生成',
      subtitle: '输入提示词生成视频。',
      narration: 'DeepSeek 生成的视频会显示在这里。',
      bullets: ['输入提示词', '生成分镜', '渲染视频'],
      accent: '#2563eb',
      duration: 6
    }
  ];
  return (input?.length ? input : fallback).map((scene) => ({
    title: scene.title || '未命名场景',
    subtitle: scene.subtitle || '',
    narration: scene.narration || scene.subtitle || scene.title || '',
    bullets: Array.isArray(scene.bullets) && scene.bullets.length ? scene.bullets : ['核心观点', '关键步骤', '行动建议'],
    accent: /^#[0-9a-fA-F]{6}$/.test(scene.accent || '') ? scene.accent : '#2563eb',
    duration: Math.min(14, Math.max(4, Number(scene.duration) || 6))
  }));
}

function sceneStartFrame(index: number) {
  return scenes.slice(0, index).reduce((total, scene) => total + Math.round(scene.duration * FPS), 0);
}

function activeScene(frame: number) {
  let cursor = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    const length = Math.round(scene.duration * FPS);
    if (frame < cursor + length) return { scene, index };
    cursor += length;
  }
  return { scene: scenes[scenes.length - 1], index: scenes.length - 1 };
}

type Theme = {
  background: string;
  panel: string;
  card: string;
  captionBg: string;
  sideBg: string;
  sideText: string;
  sideMuted: string;
  text: string;
  muted: string;
  border: string;
  track: string;
  shadow: string;
  fontFamily: string;
  label: string;
  layout: 'default' | 'side-first' | 'centered';
  texture: 'grid' | 'cyber' | 'chalk';
  gridOpacity: number;
  gridSize: string;
  washOpacity: number;
  radius: number;
  itemRadius: number;
  captionRadius: number;
  logoBg: string;
  logoText: string;
  logoRadius: number;
};

function getTheme(style: unknown): Theme {
  const key = String(style || 'tech');
  const base: Theme = {
    background: '#eef2f7',
    panel: '#ffffff',
    card: '#f8fafc',
    captionBg: 'rgba(15,23,42,0.96)',
    sideBg: '#111827',
    sideText: '#ffffff',
    sideMuted: '#cbd5e1',
    text: '#0f172a',
    muted: '#526174',
    border: '#dde5f0',
    track: '#d7dee9',
    shadow: '0 28px 80px rgba(15,23,42,0.18)',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif',
    label: 'DeepSeek 分镜',
    layout: 'default',
    texture: 'grid',
    gridOpacity: 1,
    gridSize: '72px 72px',
    washOpacity: 0.16,
    radius: 28,
    itemRadius: 20,
    captionRadius: 28,
    logoBg: '#111827',
    logoText: '#ffffff',
    logoRadius: 18
  };
  if (key === 'xiaohongshu') {
    return {
      ...base,
      background: '#fff7ed',
      panel: '#ffffff',
      card: '#fff1f2',
      sideBg: '#be123c',
      border: '#fecdd3',
      muted: '#7f1d1d',
      track: '#fed7aa',
      label: '小红书爆款分镜',
      washOpacity: 0.2,
      radius: 22,
      itemRadius: 16,
      logoBg: '#e11d48',
      logoRadius: 16
    };
  }
  if (key === 'cyber') {
    return {
      ...base,
      background: '#050816',
      panel: 'rgba(15,23,42,0.92)',
      card: 'rgba(30,41,59,0.9)',
      captionBg: 'rgba(2,6,23,0.96)',
      sideBg: '#020617',
      sideText: '#e0f2fe',
      sideMuted: '#67e8f9',
      text: '#e0f2fe',
      muted: '#93c5fd',
      border: '#155e75',
      track: '#0f172a',
      shadow: '0 28px 90px rgba(34,211,238,0.16)',
      label: 'Cyber AI Sequence',
      texture: 'cyber',
      gridOpacity: 0.45,
      washOpacity: 0.3,
      radius: 12,
      itemRadius: 10,
      captionRadius: 12,
      logoBg: '#22d3ee',
      logoText: '#020617',
      logoRadius: 8
    };
  }
  if (key === 'minimal') {
    return {
      ...base,
      background: '#ffffff',
      panel: '#ffffff',
      card: '#ffffff',
      captionBg: '#111827',
      sideBg: '#f8fafc',
      sideText: '#111827',
      sideMuted: '#64748b',
      border: '#e5e7eb',
      muted: '#4b5563',
      shadow: '0 16px 50px rgba(15,23,42,0.08)',
      label: '白板讲解',
      layout: 'centered',
      gridOpacity: 0.35,
      washOpacity: 0.06,
      radius: 4,
      itemRadius: 4,
      captionRadius: 4,
      logoBg: '#111827',
      logoRadius: 4
    };
  }
  if (key === 'chalkboard') {
    return {
      ...base,
      background: '#173b32',
      panel: '#21483f',
      card: '#2d5a50',
      captionBg: 'rgba(8,32,27,0.96)',
      sideBg: '#102a24',
      sideText: '#f5f5dc',
      sideMuted: '#cbd5c0',
      text: '#f5f5dc',
      muted: '#d9e2cf',
      border: '#5b7f73',
      track: '#102a24',
      shadow: '0 24px 70px rgba(0,0,0,0.22)',
      fontFamily: '"Microsoft YaHei", "KaiTi", "Segoe UI", sans-serif',
      label: '课程黑板',
      texture: 'chalk',
      gridOpacity: 0.16,
      washOpacity: 0.08,
      radius: 10,
      itemRadius: 8,
      captionRadius: 10,
      logoBg: '#f5f5dc',
      logoText: '#173b32',
      logoRadius: 8
    };
  }
  if (key === 'launch') {
    return {
      ...base,
      background: '#f8fafc',
      panel: '#ffffff',
      card: '#eef2ff',
      sideBg: '#312e81',
      border: '#c7d2fe',
      muted: '#3730a3',
      track: '#e0e7ff',
      shadow: '0 30px 90px rgba(49,46,129,0.16)',
      label: '发布会 Keynote',
      layout: 'side-first',
      gridOpacity: 0.45,
      washOpacity: 0.22,
      radius: 32,
      itemRadius: 28,
      captionRadius: 32,
      logoBg: '#312e81',
      logoRadius: 20
    };
  }
  return base;
}

const styles: Record<string, CSSProperties> = {
  screen: {
    background: '#eef2f7',
    color: '#0f172a',
    fontFamily: '"Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif',
    overflow: 'hidden'
  },
  grid: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'linear-gradient(rgba(15,23,42,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.055) 1px, transparent 1px)',
    backgroundSize: '72px 72px'
  },
  wash: {
    position: 'absolute',
    right: -180,
    top: -260,
    width: 760,
    height: 760,
    borderRadius: 999,
    opacity: 0.16
  },
  chalkTexture: {
    position: 'absolute',
    inset: 0,
    opacity: 0.06,
    backgroundImage:
      'radial-gradient(circle at 20% 30%, #fff 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, #fff 0 1px, transparent 2px)',
    backgroundSize: '34px 34px'
  },
  cyberLines: {
    position: 'absolute',
    inset: 0,
    opacity: 0.18,
    backgroundImage: 'linear-gradient(115deg, transparent 0 44%, #22d3ee 45%, transparent 46% 100%)',
    backgroundSize: '220px 220px'
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
  header: {
    position: 'absolute',
    top: 38,
    left: 58,
    right: 58,
    height: 78,
    display: 'flex',
    alignItems: 'center',
    gap: 18
  },
  logo: {
    width: 66,
    height: 66,
    borderRadius: 18,
    background: '#111827',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 28,
    fontWeight: 950
  },
  brand: {
    fontSize: 32,
    fontWeight: 950
  },
  subBrand: {
    marginTop: 5,
    color: '#526174',
    fontSize: 18,
    fontWeight: 800
  },
  scenePill: {
    marginLeft: 'auto',
    height: 48,
    minWidth: 132,
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
    top: 145,
    left: 58,
    right: 58,
    bottom: 166,
    display: 'grid',
    gridTemplateColumns: '1.35fr 0.75fr',
    gap: 28
  },
  stage: {
    borderRadius: 28,
    background: '#fff',
    border: '2px solid #dde5f0',
    boxShadow: '0 28px 80px rgba(15,23,42,0.18)',
    overflow: 'hidden'
  },
  stageTop: {
    height: 72,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    fontSize: 24,
    fontWeight: 950
  },
  stageBody: {
    padding: '48px 56px'
  },
  kicker: {
    color: '#64748b',
    fontSize: 24,
    fontWeight: 950,
    textTransform: 'uppercase'
  },
  title: {
    margin: '18px 0 18px',
    fontSize: 68,
    lineHeight: 1.06,
    letterSpacing: 0,
    fontWeight: 950
  },
  subtitle: {
    margin: 0,
    color: '#475569',
    fontSize: 30,
    lineHeight: 1.42,
    fontWeight: 850
  },
  cards: {
    marginTop: 42,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 18
  },
  bulletCard: {
    minHeight: 86,
    borderRadius: 20,
    border: '2px solid #dde5f0',
    background: '#f8fafc',
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 20px',
    fontSize: 25,
    lineHeight: 1.25,
    fontWeight: 920
  },
  bulletIndex: {
    width: 42,
    height: 42,
    borderRadius: 12,
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    fontSize: 20,
    fontWeight: 950,
    flex: '0 0 auto'
  },
  side: {
    borderRadius: 28,
    background: '#111827',
    color: '#fff',
    padding: 34,
    display: 'grid',
    gridTemplateRows: 'auto 1fr auto',
    boxShadow: '0 28px 80px rgba(15,23,42,0.18)'
  },
  sideTitle: {
    color: '#cbd5e1',
    fontSize: 24,
    fontWeight: 950
  },
  narration: {
    marginTop: 30,
    fontSize: 38,
    lineHeight: 1.32,
    fontWeight: 950
  },
  wave: {
    height: 96,
    display: 'flex',
    alignItems: 'center',
    gap: 8
  },
  waveBar: {
    width: 9,
    borderRadius: 99,
    opacity: 0.9
  },
  caption: {
    position: 'absolute',
    left: 58,
    right: 58,
    bottom: 36,
    minHeight: 100,
    borderRadius: 28,
    background: 'rgba(15,23,42,0.96)',
    color: '#fff',
    display: 'grid',
    gridTemplateColumns: '12px 1fr',
    overflow: 'hidden',
    boxShadow: '0 24px 62px rgba(15,23,42,0.32)',
    fontSize: 34,
    lineHeight: 1.28,
    fontWeight: 950
  },
  captionMark: {
    width: 12
  }
};
