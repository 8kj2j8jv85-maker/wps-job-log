// CheckinSend (20 Oct 2026, Lex): the dashboard's "Send emails for me" switch.
//
// For agents whose tenants choose the check-in time (McQueens, Move Lettings, JAGS: set per agent in the
// dashboard), the dashboard can either open the email in Gmail for Lex to send (switch off), or ask this
// script to send it straight away (switch on). Only three fixed emails, all built here from the job saved in
// the Job Log Sheet. The dashboard sends only a job number and which email; it can't choose who gets it or
// what it says.
//   "ask"      Dear <tenants>, what time would you like to arrive? (agent copied in)
//   "confirm"  Dear <tenants>, your check-in is confirmed for <day> at <time> (agent copied in)
//   "propose"  Lex changed the tenants' time: Dear <tenants>, <their time> doesn't quite work, could we make it
//              <Lex's time> instead? Please reply to confirm (agent copied in)
// Checks before anything is sent (otherwise nothing is sent and the dashboard offers Gmail instead):
//   check-in job, status Booked, the agent is set to "tenants choose the time", date after today,
//   1-6 valid tenant emails, no "earlier tenancy" / "copied" warning in the notes,
//   ask: not sent in the last 20 hours and at most 3 times; confirm / propose: once per date and time,
//   at most 25 emails a day in total.
// Sent from hello@ (reports@ if hello@ isn't a "Send mail as" address). Every send or refusal is a line
// in the "Check-in emails" tab of the WPS Amendments Sheet. Called from Dash (op "ciSend", device key).

const CS = {
  FROM: 'hello@wellington-ps.co.uk',
  FROM_FALLBACK: 'reports@wellington-ps.co.uk',
  NAME: 'Wellington Property Services',
  LOG_TAB: 'Check-in emails',
  ASK_GAP_H: 20,
  ASK_MAX: 3,
  DAY_MAX: 25,
  TZ: 'Europe/London',
  PHONE: '07541 345053',
  SIG: '\n\nKind regards,\nWellington Property Services\nT - 07541 345053\nE - hello@wellington-ps.co.uk\nW - www.wellington-ps.co.uk',
  STALE: /earlier tenancy|copied from an old|stale|awaiting current tenant/i
};

function csSend_(dev, b) {
  const kind = String(b.kind || '');
  if (kind !== 'ask' && kind !== 'confirm' && kind !== 'propose') return { ok: false, error: 'Unknown email.' };
  const jobNo = String(b.job || '').toUpperCase().replace(/\s+/g, '');
  if (!/^WPS\d{6,}$/.test(jobNo)) return { ok: false, error: 'No WPS job number.' };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Busy, try again in a minute.' };
  try {
    const ss = SpreadsheetApp.openById(PE.JOB_LOG_SHEET_ID);
    const jobs = csRead_(ss, 'Jobs').filter(function (j) { return String(j.jobNo || '').toUpperCase() === jobNo; });
    if (jobs.length !== 1) return csRefuse_(dev, jobNo, kind, jobs.length ? jobNo + ' is on ' + jobs.length + ' jobs in the Job Log.' : jobNo + ' isn\'t saved in the Job Log yet.');
    const clients = csRead_(ss, 'Clients'), contacts = csRead_(ss, 'Contacts');
    const why = csCheck_(jobs[0], kind, clients, csLogRows_(), new Date());
    if (why) return csRefuse_(dev, jobNo, kind, why);
    const m = csEmail_(jobs[0], kind, clients, contacts);
    const from = csDeliver_(m);
    csLog_(jobNo, kind, m.key, m.to, m.cc, 'Sent', m.subject + ' (from ' + from + ')', dev);
    return { ok: true, sentAt: new Date().toISOString(), to: m.to, cc: m.cc, logDetail: jobNo + ' ' + kind + ' to ' + m.to };
  } finally { lock.releaseLock(); }
}
function csRefuse_(dev, jobNo, kind, why) {
  csLog_(jobNo, kind, '', '', '', 'Refused', why, dev);
  return { ok: false, refused: true, error: why, logDetail: jobNo + ' ' + kind + ': ' + why };
}

