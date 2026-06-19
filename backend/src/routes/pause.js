const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

router.get('/ticket/:ticketId', (req, res) => {
  const records = db.prepare(`
    SELECT * FROM pause_records
    WHERE ticket_id = ? ORDER BY created_at DESC
  `).all(req.params.ticketId);

  res.json(records);
});

router.post('/ticket/:ticketId/pause', (req, res) => {
  const { pause_type = 'manual', pause_reason, paused_by } = req.body;

  if (!pause_reason) {
    return res.status(400).json({ error: '暂停原因为必填项' });
  }

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  const id = uuidv4();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO pause_records (
        id, ticket_id, pause_type, pause_reason, paused_by
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      id, req.params.ticketId, pause_type, pause_reason,
      paused_by || 'safety_guardian_user'
    );

    db.prepare(`
      UPDATE work_tickets SET
        status = 'paused',
        paused_at = CURRENT_TIMESTAMP,
        pause_reason = ?
      WHERE id = ?
    `).run(pause_reason, req.params.ticketId);

    db.prepare(`
      INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.params.ticketId, 'pause_work',
      paused_by || 'safety_guardian_user', 'safety_guardian',
      `暂停作业：${pause_reason}`
    );
  });

  tx();

  const record = db.prepare('SELECT * FROM pause_records WHERE id = ?').get(id);
  const updatedTicket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);

  res.json({ record, ticket_status: updatedTicket.status });
});

router.post('/ticket/:ticketId/resume', (req, res) => {
  const { resumed_by, resume_remark } = req.body;

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  const unconfirmed = db.prepare(`
    SELECT COUNT(*) as count FROM isolation_blind_plates
    WHERE ticket_id = ? AND installed = 0
  `).get(req.params.ticketId);

  if (unconfirmed.count > 0) {
    return res.status(400).json({ error: '隔离盲板未确认，无法恢复作业' });
  }

  const latestDetection = db.prepare(`
    SELECT * FROM gas_detections WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 1
  `).get(req.params.ticketId);

  if (!latestDetection || !latestDetection.is_qualified) {
    return res.status(400).json({
      error: latestDetection ? '最近一次气体检测不合格，需重新检测合格后方可恢复' : '尚未进行气体检测'
    });
  }

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE pause_records SET
        resumed_at = CURRENT_TIMESTAMP,
        resumed_by = ?,
        resume_remark = ?
      WHERE ticket_id = ? AND resumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).run(resumed_by || 'safety_guardian_user', resume_remark || '', req.params.ticketId);

    db.prepare(`
      UPDATE work_tickets SET
        status = 'ready',
        paused_at = NULL,
        pause_reason = NULL
      WHERE id = ?
    `).run(req.params.ticketId);

    db.prepare(`
      INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.params.ticketId, 'resume_work',
      resumed_by || 'safety_guardian_user', 'safety_guardian',
      `恢复作业${resume_remark ? ': ' + resume_remark : ''}`
    );
  });

  tx();

  const updatedTicket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);
  res.json({ ticket_status: updatedTicket.status });
});

router.get('/active/list', (req, res) => {
  const pausedTickets = db.prepare(`
    SELECT
      t.id,
      t.ticket_no,
      t.contractor,
      t.hot_work_point,
      t.paused_at,
      t.pause_reason,
      t.status,
      (SELECT COUNT(*) FROM pause_records p WHERE p.ticket_id = t.id AND p.resumed_at IS NULL) as active_pause_count
    FROM work_tickets t
    WHERE t.status = 'paused'
    ORDER BY t.paused_at DESC
  `).all();

  res.json(pausedTickets);
});

module.exports = router;
