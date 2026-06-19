import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Badge, Row, Col, Alert, Statistic,
  Modal, Form, Input, message,
} from 'antd'
import {
  CheckCircleOutlined, ThunderboltOutlined, SearchOutlined, PlusOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ticketApi, isolationApi } from '../services/api'
import { STATUS_NAMES, STATUS_COLORS } from '../stores/appStore'
import useAppStore from '../stores/appStore'
import { formatDateTime } from '../utils/helpers'

function IsolationPage() {
  const navigate = useNavigate()
  const { currentUser } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [plates, setPlates] = useState([])
  const [detailModal, setDetailModal] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [addForm] = Form.useForm()

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTickets = async () => {
    setLoading(true)
    try {
      const res = await ticketApi.list()
      const withPlateStats = res.data.map(t => ({
        ...t,
        plate_count: 0,
        confirmed_count: 0,
      }))
      setTickets(withPlateStats)

      for (let i = 0; i < withPlateStats.length; i++) {
        try {
          const plateRes = await isolationApi.listByTicket(withPlateStats[i].id)
          setTickets(prev => {
            const updated = [...prev]
            updated[i] = {
              ...updated[i],
              plate_count: plateRes.data.length,
              confirmed_count: plateRes.data.filter(p => p.installed).length,
            }
            return updated
          })
        } catch (e) { console.error(e) }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const viewPlates = async (ticket) => {
    setSelectedTicket(ticket)
    const res = await isolationApi.listByTicket(ticket.id)
    setPlates(res.data)
    setDetailModal(true)
  }

  const confirmPlate = async (plate) => {
    try {
      await isolationApi.confirmInstall(plate.id, { confirmed_by: currentUser })
      message.success(`盲板 ${plate.plate_no} 已确认安装`)
      loadTickets()
      if (selectedTicket) {
        const res = await isolationApi.listByTicket(selectedTicket.id)
        setPlates(res.data)
      }
    } catch (e) {
      message.error(e.response?.data?.error || '确认失败')
    }
  }

  const handleAddPlate = async () => {
    try {
      const values = await addForm.validateFields()
      await isolationApi.addPlate(selectedTicket.id, values)
      message.success('盲板添加成功')
      setAddModal(false)
      addForm.resetFields()
      const res = await isolationApi.listByTicket(selectedTicket.id)
      setPlates(res.data)
      loadTickets()
    } catch (e) {
      message.error(e.response?.data?.error || '添加失败')
    }
  }

  const pendingCount = tickets.filter(t => t.confirmed_count < t.plate_count).length
  const allConfirmed = plates.length > 0 && plates.every(p => p.installed)

  const ticketColumns = [
    { title: '作业票号', dataIndex: 'ticket_no', width: 180 },
    { title: '承包商', dataIndex: 'contractor', width: 150 },
    { title: '动火点', dataIndex: 'hot_work_point' },
    {
      title: '状态', width: 120,
      render: (_, r) => <Tag color={STATUS_COLORS[r.status]}>{STATUS_NAMES[r.status]}</Tag>,
    },
    {
      title: '盲板进度', width: 140,
      render: (_, r) => (
        <Space>
          <Badge
            status={r.confirmed_count === r.plate_count && r.plate_count > 0 ? 'success' : 'warning'}
            text={`${r.confirmed_count}/${r.plate_count}`}
          />
        </Space>
      ),
    },
    { title: '创建时间', dataIndex: 'created_at', width: 180, render: formatDateTime },
    {
      title: '操作', width: 180,
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" icon={<ThunderboltOutlined />} onClick={() => viewPlates(r)}>
            确认盲板
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/tickets/${r.id}`)}>详情</Button>
        </Space>
      ),
    },
  ]

  const plateColumns = [
    { title: '盲板编号', dataIndex: 'plate_no', width: 120 },
    { title: '位置', dataIndex: 'location' },
    { title: '管线名称', dataIndex: 'pipeline_name' },
    { title: '介质', dataIndex: 'medium' },
    {
      title: '状态', width: 120,
      render: (_, r) => r.installed
        ? <Tag color="green"><CheckCircleOutlined /> 已安装确认</Tag>
        : <Badge status="warning" text="待确认" />,
    },
    {
      title: '确认人/时间', width: 200,
      render: (_, r) => r.confirmed_by ? (
        <div>
          <div>{r.confirmed_by}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{formatDateTime(r.confirmed_at)}</div>
        </div>
      ) : '-',
    },
    {
      title: '操作', width: 120,
      render: (_, r) => !r.installed && (
        <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => confirmPlate(r)}>
          确认安装
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header">
        <h2><ThunderboltOutlined /> 隔离措施确认</h2>
        <p style={{ color: '#666', marginTop: 4 }}>属地负责人确认隔离盲板 - 未全部确认禁止开票</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#fa8c16,#ff9c6e)', color: 'white' }}>
            <Statistic title={<span style={{ color: 'white' }}>待确认隔离</span>} value={pendingCount} valueStyle={{ color: 'white' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#52c41a,#95de64)', color: 'white' }}>
            <Statistic title={<span style={{ color: 'white' }}>已完成隔离</span>} value={tickets.filter(t => t.plate_count > 0 && t.confirmed_count === t.plate_count).length} valueStyle={{ color: 'white' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic title="作业票总数" value={tickets.length} prefix={<SearchOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card className="page-card">
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="联锁规则"
          description="所有隔离盲板必须确认安装完毕后，才能进行气体检测和开具作业票。未确认的盲板数量将自动阻止开票流程。"
        />
        <Table
          columns={ticketColumns}
          dataSource={tickets}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Modal
        title={`隔离盲板清单 - ${selectedTicket?.ticket_no || ''}`}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        width={900}
        footer={[
          <Button icon={<PlusOutlined />} onClick={() => setAddModal(true)}>添加盲板</Button>,
          <Button type="primary" onClick={() => { setDetailModal(false); navigate(`/tickets/${selectedTicket?.id}`) }}>
            查看详情
          </Button>,
        ]}
      >
        {allConfirmed && (
          <Alert type="success" showIcon message="所有盲板已确认安装，可以进行下一步的气体检测" style={{ marginBottom: 16 }} />
        )}
        <Table
          columns={plateColumns}
          dataSource={plates}
          rowKey="id"
          pagination={false}
          size="middle"
        />
      </Modal>

      <Modal
        title="添加隔离盲板"
        open={addModal}
        onCancel={() => setAddModal(false)}
        onOk={handleAddPlate}
      >
        <Form form={addForm} layout="vertical">
          <Form.Item label="盲板编号" name="plate_no" rules={[{ required: true }]}>
            <Input placeholder="如：BP-004" />
          </Form.Item>
          <Form.Item label="位置" name="location" rules={[{ required: true }]}>
            <Input placeholder="请输入位置" />
          </Form.Item>
          <Form.Item label="管线名称" name="pipeline_name" rules={[{ required: true }]}>
            <Input placeholder="请输入管线名称" />
          </Form.Item>
          <Form.Item label="介质" name="medium">
            <Input placeholder="如：天然气、蒸汽等" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default IsolationPage