// ---------- pure parts (tested offline) ----------
function csToday_(now) { return Utilities.formatDate(now, CS.TZ, 'yyyy-MM-dd'); }
function csEmails_(v) {
  const out = [];
  String(v || '').split(/[\s,;]+/).forEach(function (e) { e = e.trim(); if (e && isEmail_(e) && out.indexOf(e.toLowerCase()) === -1) out.push(e.toLowerCase()); });
  return out;
}
function csLoose_(name) { return String(name || '').toLowerCase().replace(/[^a-z]/g, ''); }
function csClient_(name, clients) {
  const low = csLoose_(name); if (!low) return null;
  return clients.filter(function (c) { return csLoose_(c.name) === low; })[0]
      || clients.filter(function (c) { const k = csLoose_(c.name); return k && (k.indexOf(low) !== -1 || low.indexOf(k) !== -1); })[0] || null;
}
// Same rule as the dashboard's checkinWay()
function csWay_(name, clients) {
  const c = csClient_(name, clients);
  if (c && (c.checkinWay === 'ask' || c.checkinWay === 'agent')) return c.checkinWay;
  const n = String((c && c.name) || name || '');
  if (/mcqueens|move\s*lettings|jags/i.test(n)) return 'ask';
  if (/^winkworth/i.test(n)) return 'agent';
  return '';
}
function csCheck_(job, kind, clients, logRows, now) {
  if (job.type !== 'ICI') return 'Not a check-in job.';
  if (csWay_(job.client, clients) !== 'ask') return (job.client || 'This agent') + ' isn\'t set to "tenants choose the time".';
  if (job.status !== 'booked') return 'The job isn\'t at Booked.';
  if (!/^\d{4}-\d\d-\d\d$/.test(String(job.date || ''))) return 'The job has no date.';
  if (job.date <= csToday_(now)) return 'The check-in date isn\'t after today.';
  const to = csEmails_(job.tenantEmails);
  if (!to.length) return 'No tenant email on the job.';
  if (to.length > 6) return 'More than 6 tenant emails on the job.';
  if (CS.STALE.test(String(job.notes || ''))) return 'The job notes say the tenant details may be from an old works order.';
  const sent = logRows.filter(function (r) { return r.job === String(job.jobNo).toUpperCase() && r.status === 'Sent'; });
  const today = csToday_(now);
  if (logRows.filter(function (r) { return r.status === 'Sent' && r.day === today; }).length >= CS.DAY_MAX) return 'Daily limit of ' + CS.DAY_MAX + ' emails reached.';
  if (kind === 'ask') {
    const asks = sent.filter(function (r) { return r.kind === 'ask'; });
    if (asks.length >= CS.ASK_MAX) return 'Already asked ' + asks.length + ' times. Send any more yourself.';
    if (asks.some(function (r) { return now.getTime() - r.at < CS.ASK_GAP_H * 3600000; })) return 'Already asked in the last ' + CS.ASK_GAP_H + ' hours.';
  } else {
    if (!/^\d\d:\d\d$/.test(String(job.tenantArrival || ''))) return 'No arrival time saved on the job.';
    if (kind === 'propose' && (!/^\d\d:\d\d$/.test(String(job.tenantAsked || '')) || job.tenantAsked === job.tenantArrival)) return 'No changed time to suggest.';
    const key = kind + '|' + job.date + '|' + job.tenantArrival;
    if (sent.some(function (r) { return r.key === key; })) return 'This email was already sent.';
  }
  return '';
}
function csNames_(job) {
  // first names, as Lex writes them ("Dear Robbie and Honor")
  const n = (Array.isArray(job.tenantList) ? job.tenantList : []).map(function (t) { return String(t && t.name || '').trim().replace(/^(mr|mrs|ms|miss|dr)\.?\s+/i, '').split(/\s+/)[0]; }).filter(Boolean);
  if (!n.length) return 'Tenants';
  return n.length === 1 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}
