/*
 * Automatic priority recommendation (bonus challenge).
 * Rule-based weighted scoring: every matching signal adds points, de-escalating
 * phrases subtract, and the total is mapped to Low / Medium / High / Critical.
 * Safety-risk phrases always force Critical. Fully explainable and offline.
 */
export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical']

const CATEGORY_BASE = { IT: 2, Classroom: 2, Transport: 2, 'Academic Support': 2, Maintenance: 2, 'Lost & Found': 1, Administrative: 1 }

// [regex source, weight, label]
const SAFETY = [
  ['fire|smok(e|ing)|burning|burnt', 'fire or smoke'], ['gas leak|gas smell', 'gas leak'],
  ['electric(al)? shock|electrocut\\w*|sparking|sparks|exposed wires?|short.?circuit', 'electrical hazard'],
  ['flood(ed|ing)?', 'flooding'], ['injur\\w*|bleeding|unconscious|faint(ed|ing)|ambulance|heart attack|seizure|medical emergency', 'medical emergency'],
  ['harass\\w*|assault\\w*|threat\\w*|bully\\w*|ragging|stalk\\w*|abus\\w*|molest\\w*|weapon|knife|gun|violen\\w*', 'personal safety'],
  ['collaps\\w*|trapped|stuck in (the )?(lift|elevator)|(lift|elevator) (is )?stuck|falling|cracked ceiling', 'structural danger'],
  ['suicid\\w*|self.?harm', 'welfare concern'], ['accident|crash(ed)? into', 'accident'], ['unsafe|dangerous|hazard\\w*|life.?threatening', 'safety risk'],
]
const URGENT = [ // [pattern, weight, label]
  ['urgent(ly)?|asap|immediately|right now|emergency|critical|top priority|as soon as possible', 3.5, 'marked urgent'],
  ['serious|severe|major|very bad|worst', 2, 'serious problem'],
  ['not working|doesn.?t work|does not work|stopped working|broken|out of order|crashed|dead|failed|failure|won.?t (start|open|turn on|load)|can.?t (open|load|turn on)', 3, 'something is not working'],
  ['no (internet|wifi|wi-fi|network|connection|power|electricity|water|light|heating|ac)|internet (is )?down|wifi (is )?down|server (is )?down|power (cut|outage|failure)|blackout|load.?shedding', 3.5, 'service outage'],
  ['leak\\w*|overflow\\w*|sewage|blocked drain|burst pipe|clogged', 3, 'leak or overflow'],
  ['lock(ed)? out|can.?t log ?in|cannot log ?in|can.?t access|cannot access|account (blocked|suspended|hacked)|hacked|virus|malware|data loss|lost (my )?data', 3, 'access or security problem'],
  ['pest|rats?|cockroach\\w*|mosquito\\w*|bed ?bugs?|food poison\\w*|contaminated|expired food|bad smell|stink\\w*', 2, 'health or hygiene'],
  ['missing|stolen|theft|robbed|lost (my )?(wallet|id|id card|passport|keys?|laptop|phone|bag|medicine|charger)', 2.5, 'valuable item lost'],
  ['missing|misplaced|not (found|received|updated)', 1.5, 'missing item or information'],
  ['payment (failed|issue|problem)|double charged|refund|scholarship|visa|fee deadline', 2.5, 'financial or legal matter'],
  ['exam|test|quiz|viva|midterm|final|result|marks?|grade|transcript|clearance|registration|admit card', 2, 'academic stakes'],
  ['slow|delay(ed)?|late|waiting|pending|long queue|not responding|lag(ging)?', 1.5, 'delay'],
  ['noisy|noise|dirty|unclean|smelly|hot|too cold|uncomfortable|flicker\\w*|dim|projector|printer|fan|bulb|tube ?light|wobbl\\w*|torn|scratched', 1, 'comfort or equipment issue'],
  ['wrong|error|bug|incorrect|mistake|duplicate|mismatch', 1, 'incorrect information'],
]
const IMPACT = ['everyone', 'everybody', 'all (the )?students', 'whole (class|building|campus|hostel|floor|department)', 'entire (class|building|campus|hostel|floor|department)', 'many students', 'several students', 'hundreds', 'dozens', 'multiple (classes|students|rooms|labs)', 'all (labs?|classes|classrooms|rooms|buses|computers)', 'whole batch', 'every (class|day|morning)']
const TIME = ['today', 'tonight', 'tomorrow', 'this (morning|afternoon|evening)', 'within (an? )?(hour|day|\\d+ ?(hours?|days?|mins?|minutes?))', 'before (the )?(exam|class|test|deadline|lecture|submission|viva)', 'deadline', 'due (today|tomorrow|soon)', 'in \\d+ (hours?|days?|minutes?)', 'by (today|tomorrow|tonight)', 'running out of time']
const PERSIST = ['since (yesterday|morning|last|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\\d+)', 'for (the )?(past|last)? ?(\\d+|two|three|several|many|few) (days?|weeks?|hours?)', 'again and again|repeatedly|keeps? (happening|failing|breaking)|still (not|no|broken)|every (day|time)|(second|third|multiple) time|no one (has )?(responded|replied|fixed)|nobody (has )?(responded|replied|fixed)|ignored|no response']
const DEESCALATE = ['not urgent', 'no (need to )?rush', 'no hurry', 'low priority', 'not (an )?emergency', 'whenever (possible|you can|convenient)', 'when (you )?(get|have) time', 'at your convenience', 'when possible', 'minor', 'small (issue|problem)', 'just (a )?(suggestion|feedback|question)', 'suggestion', 'feedback', 'just wondering', 'no problem']
// category-specific boosts
const BY_CATEGORY = {
  IT: [['exam portal|result portal|lms|moodle|online exam|submission portal|student portal', 3, 'critical academic system'], ['password|reset|otp|email|login|wifi|wi-fi', 0.5, 'account or network']],
  Maintenance: [['lift|elevator|stairs|staircase|railing|ceiling|wiring|socket|switch', 1.5, 'building infrastructure'], ['toilet|washroom|restroom|water cooler|drinking water', 1.5, 'basic facilities']],
  Transport: [['breakdown|broke down|stuck|did(n.?t| not) come|cancel(l)?ed|no bus|overcrowd\\w*|reckless|overspeed\\w*', 2, 'transport disruption']],
  Classroom: [['projector|ac|air.?condition\\w*|board|mic|microphone|sound|seat|bench|chair|door|window|lock', 0.5, 'classroom equipment'], ['class (is )?(cancel\\w*|disrupted)|lecture (cannot|can.?t)|can.?t (teach|conduct)|no (class|lecture)', 2, 'class disruption']],
  'Academic Support': [['attendance|assignment|submission|grade|marks|result|course (registration|drop|add)|advisor|supervisor|thesis|project', 1.5, 'academic matter']],
  'Lost & Found': [['laptop|phone|passport|wallet|id card|keys?|medicine|inhaler|glasses|charger', 2, 'important belonging']],
  Administrative: [['certificate|transcript|clearance|id card|admit card|visa|scholarship|tuition|fee|dues|enrol\\w*|withdraw\\w*', 1.5, 'official document or fee']],
}

