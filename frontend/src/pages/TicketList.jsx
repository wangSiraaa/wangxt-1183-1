import { useEffect, useState } from 'react'
import { Card, Table, Tag, Button, Space, Input, Select, DatePicker, Row, Col } from 'antd'
import { PlusOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { ticketApi } from '../services/api'
import { STATUS_NAMES, STATUS_COLORS } from '../stores/appStore'
import { formatDateTime } from '../utils/helpers'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

function TicketList() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState([])
  const [filters, setFilters] = useState({ status: '', contractor: '' })

  useEffect(() => {
    loadData()
  }, [filters])

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await ticketApi.list(filters)
      setData(res.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const columns = [
    {
      title: '作业票号', dataIndex: 'ticket_no', key: 'ticket_no', width: 180,
      render: v => <a onClick={() => navigate(`/tickets/${data.find(t => t.ticket_no === v)?.id}`)}>{v}</a>,
    },
    { title: '承包商', dataIndex: 'contractor', key: 'contractor', width: 150 },
    { title: '动火点', dataIndex: 'hot_work_point', key: 'hot_work_point' },
    { title: '作业类型', dataIndex: 'work_type', key: 'work_type', width: 120 },
    {
      title: '施工时段', key: 'time', width: 340,
      render: (_, r) => (
        <div>
          <div>开始: {formatDateTime(r.start_time)}</div>
          <div>结束: {formatDateTime(r.end_time)}</div>
        </div>
      ),
    },
    {
      title: '复测间隔', key: 'interval', width: 100,
      render: (_, r) => `${r.retest_interval || 30} 分钟`,
    },
    {
      title: '状态', key: 'status', width: 120,
      render: (_, r) => <Tag color={STATUS_COLORS[r.status]}>{STATUS_NAMES[r.status]}</Tag>,
    },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right',
      render: (_, r) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => navigate(`/tickets/${r.id}`)}>
          查看详情
        </Button>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>作业票列表</h2>
          <p style={{ color: '#666', marginTop: 4 }}>管理所有动火作业票</p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/tickets/create')}>
          创建作业票
        </Button>
      </div>

      <Card className="page-card">
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={8} md={6}>
            <Input
              placeholder="搜索承包商"
              prefix={<SearchOutlined />}
              allowClear
              onChange={e => setFilters(f => ({ ...f, contractor: e.target.value }))}
            />
          </Col>
          <Col xs={24} sm={8} md={6}>
            <Select
              placeholder="选择状态"
              allowClear
              style={{ width: '100%' }}
              onChange={v => setFilters(f => ({ ...f, status: v || '' }))}
              options={Object.entries(STATUS_NAMES).map(([k, v]) => ({ value: k, label: v }))}
            />
          </Col>
        </Row>

        <Table
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  )
}

export default TicketList
