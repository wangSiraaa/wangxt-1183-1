export const getStatusClassName = (status) => {
  const map = {
    draft: 'status-tag-draft',
    pending_isolation: 'status-tag-pending-isolation',
    pending_detection: 'status-tag-pending-detection',
    ready: 'status-tag-ready',
    in_progress: 'status-tag-in-progress',
    paused: 'status-tag-paused',
    completed: 'status-tag-completed',
    cancelled: 'status-tag-completed',
  }
  return map[status] || 'status-tag-draft'
}

export const formatDateTime = (date) => {
  if (!date) return '-'
  const d = new Date(date)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const getMinutesSince = (date) => {
  if (!date) return 0
  return (Date.now() - new Date(date).getTime()) / (1000 * 60)
}
