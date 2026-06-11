# 小红书视频教程脚本

## 正式口播稿

```text
我做了一个开源小工具，叫 B站视频总结工具。

这个工具解决的不是“看视频”，而是“看完以后怎么复习、怎么检索、怎么照着做”。

比如一条 ComfyUI 教程有一个小时。你看的时候好像懂了，第二天真要复现，步骤、参数、插件名、模型路径，全都要重新拖进度条找。

所以我没有把它做成普通视频摘要器。普通摘要只会说“这个视频介绍了什么”，但学习教程需要的是能执行的笔记。

用户粘贴 B站视频链接或者合集链接以后，后端会先解析 BV 号、分 P 和视频列表。

如果视频有公开字幕，系统会直接读取字幕；如果没有字幕，系统会调用云端 ASR，把音频转成带时间戳的文字。

拿到文字以后，AI 校正模块不会马上总结。AI 校正模块会先修字幕里的错词。

比如把“咖啡优爱”“看不一会”统一成 ComfyUI，把“工作留”修成工作流，也会整理模型名、插件名、命令和参数。

字幕校正完成以后，AI 总结模块才开始写笔记。

总结模块会按学习教程的结构输出：课程目标、时间轴目录、分段笔记、操作步骤、关键概念、易错点、复习清单和可执行 TODO。

如果用户输入的是合集，批量任务会并发处理每一集。

每一篇笔记都会自动生成十个字以内的短标题，并加上 01、02、03 这种序号，最后形成一个课程目录。

输出结果有两个方向。

第一个方向是本地 Markdown，适合放进 Git、Obsidian 或者自己的资料库。

第二个方向是飞书云文档。飞书同步模块不是把 Markdown 原文硬贴进去，而是按标题、列表、代码块这些文档块写进去。

这个项目是 BYOK 架构。DeepSeek、Ollama、Dify、OpenAI compatible 都可以替换，API Key 只放在用户自己的配置里。

我做这个工具的目的不是搬运课程，也不是替代原视频。

这个工具只做个人学习笔记，保留来源链接，把看过的长教程沉淀成自己的知识库。
```

## 相关文件

- Remotion 组件：`remotion/XiaohongshuTutorial.tsx`
- 配音音频：`public/audio/xiaohongshu-narration.wav`
- Whisper 字幕：`public/audio/xiaohongshu-captions.json`
- 输出视频：`out/xiaohongshu-tutorial.mp4`

这些路径都相对于当前仓库根目录。

## 配音和字幕流程

这个视频的字幕时间轴不手写，也不让 AI 猜。正确流程是：

1. 导出口播文本：

```bash
npm run video:script
```

生成文件：`public/audio/xiaohongshu-narration.txt`。

2. 生成配音。

本机已经可以使用 IndexTTS2。IndexTTS2 安装在：

```text
D:\Ai\index-tts
```

准备一段你有权使用的参考声音，比如：

```text
D:\Ai\voice-samples\voice.wav
```

然后运行：

```bash
npm run video:tts -- --reference D:\Ai\voice-samples\voice.wav
```

这个命令会读取 `public/audio/xiaohongshu-narration.txt`，输出：

```text
public/audio/xiaohongshu-narration.wav
```

默认会加一点“兴奋、用力、节奏快”的口播情绪。也可以覆盖情绪描述：

```bash
npm run video:tts -- --reference D:\Ai\voice-samples\voice.wav --emotion "兴奋、强势、像短视频教程开场，但吐字清楚"
```

也可以不用本地 TTS，改用剪映、CapCut 或其他工具生成配音。如果要用剪映里的“咆哮哥”这类音色，把口播文本粘进去，导出音频后保存为同一个文件：

```text
public/audio/xiaohongshu-narration.wav
```

也可以用 mp3，但要同步修改 Remotion 里的音频文件名。

3. 用 Whisper 重新识别最终音频，生成真实字幕时间轴：

```bash
npm run video:captions
```

脚本会优先使用本机已有的 faster-whisper：

```text
D:\Ev\BiliSummaryASR\Scripts\python.exe
D:\Ev\BiliSummaryASR\models\faster-whisper-small
```

如果识别结果出现“锟斤拷”或大量乱码，说明配音音频本身就是坏编码读出来的，脚本会直接失败，不会把垃圾字幕写进视频。

## 运行命令

确认 `xiaohongshu-captions.json` 已经生成以后，再预览：

```bash
npm run video:preview
```

渲染：

```bash
npm run video:render
```

## 小红书标题

```text
我做了一个开源工具：B站教程自动变学习笔记
```

## 小红书正文

```text
我做了一个开源小工具：B站视频总结工具。

它不是普通视频摘要器，而是把 B站学习教程整理成能复习、能检索、能照着做的学习笔记。

支持：
- B站视频/合集解析
- 公开视频字幕读取
- 云端 ASR 兜底
- AI 字幕校正
- 教程结构化总结
- 合集并发处理
- 自动短标题和序号
- 本地 Markdown
- 飞书云文档同步
- DeepSeek / Ollama / Dify / OpenAI compatible

项目是 BYOK 架构，用户自己配置 API Key，仓库不放密钥。
```

## 标签建议

```text
#开源项目 #AI工具 #B站学习 #学习笔记 #飞书 #DeepSeek #知识管理 #程序员工具 #Remotion
```
