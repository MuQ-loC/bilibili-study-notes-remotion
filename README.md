# B站视频总结工具 Remotion 教程视频

这个仓库是 `bilibili-study-notes` 的视频生产工作流，负责生成横版教程视频。

它包含：

- Remotion 横版视频组件。
- 小红书/教程视频口播稿。
- 本地 IndexTTS 配音脚本。
- Whisper/faster-whisper 字幕时间轴脚本。
- Qwen/Ollama 字幕文本校正脚本。

## 快速开始

```bash
npm install
npm run video:script
```

生成配音有两种方式。

方式一：用本地 IndexTTS：

```bash
npm run voice:import -- --input D:\path\voice.mp4 --name my-voice
npm run video:tts -- --reference public/audio/voice-samples/custom/my-voice/reference_01.wav
```

方式二：用剪映、CapCut 或其他 TTS 工具生成配音，然后保存为：

```text
public/audio/xiaohongshu-narration.wav
```

生成字幕时间轴：

```bash
npm run video:captions
```

预览：

```bash
npm run video:preview
```

渲染：

```bash
npm run video:render
```

默认输出：

```text
out/xiaohongshu-tutorial.mp4
```

## 注意

仓库不提交生成音频、生成视频或个人参考音色。你需要自己准备有权使用的参考声音或 TTS 音频。

## License

MIT
