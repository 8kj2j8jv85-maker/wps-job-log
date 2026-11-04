// InvoiceMake — invoices made and sent by the dashboard, not Tide (Lex, 4 Nov 2026, 21:17-21:26). New file in the WPS Amendments script.
//
// Lex: "invoices are made and sent by the dashboard ... automate as much as possible, minimal clicks." Tide stays the bank only.
//
// WHAT IT DOES (timer ivTimer, every 15 minutes; nothing here needs Claude)
//  1. Drafts: every job whose report has gone out (Sent / Signed / Deemed / Archived), with no invoice state and no invoice
//     number, gets an invoice drafted by itself: priced from the agent's price list (Winkworth list as the base), numbered
//     (INV-0032 on, the next number kept in Script Properties, never reused), PDF made in the WPS navy look and filed in
//     Drive > WPS Invoices > <YYYY-MM>. The dashboard shows it as "Ready".
//     It holds instead of guessing (status "Needs info", no number used) when: no bedrooms (job or report cover), no price,
//     no invoice email, congestion ticked with no amount, or a Tide email already names the job (then it says which INV).
//  2. Sending: "Send all ready (n)" or Send on one invoice (Lex's tap), from finance@ in the navy look, his wording, PDF
//     attached, a copy to finance@ (bcc). Never twice: each invoice goes ready -> sending -> sent under a lock, and a
//     "sending" invoice is never sent again by itself (it shows "check Sent mail").
//  3. Auto-send (switch, OFF until Lex turns it on): a ready invoice sends itself at 09:00 the next working day unless held.
//     08:30 push to the phone lists what goes at 9:00.
//  4. Paid: Winkworth (TLP) remittance emails to finance@ are read (the attached PDF's text) and the listed invoices marked
//     Paid when the amount agrees (Tide-era INV-0006..0031 included). Tide statement CSVs dropped in Drive > WPS Bank
//     statements are read once each: credits matched to open invoices by invoice number in the reference, or agency name +
//     amount (one invoice, or one set of that agency's invoices that adds up). Anything else is listed as unmatched.
//     Never sends a receipt to anyone.
//  5. Chasers: a reminder 3 days before the due date and a chaser 7 days after it, polite, in Lex's style. Lex taps Send;
//     "Auto-chase" switch (OFF) sends them by themselves at 09:00-12:00 on working days.
//  6. 18:00 push when a Sent job has had no invoice for over a day, an invoice is ready but unsent, or one is overdue.
//  7. Accountant pack: on the 1st (after 07:00) for last month, or "Make now": a sales list CSV and a Xero sales-invoice
//     import CSV, saved with that month's PDFs in WPS Invoices > <YYYY-MM>.
//
// Data: tab "Invoices" in the Job Log Sheet (one row per invoice, the full record in "Data (do not edit)"). On send / paid the
// job itself gets invoice, invoiceNo, invoiceAmount, invoicedAt, invoiceDue, invoicePdfId, paidAt (history line too), so the
// old Tide card flow, To invoice, Awaiting payment and Money by month all keep working.
// Accounts page (5 Nov 2026): invRead {all:true} returns every invoice plus price lists and addresses; invEdit {full:true}
// edits any field of an invoice (lines, client, dates, note) and keeps its number; invEdit {create:true} makes a new one
// (one-off, or for a job; importNo brings a Tide-era invoice in under its own number); invSend {resend:true} sends a
// corrected copy of a sent invoice; invVoid {sentToo:true} cancels a sent invoice (number never reused, PDF kept).
// Ops (Dash): READ invRead, invPreview; WRITE invEdit, invMake, invSend, invHold, invVoid, invRemind, invPaid, invDismiss,
// invSettings, invScan, invPack. The Claude key is refused invSend, invRemind, invSettings, invVoid (Dash DK.DENY).
// Needs: Keeper (kpJobLogSs_, kpReadJobs_, kpWriteJobs_, kpNorm_, kpLog_), Dash (dkMeta_), WpsMail (wmHtml_, wmEsc_),
// Alert (alTopic_), Script Properties INV_COMPANY_NO (required) and INV_TEMPLATE (optional), Archive (arValues_, AR_COL: optional, for beds from the report cover), Drive advanced service (v3,
// remittance PDF text). Editor: ivStart (timer on), ivStop, ivTest (read only), ivSetFirst (only if the first number is wrong).

const IV = {
  TZ: 'Europe/London',
  FIRST_NO: 32,                       // Tide used INV-0006..0031 (4 Nov); the dashboard starts at INV-0032
  OLD_SERIES: 1000,                    // old QuickBooks numbers (e.g. INV-2878 on WPS260916) are history, not our series
  PROP_NEXT: 'iv_next_no',
  PROP_SET: 'iv_settings',            // {"autoSend":false,"autoChase":false}
  PROP_DAY: 'iv_day_marks',           // what ran today (pushes, pack)
  PROP_REMIT: 'iv_remit_seen',
  PROP_BANK: 'iv_bank_files',
  PROP_CREDITS: 'iv_credit_seen',
  PROP_UNMATCHED: 'iv_unmatched',
  PROP_EMAILS: 'iv_invoice_emails',   // per-agent invoice email saved from the card
  TAB: 'Invoices',
  HEAD: ['Invoice no', 'Status', 'Job no', 'Customer', 'Email', 'Service', 'Property', 'Invoice date', 'Due date', 'Net', 'VAT', 'Gross',
    'Sent at', 'Paid date', 'Payment ref', 'PDF', 'Key', 'Data (do not edit)'],
  START_SENT: '2026-11-01',           // jobs whose report went out before this are only drafted on a tap (Make invoice)
  DUE_DAYS: 28,
  EXTRA: 10,
  REMIND_BEFORE: 3,
  CHASE_AFTER: 7,
  AUTO_FROM_H: 9, AUTO_TO_H: 12,
  FROM: 'finance@wellington-ps.co.uk',
  BCC: 'finance@wellington-ps.co.uk',
  NAME: 'Wellington Property Services',
  WINK_EMAIL: 'bowpropman@winkworth.co.uk',
  CO: {
    name: 'Wellington Property Services Limited',
    // company number: NOT in the code. Script Property INV_COMPANY_NO (two sources disagree, 4 Nov: 17403841 / 17451841).
    // Until it is set, drafts wait as "Needs info" (no number used) and nothing is sent.
    address: ['66 Paul Street', 'London EC2A 4NA'],
    email: 'finance@wellington-ps.co.uk', phone: '07541 345053', web: 'www.wellington-ps.co.uk', aiic: 'Full AIIC Member'
  },
  BANK: { name: 'Wellington Property Services Limited', bank: 'Tide', account: 'Current Account', sort: '04-06-05', number: '33668674' },
  FOOTER: 'Thank you for your business. Wellington Property Services Limited, Full AIIC Member. Questions about this invoice: finance@wellington-ps.co.uk or 07541 345053.',
  FOLDER: 'WPS Invoices',
  BANK_FOLDER: 'WPS Bank statements',
  LOGO: 'https://8kj2j8jv85-maker.github.io/wps-job-log/sig/email/wps-logo-colour-white.png',   // white + coral, for the navy band (design B)
  LOGO_NAVY: 'https://8kj2j8jv85-maker.github.io/wps-job-log/sig/email/wps-logo-navy.png',
  REMIT_QUERY: 'from:noreply_tlp@thelettingpartnership.co.uk subject:remittance has:attachment newer_than:21d',
  TIDE_QUERY: 'from:no-reply@clientinvoicing.tide.co',
  LABEL: { CO: 'Check Out', ICI: 'Inventory & Check In', MTI: 'Mid-Term Inspection', SOC: 'Schedule of Condition' },
  SHORT: { CO: 'CO', ICI: 'ICI', MTI: 'MTI', SOC: 'SOC' },
  // Winkworth list (Tide catalogue, 4 Nov): the base for every agent unless the dashboard's Price list says otherwise. 0 = studio.
  BASE: {
    ICI: { 0: 160, 1: 170, 2: 180, 3: 190, 4: 200, 5: 210, 6: 220 },
    CO: { 0: 120, 1: 150, 2: 160, 3: 170, 4: 180, 5: 190, 6: 200 },
    MTI: { 0: 90, 1: 90, 2: 100, 3: 110, 4: 120, 5: 130, 6: 140 },
    SOC: { 0: 120, 1: 150, 2: 160, 3: 170, 4: 180, 5: 190, 6: 200 }
  },
  REPORT_OUT: ['sent', 'signed', 'deemed', 'archived'],
  // England and Wales bank holidays (gov.uk) for "next working day"
  HOLIDAYS: ['2026-12-25', '2026-12-28', '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28'],
  MONTHS: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};

