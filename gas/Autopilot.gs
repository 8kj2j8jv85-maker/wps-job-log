// Autopilot — the "Who's driving" switch put to work (Lex, 23 Oct 2026). New file in the WPS Amendments script.
// Plan: claude/WPS_Autopilot_Plan.md (project doc). Phases 0-3; Lex moves it up with "move up".
//
// What it does
// - Reads the switch the dashboard saves in the Job Log Sheet (Meta row "autopilot": {"mode":"claude"|"manual"}).
// - Manual: nothing here runs. BookReader behaves exactly as before (shadow log or queue draft).
// - Claude autopilot: every booking email BookReader reads becomes a card in the "Decisions" tab of the WPS Amendments
//   Sheet instead of a queue draft. Lex answers each card on the Decisions page (decisions.html): swipe right = yes,
//   left = no (with a reason, which becomes a booking-reader lesson), up = later, tap = choices or change the wording.
//   Reply drafts become cards too: they are only ever sent when Lex says yes (from hello@, navy look, in the thread).
// - Phases (Script property AU_PHASE, editor auPhase0 ... auPhase3): which cards autopilot applies on its own.
//     0  nothing on its own (trial)
//     1  tenant details for a job already booked; a tenant confirming a time for a job already booked
//     2  + new jobs and date / time changes that pass every check
//     3  + cancellations an agent states in plain words
//   Flagged cards (copied tenants, past date, missing postcode or type, duplicate, no clear job) and every email always
//   wait for Lex. Every change autopilot makes is logged with an Undo (14 days).
// - Never sends an email without Lex's yes. Never deletes a job: a cancellation clears the date (calendar entry removed),
//   parks the job and adds a CANCELLED note; Undo puts it back.
// - Alert: one email to Lex's phone address (BW.ALERT_TO, same as the booking-watch alert) when new cards are waiting,
//   at most one an hour, 07:00-21:00, subject "WPS: N decisions waiting", with the link to the Decisions page.
//
// Ops (Dash): auList (read), auDecide, auUndo, auSetMode (write; 23 Oct night: the switch from the Decisions page). Hook: BookReader brRun_ calls auTake_ (one line).
// Needs: Code (prop_, safeCell_, wpsEditorOnly_), Keeper (kpJobLogSs_, kpReadJobs_), Dash (dkMeta_), JobEdit (jeAdd_, jeEdit_,
// jeClean_), BookReader (BR, brLessonList_), BookingWatch (BW), WpsMail (wmHtml_, wmOn_), CheckinSend (CS, csLog_).
// Editor: auStatus, auPhase0 / auPhase1 / auPhase2 / auPhase3, auScorecard, auAlertNow.

const AU = {
  TAB: 'Decisions',
  HEAD: ['Id', 'Made', 'Kind', 'Category', 'Title', 'Status', 'Decided', 'Answer', 'Why', 'Result', 'Card (do not edit)'],
  PHASE_KEY: 'AU_PHASE',
  ALERT_KEY: 'AU_ALERT',                      // {at: ms of last alert, seen: newest card time alerted}
  ALERT_GAP_MIN: 60,
  ALERT_FROM_H: 7, ALERT_TO_H: 21,
  PAGE: 'https://8kj2j8jv85-maker.github.io/wps-job-log/decisions.html',
  UNDO_DAYS: 14,
  RECENT_DAYS: 7,
  REPLY_MAX: 1500,
  REPLIES_PER_DAY: 25,
  DEV: 'Autopilot',
  TZ: 'Europe/London',
  WORDS: { ICI: 'check-in', CO: 'check-out', MTI: 'mid-term inspection', SOC: 'schedule of condition', CLN: 'clean check' },
  AUTO: { 1: ['tenants', 'time'], 2: ['tenants', 'time', 'new', 'change'], 3: ['tenants', 'time', 'new', 'change', 'cancel'] },
  CHIPS: {                                    // "why not" buttons on the page -> lesson text ('' = no lesson)
    notbooking: 'Emails like this are not booking instructions: queue nothing for them.',
    wrongjob: 'Check the flat or house number and the job type before matching an email to a job.',
    wrongdate: 'Take the date and time from the newest email in the thread, never from quoted or older text.',
    oldtenants: 'Tenant details in this kind of email can be from an earlier tenancy: leave them out and ask the agent for the current tenants.',
    already: 'If the job already has this date, time and tenants, say it already matches and queue nothing.',
    mine: '',
    other: ''
  }
};
const AU_COL = {}; AU.HEAD.forEach(function (h, i) { AU_COL[h] = i; });

