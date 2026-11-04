// ReportsOut - "Reports out" on the dashboard (Lex, 4 Nov 2026). New file in the WPS Amendments script.
//
// Why: City Gate (WPS261004) sat in Drive > WPS Ready to send > Held and the dashboard had no way to see it or pull it
// back. Lex wants full vision: what is held (and why), what is waiting to go, what went out recently, and the fix
// from inside the Held list where reasonable.
//
// Dash ops (device key, through dkPost_ like every other op):
//   reportsOut (read)  -> held PDFs (with the reason from the PDF makes / Report sends tabs, the job's newest Word file,
//                         which buttons fit the reason), PDFs in Ready to send, Word files being made (PDF makes
//                         Waiting / Converting), and the last 14 days of the Report sends tab.
//   roRelease (write)  -> one held PDF moved back into WPS Ready to send (the auto-send picks it up within 15 minutes).
//   roBin (write)      -> one held PDF moved to the Drive Bin (restorable for 30 days).
//   roRemake (write)   -> Make PDF again: older copies of the job's Word file in Dropbox > Reports > To PDF are deleted
//                         (Dropbox Deleted files, restorable), then the job's newest Word file in Word Docs is copied in
//                         (same copy as the Processing page's Send to PDF). The held PDF is NOT touched: Lex bins it
//                         himself once the new PDF is made.
// Release and Bin only work on a file that is in the Held folder right now. Nothing here emails anyone.
// Every write is logged in the Keeper log (kpLog_) and in the Dash log (dkPost_).
//
// Needs: Code (prop_), ReportSend (RS_* folder properties), PdfMake (PM, PM_COL), WordFind (WF, WF2, wfList_, wfPick_,
// wfFile_, wfNames_), Archive (arToken_), Keeper (kpLog_).
// Dash: READ_OPS 'reportsOut'; WRITE_OPS 'roRelease', 'roBin', 'roRemake'; one dispatch line (see the paste steps).

const RO = {
  SENT_DAYS: 14,
  MAX_SENT: 80,
  MAX_LOG_ROWS: 800,                 // only the newest rows of each log tab are read
  RS_TAB: 'Report sends',
  RS_COLS: 9,                        // Time, Job, Type, File, File ID, To, CC, Status, Detail
  PM_TAB: 'PDF makes',
  DRIVE_FILE: 'https://drive.google.com/file/d/',
  DRIVE_FOLDER: 'https://drive.google.com/drive/folders/',
  DBX_DELETE: 'https://api.dropboxapi.com/2/files/delete_v2',
  DBX_COPY: 'https://api.dropboxapi.com/2/files/copy_v2'
};

// ================================================================
// 1. PURE RULES (tested offline: claude/WPS_ReportsOut_tests.js)
// ================================================================
function roJobNo_(name) {
  const m = String(name || '').toUpperCase().match(/WPS\d{6}(?!\d)/);
  return m ? m[0] : '';
}
function roIso_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString();
  const t = Date.parse(String(v || ''));
  return isNaN(t) ? '' : new Date(t).toISOString();
}
function roMs_(v) { const s = roIso_(v); return s ? Date.parse(s) : 0; }

// Why is this file held? pmRows: PDF makes rows (arrays, PM.HEAD order), rsRows: Report sends rows (9 columns).
// The newest log line that names this file id wins (a PdfMake hold later released and held again by the auto-send
// shows the auto-send reason).
function roReason_(fileId, pmRows, rsRows, pmCol) {
  const id = String(fileId || '');
  let best = null;
  (pmRows || []).forEach(function (r) {
    if (String(r[pmCol['PDF file']] || '') !== id || String(r[pmCol.Status]) !== 'Held') return;
    const at = roMs_(r[pmCol.Done]) || roMs_(r[pmCol.Time]);
    if (!best || at >= best.ms) best = { ms: at, source: 'PDF maker', why: String(r[pmCol.Detail] || ''), wordFile: String(r[pmCol['Word file']] || '').split('/').pop(),
      wordPages: r[pmCol['Word pages']] === '' ? '' : Number(r[pmCol['Word pages']]) || '', pdfPages: r[pmCol['PDF pages']] === '' ? '' : Number(r[pmCol['PDF pages']]) || '' };
  });
  (rsRows || []).forEach(function (r) {
    if (String(r[4] || '') !== id || String(r[7]) !== 'Held') return;
    const at = roMs_(r[0]);
    if (!best || at >= best.ms) best = { ms: at, source: 'Auto-send', why: String(r[8] || ''), wordFile: '', wordPages: '', pdfPages: '' };
  });
  if (!best) return { source: '', why: 'No log line names this file (it may have been put in Held by hand).', at: '', wordFile: '', wordPages: '', pdfPages: '' };
  return { source: best.source, why: best.why.replace(/\s*PDF saved in Ready to send > Held\.?\s*$/, '').trim(), at: best.ms ? new Date(best.ms).toISOString() : '',
    wordFile: best.wordFile, wordPages: best.wordPages, pdfPages: best.pdfPages };
}

