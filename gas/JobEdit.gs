// JobEdit — one-job changes through the script (build plan item 5, connection map step 2, 22 Oct 2026). New file in the WPS Amendments script.
//
// Until now the only way to change a job (stage, dates, tenants, notes, invoice, keys) was the dashboard saving the whole Job Log
// from the browser (Dash op jlSave). That can't be done safely from anywhere else, so these ops change ONE job (or one client) on the
// server, under the same lock the dashboard's save uses, with the same rules the dashboard's buttons use (copied from index.html:
// setJobStatus, pickInvoice, parkJob, keysReturned, jobFromItem, nextJobNumber, gcalEventBody, setPrice). Every write bumps the
// Sheet's savedAt, so an open dashboard holding older data gets "changed on another device", re-reads and merges, exactly as it does
// for Keeper's writes. Each change goes into the job's history with the device name (PC / iPhone / Claude ...).
//
// Ops (Dash WRITE_OPS): jobEdit, jobAdd, queueDone, clientSet. Any device key can use them, so Lex can too; the connector (device
// "Claude") uses them instead of jlSave, which the Claude key is refused (Dash DK.DENY).
// Needs: Keeper (kpJobLogSs_, kpReadJobs_, kpWriteJobs_, kpNorm_, KP_LINK_RE, KP_LABELS), Dash (dkMeta_, dkCalSave_, dkCalDelete_, DK).

const JE = {
  STATUSES: ['booked', 'processing', 'completed', 'sent', 'signed', 'deemed', 'archived'],
  REPORT_OUT: ['sent', 'signed', 'deemed', 'archived'],
  TYPES: ['ICI', 'CO', 'MTI', 'SOC', 'CLN'],
  KEYS_FROM: { tenant: 'Tenant lets me in', office: 'Agent office', concierge: 'Concierge', lockbox: 'Key safe / lockbox', landlord: 'Landlord', other: 'Other (see note)' },
  KEYS_BACK: { none: 'Nothing to return', office: 'Agent office', concierge: 'Concierge', lockbox: 'Key safe / lockbox', property: 'Leave in the property', landlord: 'Landlord', tenant: 'Hand to tenant', other: 'Other (see note)' },
  MAX_TENANTS: 6,
  TEXT_MAX: 2000,
  PRICE_KEYS: /^(\d{1,2}|extra|congestion|house\d?)$/,      // bedroom counts and the extras the price list uses
  TZ: 'Europe/London'
};

