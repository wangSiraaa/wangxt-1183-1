const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

router.get('/ticket/:ticketId', (req, res) => {
  const detections = db.prepare(`
    SELECT * FROM gas_detections
    WHERE ticket_id = ? ORDER BY created_at DESC
  `).all(req.params.ticketId);

  res.json(detections);
});

router.get('/ticket/:ticketId/curve', (req, res) => {
  const detections = db.prepare(`
    SELECT
      id,
      created_at,
      detection_point,
      combustible_content,
      oxygen_content,
      is_qualified,
      detector
    FROM gas_detections
    WHERE ticket_id = ? ORDER BY created_at ASC
  `).all(req.params.ticketId);

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);

  const timeline = detections.map(d => ({
    time: d.created_at,
    combustible: d.combustible_content,
    oxygen: d.oxygen_content,
    point: d.detection_point,
    qualified: d.is_qualified === 1 || d.is_qualified === true
  }));

  res.json({
    ticket_no: ticket.ticket_no,
    limits: {
      combustible_limit: ticket.combustible_limit,
      oxygen_min: ticket.oxygen_min,
      oxygen_max: ticket.oxygen_max
    },
    retest_interval: ticket.retest_interval,
    timeline,
    total_count: detections.length,
    qualified_count: detections.filter(d => d.is_qualified === 1 || d.is_qualified === true).length
  });
});

router.post('/ticket/:ticketId', (req, res) => {
  const {
    detection_point,
    detectionPoint,
    combustible_content,
    combustible_gas,
    oxygen_content,
    detector,
    detector_name,
    detector_role = 'safety_guardian',
    remark
  } = req.body;

  const point = detection_point || detectionPoint || '默认检测点';
  const combustible = combustible_content !== undefined ? combustible_content : combustible_gas;
  const oxygen = oxygen_content;
  const detectorName = detector_name || detector;

  if (combustible === undefined || oxygen === undefined) {
    return res.status(400).json({ error: '可燃气体含量、氧含量为必填项' });
  }

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);
  if (!ticket) {
    return res.status(404).json({ error: '作业票不存在' });
  }

  const isQualified =
    combustible < ticket.combustible_limit &&
    oxygen >= ticket.oxygen_min &&
    oxygen <= ticket.oxygen_max;

  const id = uuidv4();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO gas_detections (
        id, ticket_id, detection_point, combustible_content,
        oxygen_content, detector, detector_role, is_qualified, remark
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, req.params.ticketId, point,
      parseFloat(combustible),
      parseFloat(oxygen),
      detectorName || detector || 'safety_guardian_user',
      detector_role,
      isQualified ? 1 : 0,
      remark || ''
    );

    if (isQualified) {
      db.prepare(`
        UPDATE work_tickets SET
          gas_qualified_at = CURRENT_TIMESTAMP,
          gas_qualified_by = ?,
          locked_reason = NULL
        WHERE id = ?
      `).run(detectorName || detector || 'safety_guardian_user', req.params.ticketId);

      if (ticket.status === 'pending_detection') {
        const unconfirmed = db.prepare(`
          SELECT COUNT(*) as count FROM isolation_blind_plates
          WHERE ticket_id = ? AND installed = 0
        `).get(req.params.ticketId);

        if (unconfirmed.count === 0) {
          db.prepare(`UPDATE work_tickets SET status = 'ready' WHERE id = ?`).run(req.params.ticketId);
        }
      }

      if (ticket.status === 'paused' || ticket.status === 'in_progress') {
        db.prepare(`UPDATE work_tickets SET status = 'ready' WHERE id = ?`).run(req.params.ticketId);
      }
    }

    if (!isQualified && (ticket.status === 'in_progress' || ticket.status === 'ready')) {
      db.prepare(`
        UPDATE work_tickets SET
          status = 'paused',
          paused_at = CURRENT_TIMESTAMP,
          pause_reason = ?
        WHERE id = ?
      `).run('气体检测超限自动暂停', req.params.ticketId);

      db.prepare(`
        INSERT INTO pause_records (
          id, ticket_id, pause_type, pause_reason, paused_by
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        uuidv4(), req.params.ticketId,
        'auto_gas_exceed',
        `气体检测超限：可燃 ${combustible}% LEL / 氧 ${oxygen}%`,
        'system'
      );
    }

    db.prepare(`
      INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      uuidv4(), req.params.ticketId, 'gas_detection',
      detectorName || detector || 'safety_guardian_user', detector_role,
      `气体检测：${point} 可燃${combustible}% 氧${oxygen}% ${isQualified ? '合格' : '不合格'}`
    );
  });

  tx();

  const detection = db.prepare('SELECT * FROM gas_detections WHERE id = ?').get(id);
  const updatedTicket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(req.params.ticketId);

  res.status(201).json({
    detection,
    ticket_status: updatedTicket.status,
    is_qualified: isQualified,
    auto_paused: !isQualified && (ticket.status === 'in_progress' || ticket.status === 'ready'),
    ticket_id: ticket.id
  });
});

module.exports = router;
