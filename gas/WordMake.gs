// WordMake — makes each job's Word report from the WPS template (Lex, 22 Oct 2026). New file in the WPS Amendments script.
//
// Copies the template for the job type from Dropbox > WPS Templates - 2026, fills in the cover (address, client, date,
// job number, property line, clerk, photo link) and the page headers and footers from the Job Log, names it
// JOBNO.POSTCODE.DD.MM.YYYY.TYPE.docx and saves it into Dropbox > Reports > Word Docs. Never overwrites: if the job
// already has a Word file there, nothing happens.
// Timer wdmRun (every 30 min, through Keeper): booked jobs with a visit from today to WDM.DAYS_AHEAD days ahead, plus
// visited jobs still waiting for their report. Dash op wordMake: the Make Word file button on the Processing page.
// Photo link: the job's own link if photos are already uploaded; otherwise the script reserves the upload code now
// (script property wm_code_<JOB>.<POSTCODE>) and PhotoUp's puStart uses the same code, so the link in the report
// is the link the zip lands on.
// Needs: Archive (arToken_, arDownload_), WordFind (WF, wfPick_, wfList_), Keeper (kpReadJobs_, kpJobLogSs_, kpNorm_,
// kpLog_), PhotoUp (puCfg_, puKey_, puLink_, puNewCode_, puPropCode_).

const WDM = {
  TEMPLATES: '/WELLINGTON PROPERTY SERVICES/WPS Templates - 2026',
  FILES: {
    ICI: 'WPSXXX.POSTCODE.DD.MM.YY.ICI_2 - Claude defaults.docx',
    CO: 'WPSXXX.POSTCODE.DD.MM.YY.CO_1.docx',
    MTI: 'WPSXXX.POSTCODE.DD.MM.YY.MTI.docx',
    SOC: 'WPSXXX.POSTCODE.DD.MM.YY.SOC.docx'
  },
  OLD_LINK: 'http://www.wellingtonparker.com/photos/WPSXXX.POSTCODE.zip',
  CLERK: 'Lex',
  DAYS_AHEAD: 2,
  MAX_PER_RUN: 4,
  UPLOAD_URL: 'https://content.dropboxapi.com/2/files/upload'
};

// ---------------- pure parts (tested offline) ----------------
function wdmEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function wdmClean_(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
function wdmAddr_(j) { return [j.address, j.town, j.postcode].map(wdmClean_).filter(Boolean).join(', '); }
function wdmDate_(j) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(j.date || '')); return m ? m[3] + '.' + m[2] + '.' + m[1] : ''; }
function wdmType_(j) { const t = String(j.type || '').toUpperCase(); return WDM.FILES[t] ? t : ''; }
function wdmName_(j) {
  return [kpNorm_(j.jobNo), puPropCode_(j.postcode), wdmDate_(j), wdmType_(j)].join('.') + '.docx';
}
// "(Furnished) · 2 bed · 1 extra"; anything not in the Job Log stays as the template's wording for Lex to fill.
function wdmPropLine_(j) {
  const f = String(j.furnished || ''), beds = wdmClean_(j.bedrooms), ex = wdmClean_(j.extraAreas);
  const fu = /unfurn/i.test(f) ? '(Unfurnished)' : /part/i.test(f) ? '(Part furnished)' : /furn/i.test(f) ? '(Furnished)' : '(Furnished / Unfurnished)';
  let s = fu + ' · ' + (/^\d+$/.test(beds) ? (beds === '0' ? 'Studio' : beds + ' bed') : 'X bed');
  if (/^\d+$/.test(ex)) { if (ex !== '0') s += ' · ' + ex + ' extra'; }
  else s += ' · X extra';
  return s;
}
function wdmFirst_(s, from, to) { const i = s.indexOf(from); return i < 0 ? s : s.slice(0, i) + to + s.slice(i + from.length); }
function wdmAll_(s, from, to) { return s.split(from).join(to); }
// parts: { 'word/document.xml': text, 'word/header5.xml': text, ..., 'word/_rels/document.xml.rels': text }
// Returns { parts (changed ones only), left: [what still needs filling by hand] }.
function wdmFill_(parts, j, link) {
  const job = kpNorm_(j.jobNo), addr = wdmEsc_(wdmAddr_(j)), date = wdmDate_(j), client = wdmEsc_(wdmClean_(j.client));
  const out = {}, left = [];
  Object.keys(parts).forEach(function (n) {
    let x = parts[n], y = x;
    if (n === 'word/document.xml') {
      // Cover only: the first of each. The check-out's "compared with check in" block keeps its placeholders.
      y = wdmFirst_(y, '[FULL ADDRESS, POSTCODE]', addr);
      if (client) y = wdmFirst_(y, '[CLIENT / AGENT NAME]', client);
      y = wdmFirst_(y, 'DD.MM.YYYY', date);
      y = wdmFirst_(y, 'Download full set (WPSXXX)', 'Download full set (' + job + ')');
      y = wdmFirst_(y, 'WPSXXX', job);
      y = wdmFirst_(y, '(Furnished / Unfurnished) · X bed · X extra', wdmEsc_(wdmPropLine_(j)));
      y = wdmFirst_(y, '[NAME]', WDM.CLERK);
    } else if (/^word\/(header|footer)\d*\.xml$/.test(n)) {
      y = wdmAll_(y, '[Address line 1], [Address line 2], [Town, Postcode]', addr);
      y = wdmAll_(y, 'WPSXXX', job);
      y = wdmAll_(y, 'DD.MM.YYYY', date);
    } else if (n === 'word/_rels/document.xml.rels' && link) {
      y = wdmAll_(y, WDM.OLD_LINK, wdmEsc_(link));
    }
    if (y !== x) out[n] = y;
  });
  if (!client) left.push('client');
  const pl = wdmPropLine_(j);
  if (/Furnished \/ Unfurnished/.test(pl)) left.push('furnished');
  if (/X bed/.test(pl)) left.push('bedrooms');
  if (/X extra/.test(pl)) left.push('extra areas');
  return { parts: out, left: left };
}
// Which jobs the timer makes files for. now: Date. Returns jobs, oldest visit first.
function wdmDue_(jobs, now) {
  const today = Utilities.formatDate(now, 'Europe/London', 'yyyy-MM-dd');
  const until = Utilities.formatDate(new Date(now.getTime() + WDM.DAYS_AHEAD * 86400000), 'Europe/London', 'yyyy-MM-dd');
  return (jobs || []).filter(function (j) {
    if (j.archived || !/^WPS\d{6}$/.test(kpNorm_(j.jobNo)) || !wdmType_(j) || !wdmDate_(j) || !puPropCode_(j.postcode) || !wdmClean_(j.address)) return false;
    if (j.status === 'booked') return j.date >= today && j.date <= until || j.date < today;
    return j.status === 'processing';
  }).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); });
}

