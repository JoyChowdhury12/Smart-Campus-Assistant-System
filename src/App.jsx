import React, { useMemo, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, Link } from 'react-router-dom'
import { useStore, CATEGORIES, STATUSES, PRIORITIES, DEPARTMENTS, CATEGORY_DEPT, recommendPriority } from './store.jsx'

const fmt = t => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const ago = t => { const m = Math.round((Date.now() - t) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`; const h = Math.round(m / 60); if (h < 24) return `${h}h ago`; return `${Math.round(h / 24)}d ago` }
const statusKind = s => ({ Pending: 'warn', 'In Progress': 'info', Resolved: 'good', Rejected: 'bad', Cancelled: 'muted' }[s])
const prioKind = p => ({ Low: 'muted', Medium: 'info', High: 'warn', Critical: 'bad' }[p])
const prioRank = p => PRIORITIES.indexOf(p)
const Badge = ({ kind, children }) => <span className={`badge ${kind}`}><i />{children}</span>

/* ---------- Icons ---------- */
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
const Icon = ({ n }) => {
  const d = {
    list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r=".6" /><circle cx="3.5" cy="12" r=".6" /><circle cx="3.5" cy="18" r=".6" /></>,
    plus: <path d="M12 5v14M5 12h14" />, chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 20a2 2 0 01-3.4 0" /></>,
    out: <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></>,
    check: <path d="M20 6L9 17l-5-5" />, down: <><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></>,
  }[n]
  return <svg width="18" height="18" viewBox="0 0 24 24" {...P}>{d}</svg>
}

/* ---------- Shared UI ---------- */
function Modal({ onClose, children, wide }) {
  return <div className="overlay" onMouseDown={onClose}><div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" onMouseDown={e => e.stopPropagation()}><button className="x" onClick={onClose} aria-label="Close">×</button>{children}</div></div>
}
function Confirm({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel}>
      <h3>{title}</h3><p className="muted">{body}</p>
      <div className="actions"><button className="ghost" onClick={onCancel}>Cancel</button><button className={danger ? 'danger' : 'primary'} autoFocus onClick={onConfirm}>{confirmLabel}</button></div>
    </Modal>
  )
}
const PageHead = ({ title, sub, children }) => <div className="pagehead"><div><h2>{title}</h2>{sub && <p className="muted">{sub}</p>}</div><div className="row">{children}</div></div>

function Protected({ role, children }) {
  const { user, ready } = useStore()
  if (!ready) return <div className="splash">Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />
  return children
}

function Shell({ children }) {
  const { user, logout, notes, markNotesRead, toast } = useStore()
  const nav = useNavigate()
  const [open, setOpen] = useState(false); const [out, setOut] = useState(false)
  const mine = notes.filter(n => n.userId === user.id); const unread = mine.filter(n => !n.read).length
  const admin = user.role === 'admin'
  const initials = user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="layout">
      <aside className="side">
        <div className="brand"><span className="logo">SC</span><div><b>Smart Campus</b><small>Assistance System</small></div></div>
        <nav>
          {admin ? <NavLink to="/admin"><Icon n="chart" />Dashboard</NavLink> : <>
            <NavLink to="/dashboard"><Icon n="list" />My Requests</NavLink>
            <NavLink to="/new"><Icon n="plus" />New Request</NavLink></>}
        </nav>
        <div className="profile">
          <span className="avatar">{initials}</span>
          <div><b>{user.name}</b><small>{admin ? 'Administrator' : `ID ${user.studentId}`}</small></div>
          <button className="icon" title="Log out" aria-label="Log out" onClick={() => setOut(true)}><Icon n="out" /></button>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <span className="muted">{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
          {!admin && (
            <div className="bellwrap">
              <button className="icon" aria-label="Notifications" onClick={() => { const o = !open; setOpen(o); if (o && unread) setTimeout(markNotesRead, 1500) }}>
                <Icon n="bell" />{unread > 0 && <span className="dot">{unread}</span>}
              </button>
              {open && <div className="pop">
                <div className="pophead"><b>Notifications</b><button className="link" onClick={() => setOpen(false)}>Close</button></div>
                {mine.length === 0 && <p className="muted">You're all caught up.</p>}
                {mine.slice(0, 8).map(n => <div key={n.id} className={`note ${n.read ? '' : 'unread'}`}><div>{n.text}</div><small className="muted">{ago(n.at)}</small></div>)}
              </div>}
            </div>)}
        </header>
        <main className="wrap">{children}</main>
      </div>
      {out && <Confirm title="Log out?" body="You will need to sign in again to access your account." confirmLabel="Log out" onCancel={() => setOut(false)} onConfirm={() => { logout(); nav('/login') }} />}
      {toast && <div className={`toast ${toast.kind}`} role="status"><Icon n="check" />{toast.msg}</div>}
    </div>
  )
}

function AuthCard({ title, sub, children, footer }) {
  return (
    <div className="authpage">
      <section className="hero">
        <span className="logo big">SC</span>
        <h1>Smart Campus<br />Assistance System</h1>
        <p>One place for classroom issues, IT help, transport, lost belongings and administrative requests — submitted in seconds, tracked to resolution.</p>
        <ul><li>Submit and track every request</li><li>Smart priority recommendations</li><li>Instant status notifications</li></ul>
      </section>
      <section className="formside"><div className="authcard"><h2>{title}</h2><p className="muted">{sub}</p>{children}<p className="muted center footer">{footer}</p></div></section>
    </div>
  )
}

function Login() {
  const { login, user } = useStore(); const nav = useNavigate()
  const [f, setF] = useState({ email: '', password: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true)
    try { const u = await login(f.email.trim(), f.password); nav(u.role === 'admin' ? '/admin' : '/dashboard') } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  return (
    <AuthCard title="Welcome back" sub="Log in to your account" footer={<>New student? <Link to="/register">Create an account</Link></>}>
      <form onSubmit={submit}>
        <label>Email<input type="email" required autoComplete="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label>Password<input type="password" required autoComplete="current-password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="primary block" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
      </form>
      <div className="demo"><b>Try a demo account</b>
        <button type="button" className="link" onClick={() => setF({ email: 'student@campus.edu', password: 'student123' })}>Student — student@campus.edu</button>
        <button type="button" className="link" onClick={() => setF({ email: 'admin@campus.edu', password: 'admin123' })}>Admin — admin@campus.edu</button>
      </div>
    </AuthCard>
  )
}

function Register() {
  const { register, user } = useStore(); const nav = useNavigate()
  const [f, setF] = useState({ name: '', email: '', studentId: '', password: '', confirm: '' }); const [err, setErr] = useState('')
  if (user) return <Navigate to="/dashboard" replace />
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const submit = async e => {
    e.preventDefault(); setErr('')
    if (f.password.length < 6) return setErr('Password must be at least 6 characters.')
    if (f.password !== f.confirm) return setErr('Passwords do not match.')
    try { await register({ name: f.name.trim(), email: f.email.trim(), studentId: f.studentId.trim(), password: f.password }); nav('/dashboard') } catch (x) { setErr(x.message) }
  }
  return (
    <AuthCard title="Create your account" sub="Student registration" footer={<>Already registered? <Link to="/login">Log in</Link></>}>
      <form onSubmit={submit}>
        <label>Full name<input required value={f.name} onChange={set('name')} /></label>
        <div className="two"><label>University email<input type="email" required value={f.email} onChange={set('email')} /></label>
          <label>Student ID<input required value={f.studentId} onChange={set('studentId')} /></label></div>
        <div className="two"><label>Password<input type="password" required value={f.password} onChange={set('password')} /></label>
          <label>Confirm<input type="password" required value={f.confirm} onChange={set('confirm')} /></label></div>
        {err && <p className="error" role="alert">{err}</p>}
        <button className="primary block">Create account</button>
      </form>
    </AuthCard>
  )
}

function NewRequest() {
  const { submitRequest, flash } = useStore(); const nav = useNavigate()
  const [f, setF] = useState({ title: '', category: CATEGORIES[0], description: '', priority: 'Low' })
  const [manual, setManual] = useState(false); const [review, setReview] = useState(false)
  const rec = useMemo(() => recommendPriority(f.category, f.title + ' ' + f.description), [f.category, f.title, f.description])
  const prio = manual ? f.priority : rec.priority
  const confirm = () => { const r = submitRequest({ ...f, priority: prio }); flash(`Request ${r.id} submitted successfully.`); nav('/dashboard') }
  return (
    <>
      <PageHead title="New request" sub="Tell us what's wrong and we'll route it to the right team." />
      <div className="card form">
        <form onSubmit={e => { e.preventDefault(); setReview(true) }}>
          <label>Title<input required maxLength={100} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Short summary of the issue" /></label>
          <label>Category
            <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label>Description<textarea required rows={5} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="What happened, where, and when?" /></label>
          <div className="actions"><button type="button" className="ghost" onClick={() => nav('/dashboard')}>Cancel</button><button className="primary">Review request</button></div>
        </form>
      </div>
      {review && <Modal onClose={() => setReview(false)}>
        <h3>Review &amp; confirm</h3>
        <dl className="review"><dt>Title</dt><dd>{f.title}</dd><dt>Category</dt><dd>{f.category}</dd><dt>Description</dt><dd>{f.description}</dd></dl>
        <div className="rec">
          <div className="row between"><div><b>Recommended priority</b> <Badge kind={prioKind(rec.priority)}>{rec.priority}</Badge></div><small className="muted">Confidence: <b>{rec.confidence}</b></small></div>
          {rec.reasons.length ? <div className="chips">{rec.reasons.map(x => <span key={x} className={`chip ${x.startsWith('safety') ? 'bad' : x.startsWith('low-urgency') ? 'good' : ''}`}>{x}</span>)}</div>
            : <small className="muted">No urgency signals found — based on the "{f.category}" category.</small>}
          <label className="inline"><input type="checkbox" checked={manual} onChange={e => { setManual(e.target.checked); setF(x => ({ ...x, priority: rec.priority })) }} /> Choose a different priority</label>
          {manual && <select value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map(p => <option key={p}>{p}</option>)}</select>}
        </div>
        <div className="actions"><button className="ghost" onClick={() => setReview(false)}>Edit</button><button className="primary" autoFocus onClick={confirm}>Confirm &amp; submit as {prio}</button></div>
      </Modal>}
    </>
  )
}

function Timeline({ r }) {
  const flow = ['Pending', 'In Progress', 'Resolved']; const idx = flow.indexOf(r.status)
  return (<>
    {idx < 0 ? <p><Badge kind={statusKind(r.status)}>{r.status}</Badge></p>
      : <ol className="steps">{flow.map((s, i) => <li key={s} className={i <= idx ? 'done' : ''}><span>{i <= idx ? '✓' : i + 1}</span>{s}</li>)}</ol>}
    <h4>Activity</h4>
    <ul className="hist">{[...r.history].reverse().map((h, i) => <li key={i}>{h.text}<br /><small className="muted">{fmt(h.at)}</small></li>)}</ul>
  </>)
}

const emptyF = { q: '', status: '', category: '', priority: '', department: '', sort: 'new' }
function Filters({ f, setF, showDept }) {
  const S = (k, label, opts) => <select value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} aria-label={label}><option value="">{label}</option>{opts.map(s => <option key={s}>{s}</option>)}</select>
  const active = Object.entries(f).some(([k, v]) => k !== 'sort' && v)
  return (
    <div className="filters">
      <input placeholder="Search by ID, title, description…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} aria-label="Search" />
      {S('status', 'All statuses', STATUSES)}{S('category', 'All categories', CATEGORIES)}{S('priority', 'All priorities', PRIORITIES)}
      {showDept && S('department', 'All departments', DEPARTMENTS)}
      <select value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })} aria-label="Sort"><option value="new">Newest first</option><option value="prio">Highest priority</option><option value="old">Oldest first</option></select>
      {active && <button className="ghost" onClick={() => setF(emptyF)}>Clear</button>}
    </div>
  )
}
function applyFilters(list, f) {
  const q = f.q.toLowerCase()
  const out = list.filter(r => (!q || `${r.id} ${r.title} ${r.description} ${r.studentName}`.toLowerCase().includes(q))
    && (!f.status || r.status === f.status) && (!f.category || r.category === f.category)
    && (!f.priority || r.priority === f.priority) && (!f.department || r.department === f.department))
  return out.sort((a, b) => f.sort === 'prio' ? prioRank(b.priority) - prioRank(a.priority) || b.createdAt - a.createdAt : f.sort === 'old' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt)
}
const Stat = ({ v, l, tone }) => <div className={`stat ${tone || ''}`}><span>{l}</span><b>{v}</b></div>

function StudentDashboard() {
  const { user, requests, updateRequest, flash } = useStore()
  const [f, setF] = useState(emptyF); const [sel, setSel] = useState(null); const [cancel, setCancel] = useState(false)
  const mine = requests.filter(r => r.studentId === user.id); const list = applyFilters(mine, f)
  const cur = sel && requests.find(r => r.id === sel); const n = s => mine.filter(r => r.status === s).length
  return (<>
    <PageHead title="My requests" sub="Track everything you've submitted."><Link className="btn primary" to="/new"><Icon n="plus" />New request</Link></PageHead>
    <div className="stats"><Stat l="Total" v={mine.length} /><Stat l="Pending" v={n('Pending')} tone="warn" /><Stat l="In progress" v={n('In Progress')} tone="info" /><Stat l="Resolved" v={n('Resolved')} tone="good" /></div>
    <Filters f={f} setF={setF} />
    {list.length === 0 ? <div className="card empty"><b>No requests found</b><p className="muted">Try adjusting your filters, or submit a new request.</p><Link className="btn primary" to="/new">New request</Link></div> :
      <div className="card tablewrap"><table>
        <thead><tr><th>ID</th><th>Request</th><th>Category</th><th>Priority</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{list.map(r => <tr key={r.id} className="click" onClick={() => setSel(r.id)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setSel(r.id)}>
          <td className="mono">{r.id}</td><td><b>{r.title}</b></td><td>{r.category}</td><td><Badge kind={prioKind(r.priority)}>{r.priority}</Badge></td><td><Badge kind={statusKind(r.status)}>{r.status}</Badge></td><td className="muted">{ago(r.updatedAt)}</td></tr>)}</tbody></table></div>}
    {cur && <Modal onClose={() => setSel(null)} wide>
      <p className="mono muted">{cur.id}</p><h3>{cur.title}</h3>
      <p className="muted">{cur.category} · Department: {cur.department} · <Badge kind={prioKind(cur.priority)}>{cur.priority}</Badge></p>
      <p>{cur.description}</p><Timeline r={cur} />
      {cur.status === 'Pending' && <div className="actions"><button className="danger" onClick={() => setCancel(true)}>Cancel request</button></div>}
    </Modal>}
    {cancel && cur && <Confirm danger title="Cancel this request?" body={`"${cur.title}" will be marked as cancelled and the team will stop working on it.`} confirmLabel="Yes, cancel request" onCancel={() => setCancel(false)}
      onConfirm={() => { updateRequest(cur.id, { status: 'Cancelled' }, 'Student'); setCancel(false); flash('Request cancelled.') }} />}
  </>)
}

/* ---------- Charts ---------- */
const SC = { Pending: '#d98a1c', 'In Progress': '#3b6fd4', Resolved: '#2a9d6a', Rejected: '#cf3f3f', Cancelled: '#9aa3b5' }
function Donut({ requests }) {
  const total = requests.length; const R = 52, C = 2 * Math.PI * R; let off = 0
  return (
    <div className="card chart"><h3>Status breakdown</h3>
      <div className="donutrow">
        <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Status breakdown donut">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#eef1f7" strokeWidth="18" />
          {STATUSES.map(s => { const n = requests.filter(r => r.status === s).length; if (!n) return null; const len = (n / total) * C; const el = <circle key={s} cx="70" cy="70" r={R} fill="none" stroke={SC[s]} strokeWidth="18" strokeDasharray={`${Math.max(len - 2, 0)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{s}: {n}</title></circle>; off += len; return el })}
          <text x="70" y="68" textAnchor="middle" fontSize="26" fontWeight="700" fill="#1b2333">{total}</text><text x="70" y="86" textAnchor="middle" fontSize="11" fill="#6b7488">requests</text>
        </svg>
        <div className="legend">{STATUSES.map(s => <span key={s}><i style={{ background: SC[s] }} />{s}<b>{requests.filter(r => r.status === s).length}</b></span>)}</div>
      </div></div>)
}
function BarList({ title, data }) {
  const max = Math.max(1, ...data.map(d => d.value))
  return (<div className="card chart"><h3>{title}</h3>{data.map(d => (
    <div className="bar" key={d.label} title={`${d.label}: ${d.value}`}><span className="lbl">{d.label}</span>
      <div className="track"><div className="fill" style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value ? 4 : 0, background: d.color || '#3b6fd4' }} /></div><span className="val">{d.value}</span></div>))}</div>)
}