// ================================================================
// 1. PURE RULES (tested offline: node WPS_InvoiceMake_tests.js)
// ================================================================
function ivRound_(n) { return Math.round(Number(n) * 100) / 100; }
function ivMoney_(n) { return '£' + ivRound_(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function ivAmount_(t) { if (typeof t === 'number') return isFinite(t) ? t : null; const m = String(t == null ? '' : t).replace(/,/g, '').match(/-?\d+(?:\.\d{1,2})?/); return m ? parseFloat(m[0]) : null; }
function ivNoStr_(n) { const s = String(n); return 'INV-' + (s.length < 4 ? '0000'.slice(s.length) + s : s); }
function ivNoNum_(s) { const m = /^INV\s*-\s*(\d{3,6})$/i.exec(String(s || '').trim()); return m ? parseInt(m[1], 10) : 0; }
function ivNormNo_(s) { const n = ivNoNum_(s); return n ? ivNoStr_(n) : ''; }
// Next number: never below the stored next, the first dashboard number, or one past any number already on a job or row.
function ivNextNo_(stored, used) {
  let n = Math.max(IV.FIRST_NO, parseInt(stored, 10) || 0);
  (used || []).forEach(function (u) { const k = ivNoNum_(u); if (k >= n && k < IV.OLD_SERIES) n = k + 1; });
  return n;
}
function ivCustomer_(client) { return String(client || '').replace(/\s+-\s+/g, ' ').replace(/\s{2,}/g, ' ').trim(); }
function ivIsWink_(client) { return /winkworth/i.test(String(client || '')); }
function ivFirstEmail_(s) { const m = String(s || '').match(/[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+/); return m ? m[0].toLowerCase() : ''; }
// Invoice email: Winkworth always bowpropman@; else the agent's invoice email (Clients tab data, or saved from the card),
// else the job's Copy to. '' = hold.
function ivEmailFor_(job, client, saved) {
  if (ivIsWink_(job.client)) return { email: IV.WINK_EMAIL, from: 'Winkworth rule' };
  const c = ivFirstEmail_(client && client.invoiceEmail);
  if (c) return { email: c, from: 'agent invoice email' };
  const s = ivFirstEmail_((saved || {})[String(job.client || '').toLowerCase()]);
  if (s) return { email: s, from: 'agent invoice email' };
  const j = ivFirstEmail_(job.agentEmail);
  if (j) return { email: j, from: 'job Copy to' };
  return { email: '', from: '' };
}
// The customer's billing address (GOV.UK: an invoice must show the customer's name and address). From the client record
// (invoiceAddress / address) or Script Property INV_ADDRESSES = {"Winkworth Bow": "line 1, line 2, postcode"}. Never guessed.
function ivBillAddress_(job, client, o) {
  if (o && o.billAddress) return String(o.billAddress).trim();
  const c = client && (client.invoiceAddress || client.address);
  if (c) return String(c).trim();
  const map = (o && o.addresses) || {};
  const want = ivCustomer_(job.client).toLowerCase();
  const k = Object.keys(map).filter(function (n) { return ivCustomer_(n).toLowerCase() === want; })[0];
  return k ? String(map[k]).trim() : '';
}
function ivBedKey_(beds) {
  const s = String(beds == null ? '' : beds).trim();
  if (/^studio$/i.test(s) || s === '0') return '0';
  return /^[1-6]$/.test(s) ? s : '';
}
function ivBedLabel_(k) { return k === '0' ? 'Studio' : k + ' bed'; }
function ivPriceType_(t) { return t === 'SOC' ? 'SOC' : t; }
// Main price: the agent's price list (house price for a house when set), else the Winkworth base list.
function ivPrice_(type, bedKey, house, client) {
  if (!IV.BASE[type] || bedKey === '') return null;
  const p = client && client.prices ? (client.prices[type] || (type === 'SOC' ? client.prices.CO : null)) : null;
  if (p) {
    const hv = house ? ivAmount_(p['h' + bedKey]) : null;
    if (hv != null) return { amount: hv, from: 'price list (house)' };
    const v = ivAmount_(p[bedKey]);
    if (v != null) return { amount: v, from: 'price list' };
  }
  const b = IV.BASE[type][bedKey];
  return b != null ? { amount: b, from: 'Winkworth list' } : null;
}
function ivExtraPrice_(type, client) {
  const p = client && client.prices ? (client.prices[type] || (type === 'SOC' ? client.prices.CO : null)) : null;
  const v = p ? ivAmount_(p.extra) : null;
  return v != null ? v : IV.EXTRA;
}
function ivAddress_(j) { return [j.address, j.town, j.postcode].map(function (s) { return String(s || '').trim(); }).filter(Boolean).join(', ').replace(/\s{2,}/g, ' '); }
function ivJobLine_(j) { return [j.jobNo, IV.LABEL[j.type] || j.type, ivAddress_(j)].filter(Boolean).join(' - '); }
// Build an invoice from a job. o = { beds, extras, extraNames:[], parking, congestion (amount), total (override), email,
// front: {beds, extra} from the report cover, saved: per-agent emails }. Pure; returns the draft with problems listed.
function ivBuild_(job, client, o) {
  o = o || {};
  const problems = [], notes = [];
  const type = job.type;
  if (!IV.LABEL[type]) problems.push((type || 'This type') + ' has no invoice price (only check-outs, check-ins, mid-terms and schedules of condition)');
  let bedsRaw = o.beds != null && o.beds !== '' ? o.beds : job.bedrooms, bedsFrom = o.beds != null && o.beds !== '' ? 'edited' : 'job';
  if ((bedsRaw == null || String(bedsRaw).trim() === '') && o.front && o.front.beds) { bedsRaw = o.front.beds; bedsFrom = 'report cover'; }
  const bedKey = ivBedKey_(bedsRaw);
  if (bedKey === '') problems.push(String(bedsRaw || '').trim() ? 'Bedrooms "' + bedsRaw + '" has no price (studio to 6 bed)' : 'Bedrooms not set on the job or the report cover');
  let names = (o.extraNames || []).map(function (x) { return String(x || '').trim(); }).filter(Boolean);
  let nEx, exFrom;
  if (names.length) { nEx = names.length; exFrom = 'edited'; }
  else if (o.extras != null && o.extras !== '') { nEx = parseInt(o.extras, 10) || 0; exFrom = 'edited'; }
  else if (job.extraAreas != null && String(job.extraAreas).trim() !== '') { nEx = parseInt(job.extraAreas, 10) || 0; exFrom = 'job'; }
  else if (o.front && o.front.extra !== '' && o.front.extra != null) { nEx = parseInt(o.front.extra, 10) || 0; exFrom = 'report cover'; }
  else { nEx = 0; exFrom = 'none set'; }
  if (nEx < 0 || nEx > 30) { problems.push('Extra areas must be 0 to 30'); nEx = 0; }
  const price = bedKey !== '' && IV.LABEL[type] ? ivPrice_(type, bedKey, job.propertyType === 'House', client) : null;
  if (bedKey !== '' && IV.LABEL[type] && !price) problems.push('No price for ' + (IV.LABEL[type]) + ' ' + ivBedLabel_(bedKey));
  const exUnit = ivExtraPrice_(type, client);
  const parking = o.parking != null && o.parking !== '' ? ivAmount_(o.parking) : (ivAmount_(job.parkingExtra) || 0);
  let cong = 0;
  if (o.congestion != null && o.congestion !== '') cong = ivAmount_(o.congestion) || 0;
  else if (job.congestion) {
    const c = client && client.prices ? ivAmount_(client.prices.congestion) : null;
    if (c == null) problems.push('Congestion zone ticked but no congestion amount on the price list (or type it on the invoice)');
    else cong = c;
  }
  if (parking == null || parking < 0) problems.push('Parking amount not understood');
  const travel = ivRound_((parking || 0) + (cong || 0));
  const lines = [];
  let main = price ? ivRound_(price.amount + travel) : 0;
  const exTotal = ivRound_(nEx * exUnit);
  let total = ivRound_(main + exTotal);
  let override = null;
  if (o.total != null && o.total !== '') {
    override = ivAmount_(o.total);
    if (override == null || override <= 0) problems.push('Total "' + o.total + '" is not an amount');
    else if (override < exTotal) problems.push('Total ' + ivMoney_(override) + ' is less than the extra areas (' + ivMoney_(exTotal) + ')');
    else { main = ivRound_(override - exTotal); total = ivRound_(override); notes.push('Total set by Lex: ' + ivMoney_(override)); }
  }
  if (IV.LABEL[type] && bedKey !== '') lines.push({ desc: IV.LABEL[type] + ' - ' + ivBedLabel_(bedKey), qty: 1, unit: main, amount: main });
  if (nEx > 0) lines.push({ desc: 'Extra area' + (names.length ? ' - ' + names.join(', ') : ''), qty: nEx, unit: exUnit, amount: exTotal });
  const em = o.email ? { email: ivFirstEmail_(o.email), from: 'edited' } : ivEmailFor_(job, client, o.saved);
  if (!em.email) problems.push('No invoice email for ' + (ivCustomer_(job.client) || 'this job') + ' (add one on the invoice)');
  if (!job.client) problems.push('No agent on the job');
  const billAddress = ivBillAddress_(job, client, o);
  if (job.client && !billAddress) problems.push('No billing address for ' + (ivCustomer_(job.client) || 'this agent') + ' (Script Property INV_ADDRESSES)');
  if (bedsFrom === 'report cover' || exFrom === 'report cover') notes.push('Beds / extra areas from the report cover: check before it goes');
  if (travel) notes.push('Includes ' + [parking ? 'parking ' + ivMoney_(parking) : '', cong ? 'congestion ' + ivMoney_(cong) : ''].filter(Boolean).join(' and ') + ' in the ' + (IV.SHORT[type] || type) + ' line');
  return {
    jobId: job.id, jobNo: job.jobNo, type: type, customer: ivCustomer_(job.client), client: job.client || '', email: em.email, emailFrom: em.from,
    service: IV.LABEL[type] || type, property: ivAddress_(job), jobLine: ivJobLine_(job),
    billAddress: billAddress, visitDate: /^\d{4}-\d{2}-\d{2}$/.test(String(job.date || '')) ? job.date : '',
    beds: bedKey, bedsFrom: bedsFrom, extras: nEx, extrasFrom: exFrom, extraNames: names, extraUnit: exUnit,
    base: price ? price.amount : null, priceFrom: price ? price.from : '', parking: parking || 0, congestion: cong || 0, override: override,
    lines: lines, net: total, vat: 0, total: total, problems: problems, notes: notes,
    coverOnly: bedsFrom === 'report cover' || exFrom === 'report cover'
  };
}
// Dates are 'YYYY-MM-DD' strings (London day). No time zones in the pure part.
function ivAddDays_(ds, n) { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function ivDaysBetween_(a, b) { return Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5); }
function ivWorkingDay_(ds) { const w = new Date(ds + 'T12:00:00Z').getUTCDay(); return w !== 0 && w !== 6 && IV.HOLIDAYS.indexOf(ds) === -1; }
function ivNextWorkingDay_(ds) { let d = ivAddDays_(ds, 1); while (!ivWorkingDay_(d)) d = ivAddDays_(d, 1); return d; }
function ivLongDate_(ds) { const p = String(ds).split('-'); return parseInt(p[2], 10) + ' ' + IV.MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0]; }
function ivUkDate_(ds) { const p = String(ds || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : ''; }
// Where an invoice stands for the dashboard.
function ivState_(inv, today) {
  if (!inv) return 'none';
  if (inv.status === 'paid') return 'paid';
  if (inv.status === 'void') return 'void';
  if (inv.status === 'needs') return 'needs';
  if (inv.status === 'ready') return 'ready';
  if (inv.status === 'sending') return 'sending';
  if (inv.status === 'sent') return today > inv.due ? 'overdue' : 'sent';
  return inv.status || 'none';
}
// Reminder 3 days before due (until the due date), chaser 7 days after; each once.
function ivChaseDue_(inv, today) {
  if (!inv || inv.status !== 'sent' || !inv.due) return '';
  const d = ivDaysBetween_(today, inv.due);
  if (!inv.chaserAt && d <= -IV.CHASE_AFTER) return 'chaser';
  if (!inv.reminderAt && !inv.chaserAt && d <= IV.REMIND_BEFORE && d >= 0) return 'reminder';
  return '';
}
// Lex's wording (4 Nov). Plain text exactly as approved; the HTML uses the same lines.
function ivEmail_(inv) {
  const lines = ['Hi ' + inv.customer + ',', 'Please find attached invoice ' + inv.no + ' for ' + ivMoney_(inv.total) + '.', inv.jobLine,
    'Payment is due by ' + ivLongDate_(inv.due) + '. Our bank details are on the invoice.', 'If you have any questions, please let us know.',
    'Thank you for your business, it is always appreciated.', 'Wellington Property Services Limited'];
  return { subject: 'Invoice ' + inv.no + ' - ' + inv.jobLine, lines: lines, text: lines.join('\n\n') };
}
// Corrected copy of a sent invoice (Accounts page, 5 Nov). Same shape as ivEmail_ (line 3 = the job line).
function ivCorrectedEmail_(inv) {
  const was = String(inv.sentAt || '').slice(0, 10);
  const lines = ['Hi ' + inv.customer + ',', 'Please find attached a corrected copy of invoice ' + inv.no + ' for ' + ivMoney_(inv.total) + '.' + (was ? ' It replaces the copy we sent on ' + ivLongDate_(was) + '.' : ''),
    inv.jobLine, 'Payment is due by ' + ivLongDate_(inv.due) + '. Our bank details are on the invoice.', 'If you have any questions, please let us know.',
    'Thank you for your business, it is always appreciated.', 'Wellington Property Services Limited'];
  return { subject: 'Corrected invoice ' + inv.no + ' - ' + inv.jobLine, lines: lines, text: lines.join('\n\n') };
}
// Full edit / new invoice (Accounts page, 5 Nov). f = { customer, email, billAddress, jobLine, service, visitDate, date, due,
// note, lines: [{ desc, qty, unit }] }. Pure: returns the invoice fields and the problems (nothing guessed).
function ivManual_(f) {
  f = f || {};
  const problems = [], t = function (v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n); };
  const customer = t(f.customer, 80), email = ivFirstEmail_(f.email), billAddress = String(f.billAddress == null ? '' : f.billAddress).replace(/[ \t]+/g, ' ').trim().slice(0, 240);
  const jobLine = t(f.jobLine, 200), service = t(f.service, 60), note = t(f.note, 200);
  const iso = function (v) { const s = t(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
  const visitDate = iso(f.visitDate), date = iso(f.date), due = iso(f.due);
  if (!customer) problems.push('Client name is empty');
  if (!email) problems.push(String(f.email || '').trim() ? '"' + t(f.email, 60) + '" isn\'t an email address' : 'Send-to email is empty');
  if (!billAddress) problems.push('Billing address is empty');
  if (!jobLine) problems.push('Property line (what the invoice is for) is empty');
  if (t(f.date, 10) && !date) problems.push('Invoice date not understood');
  if (t(f.due, 10) && !due) problems.push('Due date not understood');
  if (date && due && due < date) problems.push('Due date is before the invoice date');
  const raw = Array.isArray(f.lines) ? f.lines : [], lines = [];
  if (!raw.length) problems.push('No lines on the invoice');
  if (raw.length > 20) problems.push('Up to 20 lines');
  raw.slice(0, 20).forEach(function (l, i) {
    const desc = t(l && l.desc, 120), qty = ivAmount_(l && l.qty), unit = ivAmount_(l && l.unit);
    if (!desc) problems.push('Line ' + (i + 1) + ' has no description');
    if (qty == null || qty <= 0 || qty > 999) problems.push('Line ' + (i + 1) + ' quantity must be 1 to 999');
    if (unit == null || Math.abs(unit) > 99999) problems.push('Line ' + (i + 1) + ' price is not an amount');
    const q = qty || 0, u = unit || 0;
    lines.push({ desc: desc, qty: q, unit: ivRound_(u), amount: ivRound_(q * u) });
  });
  const total = ivRound_(lines.reduce(function (s, l) { return s + l.amount; }, 0));
  if (raw.length && !(total > 0)) problems.push('Total must be more than £0.00');
  return { customer: customer, email: email, emailFrom: 'edited', billAddress: billAddress, jobLine: jobLine, service: service, note: note,
    visitDate: visitDate, date: date, due: due, lines: lines, net: total, vat: 0, total: total, problems: problems, notes: [], manual: true };
}
// Polite reminder and chaser (no "pay immediately", never asks them to confirm receipt). Draft wording for Lex's OK.
function ivChaseEmail_(inv, kind) {
  const lines = kind === 'reminder'
    ? ['Hi ' + inv.customer + ',', 'Just a friendly reminder that invoice ' + inv.no + ' for ' + ivMoney_(inv.total) + ' is due on ' + ivLongDate_(inv.due) + '.', inv.jobLine,
      'I have attached a copy of the invoice. Our bank details are on it.', 'If payment is already on its way, thank you, and please ignore this email.',
      'If you have any questions, please let us know.', 'Wellington Property Services Limited']
    : ['Hi ' + inv.customer + ',', 'Our records show invoice ' + inv.no + ' for ' + ivMoney_(inv.total) + ' was due on ' + ivLongDate_(inv.due) + ' and is still open.', inv.jobLine,
      'I have attached a copy of the invoice. Our bank details are on it.', 'If payment has already been made, thank you, and please ignore this email.',
      'If anything is holding it up, please let us know and we will help.', 'Wellington Property Services Limited'];
  return { subject: (kind === 'reminder' ? 'Reminder: invoice ' : 'Invoice ') + inv.no + (kind === 'reminder' ? ' due ' + ivLongDate_(inv.due) : ' - now overdue') + ' - ' + inv.jobNo, lines: lines, text: lines.join('\n\n') };
}
// ---- remittance (TLP / Winkworth). Real layout seen 21 Oct:
// "Reference: BOW19000379 ... £280.00 has been paid by BACS ... 21/10/2026 Payment: INV - 0017 (£140.00) (£0.00) (£140.00)"
function ivParseRemit_(text) {
  const t = String(text || '').replace(/[ \t ]+/g, ' ');
  const ref = (/Reference:\s*([A-Z0-9-]{4,30})/i.exec(t) || [])[1] || '';
  const total = ivAmount_((/£\s?([\d,]+\.\d{2})\s+has been paid/i.exec(t) || [])[1]);
  const acct = (/account number\s+(\d{6,10})(?:\s+at\s+([A-Za-z ]{2,30}?))?[:.\n]/i.exec(t) || []);
  const items = [], seen = {};
  // "Payment: INV - 0017 (£140.00)" and "Partial Payment: INV - 2846 (CHECK IN) (£29.60)" (TLP, seen 21 and 27 Oct)
  const re = /(\d{2}\/\d{2}\/\d{4})\s+(?:Partial\s+)?Payment:\s*INV\s*-\s*(\d{3,6})\s*(?:\([A-Za-z &\/-]{2,40}\)\s*)?\(£\s?([\d,]+\.\d{2})\)/gi;
  let m;
  while ((m = re.exec(t))) {
    const no = ivNoStr_(parseInt(m[2], 10));
    if (seen[no]) { seen[no].amount = ivRound_(seen[no].amount + ivAmount_(m[3])); continue; }
    const p = m[1].split('/');
    seen[no] = { no: no, amount: ivAmount_(m[3]), date: p[2] + '-' + p[1] + '-' + p[0] };
    items.push(seen[no]);
  }
  return { ref: ref, total: total, account: acct[1] || '', bank: (acct[2] || '').trim(), items: items };
}
// ---- CSV (bank statement in, packs out)
function ivCsvParse_(text) {
  const rows = []; let row = [], cell = '', q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(function (c) { return c !== ''; })) rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(function (c) { return c !== ''; })) rows.push(row);
  return rows;
}
function ivCsvCell_(v) { const s = String(v == null ? '' : v); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; }
function ivCsv_(rows) { return rows.map(function (r) { return r.map(ivCsvCell_).join(','); }).join('\r\n') + '\r\n'; }
function ivIsoFrom_(s) {
  const t = String(s || '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(t);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  m = /^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/.exec(t);
  if (m) { const mi = IV.MONTHS.map(function (x) { return x.slice(0, 3).toLowerCase(); }).indexOf(m[2].toLowerCase()); if (mi >= 0) return m[3] + '-' + ('0' + (mi + 1)).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  return '';
}
// Money in from a statement export. Columns found by name (Tide's export names aren't confirmed yet): a date column,
// "Paid in"/"Money in"/"Credit" (or a signed "Amount"), and every description / reference / name column joined.
function ivCredits_(rows) {
  if (!rows || rows.length < 2) return { credits: [], error: 'No rows' };
  let hi = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) if (rows[i].some(function (c) { return /date/i.test(c); }) && rows[i].some(function (c) { return /amount|paid in|money in|credit|in \(/i.test(c); })) { hi = i; break; }
  if (hi < 0) return { credits: [], error: 'No header row with a date and an amount column' };
  const h = rows[hi].map(function (c) { return String(c).trim().toLowerCase(); });
  const di = h.findIndex(function (c) { return /^date|transaction date|posted/.test(c); });
  const ii = h.findIndex(function (c) { return /paid in|money in|credit|^in\b|in \(/.test(c); });
  const ai = h.findIndex(function (c) { return /^amount|amount \(|value/.test(c); });
  const ti = h.findIndex(function (c) { return /type|direction/.test(c); });
  const txt = h.map(function (c, i) { return /desc|reference|ref|name|details|payee|payer|counterparty|narrative/.test(c) ? i : -1; }).filter(function (i) { return i >= 0; });
  if (di < 0 || (ii < 0 && ai < 0)) return { credits: [], error: 'Date or amount column not found' };
  const out = [];
  rows.slice(hi + 1).forEach(function (r) {
    const date = ivIsoFrom_(r[di]);
    let amt = ii >= 0 ? ivAmount_(r[ii]) : null;
    if (amt == null && ai >= 0) { amt = ivAmount_(r[ai]); if (amt != null && ti >= 0 && /out|debit|payment/i.test(r[ti]) && !/in|credit|received/i.test(r[ti])) amt = -Math.abs(amt); }
    if (!date || amt == null || amt <= 0) return;
    const text = txt.map(function (i) { return String(r[i] || '').trim(); }).filter(Boolean).join(' | ');
    out.push({ date: date, amount: ivRound_(amt), text: text, key: date + '|' + ivRound_(amt).toFixed(2) + '|' + text.toLowerCase().replace(/\s+/g, ' ').slice(0, 80) });
  });
  return { credits: out, error: '' };
}
function ivWords_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 2 && ['the', 'and', 'ltd', 'limited', 'london', 'lettings', 'estates', 'property'].indexOf(w) === -1; }); }
function ivNamesAgency_(text, customer) { const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '; const w = ivWords_(customer); return w.length > 0 && w.some(function (x) { return t.indexOf(' ' + x + ' ') !== -1 || t.indexOf(' ' + x) !== -1; }); }
// Match credits to open invoices ({no, customer, total, due}). Returns { matched:[{credit, nos, how}], unmatched:[credit] }.
function ivMatch_(credits, open) {
  const left = (open || []).slice(), matched = [], unmatched = [];
  const take = function (nos) { nos.forEach(function (n) { const i = left.findIndex(function (x) { return x.no === n; }); if (i >= 0) left.splice(i, 1); }); };
  (credits || []).forEach(function (c) {
    const named = (String(c.text).match(/INV\s*-?\s*0*\d{2,6}/gi) || []).map(ivNormNo_).filter(Boolean);
    if (named.length) {
      const inv = named.map(function (n) { return left.filter(function (x) { return x.no === n; })[0]; }).filter(Boolean);
      const sum = ivRound_(inv.reduce(function (s, x) { return s + x.total; }, 0));
      if (inv.length === named.length && Math.abs(sum - c.amount) < 0.005) { matched.push({ credit: c, nos: inv.map(function (x) { return x.no; }), how: 'invoice number in the reference' }); take(matched[matched.length - 1].nos); return; }
      unmatched.push(Object.assign({}, c, { why: 'Names ' + named.join(', ') + ' but the amount doesn\'t agree with the open invoice' + (named.length > 1 ? 's' : '') }));
      return;
    }
    const mine = left.filter(function (x) { return ivNamesAgency_(c.text, x.customer); });
    const one = mine.filter(function (x) { return Math.abs(x.total - c.amount) < 0.005; });
    if (one.length === 1) { matched.push({ credit: c, nos: [one[0].no], how: 'agency name and amount' }); take([one[0].no]); return; }
    if (one.length > 1) { unmatched.push(Object.assign({}, c, { why: one.length + ' open ' + one[0].customer + ' invoices are ' + ivMoney_(c.amount) + ': pick which' })); return; }
    // one set of this agency's open invoices that adds up (up to 8 invoices; only if exactly one set fits)
    const cand = mine.slice(0, 8), fits = [];
    for (let mask = 1; mask < (1 << cand.length) && fits.length < 2; mask++) {
      let s = 0; const set = [];
      for (let i = 0; i < cand.length; i++) if (mask & (1 << i)) { s += cand[i].total; set.push(cand[i].no); }
      if (set.length > 1 && Math.abs(ivRound_(s) - c.amount) < 0.005) fits.push(set);
    }
    if (fits.length === 1) { matched.push({ credit: c, nos: fits[0], how: 'agency name and total of ' + fits[0].length + ' invoices' }); take(fits[0]); return; }
    unmatched.push(Object.assign({}, c, { why: fits.length ? 'More than one set of invoices adds up to this' : mine.length ? 'Names ' + mine[0].customer + ' but no open invoice matches the amount' : 'No open invoice matches' }));
  });
  return { matched: matched, unmatched: unmatched };
}
// ---- accountant pack
const IV_SALES_HEAD = ['Invoice date', 'Invoice no', 'Customer', 'Job no', 'Service', 'Property', 'Net', 'VAT', 'Gross', 'Due date', 'Status', 'Paid date', 'Payment ref'];
const IV_XERO_HEAD = ['ContactName', 'EmailAddress', 'InvoiceNumber', 'InvoiceDate', 'DueDate', 'Description', 'Quantity', 'UnitAmount', 'AccountCode', 'TaxType'];
function ivPackRows_(invs, month, today) {
  const list = (invs || []).filter(function (x) { return x.no && x.date && x.date.slice(0, 7) === month && ['sent', 'paid', 'sending'].indexOf(x.status) !== -1; })
    .sort(function (a, b) { return ivNoNum_(a.no) - ivNoNum_(b.no); });
  const st = function (x) { const s = ivState_(x, today); return s === 'paid' ? 'Paid' : s === 'overdue' ? 'Overdue' : 'Sent'; };
  const sales = [IV_SALES_HEAD].concat(list.map(function (x) {
    return [ivUkDate_(x.date), x.no, x.customer, x.jobNo, x.service, x.property, ivRound_(x.net).toFixed(2), '0.00', ivRound_(x.total).toFixed(2), ivUkDate_(x.due), st(x), ivUkDate_(x.paidDate || ''), x.paidRef || ''];
  }));
  const xero = [IV_XERO_HEAD];
  list.forEach(function (x) {
    (x.lines || []).forEach(function (l, i) {
      xero.push([x.customer, x.email, x.no, ivUkDate_(x.date), ivUkDate_(x.due), i === 0 ? x.jobLine + ' (' + l.desc + ')' : l.desc + ' - ' + x.jobNo, String(l.qty), ivRound_(l.unit).toFixed(2), '200', 'No VAT']);
    });
  });
  return { sales: sales, xero: xero, count: list.length, total: ivRound_(list.reduce(function (s, x) { return s + x.total; }, 0)) };
}
// ---- what the 18:00 push and the red dot say
function ivNudges_(jobs, invs, today) {
  const byJob = {}; (invs || []).forEach(function (x) { if (x.status !== 'void') byJob[x.jobId] = x; });
  const out = { noInvoice: [], ready: [], needs: [], overdue: [] };
  (jobs || []).forEach(function (j) {
    if (IV.REPORT_OUT.indexOf(j.status) === -1 || j.invoice || j.invoiceNo || j.invoiceSkip) return;
    const x = byJob[j.id];
    if (x && x.status === 'ready') return;
    const sent = String(j.sentAt || '').slice(0, 10);
    if (x && x.status === 'needs') { out.needs.push(j.jobNo + ': ' + (x.problems || [])[0]); return; }
    if (sent && sent >= IV.START_SENT && ivDaysBetween_(sent, today) >= 1) out.noInvoice.push(j.jobNo);
  });
  (invs || []).forEach(function (x) {
    if (x.status === 'ready') out.ready.push(x.no);
    if (ivState_(x, today) === 'overdue') out.overdue.push(x.no + ' ' + x.customer + ' ' + ivMoney_(x.total) + ' (' + ivDaysBetween_(x.due, today) + ' days)');
  });
  const lines = [];
  if (out.ready.length) lines.push(out.ready.length + ' invoice' + (out.ready.length === 1 ? '' : 's') + ' ready, not sent: ' + out.ready.join(', '));
  if (out.needs.length) lines.push(out.needs.length + ' invoice' + (out.needs.length === 1 ? '' : 's') + ' need' + (out.needs.length === 1 ? 's' : '') + ' something from you: ' + out.needs.join('; '));
  if (out.noInvoice.length) lines.push(out.noInvoice.length + ' report' + (out.noInvoice.length === 1 ? '' : 's') + ' sent over a day ago with no invoice: ' + out.noInvoice.join(', '));
  if (out.overdue.length) lines.push(out.overdue.length + ' overdue: ' + out.overdue.join('; '));
  out.lines = lines;
  return out;
}
// ---- the PDF (HTML, converted by Drive). Navy band, coral accents, real text throughout.
// Templates: the look of the PDF is one function, picked by Script Property INV_TEMPLATE (default 'navy'). A new design is
// added as another entry here; it gets the same data object (ivPdfData_) and returns a full HTML page.
function ivPdfData_(inv, logoDataUri, companyNo) {
  return { inv: inv, logo: logoDataUri || '', co: Object.assign({}, IV.CO, { number: String(companyNo || '') }), bank: IV.BANK, footer: IV.FOOTER, dueDays: IV.DUE_DAYS,
    money: ivMoney_, longDate: ivLongDate_, esc: ivEsc_ };
}
function ivPdfHtml_(inv, logoDataUri, companyNo, template) {
  const t = IV_TEMPLATES[template || 'band'] || IV_TEMPLATES.band;
  return t(ivPdfData_(inv, logoDataUri, companyNo));
}
function ivEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function ivTplNavy_(d) {
  const inv = d.inv, logoDataUri = d.logo, CO = d.co, BANK = d.bank;
  const N = '#1F2D5A', C = '#E8735A', INK = '#1E2433', SOFT = '#5B6478', LINE = '#D9DDE7';
  const F = 'font-family:Arial,Helvetica,sans-serif;';
  const rows = (inv.lines || []).map(function (l) {
    return '<tr><td style="padding:9px 10px;border-bottom:1px solid ' + LINE + ';' + F + 'font-size:12px;color:' + INK + '">' + ivEsc_(l.desc) + '</td>'
      + '<td style="padding:9px 10px;border-bottom:1px solid ' + LINE + ';' + F + 'font-size:12px;text-align:center;color:' + INK + '">' + l.qty + '</td>'
      + '<td style="padding:9px 10px;border-bottom:1px solid ' + LINE + ';' + F + 'font-size:12px;text-align:right;color:' + INK + '">' + ivMoney_(l.unit) + '</td>'
      + '<td style="padding:9px 10px;border-bottom:1px solid ' + LINE + ';' + F + 'font-size:12px;text-align:right;color:' + INK + '">' + ivMoney_(l.amount) + '</td></tr>';
  }).join('');
  const kv = function (k, v) { return '<tr><td style="padding:2px 12px 2px 0;' + F + 'font-size:11px;color:#C3CBE3;text-transform:uppercase;letter-spacing:1px">' + ivEsc_(k) + '</td><td style="padding:2px 0;' + F + 'font-size:13px;font-weight:bold;color:#FFFFFF;text-align:right">' + ivEsc_(v) + '</td></tr>'; };
  const logo = logoDataUri ? '<img src="' + logoDataUri + '" width="190" style="width:190px;height:auto;display:block" alt="Wellington Property Services">'
    : '<div style="font-family:Georgia,serif;font-style:italic;font-size:22px;color:#FFFFFF">Wellington Property Services</div>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + ivEsc_(inv.no) + '</title></head><body style="margin:0;padding:0;background:#FFFFFF">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + N + '"><tr>'
    + '<td style="padding:26px 30px;vertical-align:middle">' + logo + '<div style="' + F + 'font-size:11px;color:#C3CBE3;margin-top:8px">' + ivEsc_(CO.aiic) + '</div></td>'
    + '<td style="padding:26px 30px;vertical-align:top;text-align:right"><div style="' + F + 'font-size:30px;font-weight:bold;letter-spacing:3px;color:' + C + '">INVOICE</div>'
    + '<table cellpadding="0" cellspacing="0" style="margin:10px 0 0 auto">' + kv('Invoice no', inv.no) + kv('Invoice date', ivLongDate_(inv.date)) + kv('Due date', ivLongDate_(inv.due)) + kv('Job no', inv.jobNo) + '</table></td>'
    + '</tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px"><tr>'
    + '<td style="padding:0 30px;vertical-align:top;width:50%"><div style="' + F + 'font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + C + ';margin-bottom:6px">Bill to</div>'
    + '<div style="' + F + 'font-size:14px;font-weight:bold;color:' + INK + '">' + ivEsc_(inv.customer) + '</div><div style="' + F + 'font-size:12px;color:' + SOFT + '">' + ivEsc_(inv.email) + '</div></td>'
    + '<td style="padding:0 30px;vertical-align:top;width:50%;text-align:right"><div style="' + F + 'font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + C + ';margin-bottom:6px">From</div>'
    + '<div style="' + F + 'font-size:14px;font-weight:bold;color:' + INK + '">' + ivEsc_(CO.name) + '</div>'
    + '<div style="' + F + 'font-size:12px;line-height:1.5;color:' + SOFT + '">' + CO.address.map(ivEsc_).join('<br>') + '<br>' + ivEsc_(CO.email) + ' &middot; ' + ivEsc_(CO.phone)
    + '<br>Company number ' + ivEsc_(CO.number) + '</div></td></tr></table>'
    + '<div style="margin:22px 30px 0;padding:10px 14px;border-left:4px solid ' + C + ';background:#F3F5FA;' + F + 'font-size:12px;color:' + INK + '"><span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:' + SOFT + '">Property</span><br><b>' + ivEsc_(inv.jobLine) + '</b></div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 0"><tr><td style="padding:0 30px">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr style="background:' + N + '">'
    + '<td style="padding:8px 10px;' + F + 'font-size:11px;font-weight:bold;color:#FFFFFF">Description</td><td style="padding:8px 10px;' + F + 'font-size:11px;font-weight:bold;color:#FFFFFF;text-align:center;width:50px">Qty</td>'
    + '<td style="padding:8px 10px;' + F + 'font-size:11px;font-weight:bold;color:#FFFFFF;text-align:right;width:90px">Price</td><td style="padding:8px 10px;' + F + 'font-size:11px;font-weight:bold;color:#FFFFFF;text-align:right;width:90px">Amount</td></tr>'
    + rows
    + '<tr><td colspan="3" style="padding:12px 10px;' + F + 'font-size:14px;font-weight:bold;text-align:right;color:' + INK + '">Total due</td><td style="padding:12px 10px;' + F + 'font-size:16px;font-weight:bold;text-align:right;color:' + C + '">' + ivMoney_(inv.total) + '</td></tr>'
    + '</table></td></tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px"><tr><td style="padding:0 30px">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + N + '"><tr><td style="padding:14px 16px">'
    + '<div style="' + F + 'font-size:10px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:' + C + ';margin-bottom:6px">How to pay</div>'
    + '<div style="' + F + 'font-size:12px;line-height:1.6;color:#FFFFFF">Bank transfer within ' + d.dueDays + ' days, by ' + ivEsc_(ivLongDate_(inv.due)) + ', to:<br>'
    + '<b>' + ivEsc_(BANK.name) + '</b> &middot; ' + ivEsc_(BANK.bank + ' ' + BANK.account) + '<br>Sort code <b>' + ivEsc_(BANK.sort) + '</b> &middot; Account <b>' + ivEsc_(BANK.number) + '</b><br>Reference <b>' + ivEsc_(inv.no) + '</b></div>'
    + '</td></tr></table></td></tr></table>'
    + '<div style="margin:26px 30px 0;padding-top:10px;border-top:1px solid ' + LINE + ';' + F + 'font-size:10.5px;line-height:1.5;color:' + SOFT + ';text-align:center">' + ivEsc_(d.footer)
    + '<br>' + ivEsc_(CO.name) + ', registered in England and Wales, company number ' + ivEsc_(CO.number) + '. Registered office: ' + ivEsc_(CO.address.join(', ')) + '.</div>'
    + '</body></html>';
}

// Design B "Navy band" (Lex picked it, 4 Nov 2026 21:53; asked for bigger type 21:54). Body 15px (about 11pt), labels 12px.
// Tables and inline styles only, so Drive's HTML-to-PDF converter keeps the layout. Georgia italic stands in for Cormorant.
// Keeps the town and postcode together on one line ("London, N1 7JY"), so a postcode never splits (Lex, 4 Nov 22:00).
function ivKeepTail_(t) {
  const parts = String(t || '').split(/,\s*/);
  if (parts.length < 3) return '<span style="white-space:nowrap">' + ivEsc_(t) + '</span>';
  const tail = parts.splice(-2).join(', ');
  return ivEsc_(parts.join(', ')) + ', <span style="white-space:nowrap">' + ivEsc_(tail) + '</span>';
}
function ivShortDate_(ds) { const p = String(ds).split('-'); return parseInt(p[2], 10) + ' ' + IV.MONTHS[parseInt(p[1], 10) - 1].slice(0, 3) + ' ' + p[0]; }
function ivTplBand_(d) {
  const inv = d.inv, CO = d.co, BANK = d.bank;
  const N = '#1F2D5A', C = '#E8735A', INK = '#1F2D5A', SOFT = '#4F5A80', LINE = '#D9DDE7', SKY = '#C3CBE3';
  const F = 'font-family:Arial,Helvetica,sans-serif;', S = "font-family:Georgia,'Times New Roman',serif;font-style:italic;";
  const lab = function (t, col) { return '<div style="' + F + 'font-size:12px;font-weight:bold;letter-spacing:1.5px;color:' + (col || SOFT) + ';margin-bottom:5px">' + ivEsc_(String(t).toUpperCase()) + '</div>'; };
  const val = function (t, col) { return '<div style="' + F + 'font-size:15px;font-weight:bold;line-height:1.4;color:' + (col || INK) + '">' + ivEsc_(t) + '</div>'; };
  const sub = function (t) { return '<div style="' + F + 'font-size:14px;line-height:1.4;color:' + SOFT + '">' + ivEsc_(t) + '</div>'; };
  const td = 'padding:14px 0;border-bottom:1px solid ' + LINE + ';' + F + 'font-size:15px;color:' + INK + ';';
  const rows = (inv.lines || []).map(function (l) {
    return '<tr><td style="' + td + 'font-weight:bold">' + ivEsc_(l.desc) + '</td><td style="' + td + 'text-align:right">' + l.qty + '</td>'
      + '<td style="' + td + 'text-align:right">' + ivMoney_(l.unit) + '</td><td style="' + td + 'text-align:right;font-weight:bold">' + ivMoney_(l.amount) + '</td></tr>';
  }).join('');
  const th = 'padding:0 0 9px;border-bottom:2px solid ' + N + ';' + F + 'font-size:12px;font-weight:bold;letter-spacing:1.5px;color:' + SOFT + ';';
  const logo = d.logo ? '<img src="' + d.logo + '" width="260" style="width:260px;height:auto;display:block" alt="Wellington Property Services">'
    : '<div style="' + S + 'font-size:30px;color:#FFFFFF">Wellington Property Services</div>';
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + ivEsc_(inv.no) + '</title></head><body style="margin:0;padding:0;background:#FFFFFF">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + N + '"><tr>'
    + '<td style="padding:34px 44px 28px;vertical-align:bottom">' + logo + '</td>'
    + '<td style="padding:34px 44px 28px;vertical-align:bottom;text-align:right"><div style="' + F + 'font-size:13px;font-weight:bold;letter-spacing:2px;color:' + SKY + '">INVOICE</div>'
    + '<div style="' + S + 'font-size:40px;font-weight:bold;line-height:1.1;color:#FFFFFF">' + ivEsc_(inv.no) + '</div></td></tr></table>'
    + '<div style="height:6px;background:' + C + ';font-size:1px;line-height:6px">&nbsp;</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr>'
    + '<td style="padding:0 0 0 44px;vertical-align:top;width:34%">' + lab('Billed to') + val(inv.customer)
    + String(inv.billAddress || '').split(/\s*,\s*|\n/).filter(Boolean).map(sub).join('') + sub(inv.email) + '</td>'
    + '<td style="vertical-align:top;width:22%">' + (inv.jobNo ? lab('Job') + val(inv.jobNo) + sub(inv.service || '') : lab('Service') + val(inv.service || 'Services')) + (inv.visitDate ? '<div style="' + F + 'font-size:14px;line-height:1.4;color:' + SOFT + ';white-space:nowrap">Inspected ' + ivEsc_(ivShortDate_(inv.visitDate)) + '</div>' : '') + '</td>'
    + '<td style="vertical-align:top;width:22%">' + lab('Issued') + val(ivLongDate_(inv.date)) + '</td>'
    + '<td style="padding:0 44px 0 0;vertical-align:top;width:22%">' + lab('Due') + val(ivLongDate_(inv.due), '#C4502F') + sub(d.dueDays + ' days') + '</td>'
    + '</tr></table>'
    + '<div style="margin:24px 44px 0;padding:16px 0 0;border-top:1px solid ' + LINE + '">' + lab(inv.jobNo ? 'Property' : 'For') + '<div style="' + F + 'font-size:17px;font-weight:bold;line-height:1.4;color:' + INK + '">' + ivKeepTail_(inv.jobLine) + '</div>'
    + (inv.note ? '<div style="' + F + 'font-size:14px;line-height:1.5;color:' + SOFT + ';margin-top:6px">' + ivEsc_(inv.note) + '</div>' : '') + '</div>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr><td style="padding:0 44px">'
    + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="' + th + '">DESCRIPTION</td><td style="' + th + 'text-align:right;width:60px">QTY</td>'
    + '<td style="' + th + 'text-align:right;width:110px">PRICE</td><td style="' + th + 'text-align:right;width:110px">AMOUNT</td></tr>' + rows + '</table></td></tr></table>'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr><td style="padding:0 44px">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:' + N + '"><tr>'
    + '<td style="padding:24px 28px;vertical-align:middle;' + F + 'font-size:14px;line-height:1.7;color:#FFFFFF">'
    + '<div style="' + F + 'font-size:12px;font-weight:bold;letter-spacing:1.5px;color:#F2937D;margin-bottom:4px">PAY BY BANK TRANSFER</div>'
    + ivEsc_(BANK.name) + '<br>Sort code <b>' + ivEsc_(BANK.sort) + '</b> &middot; Account <b>' + ivEsc_(BANK.number) + '</b><br>Reference <b>' + ivEsc_(inv.no) + '</b></td>'
    + '<td style="padding:24px 28px;vertical-align:middle;text-align:right"><div style="' + F + 'font-size:13px;font-weight:bold;letter-spacing:2px;color:' + SKY + '">AMOUNT DUE</div>'
    + '<div style="' + S + 'font-size:48px;font-weight:bold;line-height:1.1;color:#FFFFFF">' + ivMoney_(inv.total) + '</div></td></tr></table></td></tr></table>'
    + '<div style="margin:28px 44px 0;' + S + 'font-size:21px;color:' + INK + '">Thank you for your business, it is always appreciated.</div>'
    + '<div style="margin:36px 44px 0;padding-top:14px;border-top:1px solid ' + LINE + ';' + F + 'font-size:12px;line-height:1.6;color:' + SOFT + '">'
    + 'Questions about this invoice: ' + ivEsc_(CO.email) + ' or ' + ivEsc_(CO.phone) + '. ' + ivEsc_(CO.aiic) + '.<br>'
    + ivEsc_(CO.name) + ', registered in England and Wales, company number ' + ivEsc_(CO.number) + '.<br>Registered office: <span style="white-space:nowrap">' + ivEsc_(CO.address.join(', ')) + '</span>.</div>'
    + '</body></html>';
}

const IV_TEMPLATES = { band: ivTplBand_, navy: ivTplNavy_ };

// ================================================================
// 2. GOOGLE PARTS
// ================================================================
function ivProps_() { return PropertiesService.getScriptProperties(); }
function ivJson_(k, d) { try { const v = ivProps_().getProperty(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
function ivSetJson_(k, v) { ivProps_().setProperty(k, JSON.stringify(v)); }
function ivToday_() { return Utilities.formatDate(new Date(), IV.TZ, 'yyyy-MM-dd'); }
function ivHourMin_() { return Utilities.formatDate(new Date(), IV.TZ, 'HH:mm'); }
function ivSettings_() { const s = ivJson_(IV.PROP_SET, {}); return { autoSend: s.autoSend === true, autoChase: s.autoChase === true, at: s.at || '', by: s.by || '' }; }
function ivLog_(job, result, detail) { try { if (typeof kpLog_ === 'function') kpLog_('Invoices', job || '', result, String(detail || '').slice(0, 400)); } catch (e) {} }
function ivTab_(ss, create) {
  let sh = ss.getSheetByName(IV.TAB);
  if (!sh && create) { sh = ss.insertSheet(IV.TAB); sh.getRange(1, 1, 1, IV.HEAD.length).setValues([IV.HEAD]); sh.setFrozenRows(1); }
  return sh;
}
function ivReadInvs_(ss) {
  const sh = ivTab_(ss, false);
  if (!sh || sh.getLastRow() < 2) return [];
  const v = sh.getRange(2, 1, sh.getLastRow() - 1, IV.HEAD.length).getDisplayValues(), di = IV.HEAD.length - 1, out = [];
  v.forEach(function (r, i) { try { if (r[di]) { const x = JSON.parse(r[di]); x.__row = i + 2; out.push(x); } } catch (e) {} });
  return out;
}
function ivRowOf_(x) {
  return [x.no || '', x.status, x.jobNo, x.customer, x.email, x.service, x.property, x.date || '', x.due || '', x.net != null ? ivRound_(x.net).toFixed(2) : '', '0.00',
    x.total != null ? ivRound_(x.total).toFixed(2) : '', x.sentAt || '', x.paidDate || '', x.paidRef || '', x.pdfId ? 'https://drive.google.com/file/d/' + x.pdfId + '/view' : '', x.key,
    JSON.stringify(Object.assign({}, x, { __row: undefined }))];
}
function ivSaveInv_(ss, x) {
  const sh = ivTab_(ss, true);
  if (!x.__row) x.__row = Math.max(2, sh.getLastRow() + 1);
  sh.getRange(x.__row, 1, 1, IV.HEAD.length).setValues([ivRowOf_(x)]);
  ivTouch_(ss);
}
function ivTouch_(ss) { if (typeof jeMetaSet_ === 'function') { jeMetaSet_(ss, 'savedAt', new Date().toISOString()); jeMetaSet_(ss, 'device', 'WPS script (Invoices)'); } }
function ivClients_(ss) {
  const sh = ss.getSheetByName('Clients'); const out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  const v = sh.getDataRange().getDisplayValues(), di = v[0].indexOf('Data (do not edit)');
  v.slice(1).forEach(function (r) { let c = { name: r[0] }; if (di >= 0 && r[di]) { try { c = JSON.parse(r[di]); } catch (e) {} } if (r[0]) out[r[0]] = c; });
  return out;
}
// Beds / extra areas from the report cover (Archive file's Reports sheet), only for a WPS job of the same type.
function ivFronts_() {
  const out = {};
  try {
    if (typeof arValues_ !== 'function' || typeof AR_COL === 'undefined') return out;
    arValues_().values.forEach(function (r) {
      if (r[AR_COL.Source] !== 'WPS') return;
      const k = kpNorm_(r[AR_COL['Job no']]) + '|' + String(r[AR_COL.Type] || '');
      out[k] = { beds: String(r[AR_COL.Beds] || ''), extra: String(r[AR_COL.Extra] || '') };
    });
  } catch (e) { console.log('ivFronts_: ' + e); }
  return out;
}
// A Tide email naming this job means Lex invoiced it in Tide himself: hold, never invoice again.
function ivTideFor_(jobNo) {
  const c = CacheService.getScriptCache(), k = 'iv_tide_' + jobNo, hit = c.get(k);
  if (hit != null) return hit;
  let no = '';
  try {
    GmailApp.search(IV.TIDE_QUERY + ' "' + jobNo + '"', 0, 5).forEach(function (th) {
      th.getMessages().forEach(function (m) { const x = /\bINV-\d{3,6}\b/.exec(m.getSubject() + ' ' + m.getPlainBody()); if (x && !no) no = x[0]; });
    });
  } catch (e) { return ''; }
  c.put(k, no, 6 * 3600);
  return no;
}
function ivMonthFolder_(month, create) {
  const it = DriveApp.getFoldersByName(IV.FOLDER);
  let root = it.hasNext() ? it.next() : null;
  if (!root) { if (!create) return null; root = DriveApp.createFolder(IV.FOLDER); }
  const m = root.getFoldersByName(month);
  return m.hasNext() ? m.next() : (create ? root.createFolder(month) : null);
}
function ivLogo_() {
  const c = CacheService.getScriptCache(), hit = c.get('iv_logo');
  if (hit) return hit;
  try {
    const r = UrlFetchApp.fetch(IV.LOGO, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return '';
    const uri = 'data:image/png;base64,' + Utilities.base64Encode(r.getContent());
    if (uri.length < 95000) c.put('iv_logo', uri, 6 * 3600);
    return uri;
  } catch (e) { return ''; }
}
function ivCompanyNo_() { const v = String(ivProps_().getProperty('INV_COMPANY_NO') || '').replace(/\s/g, ''); return /^(\d{8}|[A-Z]{2}\d{6})$/i.test(v) ? v.toUpperCase() : ''; }
function ivTemplate_() { return ivProps_().getProperty('INV_TEMPLATE') || 'band'; }
function ivPdfBlob_(x) {
  const no = ivCompanyNo_();
  if (!no) throw new Error('Company number not set (Script Property INV_COMPANY_NO). Set it before the first invoice.');
  return Utilities.newBlob(ivPdfHtml_(x, ivLogo_(), no, ivTemplate_()), 'text/html', x.no + '.html').getAs('application/pdf').setName(x.no + ' ' + x.jobNo + '.pdf'); }
// Make (or remake) the PDF in WPS Invoices/<YYYY-MM>; the old one goes to the Bin.
function ivFilePdf_(x) {
  const f = ivMonthFolder_(x.date.slice(0, 7), true).createFile(ivPdfBlob_(x));
  if (x.pdfId && x.pdfId !== f.getId()) { try { DriveApp.getFileById(x.pdfId).setTrashed(true); } catch (e) {} }
  x.pdfId = f.getId();
  return f;
}
function ivAliasOk_() { try { return GmailApp.getAliases().map(function (a) { return a.toLowerCase(); }).indexOf(IV.FROM) !== -1; } catch (e) { return false; } }
// Email HTML: WpsMail's navy look, signed as the company, finance@ in the footer.
function ivMailHtml_(mail, title, preheader) {
  const body = mail.lines.slice(0, -1).map(function (t, i) { return i === 2 ? { rows: [['Job', t]] } : { p: t }; });
  let h = wmHtml_({ title: title, preheader: preheader, blocks: body });
  h = h.replace('Kind regards,<br><span style="color:#FFFFFF;font-weight:bold">Wellington Property Services</span>', '<span style="color:#FFFFFF;font-weight:bold">Wellington Property Services Limited</span>');
  return h.split(WM.EMAIL).join(IV.FROM);
}
function ivNudgeState_(jobs, invs) { return ivNudges_(jobs, invs, ivToday_()); }

// ---------- drafting
function ivDraftFor_(job, clients, fronts, saved, edits) {
  const front = fronts[kpNorm_(job.jobNo) + '|' + job.type] || null;
  const o = Object.assign({ front: front, saved: saved, addresses: ivJson_('INV_ADDRESSES', {}) }, edits || {});
  return ivBuild_(job, clients[job.client] || null, o);
}
// One timer run's drafting: new jobs get a draft; Needs-info drafts are rebuilt (the job may have been fixed). Under the lock.
function ivDraftAll_(ss, r, invs, opt) {
  opt = opt || {};
  const clients = ivClients_(ss), fronts = ivFronts_(), saved = ivJson_(IV.PROP_EMAILS, {}), today = ivToday_(), out = [];
  const byJob = {}; invs.forEach(function (x) { if (x.status !== 'void') byJob[x.jobId] = x; });
  const used = invs.map(function (x) { return x.no; }).concat(r.jobs.map(function (j) { return j.invoiceNo; }));
  r.jobs.forEach(function (j) {
    if (opt.only && j.id !== opt.only) return;
    if (IV.REPORT_OUT.indexOf(j.status) === -1 || j.invoice || j.invoiceNo || j.invoiceSkip) return;
    const cur = byJob[j.id];
    if (cur && cur.status !== 'needs') return;
    if (cur && cur.manual) return;   // fully edited on the Accounts page: lines are Lex's, not the price list's
    if (!cur && !opt.only && String(j.sentAt || '').slice(0, 10) < IV.START_SENT) return;
    const d = ivDraftFor_(j, clients, fronts, saved, cur ? cur.edits : null);
    const tide = ivTideFor_(j.jobNo);
    if (!ivCompanyNo_()) d.problems.push('Company number not set yet (Script Property INV_COMPANY_NO): set it once and this invoice is made by itself');
    if (tide) d.problems.unshift('Tide already has ' + tide + ' for this job: mark it invoiced (Already in Tide) instead');
    const x = Object.assign(cur || { key: j.id, createdAt: new Date().toISOString() }, d, { edits: cur ? cur.edits : null, tideNo: tide || '' });
    if (d.problems.length) { x.status = 'needs'; if (!cur || JSON.stringify(cur.problems) !== JSON.stringify(d.problems)) { ivSaveInv_(ss, x); out.push(j.jobNo + ' needs info: ' + d.problems[0]); } return; }
    if (opt.dry) { out.push('would draft ' + j.jobNo + ' ' + ivMoney_(d.total)); return; }
    ivNumber_(x, used, today);
    ivFilePdf_(x);
    x.status = 'ready';
    ivSaveInv_(ss, x);
    used.push(x.no);
    out.push(x.no + ' drafted for ' + j.jobNo + ' ' + ivMoney_(x.total));
    ivLog_(j.jobNo, 'Drafted', x.no + ' ' + ivMoney_(x.total) + ' to ' + x.email);
  });
  return out;
}
function ivNumber_(x, used, today) {
  if (x.no) return;
  const p = ivProps_(), n = ivNextNo_(p.getProperty(IV.PROP_NEXT), used);
  x.no = ivNoStr_(n); p.setProperty(IV.PROP_NEXT, String(n + 1));
  x.date = today; x.due = ivAddDays_(today, IV.DUE_DAYS); x.autoDate = ivNextWorkingDay_(today);
}
function ivLock_() { const l = LockService.getScriptLock(); if (!l.tryLock(25000)) throw new Error('Busy, try again in a moment.'); return l; }
function ivFind_(invs, b) { const no = ivNormNo_(b.no); return invs.filter(function (x) { return (no && x.no === no) || (b.key && x.key === b.key && !no) || (b.jobId && x.jobId === b.jobId && x.status !== 'void' && !no && !b.key); })[0] || null; }
// Job fields after send / paid (same rules as the dashboard's pickInvoice), history line, one write.
function ivMarkJob_(ss, jobId, fn, what) {
  const r = kpReadJobs_(ss), j = r.jobs.filter(function (x) { return x.id === jobId; })[0];
  if (!j) return false;
  fn(j);
  const now = new Date();
  j.history = Array.isArray(j.history) ? j.history : [];
  j.history.unshift({ at: now.toISOString(), dev: 'WPS script (Invoices)', what: String(what).slice(0, 300) });
  if (j.history.length > 40) j.history.length = 40;
  j.updatedAt = now.toISOString();
  const ch = {}; ch[j.id] = true; kpWriteJobs_(ss, r.head, r.jobs, ch, null);
  return true;
}
// ---------- sending (idempotent: ready -> sending -> sent; a "sending" invoice is never retried by itself)
function ivSendOne_(ss, x, dev) {
  if (x.status === 'sent' || x.status === 'paid') return { ok: true, same: true, no: x.no, text: x.no + ' was already sent' };
  if (x.status !== 'ready') return { ok: false, no: x.no || x.jobNo, error: x.status === 'sending' ? x.no + ' may already have gone (a send didn\'t finish): check Sent mail, then Mark sent or Send again' : (x.no || x.jobNo) + ' is not ready: ' + ((x.problems || [])[0] || x.status) };
  if (!x.email) return { ok: false, no: x.no, error: x.no + ' has no invoice email' };
  if (!ivCompanyNo_()) return { ok: false, no: x.no, error: 'Company number not set (Script Property INV_COMPANY_NO). Nothing sent.' };
  if (!ivAliasOk_()) return { ok: false, no: x.no, error: 'Gmail can\'t send as ' + IV.FROM + ' yet (Gmail settings > Accounts > Send mail as). Nothing sent.' };
  if (x.jobId) {
    const r = kpReadJobs_(ss), j = r.jobs.filter(function (k) { return k.id === x.jobId; })[0];
    if (!j) return { ok: false, no: x.no, error: x.jobNo + ' is no longer in the Job Log' };
    if (j.invoiceNo && ivNormNo_(j.invoiceNo) !== x.no) return { ok: false, no: x.no, error: x.jobNo + ' already has ' + j.invoiceNo + ': not sent' };
  }
  x.status = 'sending'; x.sendingAt = new Date().toISOString(); x.sendingBy = dev; ivSaveInv_(ss, x); SpreadsheetApp.flush();
  const pdf = DriveApp.getFileById(x.pdfId).getBlob().setName(x.no + '.pdf');
  const m = ivEmail_(x);
  GmailApp.sendEmail(x.email, m.subject, m.text, { htmlBody: ivMailHtml_(m, 'Invoice ' + x.no, m.lines[1]), name: IV.NAME, from: IV.FROM, replyTo: IV.FROM, bcc: IV.BCC, attachments: [pdf] });
  x.status = 'sent'; x.sentAt = new Date().toISOString(); x.sentBy = dev; delete x.sendingAt; ivSaveInv_(ss, x);
  if (x.jobId) ivMarkJob_(ss, x.jobId, function (k) { k.invoice = 'invoiced'; k.invoiceNo = x.no; k.invoiceAmount = ivMoney_(x.total); k.invoicedAt = x.sentAt; k.invoiceDue = x.due; k.invoicePdfId = x.pdfId; delete k.paidAt; delete k.invoiceSkip; },
    'Invoice ' + x.no + ' ' + ivMoney_(x.total) + ' sent to ' + x.email + ' (' + dev + ')');
  ivLog_(x.jobNo, 'Sent', x.no + ' ' + ivMoney_(x.total) + ' to ' + x.email + ' by ' + dev);
  return { ok: true, no: x.no, text: x.no + ' sent to ' + x.email };
}
// Corrected copy of an invoice already sent (Accounts page: Lex chose "Send the corrected copy"). Same number, new PDF.
function ivResendOne_(ss, x, dev) {
  if (x.status === 'paid') return { ok: false, no: x.no, error: x.no + ' is already paid: nothing sent' };
  if (x.status !== 'sent') return { ok: false, no: x.no, error: x.no + ' hasn\'t been sent yet: use Send' };
  if (!x.email) return { ok: false, no: x.no, error: x.no + ' has no invoice email' };
  if (!ivCompanyNo_()) return { ok: false, no: x.no, error: 'Company number not set (Script Property INV_COMPANY_NO). Nothing sent.' };
  if (!ivAliasOk_()) return { ok: false, no: x.no, error: 'Gmail can\'t send as ' + IV.FROM + ' yet. Nothing sent.' };
  if (!x.pdfId) return { ok: false, no: x.no, error: x.no + ' has no PDF' };
  const pdf = DriveApp.getFileById(x.pdfId).getBlob().setName(x.no + '.pdf');
  const m = ivCorrectedEmail_(x);
  GmailApp.sendEmail(x.email, m.subject, m.text, { htmlBody: ivMailHtml_(m, 'Corrected invoice ' + x.no, m.lines[1]), name: IV.NAME, from: IV.FROM, replyTo: IV.FROM, bcc: IV.BCC, attachments: [pdf] });
  x.resent = (Array.isArray(x.resent) ? x.resent : []).concat([{ at: new Date().toISOString(), by: dev, rev: x.rev || 1 }]).slice(-10);
  x.pendingChoice = false; ivSaveInv_(ss, x);
  if (x.jobId) ivMarkJob_(ss, x.jobId, function () {}, 'Corrected invoice ' + x.no + ' ' + ivMoney_(x.total) + ' sent to ' + x.email + ' (' + dev + ')');
  ivLog_(x.jobNo, 'Resent', x.no + ' corrected copy to ' + x.email + ' by ' + dev);
  return { ok: true, no: x.no, text: 'Corrected ' + x.no + ' sent to ' + x.email };
}
function ivPaidOne_(ss, x, date, ref, how) {
  x.status = 'paid'; x.paidDate = date; x.paidRef = ref || ''; x.paidHow = how; ivSaveInv_(ss, x);
  ivMarkJob_(ss, x.jobId, function (k) { k.invoice = 'paid'; if (!k.invoicedAt) k.invoicedAt = x.sentAt || new Date().toISOString(); k.paidAt = date + 'T12:00:00.000Z'; },
    'Invoice ' + x.no + ' paid ' + date + ' (' + how + (ref ? ', ' + ref : '') + ')');
}
// Open invoices for matching: dashboard ones that are sent, plus Tide-era jobs marked Invoiced with a number and an amount.
function ivOpen_(r, invs) {
  const out = invs.filter(function (x) { return x.status === 'sent'; }).map(function (x) { return { no: x.no, customer: x.customer, total: x.total, inv: x }; });
  const have = {}; invs.forEach(function (x) { if (x.no) have[x.no] = true; });
  r.jobs.forEach(function (j) {
    const no = ivNormNo_(j.invoiceNo), a = ivAmount_(j.invoiceAmount);
    if (j.invoice === 'invoiced' && no && !have[no] && a != null) out.push({ no: no, customer: ivCustomer_(j.client), total: a, job: j });
  });
  return out;
}
function ivMarkOpenPaid_(ss, o, date, ref, how) {
  if (o.inv) return ivPaidOne_(ss, o.inv, date, ref, how);
  ivMarkJob_(ss, o.job.id, function (k) { k.invoice = 'paid'; if (!k.invoicedAt) k.invoicedAt = new Date().toISOString(); k.paidAt = date + 'T12:00:00.000Z'; },
    'Invoice ' + o.no + ' paid ' + date + ' (' + how + (ref ? ', ' + ref : '') + ')');
}
// ---------- remittances (PDF text through Drive's converter; the temporary Doc goes straight to the Bin)
function ivPdfText_(blob) {
  const f = Drive.Files.create({ name: 'WPS remittance (temporary)', mimeType: 'application/vnd.google-apps.document' }, blob);
  try { return DocumentApp.openById(f.id).getBody().getText(); }
  finally { try { DriveApp.getFileById(f.id).setTrashed(true); } catch (e) {} }
}
function ivRemits_(ss) {
  const seen = ivJson_(IV.PROP_REMIT, []), out = [];
  GmailApp.search(IV.REMIT_QUERY, 0, 20).forEach(function (th) {
    th.getMessages().forEach(function (m) {
      const id = m.getId();
      if (seen.indexOf(id) !== -1) return;
      const pdfs = m.getAttachments().filter(function (a) { return /pdf/i.test(a.getContentType()) || /\.pdf$/i.test(a.getName()); });
      let text = '';
      pdfs.forEach(function (a) { text += '\n' + ivPdfText_(a.copyBlob()); });
      const rm = ivParseRemit_(text);
      const r = kpReadJobs_(ss), invs = ivReadInvs_(ss), open = ivOpen_(r, invs);
      rm.items.forEach(function (it) {
        const o = open.filter(function (x) { return x.no === it.no; })[0];
        if (!o) { out.push(it.no + ' on remittance ' + rm.ref + ': not an open invoice here (already paid, or an old Wellington Parker / QuickBooks number)'); return; }
        if (Math.abs(o.total - it.amount) > 0.005) { ivUnmatched_([{ date: it.date, amount: it.amount, text: 'Winkworth remittance ' + rm.ref + ' ' + it.no, key: 'remit|' + id + '|' + it.no, why: it.no + ' is ' + ivMoney_(o.total) + ', remittance says ' + ivMoney_(it.amount) }]); out.push(it.no + ' amount differs'); return; }
        ivMarkOpenPaid_(ss, o, it.date, 'Remittance ' + rm.ref, 'Winkworth remittance');
        out.push(it.no + ' paid ' + it.date);
      });
      if (!rm.items.length) ivUnmatched_([{ date: Utilities.formatDate(m.getDate(), IV.TZ, 'yyyy-MM-dd'), amount: rm.total || 0, text: 'Remittance email with no invoice lines read: ' + m.getSubject(), key: 'remit|' + id, why: text.trim() ? 'No invoice numbers found in the remittance PDF' : 'Couldn\'t read the remittance PDF' }]);
      if (rm.account && rm.account !== IV.BANK.number) out.push('Remittance ' + rm.ref + ' says paid to account ' + rm.account + (rm.bank ? ' at ' + rm.bank : '') + ', not the Tide account');
      seen.push(id);
    });
  });
  ivSetJson_(IV.PROP_REMIT, seen.slice(-200));
  if (out.length) ivLog_('', 'Remittance', out.join('; '));
  return out;
}
function ivUnmatched_(list) {
  const cur = ivJson_(IV.PROP_UNMATCHED, []), keys = cur.map(function (x) { return x.key; });
  list.forEach(function (c) { if (keys.indexOf(c.key) === -1) cur.push({ key: c.key, date: c.date, amount: c.amount, text: String(c.text || '').slice(0, 200), why: c.why || '', at: new Date().toISOString() }); });
  ivSetJson_(IV.PROP_UNMATCHED, cur.slice(-60));
}
// ---------- statement CSVs in Drive > WPS Bank statements (each file read once; a changed file is read again, credits seen once)
function ivBank_(ss) {
  const it = DriveApp.getFoldersByName(IV.BANK_FOLDER);
  if (!it.hasNext()) return ['No "' + IV.BANK_FOLDER + '" folder yet'];
  const done = ivJson_(IV.PROP_BANK, {}), seen = ivJson_(IV.PROP_CREDITS, []), out = [];
  const files = it.next().getFiles();
  while (files.hasNext()) {
    const f = files.next(), stamp = f.getLastUpdated().toISOString();
    if (!/\.csv$/i.test(f.getName()) && !/csv/i.test(f.getMimeType())) continue;
    if (done[f.getId()] === stamp) continue;
    const res = ivCredits_(ivCsvParse_(f.getBlob().getDataAsString()));
    if (res.error) { out.push(f.getName() + ': ' + res.error); done[f.getId()] = stamp; continue; }
    const fresh = res.credits.filter(function (c) { return seen.indexOf(c.key) === -1; });
    const r = kpReadJobs_(ss), invs = ivReadInvs_(ss), open = ivOpen_(r, invs), mt = ivMatch_(fresh, open);
    mt.matched.forEach(function (m) {
      m.nos.forEach(function (no) { const o = open.filter(function (x) { return x.no === no; })[0]; if (o) ivMarkOpenPaid_(ss, o, m.credit.date, m.credit.text.slice(0, 60), 'bank statement, ' + m.how); });
      out.push(m.nos.join(' + ') + ' paid ' + m.credit.date + ' (' + m.how + ')');
    });
    ivUnmatched_(mt.unmatched);
    fresh.forEach(function (c) { seen.push(c.key); });
    done[f.getId()] = stamp;
    out.push(f.getName() + ': ' + fresh.length + ' new credit(s), ' + mt.matched.length + ' matched, ' + mt.unmatched.length + ' to look at');
  }
  ivSetJson_(IV.PROP_BANK, done); ivSetJson_(IV.PROP_CREDITS, seen.slice(-1500));
  if (out.length) ivLog_('', 'Bank CSV', out.join('; '));
  return out;
}
// ---------- chasers
function ivChaseOne_(ss, x, kind, dev, manual) {
  if (!manual && ivChaseDue_(x, ivToday_()) !== kind) return { ok: false, error: x.no + ': no ' + kind + ' due' };
  if (x.status !== 'sent') return { ok: false, error: x.no + ' is ' + x.status };
  if ((kind === 'reminder' && x.reminderAt) || (kind === 'chaser' && x.chaserAt)) return { ok: true, same: true, text: x.no + ' ' + kind + ' already sent' };
  if (!ivAliasOk_()) return { ok: false, error: 'Gmail can\'t send as ' + IV.FROM + ' yet. Nothing sent.' };
  const key = kind === 'reminder' ? 'reminderAt' : 'chaserAt';
  x[key] = 'sending ' + new Date().toISOString(); ivSaveInv_(ss, x); SpreadsheetApp.flush();
  const m = ivChaseEmail_(x, kind), pdf = DriveApp.getFileById(x.pdfId).getBlob().setName(x.no + '.pdf');
  GmailApp.sendEmail(x.email, m.subject, m.text, { htmlBody: ivMailHtml_(m, kind === 'reminder' ? 'Invoice reminder' : 'Invoice now due', m.lines[1]), name: IV.NAME, from: IV.FROM, replyTo: IV.FROM, bcc: IV.BCC, attachments: [pdf] });
  x[key] = new Date().toISOString(); ivSaveInv_(ss, x);
  ivMarkJob_(ss, x.jobId, function () {}, 'Invoice ' + x.no + ' ' + kind + ' sent to ' + x.email + ' (' + dev + ')');
  ivLog_(x.jobNo, kind, x.no + ' to ' + x.email + ' by ' + dev);
  return { ok: true, text: x.no + ' ' + kind + ' sent to ' + x.email };
}
// ---------- accountant pack
function ivPack_(ss, month) {
  const invs = ivReadInvs_(ss), p = ivPackRows_(invs, month, ivToday_());
  const folder = ivMonthFolder_(month, true);
  const put = function (name, rows) {
    const old = folder.getFilesByName(name); while (old.hasNext()) old.next().setTrashed(true);
    return folder.createFile(Utilities.newBlob(ivCsv_(rows), 'text/csv', name));
  };
  const a = put('WPS sales ' + month + '.csv', p.sales), b = put('WPS Xero import ' + month + '.csv', p.xero);
  const packs = ivJson_('iv_packs', {}); packs[month] = { folder: folder.getUrl(), sales: a.getUrl(), xero: b.getUrl(), at: new Date().toISOString(), count: p.count, total: p.total };
  ivSetJson_('iv_packs', packs);
  ivLog_('', 'Pack', month + ': ' + p.count + ' invoices, ' + ivMoney_(p.total));
  return { ok: true, month: month, count: p.count, total: p.total, folder: folder.getUrl(), sales: a.getUrl(), xero: b.getUrl() };
}
// ---------- phone pushes (not a problem push: default priority, receipt tag)
function ivPush_(title, message) {
  try {
    const topic = typeof alTopic_ === 'function' ? alTopic_() : '';
    if (!topic) return false;
    const r = UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', muteHttpExceptions: true, contentType: 'text/plain; charset=utf-8',
      payload: String(message).slice(0, 900), headers: { Title: String(title).replace(/[^\x20-\x7E]/g, '-'), Priority: 'default', Tags: 'receipt' } });
    return r.getResponseCode() < 300;
  } catch (e) { return false; }
}
function ivDayMark_(k) { const d = ivJson_(IV.PROP_DAY, {}), t = ivToday_(); if (d[k] === t) return false; d[k] = t; ivSetJson_(IV.PROP_DAY, d); return true; }

// ================================================================
// 3. TIMER (every 15 minutes: ivStart)
// ================================================================
function ivStart() {
  wpsEditorOnly_();
  ivStop_();
  ScriptApp.newTrigger('ivTimer').timeBased().everyMinutes(15).create();
  Logger.log('Invoices timer on (every 15 minutes). Auto-send ' + (ivSettings_().autoSend ? 'ON' : 'OFF') + ', auto-chase ' + (ivSettings_().autoChase ? 'ON' : 'OFF') + '. Next number ' + ivNoStr_(ivNextNo_(ivProps_().getProperty(IV.PROP_NEXT), [])) + '.');
}
function ivStop() { wpsEditorOnly_(); ivStop_(); Logger.log('Invoices timer off. Nothing drafts or sends by itself.'); }
function ivStop_() { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'ivTimer') ScriptApp.deleteTrigger(t); }); }
function ivTimer(e) {
  if (typeof wpsTriggerOrEditor_ === 'function' && !wpsTriggerOrEditor_(e)) return;
  if (typeof kpWrap_ === 'function') return kpWrap_('ivTimer', e, function () { return ivRun_(); });
  return ivRun_();
}
function ivRun_(opt) {
  opt = opt || {};
  const res = {}, step = function (name, fn) { try { res[name] = fn(); } catch (err) { res[name] = 'ERROR ' + String(err && err.message || err).slice(0, 200); ivLog_('', 'Failed', name + ': ' + res[name]); } };
  const ss = kpJobLogSs_(), today = ivToday_(), hm = ivHourMin_(), set = ivSettings_(), work = ivWorkingDay_(today);
  step('draft', function () { const l = ivLock_(); try { return ivDraftAll_(ss, kpReadJobs_(ss), ivReadInvs_(ss), { dry: opt.dry }); } finally { l.releaseLock(); } });
  if (opt.dry) return res;
  step('remittances', function () { const l = ivLock_(); try { return ivRemits_(ss); } finally { l.releaseLock(); } });
  step('bank', function () { const l = ivLock_(); try { return ivBank_(ss); } finally { l.releaseLock(); } });
  const invs = function () { return ivReadInvs_(ss); };
  // 08:30 push: what auto-send will send at 9:00
  if (set.autoSend && work && hm >= '08:30' && hm < '09:00') step('amPush', function () {
    const due = invs().filter(function (x) { return x.status === 'ready' && !x.hold && !x.coverOnly && x.autoDate <= today; });
    if (!due.length || !ivDayMark_('amPush')) return 'nothing';
    ivPush_(due.length + ' invoice' + (due.length === 1 ? '' : 's') + ' go at 9:00', due.map(function (x) { return x.no + ' ' + x.customer + ' ' + ivMoney_(x.total) + ' (' + x.jobNo + ')'; }).join('\n') + '\n\nTap Hold on the dashboard to stop one.');
    return due.length + ' listed';
  });
  if (set.autoSend && work && hm >= '09:00' && parseInt(hm, 10) < IV.AUTO_TO_H) step('autoSend', function () {
    const l = ivLock_(); const out = [];
    try { invs().filter(function (x) { return x.status === 'ready' && !x.hold && !x.coverOnly && x.autoDate <= today; }).forEach(function (x) { const r = ivSendOne_(ss, x, 'Auto-send'); out.push(r.ok ? r.text : r.error); }); }
    finally { l.releaseLock(); }
    return out;
  });
  if (set.autoChase && work && hm >= '09:00' && parseInt(hm, 10) < IV.AUTO_TO_H) step('autoChase', function () {
    const l = ivLock_(); const out = [];
    try { invs().forEach(function (x) { const k = ivChaseDue_(x, today); if (k && !x.hold) { const r = ivChaseOne_(ss, x, k, 'Auto-chase', false); out.push(r.ok ? r.text : r.error); } }); }
    finally { l.releaseLock(); }
    return out;
  });
  if (hm >= '18:00' && hm < '18:30') step('pmPush', function () {
    const n = ivNudges_(kpReadJobs_(ss).jobs, invs(), today);
    if (!n.lines.length || !ivDayMark_('pmPush')) return 'nothing';
    ivPush_('Invoices: ' + n.lines.length + ' thing' + (n.lines.length === 1 ? '' : 's') + ' to do', n.lines.join('\n') + '\n\nOpen the dashboard, Invoices.');
    return n.lines;
  });
  if (today.slice(8) === '01' && hm >= '07:00') step('pack', function () {
    const last = ivAddDays_(today, -1).slice(0, 7), packs = ivJson_('iv_packs', {});
    if (packs[last]) return 'already made';
    return ivPack_(ss, last);
  });
  return res;
}

// ================================================================
// 4. DASHBOARD OPS (from Dash dkDo_)
// ================================================================
function ivPublic_(x, today) {
  return { no: x.no || '', key: x.key || '', status: x.status, state: ivState_(x, today), jobId: x.jobId, jobNo: x.jobNo, type: x.type, customer: x.customer, email: x.email, emailFrom: x.emailFrom,
    service: x.service, property: x.property, jobLine: x.jobLine, beds: x.beds, bedsFrom: x.bedsFrom, extras: x.extras, extrasFrom: x.extrasFrom, extraNames: x.extraNames || [],
    extraUnit: x.extraUnit, base: x.base, priceFrom: x.priceFrom, parking: x.parking, congestion: x.congestion, override: x.override, lines: x.lines || [], total: x.total,
    problems: x.problems || [], notes: x.notes || [], date: x.date || '', due: x.due || '', autoDate: x.autoDate || '', hold: !!x.hold, coverOnly: !!x.coverOnly,
    pdfUrl: x.pdfId ? 'https://drive.google.com/file/d/' + x.pdfId + '/view' : '', sentAt: x.sentAt || '', sentBy: x.sentBy || '', paidDate: x.paidDate || '', paidRef: x.paidRef || '',
    reminderAt: x.reminderAt || '', chaserAt: x.chaserAt || '', chase: ivChaseDue_(x, today), tideNo: x.tideNo || '', edits: x.edits || null,
    client: x.client || '', billAddress: x.billAddress || '', visitDate: x.visitDate || '', note: x.note || '', manual: !!x.manual, kind: x.kind || (x.jobId ? 'job' : 'oneoff'),
    rev: x.rev || 1, correctedAt: x.correctedAt || '', resent: x.resent || [], pendingChoice: !!x.pendingChoice, imported: !!x.imported, createdAt: x.createdAt || '',
    voidAt: x.voidAt || '', voidWhy: x.voidWhy || '', voidWasSent: !!x.voidWasSent };
}
function ivRead_(b) {
  b = b || {};
  const ss = kpJobLogSs_(), today = ivToday_(), invs = ivReadInvs_(ss), r = kpReadJobs_(ss);
  const n = ivNudges_(r.jobs, invs, today), packs = ivJson_('iv_packs', {});
  return { ok: true, today: today, settings: ivSettings_(), aliasOk: ivAliasOk_(), from: IV.FROM, companyNoSet: !!ivCompanyNo_(), template: ivTemplate_(),
    nextNo: ivNoStr_(ivNextNo_(ivProps_().getProperty(IV.PROP_NEXT), invs.map(function (x) { return x.no; }).concat(r.jobs.map(function (j) { return j.invoiceNo; })))),
    invoices: invs.filter(function (x) { return b.all === true || (x.status !== 'void' && !(x.status === 'paid' && x.paidDate && ivDaysBetween_(x.paidDate, today) > 60)); }).map(function (x) { return ivPublic_(x, today); }),
    edit: b.all === true ? ivEditInfo_(ss) : undefined,
    unmatched: ivJson_(IV.PROP_UNMATCHED, []), nudges: n.lines, noInvoice: n.noInvoice,
    packs: Object.keys(packs).sort().reverse().slice(0, 6).map(function (k) { return Object.assign({ month: k }, packs[k]); }),
    timerOn: ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'ivTimer'; }) };
}
// What the Accounts page's edit screen offers: price lists per client (else the Winkworth list), billing addresses, saved emails.
function ivEditInfo_(ss) {
  const clients = ivClients_(ss), out = { base: IV.BASE, extra: IV.EXTRA, labels: IV.LABEL, dueDays: IV.DUE_DAYS, winkEmail: IV.WINK_EMAIL, clients: {} };
  const adr = ivJson_('INV_ADDRESSES', {}), saved = ivJson_(IV.PROP_EMAILS, {});
  Object.keys(clients).forEach(function (n) {
    const c = clients[n] || {};
    out.clients[n] = { prices: c.prices || null, extra: ivExtraPrice_('CO', c), congestion: c.prices ? ivAmount_(c.prices.congestion) : null,
      email: ivIsWink_(n) ? IV.WINK_EMAIL : (ivFirstEmail_(c.invoiceEmail) || ivFirstEmail_(saved[String(n).toLowerCase()]) || ''),
      address: ivBillAddress_({ client: n }, c, { addresses: adr }) };
  });
  out.addresses = adr;
  return out;
}
// Email preview (the exact subject and text that will go, and the HTML for the page's preview box).
function ivPreview_(b) {
  const ss = kpJobLogSs_(), x = ivFind_(ivReadInvs_(ss), b || {});
  if (!x || !x.no) return { ok: false, error: 'Invoice not found (or not numbered yet).' };
  const kind = b.kind === 'reminder' || b.kind === 'chaser' ? b.kind : '';
  const m = kind ? ivChaseEmail_(x, kind) : b.resend === true ? ivCorrectedEmail_(x) : ivEmail_(x);
  return { ok: true, no: x.no, to: x.email, from: IV.FROM, bcc: IV.BCC, subject: m.subject, text: m.text, html: ivMailHtml_(m, kind ? (kind === 'reminder' ? 'Invoice reminder' : 'Invoice now due') : (b.resend === true ? 'Corrected invoice ' : 'Invoice ') + x.no, m.lines[1]),
    pdfUrl: x.pdfId ? 'https://drive.google.com/file/d/' + x.pdfId + '/view' : '' };
}
// Edit: beds, extras (count or names), parking, congestion, total, email; rebuilds, numbers and files the PDF when complete.
function ivEdit_(dev, b) {
  if (b && (b.full === true || b.create === true)) return ivFullEdit_(dev, b);
  const ch = (b && b.changes) || {}, allowed = ['beds', 'extras', 'extraNames', 'parking', 'congestion', 'total', 'email', 'saveEmail'];
  const bad = Object.keys(ch).filter(function (k) { return allowed.indexOf(k) === -1; });
  if (bad.length) return { ok: false, error: '"' + bad[0] + '" can\'t be changed on an invoice' };
  const l = ivLock_();
  try {
    const ss = kpJobLogSs_(), r = kpReadJobs_(ss), invs = ivReadInvs_(ss), x = ivFind_(invs, b);
    if (!x) return { ok: false, error: 'Invoice not found.' };
    if (['ready', 'needs'].indexOf(x.status) === -1) return { ok: false, error: (x.no || x.jobNo) + ' is ' + x.status + ': it can\'t be changed now' };
    const j = r.jobs.filter(function (k) { return k.id === x.jobId; })[0];
    if (!j) return { ok: false, error: 'Job not in the Job Log.' };
    const e = Object.assign({}, x.edits || {});
    ['beds', 'extras', 'parking', 'congestion', 'total', 'email'].forEach(function (k) { if (ch[k] !== undefined) { const v = String(ch[k] == null ? '' : ch[k]).trim().slice(0, 80); if (v === '') delete e[k]; else e[k] = v; } });
    if (ch.extraNames !== undefined) { const n = (Array.isArray(ch.extraNames) ? ch.extraNames : String(ch.extraNames || '').split(',')).map(function (s) { return String(s).trim().slice(0, 40); }).filter(Boolean).slice(0, 30); if (n.length) e.extraNames = n; else delete e.extraNames; }
    if (e.email && !ivFirstEmail_(e.email)) return { ok: false, error: 'That isn\'t an email address' };
    if (ch.saveEmail && e.email && !ivIsWink_(j.client)) { const s = ivJson_(IV.PROP_EMAILS, {}); s[String(j.client || '').toLowerCase()] = ivFirstEmail_(e.email); ivSetJson_(IV.PROP_EMAILS, s); }
    const d = ivDraftFor_(j, ivClients_(ss), ivFronts_(), ivJson_(IV.PROP_EMAILS, {}), e);
    if (!ivCompanyNo_()) d.problems.push('Company number not set yet (Script Property INV_COMPANY_NO)');
    if (x.tideNo) d.problems.unshift('Tide already has ' + x.tideNo + ' for this job: mark it invoiced (Already in Tide) instead');
    const keep = { no: x.no, date: x.date, due: x.due, autoDate: x.autoDate, pdfId: x.pdfId, key: x.key, createdAt: x.createdAt, __row: x.__row, hold: x.hold, tideNo: x.tideNo };
    const y = Object.assign({}, d, keep, { edits: e, editedAt: new Date().toISOString(), editedBy: dev });
    // Lex checked it: cover-only figures count as checked once he has edited the invoice
    if (Object.keys(e).length) y.coverOnly = false;
    if (b.dryRun) return { ok: true, dryRun: true, invoice: ivPublic_(y, ivToday_()) };
    if (d.problems.length) { y.status = 'needs'; ivSaveInv_(ss, y); return { ok: true, invoice: ivPublic_(y, ivToday_()), logDetail: (y.no || y.jobNo) + ' edited, still needs: ' + d.problems[0] }; }
    ivNumber_(y, invs.map(function (k) { return k.no; }).concat(r.jobs.map(function (k) { return k.invoiceNo; })), ivToday_());
    ivFilePdf_(y); y.status = 'ready'; ivSaveInv_(ss, y);
    return { ok: true, invoice: ivPublic_(y, ivToday_()), logDetail: y.no + ' edited: ' + ivMoney_(y.total) };
  } finally { l.releaseLock(); }
}
// Full edit and new invoices (Accounts page, 5 Nov 2026; Lex: "full edit of any invoice", "a New invoice button").
// b = { full:true, no | jobId, fields } edits any invoice that isn't cancelled. b = { create:true, fields, jobNo? , importNo? }
// makes a new one: a one-off (no job), one for a job that has no invoice, or (importNo) a Tide-era invoice brought in under
// its own number. Ready / needs: numbered and its PDF made when complete. Sent / paid: keeps its number and status, a
// corrected PDF is made (the old one is kept in Drive), and the page asks Lex: send the corrected copy, or just keep it.
// Nothing is emailed here. dryRun: returns what would be saved.
function ivFullEdit_(dev, b) {
  const f = b.fields || {};
  const l = ivLock_();
  try {
    const ss = kpJobLogSs_(), r = kpReadJobs_(ss), invs = ivReadInvs_(ss), today = ivToday_();
    const used = invs.map(function (k) { return k.no; }).concat(r.jobs.map(function (k) { return k.invoiceNo; }));
    let x = null;
    if (!b.create) {
      x = ivFind_(invs, b);
      if (!x) return { ok: false, error: 'Invoice not found.' };
      if (x.status === 'void') return { ok: false, error: x.no + ' is cancelled: it can\'t be changed' };
      if (x.status === 'sending') return { ok: false, error: x.no + ' may be going right now (a send didn\'t finish): check Sent mail first' };
    }
    // the job: kept as it is on a sent invoice; picked by its number otherwise (blank = one-off, no job)
    let j = null;
    const wantNo = kpNorm_(f.jobNo || '');
    const sentish = x && (x.status === 'sent' || x.status === 'paid');
    if (sentish) {
      if (wantNo && wantNo !== kpNorm_(x.jobNo || '')) return { ok: false, error: x.no + ' has been sent for ' + (x.jobNo || 'no job') + ': the job can\'t be changed now (cancel it and make a new one)' };
      j = x.jobId ? r.jobs.filter(function (k) { return k.id === x.jobId; })[0] || null : null;
    } else if (wantNo) {
      j = r.jobs.filter(function (k) { return kpNorm_(k.jobNo) === wantNo && k.status !== 'archived'; })[0] || r.jobs.filter(function (k) { return kpNorm_(k.jobNo) === wantNo; })[0] || null;
      if (!j) return { ok: false, error: f.jobNo + ' isn\'t in the Job Log' };
    }
    const importNo = b.create ? ivNormNo_(b.importNo || '') : '';
    if (b.importNo && !importNo) return { ok: false, error: 'Invoice number must look like INV-0029' };
    if (importNo) {
      if (invs.some(function (k) { return k.no === importNo; })) return { ok: false, error: importNo + ' is already on the Accounts page' };
      if (!j || ivNormNo_(j.invoiceNo) !== importNo) return { ok: false, error: importNo + ' isn\'t the invoice number on ' + (j ? j.jobNo : 'that job') };
      if (ivNoNum_(importNo) >= IV.OLD_SERIES) return { ok: false, error: importNo + ' is an old Wellington Parker / QuickBooks number: it stays in History' };
    } else if (j && (!x || x.jobId !== j.id)) {
      const other = invs.filter(function (k) { return k.jobId === j.id && k.status !== 'void' && k !== x; })[0];
      if (other) return { ok: false, error: j.jobNo + ' already has ' + (other.no || 'an invoice draft') + ' on the Accounts page: edit that one' };
      if (j.invoiceNo && ivNoNum_(j.invoiceNo) && j.invoice !== '') return { ok: false, error: j.jobNo + ' already has ' + j.invoiceNo + ' (' + (j.invoice || 'invoiced') + ')' };
    }
    const d = ivManual_(f);
    if (!ivCompanyNo_()) d.problems.push('Company number not set yet (Script Property INV_COMPANY_NO)');
    const base = x ? Object.assign({}, x) : { key: 'man:' + Date.now().toString(36) + ':' + Math.floor(Math.random() * 1e6).toString(36), createdAt: new Date().toISOString(), createdBy: dev };
    const y = Object.assign(base, d, {
      jobId: j ? j.id : '', jobNo: j ? j.jobNo : '', type: j ? j.type : (x && !x.jobId ? x.type || '' : ''), client: j ? (j.client || d.customer) : d.customer,
      service: d.service || (j && IV.LABEL[j.type]) || (x && x.service) || '', property: j ? ivAddress_(j) : d.jobLine, kind: j ? 'job' : 'oneoff',
      edits: null, coverOnly: false, editedAt: new Date().toISOString(), editedBy: dev
    });
    ['beds', 'bedsFrom', 'extras', 'extrasFrom', 'extraNames', 'extraUnit', 'base', 'priceFrom', 'parking', 'congestion', 'override'].forEach(function (k) { delete y[k]; });   // lines are the record now
    if (x && x.__row) y.__row = x.__row;
    // dates: given ones kept; otherwise the old ones (a sent invoice) or numbering day
    if (!d.date) delete y.date;
    if (!d.due) delete y.due;
    if (x) { if (!y.date && x.date) y.date = x.date; if (!y.due && x.due) y.due = x.due; }
    if (importNo) {
      y.no = importNo; y.imported = true;
      y.status = j.invoice === 'paid' ? 'paid' : 'sent';
      y.sentAt = j.invoicedAt || ''; if (j.paidAt) y.paidDate = String(j.paidAt).slice(0, 10);
      if (!y.date) y.date = String(j.invoicedAt || today).slice(0, 10);
      if (!y.due) y.due = j.invoiceDue || ivAddDays_(y.date, IV.DUE_DAYS);
    }
    if (b.dryRun) {
      const pv = Object.assign({ status: y.status || 'needs' }, y);
      if (!pv.no) pv.no = ivNoStr_(ivNextNo_(ivProps_().getProperty(IV.PROP_NEXT), used));
      if (!pv.date) pv.date = today;
      if (!pv.due) pv.due = ivAddDays_(pv.date, IV.DUE_DAYS);
      // the PDF's page as HTML for the page's Preview box (the PDF itself is only made on Save)
      const html = b.html === true ? ivPdfHtml_(pv, ivLogo_(), ivCompanyNo_() || '[company number]', ivTemplate_()) : undefined;
      return { ok: true, dryRun: true, invoice: ivPublic_(pv, today), html: html, problems: d.problems };
    }
    if (sentish || importNo) {
      if (d.problems.length) return { ok: false, error: 'Not saved: ' + d.problems.join(' · '), problems: d.problems };
      if (!y.due) y.due = ivAddDays_(y.date, IV.DUE_DAYS);
      const old = x && x.pdfId;
      const f2 = ivMonthFolder_(y.date.slice(0, 7), true).createFile(ivPdfBlob_(y));
      if (old) y.oldPdfIds = (Array.isArray(y.oldPdfIds) ? y.oldPdfIds : []).concat([old]).slice(-10);   // the copy that went stays in Drive
      y.pdfId = f2.getId();
      y.rev = (x ? (x.rev || 1) : 0) + 1; y.correctedAt = new Date().toISOString(); y.pendingChoice = y.status === 'sent';
      ivSaveInv_(ss, y);
      if (j) ivMarkJob_(ss, j.id, function (k) { if (y.status !== 'paid') k.invoice = 'invoiced'; k.invoiceNo = y.no; k.invoiceAmount = ivMoney_(y.total); k.invoiceDue = y.due; k.invoicePdfId = y.pdfId; if (!k.invoicedAt && y.sentAt) k.invoicedAt = y.sentAt; },
        (importNo ? 'Invoice ' + y.no + ' brought into the Accounts page' : 'Invoice ' + y.no + ' corrected') + ': ' + ivMoney_(y.total) + ' (' + dev + ')');
      ivLog_(y.jobNo, importNo ? 'Imported' : 'Corrected', y.no + ' ' + ivMoney_(y.total) + ' rev ' + y.rev + ' by ' + dev);
      return { ok: true, invoice: ivPublic_(y, today), choose: y.status === 'sent', logDetail: y.no + (importNo ? ' imported ' : ' corrected ') + ivMoney_(y.total) };
    }
    if (d.problems.length) {
      y.status = 'needs'; ivSaveInv_(ss, y);
      if (j && j.invoiceSkip) ivMarkJob_(ss, j.id, function (k) { delete k.invoiceSkip; }, 'Invoice draft made on the Accounts page (' + dev + ')');
      return { ok: true, invoice: ivPublic_(y, today), logDetail: (y.no || y.jobNo || y.customer) + ' saved, still needs: ' + d.problems[0] };
    }
    if (!y.no) {
      const n = ivNextNo_(ivProps_().getProperty(IV.PROP_NEXT), used);
      y.no = ivNoStr_(n); ivProps_().setProperty(IV.PROP_NEXT, String(n + 1));
      y.autoDate = ivNextWorkingDay_(today);
    }
    if (!y.date) y.date = today;
    if (!y.due) y.due = ivAddDays_(y.date, IV.DUE_DAYS);
    ivFilePdf_(y); y.status = 'ready'; ivSaveInv_(ss, y);
    if (j && j.invoiceSkip) ivMarkJob_(ss, j.id, function (k) { delete k.invoiceSkip; }, 'Invoice ' + y.no + ' made on the Accounts page (' + dev + ')');
    ivLog_(y.jobNo, b.create ? 'Made' : 'Edited', y.no + ' ' + ivMoney_(y.total) + ' to ' + y.email + ' by ' + dev);
    return { ok: true, invoice: ivPublic_(y, today), logDetail: y.no + (b.create ? ' made ' : ' edited ') + ivMoney_(y.total) };
  } finally { l.releaseLock(); }
}
function ivMakeOp_(dev, b) {
  const l = ivLock_();
  try { const ss = kpJobLogSs_(); const out = ivDraftAll_(ss, kpReadJobs_(ss), ivReadInvs_(ss), { only: String(b.jobId || '') }); return { ok: true, result: out, logDetail: out.join('; ') || 'nothing to draft' }; }
  finally { l.releaseLock(); }
}
function ivSendOp_(dev, b) {
  const nos = (Array.isArray(b.nos) ? b.nos : [b.no]).map(ivNormNo_).filter(Boolean).slice(0, 30);
  if (!nos.length) return { ok: false, error: 'No invoice numbers.' };
  if (b.confirm !== true) return { ok: false, error: 'Send needs the confirm tap.' };
  const l = ivLock_(), out = [];
  try {
    const ss = kpJobLogSs_();
    nos.forEach(function (no) {
      const x = ivReadInvs_(ss).filter(function (k) { return k.no === no; })[0];
      if (!x) { out.push({ ok: false, no: no, error: no + ' not found' }); return; }
      if (b.again === true && x.status === 'sending') x.status = 'ready';
      try { out.push(b.resend === true ? ivResendOne_(ss, x, dev) : ivSendOne_(ss, x, dev)); } catch (e) { out.push({ ok: false, no: no, error: no + ': ' + String(e && e.message || e).slice(0, 200) }); }
    });
  } finally { l.releaseLock(); }
  const good = out.filter(function (r) { return r.ok; }).length;
  return { ok: good > 0 || out.every(function (r) { return r.ok; }), results: out, logDetail: good + ' of ' + out.length + ' sent: ' + out.map(function (r) { return r.ok ? r.no : r.error; }).join('; ').slice(0, 250) };
}
function ivSimpleOp_(dev, b, fn) {
  const l = ivLock_();
  try { const ss = kpJobLogSs_(), invs = ivReadInvs_(ss), x = ivFind_(invs, b || {}); if (!x) return { ok: false, error: 'Invoice not found.' }; return fn(ss, x, invs); }
  finally { l.releaseLock(); }
}
function ivHoldOp_(dev, b) {
  return ivSimpleOp_(dev, b, function (ss, x) {
    if (b.keep === true) {   // Accounts page: corrected copy kept for the records, not sent (Lex's choice)
      x.pendingChoice = false; x.keptAt = new Date().toISOString(); x.keptBy = dev; ivSaveInv_(ss, x);
      return { ok: true, no: x.no, kept: true, logDetail: x.no + ' corrected copy kept, not sent' };
    }
    x.hold = b.hold === true; ivSaveInv_(ss, x);
    return { ok: true, no: x.no, hold: x.hold, logDetail: (x.no || x.jobNo) + (x.hold ? ' held' : ' released') };
  });
}
// Void a draft (never a sent one): the number stays used. tideNo = "already invoiced in Tide": the job gets that number.
function ivVoidOp_(dev, b) {
  return ivSimpleOp_(dev, b, function (ss, x) {
    const wasSent = x.status === 'sent' || x.status === 'sending';
    if (wasSent && b.sentToo !== true) return { ok: false, error: (x.no || x.jobNo) + ' has been sent: cancel it from the Accounts page' };
    if (['ready', 'needs'].indexOf(x.status) === -1 && !wasSent) return { ok: false, error: (x.no || x.jobNo) + ' is ' + x.status + ': it can\'t be cancelled' };
    if (wasSent) {
      x.status = 'void'; x.voidAt = new Date().toISOString(); x.voidBy = dev; x.voidWhy = String(b.why || 'Cancelled after sending').slice(0, 120); x.voidWasSent = true;
      x.key = 'void:' + (x.jobId || 'oneoff') + ':' + x.no; ivSaveInv_(ss, x);
      if (x.jobId) ivMarkJob_(ss, x.jobId, function (k) { if (ivNormNo_(k.invoiceNo) === x.no) { delete k.invoice; delete k.invoiceNo; delete k.invoiceAmount; delete k.invoicedAt; delete k.invoiceDue; delete k.invoicePdfId; delete k.paidAt; } k.invoiceSkip = true; },
        'Invoice ' + x.no + ' cancelled after sending (' + x.voidWhy + '); the number is not used again (' + dev + ')');
      ivLog_(x.jobNo, 'Void', x.no + ' cancelled after sending: ' + x.voidWhy + ' (' + dev + ')');
      return { ok: true, logDetail: x.no + ' cancelled after sending: ' + x.voidWhy };
    }
    const tide = ivNormNo_(b.tideNo || '');
    if (b.tideNo && !tide) return { ok: false, error: 'Tide number must look like INV-0029' };
    x.status = 'void'; x.voidAt = new Date().toISOString(); x.voidBy = dev; x.voidWhy = tide ? 'Already in Tide as ' + tide : String(b.why || 'Cancelled').slice(0, 120);
    x.key = 'void:' + (x.jobId || 'oneoff') + ':' + (x.no || x.createdAt); ivSaveInv_(ss, x);
    if (x.pdfId) { try { DriveApp.getFileById(x.pdfId).setTrashed(true); } catch (e) {} }
    if (x.jobId) ivMarkJob_(ss, x.jobId, function (k) { if (tide) { k.invoice = k.invoice === 'paid' ? 'paid' : 'invoiced'; k.invoiceNo = tide; if (!k.invoicedAt) k.invoicedAt = new Date().toISOString(); } else k.invoiceSkip = true; },
      (x.no ? 'Invoice draft ' + x.no + ' cancelled' : 'Invoice draft cancelled') + (tide ? ': already in Tide as ' + tide : ': no invoice for this job') + ' (' + dev + ')');
    return { ok: true, logDetail: (x.no || x.jobNo) + ' voided: ' + x.voidWhy };
  });
}
function ivRemindOp_(dev, b) {
  if (b.confirm !== true) return { ok: false, error: 'Needs the confirm tap.' };
  const kind = b.kind === 'chaser' ? 'chaser' : 'reminder';
  return ivSimpleOp_(dev, b, function (ss, x) { const r = ivChaseOne_(ss, x, kind, dev, true); r.logDetail = r.text || r.error; return r; });
}
// Paid by hand, or a listed credit accepted for given invoices: { no | nos, date, ref, creditKey }
function ivPaidOp_(dev, b) {
  const nos = (Array.isArray(b.nos) ? b.nos : [b.no]).map(ivNormNo_).filter(Boolean);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : ivToday_();
  if (!nos.length) return { ok: false, error: 'No invoice number.' };
  const l = ivLock_();
  try {
    const ss = kpJobLogSs_(), open = ivOpen_(kpReadJobs_(ss), ivReadInvs_(ss)), done = [];
    nos.forEach(function (no) { const o = open.filter(function (x) { return x.no === no; })[0]; if (o) { ivMarkOpenPaid_(ss, o, date, String(b.ref || '').slice(0, 60), 'marked by ' + dev); done.push(no); } });
    if (b.creditKey) ivSetJson_(IV.PROP_UNMATCHED, ivJson_(IV.PROP_UNMATCHED, []).filter(function (c) { return c.key !== b.creditKey; }));
    if (!done.length) return { ok: false, error: nos.join(', ') + ': not an open invoice' };
    return { ok: true, done: done, logDetail: done.join(', ') + ' paid ' + date };
  } finally { l.releaseLock(); }
}
function ivDismissOp_(dev, b) {
  const k = String(b.creditKey || ''); if (!k) return { ok: false, error: 'No credit.' };
  ivSetJson_(IV.PROP_UNMATCHED, ivJson_(IV.PROP_UNMATCHED, []).filter(function (c) { return c.key !== k; }));
  return { ok: true, logDetail: 'credit dismissed: ' + k.slice(0, 80) };
}
function ivSettingsOp_(dev, b) {
  const s = ivSettings_();
  if (typeof b.autoSend === 'boolean') s.autoSend = b.autoSend;
  if (typeof b.autoChase === 'boolean') s.autoChase = b.autoChase;
  s.at = new Date().toISOString(); s.by = dev; ivSetJson_(IV.PROP_SET, s);
  return { ok: true, settings: s, logDetail: 'auto-send ' + (s.autoSend ? 'ON' : 'OFF') + ', auto-chase ' + (s.autoChase ? 'ON' : 'OFF') };
}
function ivScanOp_(dev) {
  const ss = kpJobLogSs_(), out = {};
  let l = ivLock_(); try { out.draft = ivDraftAll_(ss, kpReadJobs_(ss), ivReadInvs_(ss), {}); } finally { l.releaseLock(); }
  l = ivLock_(); try { out.remittances = ivRemits_(ss); } finally { l.releaseLock(); }
  l = ivLock_(); try { out.bank = ivBank_(ss); } finally { l.releaseLock(); }
  return { ok: true, result: out, logDetail: JSON.stringify(out).slice(0, 250) };
}
function ivPackOp_(dev, b) {
  const month = /^\d{4}-\d{2}$/.test(b.month || '') ? b.month : ivToday_().slice(0, 7);
  return ivPack_(kpJobLogSs_(), month);
}
function ivDo_(dev, op, b) {
  b = b || {};
  switch (op) {
    case 'invRead': return ivRead_(b);
    case 'invPreview': return ivPreview_(b);
    case 'invEdit': return ivEdit_(dev, b);
    case 'invMake': return ivMakeOp_(dev, b);
    case 'invSend': return ivSendOp_(dev, b);
    case 'invHold': return ivHoldOp_(dev, b);
    case 'invVoid': return ivVoidOp_(dev, b);
    case 'invRemind': return ivRemindOp_(dev, b);
    case 'invPaid': return ivPaidOp_(dev, b);
    case 'invDismiss': return ivDismissOp_(dev, b);
    case 'invSettings': return ivSettingsOp_(dev, b);
    case 'invScan': return ivScanOp_(dev);
    case 'invPack': return ivPackOp_(dev, b);
  }
  return { ok: false, error: 'Unknown request.' };
}

// ================================================================
// 5. EDITOR
// ================================================================
// Read only: what the timer would draft now, the next number, the switches, whether finance@ can send.
function ivTest() {
  wpsEditorOnly_();
  const ss = kpJobLogSs_(), invs = ivReadInvs_(ss), r = kpReadJobs_(ss);
  Logger.log('Next number: ' + ivNoStr_(ivNextNo_(ivProps_().getProperty(IV.PROP_NEXT), invs.map(function (x) { return x.no; }).concat(r.jobs.map(function (j) { return j.invoiceNo; })))));
  Logger.log('Send as ' + IV.FROM + ': ' + (ivAliasOk_() ? 'yes' : 'NO - add it in Gmail settings > Accounts > Send mail as'));
  Logger.log('Company number (INV_COMPANY_NO): ' + (ivCompanyNo_() || 'NOT SET - Project Settings > Script Properties > add INV_COMPANY_NO') + '. Template: ' + ivTemplate_());
  Logger.log('Switches: ' + JSON.stringify(ivSettings_()) + '. Push topic: ' + (typeof alTopic_ === 'function' && alTopic_() ? 'set' : 'not set'));
  Logger.log('Would draft: ' + JSON.stringify(ivRun_({ dry: true }).draft));
  Logger.log('Invoices tab: ' + invs.length + ' row(s). Nudges: ' + JSON.stringify(ivNudges_(r.jobs, invs, ivToday_()).lines));
}
// Only if Lex says the first number must be different (never lower than a number already used).
function ivSetFirst() { wpsEditorOnly_(); const n = 32; ivProps_().setProperty(IV.PROP_NEXT, String(n)); Logger.log('Next number set to ' + ivNoStr_(ivNextNo_(String(n), [])) + ' (numbers already used are still skipped).'); }
