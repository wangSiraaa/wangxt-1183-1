const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

const TICKET_STATUS = {
  DRAFT: 'draft',
  PENDING_ISOLATION: 'pending_isolation',
  PENDING_DETECTION: 'pending_detection',
  READY: 'ready',
  IN_PROGRESS: 'in_progress',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

function generateTicketNo() {
  const date = new Date();
  const dateStr = date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `DH${dateStr}${random}`;
}

router.get('/', (req, res) => {
  const { status, contractor } = req.query;
  let sql = 'SELECT * FROM work_tickets WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (contractor) {
    sql += ' AND contractor LIKE ?';
    params.push(`%${contractor}%`);
  }
  sql += ' ORDER BY created_at DESC';

  const tickets = db.prepare(sql).all(...params);
  res.json(tickets);
});

router.get('/:id', (req, res) => {
  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  const blindPlates = db.prepare(
    'SELECT * FROM isolation_blind_plates WHERE ticket_id = ? ORDER BY created_at'
  ).all(req.params.id);

  const adjacentPipelines = db.prepare(
    'SELECT * FROM adjacent_pipelines WHERE ticket_id = ? ORDER BY created_at'
  ).all(req.params.id);

  const detections = db.prepare(
    'SELECT * FROM gas_detections WHERE ticket_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  const responsiblePersons = db.prepare(
    'SELECT * FROM responsible_persons WHERE ticket_id = ? ORDER BY created_at'
  ).all(req.params.id);

  const pauseRecords = db.prepare(
    'SELECT * FROM pause_records WHERE ticket_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);

  res.json({
    ...ticket,
    blindPlates,
    adjacentPipelines,
    detections,
    responsiblePersons,
    pauseRecords
  });
});

router.post('/', (req, res) => {
  const {
    contractor,
    contractor_leader,
    hot_work_point,
    hot_work_location,
    work_type,
    start_time,
    end_time,
    retest_interval = 30,
    combustible_limit = 0.5,
    oxygen_min = 19.5,
    oxygen_max = 23.5,
    created_by,
    blind_plates = [],
    adjacent_pipelines = [],
    responsible_persons = []
  } = req.body;

  if (!contractor || !hot_work_point || !start_time || !end_time) {
    return res.status(400).json({ error: '承包商、动火点、施工时段为必填项' });
  }

  const id = uuidv4();
  const ticketNo = generateTicketNo();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO work_tickets (
        id, ticket_no, contractor, contractor_leader, hot_work_point,
        hot_work_location, work_type, start_time, end_time,
        retest_interval, combustible_limit, oxygen_min, oxygen_max,
        status, created_by, is_locked
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id, ticketNo, contractor, contractor_leader, hot_work_point,
      hot_work_location, work_type, start_time, end_time,
      retest_interval, combustible_limit, oxygen_min, oxygen_max,
      TICKET_STATUS.PENDING_ISOLATION, created_by || 'contractor_user'
    );

    const insertPlate = db.prepare(`
      INSERT INTO isolation_blind_plates (
        id, ticket_id, plate_no, location, pipeline_name, medium
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    blind_plates.forEach(plate => {
      insertPlate.run(
        uuidv4(), id, plate.plate_no, plate.location,
        plate.pipeline_name, plate.medium || ''
      );
      db.prepare(`
        UPDATE isolation_blind_plates SET installed = 0 WHERE ticket_id = ? AND plate_no = ?
      `).run(id, plate.plate_no);
    });

    const insertPipeline = db.prepare(`
      INSERT INTO adjacent_pipelines (
        id, ticket_id, pipeline_name, location, medium,
        pressure, distance, pressure_status, has_leak, confirmed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', 0, 0)
    `);
    adjacent_pipelines.forEach(pipeline => {
      insertPipeline.run(
        uuidv4(), id, pipeline.pipeline_name, pipeline.location,
        pipeline.medium || '', pipeline.pressure || null, pipeline.distance || null
      );
    });

    const insertPerson = db.prepare(`
      INSERT INTO responsible_persons (
        id, ticket_id, role, person_name, person_id
      ) VALUES (?, ?, ?, ?, ?)
    `);
    responsible_persons.forEach(person => {
      insertPerson.run(uuidv4(), id, person.role, person.person_name, person.person_id);
    });

    db.prepare(`
      INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), id, 'create_ticket', created_by || 'contractor_user', 'contractor',
      `创建动火作业票 ${ticketNo}`);
  });

  tx();

  const blindPlates = db.prepare(
    'SELECT * FROM isolation_blind_plates WHERE ticket_id = ? ORDER BY created_at'
  ).all(id);

  const adjacentPipelines = db.prepare(
    'SELECT * FROM adjacent_pipelines WHERE ticket_id = ? ORDER BY created_at'
  ).all(id);

  const responsiblePersons = db.prepare(
    'SELECT * FROM responsible_persons WHERE ticket_id = ? ORDER BY created_at'
  ).all(id);

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(id);

  res.status(201).json({
    ...ticket,
    blindPlates,
    adjacentPipelines,
    detections: [],
    responsiblePersons,
    pauseRecords: []
  });
});

