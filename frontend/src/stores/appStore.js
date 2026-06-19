import { create } from 'zustand'

export const ROLES = {
  CONTRACTOR: 'contractor',
  TERRITORY_MANAGER: 'territory_manager',
  SAFETY_GUARDIAN: 'safety_guardian',
  ADMIN: 'admin',
}

export const ROLE_NAMES = {
  [ROLES.CONTRACTOR]: '承包商',
  [ROLES.TERRITORY_MANAGER]: '属地负责人',
  [ROLES.SAFETY_GUARDIAN]: '安环监护',
  [ROLES.ADMIN]: '管理员',
}

export const STATUS_NAMES = {
  draft: '草稿',
  pending_isolation: '待隔离确认',
  pending_detection: '待气体检测',
  ready: '待开工',
  in_progress: '作业中',
  paused: '已暂停',
  completed: '已完成',
  cancelled: '已取消',
}

export const STATUS_COLORS = {
  draft: 'default',
  pending_isolation: 'orange',
  pending_detection: 'orange',
  ready: 'blue',
  in_progress: 'green',
  paused: 'red',
  completed: 'gray',
  cancelled: 'gray',
}

const useAppStore = create((set, get) => ({
  currentRole: ROLES.CONTRACTOR,
  currentUser: 'contractor_user_01',
  currentUserName: '张三',

  setCurrentRole: (role) => {
    const userMap = {
      [ROLES.CONTRACTOR]: { id: 'contractor_user_01', name: '张三' },
      [ROLES.TERRITORY_MANAGER]: { id: 'territory_user_01', name: '李四' },
      [ROLES.SAFETY_GUARDIAN]: { id: 'guardian_user_01', name: '王五' },
      [ROLES.ADMIN]: { id: 'admin_user_01', name: '赵六' },
    }
    const user = userMap[role] || userMap[ROLES.CONTRACTOR]
    set({ currentRole: role, currentUser: user.id, currentUserName: user.name })
  },

  getCurrentUserInfo: () => {
    const { currentRole, currentUser, currentUserName } = get()
    return { role: currentRole, userId: currentUser, userName: currentUserName }
  },
}))

export default useAppStore
