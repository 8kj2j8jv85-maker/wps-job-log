// Growth (Lex, 3 Nov 2026): the dashboard's Growth section. One row per agent or landlord WPS is trying to win
// (Grays relaunch and London reconnect), kept in the WPS Job Log Sheet, tab "Growth". The dashboard reads and saves it
// through the Dash file (ops growthRead, growthSave, growthDelete, growthRestore, growthBulk, growthSendPreview,
// growthSend) with the device key; the Monday growth check reads the same tab.
// Real names and numbers live only here and in the Sheet, never in the public dashboard code.
//
// Build 1 (Lex, 3 Nov 22:10):
//   - new columns at the end: Type, First name, Postcode, Source, Batch, Do not contact (old rows read blank);
//   - delete moves the row to tab "Growth deleted" (with date, device and reason), restore puts it back;
//   - bulk add (pasted list or CSV from the dashboard), duplicates skipped by email, else by name + track;
//   - send from Growth: the reconnect email in the navy WpsMail look, from hello@, one email per person,
//     opt-out line in every email; each send logs "Email sent" on the row, moves To contact -> Emailed and sets a
//     follow-up 10 days on. Rows marked Do not contact, at Not now, or with no email are never sent to.
//
// Build 2 (Lex, 4 Nov 01:00):
//   - new column Flag ('Needs answer' / 'Bounced') and new stage Replied;
//   - gwScan_ (own timer every 15 min, gwStartScan in the editor; Dash op growthScan = Check replies now) reads info@
//     for mail to and from each contact's email and logs it on the card (auto: true): a reply -> Replied + Needs answer +
//     follow-up today; 'no thanks' -> Do not contact + Not now; out of office -> logged only; a bounce -> Bounced;
//     your own reply from Gmail -> logged, takes Needs answer off, follow-up in 7 days. Growth's own sends are skipped.
//     Jobs in the Job Log with the contact's email or name -> Job booked, First job (Regular from the second);
//   - the sample email (kind 'sample'): poster pictures inside the email and the sample PDF attached, from
//     Dropbox > WPS Templates - 2026 > Sample; logged as Sample sent, Needs answer off, follow-up in 7 days.
//
// Paste: replace the whole Growth file, add the Dash lines (paste steps), Deploy a new version.

const GW = {
  TAB: 'Growth',
  DEL_TAB: 'Growth deleted',
  HEAD: ['Id', 'Track', 'Agency', 'Area', 'Contact', 'Role', 'Phone', 'Email', 'Stage', 'Order', 'First contact',
    'Last contact', 'Next follow-up', 'Notes', 'Log', 'Updated', 'By',
    'Type', 'First name', 'Postcode', 'Source', 'Batch', 'Do not contact', 'Flag'],
  DEL_EXTRA: ['Deleted', 'Deleted by', 'Reason'],
  TRACKS: ['Grays', 'London'],
  TYPES: ['', 'Agent', 'Landlord'],
  STAGES: ['To contact', 'Called', 'Emailed', 'Replied', 'Visited', 'Interested', 'Trial agreed', 'First job', 'Regular', 'Not now'],
  HOWS: ['Call', 'Email sent', 'Reply received', 'Visit', 'Meeting', 'Note'],
  MAX_ROWS: 500,
  MAX_FIELD: 300,
  MAX_NOTES: 3000,
  MAX_LOG: 200,
  MAX_LOG_NOTE: 500,
  BULK_MAX: 100,
  SEND_MAX: 25,            // per click (keeps each run well inside Apps Script's 6 minutes)
  FOLLOW_DAYS: 10,         // follow-up date set on each send
  FLAGS: ['', 'Needs answer', 'Bounced'],
  SAMPLE_FOLLOW_DAYS: 7,
  SCAN_DAYS: 30,             // mail looked at, back from now
  SCAN_BATCH: 12,            // contact addresses per Gmail search
  SCAN_MAX_THREADS: 60,
  OURS: /@(wellington-ps\.co\.uk|wellingtonparker\.com)$/i,
  SAMPLE_DIR: '/WELLINGTON PROPERTY SERVICES/WPS Templates - 2026/Sample',
  SAMPLE_PDF: 'WPS Sample Report - Inventory and Check In.pdf',
  SAMPLE_IMGS: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'],
  SAMPLE_PHOTOS: 'https://8kj2j8jv85-maker.github.io/wps-job-log/sample/photos/',
  FROM: 'hello@wellington-ps.co.uk',
  NAME: 'Wellington Property Services'
};
// column number (0-based) of a heading
function gwCol_(h) { return GW.HEAD.indexOf(h); }

function gwSheet_(create) {
  const ss = SpreadsheetApp.openById(PE.JOB_LOG_SHEET_ID);
  let sh = ss.getSheetByName(GW.TAB);
  if (!sh && create) {
    sh = ss.insertSheet(GW.TAB);
    sh.getRange(1, 1, 1, GW.HEAD.length).setValues([GW.HEAD]);
    sh.setFrozenRows(1);
  } else if (sh && create) {
    gwHeadFix_(sh, GW.HEAD);
  }
  return sh;
}
// headings added in build 1 go on the end of row 1 (old rows simply read blank there)
function gwHeadFix_(sh, head) {
  const cur = sh.getRange(1, 1, 1, head.length).getDisplayValues()[0];
  if (cur.join('\u0001') !== head.join('\u0001')) sh.getRange(1, 1, 1, head.length).setValues([head]);
}
function gwDelSheet_(create) {
  const ss = SpreadsheetApp.openById(PE.JOB_LOG_SHEET_ID);
  const head = GW.HEAD.concat(GW.DEL_EXTRA);
  let sh = ss.getSheetByName(GW.DEL_TAB);
  if (!sh && create) {
    sh = ss.insertSheet(GW.DEL_TAB);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  } else if (sh && create) {
    gwDelMigrate_(sh, head);
    gwHeadFix_(sh, head);
  }
  return sh;
}
// build 2 added Flag before Deleted: rows deleted under build 1 get an empty Flag cell so their dates line up again
function gwDelMigrate_(sh, head) {
  const w = Math.max(sh.getLastColumn(), head.length);
  const top = sh.getRange(1, 1, 1, w).getDisplayValues()[0];
  const at = top.indexOf('Deleted');
  if (at === -1 || at === head.indexOf('Deleted') || sh.getLastRow() < 2) return;
  const gap = head.indexOf('Deleted') - at;
  if (gap <= 0) return;
  const n = sh.getLastRow() - 1, rows = sh.getRange(2, 1, n, w).getDisplayValues();
  const fixed = rows.map(function (r) { const a = r.slice(0, at), b = r.slice(at); const out = a.concat(new Array(gap).fill(''), b); return out.slice(0, head.length); });
  sh.getRange(2, 1, n, head.length).setNumberFormat('@').setValues(fixed);
}
function gwRows_(sh, width) {
  const w = width || GW.HEAD.length;
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getDisplayValues()
    .filter(function (r) { return String(r[0] || '').trim(); });
}
function gwObj_(r) {
  const o = {};
  GW.HEAD.forEach(function (h, i) { o[h] = r[i] == null ? '' : String(r[i]); });
  return o;
}
function gwFind_(rows, id) {
  for (let i = 0; i < rows.length; i++) if (rows[i][0] === id) return i;
  return -1;
}