router.post('/:id/issue', (req, res) => {
  const { issued_by } = req.body;
  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);

  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  if (ticket.is_locked) {
    return res.status(400).json({
      error: '作业票已锁定，请先解除锁定',
      lock_reason: ticket.lock_reason
    });
  }

  const unconfirmedPlates = db.prepare(`
    SELECT COUNT(*) as count FROM isolation_blind_plates
    WHERE ticket_id = ? AND installed = 0
  `).get(req.params.id);

  if (unconfirmedPlates.count > 0) {
    return res.status(400).json({
      error: '隔离盲板未全部确认安装，无法开具作业票',
      unconfirmedCount: unconfirmedPlates.count
    });
  }

  const unconfirmedPipelines = db.prepare(`
    SELECT COUNT(*) as count FROM adjacent_pipelines
    WHERE ticket_id = ? AND confirmed = 0
  `).get(req.params.id);

  if (unconfirmedPipelines.count > 0) {
    return res.status(400).json({
      error: '相邻管线未全部确认状态，无法开具作业票',
      unconfirmedPipelineCount: unconfirmedPipelines.count
    });
  }

  if (!ticket.gas_qualified_at) {
    return res.status(400).json({ error: '气体检测未合格，无法开具作业票' });
  }

  db.prepare(`
    UPDATE work_tickets SET
      status = ?,
      issued_at = CURRENT_TIMESTAMP,
      issued_by = ?,
      last_retest_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(TICKET_STATUS.IN_PROGRESS, issued_by || 'admin', req.params.id);

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), req.params.id, 'issue_ticket', issued_by || 'admin', 'admin',
    `开具动火作业票 ${ticket.ticket_no}`);

  const updated = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.post('/:id/complete', (req, res) => {
  const { completed_by } = req.body;
  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);

  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  db.prepare(`
    UPDATE work_tickets SET
      status = ?,
      completed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(TICKET_STATUS.COMPLETED, req.params.id);

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), req.params.id, 'complete_ticket', completed_by || 'admin', 'admin',
    `完成动火作业票 ${ticket.ticket_no}`);

  const updated = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  res.json(updated);
});

router.get('/:id/check-interlock', (req, res) => {
  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  const unconfirmedPlates = db.prepare(`
    SELECT * FROM isolation_blind_plates WHERE ticket_id = ? AND installed = 0
  `).all(req.params.id);

  const unconfirmedPipelines = db.prepare(`
    SELECT * FROM adjacent_pipelines WHERE ticket_id = ? AND confirmed = 0
  `).all(req.params.id);

  const unconfirmedCount = unconfirmedPlates.length;
  const unconfirmedPipelineCount = unconfirmedPipelines.length;

  const latestDetection = db.prepare(`
    SELECT * FROM gas_detections WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id);

  let canIssue = true;
  let reasons = [];
  let isPaused = ticket.status === TICKET_STATUS.PAUSED;
  let isLocked = ticket.is_locked === 1;
  let retestLocked = false;
  let lockReason = ticket.lock_reason;
  let overdueMinutes = 0;

  if (unconfirmedCount > 0) {
    canIssue = false;
    reasons.push(`隔离盲板未确认: ${unconfirmedPlates.map(p => p.plate_no).join(', ')}`);
  }

  if (unconfirmedPipelineCount > 0) {
    canIssue = false;
    reasons.push(`相邻管线未确认: ${unconfirmedPipelines.map(p => p.pipeline_name).join(', ')}`);
  }

  const gasQualified = !!(latestDetection && latestDetection.is_qualified);
  if (!gasQualified) {
    canIssue = false;
    reasons.push(latestDetection ? '最近一次气体检测不合格' : '尚未进行气体检测');
  }

  if (isLocked) {
    reasons.push(`作业已锁定: ${lockReason || '请联系管理员'}`);
  }

  if ((ticket.status === TICKET_STATUS.IN_PROGRESS || ticket.status === TICKET_STATUS.READY) && latestDetection) {
    const now = Date.now();
    const detectionTime = new Date(latestDetection.created_at).getTime();
    const interval = (now - detectionTime) / (1000 * 60);
    const maxInterval = ticket.retest_interval || 30;
    overdueMinutes = Math.max(0, Math.round(interval - maxInterval));

    if (interval > maxInterval && !isLocked) {
      isLocked = true;
      retestLocked = true;
      lockReason = `已超过复测间隔 ${overdueMinutes} 分钟，请立即进行气体复测`;
      db.prepare(`
        UPDATE work_tickets SET
          is_locked = 1,
          lock_type = 'retest_timeout',
          lock_reason = ?,
          locked_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(lockReason, req.params.id);
    }
  }

  res.json({
    canIssue,
    can_issue: canIssue,
    can_resume: !isLocked && !isPaused && gasQualified && unconfirmedCount === 0 && unconfirmedPipelineCount === 0,
    isPaused,
    isLocked,
    retest_locked: retestLocked,
    lock_type: ticket.lock_type,
    reasons,
    lockReason: lockReason,
    ticketStatus: ticket.status,
    isolation_ready: unconfirmedCount === 0,
    pipeline_ready: unconfirmedPipelineCount === 0,
    unconfirmed_plate_count: unconfirmedCount,
    unconfirmed_pipeline_count: unconfirmedPipelineCount,
    gas_qualified: gasQualified,
    overdue_minutes: overdueMinutes,
    locked_at: ticket.locked_at,
    resume_confirmed_by: ticket.resume_confirmed_by,
    resume_confirmed_at: ticket.resume_confirmed_at
  });
});

