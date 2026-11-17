import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { recommendPriority, PRIORITIES } from './priority.js'
export { recommendPriority, PRIORITIES }

export const CATEGORIES = ['IT', 'Classroom', 'Transport', 'Academic Support', 'Lost & Found', 'Maintenance', 'Administrative']
export const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected', 'Cancelled']
export const DEPARTMENTS = ['Unassigned', 'IT Services', 'Facilities', 'Transport Office', 'Academic Affairs', 'Student Affairs', 'Registrar']
export const CATEGORY_DEPT = {
  IT: 'IT Services', Classroom: 'Facilities', Transport: 'Transport Office',
  'Academic Support': 'Academic Affairs', 'Lost & Found': 'Student Affairs',
  Maintenance: 'Facilities', Administrative: 'Registrar',
}

const TOKEN = 'sca_token'
async function api(action, params = {}) {
  const token = localStorage.getItem(TOKEN)
  let res
  try {
    res = await fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, ...params }) })
  } catch { const e = new Error('Cannot reach the server. Check your connection.'); e.network = true; throw e }
  let data = {}; try { data = await res.json() } catch { /* non-JSON */ }
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e }
  return data
}

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)
  const [requests, setRequests] = useState([])
  const [notes, setNotes] = useState([])
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  const apply = d => { if (d.requests) setRequests(d.requests); if (d.notes) setNotes(d.notes); if (d.user) setUser(d.user) }
  const clearSession = () => { localStorage.removeItem(TOKEN); setUser(null); setRequests([]); setNotes([]) }
  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); clearTimeout(timer.current); timer.current = setTimeout(() => setToast(null), 3200) }

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN)) return
    try { apply(await api('list')) } catch (e) { if (e.status === 401) clearSession() }
  }, [])

  // restore session on load
  useEffect(() => {
    (async () => { if (localStorage.getItem(TOKEN)) await refresh(); setReady(true) })()
  }, [refresh])

  // live updates: poll every 5s and refresh when the tab regains focus
  useEffect(() => {
    if (!user) return
    const tick = () => { if (!document.hidden) refresh() }
    const id = setInterval(tick, 5000)
    document.addEventListener('visibilitychange', tick); window.addEventListener('focus', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); window.removeEventListener('focus', tick) }
  }, [user, refresh])

  const authed = async (action, p) => { const d = await api(action, p); localStorage.setItem(TOKEN, d.token); setUser(d.user); await refresh(); return d.user }
  const register = p => authed('register', p)
  const login = (email, password) => authed('login', { email, password })
  const logout = () => clearSession()

  const submitRequest = async p => { const d = await api('submitRequest', p); apply(d); return d.request }
  const updateRequest = async (id, patch) => { apply(await api('updateRequest', { id, patch })) }
  const markNotesRead = async () => { try { apply(await api('markNotesRead')) } catch { /* ignore */ } }

  const value = { ready, user, requests, notes, toast, flash, register, login, logout, submitRequest, updateRequest, markNotesRead }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