// ---------- read ----------
function gwRead_() {
  const sh = gwSheet_(false);
  const dsh = gwDelSheet_(true);
  const dw = GW.HEAD.length + GW.DEL_EXTRA.length;
  const deleted = gwRows_(dsh, dw).slice(-50).reverse().map(function (r) {
    return { id: r[0], track: r[1], agency: r[2], deleted: r[GW.HEAD.length], by: r[GW.HEAD.length + 1], reason: r[GW.HEAD.length + 2] };
  });
  return { ok: true, head: GW.HEAD, rows: gwRows_(sh), stages: GW.STAGES, hows: GW.HOWS, tracks: GW.TRACKS, types: GW.TYPES,
    deleted: deleted, mail: { kinds: Object.keys(GW_MAIL) }, at: new Date().toISOString() };
}

// ---------- helpers ----------
function gwClean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max || GW.MAX_FIELD); }
function gwDate_(v) { const s = gwClean_(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; }
function gwToday_() { return Utilities.formatDate(new Date(), 'Europe/London', 'yyyy-MM-dd'); }
function gwAddDays_(iso, n) {
  const p = iso.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
  return d.toISOString().slice(0, 10);
}
function gwYes_(v) { return /^(yes|y|true|1|on)$/i.test(String(v == null ? '' : v).trim()) ? 'yes' : ''; }
function gwEmailOk_(e) { return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e); }
function gwNorm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }

// checks one incoming row; returns { err } or { v: cleaned values }
function gwCheck_(inRow) {
  const track = gwClean_(inRow.Track, 20), agency = gwClean_(inRow.Agency, 120);
  if (GW.TRACKS.indexOf(track) === -1) return { err: 'Pick Grays or London.' };
  if (!agency) return { err: 'The agency or landlord name is missing.' };
  const stage = gwClean_(inRow.Stage, 30) || 'To contact';
  if (GW.STAGES.indexOf(stage) === -1) return { err: 'Unknown stage.' };
  const email = gwClean_(inRow.Email, 200);
  if (email && !gwEmailOk_(email)) return { err: 'That email address doesn\'t look right.' };
  const order = gwClean_(inRow.Order, 4);
  if (order && !/^\d{1,3}$/.test(order)) return { err: 'Order must be a number.' };
  const type = gwClean_(inRow.Type, 20);
  if (GW.TYPES.indexOf(type) === -1) return { err: 'Type must be Agent or Landlord.' };
  return { v: {
    Track: track, Agency: agency, Area: gwClean_(inRow.Area, 120), Contact: gwClean_(inRow.Contact, 160),
    Role: gwClean_(inRow.Role, 120), Phone: gwClean_(inRow.Phone, 60), Email: email, Stage: stage, Order: order,
    'Next follow-up': gwDate_(inRow['Next follow-up']), Notes: gwClean_(inRow.Notes, GW.MAX_NOTES),
    Type: type, 'First name': gwClean_(inRow['First name'], 60), Postcode: gwClean_(inRow.Postcode, 10).toUpperCase(),
    Source: gwClean_(inRow.Source, 60), Batch: gwClean_(inRow.Batch, 60), 'Do not contact': gwYes_(inRow['Do not contact']),
    Flag: GW.FLAGS.indexOf(gwClean_(inRow.Flag, 20)) >= 0 ? gwClean_(inRow.Flag, 20) : ''
  } };
}
function gwNewId_(i) { return 'g' + Date.now().toString(36) + (i == null ? Math.floor(Math.random() * 1296).toString(36) : 'b' + i); }
// builds the full sheet row from cleaned values + the parts the script keeps
function gwBuild_(id, v, first, last, log, dev, updated) {
  const o = {};
  GW.HEAD.forEach(function (h) { o[h] = ''; });
  Object.keys(v).forEach(function (k) { if (gwCol_(k) >= 0) o[k] = v[k]; });
  o.Id = id; o['First contact'] = first || ''; o['Last contact'] = last || '';
  o.Log = JSON.stringify(log || []); o.Updated = updated; o.By = dev;
  return GW.HEAD.map(function (h) { return o[h]; });
}
function gwWrite_(r, out) {
  // RAW so numbers like phone numbers and dates stay as typed
  Sheets.Spreadsheets.Values.update({ values: [out] }, PE.JOB_LOG_SHEET_ID, GW.TAB + '!A' + r, { valueInputOption: 'RAW' });
}
function gwLock_() {
  const lock = LockService.getUserLock();
  return lock.tryLock(20000) ? lock : null;
}
const GW_BUSY = { ok: false, busy: true, error: 'Busy saving another change. Try again in a moment.' };