function csAddr_(job) {
  return [job.address, job.town, job.postcode].map(function (s) { return String(s || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean).join(', ');
}
function csLongDay_(iso) { return Utilities.formatDate(new Date(iso + 'T12:00:00Z'), CS.TZ, 'EEEE d MMMM'); }
function csEmail_(job, kind, clients, contacts) {
  const c = csClient_(job.client, clients);
  const cc = csEmails_(job.agentEmail).length ? csEmails_(job.agentEmail) : csEmails_(c && c.contactEmail);
  const ct = cc.length ? (contacts || []).filter(function (x) { return String(x.email || '').toLowerCase() === cc[0]; })[0] : null;
  const first = function (s) { return String(s || '').trim().split(/\s+/)[0] || ''; };
  const person = first(ct && ct.name) || first(c && c.contactName), firm = String(job.client || '').replace(/\s*-\s*.*$/, '');
  const who = person && firm ? person + ' at ' + firm : (firm || 'your letting agent');
  const addr = csAddr_(job), day = csLongDay_(job.date), to = csEmails_(job.tenantEmails).join(', ');
  const ref = String(job.jobNo || '').toUpperCase();
  const names = csNames_(job), mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  const happens = { title: 'What happens at your check-in', items: [
    'Our clerk arrives a little earlier to take the photos of the property.',
    'When you arrive, we show you the meters, explain fair wear and tear and your responsibilities, and hand over the keys. This takes up to about 15 minutes.',
    'The report then comes to you by email to review and sign. You have 7 days to send any comments.'] };
  const replyNote = 'Please reply to this email so everything stays with your booking.';
  let subject, body, m;
  if (kind === 'ask') {
    subject = 'Check-in - ' + addr + ' - ' + day;
    body = 'Dear ' + names + ',\n\nWe are carrying out your inventory and check-in at\n\n' + addr + '\n\non ' + day + ', arranged by ' + who + (cc.length ? ' (copied in)' : '') + '.\n\n'
      + 'What time would you like to arrive at the property that day? Our clerk will meet you there, go through the check-in with you and hand over the keys.\n\n'
      + 'Just reply to this email with a time.' + CS.SIG;
    m = { title: 'Your check-in', preheader: 'Check-in on ' + day + ' at ' + addr + '. What time suits you?', blocks: [
      { p: 'Dear ' + names + ',' },
      { p: 'We are carrying out your inventory and check-in, arranged by ' + who + (cc.length ? ' (copied in)' : '') + '.' },
      { rows: [['Property', addr], ['Date', day], ['Reference', ref]] },
      { p: 'What time would you like to arrive at the property that day? Our clerk will meet you there. Just reply to this email with a time.' },
      { buttons: [{ button: 'mailto:' + CS.FROM + '?subject=' + encodeURIComponent('Re: ' + subject), text: 'Reply with a time' }, { button: mapUrl, text: 'Open in Google Maps', primary: false }] },
      { steps: happens }] };
  } else if (kind === 'propose') {
    subject = 'Check-in - ' + addr + ' - ' + day + ' at ' + job.tenantArrival + '?';
    body = 'Dear ' + names + ',\n\nThank you for letting us know. ' + job.tenantAsked + ' doesn\'t quite work for us on ' + day + '. Could we make it ' + job.tenantArrival + ' instead?\n\n'
      + 'Please reply to confirm, or suggest another time.' + CS.SIG;
    m = { title: 'Could we make it ' + job.tenantArrival + '?', preheader: job.tenantAsked + ' doesn\'t quite work. Could we make it ' + job.tenantArrival + ' on ' + day + '?', blocks: [
      { p: 'Dear ' + names + ',' },
      { p: 'Thank you for letting us know. ' + job.tenantAsked + ' doesn\'t quite work for us on ' + day + '. Could we make it ' + job.tenantArrival + ' instead?' },
      { rows: [['Property', addr], ['Date', day], ['Suggested time', job.tenantArrival], ['Reference', ref]] },
      { p: 'Please reply to this email to confirm, or suggest another time.' },
      { button: 'mailto:' + CS.FROM + '?subject=' + encodeURIComponent('Re: ' + subject) + '&body=' + encodeURIComponent(job.tenantArrival + ' is fine.'), text: 'Yes, ' + job.tenantArrival + ' is fine' }] };
  } else {
    subject = 'Check-in - ' + addr + ' - confirmed';
    body = 'Dear ' + names + ',\n\nThank you. Your check-in at\n\n' + addr + '\n\nis confirmed for ' + day + ' at ' + job.tenantArrival + '. Our clerk will meet you at the property then.\n\n'
      + 'If anything changes, reply to this email or call ' + CS.PHONE + '.' + CS.SIG;
    m = { title: 'Your check-in is confirmed', preheader: 'Confirmed: ' + day + ' at ' + job.tenantArrival + ', ' + addr + '.', blocks: [
      { p: 'Dear ' + names + ',' },
      { p: 'Thank you. Your check-in is booked in. Our clerk will meet you at the property.' },
      { rows: [['Property', addr], ['Date', day], ['Time', job.tenantArrival], ['Reference', ref]] },
      { buttons: [{ button: csCalUrl_(job, addr), text: 'Add to calendar' }, { button: mapUrl, text: 'Open in Google Maps', primary: false }] },
      { steps: happens },
      { small: 'If anything changes, reply to this email or call ' + CS.PHONE + '. ' + replyNote }] };
  }
  return { to: to, cc: cc.join(', '), subject: subject, body: body, html: (typeof wmOn_ === 'function' && wmOn_() ? wmHtml_(m) : ''), model: m, key: kind === 'ask' ? 'ask|' + job.date : kind + '|' + job.date + '|' + job.tenantArrival };
}

// Google Calendar "add event" link (one hour from the tenants' time)
function csCalUrl_(job, addr) {
  const t = String(job.tenantArrival || '').split(':'), d = String(job.date || '').replace(/-/g, '');
  const h = Number(t[0]), mi = t[1] || '00', end = ('0' + Math.min(23, h + 1)).slice(-2) + mi;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Check-in - ' + addr)
    + '&dates=' + d + 'T' + ('0' + h).slice(-2) + mi + '00/' + d + 'T' + end + '00&ctz=Europe/London&location=' + encodeURIComponent(addr)
    + '&details=' + encodeURIComponent('Check-in with Wellington Property Services. Ref ' + String(job.jobNo || '') + '. Questions: reply to our email or call ' + CS.PHONE + '.');
}

// ---------- Google parts ----------
function csRead_(ss, tab) {
  const sh = ss.getSheetByName(tab); if (!sh) return [];
  const v = sh.getDataRange().getValues(); if (v.length < 2) return [];
  const di = v[0].indexOf('Data (do not edit)'); if (di < 0) return [];
  const out = [];
  for (let i = 1; i < v.length; i++) { try { if (v[i][di]) out.push(JSON.parse(String(v[i][di]))); } catch (e) { } }
  return out;
}
function csDeliver_(m) {
  const opt = function (from) { const o = { name: CS.NAME, from: from, replyTo: CS.FROM }; if (m.cc) o.cc = m.cc; if (m.html) o.htmlBody = m.html; return o; };
  try { GmailApp.sendEmail(m.to, m.subject, m.body, opt(CS.FROM)); return CS.FROM; }
  catch (e) { GmailApp.sendEmail(m.to, m.subject, m.body, opt(CS.FROM_FALLBACK)); return CS.FROM_FALLBACK; }
}
function csLogSheet_() {
  const ss = SpreadsheetApp.openById(prop_('SHEET_ID'));
  let sh = ss.getSheetByName(CS.LOG_TAB);
  if (!sh) {
    sh = ss.insertSheet(CS.LOG_TAB);
    sh.getRange(1, 1, 1, 9).setValues([['Time', 'Job', 'Email', 'Key', 'To', 'CC', 'Status', 'Detail', 'Device']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function csLogRows_() {
  const sh = csLogSheet_(), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, 9).getValues().map(function (r) {
    const t = r[0] instanceof Date ? r[0] : new Date(r[0]);
    return { at: t.getTime(), day: isNaN(t) ? '' : csToday_(t), job: String(r[1]).toUpperCase(), kind: String(r[2]), key: String(r[3]), status: String(r[6]) };
  });
}
function csLog_(jobNo, kind, key, to, cc, status, detail, dev) {
  try { csLogSheet_().appendRow([new Date(), jobNo, kind, key, to, cc, status, String(detail || '').slice(0, 300), dev].map(safeCell_)); }
  catch (e) { console.error('Check-in emails log failed: ' + e); }
}