// ---------------- Google / Dropbox parts ----------------
// The upload code PhotoUp will use for this job (reserved here if the photos aren't up yet).
function wdmCodeFor_(jobNo, prop, make) {
  const p = PropertiesService.getScriptProperties(), k = 'wm_code_' + jobNo + '.' + prop;
  let c = String(p.getProperty(k) || '');
  if (!c && make) { c = puNewCode_(); p.setProperty(k, c); }
  return c;
}
function wdmLink_(j) {
  if (/^https:\/\//.test(String(j.photoLink || ''))) return String(j.photoLink);
  const c = puCfg_(); if (puCfgProblems_(c).length) return '';
  const job = kpNorm_(j.jobNo), prop = puPropCode_(j.postcode);
  return puLink_(c, puKey_(job, prop, wdmCodeFor_(job, prop, true)));
}
function wdmUpload_(path, bytes, rev) {
  const mode = rev ? { '.tag': 'update', update: rev } : 'add';          // update = only if nobody saved it since (rev)
  const r = UrlFetchApp.fetch(WDM.UPLOAD_URL, { method: 'post', muteHttpExceptions: true, contentType: 'application/octet-stream',
    headers: { Authorization: 'Bearer ' + arToken_(), 'Dropbox-API-Arg': JSON.stringify({ path: path, mode: mode, autorename: false, mute: false })
      .replace(/[\u007f-\uffff]/g, function (ch) { return '\\u' + ('000' + ch.charCodeAt(0).toString(16)).slice(-4); }) },
    payload: bytes });
  const code = r.getResponseCode(), text = r.getContentText();
  if (code === 200) { let rv = ''; try { rv = JSON.parse(text).rev || ''; } catch (e) {} return { ok: true, rev: rv }; }
  if (/conflict/.test(text)) return { ok: false, error: rev ? 'The Word file was saved by someone since; rooms left as they are.' : 'A file with that name is already in Word Docs.' };
  if (/missing_scope|files\.content\.write/.test(text)) return { ok: false, error: 'The Dropbox app has no write access.' };
  return { ok: false, error: 'Dropbox answered ' + code + ': ' + text.slice(0, 120) };
}
// Makes one job's Word file. j: a Job Log job. Returns { ok, file, left } or { ok:false, error } / { ok:true, already }.
function wdmMakeOne_(dev, j) {
  const job = kpNorm_(j.jobNo), type = wdmType_(j);
  if (!/^WPS\d{6}$/.test(job)) return { ok: false, error: 'This job has no WPS job number yet.' };
  if (!type) return { ok: false, error: 'No template for job type ' + (j.type || '(none)') + '.' };
  if (!wdmDate_(j)) return { ok: false, error: job + ' has no visit date in the Job Log.' };
  if (!puPropCode_(j.postcode) || !wdmClean_(j.address)) return { ok: false, error: job + ' needs an address and postcode in the Job Log.' };
  CacheService.getScriptCache().remove(WF.CACHE_KEY);
  const have = wfPick_(wfList_(), job);
  if (have.length) { const rf = wdmRefit_(dev, j, have[0].name); return { ok: true, already: true, file: have[0].name, rooms: rf.rooms || null, roomsWhy: rf.why || '' }; }
  const d = arDownload_(WDM.TEMPLATES + '/' + WDM.FILES[type]);
  if (d.missing) return { ok: false, error: 'Template ' + WDM.FILES[type] + ' isn\'t in WPS Templates - 2026.' };
  const blobs = Utilities.unzip(Utilities.newBlob(d.bytes, 'application/zip', 't.zip'));
  const parts = {};
  blobs.forEach(function (b) { const n = b.getName(); if (/^word\/(document|header\d*|footer\d*)\.xml$|^word\/_rels\/document\.xml\.rels$/.test(n)) parts[n] = b.getDataAsString('UTF-8'); });
  if (!parts['word/document.xml']) return { ok: false, error: 'The template didn\'t open as a Word file.' };
  const link = wdmLink_(j), f = wdmFill_(parts, j, link);
  // Refine 2 (Lex 23 Oct): the property's real rooms from the photo set, when the photos are up
  const fit = wdmFitRooms_(j, f.parts['word/document.xml'] || parts['word/document.xml']);
  if (fit.xml) f.parts['word/document.xml'] = fit.xml;
  const out = blobs.map(function (b) {
    const n = b.getName();
    return f.parts[n] != null ? Utilities.newBlob(f.parts[n], b.getContentType() || 'application/xml', n) : b;
  });
  const name = wdmName_(j), zip = Utilities.zip(out, name);
  const up = wdmUpload_(WF.FOLDER + '/' + name, zip.getBytes());
  if (!up.ok) return up;
  wdmMark_(job, up.rev, fit.rooms ? 'done' : '');
  CacheService.getScriptCache().remove(WF.CACHE_KEY);
  kpLog_('Processing', job, 'Changed', 'Word file made' + (dev ? ' by ' + dev : ' by the timer') + ': ' + name + (fit.rooms ? ' (rooms from the photos: ' + fit.rooms.join(', ') + ')' : ' (template rooms: ' + fit.why + ')') + (f.left.length ? ' (to fill by hand: ' + f.left.join(', ') + ')' : ''));
  return { ok: true, file: name, left: f.left, link: link, rooms: fit.rooms || null, roomsWhy: fit.rooms ? '' : fit.why };
}
// Dash op wordMake: { job } -> { ok, file, left } — the Make Word file button.
function wdmMake_(dev, b) {
  const no = kpNorm_(b && b.job);
  if (!/^WPS\d{6}$/.test(no)) return { ok: false, error: 'This job has no WPS job number yet.' };
  const hits = kpReadJobs_(kpJobLogSs_()).jobs.filter(function (j) { return kpNorm_(j.jobNo) === no && !j.archived; });
  if (hits.length !== 1) return { ok: false, error: hits.length ? no + ' is on ' + hits.length + ' jobs in the Job Log.' : no + ' isn\'t in the Job Log (Save & get latest first).' };
  const r = wdmMakeOne_(dev, hits[0]);
  if (r.ok) r.logDetail = no + (r.already ? ' Word file already there' : ' Word file made: ' + r.file);
  return r;
}
// Timer (Keeper wrapper kpTimerWmRun, every 30 min).
function wdmRun() {
  const jobs = wdmDue_(kpReadJobs_(kpJobLogSs_()).jobs, new Date());
  if (!jobs.length) return { made: 0 };
  const have = wfList_();
  let made = 0;
  for (let i = 0; i < jobs.length && made < WDM.MAX_PER_RUN; i++) {
    const hv = wfPick_(have, jobs[i].jobNo);
    if (hv.length) {                                                    // made before the visit: fit the rooms once the photos are up
      if (jobs[i].status === 'processing' && /^https:/.test(String(jobs[i].photoLink || '')) && wdmMarkGet_(kpNorm_(jobs[i].jobNo)).fit === '') {
        const rf = wdmRefit_('', jobs[i], hv[0].name); if (rf.rooms) made++;
      }
      continue;
    }
    const r = wdmMakeOne_('', jobs[i]);
    if (r.ok && !r.already) made++;
    else if (!r.ok) kpLog_('Processing', kpNorm_(jobs[i].jobNo), 'Problem', 'Word file not made: ' + r.error);
  }
  return { made: made };
}
// Editor: shows what the timer would make, makes nothing.
function wdmPreview() {
  const jobs = wdmDue_(kpReadJobs_(kpJobLogSs_()).jobs, new Date()), have = wfList_();
  if (!jobs.length) { Logger.log('No jobs due a Word file.'); return; }
  jobs.forEach(function (j) {
    const h = wfPick_(have, j.jobNo);
    Logger.log(kpNorm_(j.jobNo) + ' ' + j.type + ' ' + j.date + ': ' + (h.length ? 'already has ' + h[0].name : 'would make ' + wdmName_(j) + ' · ' + wdmPropLine_(j)));
  });
}

// ---------------- rooms (refine list 9, 23 Oct; needs WordRooms) ----------------
// What the script last saved for a job: rev (Dropbox) and fit ('done' = rooms fitted, 'skip' = won't try again, '' = not yet).
function wdmMarkGet_(job) {
  let v = {}; try { v = JSON.parse(PropertiesService.getScriptProperties().getProperty('wm_made_' + job) || '{}'); } catch (e) {}
  return { rev: String(v.rev || ''), fit: String(v.fit || '') };
}
function wdmMark_(job, rev, fit) { PropertiesService.getScriptProperties().setProperty('wm_made_' + job, JSON.stringify({ rev: rev || '', fit: fit || '' })); }
// Fits document.xml to the job's photo rooms. Returns { xml, rooms: [names] } or { why }.
function wdmFitRooms_(j, xml) {
  if (typeof wdrPhotoAreas_ !== 'function') return { why: 'WordRooms not loaded' };
  if (!xml) return { why: 'no document' };
  const a = wdrPhotoAreas_(j.photoLink);
  if (!a.areas) return { why: a.error };
  const f = wdrFit_(xml, a.areas);
  if (f.error) return { why: f.error };
  return { xml: f.xml, rooms: f.rooms.map(function (r) { return r.name; }) };
}
function wdmRev_(path) {
  const r = UrlFetchApp.fetch('https://api.dropboxapi.com/2/files/get_metadata', { method: 'post', muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + arToken_() }, payload: JSON.stringify({ path: path }) });
  if (r.getResponseCode() !== 200) return '';
  try { return JSON.parse(r.getContentText()).rev || ''; } catch (e) { return ''; }
}
// A Word file the script made before the visit gets the real rooms once, if nobody has saved it since.
function wdmRefit_(dev, j, fileName) {
  const job = kpNorm_(j.jobNo), mk = wdmMarkGet_(job);
  if (mk.fit === 'done') return { why: 'rooms already fitted' };
  if (mk.fit === 'skip') return { why: 'left as it is' };
  if (!mk.rev) return { why: 'not made by the script (or made before 23 Oct): left as it is' };
  const path = WF.FOLDER + '/' + fileName, rev = wdmRev_(path);
  if (!rev) return { why: 'Dropbox didn\'t answer' };
  if (rev !== mk.rev) { wdmMark_(job, mk.rev, 'skip'); return { why: 'saved since it was made: your work is left as it is' }; }
  if (!/^https:/.test(String(j.photoLink || ''))) return { why: 'no photos uploaded yet' };
  const d = arDownload_(path);
  if (d.missing) return { why: 'the Word file has gone' };
  const blobs = Utilities.unzip(Utilities.newBlob(d.bytes, 'application/zip', 'w.zip'));
  const doc = blobs.filter(function (b) { return b.getName() === 'word/document.xml'; })[0];
  if (!doc) return { why: 'the Word file didn\'t open' };
  const fit = wdmFitRooms_(j, doc.getDataAsString('UTF-8'));
  if (!fit.xml) return { why: fit.why };
  const out = blobs.map(function (b) { return b.getName() === 'word/document.xml' ? Utilities.newBlob(fit.xml, b.getContentType() || 'application/xml', b.getName()) : b; });
  const up = wdmUpload_(path, Utilities.zip(out, fileName).getBytes(), rev);
  if (!up.ok) { if (/saved by someone/.test(up.error)) wdmMark_(job, mk.rev, 'skip'); return { why: up.error }; }
  wdmMark_(job, up.rev, 'done');
  CacheService.getScriptCache().remove(WF.CACHE_KEY);
  kpLog_('Processing', job, 'Changed', 'Rooms fitted from the photos' + (dev ? ' (' + dev + ')' : ' (timer)') + ': ' + fit.rooms.join(', '));
  return { rooms: fit.rooms };
}
