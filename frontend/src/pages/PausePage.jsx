import { useEffect, useState } from 'react'
import {
  Card, Table, Tag, Button, Space, Alert, Statistic, Row, Col,
  Modal, Form, Select, message, Input,
} from 'antd'
import {
  PauseCircleOutlined, PlayCircleOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined, DashboardOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { pauseApi, ticketApi, detectionApi, isolationApi } from '../services/api'
import { STATUS_NAMES, STATUS_COLORS } from '../stores/appStore'
import useAppStore from '../stores/appStore'
import { formatDateTime, getMinutesSince } from '../utils/helpers'

function PausePage() {
  const navigate = useNavigate()
  const { currentUser } = useAppStore()
  const [loading, setLoading] = useState(false)
  const [pausedList, setPausedList] = useState([])
  const [historyList, setHistoryList] = useState([])
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [resumeModal, setResumeModal] = useState(false)
  const [pauseModal, setPauseModal] = useState(false)
  const [tickets, setTickets] = useState([])
  const [pauseForm] = Form.useForm()
  const [resumeForm] = Form.useForm()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [pausedRes, ticketRes] = await Promise.all([
        pauseApi.activeList(),
        ticketApi.list({ status: 'paused' }),
      ])
      setPausedList(pausedRes.data)

      const allHistory = []
      for (const t of ticketRes.data) {
        try {
          const recRes = await pauseApi.listByTicket(t.id)
          recRes.data.forEach(r => {
            allHistory.push({
              ...r,
              ticket_no: t.ticket_no,
              contractor: t.contractor,
              hot_work_point: t.hot_work_point,
              status: t.status,
            })
          })
        } catch (e) { console.error(e) }
      }
      allHistory.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setHistoryList(allHistory)

      setTickets(ticketRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const checkResumeCondition = async (ticketId) => {
    try {
      const [plateRes, detRes, interlockRes] = await Promise.all([
        isolationApi.listByTicket(ticketId),
        detectionApi.listByTicket(ticketId),
        ticketApi.checkInterlock(ticketId),
      ])
      const latestDet = detRes.data[0]
      const unconfirmed = plateRes.data.filter(p => !p.installed).length
      const minutesSince = latestDet ? getMinutesSince(latestDet.created_at) : 9999
      const ticket = tickets.find(t => t.id === ticketId)
      const overInterval = minutesSince > (ticket?.retest_interval || 30)

      return {
        canResume: interlockRes.data.canIssue && latestDet?.is_qualified && unconfirmed === 0 && !overInterval,
        reasons: [
          ...(unconfirmed > 0 ? [`${unconfirmed} 块盲板未确认`] : []),
          ...(!latestDet ? ['尚未进行气体检测'] : []),
          ...(latestDet && !latestDet.is_qualified ? ['最近一次气体检测不合格'] : []),
          ...(overInterval ? ['超过复测间隔，请重新检测'] : []),
        ],
        latestDet,
        overInterval,
        unconfirmed,
      }
    } catch (e) {
      return { canResume: false, reasons: ['检查失败'] }
    }
  }

  const openResumeModal = async (ticket) => {
    setSelectedTicket(ticket)
    const check = await checkResumeCondition(ticket.id || ticket.ticket_id)
    resumeForm.setFieldsValue({ _check: check })
    setResumeModal(true)
  }

  const handleResume = async () => {
    try {
      setLoading(true)
      const values = await resumeForm.validateFields()
      const tid = selectedTicket.id || selectedTicket.ticket_id
      await pauseApi.resume(tid, { resumed_by: currentUser, resume_remark: values.resume_remark })
      message.success('作业恢复成功')
      setResumeModal(false)
      resumeForm.resetFields()
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '恢复失败')
    } finally {
      setLoading(false)
    }
  }

  const handleManualPause = async () => {
    try {
      setLoading(true)
      const values = await pauseForm.validateFields()
      await pauseApi.pause(values.ticket_id, {
        pause_type: 'manual',
        pause_reason: values.pause_reason,
        paused_by: currentUser,
      })
      message.success('暂停成功')
      setPauseModal(false)
      pauseForm.resetFields()
      loadData()
    } catch (e) {
      message.error(e.response?.data?.error || '暂停失败')
    } finally {
      setLoading(false)
    }
  }

  const resumeCheck = resumeForm.getFieldValue('_check')

  const activeColumns = [
    {
      title: '作业票号', dataIndex: 'ticket_no', width: 170,
      render: (v, r) => <a onClick={() => navigate(`/tickets/${r.id}`)}>{v}</a>,
    },
    { title: '承包商', dataIndex: 'contractor', width: 140 },
    { title: '动火点', dataIndex: 'hot_work_point' },
    {
      title: '暂停类型', width: 160,
      render: (_, r) => {
        const reason = r.pause_reason || ''
        if (reason.includes('气体') || reason.includes('超限') || r.active_pause_count > 0) {
          return <Tag color="red"><ExclamationCircleOutlined /> 自动暂停（气体超限）</Tag>
        }
        return <Tag color="orange">手动暂停</Tag>
      },
    },
    {
      title: '暂停时长', width: 120,
      render: (_, r) => `${Math.floor(getMinutesSince(r.paused_at))} 分钟`,
    },
    { title: '暂停时间', dataIndex: 'paused_at', width: 170, render: formatDateTime },
    {
      title: '暂停原因', dataIndex: 'pause_reason',
      render: v => <div style={{ color: '#cf1322' }}>{v}</div>,
    },
    {
      title: '操作', width: 220,
      render: (_, r) => (
        <Space>
          <Button type="primary" size="small" icon={<PlayCircleOutlined />} onClick={() => openResumeModal(r)}>
            恢复作业
          </Button>
          <Button type="link" size="small" icon={<DashboardOutlined />} onClick={() => navigate(`/tickets/${r.id}`)}>
            去检测
          </Button>
        </Space>
      ),
    },
  ]

  const historyColumns = [
    { title: '作业票号', dataIndex: 'ticket_no', width: 160 },
    {
      title: '类型', width: 110,
      render: (_, r) => r.pause_type === 'auto_gas_exceed'
        ? <Tag color="red">自动暂停</Tag>
        : <Tag color="orange">手动暂停</Tag>,
    },
    {
      title: '状态', width: 90,
      render: (_, r) => r.resumed_at
        ? <Tag color="green">已恢复</Tag>
        : <Tag color="red">暂停中</Tag>,
    },
    { title: '暂停原因', dataIndex: 'pause_reason' },
    { title: '暂停人', dataIndex: 'paused_by', width: 120 },
    {
      title: '时间', key: 'time', width: 300,
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          <div>暂停: {formatDateTime(r.paused_at)}</div>
          {r.resumed_at && <div style={{ color: '#52c41a' }}>恢复: {formatDateTime(r.resumed_at)}（{r.resumed_by}）</div>}
        </div>
      ),
    },
    { title: '恢复备注', dataIndex: 'resume_remark', width: 150 },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2><PauseCircleOutlined /> 暂停管理中心</h2>
          <p style={{ color: '#666', marginTop: 4 }}>联锁自动暂停 + 手动暂停，恢复前需重新满足所有联锁条件</p>
        </div>
        <Space>
          <Button icon={<PauseCircleOutlined />} onClick={() => setPauseModal(true)}>手动暂停作业</Button>
        </Space>
      </div>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#ff4d4f,#ffa39e)', color: 'white' }}>
            <Statistic
              title={<span style={{ color: 'white' }}>当前暂停中</span>}
              value={pausedList.length}
              prefix={<PauseCircleOutlined />}
              valueStyle={{ color: 'white' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ background: 'linear-gradient(135deg,#fa8c16,#ffd591)' }}>
            <Statistic
              title="气体超限自动暂停"
              value={historyList.filter(h => h.pause_type === 'auto_gas_exceed').length}
              prefix={<ExclamationCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title="总暂停次数"
              value={historyList.length}
              prefix={<DashboardOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card
        className="page-card"
        title={<span style={{ color: '#cf1322' }}><PauseCircleOutlined /> 暂停中的作业票</span>}
        style={{ marginBottom: 16 }}
      >
        {pausedList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 12 }} />
            <p>当前没有暂停中的作业</p>
          </div>
        ) : (
          <Table
            columns={activeColumns}
            dataSource={pausedList}
            rowKey="id"
            loading={loading}
            scroll={{ x: 1200 }}
          />
        )}
      </Card>

      <Card
        className="page-card"
        title={<span><DashboardOutlined /> 暂停历史记录</span>}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="恢复作业的必要条件"
          description={[
            '1. 所有隔离盲板已确认安装',
            '2. 最近一次气体检测合格（可燃气体+氧含量均达标）',
            '3. 未超过复测间隔（如超过需重新检测）',
          ].map((r, i) => <div key={i}>{r}</div>)}
        />
        <Table
          columns={historyColumns}
          dataSource={historyList}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        title={`恢复作业 - ${selectedTicket?.ticket_no || ''}`}
        open={resumeModal}
        onCancel={() => setResumeModal(false)}
        onOk={handleResume}
        okText="确认恢复作业"
        confirmLoading={loading}
        okButtonProps={{ disabled: !resumeCheck?.canResume }}
        width={600}
      >
        {resumeCheck && (
          <div style={{ marginBottom: 16 }}>
            {resumeCheck.canResume ? (
              <Alert type="success" showIcon message="联锁条件已满足，可以恢复作业" />
            ) : (
              <Alert
                type="error"
                showIcon
                message="联锁条件不满足，无法恢复作业"
                description={resumeCheck.reasons.map((r, i) => <div key={i}>• {r}</div>)}
              />
            )}
            {resumeCheck.latestDet && (
              <div style={{ marginTop: 12, padding: 12, background: '#fafafa', borderRadius: 6 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>最近一次检测：</div>
                <div>时间：{formatDateTime(resumeCheck.latestDet.created_at)}</div>
                <div>
                  可燃气体：
                  <span style={{
                    fontWeight: 600,
                    color: resumeCheck.latestDet.is_qualified ? '#52c41a' : '#ff4d4f',
                  }}>
                    {resumeCheck.latestDet.combustible_content}%LEL
                  </span>
                  ，氧含量：
                  <span style={{
                    fontWeight: 600,
                    color: resumeCheck.latestDet.is_qualified ? '#52c41a' : '#ff4d4f',
                  }}>
                    {resumeCheck.latestDet.oxygen_content}%
                  </span>
                  <Tag color={resumeCheck.latestDet.is_qualified ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                    {resumeCheck.latestDet.is_qualified ? '合格' : '不合格'}
                  </Tag>
                </div>
                {resumeCheck.overInterval && (
                  <div style={{ color: '#ff4d4f', marginTop: 4 }}>
                    <ExclamationCircleOutlined /> 超过复测间隔，请重新进行气体检测
                  </div>
                )}
              </div>
            )}
            {!resumeCheck.canResume && (
              <div style={{ marginTop: 12 }}>
                <Button type="primary" onClick={() => { setResumeModal(false); navigate(`/tickets/${selectedTicket?.id || selectedTicket?.ticket_id}`) }}>
                  前往作业票处理
                </Button>
              </div>
            )}
          </div>
        )}
        <Form form={resumeForm} layout="vertical">
          <Form.Item label="恢复备注" name="resume_remark">
            <Input.TextArea rows={3} placeholder="请输入恢复作业的说明（可选）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="手动暂停作业"
        open={pauseModal}
        onCancel={() => setPauseModal(false)}
        onOk={handleManualPause}
        okText="确认暂停"
        confirmLoading={loading}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="暂停后必须重新满足所有联锁条件（隔离+检测合格）才能恢复作业"
        />
        <Form form={pauseForm} layout="vertical">
          <Form.Item label="选择作业票" name="ticket_id" rules={[{ required: true }]}>
            <Select
              placeholder="选择要暂停的作业票（仅作业中或待开工的）"
              filterOption
              options={tickets
                .filter(t => t.status !== 'completed' && t.status !== 'paused' && t.status !== 'cancelled' && t.status !== 'draft')
                .map(t => ({
                  value: t.id,
                  label: `${t.ticket_no} - ${t.contractor} - ${t.hot_work_point}（${STATUS_NAMES[t.status]}）`,
                }))}
            />
          </Form.Item>
          <Form.Item label="暂停原因" name="pause_reason" rules={[{ required: true }]}>
            <Select mode="tags" placeholder="选择或输入暂停原因">
              <Select.Option value="现场发现安全隐患">现场发现安全隐患</Select.Option>
              <Select.Option value="气候条件不满足">气候条件不满足</Select.Option>
              <Select.Option value="人员变更需要交底">人员变更需要交底</Select.Option>
              <Select.Option value="设备异常需要检修">设备异常需要检修</Select.Option>
              <Select.Option value="其他原因">其他原因</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default PausePage