// ---------- save one contact (and optionally log one touch) ----------
// b.row = {Id?, Track, Agency, Area, Contact, Role, Phone, Email, Stage, Order, Next follow-up, Notes,
//          Type, First name, Postcode, Source, Batch, Do not contact}
// b.ifUpdated = the row's Updated value as this device last read it (blank for a new row)
// b.touch = {how, note, date?} adds a line to the log, sets Last contact (and First contact if blank)
function gwSave_(dev, b) {
  const inRow = b && b.row && typeof b.row === 'object' ? b.row : null;
  if (!inRow) return { ok: false, error: 'Nothing to save.' };
  const c = gwCheck_(inRow);
  if (c.err) return { ok: false, error: c.err };
  let touch = null;
  if (b.touch && typeof b.touch === 'object') {
    const how = gwClean_(b.touch.how, 30);
    if (GW.HOWS.indexOf(how) === -1) return { ok: false, error: 'Pick how you were in touch.' };
    touch = { at: gwDate_(b.touch.date) || gwToday_(), how: how, note: gwClean_(b.touch.note, GW.MAX_LOG_NOTE), by: dev };
  }
  const lock = gwLock_();
  if (!lock) return GW_BUSY;
  try {
    const sh = gwSheet_(true), rows = gwRows_(sh);
    const id = gwClean_(inRow.Id, 40);
    let at = -1, old = null;
    if (id) {
      at = gwFind_(rows, id);
      if (at === -1) return { ok: false, error: 'That contact isn\'t in the Growth tab any more. Reload the page.' };
      old = gwObj_(rows[at]);
      if (String(b.ifUpdated || '') !== old.Updated) {
        return { ok: false, conflict: true, error: 'Changed on another device. The latest is shown; make your change again.', logDetail: 'growth ' + id, head: GW.HEAD, rows: rows };
      }
    } else if (rows.length >= GW.MAX_ROWS) {
      return { ok: false, error: 'The Growth tab is full (' + GW.MAX_ROWS + ' rows).' };
    }
    let log = [];
    if (old && old.Log) { try { log = JSON.parse(old.Log); if (!Array.isArray(log)) log = []; } catch (e) { log = []; } }
    let first = old ? old['First contact'] : '', last = old ? old['Last contact'] : '';
    if (touch) {
      log.push(touch);
      if (log.length > GW.MAX_LOG) log = log.slice(-GW.MAX_LOG);
      if (!first || touch.at < first) first = touch.at;
      if (!last || touch.at > last) last = touch.at;
    }
    const updated = new Date().toISOString();
    const out = gwBuild_(id || gwNewId_(), c.v, first, last, log, dev, updated);
    gwWrite_(at === -1 ? sh.getLastRow() + 1 : at + 2, out);
    return { ok: true, id: out[0], updated: updated, head: GW.HEAD, rows: gwRows_(sh), logDetail: (at === -1 ? 'growth add ' : 'growth save ') + c.v.Agency + (touch ? ' + ' + touch.how : '') };
  } finally { lock.releaseLock(); }
}

// ---------- delete (to the Growth deleted tab) and restore ----------
// b = {id, ifUpdated, reason?}
function gwDelete_(dev, b) {
  const id = gwClean_(b && b.id, 40);
  if (!id) return { ok: false, error: 'Nothing to delete.' };
  const reason = gwClean_(b.reason, 200);
  const lock = gwLock_();
  if (!lock) return GW_BUSY;
  try {
    const sh = gwSheet_(true), rows = gwRows_(sh);
    const at = gwFind_(rows, id);
    if (at === -1) return { ok: false, error: 'That contact isn\'t in the Growth tab any more. Reload the page.' };
    const old = gwObj_(rows[at]);
    if (String(b.ifUpdated || '') !== old.Updated) {
      return { ok: false, conflict: true, error: 'Changed on another device. The latest is shown; delete it again if you still want to.', head: GW.HEAD, rows: rows };
    }
    const dsh = gwDelSheet_(true);
    const keep = rows[at].slice(0, GW.HEAD.length).concat([new Date().toISOString(), dev, reason]);
    dsh.getRange(dsh.getLastRow() + 1, 1, 1, keep.length).setNumberFormat('@').setValues([keep]);
    sh.deleteRow(at + 2);
    const r = gwRead_();
    r.logDetail = 'growth delete ' + old.Agency + (reason ? ' (' + reason + ')' : '');
    return r;
  } finally { lock.releaseLock(); }
}
// b = {id}
function gwRestore_(dev, b) {
  const id = gwClean_(b && b.id, 40);
  if (!id) return { ok: false, error: 'Nothing to restore.' };
  const lock = gwLock_();
  if (!lock) return GW_BUSY;
  try {
    const sh = gwSheet_(true), rows = gwRows_(sh);
    if (gwFind_(rows, id) !== -1) return { ok: false, error: 'That contact is already in the list.' };
    const dsh = gwDelSheet_(true), dw = GW.HEAD.length + GW.DEL_EXTRA.length, drows = gwRows_(dsh, dw);
    let at = -1;
    for (let i = drows.length - 1; i >= 0; i--) if (drows[i][0] === id) { at = i; break; }
    if (at === -1) return { ok: false, error: 'Not found in the deleted list.' };
    if (rows.length >= GW.MAX_ROWS) return { ok: false, error: 'The Growth tab is full (' + GW.MAX_ROWS + ' rows).' };
    const back = drows[at].slice(0, GW.HEAD.length);
    back[gwCol_('Updated')] = new Date().toISOString(); back[gwCol_('By')] = dev;
    gwWrite_(sh.getLastRow() + 1, back);
    dsh.deleteRow(at + 2);
    const r = gwRead_();
    r.logDetail = 'growth restore ' + back[gwCol_('Agency')];
    return r;
  } finally { lock.releaseLock(); }
}

// ---------- bulk add ----------
// b = {rows: [{Track, Agency, ...same fields as save...}], batch?: 'Reconnect Nov 26'}
// Every row is checked first; duplicates (same email, else same name + track, already in the list or earlier in
// the paste) are skipped and listed. Nothing is written if any row has an error, so a bad paste can't half-load.
function gwBulk_(dev, b) {
  const list = b && Array.isArray(b.rows) ? b.rows : null;
  if (!list || !list.length) return { ok: false, error: 'Nothing to add.' };
  if (list.length > GW.BULK_MAX) return { ok: false, error: 'At most ' + GW.BULK_MAX + ' at a time.' };
  const batch = gwClean_(b.batch, 60);
  const checked = [], errors = [];
  list.forEach(function (x, i) {
    const c = gwCheck_(Object.assign({}, x || {}, batch && !(x && x.Batch) ? { Batch: batch } : {}));
    if (c.err) errors.push({ line: i + 1, agency: gwClean_(x && x.Agency, 120), error: c.err }); else checked.push(c.v);
  });
  if (errors.length) return { ok: false, error: errors.length + ' line(s) need fixing. Nothing was added.', errors: errors };
  const lock = gwLock_();
  if (!lock) return GW_BUSY;
  try {
    const sh = gwSheet_(true), rows = gwRows_(sh);
    const seenEmail = {}, seenName = {};
    rows.forEach(function (r) {
      const e = gwNorm_(r[gwCol_('Email')]); if (e) seenEmail[e] = r[gwCol_('Agency')];
      seenName[r[gwCol_('Track')] + '|' + gwNorm_(r[gwCol_('Agency')])] = true;
    });
    const add = [], skipped = [];
    checked.forEach(function (v) {
      const e = gwNorm_(v.Email), nk = v.Track + '|' + gwNorm_(v.Agency);
      if (e && seenEmail[e]) { skipped.push({ agency: v.Agency, why: 'same email as ' + seenEmail[e] }); return; }
      if (!e && seenName[nk]) { skipped.push({ agency: v.Agency, why: 'already in the list' }); return; }
      if (e) seenEmail[e] = v.Agency;
      seenName[nk] = true;
      add.push(v);
    });
    if (rows.length + add.length > GW.MAX_ROWS) return { ok: false, error: 'That would take the Growth tab past ' + GW.MAX_ROWS + ' rows.' };
    if (add.length) {
      const updated = new Date().toISOString();
      const out = add.map(function (v, i) { return gwBuild_(gwNewId_(i), v, '', '', [], dev, updated); });
      sh.getRange(sh.getLastRow() + 1, 1, out.length, GW.HEAD.length).setNumberFormat('@').setValues(out);
    }
    const r = gwRead_();
    r.added = add.length; r.skipped = skipped;
    r.logDetail = 'growth bulk +' + add.length + (skipped.length ? ' (skipped ' + skipped.length + ')' : '') + (batch ? ' ' + batch : '');
    return r;
  } finally { lock.releaseLock(); }
}