const rx = (src, flags = 'i') => new RegExp(`\\b(?:${src})\\b`, flags)
const first = (re, t) => { const m = t.match(re); return m ? m[0].trim() : null }
const NEG = /\b(?:not|no|isn.?t|aren.?t|never|without|nothing)\s+(?:\w+\s+){0,2}$/i

export function recommendPriority(category, text = '') {
  const raw = String(text)
  const t = ' ' + raw.toLowerCase().replace(/\s+/g, ' ') + ' '
  let score = CATEGORY_BASE[category] ?? 1
  const reasons = []; const seen = new Set()
  const used = []
  const add = (pts, label, hit) => {
    if (hit && pts > 0 && label.indexOf('safety') !== 0) { const h = hit.toLowerCase(); if (used.some(u => u.includes(h))) return; used.push(h) }
    score += pts; const r = hit ? `${label}: "${hit}"` : label; if (!seen.has(label)) { seen.add(label); reasons.push(r) }
  }

  // 1. De-escalation first so we can ignore "not urgent"-style false hits
  let deescalated = false
  for (const p of DEESCALATE) { const h = first(rx(p), t); if (h) { deescalated = true; add(-2, 'low-urgency wording', h); break } }

  // 2. Safety: force Critical (unless clearly negated, e.g. "no fire")
  let safety = null
  for (const [p, label] of SAFETY) {
    const re = rx(p, 'ig'); let m
    while ((m = re.exec(t))) { if (!NEG.test(t.slice(Math.max(0, m.index - 24), m.index))) { safety = { label, hit: m[0] }; break } }
    if (safety) break
  }
  if (safety) add(9, `safety risk (${safety.label})`, safety.hit)

  // 3. Urgency signals (skip negated matches)
  for (const [p, w, label] of URGENT) {
    const re = rx(p, 'ig'); let m
    while ((m = re.exec(t))) {
      if (NEG.test(t.slice(Math.max(0, m.index - 20), m.index)) && !/^no /.test(m[0])) continue
      add(w, label, m[0]); break
    }
  }
  // 4. Context multipliers
  const imp = first(rx(IMPACT.join('|')), t); if (imp) add(2, 'affects many people', imp)
  const tm = first(rx(TIME.join('|')), t); if (tm) add(2, 'time-sensitive', tm)
  const ps = first(rx(PERSIST.join('|')), t); if (ps) add(1.5, 'ongoing or unresolved', ps)
  // 5. Category-specific
  for (const [p, w, label] of BY_CATEGORY[category] || []) { const h = first(rx(p), t); if (h) add(w, label, h) }
  // 6. Tone: shouting / exclamation marks
  const caps = (raw.match(/\b[A-Z]{4,}\b/g) || []).length; const ex = (raw.match(/!/g) || []).length
  if (!deescalated && (caps >= 1 || ex >= 2)) add(1, 'emphatic tone')

  score = Math.max(0, score)
  const level = safety ? 3 : score >= 9 ? 3 : score >= 5.5 ? 2 : score >= 2 ? 1 : 0
  // Confidence: strong when many independent signals or a clear margin from a threshold
  const cuts = [2, 5.5, 9]; const margin = Math.min(...cuts.map(c => Math.abs(score - c)))
  const signals = reasons.length
  const conf = safety ? 0.95 : Math.max(0.4, Math.min(0.92, 0.45 + 0.07 * signals + 0.08 * Math.min(margin, 3)))
  return { priority: PRIORITIES[level], reasons, score: Math.round(score * 10) / 10, confidence: conf >= 0.75 ? 'High' : conf >= 0.55 ? 'Medium' : 'Low', safety: !!safety }
}
