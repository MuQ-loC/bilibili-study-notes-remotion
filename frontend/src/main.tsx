import { CopyOutlined, CustomerServiceOutlined, FileTextOutlined, PlayCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Alert, Button, Card, ConfigProvider, Descriptions, Flex, Input, InputNumber, Layout, List, Space, Steps, Switch, Tag, Timeline, Typography, message } from 'antd';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import './styles.css';

const { Header, Content } = Layout;
const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

const commands = [
  {
    title: '整理口播稿',
    command: 'npm run video:script',
    desc: '从 docs/xiaohongshu-video.md 提取 narration 文本。'
  },
  {
    title: '导入参考音色',
    command: 'npm run voice:import -- --input D:\\path\\voice.mp4 --name my-voice',
    desc: '把你有权使用的真人参考音频切成本地样本。'
  },
  {
    title: '生成配音',
    command: 'npm run video:tts -- --reference public/audio/voice-samples/custom/my-voice/reference_01.wav',
    desc: '用本地 TTS 生成 public/audio/xiaohongshu-narration.wav。'
  },
  {
    title: '生成字幕时间轴',
    command: 'npm run video:captions',
    desc: '用 Whisper/faster-whisper 转写配音，再用 Qwen 修正文案。'
  },
  {
    title: '打开 Remotion Studio',
    command: 'npm run video:preview',
    desc: '预览横版视频、检查字幕、画面和配音同步。'
  },
  {
    title: '渲染成片',
    command: 'npm run video:render',
    desc: '输出 out/xiaohongshu-tutorial.mp4。'
  }
];

const assets = [
  ['口播稿', 'public/audio/xiaohongshu-narration.txt', '已纳入仓库'],
  ['配音音频', 'public/audio/xiaohongshu-narration.wav', '仓库内置静音占位；生成配音后覆盖'],
  ['字幕轴', 'public/audio/xiaohongshu-captions.json', '可重新生成'],
  ['成片', 'out/xiaohongshu-tutorial.mp4', '渲染后生成']
];

function copyCommand(command: string) {
  navigator.clipboard.writeText(command).then(() => message.success('命令已复制'));
}

type GeneratedVideoResponse = {
  ok: boolean;
  spec: {
    title: string;
    subtitle: string;
    scenes: Array<{ title: string; subtitle: string; narration: string; duration: number }>;
  };
  code: string;
  output_path?: string;
  render_log?: string;
  error?: string;
};

