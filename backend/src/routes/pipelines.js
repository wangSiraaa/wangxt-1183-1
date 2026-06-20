const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');

const router = express.Router();

router.get('/ticket/:ticketId', (req, res) => {
  const pipelines = db.prepare(`
    SELECT * FROM adjacent_pipelines
    WHERE ticket_id = ? ORDER BY created_at
  `).all(req.params.ticketId);

  res.json(pipelines);
});

router.post('/ticket/:ticketId/add', (req, res) => {
  const { pipeline_name, location, medium, pressure, distance } = req.body;

  if (!pipeline_name || !location) {
    return res.status(400).json({ error: '管线名称、位置为必填项' });
  }

  const id = uuidv4();
  db.prepare(`
    INSERT INTO adjacent_pipelines (
      id, ticket_id, pipeline_name, location, medium,
      pressure, distance, pressure_status, has_leak, confirmed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'normal', 0, 0)
  `).run(
    id, req.params.ticketId, pipeline_name, location, medium || '',
    pressure || null, distance || null
  );

  const pipeline = db.prepare('SELECT * FROM adjacent_pipelines WHERE id = ?').get(id);

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), req.params.ticketId, 'add_adjacent_pipeline',
    req.body.added_by || 'contractor_user', 'contractor',
    `添加相邻管线：${pipeline_name}`);

  res.status(201).json(pipeline);
});

router.post('/:pipelineId/confirm', (req, res) => {
  const { confirmed_by, pressure_status, has_leak, remark } = req.body;

  const pipeline = db.prepare('SELECT * FROM adjacent_pipelines WHERE id = ?').get(req.params.pipelineId);
  if (!pipeline) {
    return res.status(404).json({ error: '管线不存在' });
  }

  db.prepare(`
    UPDATE adjacent_pipelines SET
      confirmed = 1,
      confirmed_by = ?,
      confirmed_at = CURRENT_TIMESTAMP,
      pressure_status = ?,
      has_leak = ?,
      remark = ?
    WHERE id = ?
  `).run(
    confirmed_by || 'territory_manager',
    pressure_status || 'normal',
    has_leak !== undefined ? (has_leak ? 1 : 0) : 0,
    remark || '',
    req.params.pipelineId
  );

  const ticket = db.prepare('SELECT * FROM work_tickets WHERE id = ?').get(pipeline.ticket_id);
  const remaining = db.prepare(`
    SELECT COUNT(*) as count FROM adjacent_pipelines
    WHERE ticket_id = ? AND confirmed = 0
  `).get(pipeline.ticket_id);

  const remainingPlates = db.prepare(`
    SELECT COUNT(*) as count FROM isolation_blind_plates
    WHERE ticket_id = ? AND installed = 0
  `).get(pipeline.ticket_id);

  if (remaining.count === 0 && remainingPlates.count === 0 && ticket.status === 'pending_isolation') {
    db.prepare(`
      UPDATE work_tickets SET
        status = 'pending_detection',
        isolation_confirmed_at = CURRENT_TIMESTAMP,
        isolation_confirmed_by = ?,
        pipeline_confirmed_at = CURRENT_TIMESTAMP,
        pipeline_confirmed_by = ?
      WHERE id = ?
    `).run(confirmed_by || 'territory_manager', confirmed_by || 'territory_manager', pipeline.ticket_id);
  } else if (remaining.count === 0 && ticket.status === 'pending_isolation') {
    db.prepare(`
      UPDATE work_tickets SET
        pipeline_confirmed_at = CURRENT_TIMESTAMP,
        pipeline_confirmed_by = ?
      WHERE id = ?
    `).run(confirmed_by || 'territory_manager', pipeline.ticket_id);
  }

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), pipeline.ticket_id, 'confirm_adjacent_pipeline',
    confirmed_by || 'territory_manager', 'territory_manager',
    `确认相邻管线状态：${pipeline.pipeline_name}，压力状态：${pressure_status || 'normal'}，泄漏：${has_leak ? '有' : '无'}`);

  const updatedPipeline = db.prepare('SELECT * FROM adjacent_pipelines WHERE id = ?').get(req.params.pipelineId);
  res.json(updatedPipeline);
});

router.delete('/:pipelineId', (req, res) => {
  const pipeline = db.prepare('SELECT * FROM adjacent_pipelines WHERE id = ?').get(req.params.pipelineId);
  if (!pipeline) {
    return res.status(404).json({ error: '管线不存在' });
  }

  if (pipeline.confirmed) {
    return res.status(400).json({ error: '已确认的管线无法删除' });
  }

  db.prepare('DELETE FROM adjacent_pipelines WHERE id = ?').run(req.params.pipelineId);

  db.prepare(`
    INSERT INTO operation_logs (id, ticket_id, operation_type, operator, operator_role, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), pipeline.ticket_id, 'delete_adjacent_pipeline',
    req.body.deleted_by || 'contractor_user', 'contractor',
    `删除相邻管线：${pipeline.pipeline_name}`);

  res.json({ success: true });
});

module.exports = router;