router.post('/:id/confirm-resume', (req, res) => {
  const { confirmed_by, resume_remark } = req.body;

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  if (!ticket.is_locked) {
    return res.status(400).json({ error: '作业票未锁定，无需确认复工' });
  }

  const latestDetection = db.prepare(`
    SELECT * FROM gas_detections WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id);

  if (!latestDetection || !latestDetection.is_qualified) {
    return res.status(400).json({
      error: latestDetection ? '最近一次气体检测不合格，请先复测合格' : '尚未进行气体检测'
    });
  }

  const unconfirmedPlates = db.prepare(`
    SELECT COUNT(*) as count FROM isolation_blind_plates
    WHERE ticket_id = ? AND installed = 0
  `).get(req.params.id);

  if (unconfirmedPlates.count > 0) {
    return res.status(400).json({ error: '隔离盲板未全部确认' });
  }

  const unconfirmedPipelines = db.prepare(`
    SELECT COUNT(*) as count FROM adjacent_pipelines
    WHERE ticket_id = ? AND confirmed = 0
  `).get(req.params.id);

  if (unconfirmedPipelines.count > 0) {
    return res.status(400).json({ error: '相邻管线未全部确认' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE work_tickets SET
        is_locked = 0,
        lock_type = NULL,
        lock_reason = NULL,
        locked_at = NULL,
        status = 'in_progress',
        last_retest_at = CURRENT_TIMESTAMP,
        resume_confirmed_by = ?,
        resume_confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(confirmed_by || 'safety_guardian_user', req.params.id);

    const activePause = db.prepare(`
      SELECT * FROM pause_records
      WHERE ticket_id = ? AND resumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(req.params.id);

    if (activePause) {
      db.prepare(`
        UPDATE pause_records SET
          resumed_at = CURRENT_TIMESTAMP,
          resumed_by = ?,
          resume_remark = ?,
          resume_confirmed_by = ?,
          resume_confirmed_at = CURRENT_TIMESTAMP,
          retest_detection_id = ?
        WHERE id = ?
      `).run(
        confirmed_by || 'safety_guardian_user',
        resume_remark || '复测合格，确认复工',
        confirmed_by || 'safety_guardian_user',
        latestDetection.id,
        activePause.id
      );
    }

    db.prepare(`
      INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.params.id, 'confirm_resume',
      confirmed_by || 'safety_guardian_user', 'safety_guardian',
      `复测合格，确认复工${resume_remark ? ': ' + resume_remark : ''}`
    );
  });

  tx();

  const updated = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  res.json({
    ticket_status: updated.status,
    is_locked: updated.is_locked,
    message: '复工确认成功，作业已恢复进行'
  });
});

router.post('/:id/unlock', (req, res) => {
  const { unlocked_by, unlock_remark } = req.body;

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE work_tickets SET
        is_locked = 0,
        lock_type = NULL,
        lock_reason = NULL,
        locked_at = NULL
      WHERE id = ?
    `).run(req.params.id);

    db.prepare(`
      INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.params.id, 'unlock_ticket',
      unlocked_by || 'admin', 'admin',
      `人工解锁作业票${unlock_remark ? ': ' + unlock_remark : ''}`
    );
  });

  tx();

  const updated = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.id);
  res.json({
    ticket_status: updated.status,
    is_locked: updated.is_locked,
    message: '作业票已解锁'
  });
});

module.exports = router;
