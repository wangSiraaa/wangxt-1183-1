import { useState } from 'react'
import {
  Card, Form, Input, InputNumber, DatePicker, Select, Button, Space, Table,
  Modal, Row, Col, Divider, message, List, Tag, Switch,
} from 'antd'
import {
  PlusOutlined, SaveOutlined, FireOutlined, UserOutlined, DeleteOutlined, AlertOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { ticketApi } from '../services/api'
import useAppStore, { ROLES, ROLE_NAMES, PRESSURE_STATUS_OPTIONS } from '../stores/appStore'

const { TextArea } = Input
const { Option } = Select

const WORK_TYPES = [
  '电焊作业', '气焊作业', '切割作业', '打磨作业', '钻孔作业', '热煨作业', '其他动火作业',
]

const defaultBlindPlates = [
  { plate_no: 'BP-001', location: '北侧管廊区', pipeline_name: '原料气管线', medium: '天然气' },
  { plate_no: 'BP-002', location: '南侧管廊区', pipeline_name: '放空管线', medium: '压缩空气' },
  { plate_no: 'BP-003', location: '储罐区A', pipeline_name: '进料管线', medium: '柴油' },
]

const defaultResponsiblePersons = [
  { role: ROLES.CONTRACTOR, person_name: '张三', person_id: 'C001' },
  { role: ROLES.TERRITORY_MANAGER, person_name: '李四', person_id: 'T001' },
  { role: ROLES.SAFETY_GUARDIAN, person_name: '王五', person_id: 'S001' },
]

const defaultAdjacentPipelines = [
  {
    pipeline_name: '相邻进料管道A',
    location: '动火点东侧5米',
    medium: '柴油',
    pressure_status: 'normal',
    has_leak: false,
    remark: '正常运行中，无泄漏',
  },
  {
    pipeline_name: '相邻放空管道B',
    location: '动火点南侧3米',
    medium: '废气',
    pressure_status: 'depressurized',
    has_leak: false,
    remark: '已泄压隔离',
  },
]

function TicketCreate() {
  const [form] = Form.useForm()
  const navigate = useNavigate()
  const { currentUser } = useAppStore()
  const [blindPlates, setBlindPlates] = useState(defaultBlindPlates)
  const [adjacentPipelines, setAdjacentPipelines] = useState(defaultAdjacentPipelines)
  const [persons, setPersons] = useState(defaultResponsiblePersons)
  const [plateModal, setPlateModal] = useState(false)
  const [pipelineModal, setPipelineModal] = useState(false)
  const [personModal, setPersonModal] = useState(false)
  const [plateForm] = Form.useForm()
  const [pipelineForm] = Form.useForm()
  const [personForm] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (blindPlates.length === 0) {
        message.error('请至少添加一块隔离盲板')
        return
      }

      setSubmitting(true)
      const res = await ticketApi.create({
        ...values,
        start_time: values.work_time[0].toISOString(),
        end_time: values.work_time[1].toISOString(),
        created_by: currentUser,
        blind_plates: blindPlates,
        adjacent_pipelines: adjacentPipelines,
        responsible_persons: persons,
      })
      message.success('作业票创建成功')
      navigate(`/tickets/${res.data.id}`)
    } catch (e) {
      message.error(e.response?.data?.error || '创建失败，请检查表单')
    } finally {
      setSubmitting(false)
    }
  }

  const plateColumns = [
    { title: '盲板编号', dataIndex: 'plate_no', width: 120 },
    { title: '位置', dataIndex: 'location' },
    { title: '管线名称', dataIndex: 'pipeline_name' },
    { title: '介质', dataIndex: 'medium' },
    {
      title: '操作', width: 80,
      render: (_, __, i) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
          setBlindPlates(prev => prev.filter((_, idx) => idx !== i))
        }}>删除</Button>
      ),
    },
  ]

  const pipelineColumns = [
    { title: '管线名称', dataIndex: 'pipeline_name', width: 160 },
    { title: '位置', dataIndex: 'location', width: 140 },
    { title: '介质', dataIndex: 'medium', width: 120 },
    {
      title: '压力状态', dataIndex: 'pressure_status', width: 120,
      render: v => PRESSURE_STATUS_OPTIONS.find(o => o.value === v)?.label || v,
    },
    {
      title: '是否泄漏', dataIndex: 'has_leak', width: 100,
      render: v => <Tag color={v ? 'red' : 'green'}>{v ? '是' : '否'}</Tag>,
    },
    { title: '备注', dataIndex: 'remark' },
    {
      title: '操作', width: 80,
      render: (_, __, i) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
          setAdjacentPipelines(prev => prev.filter((_, idx) => idx !== i))
        }}>删除</Button>
      ),
    },
  ]

  const personColumns = [
    {
      title: '角色', dataIndex: 'role', width: 140,
      render: v => <Tag color="blue">{ROLE_NAMES[v]}</Tag>,
    },
    { title: '姓名', dataIndex: 'person_name', width: 150 },
    { title: '编号', dataIndex: 'person_id' },
    {
      title: '操作', width: 80,
      render: (_, __, i) => (
        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => {
          setPersons(prev => prev.filter((_, idx) => idx !== i))
        }}>删除</Button>
      ),
    },
  ]

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2><FireOutlined /> 创建动火作业票</h2>
          <p style={{ color: '#666', marginTop: 4 }}>填写动火作业信息、隔离盲板和责任人</p>
        </div>
        <Space>
          <Button onClick={() => navigate('/tickets')}>取消</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={submitting} onClick={handleSubmit}>
            提交作业票
          </Button>
        </Space>
      </div>

      <Card className="page-card" title="基本信息" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Form.Item label="承包商" name="contractor" rules={[{ required: true, message: '请输入承包商名称' }]}>
                <Input placeholder="请输入承包商名称" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="承包商负责人" name="contractor_leader" rules={[{ required: true, message: '请输入负责人' }]}>
                <Input placeholder="请输入负责人姓名" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="动火点" name="hot_work_point" rules={[{ required: true, message: '请输入动火点' }]}>
                <Input placeholder="如：一号反应釜顶部法兰处" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="作业区域" name="hot_work_location" rules={[{ required: true, message: '请输入作业区域' }]}>
                <Input placeholder="如：化工生产区A区" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item label="作业类型" name="work_type" rules={[{ required: true, message: '请选择作业类型' }]}>
                <Select placeholder="请选择作业类型">
                  {WORK_TYPES.map(t => <Option key={t} value={t}>{t}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                label="施工时段"
                name="work_time"
                rules={[{ required: true, message: '请选择施工时段' }]}
              >
                <DatePicker.RangePicker
                  showTime={{ format: 'HH:mm' }}
                  format="YYYY-MM-DD HH:mm"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
          <Divider>检测参数</Divider>
          <Row gutter={24}>
            <Col xs={24} md={8}>
              <Form.Item label="复测间隔(分钟)" name="retest_interval" initialValue={30}>
                <InputNumber min={5} max={120} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item label="可燃气体上限(%LEL)" name="combustible_limit" initialValue={0.5}>
                <InputNumber min={0.1} max={100} step={0.1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item label="氧含量下限(%)" name="oxygen_min" initialValue={19.5} style={{ flex: 1 }}>
                  <InputNumber min={0} max={30} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item label="上限(%)" name="oxygen_max" initialValue={23.5} style={{ flex: 1 }}>
                  <InputNumber min={0} max={30} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
              </div>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card
        className="page-card"
        title="隔离盲板清单"
        style={{ marginBottom: 16, border: '2px solid #fa8c16' }}
        extra={<Button icon={<PlusOutlined />} onClick={() => setPlateModal(true)}>添加盲板</Button>}
      >
        <Table
          columns={plateColumns}
          dataSource={blindPlates}
          rowKey="plate_no"
          pagination={false}
          size="middle"
        />
      </Card>

      <Card
        className="page-card"
        title={<span><AlertOutlined /> 相邻管线清单</span>}
        style={{ marginBottom: 16, border: '2px solid #1890ff' }}
        extra={<Button icon={<PlusOutlined />} onClick={() => setPipelineModal(true)}>添加管线</Button>}
      >
        <p style={{ color: '#666', marginBottom: 12 }}>
          请列出所有与动火作业相关的相邻管线，包括运行中和已停运的管线。属地负责人需逐项确认管线压力状态和是否有泄漏。
        </p>
        <Table
          columns={pipelineColumns}
          dataSource={adjacentPipelines}
          rowKey={(r, i) => `${r.pipeline_name}_${i}`}
          pagination={false}
          size="middle"
        />
      </Card>

      <Card
        className="page-card"
        title={<span><UserOutlined /> 责任人清单</span>}
        extra={<Button icon={<PlusOutlined />} onClick={() => setPersonModal(true)}>添加责任人</Button>}
      >
        <Table
          columns={personColumns}
          dataSource={persons}
          rowKey={(r, i) => `${r.role}_${i}`}
          pagination={false}
          size="middle"
        />
      </Card>

      <Modal
        title="添加隔离盲板"
        open={plateModal}
        onCancel={() => setPlateModal(false)}
        onOk={async () => {
          const vals = await plateForm.validateFields()
          setBlindPlates(prev => [...prev, vals])
          plateForm.resetFields()
          setPlateModal(false)
        }}
      >
        <Form form={plateForm} layout="vertical">
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

      <Modal
        title="添加相邻管线"
        open={pipelineModal}
        onCancel={() => setPipelineModal(false)}
        onOk={async () => {
          const vals = await pipelineForm.validateFields()
          setAdjacentPipelines(prev => [...prev, {
            ...vals,
            has_leak: vals.has_leak === 1,
          }])
          pipelineForm.resetFields()
          setPipelineModal(false)
        }}
        width={600}
      >
        <Form form={pipelineForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="管线名称" name="pipeline_name" rules={[{ required: true }]}>
                <Input placeholder="如：相邻进料管道A" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="位置" name="location" rules={[{ required: true }]}>
                <Input placeholder="如：动火点东侧5米" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="介质" name="medium" rules={[{ required: true }]}>
                <Input placeholder="如：柴油、天然气" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="压力状态" name="pressure_status" initialValue="normal" rules={[{ required: true }]}>
                <Select>
                  {PRESSURE_STATUS_OPTIONS.map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item label="是否有泄漏" name="has_leak" initialValue={0} rules={[{ required: true }]}>
            <Select>
              <Option value={0}>无泄漏</Option>
              <Option value={1}>有泄漏</Option>
            </Select>
          </Form.Item>
          <Form.Item label="备注" name="remark">
            <TextArea rows={2} placeholder="请输入管线状态说明" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="添加责任人"
        open={personModal}
        onCancel={() => setPersonModal(false)}
        onOk={async () => {
          const vals = await personForm.validateFields()
          setPersons(prev => [...prev, vals])
          personForm.resetFields()
          setPersonModal(false)
        }}
      >
        <Form form={personForm} layout="vertical">
          <Form.Item label="角色" name="role" rules={[{ required: true }]}>
            <Select>
              {Object.entries(ROLE_NAMES).map(([k, v]) => <Option key={k} value={k}>{v}</Option>)}
            </Select>
          </Form.Item>
          <Form.Item label="姓名" name="person_name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item label="人员编号" name="person_id" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default TicketCreate
