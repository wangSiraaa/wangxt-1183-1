import { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Tag, Button, Space } from 'antd'
import {
  FireOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  SafetyOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ticketApi, pauseApi } from '../services/api'
import { STATUS_NAMES, STATUS_COLORS } from '../stores/appStore'
import { formatDateTime } from '../utils/helpers'

function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ total: 0, inProgress: 0, paused: 0, pending: 0 })
  const [recentTickets, setRecentTickets] = useState([])
  const [pausedList, setPausedList] = useState([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [allRes, pausedRes] = await Promise.all([
        ticketApi.list(),
        pauseApi.activeList(),
      ])

      const tickets = allRes.data
      setStats({
        total: tickets.length,
        inProgress: tickets.filter(t => t.status === 'in_progress').length,
        paused: tickets.filter(t => t.status === 'paused').length,
        pending: tickets.filter(t => ['pending_isolation', 'pending_detection', 'ready'].includes(t.status)).length,
      })
      setRecentTickets(tickets.slice(0, 5))
      setPausedList(pausedRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  const columns = [
    { title: '作业票号', dataIndex: 'ticket_no', key: 'ticket_no', width: 180 },
    { title: '承包商', dataIndex: 'contractor', key: 'contractor' },
    { title: '动火点', dataIndex: 'hot_work_point', key: 'hot_work_point' },
    { title: '施工时段', key: 'time', render: (_, r) => `${formatDateTime(r.start_time)} ~ ${formatDateTime(r.end_time)}` },
    {
      title: '状态', key: 'status', width: 120,
      render: (_, r) => <Tag color={STATUS_COLORS[r.status]}>{STATUS_NAMES[r.status]}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 100,
      render: (_, r) => (
        <Button type="link" onClick={() => navigate(`/tickets/${r.id}`)}>
          详情 <ArrowRightOutlined />
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <h2>仪表盘</h2>
        <p style={{ color: '#666', marginTop: 4 }}>动火作业联锁系统概览</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>作业票总数</span>}
              value={stats.total}
              prefix={<FireOutlined />}
              valueStyle={{ color: 'white' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
            <Statistic
              title={<span style={{ color: 'rgba(255,255,255,0.9)' }}>作业中</span>}
              value={stats.inProgress}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: 'white' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)', color: '#a61e4d' }}>
            <Statistic
              title={<span style={{ color: '#a61e4d' }}>已暂停</span>}
              value={stats.paused}
              prefix={<PauseCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" style={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: '#0c4a6e' }}>
            <Statistic
              title={<span style={{ color: '#0c4a6e' }}>待处理</span>}
              value={stats.pending}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            className="page-card"
            title={<span><SafetyOutlined /> 最近作业票</span>}
            extra={<Button type="link" onClick={() => navigate('/tickets')}>查看全部</Button>}
          >
            <Table
              columns={columns}
              dataSource={recentTickets}
              rowKey="id"
              pagination={false}
              size="middle"
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            className="page-card"
            title={<span style={{ color: '#cf1322' }}><ExclamationCircleOutlined /> 暂停中的作业</span>}
          >
            {pausedList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 12 }} />
                <p>当前无暂停作业</p>
              </div>
            ) : (
              pausedList.map(p => (
                <div key={p.id} style={{
                  padding: 12, border: '1px solid #ffccc7', borderRadius: 6,
                  marginBottom: 12, background: '#fff1f0',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Space>
                      <Tag color="red">{STATUS_NAMES[p.status]}</Tag>
                      <strong>{p.ticket_no}</strong>
                    </Space>
                    <Button size="small" type="primary" danger onClick={() => navigate('/pause')}>处理</Button>
                  </div>
                  <div style={{ fontSize: 13, color: '#666' }}>
                    {p.contractor} · {p.hot_work_point}
                  </div>
                  <div style={{ fontSize: 12, color: '#cf1322', marginTop: 4 }}>
                    <ExclamationCircleOutlined /> 暂停原因: {p.pause_reason}
                  </div>
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
                    暂停时间: {formatDateTime(p.paused_at)}
                  </div>
                </div>
              ))
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

export default Dashboard