// ================================================================
// 1. PURE RULES (tested offline)
// ================================================================
function jeClean_(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[\t ]+/g, ' ').replace(/ {2,}/g, ' ').trim().slice(0, n || 200); }
function jeEmails_(v) { return String(v || '').split(/[,;\s]+/).map(function (x) { return x.trim().replace(/^<|>$/g, ''); }).filter(function (x) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x); }).join(', '); }
function jePc_(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(c) ? c.slice(0, -3) + ' ' + c.slice(-3) : null;
}
function jeTenantRows_(list) {
  return (Array.isArray(list) ? list : []).map(function (t) {
    return { name: jeClean_(t && t.name, 80), phone: jeClean_(t && t.phone, 30), email: jeEmails_(t && t.email).split(', ')[0] || '' };
  }).filter(function (r) { return r.name || r.phone || r.email; }).slice(0, JE.MAX_TENANTS);
}
function jeSetTenants_(j, rows) {             // = dashboard setTenantRows
  j.tenantList = rows;
  j.tenants = rows.map(function (t) { return [t.name, t.phone].filter(Boolean).join(' '); }).filter(Boolean).join('; ');
  j.tenantEmails = jeEmails_(rows.map(function (t) { return t.email || ''; }).join(', '));
  j.tenantPhones = rows.map(function (t) { return t.phone; }).filter(Boolean).join(', ');
}
function jeHistory_(j, dev, what, now) {
  j.history = Array.isArray(j.history) ? j.history : [];
  j.history.unshift({ at: now.toISOString(), dev: String(dev || 'WPS script').slice(0, 40), what: String(what).slice(0, 300) });
  if (j.history.length > 40) j.history.length = 40;
}
function jeSetStatus_(j, code, nowIso) {      // = dashboard setJobStatus
  j.status = code;
  if (code === 'processing' && !j.processingAt) j.processingAt = nowIso;
  if (code === 'booked') delete j.processingAt;
  if (JE.REPORT_OUT.indexOf(code) !== -1 && !j.sentAt) j.sentAt = nowIso;
  if (JE.REPORT_OUT.indexOf(code) === -1) { delete j.sentAt; delete j.reissuedAt; delete j.reissues; delete j.reminderAt; }
  if (code === 'deemed' && !j.deemedAt) j.deemedAt = nowIso;
  if (code !== 'deemed') delete j.deemedAt;
  if (code === 'signed' && !j.signedAt) j.signedAt = nowIso;
  if (code !== 'signed' && code !== 'archived') delete j.signedAt;
}
function jeSetInvoice_(j, code, nowIso) {     // = dashboard pickInvoice
  if (code === 'invoiced') { j.invoice = 'invoiced'; if (!j.invoicedAt) j.invoicedAt = nowIso; delete j.paidAt; }
  else if (code === 'paid') { j.invoice = 'paid'; if (!j.invoicedAt) j.invoicedAt = nowIso; j.paidAt = nowIso; }
  else { j.invoice = ''; delete j.paidAt; delete j.invoicedAt; }
}
// Apply a changes object to a copy of the job. Returns { job, said: [what changed], errors: [], calendar: bool }.
// Only the fields listed here can change; anything else is refused by name.
function jeApply_(job, changes, nowIso, clients) {
  const j = JSON.parse(JSON.stringify(job)), said = [], errors = [];
  let calendar = false;
  const set = function (k, v, label) { if (String(j[k] == null ? '' : j[k]) !== String(v)) { said.push((label || k) + ': ' + (j[k] || '–') + ' → ' + (v === '' ? '–' : v)); j[k] = v; return true; } return false; };
  Object.keys(changes || {}).forEach(function (k) {
    const v = changes[k];
    switch (k) {
      case 'status':
        if (JE.STATUSES.indexOf(v) === -1) { errors.push('status must be one of ' + JE.STATUSES.join(', ')); break; }
        if (j.status !== v) { said.push('Status: ' + (KP_LABELS[j.status] || j.status || '–') + ' → ' + (KP_LABELS[v] || v)); jeSetStatus_(j, v, nowIso); }
        break;
      case 'date':
        if (v !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { errors.push('date must be YYYY-MM-DD or ""'); break; }
        if (set('date', v, 'Date')) calendar = true; break;
      case 'time':
        if (v !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { errors.push('time must be HH:MM (24 h) or ""'); break; }
        if (set('time', v, 'Time')) calendar = true; break;
      case 'type':
        if (JE.TYPES.indexOf(v) === -1) { errors.push('type must be one of ' + JE.TYPES.join(', ')); break; }
        if (set('type', v, 'Type')) calendar = true; break;
      case 'client': {
        const want = String(v || '').toLowerCase().replace(/[^a-z]/g, '');
        const hit = (clients || []).filter(function (c) { return c.toLowerCase().replace(/[^a-z]/g, '') === want; })[0];
        if (!hit) { errors.push('client "' + jeClean_(v, 60) + '" is not in the client list (add it with clientSet first)'); break; }
        if (set('client', hit, 'Client')) calendar = true; break;
      }
      case 'address': case 'town':
        if (set(k, jeClean_(v, 160), k === 'address' ? 'Address' : 'Town')) calendar = true; break;
      case 'postcode': {
        const pc = v === '' ? '' : jePc_(v);
        if (pc === null) { errors.push('postcode "' + jeClean_(v, 20) + '" is not a UK postcode'); break; }
        if (set('postcode', pc, 'Postcode')) calendar = true; break;
      }
      case 'bedrooms': case 'extraAreas':
        if (!/^\d{0,2}$/.test(String(v))) { errors.push(k + ' must be a number'); break; }
        set(k, String(v), k === 'bedrooms' ? 'Bedrooms' : 'Extra areas'); break;
      case 'propertyType':
        if (['', 'Flat', 'House'].indexOf(v) === -1) { errors.push('propertyType must be Flat, House or ""'); break; }
        set('propertyType', v, 'Property type'); break;
      case 'tenantList': {
        const rows = jeTenantRows_(v), before = JSON.stringify([j.tenants || '', j.tenantEmails || '']), was = j.tenants || '';
        jeSetTenants_(j, rows);
        if (before !== JSON.stringify([j.tenants || '', j.tenantEmails || ''])) { said.push('Tenants: ' + (was || '–') + ' → ' + (j.tenants || '–') + '; Tenant emails: ' + (j.tenantEmails || '–')); calendar = true; }
        break;
      }
      case 'agentEmail':
        if (set('agentEmail', jeEmails_(v), 'Copy to')) calendar = true; break;
      case 'notes':
        if (set('notes', jeClean_(v, JE.TEXT_MAX).replace(/\\n/g, '\n'), 'Notes')) calendar = true; break;
      case 'notesAdd': {
        const line = jeClean_(v, 500);
        if (line) { j.notes = (j.notes ? j.notes + '\n' : '') + line; said.push('Note added: ' + line); calendar = true; }
        break;
      }
      case 'invoice':
        if (['', 'invoiced', 'paid'].indexOf(v) === -1) { errors.push('invoice must be "", invoiced or paid'); break; }
        if ((j.invoice || '') !== v) { said.push('Invoice: ' + (j.invoice || '–') + ' → ' + (v || '–')); jeSetInvoice_(j, v, nowIso); }
        break;
      case 'invoiceNo':
        if (v !== '' && !/^INV-\d{3,6}$/.test(v)) { errors.push('invoiceNo must look like INV-0021'); break; }
        set('invoiceNo', v, 'Invoice no'); break;
      case 'invoiceAmount':
        if (v !== '' && !/^£?\d{1,5}(\.\d{2})?$/.test(String(v))) { errors.push('invoiceAmount must be like £180.00'); break; }
        set('invoiceAmount', String(v), 'Invoice amount'); break;
      case 'keysFrom':
        if (v !== '' && !JE.KEYS_FROM[v]) { errors.push('keysFrom must be one of ' + Object.keys(JE.KEYS_FROM).join(', ') + ' or ""'); break; }
        if (set('keysFrom', v, 'Keys from')) calendar = true; break;
      case 'keysBack':
        if (v !== '' && !JE.KEYS_BACK[v]) { errors.push('keysBack must be one of ' + Object.keys(JE.KEYS_BACK).join(', ') + ' or ""'); break; }
        if (set('keysBack', v, 'Keys back to')) calendar = true; break;
      case 'keysFromNote': case 'keysBackNote':
        if (set(k, jeClean_(v, 120), k === 'keysFromNote' ? 'Keys from note' : 'Keys back note')) calendar = true; break;
      case 'keysReturned':
        if (v === true && !j.keysReturnedAt) { j.keysReturnedAt = nowIso; said.push('Keys marked returned'); calendar = true; }
        else if (v === false && j.keysReturnedAt) { delete j.keysReturnedAt; said.push('Keys returned mark removed'); calendar = true; }
        break;
      case 'parked':
        if (v === true && !j.parkedAt) { j.parkedAt = nowIso; said.push('Parked (off Do next)'); }
        else if (v === false && j.parkedAt) { delete j.parkedAt; said.push('Back on Do next'); }
        break;
      case 'noVisitReminder': case 'congestion':
        if (typeof v !== 'boolean') { errors.push(k + ' must be true or false'); break; }
        if (!!j[k] !== v) { said.push(k + ': ' + v); j[k] = v; }
        break;
      case 'parkingExtra':
        if (v !== '' && !/^£?\d{1,3}(\.\d{2})?$/.test(String(v))) { errors.push('parkingExtra must be like £4.50 or ""'); break; }
        set('parkingExtra', String(v), 'Parking'); break;
      // Refine 2 (23 Oct): the tenants' time (check-ins: they arrive, Lex starts earlier; check-outs: out and ready)
      case 'tenantArrival': case 'tenantAsked':
        if (v !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) { errors.push(k + ' must be HH:MM (24 h) or ""'); break; }
        set(k, v, k === 'tenantArrival' ? 'Tenants arriving' : 'Tenants asked for'); break;
      case 'tenantTimeProposed':
        if (typeof v !== 'boolean') { errors.push('tenantTimeProposed must be true or false'); break; }
        if (v && !j.tenantTimeProposed) { j.tenantTimeProposed = true; said.push('Waiting for the tenants to agree'); }
        else if (!v && j.tenantTimeProposed) { delete j.tenantTimeProposed; said.push('Tenants agreed the time'); }
        break;
      case 'contactAdd': {                              // a dated line on the job's Contact timeline (= dashboard ciAddNote)
        const line = jeClean_(v, 400);
        if (line) { j.contactLog = Array.isArray(j.contactLog) ? j.contactLog : []; j.contactLog.unshift({ at: nowIso, text: line }); if (j.contactLog.length > 60) j.contactLog.length = 60; said.push('Contact timeline: ' + line); }
        break;
      }
      case 'photoLink':
        if (v !== '' && !KP_LINK_RE.test(String(v))) { errors.push('photoLink must be a web address'); break; }
        set('photoLink', String(v), 'Photo link'); break;
      default:
        errors.push('"' + jeClean_(k, 30) + '" can\'t be changed this way');
    }
  });
  return { job: j, said: said, errors: errors, calendar: calendar };
}
// = dashboard nextJobNumber: WPS + yy + mm (from the visit date, else today) + 2 digits, never reusing a number (Meta jobNoHigh).
function jeNextJobNo_(dateStr, jobs, high, now) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? new Date(dateStr + 'T12:00:00Z') : now;
  const ym = Utilities.formatDate(d, JE.TZ, 'yyMM'), prefix = 'WPS' + ym;
  let top = Number((high || {})[prefix] || 0);
  (jobs || []).forEach(function (j) { const m = new RegExp('^' + prefix + '(\\d+)$').exec(String(j.jobNo || '')); if (m) top = Math.max(top, parseInt(m[1], 10)); });
  const n = top + 1;
  return { jobNo: prefix + (n < 10 ? '0' + n : String(n)), prefix: prefix, n: n };
}
// = dashboard findDuplicate: same postcode, same house number, same type, within 3 days.
function jeDuplicate_(jobs, it) {
  const pc = String(it.postcode || '').toUpperCase().replace(/\s+/g, '');
  if (!pc) return null;
  const num = (String(it.address || '').match(/\d+/) || [''])[0];
  return (jobs || []).filter(function (j) {
    if (String(j.postcode || '').toUpperCase().replace(/\s+/g, '') !== pc || j.type !== it.type) return false;
    const jn = (String(j.address || '').match(/\d+/) || [''])[0];
    if (num && jn !== num && String(j.address || '').toLowerCase().indexOf(num) === -1) return false;
    if (!j.date || !it.date) return !j.date && !it.date;
    return Math.abs((new Date(j.date) - new Date(it.date)) / 864e5) <= 3;
  })[0] || null;
}
// = dashboard gcalEventBody (title, location, description, 1-hour timed event or all-day).
function jeCalBody_(j) {
  const full = [j.address, j.town, j.postcode].map(function (s) { return jeClean_(s, 200); }).filter(Boolean).join(', ');
  let start, end;
  if (j.date && j.time) {
    const p = j.time.split(':').map(Number); let eh = p[0] + 1, em = p[1]; if (eh > 23) { eh = 23; em = 59; }
    const two = function (n) { return (n < 10 ? '0' : '') + n; };
    start = { dateTime: j.date + 'T' + j.time + ':00', timeZone: JE.TZ };
    end = { dateTime: j.date + 'T' + two(eh) + ':' + two(em) + ':00', timeZone: JE.TZ };
  } else if (j.date) {
    const nd = new Date(j.date + 'T00:00:00Z'); nd.setUTCDate(nd.getUTCDate() + 1);
    start = { date: j.date }; end = { date: nd.toISOString().slice(0, 10) };
  } else return null;
  const from = JE.KEYS_FROM[j.keysFrom] || '', back = JE.KEYS_BACK[j.keysBack] || '';
  const ka = from ? (j.keysFrom === 'tenant' ? from : 'collect from ' + from.toLowerCase()) + (j.keysFromNote ? ' (' + j.keysFromNote + ')' : '') : '';
  const kb = back && j.keysBack !== 'none' ? 'back to ' + back.toLowerCase() + (j.keysBackNote ? ' (' + j.keysBackNote + ')' : '') : '';
  const keys = [ka, kb].filter(Boolean).join(' · ') + (j.keysReturnedAt && (ka || kb) ? ' · returned ' + Utilities.formatDate(new Date(j.keysReturnedAt), JE.TZ, 'EEE d MMM') : '');
  const desc = [];
  if (j.client) desc.push('Agent: ' + j.client);
  if (j.tenants) desc.push('Tenant/contact: ' + j.tenants);
  if (j.tenantEmails) desc.push('Tenant emails: ' + j.tenantEmails);
  if (j.agentEmail) desc.push('Copy to: ' + j.agentEmail);
  if (keys) desc.push('Keys: ' + keys);
  if (j.notes) desc.push('Notes: ' + j.notes);
  return { summary: [j.jobNo, j.type, full].filter(Boolean).join(' - '), location: full, description: desc.join('\n'), start: start, end: end };
}
// Client changes (= dashboard setCheckinWay / saveAgentContact / setPrice). Returns { client, said, errors }.
function jeClientApply_(c, changes) {
  const x = JSON.parse(JSON.stringify(c || {})), said = [], errors = [];
  Object.keys(changes || {}).forEach(function (k) {
    const v = changes[k];
    if (k === 'contactName' || k === 'contactPhone') { const s = jeClean_(v, 80); if ((x[k] || '') !== s) { x[k] = s; said.push(k + ': ' + (s || '–')); } }
    else if (k === 'contactEmail') { const s = jeEmails_(v).split(', ')[0] || ''; if ((x[k] || '') !== s) { x[k] = s; said.push('contactEmail: ' + (s || '–')); } }
    else if (k === 'checkinWay') { if (['ask', 'agent'].indexOf(v) === -1) errors.push('checkinWay must be ask or agent'); else if (x.checkinWay !== v) { x.checkinWay = v; said.push('Check-in arrangement: ' + v); } }
    else if (k === 'checkoutWay') { if (['ask', 'none'].indexOf(v) === -1) errors.push('checkoutWay must be ask or none'); else if (x.checkoutWay !== v) { x.checkoutWay = v; said.push('Check-out arrangement: ' + v); } }
    else if (k === 'clientKind') { if (['agent', 'landlord'].indexOf(v) === -1) errors.push('clientKind must be agent or landlord'); else if (x.clientKind !== v) { x.clientKind = v; said.push('Client kind: ' + v); } }
    else if (k === 'checkinLead') { const n = Number(v); if (isNaN(n) || n < 0 || n > 300) errors.push('checkinLead must be minutes, 0-300'); else if (x.checkinLead !== n) { x.checkinLead = n; said.push('Check-in lead: ' + n + ' min'); } }
    else if (k === 'prices') {
      // { "ICI": { "1": "180", "extra": "10" }, "CO": { "2": "" } }: "" removes a price; other prices stay as they are.
      if (!v || typeof v !== 'object') { errors.push('prices must be an object by type'); return; }
      x.prices = x.prices || {};
      Object.keys(v).forEach(function (t) {
        if (JE.TYPES.indexOf(t) === -1 && t !== 'all') { errors.push('price type ' + jeClean_(t, 10) + ' unknown'); return; }
        Object.keys(v[t] || {}).forEach(function (key) {
          if (!JE.PRICE_KEYS.test(key)) { errors.push('price key ' + jeClean_(key, 10) + ' unknown'); return; }
          const raw = String(v[t][key] == null ? '' : v[t][key]).replace(/[£,\s]/g, '');
          x.prices[t] = x.prices[t] || {};
          if (raw === '') { if (x.prices[t][key] != null) { delete x.prices[t][key]; said.push('Price ' + t + ' ' + key + ' removed'); } }
          else if (!isNaN(parseFloat(raw)) && parseFloat(raw) >= 0 && parseFloat(raw) < 10000) { const s = String(parseFloat(raw)); if (x.prices[t][key] !== s) { x.prices[t][key] = s; said.push('Price ' + t + ' ' + key + ': £' + s); } }
          else errors.push('price ' + t + ' ' + key + ' is not a number');
          if (!Object.keys(x.prices[t]).length) delete x.prices[t];
        });
      });
    } else errors.push('"' + jeClean_(k, 30) + '" can\'t be changed on a client');
  });
  return { client: x, said: said, errors: errors };
}

// ================================================================
// 2. OPS (called from Dash dkDo_ with the device name)
// ================================================================
function jeFind_(jobs, b) {
  const id = String(b.id || ''), no = kpNorm_(b.job);
  let hits = jobs.filter(function (j) { return id && j.id === id; });
  if (!hits.length && no) hits = jobs.filter(function (j) { return kpNorm_(j.jobNo) === no; });
  return hits;
}
function jeClientNames_(ss) {
  const sh = ss.getSheetByName('Clients');
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return String(r[0]); }).filter(Boolean);
}
function jeCalendar_(j) {                     // after the Sheet write; a calendar failure never undoes the job change
  try {
    const body = jeCalBody_(j);
    if (!body) { if (j.gcalEventId) dkCalDelete_({ eventId: j.gcalEventId }); return { ok: true, id: '', removed: !!j.gcalEventId }; }
    const r = dkCalSave_({ eventId: j.gcalEventId || '', body: body });
    return { ok: true, id: r.id };
  } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
}
// jobEdit: { id or job, changes: {...}, ifUpdatedAt (optional: refuse if the job changed since this was read), dryRun }
function jeEdit_(dev, b) {
  if (!b || typeof b.changes !== 'object' || !Object.keys(b.changes).length) return { ok: false, error: 'Nothing to change.' };
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return { ok: false, busy: true, error: 'Busy, try again in a moment.' };
  let j, calNeeded = false, said;
  try {
    const ss = kpJobLogSs_(), r = kpReadJobs_(ss), hits = jeFind_(r.jobs, b);
    if (hits.length !== 1) return { ok: false, error: hits.length ? kpNorm_(b.job) + ' is on ' + hits.length + ' jobs; use the job id.' : 'Job not found in the Job Log.' };
    const cur = hits[0];
    if (b.ifUpdatedAt && String(cur.updatedAt || '') !== String(b.ifUpdatedAt)) return { ok: false, conflict: true, error: cur.jobNo + ' changed since it was read (now ' + (cur.updatedAt || 'no time') + '). Read it again.' };
    const now = new Date(), out = jeApply_(cur, b.changes, now.toISOString(), jeClientNames_(ss));
    if (out.errors.length) return { ok: false, error: out.errors.join('; ') };
    if (!out.said.length) return { ok: true, same: true, jobNo: cur.jobNo, logDetail: cur.jobNo + ' nothing changed' };
    if (b.dryRun) return { ok: true, dryRun: true, jobNo: cur.jobNo, changes: out.said };
    j = out.job; said = out.said; calNeeded = out.calendar;
    j.__row = cur.__row;
    jeHistory_(j, dev, said.join('; '), now);
    j.updatedAt = now.toISOString();
    const idx = r.jobs.indexOf(cur); r.jobs[idx] = j;
    const ch = {}; ch[j.id] = true;
    kpWriteJobs_(ss, r.head, r.jobs, ch, null);
  } finally { lock.releaseLock(); }
  let cal = null;
  if (calNeeded && (j.gcalEventId || j.date)) {
    cal = jeCalendar_(j);
    if (cal.ok && (cal.id || '') !== (j.gcalEventId || '')) jeSetCalId_(j.id, cal.id);
  }
  return { ok: true, jobNo: j.jobNo, id: j.id, updatedAt: j.updatedAt, changes: said, calendar: cal, logDetail: j.jobNo + ': ' + said.join('; ').slice(0, 200) };
}
function jeSetCalId_(id, evId) {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return;
  try {
    const ss = kpJobLogSs_(), r = kpReadJobs_(ss), j = r.jobs.filter(function (x) { return x.id === id; })[0];
    if (!j) return;
    if (evId) j.gcalEventId = evId; else delete j.gcalEventId;
    const ch = {}; ch[id] = true; kpWriteJobs_(ss, r.head, r.jobs, ch, null);
  } finally { lock.releaseLock(); }
}
// jobAdd: a new job, the same way a booking card's Add works. { item: {type, client, date, time, address, town, postcode, tenantList,
// copyTo, notes, sourceSubject, sourceDate}, queueId (optional: marks that card done), allowDuplicate, dryRun }
function jeAdd_(dev, b) {
  const it = (b && b.item) || {};
  if (JE.TYPES.indexOf(it.type) === -1) return { ok: false, error: 'type must be one of ' + JE.TYPES.join(', ') };
  const pc = it.postcode ? jePc_(it.postcode) : '';
  if (pc === null) return { ok: false, error: 'postcode is not a UK postcode' };
  if (!jeClean_(it.address, 160)) return { ok: false, error: 'address is needed' };
  if (it.date && !/^\d{4}-\d{2}-\d{2}$/.test(it.date)) return { ok: false, error: 'date must be YYYY-MM-DD' };
  if (it.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(it.time)) return { ok: false, error: 'time must be HH:MM' };
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return { ok: false, busy: true, error: 'Busy, try again in a moment.' };
  let j;
  try {
    const ss = kpJobLogSs_(), r = kpReadJobs_(ss), meta = dkMeta_(ss), now = new Date();
    const names = jeClientNames_(ss), want = String(it.client || '').toLowerCase().replace(/[^a-z]/g, '');
    const client = names.filter(function (c) { return c.toLowerCase().replace(/[^a-z]/g, '') === want; })[0] || '';
    if (it.client && !client) return { ok: false, error: 'client "' + jeClean_(it.client, 60) + '" is not in the client list (add it with clientSet first)' };
    const probe = { type: it.type, postcode: pc, address: it.address, date: it.date || '' };
    const dup = jeDuplicate_(r.jobs, probe);
    if (dup && !b.allowDuplicate) return { ok: false, duplicate: true, error: 'Looks like this is already logged as ' + dup.jobNo + ' (' + (dup.date || 'no date') + '). Send allowDuplicate to add it anyway.' };
    let high = {}; try { high = JSON.parse(meta.jobNoHigh || '{}') || {}; } catch (e) {}
    const num = jeNextJobNo_(it.date, r.jobs, high, now);
    const src = it.sourceSubject ? 'From email: ' + jeClean_(it.sourceSubject, 160) + (it.sourceDate ? ' (' + jeClean_(it.sourceDate, 20) + ')' : '') : '';
    j = { id: 'job_' + now.getTime() + '_' + Utilities.getUuid().replace(/-/g, '').slice(0, 7), jobNo: num.jobNo, type: it.type, client: client,
      date: it.date || '', time: it.time || '', address: jeClean_(it.address, 160), town: jeClean_(it.town, 60), postcode: pc || '',
      bedrooms: '', extraAreas: '', propertyType: '', tenants: '', notes: [jeClean_(it.notes, 1500), src].filter(Boolean).join('\n'),
      status: 'booked', invoice: '', invoiceNo: '' };
    jeSetTenants_(j, jeTenantRows_(it.tenantList));
    j.agentEmail = jeEmails_(it.copyTo || '');
    if (b.dryRun) return { ok: true, dryRun: true, job: j, duplicateOf: dup ? dup.jobNo : '' };
    jeHistory_(j, dev, 'Job added (' + dev + ')' + (b.queueId ? ' from booking card ' + jeClean_(b.queueId, 60) : ''), now);
    j.updatedAt = now.toISOString();
    // New row at the end of the Jobs tab, then Meta (savedAt, jobNoHigh, queueDone).
    j.__row = Math.max(2, ss.getSheetByName('Jobs').getLastRow() + 1);
    r.jobs.push(j);
    high[num.prefix] = Math.max(Number(high[num.prefix] || 0), num.n);
    let qd = null;
    if (b.queueId) { try { qd = JSON.parse(meta.queueDone || '{}') || {}; } catch (e) { qd = {}; } qd[String(b.queueId).slice(0, 120)] = { how: 'added', at: now.toISOString() }; }
    const ch = {}; ch[j.id] = true;
    kpWriteJobs_(ss, r.head, r.jobs, ch, qd);
    jeMetaSet_(ss, 'jobNoHigh', JSON.stringify(high));
  } finally { lock.releaseLock(); }
  let cal = null;
  if (j.date) { cal = jeCalendar_(j); if (cal.ok && cal.id) jeSetCalId_(j.id, cal.id); }
  return { ok: true, jobNo: j.jobNo, id: j.id, calendar: cal, logDetail: j.jobNo + ' added: ' + j.type + ' ' + j.address };
}
function jeMetaSet_(ss, key, value) {
  const meta = ss.getSheetByName('Meta'), mv = meta.getDataRange().getValues();
  let row = 0; mv.forEach(function (r, i) { if (r[0] === key) row = i + 1; });
  if (!row) row = mv.length + 1;
  meta.getRange(row, 1, 1, 2).setValues([[key, value]]);
}
// queueDone: mark booking cards handled so no device offers them again. { ids: [...], how: 'added' | 'applied' | 'dismissed' }
function jeQueueDone_(dev, b) {
  const ids = (Array.isArray(b && b.ids) ? b.ids : []).map(String).filter(function (x) { return /^[A-Za-z0-9._:-]{1,120}$/.test(x); }).slice(0, 50);
  const how = ['added', 'applied', 'dismissed', 'invoiced'].indexOf(b && b.how) !== -1 ? b.how : 'dismissed';
  if (!ids.length) return { ok: false, error: 'No card ids.' };
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return { ok: false, busy: true, error: 'Busy, try again in a moment.' };
  try {
    const ss = kpJobLogSs_(), meta = dkMeta_(ss), now = new Date().toISOString();
    let qd = {}; try { qd = JSON.parse(meta.queueDone || '{}') || {}; } catch (e) {}
    ids.forEach(function (id) { qd[id] = { how: how, at: now }; });
    jeMetaSet_(ss, 'queueDone', JSON.stringify(qd));
    jeMetaSet_(ss, 'savedAt', now);
    jeMetaSet_(ss, 'device', 'Dash key: ' + dev + ' (queueDone)');
    return { ok: true, count: ids.length, logDetail: ids.length + ' card(s) ' + how };
  } finally { lock.releaseLock(); }
}
// clientSet: change one client's contact, arrangements or prices; { name, changes, create (add a new client), dryRun }
function jeClientSet_(dev, b) {
  const name = jeClean_(b && b.name, 80);
  if (!name) return { ok: false, error: 'Client name needed.' };
  const lock = LockService.getUserLock();
  if (!lock.tryLock(20000)) return { ok: false, busy: true, error: 'Busy, try again in a moment.' };
  try {
    const ss = kpJobLogSs_(), sh = ss.getSheetByName('Clients');
    const v = sh.getDataRange().getDisplayValues(), head = v[0] || [], di = head.indexOf('Data (do not edit)');
    if (di < 0) return { ok: false, error: 'Clients tab has no Data column.' };
    const want = name.toLowerCase().replace(/[^a-z]/g, '');
    let row = 0, cur = null;
    for (let i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase().replace(/[^a-z]/g, '') === want) { row = i + 1; try { cur = JSON.parse(v[i][di]); } catch (e) { cur = { name: v[i][0] }; } break; }
    if (!row && !b.create) return { ok: false, error: 'No client called "' + name + '" (send create: true to add it).' };
    const out = jeClientApply_(cur || { name: name, contactName: '', contactPhone: '', contactEmail: '' }, b.changes || {});
    if (out.errors.length) return { ok: false, error: out.errors.join('; ') };
    if (row && !out.said.length) return { ok: true, same: true, logDetail: name + ' nothing changed' };
    if (b.dryRun) return { ok: true, dryRun: true, client: out.client, changes: out.said };
    const c = out.client, r = row || sh.getLastRow() + 1;
    sh.getRange(r, 1, 1, 5).setValues([[c.name, c.contactName || '', c.contactPhone || '', c.contactEmail || '', JSON.stringify(c)]]);
    const now = new Date().toISOString();
    jeMetaSet_(ss, 'savedAt', now);
    jeMetaSet_(ss, 'device', 'Dash key: ' + dev + ' (clientSet)');
    return { ok: true, client: c.name, changes: out.said.length ? out.said : ['client added'], logDetail: c.name + ': ' + (out.said.join('; ') || 'added').slice(0, 200) };
  } finally { lock.releaseLock(); }
}