// ================================================================
// 1. PURE RULES (tested offline)
// ================================================================
function auParseSetting_(raw) {
  try { const v = typeof raw === 'string' ? JSON.parse(raw) : raw; return v && v.mode === 'claude' ? { mode: 'claude', at: String(v.at || '') } : { mode: 'manual', at: String((v && v.at) || '') }; }
  catch (e) { return { mode: 'manual', at: '' }; }
}
// Two saved switch values (Meta row "autopilot") -> the one changed last. a wins a tie or when neither has a time.
function auNewer_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a) return b; if (!b) return a;
  const ta = auParseSetting_(a).at, tb = auParseSetting_(b).at;
  return tb && tb > ta ? b : a;
}
function auPhaseNum_(v) { const n = Number(v); return n === 1 || n === 2 || n === 3 ? n : 0; }
function auNormPc_(s) { return String(s || '').toUpperCase().replace(/\s+/g, ''); }
function auFirstNum_(s) { const m = String(s || '').match(/\d+[A-Z]?/i); return m ? m[0].toUpperCase() : ''; }
function auSameProperty_(job, it) {                 // = dashboard sameProperty
  if (!it.postcode || auNormPc_(job.postcode) !== auNormPc_(it.postcode)) return false;
  const n = auFirstNum_(it.address);
  return !n || auFirstNum_(job.address) === n || String(job.address || '').toUpperCase().indexOf(n) !== -1;
}
function auDays_(a, b) { if (!a || !b) return 999; return Math.abs((new Date(a) - new Date(b)) / 864e5); }
// Jobs this card could be about (= dashboard findMatch, but keeps all candidates so an unclear match becomes a question).
function auCandidates_(jobs, it, today) {
  const ref = it.date || today;
  return (jobs || []).filter(function (j) { return j && j.status !== 'archived' && auSameProperty_(j, it) && (!it.type || j.type === it.type); })
    .sort(function (a, b) { return auDays_(a.date, ref) - auDays_(b.date, ref); });
}
function auHasTenants_(j) { return !!(String(j.tenants || '').trim() || String(j.tenantEmails || '').trim() || (j.tenantList || []).length); }
function auTenantOnly_(it) { return it.kind === 'update' && !it.date && !it.time && (it.tenantList || []).length > 0; }
// BookReader only fills copyTo when the sender is one of the agents, so no copyTo = a tenant (or a private landlord).
function auFromTenant_(it) { return !String(it.copyTo || '').trim(); }
// Why a card must wait for Lex whatever the phase (empty = clean).
function auFlags_(it, cands, today) {
  const f = [];
  if (/\bCheck:/.test(it.summary || '')) f.push(String(it.summary).split('Check:')[1].trim().replace(/\.$/, ''));
  if (!it.type) f.push('job type not clear');
  if (!it.postcode) f.push('no postcode');
  if (it.date && it.date < today && it.kind !== 'cancel') f.push('date already past');
  if (it.kind !== 'new' && !cands.length) f.push('no matching job in the Job Log');
  if (it.kind !== 'new' && cands.length > 1 && auDays_(cands[0].date, it.date || today) === auDays_(cands[1].date, it.date || today)) f.push('more than one job could be meant');
  if (it.kind === 'new' && cands.some(function (j) { return auDays_(j.date, it.date) <= 3 || (!j.date && !it.date); })) f.push('looks like it is already logged');
  return f;
}
// Category used for phases and the scorecard.
function auCategory_(it, flags) {
  if (flags.length) return 'flagged';
  if (it.kind === 'cancel') return 'cancel';
  if (it.kind === 'new') return 'new';
  if (auTenantOnly_(it)) return 'tenants';
  if (auFromTenant_(it)) return 'time';
  return 'change';
}
function auAutoOk_(cat, phase) { return (AU.AUTO[phase] || []).indexOf(cat) !== -1; }
// = dashboard qApplyUpdate (date, time, tenants only where the job has none, Copy to only where empty).
// Refine 2 (Lex 23 Oct): a time on a job where the tenants choose (check-ins and check-outs set to ask) is the TENANTS'
// time: check-ins set their arrival and Lex's own start (the client's lead, usually 1 h 15) before; check-outs the
// time they're out and ready. What happened goes on the job's Contact timeline as one dated line; nothing is written
// into Notes or the calendar (Courtyard 23 Oct: the reader's working note "check which client" ended up in both).
function auMins_(t) { const m = /^(\d\d):(\d\d)$/.exec(t || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; }
function auMinus_(t, mins) { const v = auMins_(t) - mins; if (isNaN(v) || v < 0) return t; return ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + v % 60).slice(-2); }
// How the job's time works: { tenants: bool, lead: minutes } (= dashboard asksTenants / visitLead).
function auTimeWay_(job, clients) {
  if (typeof csWay_ !== 'function') return { tenants: false, lead: 0 };
  if (job.type === 'ICI' && csWay_(job.client, clients) === 'ask') {
    const c = csClient_(job.client, clients), n = c ? Number(c.checkinLead) : NaN;
    return { tenants: true, lead: c && c.checkinLead !== '' && c.checkinLead != null && n >= 0 && n <= 240 ? Math.round(n) : 75 };
  }
  if (job.type === 'CO' && csCoWay_(job.client, clients) === 'ask') return { tenants: true, lead: 0 };
  return { tenants: false, lead: 0 };
}
function auWho_(it) {
  const f = String(it.sourceFrom || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim();
  return (f.split(/\s+/)[0] || 'Email');
}
function auUpdatePlan_(job, it, clients) {
  const ch = {}, said = [], tl = [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(it.date || '') && it.date !== job.date) { ch.date = it.date; said.push('date ' + it.date); tl.push('date ' + auDay_(it.date)); }
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(it.time || '')) {
    const w = auTimeWay_(job, clients || []);
    if (w.tenants) {
      const start = job.type === 'ICI' ? auMinus_(it.time, w.lead) : it.time;
      if (it.time !== job.tenantArrival) ch.tenantArrival = it.time;
      if (it.time !== job.tenantAsked) ch.tenantAsked = it.time;
      if (start !== job.time) ch.time = start;
      if (job.tenantTimeProposed) ch.tenantTimeProposed = false;
      if (ch.tenantArrival || ch.time) {
        said.push(job.type === 'ICI' ? 'tenants arriving ' + it.time + ', your start ' + start : 'tenants out and ready ' + it.time);
        tl.push(job.type === 'ICI' ? 'tenants arriving ' + it.time + ' (booked in at ' + start + ')' : 'tenants out and ready ' + it.time);
      }
    } else if (it.time !== job.time) { ch.time = it.time; said.push('time ' + it.time); tl.push('time ' + it.time); }
  }
  if ((it.tenantList || []).length) {
    const who = it.tenantList.map(function (t) { return t.name || t.email; }).join(', ');
    if (!auHasTenants_(job)) { ch.tenantList = it.tenantList; said.push('tenants ' + who); tl.push('tenant details added (' + who + ')'); }
    else tl.push('tenant details in the email not applied, job already has tenants: ' + it.tenantList.map(function (t) { return [t.name, t.phone, t.email].filter(Boolean).join(' '); }).join('; '));
  }
  if (it.copyTo && !String(job.agentEmail || '').trim()) ch.agentEmail = it.copyTo;
  if (tl.length) ch.contactAdd = (auWho_(it) + (it.sourceDate ? ' (email ' + auStamp_(it.sourceDate) + ')' : '') + ': ' + tl.join('; ') + '. Set from the Decisions page.').slice(0, 400);
  const before = { date: job.date || '', time: job.time || '', tenantList: job.tenantList || [], agentEmail: job.agentEmail || '',
    tenantArrival: job.tenantArrival || '', tenantAsked: job.tenantAsked || '', tenantTimeProposed: !!job.tenantTimeProposed };
  return { changes: ch, said: said, before: before, offer: !!(ch.tenantArrival || (ch.time && auTimeWay_(job, clients || []).tenants)) };
}
function auStamp_(iso) {
  const d = new Date(iso); if (isNaN(d)) return '';
  return Utilities.formatDate(d, AU.TZ, 'd MMM HH:mm');
}
function auCancelPlan_(job, it, nowIso) {
  // Refine 2: a dated Contact timeline line instead of a note (the reader's own wording stays on the Decisions card)
  const line = auWho_(it) + (it.sourceDate ? ' (email ' + auStamp_(it.sourceDate) + ')' : '') + ': cancelled by email. Date cleared, job parked (Decisions page).';
  return { changes: { date: '', time: '', parked: true, contactAdd: line.slice(0, 400) }, said: ['cancelled: date cleared, parked'],
    before: { date: job.date || '', time: job.time || '', parked: !!job.parkedAt } };
}
function auUndoChanges_(before) {
  const ch = {};
  ['date', 'time', 'agentEmail', 'notes', 'tenantArrival', 'tenantAsked'].forEach(function (k) { if (before[k] !== undefined) ch[k] = before[k]; });
  if (before.tenantTimeProposed !== undefined) ch.tenantTimeProposed = !!before.tenantTimeProposed;
  if (before.tenantList !== undefined) ch.tenantList = before.tenantList;
  if (before.parked !== undefined) ch.parked = !!before.parked;
  return ch;
}
function auDay_(iso) {                      // "2026-11-02" -> "Mon 2 Nov"
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return String(iso || '');
  const d = new Date(iso + 'T12:00:00Z');
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
}
function auWhen_(it) { return it.date ? auDay_(it.date) + (it.time ? ' ' + it.time : ', no time') : 'no date yet'; }
function auPlace_(it) { return [it.address, it.town, it.postcode].filter(Boolean).join(', '); }
// Card text for a booking item.
function auBookingCard_(it, cat, cands, flags) {
  const word = AU.WORDS[it.type] || 'job', job = cands[0] || null;
  let title;
  if (it.kind === 'new') title = 'Add this ' + word + ' to the Job Log?';
  else if (it.kind === 'cancel') title = 'Cancel ' + (job ? job.jobNo : 'this ' + word) + '?';
  else if (auTenantOnly_(it)) title = 'Add tenant details to ' + (job ? job.jobNo : 'this ' + word) + '?';
  else title = (job ? job.jobNo : 'This ' + word) + ': change to ' + auWhen_(it) + '?';
  const rows = [['Type', word], ['When', it.kind === 'update' && !it.date ? (job ? 'stays ' + auWhen_(job) : 'unchanged') : auWhen_(it)]];
  if (job && it.kind !== 'new') rows.push(['Job now', job.jobNo + ', ' + auWhen_(job)]);
  if (it.client) rows.push(['Client', it.client]);
  rows.push(['Tenants', (it.tenantList || []).length ? it.tenantList.map(function (t) { return t.name || t.email; }).join(', ') : 'none given']);
  if (it.notes) rows.push(['Notes', String(it.notes).slice(0, 200)]);
  const card = { kind: 'booking', cat: cat, title: title, place: auPlace_(it), rows: rows,
    why: flags.length ? 'Check: ' + flags.join('; ') + '.' : (it.summary || ''), item: it, jobId: job ? job.id : '', jobNo: job ? job.jobNo : '' };
  // Questions: which job, or what to do when there's no clear job.
  if (it.kind !== 'new' && (cands.length > 1 || !cands.length)) {
    card.question = cands.length ? 'Which job is this about?' : 'No job in the Job Log matches this. What should happen?';
    card.choices = cands.slice(0, 4).map(function (j) { return { label: j.jobNo + ' · ' + (AU.WORDS[j.type] || j.type) + ' · ' + auWhen_(j), act: 'apply', jobId: j.id }; })
      .concat(it.type && it.postcode && it.address && it.kind !== 'cancel' ? [{ label: 'Add it as a new job', act: 'add' }] : [])
      .concat([{ label: 'Nothing, ignore it', act: 'ignore' }]);
  }
  return card;
}
// Reply text: no links, no WhatsApp, no stray control characters; sign-off removed (the email adds its own).
function auReplyClean_(body) {
  let b = String(body || '').replace(/\r/g, '');
  b = b.split('\n').filter(function (l) { return !/whatsapp|wa\.me/i.test(l); }).join('\n');
  b = b.replace(/https?:\/\/\S+|www\.\S+/gi, '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>`\\]/g, ' ');
  const lines = b.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); });
  const cut = lines.findIndex(function (l, i) { return i > 0 && /^(kind regards|best regards|regards|many thanks|best wishes)[,.]?$/i.test(l); });
  return (cut > 0 ? lines.slice(0, cut) : lines).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, AU.REPLY_MAX);
}
function auReplyCard_(d, msg, it) {
  return { kind: 'reply', cat: 'reply', title: 'Send this reply?', place: it ? auPlace_(it) : '',
    rows: [['To', d.to], ['Copy', d.cc || 'nobody'], ['From', 'hello@, navy look']], body: auReplyClean_(d.body),
    to: d.to, cc: d.cc || '', all: !!d.all, msgId: msg.id, subject: msg.subject, type: it ? it.type : '', jobNo: '',
    why: 'Claude checked the calendar for this time. Nothing is sent until you say yes.' };
}
function auAskCard_(note, msg, it) {
  return { kind: 'ask', cat: 'ask', title: String(note).replace(/^Reply for Lex:\s*/, '').slice(0, 240), place: it ? auPlace_(it) : '',
    rows: [['From', String(msg.from || '').slice(0, 120)], ['Subject', String(msg.subject || '').slice(0, 160)]],
    question: 'How do you want to answer?', choices: [{ label: 'Write a reply (type or say it)', act: 'write' }, { label: 'No reply needed', act: 'ignore' }],
    msgId: msg.id, subject: msg.subject, to: (String(msg.from || '').match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/) || [''])[0], cc: '', all: false,
    type: it ? it.type : '', why: 'The booking reader thinks this needs your judgement.' };
}
function auLesson_(chip, note, card) {
  const base = Object.prototype.hasOwnProperty.call(AU.CHIPS, chip) ? AU.CHIPS[chip] : '';
  const extra = String(note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (!base && !extra) return '';
  const about = card && card.item && card.item.sourceSubject ? ' (email: "' + String(card.item.sourceSubject).slice(0, 80) + '")' : '';
  return ((base ? base + ' ' : '') + (extra ? 'Lex: ' + extra : '')).trim() + about;
}
// rows: Decisions tab rows (header removed) -> counts per category
function auScore_(rows, sinceMs) {
  const out = {};
  (rows || []).forEach(function (r) {
    const made = r[AU_COL.Made] instanceof Date ? r[AU_COL.Made].getTime() : Date.parse(r[AU_COL.Made]) || 0;
    if (sinceMs && made < sinceMs) return;
    const c = String(r[AU_COL.Category] || 'other'), s = String(r[AU_COL.Status] || ''), a = String(r[AU_COL.Answer] || '');
    const o = out[c] = out[c] || { cards: 0, yes: 0, changed: 0, no: 0, auto: 0, undone: 0, waiting: 0 };
    o.cards++;
    if (s === 'yes') { if (/changed/.test(a)) o.changed++; else o.yes++; }
    else if (s === 'auto') o.auto++;
    else if (s === 'no') o.no++;
    else if (s === 'undone') o.undone++;
    else if (s === 'waiting' || s === 'later') o.waiting++;
  });
  return out;
}
function auAlertText_(cards, total) {
  const lines = cards.slice(0, 8).map(function (c) { return '- ' + c.title + (c.place ? ' (' + c.place + ')' : ''); });
  return 'You have ' + total + ' decision' + (total === 1 ? '' : 's') + ' waiting:\n\n' + lines.join('\n') + (cards.length > 8 ? '\n- and ' + (cards.length - 8) + ' more' : '') +
    '\n\nOpen the Decisions page: ' + AU.PAGE + '\n\nNothing is sent to anyone until you say yes.\nWPS autopilot';
}

// ================================================================
// 2. SETTING, PHASE, TAB
// ================================================================
function auSetting_() {
  const c = CacheService.getScriptCache(), hit = c.get('au_setting');
  if (hit) return JSON.parse(hit);
  let s = { mode: 'manual', at: '' };
  try { s = auParseSetting_(dkMeta_(kpJobLogSs_()).autopilot || ''); } catch (e) {}
  c.put('au_setting', JSON.stringify(s), 60);
  return s;
}
// Who's driving switch from the Decisions page (Lex, 23 Oct night). Writes only the Meta row "autopilot" (not savedAt, so
// no device sees a clash); the dashboard picks it up on its next sync, and a dashboard save keeps whichever change is newer.
function auSetMode_(dev, b) {
  const mode = b && (b.mode === 'claude' || b.mode === 'manual') ? b.mode : '';
  if (!mode) return { ok: false, error: 'Unknown setting.' };
  const lock = LockService.getUserLock();   // same lock as the dashboard's save
  if (!lock.tryLock(20000)) return { ok: false, busy: true, error: 'Busy saving another change. Try again.' };
  try {
    const at = new Date().toISOString();
    jeMetaSet_(kpJobLogSs_(), 'autopilot', JSON.stringify({ mode: mode, at: at }));
    CacheService.getScriptCache().remove('au_setting');
    return { ok: true, mode: mode, at: at, logDetail: 'switch ' + mode };
  } finally { lock.releaseLock(); }
}
function auOn_() { return auSetting_().mode === 'claude'; }
function auPhase_() { return auPhaseNum_(PropertiesService.getScriptProperties().getProperty(AU.PHASE_KEY)); }
function auSetPhase_(n) { wpsEditorOnly_(); PropertiesService.getScriptProperties().setProperty(AU.PHASE_KEY, String(auPhaseNum_(n))); console.log('Autopilot phase now ' + auPhase_()); }
function auPhase0() { auSetPhase_(0); }
function auPhase1() { auSetPhase_(1); }
function auPhase2() { auSetPhase_(2); }
function auPhase3() { auSetPhase_(3); }
function auSheet_() {
  const ss = SpreadsheetApp.openById(prop_('SHEET_ID'));
  let sh = ss.getSheetByName(AU.TAB);
  if (!sh) {
    sh = ss.insertSheet(AU.TAB);
    sh.getRange(1, 1, 1, AU.HEAD.length).setValues([AU.HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function auRows_(sh) {
  sh = sh || auSheet_();
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, AU.HEAD.length).getValues() : [];
}
function auAdd_(card, status, result) {
  const now = new Date(), id = 'au' + now.getTime().toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 5);
  card.id = id; card.made = now.toISOString();
  const row = [id, now, card.kind, card.cat, card.title, status, status === 'auto' ? now : '', status === 'auto' ? 'autopilot' : '', '', result || '', JSON.stringify(card)];
  auSheet_().appendRow(row.map(function (v, i) { return i === 1 || i === 6 ? v : safeCell_(v); }));
  return id;
}
function auFind_(sh, id) {
  const rows = auRows_(sh);
  for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === id) {
    let card = {}; try { card = JSON.parse(rows[i][AU_COL['Card (do not edit)']]); } catch (e) {}
    return { row: i + 2, r: rows[i], card: card };
  }
  return null;
}
function auSet_(sh, hit, fields) {
  Object.keys(fields).forEach(function (k) {
    const v = k === 'Card (do not edit)' ? JSON.stringify(fields[k]) : fields[k];
    sh.getRange(hit.row, AU_COL[k] + 1).setValue(v instanceof Date ? v : safeCell_(v));
  });
}

// ================================================================
// 3. INTAKE (called by BookReader for every email it reads)
// ================================================================
// Returns true when autopilot took the email (BookReader then writes no queue draft and no Gmail draft).
function auTake_(m, msg, got, rep, data) {
  if (!auOn_()) return false;
  const phase = auPhase_(), today = Utilities.formatDate(new Date(), AU.TZ, 'yyyy-MM-dd');
  const trick = (got.flags || []).some(function (f) { return /trick/i.test(f); });
  if (trick) {
    auAdd_({ kind: 'info', cat: 'trick', title: 'Possible trick email: nothing was done', place: '', rows: [['From', String(msg.from).slice(0, 120)], ['Subject', String(msg.subject).slice(0, 160)]],
      why: (got.flags || []).join(' | ').slice(0, 300) }, 'waiting');
    return true;
  }
  let jobs = [], clients = [];
  try { jobs = kpReadJobs_(kpJobLogSs_()).jobs; } catch (e) {}
  try { clients = csRead_(kpJobLogSs_(), 'Clients'); } catch (e) {}
  (got.items || []).forEach(function (it) {
    const cands = auCandidates_(jobs, it, today), flags = auFlags_(it, cands, today), cat = auCategory_(it, flags);
    const card = auBookingCard_(it, cat, cands, flags);
    // Refine 2: on a job where the tenants choose, the card says what yes sets (their time and Lex's start)
    if (cands[0] && it.kind !== 'cancel' && /^([01]\d|2[0-3]):[0-5]\d$/.test(it.time || '')) {
      const w = auTimeWay_(cands[0], clients);
      if (w.tenants) {
        const st = cands[0].type === 'ICI' ? auMinus_(it.time, w.lead) : it.time;
        card.rows.splice(1, 1, ['When', (it.date ? auDay_(it.date) : auDay_(cands[0].date)) + (cands[0].type === 'ICI' ? ', tenants arriving ' + it.time : ', tenants out and ready ' + it.time)]);
        if (cands[0].type === 'ICI') card.rows.splice(2, 0, ['Your start', st + ' (' + w.lead + ' min before them)']);
        card.rows.push(['Email', 'Not sent. After yes you get an Email the tenants button (preview first).']);
      }
    }
    if (auAutoOk_(cat, phase) && !card.question) {
      const res = auApply_(card, null);
      card.done = res.done || null;
      if (res.email) card.email = res.email;
      auAdd_(card, res.ok ? 'auto' : 'waiting', res.text);
      if (res.ok) try { jobs = kpReadJobs_(kpJobLogSs_()).jobs; } catch (e) {}
    } else auAdd_(card, 'waiting', '');
  });
  const it0 = (got.items || [])[0] || null;
  if (rep && rep.draft) auAdd_(auReplyCard_(rep.draft, msg, it0), 'waiting', '');
  else if (rep && /^Reply for Lex:/.test(rep.note || '')) auAdd_(auAskCard_(rep.note, msg, it0), 'waiting', '');
  try { const lb = GmailApp.getUserLabelByName(BR.CHECKED_LABEL); if (lb) m.getThread().addLabel(lb); } catch (e) {}
  try { auAlert_(false); } catch (e) {}
  return true;
}

// ================================================================
// 4. APPLYING A BOOKING CARD (yes, a choice, or autopilot on its own)
// ================================================================
// opt: {jobId, add} from a choice. Returns {ok, text, done: {jobId, jobNo, before, added}}.
function auApply_(card, opt) {
  opt = opt || {};
  const it = card.item || {}, dev = AU.DEV, nowIso = new Date().toISOString();
  if (it.kind === 'new' || opt.add) {
    const r = jeAdd_(dev, { item: it, queueId: it.id });
    return r.ok ? { ok: true, text: 'Added as ' + r.jobNo + (r.calendar && r.calendar.ok === false ? ' (calendar: ' + r.calendar.error + ')' : ', calendar updated'), done: { jobId: r.id, jobNo: r.jobNo, added: true } }
      : { ok: false, text: r.error || 'Not added.' };
  }
  const jobs = kpReadJobs_(kpJobLogSs_()).jobs, id = opt.jobId || card.jobId;
  const job = jobs.filter(function (j) { return j.id === id; })[0];
  if (!job) return { ok: false, text: 'The job is no longer in the Job Log.' };
  let clients = []; try { clients = csRead_(kpJobLogSs_(), 'Clients'); } catch (e) {}
  const plan = it.kind === 'cancel' ? auCancelPlan_(job, it, nowIso) : auUpdatePlan_(job, it, clients);
  const offer = plan.offer || (it.kind !== 'cancel' && /^([01]\d|2[0-3]):[0-5]\d$/.test(it.time || '') && auTimeWay_(job, clients).tenants && job.tenantArrival === it.time);
  const em = offer && job.jobNo ? { job: job.jobNo, kind: 'confirm' } : null;
  const keys = Object.keys(plan.changes).filter(function (k) { return k !== 'contactAdd'; });
  if (!keys.length) return { ok: true, text: job.jobNo + ' already matches. Nothing changed.', done: null, email: em };
  const r = jeEdit_(dev, { id: job.id, changes: plan.changes });
  return r.ok ? { ok: true, text: job.jobNo + ': ' + plan.said.join('; ').slice(0, 300) + (em ? '. Confirm email not sent: tap Email the tenants.' : ''), done: { jobId: job.id, jobNo: job.jobNo, before: plan.before }, email: em }
    : { ok: false, text: r.error || 'Not changed.' };
}
function auUndoDone_(done) {
  if (!done || !done.jobId) return { ok: false, text: 'Nothing to undo.' };
  if (done.added) {
    const r = jeEdit_(AU.DEV, { id: done.jobId, changes: { date: '', time: '', parked: true, notesAdd: 'UNDONE by Lex: added by autopilot by mistake.' } });
    return r.ok ? { ok: true, text: done.jobNo + ' taken off the diary and parked (jobs are never deleted).' } : { ok: false, text: r.error };
  }
  const r = jeEdit_(AU.DEV, { id: done.jobId, changes: auUndoChanges_(done.before || {}) });
  return r.ok ? { ok: true, text: done.jobNo + ' put back as it was.' } : { ok: false, text: r.error };
}

// ================================================================
// 5. SENDING A REPLY (only on Lex's yes)
// ================================================================
function auSendReply_(card, text) {
  const p = PropertiesService.getScriptProperties(), day = Utilities.formatDate(new Date(), AU.TZ, 'yyyyMMdd');
  const n = Number(p.getProperty('AU_SENT_' + day) || 0);
  if (n >= AU.REPLIES_PER_DAY) return { ok: false, text: 'Daily limit of ' + AU.REPLIES_PER_DAY + ' replies reached.' };
  const body = auReplyClean_(text);
  if (body.length < 10) return { ok: false, text: 'The reply is empty.' };
  let m = null; try { m = GmailApp.getMessageById(card.msgId); } catch (e) {}
  if (!m) return { ok: false, text: 'The email it answers has gone from Gmail.' };
  const paras = body.split(/\n{2,}/).map(function (x) { return x.trim(); }).filter(Boolean);
  const title = card.type ? 'Your ' + (AU.WORDS[card.type] || 'visit') : 'Wellington Property Services';
  const html = typeof wmOn_ === 'function' && wmOn_() ? wmHtml_({ title: title.charAt(0).toUpperCase() + title.slice(1), preheader: paras[0].slice(0, 90), blocks: paras.map(function (x) { return { p: x }; }) }) : '';
  const plain = body + (typeof CS !== 'undefined' ? CS.SIG : '\n\nKind regards,\nWellington Property Services');
  const opt = { name: typeof CS !== 'undefined' ? CS.NAME : 'Wellington Property Services' };
  if (html) opt.htmlBody = html;
  try { if (typeof CS !== 'undefined' && GmailApp.getAliases().indexOf(CS.FROM) !== -1) opt.from = CS.FROM; } catch (e) {}
  if (card.cc) opt.cc = card.cc;
  if (card.all) m.replyAll(plain, opt); else m.reply(plain, opt);
  p.setProperty('AU_SENT_' + day, String(n + 1));
  try { if (typeof csLog_ === 'function' && card.jobNo) csLog_(card.jobNo, 'au-reply', '', card.to, card.cc, 'Sent', 'Reply from the Decisions page: ' + paras[0].slice(0, 120), 'Decisions'); } catch (e) {}
  return { ok: true, text: 'Sent to ' + card.to + (card.cc ? ', copy ' + card.cc : '') + (opt.from ? ' from ' + opt.from : '') + '.' };
}

// ================================================================
// 6. OPS (Dash, device key)
// ================================================================
function auPublic_(card, r) {
  return { id: String(r[0]), made: card.made || '', kind: card.kind, cat: card.cat, title: card.title, place: card.place || '', rows: card.rows || [],
    why: card.why || '', body: card.body || '', question: card.question || '', choices: (card.choices || []).map(function (c) { return { label: c.label, act: c.act }; }),
    status: String(r[AU_COL.Status]), result: String(r[AU_COL.Result] || ''), answer: String(r[AU_COL.Answer] || ''),
    decided: r[AU_COL.Decided] instanceof Date ? r[AU_COL.Decided].toISOString() : String(r[AU_COL.Decided] || ''),
    email: card.email && (String(r[AU_COL.Status]) === 'auto' || String(r[AU_COL.Status]) === 'yes') ? card.email : null,
    undo: !!(card.done && card.done.jobId) && (String(r[AU_COL.Status]) === 'auto' || String(r[AU_COL.Status]) === 'yes'),
    src: card.item ? { from: card.item.sourceFrom || '', subject: card.item.sourceSubject || '', date: card.item.sourceDate || '', url: card.item.sourceUrl || '' } : null };
}
function auList_(dev) {
  const rows = auRows_(), out = [], recent = [], cut = Date.now() - AU.RECENT_DAYS * 864e5;
  rows.forEach(function (r) {
    let card = {}; try { card = JSON.parse(r[AU_COL['Card (do not edit)']]); } catch (e) { return; }
    const st = String(r[AU_COL.Status]);
    if (st === 'waiting' || st === 'later') out.push(auPublic_(card, r));
    else { const t = r[AU_COL.Decided] instanceof Date ? r[AU_COL.Decided].getTime() : 0; if (t >= cut) recent.push(auPublic_(card, r)); }
  });
  out.sort(function (a, b) { return (a.status === 'later') - (b.status === 'later') || String(a.made).localeCompare(String(b.made)); });
  recent.sort(function (a, b) { return String(b.decided).localeCompare(String(a.decided)); });
  return { ok: true, mode: auSetting_().mode, modeAt: auSetting_().at, phase: auPhase_(), cards: out.slice(0, 60), recent: recent.slice(0, 25), score: auScore_(rows, Date.now() - 7 * 864e5) };
}
// b: {id, answer: 'yes'|'no'|'later'|'choice', choice: index, body: edited reply text, why: chip, note: free text}
function auDecide_(dev, b) {
  const id = String(b && b.id || '');
  if (!/^au[a-z0-9]{6,30}$/.test(id)) return { ok: false, error: 'Unknown card.' };
  const answer = String(b.answer || '');
  if (['yes', 'no', 'later', 'choice'].indexOf(answer) === -1) return { ok: false, error: 'Unknown answer.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, busy: true, error: 'Busy, try again in a moment.' };
  try {
    const sh = auSheet_(), hit = auFind_(sh, id);
    if (!hit) return { ok: false, error: 'Card not found.' };
    const st = String(hit.r[AU_COL.Status]);
    if (st !== 'waiting' && st !== 'later') return { ok: false, error: 'Already answered (' + st + ').' };
    const card = hit.card, now = new Date();
    if (answer === 'later') { auSet_(sh, hit, { Status: 'later', Answer: 'later' }); return { ok: true, status: 'later', logDetail: id + ' later' }; }
    if (answer === 'no') {
      const lesson = auLesson_(String(b.why || ''), b.note, card);
      if (lesson && card.kind !== 'info') auAddLesson_(lesson);
      auSet_(sh, hit, { Status: 'no', Decided: now, Answer: 'no', Why: [b.why, b.note].filter(Boolean).join(': ').slice(0, 300), Result: lesson ? 'Lesson saved' : 'Dropped' });
      return { ok: true, status: 'no', lesson: lesson, logDetail: id + ' no' + (lesson ? ' + lesson' : '') };
    }
    let res, ans = answer;
    if (card.kind === 'info') res = { ok: true, text: 'Noted.' };
    else if (card.kind === 'reply' || (card.kind === 'ask' && answer === 'yes')) {
      const text = b.body != null && String(b.body).trim() ? String(b.body) : card.body;
      if (card.kind === 'ask' && !String(b.body || '').trim()) return { ok: false, error: 'Write the reply first.' };
      if (card.kind === 'reply' && auReplyClean_(text) !== auReplyClean_(card.body)) ans = 'yes (changed)';
      res = auSendReply_(card, text);
      if (res.ok) card.sentBody = auReplyClean_(text);
    } else if (answer === 'choice') {
      const c = (card.choices || [])[Number(b.choice)];
      if (!c) return { ok: false, error: 'Unknown choice.' };
      ans = 'choice: ' + c.label;
      if (c.act === 'ignore') { auSet_(sh, hit, { Status: 'no', Decided: now, Answer: ans, Result: 'Ignored' }); return { ok: true, status: 'no', logDetail: id + ' ignored' }; }
      if (c.act === 'write') return { ok: false, error: 'Type the reply and press Send.' };
      res = auApply_(card, c.act === 'add' ? { add: true } : { jobId: c.jobId });
    } else res = auApply_(card, null);
    if (res.done) card.done = res.done;
    if (res.email) card.email = res.email;
    auSet_(sh, hit, { Status: res.ok ? 'yes' : 'failed', Decided: now, Answer: ans, Result: String(res.text).slice(0, 500), 'Card (do not edit)': card });
    return { ok: res.ok, status: res.ok ? 'yes' : 'failed', result: res.text, email: res.ok ? (res.email || null) : null, error: res.ok ? '' : res.text, logDetail: id + ' ' + ans + ': ' + String(res.text).slice(0, 150) };
  } finally { lock.releaseLock(); }
}
function auUndo_(dev, b) {
  const id = String(b && b.id || '');
  if (!/^au[a-z0-9]{6,30}$/.test(id)) return { ok: false, error: 'Unknown card.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return { ok: false, busy: true, error: 'Busy, try again in a moment.' };
  try {
    const sh = auSheet_(), hit = auFind_(sh, id);
    if (!hit) return { ok: false, error: 'Card not found.' };
    const st = String(hit.r[AU_COL.Status]), t = hit.r[AU_COL.Decided] instanceof Date ? hit.r[AU_COL.Decided].getTime() : 0;
    if ((st !== 'auto' && st !== 'yes') || !hit.card.done) return { ok: false, error: 'This one can\'t be undone here.' };
    if (Date.now() - t > AU.UNDO_DAYS * 864e5) return { ok: false, error: 'Older than ' + AU.UNDO_DAYS + ' days: change the job by hand.' };
    const res = auUndoDone_(hit.card.done);
    if (res.ok) auSet_(sh, hit, { Status: 'undone', Result: (String(hit.r[AU_COL.Result]) + ' | UNDONE: ' + res.text).slice(0, 500) });
    return { ok: res.ok, result: res.text, error: res.ok ? '' : res.text, logDetail: id + ' undo: ' + res.text };
  } finally { lock.releaseLock(); }
}

// ================================================================
// 7. LESSONS, ALERT, EDITOR
// ================================================================
function auAddLesson_(text) {
  try {
    const ss = SpreadsheetApp.openById(prop_('SHEET_ID'));
    let sh = ss.getSheetByName(BR.LESSONS_TAB);
    if (!sh) { sh = ss.insertSheet(BR.LESSONS_TAB); sh.getRange(1, 1, 1, 3).setValues([['Lesson (one per row, plain English)', 'Added', 'On (N = off)']]).setFontWeight('bold'); sh.setFrozenRows(1); }
    sh.appendRow([safeCell_(text), Utilities.formatDate(new Date(), AU.TZ, 'd MMM') + ' (swipe)', '']);
  } catch (e) { console.error('Lesson not saved: ' + e); }
}
function auAlert_(force) {
  if (!force && !auOn_()) return { sent: false, why: 'manual' };
  const to = typeof BW !== 'undefined' ? BW.ALERT_TO : '';
  if (!to) return { sent: false, why: 'no alert address' };
  const p = PropertiesService.getScriptProperties();
  let a = {}; try { a = JSON.parse(p.getProperty(AU.ALERT_KEY) || '{}'); } catch (e) {}
  const now = new Date(), h = Number(Utilities.formatDate(now, AU.TZ, 'H'));
  if (!force && (h < AU.ALERT_FROM_H || h >= AU.ALERT_TO_H)) return { sent: false, why: 'quiet hours' };
  if (!force && a.at && now.getTime() - a.at < AU.ALERT_GAP_MIN * 60e3) return { sent: false, why: 'sent in the last hour' };
  const rows = auRows_(), waiting = [];
  let newest = 0;
  rows.forEach(function (r) {
    if (String(r[AU_COL.Status]) !== 'waiting') return;
    const t = r[AU_COL.Made] instanceof Date ? r[AU_COL.Made].getTime() : 0;
    let c = {}; try { c = JSON.parse(r[AU_COL['Card (do not edit)']]); } catch (e) {}
    waiting.push(c); newest = Math.max(newest, t);
  });
  if (!waiting.length || (!force && newest <= (a.seen || 0))) return { sent: false, why: 'nothing new' };
  GmailApp.sendEmail(to, 'WPS: ' + waiting.length + ' decision' + (waiting.length === 1 ? '' : 's') + ' waiting', auAlertText_(waiting, waiting.length), { name: 'WPS autopilot' });
  p.setProperty(AU.ALERT_KEY, JSON.stringify({ at: now.getTime(), seen: newest }));
  return { sent: true, count: waiting.length };
}
function auAlertNow() { wpsEditorOnly_(); console.log(JSON.stringify(auAlert_(true))); }
function auStatus() { wpsEditorOnly_(); console.log(JSON.stringify({ setting: auSetting_(), phase: auPhase_(), waiting: auList_('editor').cards.length, alert: PropertiesService.getScriptProperties().getProperty(AU.ALERT_KEY) || '' }, null, 1)); }
function auScorecard() { wpsEditorOnly_(); console.log(JSON.stringify(auScore_(auRows_(), Date.now() - 7 * 864e5), null, 1)); }
