// Single serverless endpoint: POST /api/rpc  { action, ...params }
// Storage: Upstash Redis (set by Vercel integration). Falls back to in-memory for local dev.
import crypto from 'node:crypto'
import { Redis } from '@upstash/redis'

const CATEGORIES = ['IT', 'Classroom', 'Transport', 'Academic Support', 'Lost & Found', 'Maintenance', 'Administrative']
const STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected', 'Cancelled']
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']
const DEPARTMENTS = ['Unassigned', 'IT Services', 'Facilities', 'Transport Office', 'Academic Affairs', 'Student Affairs', 'Registrar']

/* ---------- storage ---------- */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
const tok = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
function memoryDb() {
  const g = (globalThis.__scaMem ||= { h: {}, k: {} })
  return {
    memory: true,
    hget: async (key, f) => g.h[key]?.[f] ?? null,
    hset: async (key, o) => { g.h[key] = { ...(g.h[key] || {}), ...structuredClone(o) } },
    hgetall: async key => (g.h[key] ? structuredClone(g.h[key]) : null),
    incr: async key => (g.k[key] = (g.k[key] || 0) + 1),
    set: async (key, v) => { g.k[key] = v },
    setnx: async (key, v) => { if (key in g.k) return 0; g.k[key] = v; return 1 },
  }
}
const db = url && tok ? new Redis({ url, token: tok }) : memoryDb()
const SECRET = process.env.AUTH_SECRET || tok || 'dev-secret-change-me'