// ---------- emails sent from Growth ----------
// Wording lives here (not in the public page). Each kind: subject, title, preheader, blocks(firstName) for WpsMail.
// The opt-out line goes on every email automatically (gwMailParts_).
const GW_MAIL = {
  reconnect: {
    label: 'Reconnect: new name and new report (London landlords)',
    subject: 'A familiar name, a new look: Wellington Parker is now Wellington Property Services',
    title: 'Wellington Parker is now Wellington Property Services',
    preheader: 'A new name, a new report and a service built around making your life easier as a landlord.',
    blocks: function (first) {
      return [
        { p: first ? 'Hi ' + first + ',' : 'Hello,' },
        { p: 'It\'s been a while, and we hope the lettings have been kind to you.' },
        { p: 'After more than ten years of inventories across London, Wellington Parker is now Wellington Property Services: a new name, a new report and a service built around making your life easier as a landlord. What hasn\'t changed is the detail. Every report is still written room by room, never a tick-box template.' },
        { panel: { title: 'Why it matters more than ever',
          lead: 'Since 1 May 2026, section 21 has gone and tenancies roll on as periodic, so a tenant can give two months\' notice at any time. If you ever need to recover the property or the deposit, it comes down to evidence. Cleaning and damage are still the top causes of deposit disputes, and the adjudicator decides on what\'s written and photographed at check-in and check-out.' } },
        { panel: { title: 'Our new report, built to be used', items: [
          'A clear independent report, laid out for DPS, mydeposits and TDS.',
          'Large, full-size photos of every room, captioned, with the full photo set a click away on every page.',
          'A clickable contents page and a bookmark for every room, so you can jump straight to the bathroom or the oven in seconds.',
          'Every item described with its condition, plus a glossary so the terms mean the same thing to you, your tenant and an adjudicator.',
          'Check-outs set against the check-in, so changes stand out.'] } },
        { panel: { title: 'The service around it', items: [
          'We arrange the visit time with your tenants directly, so there\'s no back-and-forth for you.',
          'Tenants sign online from a simple link, and we chase it for you.',
          'Check-outs and mid-terms back within 2 working days, inventories within 3.',
          'Mid-term inspections to spot problems early, before they become deposit claims.',
          'Full AIIC member, fully insured and ICO registered.'] } },
        { p: 'Still covering London, as always. Reply to this email and we\'ll send you a sample of the new report.' },
        { p: 'And if you\'ve a tenancy starting or ending soon, or you\'d like a mid-term check on a current one, just reply and we\'ll take it from there.' }
      ];
    }
  }
};
GW_MAIL.sample = {
  label: 'Sample report, photo set and how the service works',
  subject: 'Your sample report from Wellington Property Services',
  title: 'Your sample report',
  preheader: 'The sample you asked for, plus the photo set and how the service works.',
  withSample: true,
  blocks: function (first) {
    return [
      { p: first ? 'Hi ' + first + ',' : 'Hello,' },
      { p: 'Thanks for getting back to us. Here\'s the sample you asked for: a real inventory and check-in on our new report, with the details changed and every page marked SAMPLE.' },
      { img: 'e1' },
      { p: 'A few of the pages that matter most to landlords:' },
      { img: 'e2' }, { img: 'e3' }, { img: 'e4' }, { img: 'e5' }, { img: 'e6' },
      { button: GW.SAMPLE_PHOTOS, text: 'See the sample photo set' },
      { img: 'e7' },
      { p: 'The full sample report is attached as a PDF.' },
      { p: 'Got a tenancy starting or ending, or want a mid-term check on a current one? Just reply with the address and roughly when, and we\'ll take it from there.' }
    ];
  }
};
const GW_OPTOUT = 'Rather not hear from us? Just reply \'no thanks\' and we won\'t email you again.';

