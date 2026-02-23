const LS_KEY = 'groupchat_username'

export const getUsername = () => {
  try { return localStorage.getItem(LS_KEY) || '' } catch { return '' }
}

export const setUsername = (name) => {
  try { localStorage.setItem(LS_KEY, name.trim()) } catch {}
}

export const hasUsername = () => {
  try { return Boolean(localStorage.getItem(LS_KEY)?.trim()) } catch { return false }
}
