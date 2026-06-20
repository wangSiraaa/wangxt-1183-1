import axios from 'axios'

const API_BASE = '/api'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export const ticketApi = {
  list: (params) => api.get('/tickets', { params }),
  detail: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  issue: (id, data) => api.post(`/tickets/${id}/issue`, data),
  complete: (id, data) => api.post(`/tickets/${id}/complete`, data),
  checkInterlock: (id) => api.get(`/tickets/${id}/check-interlock`),
  confirmResume: (id, data) => api.post(`/tickets/${id}/confirm-resume`, data),
  unlock: (id, data) => api.post(`/tickets/${id}/unlock`, data),
}

export const pipelineApi = {
  listByTicket: (ticketId) => api.get(`/pipelines/ticket/${ticketId}`),
  addPipeline: (ticketId, data) => api.post(`/pipelines/ticket/${ticketId}/add`, data),
  confirmPipeline: (pipelineId, data) => api.post(`/pipelines/${pipelineId}/confirm`, data),
  deletePipeline: (pipelineId) => api.delete(`/pipelines/${pipelineId}`),
}

export const isolationApi = {
  listByTicket: (ticketId) => api.get(`/isolation/ticket/${ticketId}`),
  confirmInstall: (plateId, data) => api.post(`/isolation/${plateId}/confirm-install`, data),
  confirmRemove: (plateId, data) => api.post(`/isolation/${plateId}/confirm-remove`, data),
  addPlate: (ticketId, data) => api.post(`/isolation/ticket/${ticketId}/add-plate`, data),
}

export const detectionApi = {
  listByTicket: (ticketId) => api.get(`/detection/ticket/${ticketId}`),
  getCurve: (ticketId) => api.get(`/detection/ticket/${ticketId}/curve`),
  addDetection: (ticketId, data) => api.post(`/detection/ticket/${ticketId}`, data),
}

export const pauseApi = {
  listByTicket: (ticketId) => api.get(`/pause/ticket/${ticketId}`),
  pause: (ticketId, data) => api.post(`/pause/ticket/${ticketId}/pause`, data),
  resume: (ticketId, data) => api.post(`/pause/ticket/${ticketId}/resume`, data),
  activeList: () => api.get('/pause/active/list'),
}

export default api