// blocks -> plain text (the text part every email keeps)
function gwPlain_(blocks) {
  const out = [];
  blocks.forEach(function (b) {
    if (b.img) return;
    if (b.button) { out.push(b.text + ': ' + b.button); return; }
    if (b.p != null) out.push(b.p);
    else if (b.small != null) out.push(b.small);
    else if (b.panel) {
      const lines = [b.panel.title];
      if (b.panel.lead) lines.push(b.panel.lead);
      (b.panel.items || []).forEach(function (t) { lines.push('- ' + t); });
      out.push(lines.join('\n'));
    }
  });
  out.push('Kind regards,\nWellington Property Services\n' + (typeof WM !== 'undefined' ? WM.PHONE + ' · ' + WM.EMAIL + '\n' + WM.WEB : 'hello@wellington-ps.co.uk'));
  return out.join('\n\n');
}
// assets = gwSampleAssets_() for the sample email (pictures + PDF); preview = true puts the pictures in as data: links
function gwMailParts_(kind, first, assets, preview) {
  const k = GW_MAIL[kind];
  const blocks = k.blocks(first).concat([{ small: GW_OPTOUT }]);
  // wmHtml_ has no picture block: a marker paragraph is swapped for the picture after
  const wm = blocks.map(function (b) { return b.img ? { p: 'GWIMG_' + b.img + '_GWIMG' } : b; });
  let html = wmHtml_({ title: k.title, preheader: k.preheader, blocks: wm });
  html = html.replace(/<p[^>]*>GWIMG_(\w+)_GWIMG<\/p>/g, function (m, id) {
    const src = !assets ? '' : preview ? 'data:image/jpeg;base64,' + Utilities.base64Encode(assets.imgs[id].getBytes()) : 'cid:' + id;
    return src ? '<img src="' + src + '" width="100%" alt="" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:8px;margin:0 0 14px">' : '';
  });
  return { subject: k.subject, html: html, text: gwPlain_(blocks), inline: assets ? assets.imgs : null, attach: assets ? [assets.pdf] : [] };
}
// the sample email's pictures and PDF, from Dropbox > WPS Templates - 2026 > Sample (Archive's arDownload_)
function gwSampleAssets_() {
  const get = function (name, type) {
    const d = arDownload_(GW.SAMPLE_DIR + '/' + name);
    if (!d || d.missing || !d.bytes) throw new Error('The sample file ' + name + ' isn\'t in WPS Templates - 2026 > Sample.');
    return Utilities.newBlob(d.bytes, type, name);
  };
  const imgs = {};
  GW.SAMPLE_IMGS.forEach(function (id) { imgs[id] = get(id + '.jpg', 'image/jpeg'); });
  return { imgs: imgs, pdf: get(GW.SAMPLE_PDF, 'application/pdf') };
}
// sorts the picked rows into those we'd send to and those we won't (with the reason)
function gwSendSort_(rows, ids, kind) {
  const will = [], skip = [];
  (ids || []).forEach(function (id) {
    const at = gwFind_(rows, String(id));
    if (at === -1) { skip.push({ id: id, agency: '?', why: 'not in the list any more' }); return; }
    const o = gwObj_(rows[at]);
    let why = '';
    if (gwYes_(o['Do not contact'])) why = 'Do not contact';
    else if (o.Stage === 'Not now') why = 'at Not now';
    else if (!o.Email || !gwEmailOk_(o.Email)) why = 'no email address';
    else {
      let log = []; try { log = JSON.parse(o.Log || '[]'); } catch (e) { log = []; }
      if (log.some(function (x) { return (x.how === 'Email sent' || x.how === 'Sample sent') && x.kind === kind; })) why = 'already sent this email';
    }
    if (why) skip.push({ id: o.Id, agency: o.Agency, why: why });
    else will.push({ id: o.Id, agency: o.Agency, email: o.Email, first: o['First name'], at: at });
  });
  return { will: will, skip: skip };
}
// b = {ids: [...], kind: 'reconnect'}  read only: who would get it, who won't, and the email for the first person
function gwSendPreview_(dev, b) {
  const kind = gwClean_(b && b.kind, 40);
  if (!GW_MAIL[kind]) return { ok: false, error: 'Unknown email.' };
  const ids = b && Array.isArray(b.ids) ? b.ids.slice(0, GW.MAX_ROWS) : [];
  if (!ids.length) return { ok: false, error: 'Tick at least one contact.' };
  const s = gwSendSort_(gwRows_(gwSheet_(false)), ids, kind);
  const first = s.will[0];
  let assets = null;
  if (GW_MAIL[kind].withSample) { try { assets = gwSampleAssets_(); } catch (e) { return { ok: false, error: String(e.message || e) }; } }
  const m = gwMailParts_(kind, first ? first.first : '', assets, true);
  return { ok: true, kind: kind, label: GW_MAIL[kind].label, subject: m.subject, html: m.html, sampleFor: first ? first.agency : '',
    will: s.will.map(function (x) { return { id: x.id, agency: x.agency, email: x.email, first: x.first }; }), skip: s.skip, max: GW.SEND_MAX, from: GW.FROM,
    attach: m.attach.map(function (a) { return a.getName(); }) };
}
// b = {ids: [...], kind, confirm: true}  sends up to SEND_MAX, one email per person; the rest are left for the next click
function gwSend_(dev, b) {
  const kind = gwClean_(b && b.kind, 40);
  if (!GW_MAIL[kind]) return { ok: false, error: 'Unknown email.' };
  if (!b || b.confirm !== true) return { ok: false, error: 'Preview first, then confirm.' };
  const ids = Array.isArray(b.ids) ? b.ids.slice(0, GW.MAX_ROWS) : [];
  if (!ids.length) return { ok: false, error: 'Tick at least one contact.' };
  const lock = gwLock_();
  if (!lock) return GW_BUSY;
  try {
    const sh = gwSheet_(true);
    let rows = gwRows_(sh);
    const s = gwSendSort_(rows, ids, kind);
    const now = s.will.slice(0, GW.SEND_MAX), later = s.will.slice(GW.SEND_MAX);
    const sent = [], failed = [], today = gwToday_();
    const sample = !!GW_MAIL[kind].withSample;
    let assets = null;
    if (sample) { try { assets = gwSampleAssets_(); } catch (e) { return { ok: false, error: String(e.message || e) }; } }
    now.forEach(function (x) {
      const m = gwMailParts_(kind, x.first, assets, false);
      const opt = { htmlBody: m.html, name: GW.NAME, from: GW.FROM, replyTo: GW.FROM };
      if (m.inline) opt.inlineImages = m.inline;
      if (m.attach.length) opt.attachments = m.attach;
      try {
        GmailApp.sendEmail(x.email, m.subject, m.text, opt);
      } catch (e) { failed.push({ id: x.id, agency: x.agency, why: String(e && e.message || e).slice(0, 200) }); return; }
      // log it on the row (fresh read of that row so nothing typed meanwhile is lost)
      rows = gwRows_(sh);
      const at = gwFind_(rows, x.id);
      sent.push({ id: x.id, agency: x.agency, email: x.email });
      if (at === -1) return;
      const o = gwObj_(rows[at]);
      let log = []; try { log = JSON.parse(o.Log || '[]'); if (!Array.isArray(log)) log = []; } catch (e) { log = []; }
      log.push({ at: today, how: sample ? 'Sample sent' : 'Email sent', note: GW_MAIL[kind].label, kind: kind, by: dev });
      if (log.length > GW.MAX_LOG) log = log.slice(-GW.MAX_LOG);
      const r = rows[at].slice(0, GW.HEAD.length);
      r[gwCol_('Log')] = JSON.stringify(log);
      if (!r[gwCol_('First contact')] || today < r[gwCol_('First contact')]) r[gwCol_('First contact')] = today;
      if (!r[gwCol_('Last contact')] || today > r[gwCol_('Last contact')]) r[gwCol_('Last contact')] = today;
      if ((r[gwCol_('Stage')] || 'To contact') === 'To contact') r[gwCol_('Stage')] = sample ? 'Replied' : 'Emailed';
      const fu = gwAddDays_(today, sample ? GW.SAMPLE_FOLLOW_DAYS : GW.FOLLOW_DAYS);
      if (sample) { r[gwCol_('Flag')] = ''; r[gwCol_('Next follow-up')] = fu; }   // sending the sample answers them
      else if (!r[gwCol_('Next follow-up')] || r[gwCol_('Next follow-up')] < fu) r[gwCol_('Next follow-up')] = fu;
      r[gwCol_('Updated')] = new Date().toISOString(); r[gwCol_('By')] = dev;
      gwWrite_(at + 2, r);
    });
    const out = gwRead_();
    out.sent = sent; out.failed = failed; out.skip = s.skip; out.left = later.length;
    out.logDetail = 'growth send ' + kind + ' ' + sent.length + ' sent' + (failed.length ? ', ' + failed.length + ' failed' : '') + (later.length ? ', ' + later.length + ' left' : '');
    return out;
  } finally { lock.releaseLock(); }
}


