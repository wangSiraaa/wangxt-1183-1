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
        status, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  const responsiblePersons = db.prepare(
    'SELECT * FROM responsible_persons WHERE ticket_id = ? ORDER BY created_at'
  ).all(id);

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(id);

  res.status(201).json({
    ...ticket,
    blindPlates,
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

  if (!ticket.gas_qualified_at) {
    return res.status(400).json({ error: '气体检测未合格，无法开具作业票' });
  }

  db.prepare(`
    UPDATE work_tickets SET
      status = ?,
      issued_at = CURRENT_TIMESTAMP,
      issued_by = ?
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

  const unconfirmedCount = unconfirmedPlates.length;

  const latestDetection = db.prepare(`
    SELECT * FROM gas_detections WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id);

  let canIssue = true;
  let reasons = [];
  let isPaused = ticket.status === TICKET_STATUS.PAUSED;
  let isLocked = false;
  let retestLocked = false;
  let lockReason = null;
  let overdueMinutes = 0;

  if (unconfirmedCount > 0) {
    canIssue = false;
    reasons.push(`隔离盲板未确认: ${unconfirmedPlates.map(p => p.plate_no).join(', ')}`);
  }

  const gasQualified = !!(latestDetection && latestDetection.is_qualified);
  if (!gasQualified) {
    canIssue = false;
    reasons.push(latestDetection ? '最近一次气体检测不合格' : '尚未进行气体检测');
  }

  if (ticket.status === TICKET_STATUS.IN_PROGRESS && latestDetection) {
    const now = Date.now();
    const detectionTime = new Date(latestDetection.created_at).getTime();
    const interval = (now - detectionTime) / (1000 * 60);
    const maxInterval = ticket.retest_interval || 30;
    overdueMinutes = Math.max(0, Math.round(interval - maxInterval));

    if (interval > maxInterval) {
      isLocked = true;
      retestLocked = true;
      lockReason = `已超过复测间隔 ${overdueMinutes} 分钟，请立即进行气体复测`;
      db.prepare(`
        UPDATE work_tickets SET locked_reason = ? WHERE id = ?
      `).run(lockReason, req.params.id);
    }
  }

  res.json({
    canIssue,
    can_issue: canIssue,
    can_resume: !isLocked && !isPaused && gasQualified,
    isPaused,
    isLocked,
    retest_locked: retestLocked,
    reasons,
    lockReason: lockReason || ticket.locked_reason,
    ticketStatus: ticket.status,
    isolation_ready: unconfirmedCount === 0,
    unconfirmed_plate_count: unconfirmedCount,
    gas_qualified: gasQualified,
    overdue_minutes: overdueMinutes
  });
});

module.exports = router;
