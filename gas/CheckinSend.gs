// CheckinSend (20 Oct 2026, Lex; check-outs, chasers, latest time and private landlords added 21 Oct 2026;
// preview, free editing and the situation templates added 23 Oct 2026).
//
// Tenant emails sent by the dashboard through this script, in the navy look, from hello@. Everything is built here
// from the job saved in the Job Log Sheet. The dashboard sends the job number, which email, the times Lex picked
// and (from 23 Oct) Lex's own edited wording. Who it goes to is always decided here: the job's tenant emails, with
// the agent (or private landlord) copied in. The dashboard can't change the recipients.
//
// Which jobs (same rules as the dashboard):
//   check-ins (ICI)  for clients set to "tenants choose the time" (McQueens, Move Lettings, JAGS, Winkworth from
//                    21 Oct, and private landlords by default);
//   check-outs (CO)  for clients set to "ask the tenants for a time" (Move Lettings and private landlords by
//                    default; Winkworth check-outs have nobody there, so they never get these emails).
//
// Emails (b.kind):
//   "ask"      7 days before: what time would you like to arrive / be moved out. No later than the season's latest start.
//   "chaser"   4 days before if no reply: we still need your time. Once per date.
//   "confirm"  your check-in / check-out is confirmed for <day> at <time>.            params.time
//   "taken"    the <asked> slot has already been taken, we can offer <time> instead.  params.asked, params.time
//   "options"  we can't do <asked>; any of these times instead (2-3).                params.asked (optional), params.times
//   "otherday" <day> doesn't work for you; we can offer <date> (at <time>) instead.   params.date, params.time (optional)
//   "late"     on the day: running late, our clerk now expects to be there about <eta>. params.eta
//   "access"   tenant can't be there: keys and access as arranged with the agent.    (no params)
//   "propose"  old wording (<their time> doesn't quite work, could we make it ...). Kept for older dashboards.
//
// Preview (Lex, 23 Oct: "I need to be able to see a preview of what's going to be sent"): kind "preview:<kind>"
// runs every check and builds the email but sends nothing. The dashboard shows To, CC, subject and the text, which
// Lex can change freely. On Send, b.subject and b.body carry Lex's wording (signature added here); if they match the
// template exactly, the template's own navy email goes; if Lex changed anything, his text goes in the navy look
// (WpsMail wmFromText_). No WhatsApp in any email; a body or subject with WhatsApp is refused.
// Extra line (Lex, 20 Oct): params.note (or the old ciNote on the job) goes into confirm / taken emails.
// Checks before anything is sent (otherwise nothing is sent and the dashboard says why):
//   check-in or check-out job set to ask the tenants (above), status Booked, date after today (on or after today
//   for "late"), 1-6 valid tenant emails, no "earlier tenancy" / "copied" warning in the notes,
//   ask: not sent in the last 20 hours and at most 3 times; chaser: only after an ask for this date, once;
//   the others: the same email with the same times once per date; at most 25 emails a day in total.
// Sent from hello@ (reports@ if hello@ isn't a "Send mail as" address). Every send or refusal is a line
// in the "Check-in emails" tab of the WPS Amendments Sheet. Called from Dash (op "ciSend", device key).

const CS = {
  FROM: 'hello@wellington-ps.co.uk',
  FROM_FALLBACK: 'reports@wellington-ps.co.uk',
  NAME: 'Wellington Property Services',
  LOG_TAB: 'Check-in emails',
  ASK_GAP_H: 20,
  ASK_MAX: 3,
  CHASE_MAX: 1,
  DAY_MAX: 25,
  NOTE_MAX: 300,
  SUBJECT_MAX: 200,
  BODY_MAX: 5000,
  TZ: 'Europe/London',
  PHONE: '07541 345053',
  // Latest start (Lex, 21 Oct): winter (clocks back) 1pm, summer (clocks forward) 4:30pm, 1.5 h before 6pm closing.
  LATEST_WINTER: '13:00',
  LATEST_SUMMER: '16:30',
  // Names that are letting agents; any other client is taken as a private landlord unless set in the dashboard.
  AGENT_RE: /winkworth|mcqueens|move\s*lettings|jags|chestertons|felicity|keller|lettings?|estates?|propert(y|ies)|homes|residential|agents?|\bltd\b|limited|group|partners/i,
  SIG: '\n\nKind regards,\nWellington Property Services\nT - 07541 345053\nE - hello@wellington-ps.co.uk\nW - www.wellington-ps.co.uk',
  STALE: /earlier tenancy|copied from an old|stale|awaiting current tenant/i
};
const CS_KINDS = ['ask', 'chaser', 'confirm', 'propose', 'taken', 'options', 'otherday', 'late', 'access'];
const CS_TIMED = ['confirm', 'propose', 'taken'];   // these set the tenants' time on the job