// ---------- build 2: the mailbox check (replies, no thanks, bounces, your own replies, jobs booked) ----------
const GW_OPTOUT_RE = /\b(no,? thanks?|no thank you|unsubscribe|remove me|take me off|stop (emailing|sending)|not interested|do not (email|contact)|don'?t (email|contact))\b/i;
const GW_AUTO_RE = /^(out of (the )?office|automatic reply|auto(matic)?[- ]?reply|autoreply|away from|on holiday|annual leave)/i;
function gwAddr_(s) { const m = String(s || '').match(/[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g); return (m || []).map(function (x) { return x.toLowerCase(); }); }
// the new text of an email: stops at the quoted earlier email
function gwFresh_(body) {
  const keep = [], lines = String(body || '').replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const nx = String(lines[i + 1] || '');
    if (/^On\b/.test(l) && (/wrote:\s*$/.test(l) || /wrote:\s*$/.test(nx.trim()))) break;   // Gmail's quote line, also when split over two lines
    if (/^-{2,}\s*Original Message/i.test(l) || /^From: /.test(l) || /^Sent from my /i.test(l) || /^_{5,}/.test(l)) break;
    if (!l || l.charAt(0) === '>') continue;
    keep.push(l);
    if (keep.join(' ').length > 600) break;
  }
  return keep.join(' ').replace(/\s+/g, ' ').trim();
}
function gwGrowthSubjects_() { const o = {}; Object.keys(GW_MAIL).forEach(function (k) { o[GW_MAIL[k].subject.toLowerCase()] = k; }); return o; }
// pure part (tested offline): one message -> an event for one contact, or null
// m = {id, at (ms), from, to:[...], cc:[...], subject, body, auto (Auto-Submitted header set), link}
function gwClassify_(m, emails, ours, growthSubjects) {
  const from = gwAddr_(m.from)[0] || '';
  const rcpt = (m.to || []).concat(m.cc || []).map(function (x) { return String(x).toLowerCase(); });
  const subj = String(m.subject || '').trim(), fresh = gwFresh_(m.body);
  if (emails[from]) {
    if (m.auto || GW_AUTO_RE.test(subj)) return { id: emails[from], kind: 'auto', note: subj.slice(0, 120) };
    // a long email that starts 'no thanks' is a real reply
    if (GW_OPTOUT_RE.test(fresh.slice(0, 200)) && fresh.length < 200) return { id: emails[from], kind: 'optout', note: fresh.slice(0, 200) };
    return { id: emails[from], kind: 'reply', note: (fresh || subj).slice(0, 240) };
  }
  if (ours.test(from)) {
    const to = rcpt.filter(function (x) { return emails[x]; })[0];
    if (!to) return null;
    const bare = subj.replace(/^((re|fw|fwd):\s*)+/i, '').toLowerCase();
    if (growthSubjects[subj.toLowerCase()]) return null;   // Growth's own send, already logged when it went
    return { id: emails[to], kind: 'out', note: (bare === subj.toLowerCase() ? '' : 'Re: ') + subj.replace(/^((re|fw|fwd):\s*)+/i, '').slice(0, 120) };
  }
  return null;
}
// pure part: apply events (oldest first) to one row object o (gwObj_) + its log; returns true if anything changed
function gwApply_(o, log, evs, today) {
  const seen = {}; log.forEach(function (x) { if (x.msg) seen[x.msg] = 1; });
  let changed = false;
  evs.sort(function (a, b) { return a.at - b.at; }).forEach(function (e) {
    if (seen[e.msg]) return; seen[e.msg] = 1; changed = true;
    const day = Utilities.formatDate(new Date(e.at), 'Europe/London', 'yyyy-MM-dd');
    const add = function (how, note) { log.push({ at: day, how: how, note: note || '', msg: e.msg, link: e.link || '', auto: true, by: 'Mailbox' }); };
    if (!o['First contact'] || day < o['First contact']) o['First contact'] = day;
    if (e.kind !== 'bounce' && e.kind !== 'auto' && (!o['Last contact'] || day > o['Last contact'])) o['Last contact'] = day;
    if (e.kind === 'reply') {
      add('Reply received', e.note);
      o.Flag = 'Needs answer';
      if (['To contact', 'Called', 'Emailed', ''].indexOf(o.Stage || '') >= 0) o.Stage = 'Replied';
      o['Next follow-up'] = today;
    } else if (e.kind === 'optout') {
      add('No thanks', e.note + ' Set to Do not contact.');
      o['Do not contact'] = 'yes'; o.Stage = 'Not now'; o.Flag = ''; o['Next follow-up'] = '';
    } else if (e.kind === 'auto') {
      add('Auto-reply', e.note);
    } else if (e.kind === 'bounce') {
      add('Email bounced', 'The email to ' + o.Email + ' came back. Find a new email or phone.');
      o.Flag = 'Bounced';
    } else if (e.kind === 'out') {
      add('Email sent', 'Your email: ' + e.note);
      const lastIn = log.filter(function (x) { return x.how === 'Reply received'; }).map(function (x) { return x.at; }).sort().pop() || '';
      if (o.Flag === 'Needs answer' && day >= lastIn) o.Flag = '';
      const fu = gwAddDays_(day, GW.SAMPLE_FOLLOW_DAYS);
      if (!o['Next follow-up'] || o['Next follow-up'] < fu) o['Next follow-up'] = fu;
    }
  });
  if (log.length > GW.MAX_LOG) log.splice(0, log.length - GW.MAX_LOG);
  return changed;
}
// pure part: Job Log jobs that belong to this contact (their email on the job, or their name as the client)
function gwJobsFor_(o, jobs) {
  const e = String(o.Email || '').toLowerCase().trim();
  const name = gwNorm_(String(o.Agency || '').replace(/\(private landlords?\)/i, ''));
  const contact = gwNorm_(o.Contact || '');
  return jobs.filter(function (j) {
    if (!j || !j.jobNo || /cancel/i.test(String(j.status || ''))) return false;
    const mails = gwAddr_([j.agentEmail, j.clientEmail, j.notes].join(' '));   // not tenant emails: a tenant isn't the client
    if (e && mails.indexOf(e) >= 0) return true;
    const c = gwNorm_(String(j.client || '').replace(/^private landlord\s*[-–:]\s*/i, ''));
    return !!c && c.length > 4 && (c === name || (contact.length > 4 && c === contact));
  });
}
function gwJobApply_(o, log, jobs) {
  let changed = false;
  const have = {}; log.forEach(function (x) { if (x.how === 'Job booked' && x.job) have[x.job] = 1; });
  jobs.forEach(function (j) {
    const no = String(j.jobNo).toUpperCase();
    if (have[no]) return; have[no] = 1; changed = true;
    log.push({ at: gwToday_(), how: 'Job booked', note: no + ' ' + (j.type || '') + (j.date ? ', ' + j.date : ''), job: no, auto: true, by: 'Job Log' });
  });
  const n = Object.keys(have).length;
  if (changed) {
    const order = GW.STAGES;
    const want = n >= 2 ? 'Regular' : n === 1 ? 'First job' : '';
    if (want && order.indexOf(want) > order.indexOf(o.Stage || 'To contact') && o.Stage !== 'Not now') o.Stage = want;
    o.Flag = o.Flag === 'Bounced' ? 'Bounced' : ''; o['Next follow-up'] = '';
  }
  return changed;
}
// the run: Gmail -> events per contact, Job Log -> jobs per contact, then one write per changed row
function gwScan_(dev) {
  const lock = gwLock_();
  if (!lock) return GW_BUSY;
  try {
    const sh = gwSheet_(true), rows = gwRows_(sh), today = gwToday_();
    const emails = {}, byId = {};
    rows.forEach(function (r, i) { const o = gwObj_(r); byId[o.Id] = { i: i, o: o }; const e = String(o.Email || '').toLowerCase().trim(); if (e && gwEmailOk_(e)) emails[e] = o.Id; });
    const list = Object.keys(emails), subjects = gwGrowthSubjects_(), evs = {};
    const push = function (id, e) { (evs[id] = evs[id] || []).push(e); };
    let threads = 0;
    for (let k = 0; k < list.length; k += GW.SCAN_BATCH) {
      const part = list.slice(k, k + GW.SCAN_BATCH).join(' OR ');
      const q = '{from:(' + part + ') to:(' + part + ') cc:(' + part + ')} newer_than:' + GW.SCAN_DAYS + 'd -in:trash -in:spam';
      GmailApp.search(q, 0, GW.SCAN_MAX_THREADS).forEach(function (th) {
        threads++;
        const link = th.getPermalink();
        th.getMessages().forEach(function (m) {
          if (m.isDraft()) return;
          let auto = false; try { auto = /auto-(replied|generated)/i.test(m.getHeader('Auto-Submitted') || ''); } catch (x) {}
          const ev = gwClassify_({ id: m.getId(), at: m.getDate().getTime(), from: m.getFrom(), to: gwAddr_(m.getTo()), cc: gwAddr_(m.getCc()),
            subject: m.getSubject(), body: m.getPlainBody(), auto: auto }, emails, GW.OURS, subjects);
          if (ev) push(ev.id, { kind: ev.kind, note: ev.note, msg: m.getId(), at: m.getDate().getTime(), link: link });
        });
      });
    }
    // bounces: the failed address is in the bounce's text
    GmailApp.search('from:(mailer-daemon OR postmaster) newer_than:' + GW.SCAN_DAYS + 'd', 0, 30).forEach(function (th) {
      th.getMessages().forEach(function (m) {
        const hit = gwAddr_(m.getPlainBody()).filter(function (x) { return emails[x]; })[0];
        if (hit) push(emails[hit], { kind: 'bounce', note: '', msg: m.getId(), at: m.getDate().getTime(), link: th.getPermalink() });
      });
    });
    let jobs = [];
    try { jobs = kpReadJobs_(kpJobLogSs_()).jobs || []; } catch (x) { jobs = []; }
    const changed = [];
    Object.keys(byId).forEach(function (id) {
      const b = byId[id], o = b.o;
      let log = []; try { log = JSON.parse(o.Log || '[]'); if (!Array.isArray(log)) log = []; } catch (x) { log = []; }
      let ch = evs[id] ? gwApply_(o, log, evs[id], today) : false;
      if (jobs.length) ch = gwJobApply_(o, log, gwJobsFor_(o, jobs)) || ch;
      if (!ch) return;
      o.Log = JSON.stringify(log); o.Updated = new Date().toISOString(); o.By = dev || 'Mailbox';
      gwWrite_(b.i + 2, GW.HEAD.map(function (h) { return o[h] == null ? '' : o[h]; }));
      changed.push(o.Agency);
    });
    PropertiesService.getScriptProperties().setProperty('gw_scan_last', JSON.stringify({ at: new Date().toISOString(), threads: threads, changed: changed.length }));
    const out = gwRead_();
    out.scan = { threads: threads, changed: changed, at: new Date().toISOString() };
    out.logDetail = 'growth scan ' + threads + ' threads, ' + changed.length + ' cards updated' + (changed.length ? ': ' + changed.slice(0, 5).join(', ') : '');
    return out;
  } finally { lock.releaseLock(); }
}
// Dash op growthScan (Check replies now)
function gwScanNow_(dev) { return gwScan_(dev); }
// timer, every 15 minutes (gwStartScan once in the editor); records its runs like Keeper's timers
function gwScanTimer() {
  try { if (typeof kpBeat_ === 'function') kpBeat_('gwScan', 'start'); gwScan_('Timer'); if (typeof kpBeat_ === 'function') kpBeat_('gwScan', 'ok'); }
  catch (e) { if (typeof kpBeat_ === 'function') kpBeat_('gwScan', 'fail', e); throw e; }
}
function gwStartScan() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'gwScanTimer') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('gwScanTimer').timeBased().everyMinutes(15).create();
  Logger.log('Growth mailbox check: every 15 minutes from now.');
}
function gwStopScan() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'gwScanTimer') ScriptApp.deleteTrigger(t); });
  Logger.log('Growth mailbox check stopped.');
}

