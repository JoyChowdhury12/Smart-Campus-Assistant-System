import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'

export const CATEGORIES = ['IT', 'Classroom', 'Transport', 'Academic Support', 'Lost & Found', 'Maintenance', 'Administrative']
export const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected', 'Cancelled']
export { PRIORITIES } from './priority.js'
export const DEPARTMENTS = ['Unassigned', 'IT Services', 'Facilities', 'Transport Office', 'Academic Affairs', 'Student Affairs', 'Registrar']
export const CATEGORY_DEPT = {
  IT: 'IT Services', Classroom: 'Facilities', Transport: 'Transport Office',
  'Academic Support': 'Academic Affairs', 'Lost & Found': 'Student Affairs',
  Maintenance: 'Facilities', Administrative: 'Registrar',
}

/* Bonus: automatic priority recommendation lives in ./priority.js */
import { recommendPriority } from './priority.js'
export { recommendPriority }

/* ---------- Storage helpers ---------- */
const K = { users: 'sca_users', reqs: 'sca_requests', notes: 'sca_notifications', session: 'sca_session' }
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v))
const uid = () => Math.random().toString(36).slice(2, 10)

export async function hash(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sca-salt:' + pw))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function seed() {
  if (read(K.users, null)) return
  const adminHash = await hash('admin123')
  const stuHash = await hash('student123')
  const users = [
    { id: 'u-admin', name: 'Campus Admin', email: 'admin@campus.edu', studentId: 'ADMIN', role: 'admin', pw: adminHash },
    { id: 'u-demo', name: 'Demo Student', email: 'student@campus.edu', studentId: '2024-0001', role: 'student', pw: stuHash },
  ]
  const day = 86400000, now = Date.now()
  const mk = (i, title, category, description, status, priority, ago, dept) => ({
    id: 'REQ-' + (1000 + i), title, category, description, status, priority,
    department: dept, studentId: 'u-demo', studentName: 'Demo Student', createdAt: now - ago * day, updatedAt: now - ago * day / 2,
    history: [{ at: now - ago * day, text: 'Request submitted' }],
  })
  const reqs = [
    mk(1, 'Projector not working in Room 302', 'Classroom', 'The projector does not turn on during lectures.', 'In Progress', 'High', 3, 'Facilities'),
    mk(2, 'Campus WiFi down in library', 'IT', 'No internet on the 2nd floor of the library since morning.', 'Pending', 'High', 1, 'Unassigned'),
    mk(3, 'Lost black wallet near cafeteria', 'Lost & Found', 'Lost a black wallet with student ID.', 'Resolved', 'Medium', 6, 'Student Affairs'),
    mk(4, 'Bus route 5 delayed daily', 'Transport', 'The morning bus is consistently late by 20 minutes.', 'Pending', 'Medium', 2, 'Unassigned'),
    mk(5, 'Request official transcript', 'Administrative', 'I need an official transcript for a scholarship application.', 'In Progress', 'Low', 5, 'Registrar'),
    mk(6, 'Water leak in Block B corridor', 'Maintenance', 'Water leak near stairs, floor is slippery and unsafe.', 'Pending', 'Critical', 0.3, 'Unassigned'),
  ]
  write(K.users, users); write(K.reqs, reqs); write(K.notes, [])
}

/* ---------- Context ---------- */
const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState(null)
  const [requests, setRequests] = useState([])
  const [notes, setNotes] = useState([])
  const [toast, setToast] = useState(null)

  const reload = useCallback(() => { setRequests(read(K.reqs, [])); setNotes(read(K.notes, [])) }, [])

  useEffect(() => {
    seed().then(() => {
      const sid = read(K.session, null)
      setUser(sid ? read(K.users, []).find(u => u.id === sid) || null : null)
      reload(); setReady(true)
    })
    const onStorage = () => reload()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [reload])

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200) }

  const register = async ({ name, email, studentId, password }) => {
    const users = read(K.users, [])
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) throw new Error('An account with this email already exists.')
    if (users.some(u => u.studentId === studentId)) throw new Error('This Student ID is already registered.')
    const u = { id: 'u-' + uid(), name, email, studentId, role: 'student', pw: await hash(password) }
    write(K.users, [...users, u]); write(K.session, u.id); setUser(u)
  }
  const login = async (email, password) => {
    const u = read(K.users, []).find(x => x.email.toLowerCase() === email.toLowerCase())
    if (!u || u.pw !== await hash(password)) throw new Error('Invalid email or password.')
    write(K.session, u.id); setUser(u); return u
  }
  const logout = () => { localStorage.removeItem(K.session); setUser(null) }

  const submitRequest = ({ title, category, description, priority }) => {
    const all = read(K.reqs, [])
    const n = 1000 + all.length + 1
    const now = Date.now()
    const r = {
      id: 'REQ-' + n, title, category, description, priority, status: 'Pending', department: 'Unassigned',
      studentId: user.id, studentName: user.name, createdAt: now, updatedAt: now,
      history: [{ at: now, text: 'Request submitted' }],
    }
    write(K.reqs, [r, ...all]); reload(); return r
  }

  const updateRequest = (id, patch, by = 'Admin') => {
    const all = read(K.reqs, [])
    const notesAll = read(K.notes, [])
    const out = all.map(r => {
      if (r.id !== id) return r
      const now = Date.now(); const log = []
      const { note, ...fields } = patch; patch = fields
      const student = by === 'Student'
      if (note) {
        log.push(`Note: ${note}`)
        if (!student) notesAll.unshift({ id: uid(), userId: r.studentId, requestId: r.id, text: `New update on "${r.title}": ${note}`, at: now, read: false })
      }
      if (patch.status && patch.status !== r.status) {
        log.push(`Status changed: ${r.status} → ${patch.status}`)
        if (!student) notesAll.unshift({ id: uid(), userId: r.studentId, requestId: r.id, text: `Your request "${r.title}" is now ${patch.status}.`, at: now, read: false })
      }
      if (patch.department && patch.department !== r.department) {
        log.push(`Assigned to ${patch.department}`)
        if (!student) notesAll.unshift({ id: uid(), userId: r.studentId, requestId: r.id, text: `Your request "${r.title}" was assigned to ${patch.department}.`, at: now, read: false })
      }
      if (patch.priority && patch.priority !== r.priority) log.push(`Priority changed: ${r.priority} → ${patch.priority}`)
      return { ...r, ...patch, updatedAt: now, history: [...r.history, ...log.map(text => ({ at: now, text: `${text} (by ${by})` }))] }
    })
    write(K.reqs, out); write(K.notes, notesAll); reload()
  }

  const markNotesRead = () => {
    write(K.notes, read(K.notes, []).map(n => n.userId === user?.id ? { ...n, read: true } : n)); reload()
  }

  const value = { ready, user, requests, notes, toast, flash, register, login, logout, submitRequest, updateRequest, markNotesRead }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