// What kind of hold, which job field (if any), a plain fix line, and the buttons that fit.
// Buttons: open (Open PDF), release, word (Open Word file), remake (Make PDF again), edit (Edit job), bin.
function roHoldKind_(source, why) {
  const w = String(why || '');
  const out = function (kind, field, fix) {
    const acts = {
      pages: ['open', 'release', 'word', 'remake', 'bin'],
      job: ['open', 'edit', 'release', 'bin'],
      word: ['open', 'word', 'remake', 'bin'],
      retry: ['open', 'release', 'bin'],
      resend: ['open', 'word', 'remake', 'bin'],
      other: ['open', 'release', 'word', 'bin']
    }[kind];
    return { kind: kind, field: field || '', fix: fix, actions: acts };
  };
  if (/Page count differs|pages out|layout may have shifted/i.test(w))
    return out('pages', '', 'Open the PDF and check it. If it looks right, Release it. If the layout is wrong, fix the Word file, then Make PDF again.');
  if (/No check-in photo link/i.test(w))
    return out('job', 'notes', 'Add a "Check-in photos: <link>" line to the job notes (or make the check-in reference on page 1 a link and Make PDF again), then Release.');
  if (/No photo link/i.test(w)) return out('job', 'photoLink', 'Add the photo link to the job, then Release.');
  if (/No recipient/i.test(w)) return out('job', 'agentEmail', 'Tick who gets it in the job\'s Copy to (or add the client\'s email), then Release.');
  if (/has no address/i.test(w)) return out('job', 'address', 'Add the address to the job, then Release.');
  if (/has no postcode/i.test(w)) return out('job', 'postcode', 'Add the postcode to the job, then Release.');
  if (/File name says .* but the Job Log says/i.test(w)) return out('job', 'type', 'Set the right report type on the job (or fix the Word file name and Make PDF again), then Release.');
  if (/No tenant emails|tenants on the job|also on the tenant list/i.test(w)) return out('job', 'tenants', 'Fix the tenant rows on the job, then Release.');
  if (/already sent by this script|already\. To send anyway/i.test(w))
    return out('resend', '', 'This report already went out. To send it again, save the Word file with RESEND in its name and Make PDF again. Otherwise Bin this copy.');
  if (/no pages|Could not read the (links in the )?PDF|password-protected|declaration page|Gmail takes 25 MB|Not a PDF/i.test(w))
    return out('word', '', 'The PDF itself needs fixing: correct the Word file, then Make PDF again. Bin this copy once the new PDF is made.');
  if (/Gmail would not send|Script error|could not be moved/i.test(w))
    return out('retry', '', 'Something went wrong while sending. Release it to try again.');
  if (/not in the Job Log|rows in the Job Log|No WPS job number|More than one job number/i.test(w))
    return out('other', '', 'The job number in the file name doesn\'t match one job in the Job Log. Sort the job first, then Release.');
  if (/not sent automatically/i.test(w)) return out('other', '', 'This report type isn\'t sent by the script. Send it by hand, then Bin this copy.');
  if (/Private landlord/i.test(w)) return out('other', '', 'Add the landlord\'s email on the Clients tab (or put "Landlord signs: no" in the job notes), then Release.');
  return out('other', '', 'Read the reason, fix it, then Release.');
}

// Recently sent: Report sends rows with status Sent or Test in the last `days`, newest first.
function roSentRows_(rsRows, nowMs, days, max) {
  const cut = nowMs - days * 86400000;
  return (rsRows || []).filter(function (r) { const s = String(r[7]); return (s === 'Sent' || s === 'Test') && roMs_(r[0]) >= cut; })
    .map(function (r) { return { at: roIso_(r[0]), job: String(r[1] || ''), type: String(r[2] || ''), file: String(r[3] || ''), fileId: String(r[4] || ''),
      to: String(r[5] || ''), cc: String(r[6] || ''), status: String(r[7]), detail: String(r[8] || '').slice(0, 200) }; })
    .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, max || RO.MAX_SENT);
}

