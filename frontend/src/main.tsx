import { CopyOutlined, CustomerServiceOutlined, FileTextOutlined, PlayCircleOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { Alert, Button, Card, ConfigProvider, Descriptions, Flex, Layout, List, Space, Steps, Tag, Timeline, Typography, message } from 'antd';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import './styles.css';

const { Header, Content } = Layout;
const { Text, Title, Paragraph } = Typography;

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
  ['配音音频', 'public/audio/xiaohongshu-narration.wav', '用户本地生成，不提交'],
  ['字幕轴', 'public/audio/xiaohongshu-captions.json', '可重新生成'],
  ['成片', 'out/xiaohongshu-tutorial.mp4', '渲染后生成']
];

function copyCommand(command: string) {
  navigator.clipboard.writeText(command).then(() => message.success('命令已复制'));
}

function App() {
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