function exportCSV(rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const head = ['ID', 'Student', 'Title', 'Category', 'Priority', 'Department', 'Status', 'Created', 'Description']
  const csv = [head, ...rows.map(r => [r.id, r.studentName, r.title, r.category, r.priority, r.department, r.status, new Date(r.createdAt).toISOString(), r.description])].map(a => a.map(esc).join(',')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'campus-requests.csv'; a.click()
}

function ManageModal({ r, onClose }) {
  const { updateRequest, flash } = useStore()
  const [d, setD] = useState({ status: r.status, priority: r.priority, department: r.department, note: '' })
  const [ask, setAsk] = useState(false)
  const changed = d.status !== r.status || d.priority !== r.priority || d.department !== r.department || d.note.trim()
  const save = () => {
    const patch = {}; ['status', 'priority', 'department'].forEach(k => { if (d[k] !== r[k]) patch[k] = d[k] })
    if (d.note.trim()) patch.note = d.note.trim()
    updateRequest(r.id, patch); flash('Changes saved. Student notified.'); onClose()
  }
  return (<>
    <Modal onClose={onClose} wide>
      <p className="mono muted">{r.id}</p><h3>{r.title}</h3>
      <p className="muted">{r.category} · {r.studentName} · {fmt(r.createdAt)}</p><p>{r.description}</p>
      <div className="manage">
        <label>Status<select value={d.status} onChange={e => setD({ ...d, status: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Priority<select value={d.priority} onChange={e => setD({ ...d, priority: e.target.value })}>{PRIORITIES.map(s => <option key={s}>{s}</option>)}</select></label>
        <label>Department<select value={d.department} onChange={e => setD({ ...d, department: e.target.value })}>{DEPARTMENTS.map(s => <option key={s}>{s}</option>)}</select></label>
      </div>
      {d.department === 'Unassigned' && <button className="ghost sm" onClick={() => setD({ ...d, department: CATEGORY_DEPT[r.category], status: d.status === 'Pending' ? 'In Progress' : d.status })}>Auto-assign to {CATEGORY_DEPT[r.category]}</button>}
      <label>Note to student (optional)<textarea rows={2} value={d.note} onChange={e => setD({ ...d, note: e.target.value })} placeholder="e.g. Technician scheduled for tomorrow morning." /></label>
      <div className="actions"><button className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={!changed} onClick={() => setAsk(true)}>Save changes</button></div>
      <Timeline r={r} />
    </Modal>
    {ask && <Confirm title="Save these changes?" body={`The student will be notified${d.status !== r.status ? ` that the request is now ${d.status}` : ''}.`} confirmLabel="Confirm & save" onCancel={() => setAsk(false)} onConfirm={save} />}
  </>)
}

function AdminDashboard() {
  const { requests } = useStore()
  const [f, setF] = useState(emptyF); const [sel, setSel] = useState(null)
  const list = applyFilters(requests, f); const cur = sel && requests.find(r => r.id === sel)
  const c = s => requests.filter(r => r.status === s).length
  const urgent = requests.filter(r => ['Pending', 'In Progress'].includes(r.status) && ['High', 'Critical'].includes(r.priority)).length
  const pc = { Low: '#9aa3b5', Medium: '#3b6fd4', High: '#d98a1c', Critical: '#cf3f3f' }
  return (<>
    <PageHead title="Admin dashboard" sub="Overview of all campus requests."><button className="ghost" onClick={() => exportCSV(list)}><Icon n="down" />Export CSV</button></PageHead>
    <div className="stats"><Stat l="Total" v={requests.length} /><Stat l="Pending" v={c('Pending')} tone="warn" /><Stat l="In progress" v={c('In Progress')} tone="info" /><Stat l="Resolved" v={c('Resolved')} tone="good" /><Stat l="Open high / critical" v={urgent} tone="bad" /></div>
    <div className="grid3"><Donut requests={requests} />
      <BarList title="By category" data={CATEGORIES.map(k => ({ label: k, value: requests.filter(r => r.category === k).length }))} />
      <BarList title="By priority" data={PRIORITIES.map(p => ({ label: p, value: requests.filter(r => r.priority === p).length, color: pc[p] }))} /></div>
    <h3 className="sect">All requests <span className="muted">({list.length})</span></h3>
    <Filters f={f} setF={setF} showDept />
    <div className="card tablewrap"><table>
      <thead><tr><th>ID</th><th>Student</th><th>Request</th><th>Category</th><th>Priority</th><th>Department</th><th>Status</th><th></th></tr></thead>
      <tbody>{list.length === 0 && <tr><td colSpan={8} className="center muted">No matching requests.</td></tr>}
        {list.map(r => <tr key={r.id}><td className="mono">{r.id}</td><td>{r.studentName}</td><td><b>{r.title}</b></td><td>{r.category}</td>
          <td><Badge kind={prioKind(r.priority)}>{r.priority}</Badge></td><td>{r.department}</td><td><Badge kind={statusKind(r.status)}>{r.status}</Badge></td>
          <td><button className="ghost sm" onClick={() => setSel(r.id)}>Manage</button></td></tr>)}</tbody></table></div>
    {cur && <ManageModal key={cur.id} r={cur} onClose={() => setSel(null)} />}
  </>)
}

function Home() {
  const { user, ready } = useStore()
  if (!ready) return <div className="splash">Loading…</div>
  return <Navigate to={!user ? '/login' : user.role === 'admin' ? '/admin' : '/dashboard'} replace />
}
export default function App() {
  return (<Routes>
    <Route path="/" element={<Home />} /><Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route path="/dashboard" element={<Protected role="student"><Shell><StudentDashboard /></Shell></Protected>} />
    <Route path="/new" element={<Protected role="student"><Shell><NewRequest /></Shell></Protected>} />
    <Route path="/admin" element={<Protected role="admin"><Shell><AdminDashboard /></Shell></Protected>} />
    <Route path="*" element={<Home />} />
  </Routes>)
}
