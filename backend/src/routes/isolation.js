const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

router.get('/ticket/:ticketId', (req, res) => {
  const plates = db.prepare(`
    SELECT * FROM isolation_blind_plates
    WHERE ticket_id = ? ORDER BY created_at
  `).all(req.params.ticketId);

  res.json(plates);
});

router.post('/:plateId/confirm-install', (req, res) => {
  const { confirmed_by } = req.body;

  const plate = db.prepare('SELECT * FROM isolation_blind_plates WHERE id = ?').get(req.params.plateId);
  if (!plate) {
    return res.status(404).json({ error: '盲板不存在' });
  }

  db.prepare(`
    UPDATE isolation_blind_plates SET
      installed = 1,
      confirmed_by = ?,
      confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(confirmed_by || 'territory_manager', req.params.plateId);

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(plate.ticket_id);
  const remainingPlates = db.prepare(`
    SELECT COUNT(*) as count FROM isolation_blind_plates
    WHERE ticket_id = ? AND installed = 0
  `).get(plate.ticket_id);

  const remainingPipelines = db.prepare(`
    SELECT COUNT(*) as count FROM adjacent_pipelines
    WHERE ticket_id = ? AND confirmed = 0
  `).get(plate.ticket_id);

  if (remainingPlates.count === 0 && remainingPipelines.count === 0 && ticket.status === 'pending_isolation') {
    db.prepare(`
      UPDATE work_tickets SET
        status = 'pending_detection',
        isolation_confirmed_at = CURRENT_TIMESTAMP,
        isolation_confirmed_by = ?,
        pipeline_confirmed_at = CURRENT_TIMESTAMP,
        pipeline_confirmed_by = ?
      WHERE id = ?
    `).run(confirmed_by || 'territory_manager', confirmed_by || 'territory_manager', plate.ticket_id);
  } else if (remainingPlates.count === 0 && ticket.status === 'pending_isolation') {
    db.prepare(`
      UPDATE work_tickets SET
        isolation_confirmed_at = CURRENT_TIMESTAMP,
        isolation_confirmed_by = ?
      WHERE id = ?
    `).run(confirmed_by || 'territory_manager', plate.ticket_id);
  }

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), plate.ticket_id, 'confirm_blind_plate',
    confirmed_by || 'territory_manager', 'territory_manager',
    `确认盲板 ${plate.plate_no} 已安装`);

  const updatedPlate = db.prepare('SELECT * FROM isolation_blind_plates WHERE id = ?').get(req.params.plateId);
  res.json(updatedPlate);
});

router.post('/:plateId/confirm-remove', (req, res) => {
  const { confirmed_by } = req.body;

  const plate = db.prepare('SELECT * FROM isolation_blind_plates WHERE id = ?').get(req.params.plateId);
  if (!plate) {
    return res.status(404).json({ error: '盲板不存在' });
  }

  db.prepare(`
    UPDATE isolation_blind_plates SET removed = 1 WHERE id = ?
  `).run(req.params.plateId);

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), plate.ticket_id, 'remove_blind_plate',
    confirmed_by || 'territory_manager', 'territory_manager',
    `确认盲板 ${plate.plate_no} 已拆除`);

  const updatedPlate = db.prepare('SELECT * FROM isolation_blind_plates WHERE id = ?').get(req.params.plateId);
  res.json(updatedPlate);
});

router.post('/ticket/:ticketId/add-plate', (req, res) => {
  const { plate_no, location, pipeline_name, medium } = req.body;

  if (!plate_no || !location || !pipeline_name) {
    return res.status(400).json({ error: '盲板编号、位置、管线名称为必填项' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO isolation_blind_plates (
      id, ticket_id, plate_no, location, pipeline_name, medium
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, req.params.ticketId, plate_no, location, pipeline_name, medium || '');

  const plate = db.prepare('SELECT * FROM isolation_blind_plates WHERE id = ?').get(id);
  res.status(201).json(plate);
});

module.exports = router;
