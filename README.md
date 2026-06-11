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

仓库里自带了一个同名静音占位文件，目的是让 Remotion Studio 第一次打开时不因为音频 404 报错。你生成真实配音后直接覆盖这个文件即可。

生成字幕时间轴：

```bash
npm run video:captions
```

预览：

```bash
npm run ai:api
npm run web:dev
npm run video:preview
```

打开控制台：

```text
http://127.0.0.1:8794
```

控制台里可以输入 DeepSeek Key 和视频提示词，一键生成 `DeepSeekGenerated` 视频规格。生成结果会写入：

```text
public/generated/deepseek-video.json
public/generated/deepseek-video-code.tsx.txt
```

如果勾选“生成后直接渲染 MP4”，会输出：

```text
out/deepseek-generated.mp4
```

渲染：

```bash
npm run video:render
npm run video:render:ai
```

默认输出：

```text
out/xiaohongshu-tutorial.mp4
```

## 注意

仓库不提交生成音频、生成视频或个人参考音色。你需要自己准备有权使用的参考声音或 TTS 音频。

## License

MIT