// Being made: PDF makes rows still Waiting or Converting.
function roMakingRows_(pmRows, pmCol) {
  return (pmRows || []).filter(function (r) { return r[pmCol.Status] === 'Waiting' || r[pmCol.Status] === 'Converting'; })
    .map(function (r) { const word = String(r[pmCol['Word file']] || '').split('/').pop();
      return { at: roIso_(r[pmCol.Started]) || roIso_(r[pmCol.Time]), word: word, job: roJobNo_(word), status: String(r[pmCol.Status]), detail: String(r[pmCol.Detail] || '').slice(0, 200) }; })
    .sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
}

// Word files of one job in a Dropbox listing [{name}] (To PDF copies to remove before Make PDF again).
function roJobFiles_(list, job) {
  const j = String(job || '').toUpperCase();
  if (!/^WPS\d{6}$/.test(j)) return [];
  return (list || []).filter(function (f) {
    const n = String(f.name || '').toUpperCase().replace(/\s+/g, '');
    return /\.DOCX?$/.test(n) && n.indexOf(j) === 0 && !/^\d/.test(n.slice(j.length));
  }).map(function (f) { return f.name; });
}

// One held item from a file's facts + its reason (pure, so the shape is tested).
function roHeldItem_(f, reason, word) {
  const k = roHoldKind_(reason.source, reason.why);
  const actions = k.actions.filter(function (a) { return (a !== 'word' && a !== 'remake') || !!word; });
  return { id: f.id, name: f.name, job: roJobNo_(f.name), size: f.size || 0, at: roIso_(f.updated), url: RO.DRIVE_FILE + f.id + '/view',
    source: reason.source, why: reason.why, heldAt: reason.at, wordPages: reason.wordPages, pdfPages: reason.pdfPages,
    kind: k.kind, field: k.field, fix: k.fix, actions: actions, word: word || null };
}

// ================================================================
// 2. APPS SCRIPT SIDE
// ================================================================
function roTab_(ss, name, cols) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = sh.getLastRow() - 1, from = Math.max(1, n - RO.MAX_LOG_ROWS + 1);
  return sh.getRange(from + 1, 1, n - from + 1, cols).getValues();
}
function roFiles_(folderId) {
  const out = [];
  if (!folderId) return out;
  const it = DriveApp.getFolderById(folderId).getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed()) continue;
    out.push({ id: f.getId(), name: f.getName(), size: f.getSize(), updated: f.getLastUpdated(), mime: f.getMimeType() });
  }
  return out.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
}
function roInFolder_(file, folderId) {
  const it = file.getParents();
  while (it.hasNext()) if (it.next().getId() === folderId) return true;
  return false;
}
function roWord_(list, job) {
  if (!job || typeof wfPick_ !== 'function') return null;
  const w = wfPick_(list, job)[0];
  return w ? { name: w.name, modified: w.modified, url: w.url } : null;
}

// Dash op reportsOut
function roRead_() {
  const heldId = prop_('RS_HELD_ID'), readyId = prop_('RS_READY_ID');
  if (!heldId || !readyId) return { ok: false, error: 'The Ready to send folders are not set up (run rsSetup).' };
  const ss = SpreadsheetApp.openById(prop_('SHEET_ID'));
  const pmRows = typeof PM !== 'undefined' ? roTab_(ss, RO.PM_TAB, PM.HEAD.length) : [];
  const rsRows = roTab_(ss, RO.RS_TAB, RO.RS_COLS);
  const pmCol = typeof PM_COL !== 'undefined' ? PM_COL : {};
  const heldFiles = roFiles_(heldId);
  let words = [];
  if (heldFiles.length && typeof wfList_ === 'function') { try { words = wfList_(); } catch (e) { words = []; } }
  const held = heldFiles.map(function (f) { return roHeldItem_(f, roReason_(f.id, pmRows, rsRows, pmCol), roWord_(words, roJobNo_(f.name))); });
  const ready = roFiles_(readyId).map(function (f) { return { id: f.id, name: f.name, job: roJobNo_(f.name), at: roIso_(f.updated), url: RO.DRIVE_FILE + f.id + '/view' }; });
  return { ok: true, at: new Date().toISOString(), held: held, ready: ready, making: pmRows.length ? roMakingRows_(pmRows, pmCol) : [],
    sent: roSentRows_(rsRows, Date.now(), RO.SENT_DAYS, RO.MAX_SENT),
    folders: { held: RO.DRIVE_FOLDER + heldId, ready: RO.DRIVE_FOLDER + readyId, sent: RO.DRIVE_FOLDER + (prop_('RS_SENT_ID') || '') } };
}

