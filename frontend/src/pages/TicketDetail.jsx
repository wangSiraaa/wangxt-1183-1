import { useEffect, useState } from 'react'
import {
  Card, Descriptions, Tag, Button, Space, Table, Alert, Row, Col,
  Form, Input, InputNumber, Modal, message, Statistic, Divider, Badge,
} from 'antd'
import {
  CheckCircleOutlined, PauseCircleOutlined, SafetyCertificateOutlined,
  PlayCircleOutlined, ThunderboltOutlined, DashboardOutlined, LockOutlined,
  ArrowLeftOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import {
  ticketApi, isolationApi, detectionApi, pauseApi,
} from '../services/api'
import { STATUS_NAMES, STATUS_COLORS, ROLE_NAMES } from '../stores/appStore'
import { formatDateTime, getMinutesSince } from '../utils/helpers'
import useAppStore from '../stores/appStore'

function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentUser, currentRole } = useAppStore()
  const [ticket, setTicket] = useState(null)
  const [interlock, setInterlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [detectionModal, setDetectionModal] = useState(false)
  const [pauseModal, setPauseModal] = useState(false)
  const [detectionForm] = Form.useForm()
  const [pauseForm] = Form.useForm()

  useEffect(() => {
    loadData()
    const timer = setInterval(loadData, 10000)
    return () => clearInterval(timer)
  }, [id])

  const loadData = async () => {
    try {
      const [ticketRes, interlockRes] = await Promise.all([
        ticketApi.detail(id),
        ticketApi.checkInterlock(id),
      ])
      setTicket(ticketRes.data)
      setInterlock(interlockRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  if (!ticket) return <Card loading className="page-card" />

  const confirmBlindPlate = async (plateId) => {
    try {
      await isolationApi.confirmInstall(plateId, { confirmed_by: currentUser })
      message.success('盲板已确认安装')
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '确认失败')
    }
  }

  const handleAddDetection = async () => {
    try {
      setLoading(true)
      const values = await detectionForm.validateFields()
      const res = await detectionApi.addDetection(id, {
        ...values,
        detector: currentUser,
        detector_role: currentRole,
      })
      message.success(
        res.data.is_qualified ? '气体检测合格' : (res.data.auto_paused ? '气体检测超限，作业已自动暂停！' : '气体检测不合格')
      )
      setDetectionModal(false)
      detectionForm.resetFields()
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '检测数据提交失败')
    } finally {
      setLoading(false)
    }
  }

  const handleIssueTicket = async () => {
    try {
      setLoading(true)
      await ticketApi.issue(id, { issued_by: currentUser })
      message.success('作业票开具成功，可以开始作业')
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '开具失败')
    } finally {
      setLoading(false)
    }
  }

  const handlePause = async () => {
    try {
      setLoading(true)
      const values = await pauseForm.validateFields()
      await pauseApi.pause(id, { ...values, paused_by: currentUser })
      message.success('作业已暂停')
      setPauseModal(false)
      pauseForm.resetFields()
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '暂停失败')
    } finally {
      setLoading(false)
    }
  }

  const handleResume = async () => {
    try {
      setLoading(true)
      await pauseApi.resume(id, { resumed_by: currentUser })
      message.success('作业已恢复')
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '恢复失败')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    try {
      setLoading(true)
      await ticketApi.complete(id, { completed_by: currentUser })
      message.success('作业票已完成')
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const curveOption = {
    title: { text: '气体检测趋势曲线', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['可燃气体(%LEL)', '氧含量(%)'], top: 30 },
    grid: { left: 60, right: 60, top: 80, bottom: 60 },
    xAxis: {
      type: 'category',
      data: ticket.detections.slice().reverse().map(d => formatDateTime(d.created_at).split(' ')[1]),
      axisLabel: { rotate: 30 },
    },
    yAxis: [
      { type: 'value', name: '可燃%', position: 'left' },
      { type: 'value', name: '氧含量%', position: 'right' },
    ],
    series: [
      {
        name: '可燃气体(%LEL)',
        type: 'line',
        smooth: true,
        yAxisIndex: 0,
        data: ticket.detections.slice().reverse().map(d => d.combustible_content),
        itemStyle: { color: '#ff4d4f' },
        areaStyle: { opacity: 0.2, color: '#ff4d4f' },
        markLine: {
          silent: true,
          lineStyle: { color: '#ff4d4f', type: 'dashed' },
          data: [{ yAxis: ticket.combustible_limit, label: { formatter: `上限 ${ticket.combustible_limit}%` } }],
        },
      },
      {
        name: '氧含量(%)',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: ticket.detections.slice().reverse().map(d => d.oxygen_content),
        itemStyle: { color: '#1890ff' },
        areaStyle: { opacity: 0.2, color: '#1890ff' },
        markLine: {
          silent: true,
          lineStyle: { color: '#faad14', type: 'dashed' },
          data: [
            { yAxis: ticket.oxygen_min, label: { formatter: `下限 ${ticket.oxygen_min}%` } },
            { yAxis: ticket.oxygen_max, label: { formatter: `上限 ${ticket.oxygen_max}%` } },
          ],
        },
      },
    ],
  }

  const latestDetection = ticket.detections[0]
  const minutesSinceDetection = latestDetection ? getMinutesSince(latestDetection.created_at) : 0
  const isOverInterval = minutesSinceDetection > (ticket.retest_interval || 30)

  const plateColumns = [
    { title: '盲板编号', dataIndex: 'plate_no', width: 120 },
    { title: '位置', dataIndex: 'location' },
    { title: '管线', dataIndex: 'pipeline_name' },
    { title: '介质', dataIndex: 'medium' },
    {
      title: '状态', width: 100,
      render: (_, r) => r.installed
        ? <Tag color="green"><CheckCircleOutlined /> 已安装</Tag>
        : <Badge status="warning" text="待确认" />,
    },
    {
      title: '操作', width: 140,
      render: (_, r) => !r.installed && (
        <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => confirmBlindPlate(r.id)}>
          确认安装
        </Button>
      ),
    },
  ]

  const detectionColumns = [
    { title: '检测时间', dataIndex: 'created_at', width: 180, render: formatDateTime },
    { title: '检测点', dataIndex: 'detection_point', width: 120 },
    { title: '可燃气体', width: 110, render: (_, r) => `${r.combustible_content}% ${r.combustible_content >= ticket.combustible_limit ? '⚠️' : ''}` },
    { title: '氧含量', width: 110, render: (_, r) => `${r.oxygen_content}%` },
    { title: '检测人', dataIndex: 'detector', width: 150 },
    {
      title: '结果', width: 80,
      render: (_, r) => r.is_qualified
        ? <Tag color="green">合格</Tag>
        : <Tag color="red">不合格</Tag>,
    },
  ]

  return (
    <div>
      <div className="page-header">
        <Space style={{ marginBottom: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/tickets')}>返回</Button>
          <h2 style={{ display: 'inline-block', margin: 0 }}>
            <SafetyCertificateOutlined /> 作业票详情 - {ticket.ticket_no}
          </h2>
          <Tag color={STATUS_COLORS[ticket.status]} style={{ fontSize: 14, padding: '4px 12px' }}>
            {STATUS_NAMES[ticket.status]}
          </Tag>
        </Space>
        <p style={{ color: '#666', margin: 0 }}>动火作业联锁控制中心</p>
      </div>

      {interlock?.reasons?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="联锁提醒"
          description={interlock.reasons.map((r, i) => <div key={i}>• {r}</div>)}
        />
      )}

      {interlock?.isLocked && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          icon={<LockOutlined />}
          message="作业已锁定"
          description={interlock.lockReason}
        />
      )}

      {ticket.status === 'in_progress' && isOverInterval && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          icon={<LockOutlined />}
          message="已超过复测间隔！继续施工按钮已锁定"
          description={`距离上次检测已过去 ${Math.round(minutesSinceDetection)} 分钟，请立即进行气体复测（复测间隔 ${ticket.retest_interval} 分钟）`}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" size="small">
            <Statistic
              title="隔离盲板状态"
              value={`${ticket.blindPlates.filter(b => b.installed).length}/${ticket.blindPlates.length}`}
              prefix={<ThunderboltOutlined />}
              valueStyle={{ color: ticket.blindPlates.every(b => b.installed) ? '#52c41a' : '#fa8c16' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" size="small">
            <Statistic
              title="最近气体检测"
              value={latestDetection ? (latestDetection.is_qualified ? '合格' : '不合格') : '未检测'}
              prefix={<DashboardOutlined />}
              valueStyle={{ color: !latestDetection ? '#8c8c8c' : (latestDetection.is_qualified ? '#52c41a' : '#ff4d4f') }}
            />
            {latestDetection && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {formatDateTime(latestDetection.created_at)}
                {isOverInterval && ticket.status === 'in_progress' && (
                  <span style={{ color: '#ff4d4f' }}>（超时）</span>
                )}
              </div>
            )}
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" size="small">
            <Statistic
              title="联锁状态"
              value={interlock?.canIssue ? '满足条件' : '不满足'}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: interlock?.canIssue ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card className="stat-card" size="small">
            <Statistic
              title="施工时段"
              value={dayjs(ticket.end_time).diff(dayjs(ticket.start_time), 'hour') + '小时'}
              prefix={<SafetyCertificateOutlined />}
            />
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {formatDateTime(ticket.start_time)}
            </div>
          </Card>
        </Col>
      </Row>

      <Card
        className="page-card"
        title="基本信息"
        style={{ marginBottom: 16 }}
        extra={
          <Space>
            {(ticket.status === 'ready') && (
              <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleIssueTicket}>
                开具作业票并开工
              </Button>
            )}
            {(ticket.status === 'in_progress' || ticket.status === 'ready') && (
              <Button type="primary" danger icon={<PauseCircleOutlined />} onClick={() => setPauseModal(true)}>
                手动暂停
              </Button>
            )}
            {ticket.status === 'paused' && (
              <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleResume}>
                恢复作业
              </Button>
            )}
            {ticket.status === 'in_progress' && (
              <Button
                type="primary"
                icon={<LockOutlined />}
                disabled={isOverInterval}
                onClick={() => message.info(isOverInterval ? '超过复测间隔，请先进行气体检测！' : '继续施工...')}
              >
                {isOverInterval ? '施工按钮已锁定' : '继续施工'}
              </Button>
            )}
            {(ticket.status === 'in_progress' || ticket.status === 'ready' || ticket.status === 'paused') && (
              <Button icon={<CheckCircleOutlined />} onClick={handleComplete}>完成作业</Button>
            )}
            <Button icon={<DashboardOutlined />} onClick={() => setDetectionModal(true)}>录入气体检测</Button>
          </Space>
        }
      >
        <Descriptions column={2} size="small" bordered>
          <Descriptions.Item label="承包商">{ticket.contractor}</Descriptions.Item>
          <Descriptions.Item label="负责人">{ticket.contractor_leader}</Descriptions.Item>
          <Descriptions.Item label="动火点">{ticket.hot_work_point}</Descriptions.Item>
          <Descriptions.Item label="作业区域">{ticket.hot_work_location}</Descriptions.Item>
          <Descriptions.Item label="作业类型">{ticket.work_type}</Descriptions.Item>
          <Descriptions.Item label="复测间隔">{ticket.retest_interval} 分钟</Descriptions.Item>
          <Descriptions.Item label="施工开始">{formatDateTime(ticket.start_time)}</Descriptions.Item>
          <Descriptions.Item label="施工结束">{formatDateTime(ticket.end_time)}</Descriptions.Item>
          <Descriptions.Item label="可燃气体上限">{ticket.combustible_limit}% LEL</Descriptions.Item>
          <Descriptions.Item label="氧含量范围">{ticket.oxygen_min}% ~ {ticket.oxygen_max}%</Descriptions.Item>
          <Descriptions.Item label="隔离确认人" span={2}>
            {ticket.isolation_confirmed_by || '未确认'}（{formatDateTime(ticket.isolation_confirmed_at)}）
          </Descriptions.Item>
          <Descriptions.Item label="气体检测人" span={2}>
            {ticket.gas_qualified_by || '未检测'}（{formatDateTime(ticket.gas_qualified_at)}）
          </Descriptions.Item>
        </Descriptions>

        <Divider>责任人</Divider>
        <Row gutter={[12, 12]}>
          {ticket.responsiblePersons.map(p => (
            <Col xs={24} sm={8} key={p.id}>
              <Card size="small" style={{ background: '#fafafa' }}>
                <Tag color="blue">{ROLE_NAMES[p.role]}</Tag>
                <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{p.person_name}</div>
                <div style={{ color: '#666', fontSize: 12 }}>编号: {p.person_id}</div>
              </Card>
            </Col>
          ))}
        </Row>
      </Card>

      <Card
        className="page-card blind-plate-card"
        title={<span><ThunderboltOutlined /> 隔离盲板确认（属地负责人）</span>}
        style={{ marginBottom: 16 }}
      >
        <Table
          columns={plateColumns}
          dataSource={ticket.blindPlates}
          rowKey="id"
          pagination={false}
          size="middle"
        />
        <div style={{ marginTop: 12, padding: 12, background: ticket.blindPlates.every(b => b.installed) ? '#f6ffed' : '#fff7e6', borderRadius: 6 }}>
          <ExclamationCircleOutlined style={{ color: ticket.blindPlates.every(b => b.installed) ? '#52c41a' : '#fa8c16' }} />
          <span style={{ marginLeft: 6 }}>
            {ticket.blindPlates.every(b => b.installed)
              ? '所有盲板已确认安装，联锁条件已满足'
              : '隔离盲板未全部确认，无法开具作业票！'}
          </span>
        </div>
      </Card>

      <Card
        className="page-card detection-form-card"
        title={<span><DashboardOutlined /> 气体检测记录（安环监护人）</span>}
        style={{ marginBottom: 16 }}
      >
        {ticket.detections.length > 0 && (
          <div className="curve-container" style={{ marginBottom: 16 }}>
            <ReactECharts option={curveOption} style={{ height: '100%' }} />
          </div>
        )}
        <Table
          columns={detectionColumns}
          dataSource={ticket.detections}
          rowKey="id"
          size="middle"
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <Card
        className="page-card"
        title={<span><PauseCircleOutlined /> 暂停记录</span>}
      >
        {ticket.pauseRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>暂无暂停记录</div>
        ) : (
          ticket.pauseRecords.map(p => (
            <div key={p.id} style={{
              padding: 12, border: '1px solid #ffccc7', borderRadius: 6,
              marginBottom: 12, background: '#fff1f0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Space>
                  <Tag color={p.resumed_at ? 'green' : 'red'}>
                    {p.resumed_at ? '已恢复' : '暂停中'}
                  </Tag>
                  <Tag color="orange">{p.pause_type === 'auto_gas_exceed' ? '自动暂停（气体超限）' : '手动暂停'}</Tag>
                </Space>
                <div style={{ color: '#999', fontSize: 12 }}>
                  暂停人: {p.paused_by}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>原因: {p.pause_reason}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {formatDateTime(p.paused_at)} {p.resumed_at && `→ ${formatDateTime(p.resumed_at)}（${p.resumed_by}）`}
              </div>
            </div>
          ))
        )}
      </Card>

      <Modal
        title="录入气体检测数据"
        open={detectionModal}
        onCancel={() => setDetectionModal(false)}
        width={500}
        footer={[
          <Button key="cancel" onClick={() => setDetectionModal(false)}>取消</Button>,
          <Button key="submit" type="primary" loading={loading} onClick={handleAddDetection}>提交检测</Button>,
        ]}
      >
        <Alert
          style={{ marginBottom: 16 }}
          message="检测标准"
          description={`可燃气体 < ${ticket.combustible_limit}% LEL，氧含量 ${ticket.oxygen_min}% ~ ${ticket.oxygen_max}%`}
          type="info"
          showIcon
        />
        <Form form={detectionForm} layout="vertical">
          <Form.Item label="检测点" name="detection_point" rules={[{ required: true, message: '请输入检测点' }]}>
            <Select placeholder="请选择检测点">
              <Option value={ticket.hot_work_point}>动火点（{ticket.hot_work_point}）</Option>
              <Option value="动火点上风向">动火点上风向</Option>
              <Option value="动火点下风向">动火点下风向</Option>
              <Option value="受限空间内">受限空间内</Option>
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="可燃气体含量 (%LEL)"
                name="combustible_content"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={100} step={0.01} style={{ width: '100%' }} placeholder="如: 0.25" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="氧含量 (%)"
                name="oxygen_content"
                rules={[{ required: true }]}
              >
                <InputNumber min={0} max={30} step={0.01} style={{ width: '100%' }} placeholder="如: 20.8" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="手动暂停作业"
        open={pauseModal}
        onCancel={() => setPauseModal(false)}
        footer={[
          <Button key="cancel" onClick={() => setPauseModal(false)}>取消</Button>,
          <Button key="submit" type="primary" danger loading={loading} onClick={handlePause}>确认暂停</Button>,
        ]}
      >
        <Form form={pauseForm} layout="vertical">
          <Form.Item
            label="暂停原因"
            name="pause_reason"
            rules={[{ required: true, message: '请输入暂停原因' }]}
          >
            <Select mode="tags" placeholder="选择或输入暂停原因">
              <Option value="现场发现安全隐患">现场发现安全隐患</Option>
              <Option value="气候条件不满足">气候条件不满足</Option>
              <Option value="人员变更需要交底">人员变更需要交底</Option>
              <Option value="其他原因">其他原因</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TicketDetail
