import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Tag, Select, Avatar, Space } from 'antd'
import {
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  DashboardOutlined,
  PauseCircleOutlined,
  UserOutlined,
  BuildOutlined,
  FireOutlined,
} from '@ant-design/icons'
import useAppStore, { ROLES, ROLE_NAMES, STATUS_NAMES, STATUS_COLORS } from './stores/appStore'
import Dashboard from './pages/Dashboard'
import TicketList from './pages/TicketList'
import TicketCreate from './pages/TicketCreate'
import TicketDetail from './pages/TicketDetail'
import IsolationPage from './pages/IsolationPage'
import DetectionPage from './pages/DetectionPage'
import PausePage from './pages/PausePage'

const { Header, Sider, Content } = Layout

function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentRole, currentUserName, setCurrentRole } = useAppStore()

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
    {
      key: '/tickets',
      icon: <SafetyCertificateOutlined />,
      label: '作业票管理',
      children: [
        { key: '/tickets', icon: <FireOutlined />, label: '作业票列表' },
        { key: '/tickets/create', icon: <BuildOutlined />, label: '创建作业票' },
      ],
    },
    { key: '/isolation', icon: <ThunderboltOutlined />, label: '隔离措施确认' },
    { key: '/detection', icon: <AlertOutlined />, label: '气体检测管理' },
    { key: '/pause', icon: <PauseCircleOutlined />, label: '暂停管理' },
  ]

  const getSelectedKeys = () => {
    const path = location.pathname
    if (path.startsWith('/tickets/create')) return ['/tickets/create']
    if (path.startsWith('/tickets/')) return ['/tickets']
    if (path.startsWith('/tickets')) return ['/tickets']
    return [path]
  }

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div className="app-logo">
          <FireOutlined style={{ fontSize: 28 }} />
          化工园区动火作业联锁气体检测系统
        </div>
        <div className="app-header-right">
          <div className="role-switcher">
            <span>当前角色:</span>
            <Select
              value={currentRole}
              onChange={setCurrentRole}
              style={{ width: 140 }}
              options={Object.entries(ROLES).map(([key, value]) => ({
                value,
                label: ROLE_NAMES[value],
              }))}
            />
          </div>
          <Space>
            <Avatar icon={<UserOutlined />} />
            <span>{currentUserName}（{ROLE_NAMES[currentRole]}）</span>
          </Space>
        </div>
      </Header>
      <Layout>
        <Sider width={220} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            selectedKeys={getSelectedKeys()}
            openKeys={['/tickets']}
            style={{ height: '100%', borderRight: 0, paddingTop: 12 }}
            onClick={({ key }) => navigate(key)}
            items={menuItems}
          />
        </Sider>
        <Content className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tickets" element={<TicketList />} />
            <Route path="/tickets/create" element={<TicketCreate />} />
            <Route path="/tickets/:id" element={<TicketDetail />} />
            <Route path="/isolation" element={<IsolationPage />} />
            <Route path="/detection" element={<DetectionPage />} />
            <Route path="/pause" element={<PausePage />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}

export default App
