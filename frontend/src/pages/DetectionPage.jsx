import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Alert, Statistic, Row, Col,
  Modal, Form, Select, InputNumber, Input, message, Progress,
} from 'antd'
import {
  DashboardOutlined, AlertOutlined, CheckCircleOutlined,
  ExclamationCircleOutlined, PlayCircleOutlined, PauseCircleOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import { ticketApi, detectionApi } from '../services/api'
import { STATUS_NAMES, STATUS_COLORS } from '../stores/appStore'
import useAppStore from '../stores/appStore'
import { formatDateTime, getMinutesSince } from '../utils/helpers'

function DetectionPage() {
  const navigate = useNavigate()
  const { currentUser, currentRole } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [tickets, setTickets] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [detections, setDetections] = useState([])
  const [curveData, setCurveData] = useState(null)
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
      const withDetection = await Promise.all(
        res.data.map(async (t) => {
          try {
            const detRes = await detectionApi.listByTicket(t.id)
            const latest = detRes.data[0]
            return {
              ...t,
              detection_count: detRes.data.length,
              latest_qualified: latest ? !!latest.is_qualified : false,
              latest_detection: latest?.created_at,
            }
          } catch (e) {
            return { ...t, detection_count: 0, latest_qualified: false }
          }
        })
      )
      setTickets(withDetection)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (ticket) => {
    setSelectedTicket(ticket)
    const [detRes, curveRes] = await Promise.all([
      detectionApi.listByTicket(ticket.id),
      detectionApi.getCurve(ticket.id),
    ])
    setDetections(detRes.data)
    setCurveData(curveRes.data)
    setDetailModal(true)
  }

  const handleAddDetection = async () => {
    try {
      setLoading(true)
      const values = await addForm.validateFields()
      const res = await detectionApi.addDetection(selectedTicket.id, {
        ...values,
        detector: currentUser,
        detector_role: currentRole,
      })
      if (res.data.auto_paused) {
        message.error('气体检测超限！作业已自动暂停！')
      } else if (res.data.is_qualified) {
        message.success('气体检测合格')
      } else {
        message.warning('气体检测不合格')
      }
      setAddModal(false)
      addForm.resetFields()
      loadTickets()
      openDetail(selectedTicket)
    } catch (e) {
      message.error(e.response?.data?.error || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  const latestDet = detections[0]
  const minutesSince = latestDet ? getMinutesSince(latestDet.created_at) : 0
  const overInterval = minutesSince > (selectedTicket?.retest_interval || 30)

  const curveOption = curveData ? {
    title: { text: '气体检测趋势曲线', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { data: ['可燃气体(%LEL)', '氧含量(%)'], top: 24 },
    grid: { left: 50, right: 50, top: 60, bottom: 40 },
    xAxis: {
      type: 'category',
      data: curveData.timeline.map(d => formatDateTime(d.time).split(' ')[1] || d.time),
      axisLabel: { rotate: 30, fontSize: 10 },
    },
    yAxis: [
      { type: 'value', name: '可燃%', position: 'left' },
      { type: 'value', name: '氧%', position: 'right' },
    ],
    series: [
      {
        name: '可燃气体(%LEL)',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: curveData.timeline.map(d => d.combustible),
        itemStyle: { color: '#ff4d4f' },
        markLine: {
          data: [{ yAxis: curveData.limits.combustible_limit, label: { formatter: `上限` }, lineStyle: { color: '#ff4d4f', type: 'dashed' } }],
        },
      },
      {
        name: '氧含量(%)',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: curveData.timeline.map(d => d.oxygen),
        itemStyle: { color: '#1890ff' },
        markLine: {
          data: [
            { yAxis: curveData.limits.oxygen_min, label: { formatter: `下限` } },
            { yAxis: curveData.limits.oxygen_max, label: { formatter: `上限` } },
          ],
          lineStyle: { color: '#faad14', type: 'dashed' },
        },
      },
    ],
  } : null

  const ticketColumns = [
    { title: '作业票号', dataIndex: 'ticket_no', width: 170 },
    { title: '承包商', dataIndex: 'contractor', width: 140 },
    { title: '动火点', dataIndex: 'hot_work_point' },
    {
      title: '状态', width: 110,
      render: (_, r) => <Tag color={STATUS_COLORS[r.status]}>{STATUS_NAMES[r.status]}</Tag>,
    },
    {
      title: '检测状态', width: 160,
      render: (_, r) => {
        if (r.detection_count === 0) return <Tag color="default">未检测</Tag>
        const min = getMinutesSince(r.latest_detection)
        const over = min > (r.retest_interval || 30)
        if (!r.latest_qualified) return <Tag color="red">不合格</Tag>
        if (over && r.status === 'in_progress') return <Tag color="red">超时 {Math.round(min)}分</Tag>
        return <Tag color="green">合格（{Math.round(min)}分前）</Tag>
      },
    },
    {
      title: '检测次数', width: 100,
      render: (_, r) => r.detection_count,
    },
    { title: '复测间隔', key: 'interval', width: 100, render: (_, r) => `${r.retest_interval || 30}分` },
    {
      title: '操作', width: 200,
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" icon={<DashboardOutlined />} onClick={() => openDetail(r)}>
            检测/曲线
          </Button>
          <Button type="link" size="small" onClick={() => navigate(`/tickets/${r.id}`)}>详情</Button>
        </Space>
      ),
    },
  ]

  const detectionColumns = [
    { title: '时间', dataIndex: 'created_at', width: 160, render: formatDateTime },
    { title: '检测点', dataIndex: 'detection_point', width: 130 },
    {
      title: '可燃气体%LEL', width: 130,
      render: (_, r) => (
        <span style={{ color: r.combustible_content >= (selectedTicket?.combustible_limit || 0.5) ? '#ff4d4f' : 'inherit', fontWeight: 600 }}>
          {r.combustible_content}%
        </span>
      ),
    },
    {
      title: '氧含量%', width: 100,
      render: (_, r) => (
        <span style={{
          color: (r.oxygen_content < (selectedTicket?.oxygen_min || 19.5) || r.oxygen_content > (selectedTicket?.oxygen_max || 23.5))
            ? '#ff4d4f' : 'inherit', fontWeight: 600,
        }}>
          {r.oxygen_content}%
        </span>
      ),
    },
    { title: '检测人', dataIndex: 'detector', width: 140 },
    {
      title: '结果', width: 80,
      render: (_, r) => r.is_qualified ? <Tag color="green">合格</Tag> : <Tag color="red">不合格</Tag>,
    },
  ]

  return (
    <div>
      <div className="page-header">
        <h2><AlertOutlined /> 气体检测管理</h2>
        <p style={{ color: '#666', marginTop: 4 }}>监护人录入可燃气体和氧含量 - 超限自动暂停作业</p>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#1890ff,#69c0ff)', color: 'white' }}>
            <Statistic title={<span style={{ color: 'white' }}>待检测作业票</span>} value={tickets.filter(t => t.detection_count === 0).length} valueStyle={{ color: 'white' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#52c41a,#95de64)', color: 'white' }}>
            <Statistic title={<span style={{ color: 'white' }}>检测合格</span>} value={tickets.filter(t => t.latest_qualified).length} valueStyle={{ color: 'white' }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#ff4d4f,#ffa39e)', color: 'white' }}>
            <Statistic title={<span style={{ color: 'white' }}>超标/超时</span>} value={tickets.filter(t => !t.latest_qualified && t.detection_count > 0).length + tickets.filter(t => t.status === 'in_progress' && getMinutesSince(t.latest_detection) > (t.retest_interval || 30)).length} valueStyle={{ color: 'white' }} />
          </Card>
        </Col>
      </Row>

      <Card className="page-card">
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message="联锁规则"
          description={[
            '1. 可燃气体含量超限或氧含量超出范围 → 作业自动暂停',
            '2. 作业期间超过复测间隔 → 锁定继续施工按钮，必须复测合格后方可继续',
            `3. 默认阈值：可燃 < 0.5%LEL，氧含量 19.5%~23.5%，复测间隔 30分钟（可在作业票中调整）`,
          ].map((r, i) => <div key={i}>{r}</div>)}
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
        title={`气体检测中心 - ${selectedTicket?.ticket_no || ''}`}
        open={detailModal}
        onCancel={() => setDetailModal(false)}
        width={1100}
        footer={[
          <Button key="back" onClick={() => navigate(`/tickets/${selectedTicket?.id}`)}>查看作业票</Button>,
          <Button key="add" type="primary" icon={<DashboardOutlined />} onClick={() => setAddModal(true)}>
            录入检测数据
          </Button>,
        ]}
      >
        {selectedTicket?.status === 'in_progress' && latestDet && overInterval && (
          <Alert
            type="error"
            showIcon
            icon={<PauseCircleOutlined />}
            style={{ marginBottom: 16 }}
            message="超过复测间隔！继续施工按钮已锁定"
            description={`距离上次检测已过去 ${Math.round(minutesSince)} 分钟，超过设定的 ${selectedTicket.retest_interval || 30} 分钟，请立即录入复测数据！`}
          />
        )}
        {latestDet && !latestDet.is_qualified && (
          <Alert type="error" showIcon message="最近一次检测不合格，作业已暂停！" style={{ marginBottom: 16 }} />
        )}

        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} md={8}>
            <Card size="small">
              <div style={{ color: '#666', fontSize: 12 }}>可燃气体上限</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#ff4d4f' }}>{selectedTicket?.combustible_limit || 0.5} %LEL</div>
              {latestDet && (
                <Progress
                  style={{ marginTop: 8 }}
                  percent={Math.min(100, (latestDet.combustible_content / (selectedTicket?.combustible_limit || 0.5)) * 100)}
                  status={latestDet.combustible_content >= (selectedTicket?.combustible_limit || 0.5) ? 'exception' : 'active'}
                  size="small"
                  strokeColor="#ff4d4f"
                  format={() => `${latestDet.combustible_content}%`}
                />
              )}
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <div style={{ color: '#666', fontSize: 12 }}>氧含量范围</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#1890ff' }}>{selectedTicket?.oxygen_min || 19.5}% ~ {selectedTicket?.oxygen_max || 23.5}%</div>
              {latestDet && (
                <div style={{ marginTop: 8, fontSize: 14 }}>
                  当前：<strong style={{
                    color: (latestDet.oxygen_content < (selectedTicket?.oxygen_min || 19.5) || latestDet.oxygen_content > (selectedTicket?.oxygen_max || 23.5)) ? '#ff4d4f' : '#1890ff',
                  }}>
                    {latestDet.oxygen_content}%
                  </strong>
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <div style={{ color: '#666', fontSize: 12 }}>距离上次检测</div>
              <div style={{
                fontSize: 20, fontWeight: 600,
                color: (overInterval && selectedTicket?.status === 'in_progress') ? '#ff4d4f' : '#52c41a',
              }}>
                {Math.round(minutesSince)} 分钟
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
                复测间隔：{selectedTicket?.retest_interval || 30} 分钟
              </div>
            </Card>
          </Col>
        </Row>

        {curveData && curveData.timeline.length > 0 && (
          <div className="curve-container" style={{ height: 280, marginBottom: 16 }}>
            <ReactECharts option={curveOption} style={{ height: '100%' }} />
          </div>
        )}

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>检测记录</div>
        <Table
          columns={detectionColumns}
          dataSource={detections}
          rowKey="id"
          pagination={{ pageSize: 5 }}
          size="small"
        />
      </Modal>

      <Modal
        title="录入气体检测数据"
        open={addModal}
        onCancel={() => setAddModal(false)}
        onOk={handleAddDetection}
        okText="提交检测"
        confirmLoading={loading}
        width={500}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="检测标准"
          description={`可燃 < ${selectedTicket?.combustible_limit || 0.5}%LEL，氧 ${selectedTicket?.oxygen_min || 19.5}% ~ ${selectedTicket?.oxygen_max || 23.5}%，否则自动暂停作业`}
        />
        <Form form={addForm} layout="vertical">
          <Form.Item label="检测点" name="detection_point" rules={[{ required: true }]}>
            <Select>
              <Select.Option value={selectedTicket?.hot_work_point}>动火点</Select.Option>
              <Select.Option value="动火点上风向">动火点上风向</Select.Option>
              <Select.Option value="动火点下风向">动火点下风向</Select.Option>
              <Select.Option value="受限空间内">受限空间内</Select.Option>
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="可燃气体(%LEL)" name="combustible_content" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} placeholder="如: 0.2" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="氧含量(%)" name="oxygen_content" rules={[{ required: true }]}>
                <InputNumber min={0} max={30} step={0.01} style={{ width: '100%' }} placeholder="如: 20.8" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default DetectionPage