function csSend_(dev, b) {
  // A preview comes as kind "preview:<kind>", so a script without this code refuses it ("Unknown email.")
  // instead of sending: the dashboard only offers Send after a preview from this version.
  let kind = String(b.kind || '');
  const preview = /^preview:/.test(kind);
  if (preview) kind = kind.slice(8);
  if (CS_KINDS.indexOf(kind) === -1) return { ok: false, error: 'Unknown email.' };
  const jobNo = String(b.job || '').toUpperCase().replace(/\s+/g, '');
  if (!/^WPS\d{6,}$/.test(jobNo)) return { ok: false, error: 'No WPS job number.' };
  const params = csParams_(b.params);
  if (params.error) return { ok: false, error: params.error };
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'Busy, try again in a minute.' };
  try {
    const ss = SpreadsheetApp.openById(PE.JOB_LOG_SHEET_ID);
    const jobs = csRead_(ss, 'Jobs').filter(function (j) { return String(j.jobNo || '').toUpperCase() === jobNo; });
    if (jobs.length !== 1) {
      const why0 = jobs.length ? jobNo + ' is on ' + jobs.length + ' jobs in the Job Log.' : jobNo + ' isn\'t saved in the Job Log yet.';
      return preview ? { ok: false, refused: true, error: why0 } : csRefuse_(dev, jobNo, kind, why0);
    }
    const job = csWithParams_(jobs[0], kind, params);
    const clients = csRead_(ss, 'Clients'), contacts = csRead_(ss, 'Contacts');
    const why = csCheck_(job, kind, clients, csLogRows_(), new Date(), params);
    if (why) return preview ? { ok: false, refused: true, error: why } : csRefuse_(dev, jobNo, kind, why);
    const m = csEmail_(job, kind, clients, contacts, params);
    // Refine 2 (Lex 23 Oct): the preview shows the navy email exactly as it will arrive. With Lex's changed wording
    // (subject / body sent with the preview) it's rebuilt from his text, the same way Send builds it.
    if (preview) {
      const pe = (typeof b.subject === 'string' || typeof b.body === 'string') ? csEdited_(m, b) : { m: m, edited: false };
      if (pe.error) return { ok: false, refused: true, error: pe.error };
      return { ok: true, preview: true, to: m.to, cc: m.cc, subject: m.subject, body: csNoSig_(m.body), sig: CS.SIG.replace(/^\n+/, ''),
        html: pe.m.html || '', shownSubject: pe.m.subject, edited: pe.edited, logDetail: jobNo + ' ' + kind + ' preview' + (pe.edited ? ' (edited)' : '') };
    }
    const ed = csEdited_(m, b);
    if (ed.error) return csRefuse_(dev, jobNo, kind, ed.error);
    const from = csDeliver_(ed.m);
    csLog_(jobNo, kind, m.key, m.to, m.cc, 'Sent', ed.m.subject + (ed.edited ? ' (edited by Lex)' : '') + (m.note ? ' (with extra line)' : '') + ' (from ' + from + ')', dev);
    return { ok: true, sentAt: new Date().toISOString(), to: m.to, cc: m.cc, edited: ed.edited, logDetail: jobNo + ' ' + kind + ' to ' + m.to };
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
// Same rule as the dashboard's clientKind(): "agent" or "landlord" (private landlord)
function csKind_(name, clients) {
  const c = csClient_(name, clients);
  if (c && (c.clientKind === 'agent' || c.clientKind === 'landlord')) return c.clientKind;
  const n = String((c && c.name) || name || '').trim();
  if (!n) return 'agent';
  return CS.AGENT_RE.test(n) ? 'agent' : 'landlord';
}
// Same rule as the dashboard's checkinWay()
function csWay_(name, clients) {
  const c = csClient_(name, clients);
  if (c && (c.checkinWay === 'ask' || c.checkinWay === 'agent')) return c.checkinWay;
  const n = String((c && c.name) || name || '');
  if (/mcqueens|move\s*lettings|jags|^winkworth/i.test(n)) return 'ask';   // Winkworth tenants choose from 21 Oct (Manny)
  if (n && csKind_(name, clients) === 'landlord') return 'ask';
  return '';
}
// Same rule as the dashboard's checkoutWay(): "ask" (email the tenants for a time), "none" (nobody there, go any
// time that day: Winkworth) or "" (not set: the time is agreed by hand, as before)
function csCoWay_(name, clients) {
  const c = csClient_(name, clients);
  if (c && (c.checkoutWay === 'ask' || c.checkoutWay === 'none')) return c.checkoutWay;
  const n = String((c && c.name) || name || '');
  if (/^winkworth/i.test(n)) return 'none';
  if (/move\s*lettings/i.test(n)) return 'ask';
  if (n && csKind_(name, clients) === 'landlord') return 'ask';
  return '';
}
// Daylight saving in the UK: last Sunday of March to last Sunday of October
function csSummer_(iso) {
  const y = Number(String(iso).slice(0, 4));
  const lastSun = function (m) { const d = new Date(Date.UTC(y, m + 1, 0)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
  return iso >= lastSun(2) && iso < lastSun(9);
}
function csLatest_(iso) { return csSummer_(iso) ? CS.LATEST_SUMMER : CS.LATEST_WINTER; }
function csClock_(hm) { const h = Number(String(hm).slice(0, 2)), m = String(hm).slice(3, 5); return (h % 12 || 12) + ':' + m + (h < 12 ? 'am' : 'pm'); }
// Times as Lex writes them: 11am, 12 noon, 1:30pm
function csNice_(hm) {
  if (!/^\d\d:\d\d$/.test(String(hm || ''))) return String(hm || '');
  const h = Number(hm.slice(0, 2)), m = hm.slice(3, 5);
  if (h === 12 && m === '00') return '12 noon';
  return (h % 12 || 12) + (m === '00' ? '' : ':' + m) + (h < 12 ? 'am' : 'pm');
}
// Times and dates the dashboard sends with the email (checked here; nothing else is accepted)
function csParams_(p) {
  p = p && typeof p === 'object' ? p : {};
  const hm = function (v) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : ''; };
  const out = { asked: hm(p.asked), time: hm(p.time), eta: hm(p.eta), date: /^\d{4}-\d\d-\d\d$/.test(String(p.date || '')) ? String(p.date) : '' };
  out.times = (Array.isArray(p.times) ? p.times : []).map(hm).filter(Boolean).filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 3);
  const note = String(p.note || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CS.NOTE_MAX);
  if (note && /whatsapp|wa\.me|https?:|www\./i.test(note)) return { error: 'The extra line can\'t have links, web addresses or WhatsApp in it.' };
  out.note = note;
  return out;
}
// The job as it will be once this email goes (the dashboard saves the same values on Send)
function csWithParams_(job, kind, params) {
  const j = Object.assign({}, job);
  if (kind === 'confirm' && params.time) { j.tenantArrival = params.time; j.tenantAsked = params.time; }
  if ((kind === 'taken' || kind === 'propose') && params.time) { j.tenantArrival = params.time; if (params.asked) j.tenantAsked = params.asked; }
  if (params.note && (kind === 'confirm' || kind === 'taken' || kind === 'propose')) { j.ciNote = params.note; j.ciNoteFor = kind + '|' + j.date + '|' + j.tenantArrival; }
  return j;
}
function csKey_(job, kind, params) {
  params = params || {};
  if (kind === 'ask' || kind === 'chaser') return kind + '|' + job.date;
  if (CS_TIMED.indexOf(kind) !== -1) return kind + '|' + job.date + '|' + job.tenantArrival;
  if (kind === 'options') return kind + '|' + job.date + '|' + (params.times || []).join(',');
  if (kind === 'otherday') return kind + '|' + job.date + '|' + params.date + (params.time ? ' ' + params.time : '');
  if (kind === 'late') return kind + '|' + job.date + '|' + params.eta;
  return kind + '|' + job.date;
}
function csCheck_(job, kind, clients, logRows, now, params) {
  params = params || {};
  if (job.type === 'ICI') { if (csWay_(job.client, clients) !== 'ask') return (job.client || 'This client') + ' isn\'t set to "tenants choose the time".'; }
  else if (job.type === 'CO') { if (csCoWay_(job.client, clients) !== 'ask') return (job.client || 'This client') + '\'s check-outs aren\'t set to "ask the tenants for a time".'; }
  else return 'Not a check-in or check-out job.';
  if (job.status !== 'booked') return 'The job isn\'t at Booked.';
  if (!/^\d{4}-\d\d-\d\d$/.test(String(job.date || ''))) return 'The job has no date.';
  if (kind === 'late') { if (job.date < csToday_(now)) return 'The ' + (job.type === 'CO' ? 'check-out' : 'check-in') + ' date has passed.'; }
  else if (job.date <= csToday_(now)) return 'The ' + (job.type === 'CO' ? 'check-out' : 'check-in') + ' date isn\'t after today.';
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
    return '';
  }
  if (kind === 'chaser') {
    const asks = sent.filter(function (r) { return r.kind === 'ask' && r.key === 'ask|' + job.date; });
    if (!asks.length) return 'The tenants haven\'t been asked for a time yet. Send the first email instead.';
    if (asks.some(function (r) { return now.getTime() - r.at < CS.ASK_GAP_H * 3600000; })) return 'They were only asked in the last ' + CS.ASK_GAP_H + ' hours.';
    if (sent.filter(function (r) { return r.kind === 'chaser' && r.key === 'chaser|' + job.date; }).length >= CS.CHASE_MAX) return 'The chaser was already sent. Call the tenants.';
    return '';
  }
  if (CS_TIMED.indexOf(kind) !== -1) {
    if (!/^\d\d:\d\d$/.test(String(job.tenantArrival || ''))) return 'No ' + (job.type === 'CO' ? 'check-out' : 'arrival') + ' time picked.';
    if ((kind === 'propose' || kind === 'taken') && (!/^\d\d:\d\d$/.test(String(job.tenantAsked || '')) || job.tenantAsked === job.tenantArrival)) return 'Pick the time they asked for and a different time to offer.';
  }
  if (kind === 'options' && (params.times || []).length < 2) return 'Pick at least 2 times to offer.';
  if (kind === 'otherday') {
    if (!params.date) return 'Pick the day to offer.';
    if (params.date <= today) return 'The day to offer must be after today.';
    if (params.date === job.date) return 'That\'s the day already booked. Pick a different day.';
  }
  if (kind === 'late' && !params.eta) return 'Pick the time our clerk now expects to be there.';
  const key = csKey_(job, kind, params);
  if (sent.some(function (r) { return r.key === key; })) return 'This email was already sent.';
  return '';
}
// Lex's extra line for this confirm / propose / taken email (see header). '' if none, for another email, or not allowed.
function csNote_(job, kind) {
  if (CS_TIMED.indexOf(kind) === -1) return '';
  const s = String(job.ciNote || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CS.NOTE_MAX);
  if (!s || job.ciNoteFor !== kind + '|' + job.date + '|' + job.tenantArrival) return '';
  if (/whatsapp|wa\.me|https?:|www\./i.test(s)) return '';
  return s;
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
function csNoSig_(body) {
  const s = String(body || ''), i = s.lastIndexOf(CS.SIG);
  return i !== -1 && i === s.length - CS.SIG.length ? s.slice(0, i) : s;
}
// Lex's wording from the preview box. Same as the template = the template's own email; changed = his text.
function csEdited_(m, b) {
  const hasSubj = typeof b.subject === 'string', hasBody = typeof b.body === 'string';
  if (!hasSubj && !hasBody) return { m: m, edited: false };
  const norm = function (s) { return String(s || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim(); };
  const subject = hasSubj ? String(b.subject).replace(/[\r\n]+/g, ' ').trim() : m.subject;
  const body = hasBody ? norm(b.body) : norm(csNoSig_(m.body));
  if (!subject) return { error: 'The subject is empty.' };
  if (!body) return { error: 'The email is empty.' };
  if (subject.length > CS.SUBJECT_MAX) return { error: 'The subject is too long.' };
  if (body.length > CS.BODY_MAX) return { error: 'The email is too long.' };
  if (/whatsapp|wa\.me/i.test(subject + ' ' + body)) return { error: 'No WhatsApp in emails (replies need to come by email so the system sees them).' };
  if (subject === m.subject && body === norm(csNoSig_(m.body))) return { m: m, edited: false };
  const plain = body + CS.SIG;
  const html = typeof wmOn_ === 'function' && wmOn_() && typeof wmFromText_ === 'function' ? wmFromText_(plain, (m.model && m.model.title) || '') : '';
  return { m: { to: m.to, cc: m.cc, subject: subject, body: plain, html: html }, edited: true };
}
function csEmail_(job, kind, clients, contacts, params) {
  params = params || {};
  const c = csClient_(job.client, clients), landlord = csKind_(job.client, clients) === 'landlord';
  const cc = csEmails_(job.agentEmail).length ? csEmails_(job.agentEmail) : csEmails_(c && c.contactEmail);
  const ct = cc.length ? (contacts || []).filter(function (x) { return String(x.email || '').toLowerCase() === cc[0]; })[0] : null;
  const first = function (s) { return String(s || '').trim().split(/\s+/)[0] || ''; };
  const person = first(ct && ct.name) || first(c && c.contactName), firm = String(job.client || '').replace(/\s*-\s*.*$/, '');
  const who = landlord ? (job.client ? 'your landlord, ' + String(job.client).trim() : 'your landlord')
    : (person && firm ? person + ' at ' + firm : (firm || 'your letting agent'));
  const payer = landlord ? 'the landlord' : (firm || 'the letting agent');
  const copied = cc.length ? ' (copied in)' : '';
  const co = job.type === 'CO', what = co ? 'check-out' : 'check-in', What = co ? 'Check-out' : 'Check-in';
  const addr = csAddr_(job), day = csLongDay_(job.date), to = csEmails_(job.tenantEmails).join(', ');
  const ref = String(job.jobNo || '').toUpperCase(), latest = csClock_(csLatest_(job.date));
  const names = csNames_(job), mapUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr);
  const note = csNote_(job, kind);
  const happens = co
    ? { title: 'On the day', items: [
      'Please have everything packed, removed and any cleaning finished before our clerk arrives.',
      'Our clerk will ask if there\'s anything you\'d like noted in the report, then take the keys and you can leave.',
      'Our clerk can\'t wait while packing or cleaning is finished. If the property isn\'t ready at the agreed time, the appointment will be cancelled and rearranged, and a cancellation fee will be charged to ' + payer + '.'] }
    : { title: 'What happens at your check-in', items: [
      'Our clerk arrives a little earlier to take the photos of the property.',
      'When you arrive, we show you the meters, explain fair wear and tear and your responsibilities, and hand over the keys. This takes up to about 15 minutes.',
      'The report then comes to you by email to review and sign. You have 7 days to send any comments.'] };
  const stepsText = function (s) { return s.items.map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n'); };
  const replyNote = 'Please reply to this email so everything stays with your booking.';
  const question = co
    ? 'What time on that day will you be fully moved out and ready to hand over the keys? Please choose a time no later than ' + latest + '.'
    : 'What time would you like to arrive at the property that day? Please choose a time no later than ' + latest + '. Our clerk will meet you there, go through the check-in with you and hand over the keys.';
  const subjectAsk = What + ' - ' + addr + ' - ' + day;
  const replyBtn = function (subject, text) { return { button: 'mailto:' + CS.FROM + '?subject=' + encodeURIComponent('Re: ' + subject), text: text }; };
  const intro = co
    ? 'Your check-out at the end of your tenancy is on ' + day + ', arranged by ' + who + copied + '.'
    : 'We are carrying out your inventory and check-in, arranged by ' + who + copied + '.';
  let subject, body, m;
  if (kind === 'ask' || kind === 'chaser') {
    const chase = kind === 'chaser';
    subject = (chase ? 'Reminder: ' : '') + subjectAsk;
    body = 'Dear ' + names + ',\n\n'
      + (chase ? 'We haven\'t had your time yet for your ' + what + ' at\n\n' + addr + '\n\non ' + day + '.\n\n'
        : (co ? 'Your check-out at\n\n' + addr + '\n\nis on ' + day + ', the end of your tenancy, arranged by ' + who + copied + '.\n\n'
          : 'We are carrying out your inventory and check-in at\n\n' + addr + '\n\non ' + day + ', arranged by ' + who + copied + '.\n\n'))
      + question + '\n\n'
      + (co ? 'On the day:\n' + stepsText(happens) + '\n\n' : '')
      + 'Just reply to this email with a time.' + CS.SIG;
    m = { title: chase ? 'We still need your time' : (co ? 'Your check-out appointment' : 'Your check-in'),
      preheader: (chase ? 'Reminder: ' : '') + What + ' on ' + day + ' at ' + addr + '. What time suits you?', blocks: [
      { p: 'Dear ' + names + ',' },
      { p: chase ? 'We haven\'t had your time yet for your ' + what + ', arranged by ' + who + copied + '.' : intro },
      { rows: [['Property', addr], ['Date', day], ['Latest start', latest], ['Reference', ref]] },
      { p: question + ' Just reply to this email with a time.' },
      { buttons: [replyBtn(subject, 'Reply with a time'), { button: mapUrl, text: 'Open in Google Maps', primary: false }] },
      { steps: happens }] };
  } else if (kind === 'propose' || kind === 'taken') {
    const offer = kind === 'taken' ? csNice_(job.tenantArrival) : job.tenantArrival, asked = kind === 'taken' ? csNice_(job.tenantAsked) : job.tenantAsked;
    const line = kind === 'taken'
      ? 'Thank you for getting back to us. Unfortunately the ' + asked + ' slot on ' + day + ' has already been taken, but we can offer ' + offer + ' instead.'
      : 'Thank you for letting us know. ' + asked + ' doesn\'t quite work for us on ' + day + '. Could we make it ' + offer + ' instead?';
    subject = What + ' - ' + addr + ' - ' + day + ' at ' + offer + '?';
    body = 'Dear ' + names + ',\n\n' + line + '\n\n'
      + (note ? note + '\n\n' : '')
      + (co ? 'On the day:\n' + stepsText(happens) + '\n\n' : '')
      + (kind === 'taken' ? 'Please reply to confirm ' + offer + ' works for you, or suggest another time.' : 'Please reply to confirm, or suggest another time.') + CS.SIG;
    m = { title: 'Could we make it ' + offer + '?', preheader: line, blocks: [
      { p: 'Dear ' + names + ',' },
      { p: line },
      { rows: [['Property', addr], ['Date', day], ['Suggested time', offer], ['Reference', ref]] }]
      .concat(note ? [{ p: note }] : [])
      .concat([
      { p: kind === 'taken' ? 'Please reply to this email to confirm ' + offer + ' works for you, or suggest another time.' : 'Please reply to this email to confirm, or suggest another time.' },
      { button: 'mailto:' + CS.FROM + '?subject=' + encodeURIComponent('Re: ' + subject) + '&body=' + encodeURIComponent(offer + ' is fine.'), text: 'Yes, ' + offer + ' is fine' }])
      .concat(co ? [{ steps: happens }] : []) };
  } else if (kind === 'options') {
    const list = (params.times || []).map(csNice_);
    const line = params.asked
      ? 'Thank you for getting back to us. Unfortunately we can\'t do ' + csNice_(params.asked) + ' on ' + day + ', but we can offer any of these times instead:'
      : 'For your ' + what + ' on ' + day + ', we can offer any of these times:';
    subject = What + ' - ' + addr + ' - ' + day + ' - which time suits you?';
    body = 'Dear ' + names + ',\n\n' + line + '\n\n' + list.map(function (t) { return '- ' + t; }).join('\n') + '\n\n'
      + 'Please reply with the time that suits you best.' + CS.SIG;
    m = { title: 'Which time suits you?', preheader: line + ' ' + list.join(', ') + '.', blocks: [
      { p: 'Dear ' + names + ',' }, { p: line },
      { rows: [['Property', addr], ['Date', day], ['Times we can offer', list.join(', ')], ['Reference', ref]] },
      { p: 'Please reply to this email with the time that suits you best.' },
      { buttons: [replyBtn(subject, 'Reply with a time')] }] };
  } else if (kind === 'otherday') {
    const newDay = csLongDay_(params.date), at = params.time ? ' at ' + csNice_(params.time) : '';
    const line = 'Thank you for letting us know. As ' + day + ' doesn\'t work for you, we can offer ' + newDay + at + ' instead.';
    subject = What + ' - ' + addr + ' - ' + newDay + at + '?';
    body = 'Dear ' + names + ',\n\n' + line + '\n\n'
      + (params.time ? 'Please reply to confirm, or suggest another day or time.' : 'Please reply to confirm, and let us know what time suits you that day.')
      + CS.SIG;
    m = { title: 'Could we do ' + newDay + '?', preheader: line, blocks: [
      { p: 'Dear ' + names + ',' }, { p: line },
      { rows: [['Property', addr], ['Day we can offer', newDay + at], ['Reference', ref]] },
      { p: params.time ? 'Please reply to this email to confirm, or suggest another day or time.' : 'Please reply to this email to confirm, and let us know what time suits you that day.' },
      { buttons: [replyBtn(subject, 'Reply')] }] };
  } else if (kind === 'late') {
    const eta = csNice_(params.eta);
    const line = 'We\'re sorry, we\'re running a little late for your ' + what + ' today at ' + addr + '. Our clerk now expects to be there at about ' + eta + '.';
    subject = What + ' today - ' + addr + ' - now about ' + eta;
    body = 'Dear ' + names + ',\n\n' + line + '\n\n'
      + 'Apologies for the inconvenience. If this causes a problem, please reply to this email or call ' + CS.PHONE + '.' + CS.SIG;
    m = { title: 'Running a little late', preheader: line, blocks: [
      { p: 'Dear ' + names + ',' }, { p: line },
      { rows: [['Property', addr], ['New time', 'About ' + eta], ['Reference', ref]] },
      { p: 'Apologies for the inconvenience. If this causes a problem, please reply to this email or call ' + CS.PHONE + '.' }] };
  } else if (kind === 'access') {
    const line = 'Thank you for letting us know you won\'t be able to be there for your ' + what + ' on ' + day + '.';
    const how = co
      ? 'That\'s no problem. Our clerk will carry out the check-out using keys arranged with ' + who + '. Please make sure everything is packed and removed, any cleaning is finished, and the keys are returned as arranged with ' + (landlord ? 'your landlord' : (firm || 'your letting agent')) + ' before the appointment.'
      : 'That\'s no problem. Our clerk will carry out the inventory using keys arranged with ' + who + ', and ' + (landlord ? 'your landlord' : (firm || 'your letting agent')) + ' will arrange handing the keys over to you. The report will then come to you by email to review and sign. You\'ll have 7 days to send any comments.';
    subject = What + ' - ' + addr + ' - ' + day + ' - keys and access';
    body = 'Dear ' + names + ',\n\n' + line + '\n\n' + how + '\n\n'
      + 'If anything changes, reply to this email or call ' + CS.PHONE + '.' + CS.SIG;
    m = { title: 'Keys and access', preheader: line, blocks: [
      { p: 'Dear ' + names + ',' }, { p: line }, { p: how },
      { rows: [['Property', addr], ['Date', day], ['Reference', ref]] },
      { small: 'If anything changes, reply to this email or call ' + CS.PHONE + '. ' + replyNote }] };
  } else {
    subject = What + ' - ' + addr + ' - confirmed';
    body = 'Dear ' + names + ',\n\nThank you. Your ' + what + ' at\n\n' + addr + '\n\nis confirmed for ' + day + ' at ' + job.tenantArrival + '. '
      + (co ? 'Please be fully moved out, with the keys ready, by then.' : 'Our clerk will meet you at the property then.') + '\n\n'
      + (note ? note + '\n\n' : '')
      + (co ? 'On the day:\n' + stepsText(happens) + '\n\n' : '')
      + 'If anything changes, reply to this email or call ' + CS.PHONE + '.' + CS.SIG;
    m = { title: 'Your ' + what + ' is confirmed', preheader: 'Confirmed: ' + day + ' at ' + job.tenantArrival + ', ' + addr + '.', blocks: [
      { p: 'Dear ' + names + ',' },
      { p: co ? 'Thank you. Your check-out is booked in. Please be fully moved out, with the keys ready, by the time below.' : 'Thank you. Your check-in is booked in. Our clerk will meet you at the property.' },
      { rows: [['Property', addr], ['Date', day], ['Time', job.tenantArrival], ['Reference', ref]] }]
      .concat(note ? [{ p: note }] : [])
      .concat([
      { buttons: [{ button: csCalUrl_(job, addr), text: 'Add to calendar' }, { button: mapUrl, text: 'Open in Google Maps', primary: false }] },
      { steps: happens },
      { small: 'If anything changes, reply to this email or call ' + CS.PHONE + '. ' + replyNote }]) };
  }
  const key = csKey_(job, kind, params);
  return { to: to, cc: cc.join(', '), subject: subject, body: body, html: (typeof wmOn_ === 'function' && wmOn_() ? wmHtml_(m) : ''), model: m, note: note, key: key };
}

// Google Calendar "add event" link (one hour from the tenants' time)
function csCalUrl_(job, addr) {
  const t = String(job.tenantArrival || '').split(':'), d = String(job.date || '').replace(/-/g, '');
  const h = Number(t[0]), mi = t[1] || '00', end = ('0' + Math.min(23, h + 1)).slice(-2) + mi;
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent((job.type === 'CO' ? 'Check-out - ' : 'Check-in - ') + addr)
    + '&dates=' + d + 'T' + ('0' + h).slice(-2) + mi + '00/' + d + 'T' + end + '00&ctz=Europe/London&location=' + encodeURIComponent(addr)
    + '&details=' + encodeURIComponent((job.type === 'CO' ? 'Check-out' : 'Check-in') + ' with Wellington Property Services. Ref ' + String(job.jobNo || '') + '. Questions: reply to our email or call ' + CS.PHONE + '.');
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

// ---------- editor: test the look with an extra line (Lex, 20 Oct) ----------
// Sends one sample confirmation, in the navy look and with an extra line, to lex@ and Lex's Hotmail only.
// Nothing goes to a tenant or agent, nothing is logged.
function csTestNote() {
  wpsEditorOnly_();
  const job = { jobNo: 'WPS000000', type: 'ICI', status: 'booked', client: 'McQueens', date: '2026-11-03',
    address: '8 North City One, 13 Murray Grove', town: 'London', postcode: 'N1 7JY', tenantEmails: 'test@example.com',
    tenantList: [{ name: 'Jennifer Downing' }, { name: 'Joseph Cooke' }], agentEmail: 'jamal.gormati@mcqueens.london',
    tenantAsked: '13:30', tenantArrival: '13:30', ciNote: "If your flight is delayed, just reply to this email and we'll adjust the time.",
    ciNoteFor: 'confirm|2026-11-03|13:30' };
  const m = csEmail_(job, 'confirm', [], []);
  const to = 'lex@wellington-ps.co.uk, lex.salami@hotmail.com';
  GmailApp.sendEmail(to, '[SAMPLE extra line] ' + m.subject, m.body, { name: CS.NAME, from: CS.FROM, htmlBody: m.html });
  Logger.log('Sample sent to ' + to + (m.html ? ' (navy look)' : ' (PLAIN: WpsMail is off or missing)') + (m.note ? ', extra line included' : ', NO extra line'));
}

// ---------- editor: samples of the new emails (Lex, 21 Oct; situation templates 23 Oct) ----------
// Sends one of each email, in the navy look, to lex@ only. Nothing goes to a tenant, agent or landlord, nothing is logged.
function csSendSamples() {
  wpsEditorOnly_();
  const to = 'lex@wellington-ps.co.uk';
  const co = { jobNo: 'WPS000000', type: 'CO', status: 'booked', client: 'Move Lettings', date: '2026-11-19',
    address: 'Flat 7, Test Court, High Street', town: 'Gravesend', postcode: 'DA11 0AP', tenantEmails: 'test@example.com',
    tenantList: [{ name: 'Sam Test' }, { name: 'Alex Test' }], agentEmail: 'propertymanagement@movelettings.co.uk',
    tenantAsked: '11:00', tenantArrival: '10:30' };
  const ll = Object.assign({}, co, { client: 'Jacquie Mathieson', agentEmail: 'landlord@example.com' });
  const ci = Object.assign({}, co, { type: 'ICI', client: 'McQueens', agentEmail: 'jamal.gormati@mcqueens.london' });
  const list = [['check-out ask', co, 'ask'], ['check-out chaser', co, 'chaser'], ['check-out confirm', co, 'confirm'], ['check-out propose', co, 'propose'],
    ['check-out ask, private landlord', ll, 'ask'], ['check-in ask', ci, 'ask'], ['check-in chaser', ci, 'chaser']];
  list.forEach(function (x) {
    const m = csEmail_(x[1], x[2], [], []);
    GmailApp.sendEmail(to, '[SAMPLE ' + x[0] + '] ' + m.subject, m.body, { name: CS.NAME, from: CS.FROM, htmlBody: m.html });
  });
  Logger.log(list.length + ' samples sent to ' + to);
}
// The six situation templates (23 Oct), to lex@ only.
function csSendTemplateSamples() {
  wpsEditorOnly_();
  const to = 'lex@wellington-ps.co.uk';
  const ci = { jobNo: 'WPS000000', type: 'ICI', status: 'booked', client: 'McQueens', date: '2026-11-02',
    address: '2 Test Courtyard, 154 Test Road', town: 'London', postcode: 'EC1V 7DX', tenantEmails: 'test@example.com',
    tenantList: [{ name: 'Robbie Test' }, { name: 'Honor Test' }], agentEmail: 'jamal.gormati@mcqueens.london' };
  const list = [['confirm', { time: '12:00' }], ['taken', { asked: '11:00', time: '12:00' }], ['options', { asked: '11:00', times: ['12:00', '12:30', '13:00'] }],
    ['otherday', { date: '2026-11-04', time: '12:00' }], ['late', { eta: '12:20' }], ['access', {}]];
  list.forEach(function (x) {
    const p = csParams_(x[1]), job = csWithParams_(ci, x[0], p), m = csEmail_(job, x[0], [], [], p);
    GmailApp.sendEmail(to, '[SAMPLE ' + x[0] + '] ' + m.subject, m.body, { name: CS.NAME, from: CS.FROM, htmlBody: m.html });
  });
  Logger.log(list.length + ' template samples sent to ' + to);
}
