import { Composition } from 'remotion';
import { XiaohongshuTutorial } from './XiaohongshuTutorial';
import captionsFile from '../public/audio/xiaohongshu-captions.json';

const FPS = 30;

const durationInFrames = (() => {
  const captions = (captionsFile as { captions?: Array<{ end: number }> }).captions || [];
  const lastCaptionEnd = Math.max(0, ...captions.map((caption) => caption.end || 0));
  return Math.max(4050, Math.ceil((lastCaptionEnd + 6) * FPS));
})();

export function RemotionRoot() {
  return (
    <Composition
      id="XiaohongshuTutorial"
      component={XiaohongshuTutorial}
      durationInFrames={durationInFrames}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{}}
    />
  );
}