/* ---------- crypto ---------- */
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`
const checkPw = (pw, stored) => { const [salt, h] = stored.split(':'); const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(pw, salt, 32); return a.length === b.length && crypto.timingSafeEqual(a, b) }
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return `${b}.${crypto.createHmac('sha256', SECRET).update(b).digest('base64url')}` }
function verify(token) {
  try {
    const [b, s] = String(token).split('.'); const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url')
    if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null
    const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null
  } catch { return null }
}
const pub = u => ({ id: u.id, name: u.name, email: u.email, studentId: u.studentId, role: u.role })
class HttpError extends Error { constructor(msg, code = 400) { super(msg); this.code = code } }
const clean = (v, max) => String(v ?? '').trim().slice(0, max)

/* ---------- seed demo data once ---------- */
async function ensureSeed() {
  if (!(await db.setnx('seeded', 1))) return
  const mkUser = (id, name, email, studentId, role, pw) => ({ id, name, email, studentId, role, pw: hashPw(pw) })
  const users = [mkUser('u-admin', 'Campus Admin', 'admin@campus.edu', 'ADMIN', 'admin', 'admin123'), mkUser('u-demo', 'Demo Student', 'student@campus.edu', '2024-0001', 'student', 'student123')]
  for (const u of users) { await db.hset('users', { [u.id]: u }); await db.hset('emails', { [u.email]: u.id }); await db.hset('sids', { [u.studentId]: u.id }) }
  const day = 86400000, now = Date.now()
  const mk = (i, title, category, description, status, priority, d, dept) => ({ id: 'REQ-' + (1000 + i), title, category, description, status, priority, department: dept, studentId: 'u-demo', studentName: 'Demo Student', createdAt: now - d * day, updatedAt: now - d * day / 2, history: [{ at: now - d * day, text: 'Request submitted' }] })
  const reqs = [
    mk(1, 'Projector not working in Room 302', 'Classroom', 'The projector does not turn on during lectures.', 'In Progress', 'High', 3, 'Facilities'),
    mk(2, 'Campus WiFi down in library', 'IT', 'No internet on the 2nd floor of the library since morning.', 'Pending', 'High', 1, 'Unassigned'),
    mk(3, 'Lost black wallet near cafeteria', 'Lost & Found', 'Lost a black wallet with student ID.', 'Resolved', 'Medium', 6, 'Student Affairs'),
    mk(4, 'Bus route 5 delayed daily', 'Transport', 'The morning bus is consistently late by 20 minutes.', 'Pending', 'Medium', 2, 'Unassigned'),
    mk(5, 'Request official transcript', 'Administrative', 'I need an official transcript for a scholarship application.', 'In Progress', 'Low', 5, 'Registrar'),
    mk(6, 'Water leak in Block B corridor', 'Maintenance', 'Water leak near stairs, floor is slippery and unsafe.', 'Pending', 'Critical', 0.3, 'Unassigned'),
  ]
  for (const r of reqs) await db.hset('requests', { [r.id]: r })
  await db.set('reqseq', 6)
}

/* ---------- actions ---------- */
async function snapshot(user) {
  const all = Object.values((await db.hgetall('requests')) || {})
  const requests = (user.role === 'admin' ? all : all.filter(r => r.studentId === user.id)).sort((a, b) => b.createdAt - a.createdAt)
  const notes = Object.values((await db.hgetall('notes')) || {}).filter(n => n.userId === user.id).sort((a, b) => b.at - a.at).slice(0, 50)
  return { user: pub(user), requests, notes }
}
const A = {
  async register({ name, email, studentId, password }) {
    name = clean(name, 80); email = clean(email, 120).toLowerCase(); studentId = clean(studentId, 40)
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !studentId) throw new HttpError('Please fill in all fields correctly.')
    if (String(password || '').length < 6) throw new HttpError('Password must be at least 6 characters.')
    if (await db.hget('emails', email)) throw new HttpError('An account with this email already exists.', 409)
    if (await db.hget('sids', studentId)) throw new HttpError('This Student ID is already registered.', 409)
    const u = { id: 'u-' + crypto.randomUUID().slice(0, 8), name, email, studentId, role: 'student', pw: hashPw(password) }
    await db.hset('users', { [u.id]: u }); await db.hset('emails', { [email]: u.id }); await db.hset('sids', { [studentId]: u.id })
    return { token: sign({ uid: u.id, exp: Date.now() + 30 * 864e5 }), user: pub(u) }
  },
  async login({ email, password }) {
    const id = await db.hget('emails', clean(email, 120).toLowerCase()); const u = id && await db.hget('users', id)
    if (!u || !checkPw(String(password || ''), u.pw)) throw new HttpError('Invalid email or password.', 401)
    return { token: sign({ uid: u.id, exp: Date.now() + 30 * 864e5 }), user: pub(u) }
  },
  async list(_, user) { return snapshot(user) },
  async submitRequest({ title, category, description, priority }, user) {
    if (user.role !== 'student') throw new HttpError('Only students can submit requests.', 403)
    title = clean(title, 100); description = clean(description, 2000)
    if (!title || !description || !CATEGORIES.includes(category) || !PRIORITIES.includes(priority)) throw new HttpError('Invalid request details.')
    const n = 1000 + (await db.incr('reqseq')); const now = Date.now()
    const r = { id: 'REQ-' + n, title, category, description, priority, status: 'Pending', department: 'Unassigned', studentId: user.id, studentName: user.name, createdAt: now, updatedAt: now, history: [{ at: now, text: 'Request submitted' }] }
    await db.hset('requests', { [r.id]: r }); return { request: r }
  },
  async updateRequest({ id, patch = {} }, user) {
    const r = await db.hget('requests', id); if (!r) throw new HttpError('Request not found.', 404)
    const now = Date.now(); const log = []; const notes = []
    const note = (text) => notes.push({ id: crypto.randomUUID(), userId: r.studentId, requestId: r.id, text, at: now, read: false })
    if (user.role === 'student') {
      if (r.studentId !== user.id) throw new HttpError('Not allowed.', 403)
      if (!(patch.status === 'Cancelled' && r.status === 'Pending')) throw new HttpError('You can only cancel a pending request.', 403)
      r.status = 'Cancelled'; log.push('Status changed: Pending → Cancelled (by Student)')
    } else {
      const by = ' (by Admin)'
      if (patch.note) { const t = clean(patch.note, 500); log.push(`Note: ${t}${by}`); note(`New update on "${r.title}": ${t}`) }
      if (patch.status && patch.status !== r.status) { if (!STATUSES.includes(patch.status)) throw new HttpError('Invalid status.'); log.push(`Status changed: ${r.status} → ${patch.status}${by}`); r.status = patch.status; note(`Your request "${r.title}" is now ${patch.status}.`) }
      if (patch.department && patch.department !== r.department) { if (!DEPARTMENTS.includes(patch.department)) throw new HttpError('Invalid department.'); log.push(`Assigned to ${patch.department}${by}`); r.department = patch.department; note(`Your request "${r.title}" was assigned to ${patch.department}.`) }
      if (patch.priority && patch.priority !== r.priority) { if (!PRIORITIES.includes(patch.priority)) throw new HttpError('Invalid priority.'); log.push(`Priority changed: ${r.priority} → ${patch.priority}${by}`); r.priority = patch.priority }
    }
    r.updatedAt = now; r.history = [...r.history, ...log.map(text => ({ at: now, text }))]
    await db.hset('requests', { [r.id]: r }); for (const n of notes) await db.hset('notes', { [n.id]: n })
    return { request: r }
  },
  async markNotesRead(_, user) {
    const all = (await db.hgetall('notes')) || {}
    for (const n of Object.values(all)) if (n.userId === user.id && !n.read) await db.hset('notes', { [n.id]: { ...n, read: true } })
    return {}
  },
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    let body = req.body; if (typeof body === 'string') body = JSON.parse(body || '{}')
    body ||= {}
    await ensureSeed()
    const fn = A[body.action]; if (!fn) throw new HttpError('Unknown action.')
    let user = null
    if (!['register', 'login'].includes(body.action)) {
      const p = verify((req.headers.authorization || '').replace(/^Bearer /, ''))
      user = p && await db.hget('users', p.uid)
      if (!user) throw new HttpError('Session expired. Please log in again.', 401)
    }
    const out = await fn(body, user)
    if (user && ['submitRequest', 'updateRequest', 'markNotesRead'].includes(body.action)) Object.assign(out, await snapshot(user))
    return res.status(200).json(out)
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500
    if (code === 500) console.error(e)
    return res.status(code).json({ error: code === 500 ? 'Server error. Please try again.' : e.message })
  }
}
