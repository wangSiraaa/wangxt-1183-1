const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { initDatabase } = require('./database');

const ticketRoutes = require('./routes/tickets');
const isolationRoutes = require('./routes/isolation');
const detectionRoutes = require('./routes/detection');
const pauseRoutes = require('./routes/pause');
const pipelineRoutes = require('./routes/pipelines');

const app = express();
const PORT = process.env.PORT || 3001;

initDatabase();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/tickets', ticketRoutes);
app.use('/api/isolation', isolationRoutes);
app.use('/api/detection', detectionRoutes);
app.use('/api/pause', pauseRoutes);
app.use('/api/pipelines', pipelineRoutes);

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`动火作业联锁系统后端服务启动成功，端口: ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/api/health`);
});