// ---------- editor: starting targets (run once) ----------
// From claude/WPS_Grays_Research_2026-11-03.md and claude/WPS_London_Reconnect_2026-11-03.md (3 Nov 2026).
// Felicity J. Lord, haart and Griffin are left out (Lex). Phone numbers are from portal listings and may be
// call-tracking lines: confirm the direct number on the first call. London contacts may have left.
function gwSeed() {
  wpsEditorOnly_();
  const sh = gwSheet_(true);
  if (gwRows_(sh).length) { Logger.log('Growth tab already has rows: nothing added.'); return; }
  const G = function (o, agency, area, contact, phone, notes) { return ['Grays', agency, area, contact, '', phone, '', 'To contact', String(o), notes]; };
  const L = function (o, agency, area, contact, role, email, notes) { return ['London', agency, area, contact, role, '', email, 'To contact', String(o), notes]; };
  const seed = [
    G(1, 'QD / Qude Lettings', '37 Orsett Rd, Grays', '', '01375 318970', 'Biggest lettings-only stock in Grays (27 on Rightmove, 3 Nov). Ask for the lettings manager, then visit.'),
    G(2, 'Connollys', 'Grover Walk, Corringham', '', '01375 803662', 'Biggest east Thurrock stock (24 on Zoopla). ARLA.'),
    G(3, 'M&P Estates', '111 Daiglen Drive, South Ockendon', 'Paul Tobias-Gibbins (MD)', '01708 851999', 'Full management. Has blogged about inventories. Also 01708 954945 on OnTheMarket.'),
    G(4, 'Colubrid Lettings', '17 Kings Parade, Stanford-le-Hope', '', '01375 659134', '17 to let, large sales book. Number likely tracking: get a direct line.'),
    G(5, 'Ali & Co Property Services', '23 Lodge Lane, Grays', '', '01375 318674', '16 to let including rooms (HMO work). Visit.'),
    G(6, 'Grant Allen', '38 Orsett Rd, Grays', 'Grant Allen (director)', '01375 318411', 'Manages, director-led. Also 01375 390029.'),
    G(7, 'John Cottis & Co', '19 Kings Parade, Stanford-le-Hope', '', '01375 676655', '10 to let, ARLA, covers Tilbury and East Tilbury.'),
    G(8, 'Chesters Estates', '32 Orsett Rd, Grays', 'Garry Parker (proprietor)', '01375 382488', '9 to let. Letting line 01375 510028.'),
    G(9, 'Gower Dawes', '17 Defoe Parade, Chadwell St Mary', '', '01375 859999', 'Full management, 7 to let.'),
    G(10, 'Crondall Place', '1st floor, 34 Orsett Rd, Grays', '', '01375 318135', 'Small managed book. Walk-in round.'),
    G(10, 'Ashley Bennett', '34 Orsett Rd, Grays', 'Ashley Bennett (director)', '01375 318969', 'Manages. Walk-in round.'),
    G(10, 'Grays Property Management', '46 Bridge Rd, Grays', '', '01375 318431', 'Manages. Walk-in round.'),
    G(10, 'EmJen', '21 Oakway, Stifford Clays', 'Emma and Jenny (directors)', '01375 318192', 'Manages. Phone.'),
    L(1, 'Chestertons Islington', '327-329 Upper St, N1 2XQ', 'David Manning', 'Branch manager', 'David.Manning@chestertons.co.uk', 'Biggest past client (about 32 jobs 2018-2022). Also Catherine Whaley (Senior Property Manager), Alhad Mohammed. Be ready for the 2021 invoice chasing, the Baltic Place complaint and the Nov 2025 thermostat comment.'),
    L(2, 'Holden Property Group', 'Chessington', 'Julia Piper', 'Lettings Manager (2019)', 'jpiper@ultimateholdings.com', '9 reports 2018-19. Sep 2019 photo complaint. May have left.'),
    L(3, 'Olo Real Estate', 'Wimbledon', 'Steve', '', 'steve@olorest.com', 'Repeat client 2017-2021. His Dec 2023 urgent request only got an out-of-office: apologise.'),
    L(4, 'Gollance Property Management', '', 'Robin Gollance', '', 'robingollance@gollancepropertymanagement.com', 'Repeat bookings 2021.'),
    L(5, 'Morgan Randall', '', '', 'Property managers inbox', 'propertymanagers@morganrandall.com', '13 reports 2017-18. Contacts likely changed.'),
    L(6, 'Winkworth Islington / Highbury', '65 Upper St N1 / 106 Highbury Park N5', '', 'Lettings or property manager (to find)', '', 'One job 2015; contacts silent since 2018. Mention Winkworth Bow work.'),
    L(7, 'HAUS Properties', 'Shepherds Bush', '', '', '', '9 reports in 2018. Contact addresses not confirmed.'),
    L(7, 'Homes By Sophie', '', 'Sophie', '', 'sophie@homesbysophie.co.uk', '3 reports in 2018.'),
    L(7, 'C James Wimbledon', 'Wimbledon', '', '', 'wm-sales@cjames.co.uk', '1 report 2020; linked to Olo.')
  ];
  const now = new Date().toISOString();
  const rows = seed.map(function (s, i) {
    const r = ['g' + Date.now().toString(36) + i, s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], '', '', '', s[9], '[]', now, 'Seed'];
    while (r.length < GW.HEAD.length) r.push('');
    return r;
  });
  sh.getRange(2, 1, rows.length, GW.HEAD.length).setNumberFormat('@').setValues(rows);
  Logger.log('Growth tab: ' + rows.length + ' starting targets added.');
}