function roHeldFile_(b) {
  const id = String(b && b.fileId || '');
  if (!/^[A-Za-z0-9_-]{20,}$/.test(id)) return { error: 'No file given.' };
  let f;
  try { f = DriveApp.getFileById(id); } catch (e) { return { error: 'That file is no longer in Drive.' }; }
  if (f.isTrashed()) return { error: 'That file is already in the Bin.' };
  if (!roInFolder_(f, prop_('RS_HELD_ID'))) return { error: 'That file is not in Held any more (refresh the list).' };
  return { f: f };
}

// Dash op roRelease: { fileId }
function roRelease_(dev, b) {
  const h = roHeldFile_(b);
  if (h.error) return { ok: false, error: h.error };
  const name = h.f.getName(), job = roJobNo_(name);
  h.f.moveTo(DriveApp.getFolderById(prop_('RS_READY_ID')));
  if (typeof kpLog_ === 'function') kpLog_('ReportsOut', job, 'Changed', 'Released from Held into WPS Ready to send by ' + dev + ': ' + name);
  return { ok: true, file: name, job: job, logDetail: 'released ' + name };
}

// Dash op roBin: { fileId }
function roBin_(dev, b) {
  const h = roHeldFile_(b);
  if (h.error) return { ok: false, error: h.error };
  const name = h.f.getName(), job = roJobNo_(name);
  h.f.setTrashed(true);
  if (typeof kpLog_ === 'function') kpLog_('ReportsOut', job, 'Changed', 'Held PDF moved to the Drive Bin by ' + dev + ': ' + name);
  return { ok: true, file: name, job: job, logDetail: 'binned ' + name };
}

function roDbx_(url, body) {
  const r = UrlFetchApp.fetch(url, { method: 'post', muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + arToken_() }, payload: JSON.stringify(body) });
  return { code: r.getResponseCode(), text: r.getContentText() };
}

// Dash op roRemake: { job, modified } (modified = the Word file's save time the page showed Lex)
function roRemake_(dev, b) {
  if (typeof wfFile_ !== 'function' || typeof WF2 === 'undefined') return { ok: false, error: 'The WordFind script file isn\'t pasted yet.' };
  const job = String(b && b.job || '').toUpperCase().replace(/\s+/g, '');
  if (!/^WPS\d{6}$/.test(job)) return { ok: false, error: 'This report has no WPS job number.' };
  CacheService.getScriptCache().remove(WF.CACHE_KEY);
  let f;
  try { f = wfFile_(job); } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  if (b.modified && String(f.modified) !== String(b.modified)) {
    return { ok: false, changed: true, word: { name: f.name, modified: f.modified, url: f.url },
      error: 'The Word file was saved again since this list loaded (now ' + f.name + '). Nothing was copied. Check it, then press Make PDF again.' };
  }
  const old = roJobFiles_(wfNames_(WF2.TO_PDF), job), removed = [];
  for (let i = 0; i < old.length; i++) {
    const d = roDbx_(RO.DBX_DELETE, { path: WF2.TO_PDF + '/' + old[i] });
    if (d.code !== 200 && !/not_found/.test(d.text)) return { ok: false, error: 'Couldn\'t remove the older copy ' + old[i] + ' from To PDF (Dropbox ' + d.code + '). Nothing was copied.' };
    removed.push(old[i]);
  }
  const c = roDbx_(RO.DBX_COPY, { from_path: WF.FOLDER + '/' + f.name, to_path: WF2.TO_PDF + '/' + f.name, autorename: false });
  if (c.code !== 200) {
    if (/missing_scope|files\.content\.write/.test(c.text)) return { ok: false, error: 'The Dropbox app has no write access.' };
    return { ok: false, error: 'Dropbox answered ' + c.code + ': ' + c.text.slice(0, 120) + (removed.length ? ' (older copy removed: ' + removed.join(', ') + ')' : '') };
  }
  if (typeof kpLog_ === 'function') kpLog_('ReportsOut', job, 'Changed', 'Make PDF again by ' + dev + ': ' + f.name + ' copied into To PDF' + (removed.length ? '; older copy removed: ' + removed.join(', ') : ''));
  return { ok: true, job: job, file: f.name, modified: f.modified, removed: removed, logDetail: job + ' ' + f.name + ' copied into To PDF' + (removed.length ? ' (replaced ' + removed.length + ')' : '') };
}

// Editor check (read only): Logger shows what the dashboard would see. Changes nothing.
function roTest() {
  wpsEditorOnly_();
  const d = roRead_();
  Logger.log(JSON.stringify({ ok: d.ok, error: d.error, held: (d.held || []).map(function (h) { return h.name + ' | ' + h.kind + ' | ' + h.why; }),
    ready: (d.ready || []).map(function (r) { return r.name; }), making: (d.making || []).map(function (m) { return m.word + ' ' + m.status; }),
    sent: (d.sent || []).length }, null, 1));
}