function App() {
  const [apiKey, setApiKey] = useState(sessionStorage.getItem('deepseek_api_key') || '');
  const [model, setModel] = useState('deepseek-chat');
  const [duration, setDuration] = useState(45);
  const [renderNow, setRenderNow] = useState(false);
  const [prompt, setPrompt] = useState('做一个 45 秒横版视频，介绍我做的 B站视频总结工具。开头必须说“我做了一个开源小工具”，重点讲它能解析 B站链接、获取字幕、用 AI 校正错词、生成学习笔记、批量同步飞书。风格要像小红书教程，画面文字大，节奏快。');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedVideoResponse | null>(null);
  const [generateStatus, setGenerateStatus] = useState('DeepSeek 生成的视频会保存到 public/generated，并在 Remotion Studio 的 DeepSeekGenerated Composition 中预览。');

  async function generateVideo() {
    if (!apiKey.trim()) {
      setGenerateStatus('请先输入 DeepSeek Key。Key 只发给本机 8795 服务，不写入仓库。');
      return;
    }
    if (!prompt.trim()) {
      setGenerateStatus('请先输入视频提示词。');
      return;
    }
    sessionStorage.setItem('deepseek_api_key', apiKey);
    setGenerating(true);
    setGenerated(null);
    setGenerateStatus(renderNow ? '正在调用 DeepSeek 生成分镜和视频代码，随后会直接渲染 MP4...' : '正在调用 DeepSeek 生成分镜和视频代码...');
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          model,
          duration,
          prompt,
          render: renderNow
        })
      });
      const data = (await res.json()) as GeneratedVideoResponse;
      if (!res.ok) throw new Error(data.error || res.statusText);
      setGenerated(data);
      setGenerateStatus(renderNow ? `生成并渲染完成：${data.output_path}` : '生成完成。打开 Remotion Studio，选择 DeepSeekGenerated 预览。');
      message.success('DeepSeek 视频生成完成');
    } catch (err) {
      setGenerateStatus(`生成失败：${(err as Error).message}`);
      message.error('生成失败');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#2563eb',
          borderRadius: 6,
          fontFamily: '"Microsoft YaHei", "Segoe UI", system-ui, sans-serif'
        }
      }}
    >
      <Layout className="shell">
        <Header className="header">
          <div>
            <Title level={4} className="title">Remotion 教程视频控制台</Title>
            <Text type="secondary">脚本编排 / 配音素材 / 字幕时间轴 / 横版视频预览</Text>
          </div>
          <Space>
            <Button href="http://127.0.0.1:3000" target="_blank" icon={<VideoCameraOutlined />}>
              Remotion Studio
            </Button>
            <Tag color="blue">127.0.0.1:8794</Tag>
          </Space>
        </Header>

        <Content className="content">
          <Card className="hero">
            <Flex justify="space-between" align="flex-start" gap={20} wrap="wrap">
              <div className="heroText">
                <Tag color="processing">横版教程视频工作流</Tag>
                <Title level={2} className="heroTitle">把开源工具讲清楚，而不是做一页 PPT</Title>
                <Paragraph className="heroDesc">
                  这个页面负责管理 Remotion 视频生产流程：先写口播，再生成真人感配音，用 Whisper 反推字幕时间轴，最后进 Studio 检查画面节奏。
                </Paragraph>
              </div>
              <Space size={10} wrap>
                <Button type="primary" icon={<PlayCircleOutlined />} href="http://127.0.0.1:3000" target="_blank">
                  打开预览
                </Button>
                <Button icon={<FileTextOutlined />} href="/audio/xiaohongshu-narration.txt" target="_blank">
                  看口播稿
                </Button>
              </Space>
            </Flex>
          </Card>

          <Card
            className="aiPanel"
            title="DeepSeek 一键生成视频"
            extra={<Tag color={generating ? 'processing' : generated ? 'green' : 'blue'}>{generating ? '生成中' : generated ? '已生成' : 'AI 视频'}</Tag>}
          >
            <div className="aiGrid">
              <Space direction="vertical" size={12} className="full">
                <Input.Password
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="DeepSeek API Key，或在启动 ai:api 前设置 DEEPSEEK_API_KEY"
                />
                <Flex gap={12} wrap="wrap">
                  <Input className="modelInput" value={model} onChange={(event) => setModel(event.target.value)} addonBefore="模型" />
                  <InputNumber className="durationInput" min={20} max={180} value={duration} onChange={(value) => setDuration(Number(value || 45))} addonBefore="秒数" />
                  <Space className="renderSwitch">
                    <Switch checked={renderNow} onChange={setRenderNow} />
                    <Text>生成后直接渲染 MP4</Text>
                  </Space>
                </Flex>
                <TextArea
                  className="promptBox"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="写清楚主题、受众、口播风格、视频时长、必须出现的画面文字。"
                />
                <Flex gap={10} wrap="wrap">
                  <Button type="primary" size="large" icon={<PlayCircleOutlined />} loading={generating} onClick={generateVideo}>
                    一键生成视频
                  </Button>
                  <Button href="http://127.0.0.1:3000" target="_blank" icon={<VideoCameraOutlined />}>
                    打开 DeepSeekGenerated
                  </Button>
                  <Button onClick={() => copyCommand('npm run ai:api && npm run web:dev && npm run video:preview')} icon={<CopyOutlined />}>
                    复制启动命令
                  </Button>
                </Flex>
                <Alert type={generateStatus.startsWith('生成失败') ? 'error' : generated ? 'success' : 'info'} showIcon message={generateStatus} />
              </Space>

              <Card size="small" title="生成结果" className="resultCard">
                {generated ? (
                  <Space direction="vertical" size={10} className="full">
                    <Descriptions bordered size="small" column={1}>
                      <Descriptions.Item label="标题">{generated.spec.title}</Descriptions.Item>
                      <Descriptions.Item label="副标题">{generated.spec.subtitle}</Descriptions.Item>
                      <Descriptions.Item label="分镜数">{generated.spec.scenes.length}</Descriptions.Item>
                      <Descriptions.Item label="输出">{generated.output_path || '未渲染，仅生成 Remotion 规格'}</Descriptions.Item>
                    </Descriptions>
                    <List
                      size="small"
                      dataSource={generated.spec.scenes}
                      renderItem={(scene, index) => (
                        <List.Item>
                          <List.Item.Meta
                            title={`${index + 1}. ${scene.title} · ${scene.duration}s`}
                            description={scene.narration || scene.subtitle}
                          />
                        </List.Item>
                      )}
                    />
                    <Text code className="codePreview">{generated.code.slice(0, 1800)}</Text>
                  </Space>
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message="先启动本地 API：npm run ai:api"
                    description="前端只负责输入和展示；DeepSeek 调用、文件写入、Remotion 渲染都在本机 8795 服务执行。"
                  />
                )}
              </Card>
            </div>
          </Card>

          <div className="grid">
            <Card title="生产步骤" className="panel">
              <Steps
                direction="vertical"
                current={3}
                items={commands.map((item) => ({
                  title: item.title,
                  description: item.desc
                }))}
              />
            </Card>

            <Card title="素材状态" className="panel">
              <Descriptions bordered size="small" column={1}>
                {assets.map(([label, path, state]) => (
                  <Descriptions.Item key={path} label={label}>
                    <Space direction="vertical" size={2}>
                      <Text code>{path}</Text>
                      <Text type="secondary">{state}</Text>
                    </Space>
                  </Descriptions.Item>
                ))}
              </Descriptions>
              <Alert
                className="assetTip"
                type="info"
                showIcon
                message="音频和成片属于生成物，本地使用即可，不建议提交到开源仓库。"
              />
            </Card>
          </div>

          <Card title="常用命令" className="commands">
            <List
              dataSource={commands}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Button key="copy" size="small" icon={<CopyOutlined />} onClick={() => copyCommand(item.command)}>
                      复制
                    </Button>
                  ]}
                >
                  <List.Item.Meta
                    avatar={<CustomerServiceOutlined className="commandIcon" />}
                    title={item.title}
                    description={
                      <Space direction="vertical" size={4} className="full">
                        <Text type="secondary">{item.desc}</Text>
                        <Text code className="commandText">{item.command}</Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card title="推荐检查顺序">
            <Timeline
              items={[
                { color: 'blue', children: '先确认口播稿主语清楚：开头用“我做了一个……”直入主题。' },
                { color: 'green', children: '再生成配音，用 Whisper 字幕轴校准画面，不靠 AI 猜时长。' },
                { color: 'orange', children: '进 Remotion Studio 看 16:9 横版画面，确认文字足够大、字幕不挡主体。' },
                { color: 'red', children: '最后渲染 MP4，再发小红书、B站或知识星球。' }
              ]}
            />
          </Card>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
