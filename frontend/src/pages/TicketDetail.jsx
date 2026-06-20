import { useEffect, useState } from 'react'
import {
  Card, Descriptions, Tag, Button, Space, Table, Alert, Row, Col,
  Form, Input, InputNumber, Modal, message, Statistic, Divider, Badge,
  Select, Switch,
} from 'antd'
const { Option } = Select
import {
  CheckCircleOutlined, PauseCircleOutlined, SafetyCertificateOutlined,
  PlayCircleOutlined, ThunderboltOutlined, DashboardOutlined, LockOutlined,
  ArrowLeftOutlined, ExclamationCircleOutlined, AlertOutlined, UnlockOutlined,
  RiseOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'
import {
  ticketApi, isolationApi, detectionApi, pauseApi, pipelineApi,
} from '../services/api'
import { STATUS_NAMES, STATUS_COLORS, ROLE_NAMES, LOCK_TYPE_NAMES, PRESSURE_STATUS_OPTIONS } from '../stores/appStore'
import { formatDateTime, getMinutesSince } from '../utils/helpers'
import useAppStore from '../stores/appStore'

function TicketDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { currentUser, currentRole, currentUserName } = useAppStore()
  const [ticket, setTicket] = useState(null)
  const [interlock, setInterlock] = useState(null)
  const [loading, setLoading] = useState(false)
  const [detectionModal, setDetectionModal] = useState(false)
  const [pauseModal, setPauseModal] = useState(false)
  const [resumeModal, setResumeModal] = useState(false)
  const [pipelineModal, setPipelineModal] = useState(false)
  const [curveModal, setCurveModal] = useState(false)
  const [selectedPauseRecord, setSelectedPauseRecord] = useState(null)
  const [detectionForm] = Form.useForm()
  const [pauseForm] = Form.useForm()
  const [resumeForm] = Form.useForm()
  const [pipelineForm] = Form.useForm()

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

  const confirmPipeline = async (pipelineId, data) => {
    try {
      await pipelineApi.confirmPipeline(pipelineId, {
        ...data,
        confirmed_by: currentUser,
      })
      message.success('管线状态已确认')
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '确认失败')
    }
  }

  const handleAddDetection = async () => {
    try {
      setLoading(true)
      const values = await detectionForm.validateFields()
      const isRetest = ticket.is_locked || (ticket.status === 'paused')
      const res = await detectionApi.addDetection(id, {
        ...values,
        detector: currentUser,
        detector_role: currentRole,
        is_retest: isRetest ? 1 : 0,
      })
      if (res.data.is_qualified && res.data.needs_resume_confirm) {
        message.success('复测合格，请确认复工')
        setResumeModal(true)
      } else if (res.data.is_qualified) {
        message.success('气体检测合格')
      } else if (res.data.auto_paused) {
        message.error('气体检测超限，作业已自动暂停并锁定！')
      } else {
        message.warning('气体检测不合格')
      }
      setDetectionModal(false)
      detectionForm.resetFields()
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '检测数据提交失败')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmResume = async () => {
    try {
      setLoading(true)
      const values = await resumeForm.validateFields()
      await ticketApi.confirmResume(id, {
        ...values,
        confirmed_by: currentUser,
      })
      message.success('复工确认成功，作业已恢复')
      setResumeModal(false)
      resumeForm.resetFields()
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '复工确认失败')
    } finally {
      setLoading(false)
    }
  }

  const handleUnlock = async () => {
    Modal.confirm({
      title: '确认人工解锁',
      icon: <ExclamationCircleOutlined />,
      content: '确定要人工解锁此作业票吗？此操作需要管理员权限，并会记录操作日志。',
      okText: '确认解锁',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setLoading(true)
          await ticketApi.unlock(id, {
            unlocked_by: currentUser,
            unlock_reason: '管理员人工解锁',
          })
          message.success('作业票已解锁')
          loadData()
        } catch (e) {
          message.error(e.response?.data?.error || '解锁失败')
        } finally {
          setLoading(false)
        }
      },
    })
  }

  const showCurveModal = (pauseRecord) => {
    setSelectedPauseRecord(pauseRecord)
    setCurveModal(true)
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

  const reversedDetections = ticket.detections.slice().reverse()
  const pausePoints = ticket.pauseRecords
    .filter(p => p.pause_type === 'auto_gas_exceed')
    .map(pause => {
      const idx = reversedDetections.findIndex(d => new Date(d.created_at) <= new Date(pause.paused_at))
      return idx >= 0 ? {
        coord: [idx, reversedDetections[idx]?.combustible_content || ticket.combustible_limit],
        value: '暂停',
        itemStyle: { color: '#ff4d4f' },
      } : null
    })
    .filter(Boolean)

  const curveOption = {
    title: { text: '气体检测趋势曲线', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { data: ['可燃气体(%LEL)', '氧含量(%)'], top: 30 },
    grid: { left: 60, right: 60, top: 80, bottom: 60 },
    xAxis: {
      type: 'category',
      data: reversedDetections.map(d => formatDateTime(d.created_at).split(' ')[1]),
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
        data: reversedDetections.map(d => ({
          value: d.combustible_content,
          itemStyle: d.is_retest ? { color: '#52c41a' } : undefined,
        })),
        itemStyle: { color: '#ff4d4f' },
        areaStyle: { opacity: 0.2, color: '#ff4d4f' },
        markLine: {
          silent: true,
          lineStyle: { color: '#ff4d4f', type: 'dashed' },
          data: [{ yAxis: ticket.combustible_limit, label: { formatter: `上限 ${ticket.combustible_limit}%` } }],
        },
        markPoint: {
          symbol: 'pin',
          symbolSize: 40,
          data: pausePoints,
          label: { color: '#fff', fontWeight: 'bold' },
        },
      },
      {
        name: '氧含量(%)',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        data: reversedDetections.map(d => d.oxygen_content),
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

  const pipelineColumns = [
    { title: '管线名称', dataIndex: 'pipeline_name', width: 160 },
    { title: '位置', dataIndex: 'location', width: 140 },
    { title: '介质', dataIndex: 'medium', width: 120 },
    {
      title: '压力状态', dataIndex: 'pressure_status', width: 120,
      render: v => {
        const opt = PRESSURE_STATUS_OPTIONS.find(o => o.value === v)
        return <Tag color={v === 'depressurized' ? 'green' : 'blue'}>{opt?.label || v}</Tag>
      },
    },
    {
      title: '泄漏情况', dataIndex: 'has_leak', width: 100,
      render: v => <Tag color={v ? 'red' : 'green'}>{v ? '有泄漏' : '无泄漏'}</Tag>,
    },
    {
      title: '状态', width: 100,
      render: (_, r) => r.confirmed
        ? <Tag color="green"><CheckCircleOutlined /> 已确认</Tag>
        : <Badge status="warning" text="待确认" />,
    },
    {
      title: '操作', width: 140,
      render: (_, r) => !r.confirmed && (
        <Button type="primary" size="small" icon={<CheckCircleOutlined />} onClick={() => {
          pipelineForm.setFieldsValue({
            pressure_status: r.pressure_status,
            has_leak: r.has_leak ? 1 : 0,
            remark: r.remark || '',
          })
          pipelineForm.pipelineId = r.id
          setPipelineModal(true)
        }}>
          确认状态
        </Button>
      ),
    },
  ]

  const detectionColumns = [
    { title: '检测时间', dataIndex: 'created_at', width: 180, render: formatDateTime },
    { title: '检测点', dataIndex: 'detection_point', width: 120 },
    {
      title: '类型', width: 80,
      render: (_, r) => r.is_retest
        ? <Tag color="green">复测</Tag>
        : <Tag color="blue">检测</Tag>,
    },
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
              title="相邻管线状态"
              value={`${ticket.adjacentPipelines?.filter(p => p.confirmed).length || 0}/${ticket.adjacentPipelines?.length || 0}`}
              prefix={<AlertOutlined />}
              valueStyle={{
                color: (ticket.adjacentPipelines?.every(p => p.confirmed)) ? '#52c41a' : '#fa8c16',
              }}
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
              title="锁定状态"
              value={ticket.is_locked ? (LOCK_TYPE_NAMES[ticket.lock_type] || '已锁定') : '未锁定'}
              prefix={ticket.is_locked ? <LockOutlined /> : <UnlockOutlined />}
              valueStyle={{ color: ticket.is_locked ? '#ff4d4f' : '#52c41a' }}
            />
            {ticket.is_locked && (
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                锁定时间: {formatDateTime(ticket.locked_at)}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      <Card
        className="page-card"
        title="基本信息"
        style={{ marginBottom: 16 }}
        extra={
          <Space wrap>
            {(ticket.status === 'ready') && (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                loading={loading}
                disabled={ticket.is_locked}
                onClick={handleIssueTicket}
              >
                开具作业票并开工
              </Button>
            )}
            {(ticket.status === 'in_progress' || ticket.status === 'ready') && !ticket.is_locked && (
              <Button type="primary" danger icon={<PauseCircleOutlined />} onClick={() => setPauseModal(true)}>
                手动暂停
              </Button>
            )}
            {ticket.status === 'paused' && ticket.is_locked && (
              <Button
                type="primary"
                icon={<RiseOutlined />}
                loading={loading}
                onClick={() => setResumeModal(true)}
              >
                确认复工
              </Button>
            )}
            {ticket.status === 'paused' && !ticket.is_locked && (
              <Button type="primary" icon={<PlayCircleOutlined />} loading={loading} onClick={handleResume}>
                恢复作业
              </Button>
            )}
            {ticket.status === 'in_progress' && (
              <Button
                type="primary"
                icon={<LockOutlined />}
                disabled={isOverInterval || ticket.is_locked}
                onClick={() => {
                  if (ticket.is_locked) {
                    message.error('作业票已锁定，请先完成复工确认')
                  } else if (isOverInterval) {
                    message.error('超过复测间隔，请先进行气体检测！')
                  } else {
                    message.info('继续施工...')
                  }
                }}
              >
                {ticket.is_locked ? '已锁定' : (isOverInterval ? '施工按钮已锁定' : '继续施工')}
              </Button>
            )}
            {ticket.is_locked && currentRole === 'admin' && (
              <Button type="primary" danger icon={<UnlockOutlined />} loading={loading} onClick={handleUnlock}>
                管理员解锁
              </Button>
            )}
            {(ticket.status === 'in_progress' || ticket.status === 'ready' || ticket.status === 'paused') && (
              <Button icon={<CheckCircleOutlined />} onClick={handleComplete}>完成作业</Button>
            )}
            <Button icon={<DashboardOutlined />} onClick={() => setDetectionModal(true)}>
              {ticket.is_locked || ticket.status === 'paused' ? '录入气体复测' : '录入气体检测'}
            </Button>
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
          <Descriptions.Item label="管线确认人" span={2}>
            {ticket.pipeline_confirmed_by || '未确认'}（{formatDateTime(ticket.pipeline_confirmed_at)}）
          </Descriptions.Item>
          <Descriptions.Item label="气体检测人" span={2}>
            {ticket.gas_qualified_by || '未检测'}（{formatDateTime(ticket.gas_qualified_at)}）
          </Descriptions.Item>
          {ticket.is_locked && (
            <Descriptions.Item label="锁定原因" span={2}>
              <Tag color="red">{LOCK_TYPE_NAMES[ticket.lock_type] || ticket.lock_type}</Tag>
              {ticket.lock_reason && <span style={{ marginLeft: 8 }}>{ticket.lock_reason}</span>}
            </Descriptions.Item>
          )}
          {ticket.resume_confirmed_by && (
            <Descriptions.Item label="复工确认人" span={2}>
              {ticket.resume_confirmed_by}（{formatDateTime(ticket.resume_confirmed_at)}）
            </Descriptions.Item>
          )}
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
              ? '所有盲板已确认安装'
              : '隔离盲板未全部确认，无法开具作业票！'}
          </span>
        </div>
      </Card>

      <Card
        className="page-card"
        title={<span><AlertOutlined /> 相邻管线状态确认（属地负责人）</span>}
        style={{ marginBottom: 16, border: '2px solid #1890ff' }}
      >
        <p style={{ color: '#666', marginBottom: 12 }}>
          请逐项确认相邻管线的压力状态和泄漏情况，所有管线确认完成后才能进入气体检测环节。
        </p>
        <Table
          columns={pipelineColumns}
          dataSource={ticket.adjacentPipelines || []}
          rowKey="id"
          pagination={false}
          size="middle"
        />
        {ticket.adjacentPipelines?.length > 0 && (
          <div style={{
            marginTop: 12, padding: 12,
            background: ticket.adjacentPipelines.every(p => p.confirmed) ? '#f6ffed' : '#e6f7ff',
            borderRadius: 6,
          }}>
            <ExclamationCircleOutlined style={{
              color: ticket.adjacentPipelines.every(p => p.confirmed) ? '#52c41a' : '#1890ff',
            }} />
            <span style={{ marginLeft: 6 }}>
              {ticket.adjacentPipelines.every(p => p.confirmed)
                ? '所有相邻管线状态已确认'
                : `还有 ${ticket.adjacentPipelines.filter(p => !p.confirmed).length} 条管线需要确认状态`}
            </span>
          </div>
        )}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Space wrap style={{ marginBottom: 8 }}>
                  <Tag color={p.resumed_at ? 'green' : 'red'}>
                    {p.resumed_at ? '已恢复' : '暂停中'}
                  </Tag>
                  <Tag color="orange">
                    {p.pause_type === 'auto_gas_exceed' ? '自动暂停（气体超限）' : '手动暂停'}
                  </Tag>
                  {p.detection_curve_data && (
                    <Button type="link" size="small" onClick={() => showCurveModal(p)}>
                      <DashboardOutlined /> 查看检测曲线
                    </Button>
                  )}
                </Space>
                <div style={{ color: '#999', fontSize: 12 }}>
                  暂停人: {p.paused_by}
                </div>
              </div>
              <div style={{ marginTop: 8 }}>原因: {p.pause_reason}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                {formatDateTime(p.paused_at)} {p.resumed_at && `→ ${formatDateTime(p.resumed_at)}（${p.resumed_by}）`}
              </div>
              {p.resume_confirmed_by && (
                <div style={{ fontSize: 12, color: '#52c41a', marginTop: 4 }}>
                  <CheckCircleOutlined /> 复工确认人: {p.resume_confirmed_by}（{formatDateTime(p.resume_confirmed_at)}）
                </div>
              )}
              {p.retest_detection_id && (
                <div style={{ fontSize: 12, color: '#1890ff', marginTop: 2 }}>
                  关联复测记录: {p.retest_detection_id.substring(0, 8)}...
                </div>
              )}
            </div>
          ))
        )}
      </Card>

      <Modal
        title={ticket.is_locked || ticket.status === 'paused' ? '录入气体复测数据' : '录入气体检测数据'}
        open={detectionModal}
        onCancel={() => setDetectionModal(false)}
        width={500}
        footer={[
          <Button key="cancel" onClick={() => setDetectionModal(false)}>取消</Button>,
          <Button key="submit" type="primary" loading={loading} onClick={handleAddDetection}>
            {ticket.is_locked || ticket.status === 'paused' ? '提交复测' : '提交检测'}
          </Button>,
        ]}
      >
        <Alert
          style={{ marginBottom: 16 }}
          message={ticket.is_locked || ticket.status === 'paused' ? '复测标准（复工前必须合格）' : '检测标准'}
          description={`可燃气体 < ${ticket.combustible_limit}% LEL，氧含量 ${ticket.oxygen_min}% ~ ${ticket.oxygen_max}%`}
          type={ticket.is_locked ? 'warning' : 'info'}
          showIcon
        />
        {(ticket.is_locked || ticket.status === 'paused') && (
          <Alert
            style={{ marginBottom: 16 }}
            message="复工流程"
            description="复测合格后，需要监护人确认复工，作业票才能解除锁定并恢复作业。"
            type="warning"
            showIcon
          />
        )}
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
        title="确认相邻管线状态"
        open={pipelineModal}
        onCancel={() => setPipelineModal(false)}
        width={500}
        footer={[
          <Button key="cancel" onClick={() => setPipelineModal(false)}>取消</Button>,
          <Button
            key="submit"
            type="primary"
            loading={loading}
            onClick={async () => {
              try {
                setLoading(true)
                const values = await pipelineForm.validateFields()
                await confirmPipeline(pipelineForm.pipelineId, {
                  ...values,
                  has_leak: values.has_leak === 1,
                })
                setPipelineModal(false)
                pipelineForm.resetFields()
              } catch (e) {
                message.error(e.response?.data?.error || '确认失败')
              } finally {
                setLoading(false)
              }
            }}
          >
            确认状态
          </Button>,
        ]}
      >
        <Alert
          style={{ marginBottom: 16 }}
          message="重要提醒"
          description="请现场核实管线压力状态和是否有泄漏，确认无误后再提交。"
          type="warning"
          showIcon
        />
        <Form form={pipelineForm} layout="vertical">
          <Form.Item label="压力状态" name="pressure_status" rules={[{ required: true }]}>
            <Select>
              {PRESSURE_STATUS_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="是否有泄漏" name="has_leak" rules={[{ required: true }]}>
            <Select>
              <Option value={0}>无泄漏（安全）</Option>
              <Option value={1}>有泄漏（危险）</Option>
            </Select>
          </Form.Item>
          <Form.Item label="确认备注" name="remark">
            <Input.TextArea rows={2} placeholder="请输入现场确认情况" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="确认复工"
        open={resumeModal}
        onCancel={() => setResumeModal(false)}
        width={600}
        footer={[
          <Button key="cancel" onClick={() => setResumeModal(false)}>取消</Button>,
          <Button key="submit" type="primary" loading={loading} onClick={handleConfirmResume}>
            确认复工
          </Button>,
        ]}
      >
        <Alert
          style={{ marginBottom: 16 }}
          type="warning"
          showIcon
          message="复工前联锁检查"
          description={
            <div>
              <div>• 隔离盲板：{ticket.blindPlates.every(b => b.installed) ? '✅ 全部确认安装' : '❌ 存在未确认盲板'}</div>
              <div>• 相邻管线：{(ticket.adjacentPipelines?.every(p => p.confirmed)) ? '✅ 全部确认状态' : '❌ 存在未确认管线'}</div>
              <div>• 气体检测：{latestDetection?.is_qualified ? '✅ 最近检测合格' : '❌ 最近检测不合格'}</div>
              <div style={{ marginTop: 8, color: '#ff4d4f', fontWeight: 600 }}>
                确认人：{currentUserName}（{ROLE_NAMES[currentRole]}）
              </div>
            </div>
          }
        />
        <Form form={resumeForm} layout="vertical">
          <Form.Item
            label="复工确认说明"
            name="resume_remark"
            rules={[{ required: true, message: '请输入复工确认说明' }]}
          >
            <Input.TextArea
              rows={3}
              placeholder="请说明已确认所有安全条件满足，可以恢复作业"
            />
          </Form.Item>
          <Form.Item
            label="本人已确认"
            name="confirmed"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value) =>
                  value ? Promise.resolve() : Promise.reject(new Error('请勾选确认')),
              },
            ]}
          >
            <Switch
              checkedChildren="已确认"
              unCheckedChildren="未确认"
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="暂停时检测曲线"
        open={curveModal}
        onCancel={() => setCurveModal(false)}
        width={900}
        footer={[
          <Button key="close" onClick={() => setCurveModal(false)}>关闭</Button>,
        ]}
      >
        {selectedPauseRecord?.detection_curve_data && (
          <ReactECharts
            option={(() => {
              const data = JSON.parse(selectedPauseRecord.detection_curve_data)
              return {
                title: { text: '暂停时气体检测趋势曲线', left: 'center' },
                tooltip: { trigger: 'axis' },
                legend: { data: ['可燃气体(%LEL)', '氧含量(%)'], top: 30 },
                grid: { left: 60, right: 60, top: 80, bottom: 60 },
                xAxis: {
                  type: 'category',
                  data: [...data.timeline, data.current_detection].map(d =>
                    dayjs(d.time).format('HH:mm:ss')
                  ),
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
                    data: [...data.timeline, data.current_detection].map((d, i) => ({
                      value: d.combustible,
                      itemStyle: i === data.timeline.length ? { color: '#ff4d4f', borderWidth: 3 } : undefined,
                    })),
                    itemStyle: { color: '#ff4d4f' },
                    areaStyle: { opacity: 0.2, color: '#ff4d4f' },
                    markLine: {
                      silent: true,
                      lineStyle: { color: '#ff4d4f', type: 'dashed' },
                      data: [{ yAxis: data.limits.combustible_limit, label: { formatter: `上限 ${data.limits.combustible_limit}%` } }],
                    },
                    markPoint: {
                      symbol: 'pin',
                      symbolSize: 50,
                      data: [{
                        coord: [data.timeline.length, data.current_detection.combustible],
                        value: '超限',
                        itemStyle: { color: '#ff4d4f' },
                      }],
                      label: { color: '#fff', fontWeight: 'bold' },
                    },
                  },
                  {
                    name: '氧含量(%)',
                    type: 'line',
                    smooth: true,
                    yAxisIndex: 1,
                    data: [...data.timeline, data.current_detection].map(d => d.oxygen),
                    itemStyle: { color: '#1890ff' },
                    areaStyle: { opacity: 0.2, color: '#1890ff' },
                    markLine: {
                      silent: true,
                      lineStyle: { color: '#faad14', type: 'dashed' },
                      data: [
                        { yAxis: data.limits.oxygen_min, label: { formatter: `下限 ${data.limits.oxygen_min}%` } },
                        { yAxis: data.limits.oxygen_max, label: { formatter: `上限 ${data.limits.oxygen_max}%` } },
                      ],
                    },
                  },
                ],
              }
            })()}
            style={{ height: 400 }}
          />
        )}
        {!selectedPauseRecord?.detection_curve_data && (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            暂无检测曲线数据
          </div>
        )}
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
