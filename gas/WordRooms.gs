// WordRooms — the job's Word report gets the property's real rooms (refine list item 9, Lex 23 Oct 2026).
// New file in the WPS Amendments script, used by WordMake.
//
// The templates come with standard rooms (Entrance and Hallway, Reception, Kitchen, Bedroom 1, Bedroom 2, Bathroom,
// plus Garden and External Areas on the MTI). Oxley (open plan living and kitchen, 2 bedrooms, en-suite, balcony)
// had to be fitted by hand. Now the rooms come from the job's photo set: the Photo Tool puts the area in every photo's
// file name (JOB.PROP.DDMMYY.Area_NN.jpg), in walk-round order, so the room list is read from the zip's index only
// (the last few KB of the file on R2, never the whole zip).
// Each room is a copy of the template room it is most like (kitchen, hall, bedroom, bathroom, outside, other) with its
// own heading, its own Contents line and its own bookmark. Template rooms not seen in the photos are left out.
// When: when the Word file is made after the photos are up, and once on a Word file the script made before the visit
// as long as nobody has saved it since (Dropbox rev unchanged), so Lex's work is never touched.

const WDR = {
  TAIL: 65536,                                                       // bytes read from the end of the zip
  NOT_ROOMS: /^(external picture|front exterior|exterior|cover|meters?|electricity meter|gas meter|heat meter|water meter|keys?|smoke alarms?|unsorted)$/i,
  BM_BASE: 9800                                                       // bookmark ids for the fitted rooms
};

// ---------------- pure parts (tested offline) ----------------
function wdrU16_(b, i) { return (b[i] & 255) | ((b[i + 1] & 255) << 8); }
function wdrU32_(b, i) { return ((b[i] & 255) | ((b[i + 1] & 255) << 8) | ((b[i + 2] & 255) << 16)) + (b[i + 3] & 255) * 16777216; }
// tail: the last bytes of a zip (array of numbers, signed or not); total: the zip's full size.
// Returns { names } when the index is inside tail, { need: [start, length] } when more is needed, or { error }.
function wdrZipIndex_(tail, total) {
  let e = -1;
  for (let i = tail.length - 22; i >= 0 && i >= tail.length - 22 - 65535; i--) {
    if ((tail[i] & 255) === 0x50 && (tail[i + 1] & 255) === 0x4b && (tail[i + 2] & 255) === 5 && (tail[i + 3] & 255) === 6) { e = i; break; }
  }
  if (e < 0) return { error: 'not a zip (no end record)' };
  const count = wdrU16_(tail, e + 10), size = wdrU32_(tail, e + 12), off = wdrU32_(tail, e + 16);
  const tailStart = total - tail.length;
  if (off < tailStart) return { need: [off, size] };
  return { names: wdrCdNames_(tail, off - tailStart, count) };
}
// cd: bytes holding the central directory, from index at; returns the file names in order.
function wdrCdNames_(cd, at, count) {
  const out = [];
  let p = at;
  for (let k = 0; k < count && p + 46 <= cd.length; k++) {
    if (wdrU32_(cd, p) !== 0x02014b50) break;
    const n = wdrU16_(cd, p + 28), x = wdrU16_(cd, p + 30), c = wdrU16_(cd, p + 32);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(cd[p + 46 + i] & 255);
    try { s = decodeURIComponent(escape(s)); } catch (err) {}         // names are UTF-8
    out.push(s);
    p += 46 + n + x + c;
  }
  return out;
}
// Photo file names -> rooms in walk-round order (areas that aren't rooms left out).
// Names look like JOB.PROP.23.10.26.Bedroom 1 (Forward)_07.jpg (date dd.mm.yy, or ddmmyy in older sets). The bracketed
// part is the Photo Tool's direction note, not part of the room name (Oxley 23 Oct: "Bedroom 1 (Forward)" = Bedroom 1).
// No kitchen area at all = open plan: the first living / reception area becomes "<name> and Kitchen" (Oxley's report).
function wdrAreas_(names) {
  const out = [], seen = {};
  (names || []).forEach(function (n) {
    const base = String(n).split('/').pop();
    const m = /^[^.]+\.[^.]+\.(?:\d{6}|\d{2}\.\d{2}\.\d{2,4})\.(.+)_\d{2,3}\.jpe?g$/i.exec(base);
    if (!m) return;
    const a = m[1].replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!a || WDR.NOT_ROOMS.test(a)) return;
    const k = a.toLowerCase();
    if (!seen[k]) { seen[k] = 1; out.push(a); }
  });
  if (!out.some(function (a) { return /kitchen/i.test(a); })) {
    const i = out.findIndex(function (a) { return /living|lounge|reception|sitting|dining|open plan/i.test(a); });
    if (i !== -1) out[i] = out[i] + ' and Kitchen';
  }
  return out;
}
// Which template room a room is copied from. rooms: the template's room names.
function wdrBase_(name, rooms) {
  const has = function (r) { return rooms.indexOf(r) !== -1 ? r : ''; };
  const n = String(name).toLowerCase();
  if (/kitchen|kitchenette/.test(n)) return has('Kitchen') || has('Reception') || rooms[0];
  if (/bath|shower|en-?suite|\bw\.?\s?c\b|toilet|cloak/.test(n)) return has('Bathroom') || rooms[0];
  if (/hall|entrance|landing|stair|corridor|lobby|mezzanine/.test(n)) return has('Entrance and Hallway') || has('Reception') || rooms[0];
  if (/bed|study|office|dressing|nursery|box ?room/.test(n)) return has('Bedroom 1') || has('Reception') || rooms[0];
  if (/garden|balcony|terrace|patio|external|yard|roof|outside|garage|shed/.test(n)) return has('Garden and External Areas') || has('Reception') || rooms[0];
  return has('Reception') || rooms[0];
}
function wdrPlan_(areas, rooms) {
  return (areas || []).map(function (a) { return { name: a, base: wdrBase_(a, rooms) }; });
}
function wdrEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function wdrText_(x) { let s = ''; x.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, function (m, t) { s += t; return m; }); return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
// The body's top-level elements: [{ tag, s, e }] (s..e = character range in xml).
function wdrTop_(xml) {
  const b0 = xml.indexOf('<w:body>');
  if (b0 < 0) return null;
  const end = xml.lastIndexOf('</w:body>'), out = [];
  let p = b0 + 8;
  while (p < end) {
    const lt = xml.indexOf('<', p);
    if (lt < 0 || lt >= end) break;
    const m = /^<(w:[A-Za-z]+)[\s>\/]/.exec(xml.slice(lt, lt + 40));
    if (!m) { p = lt + 1; continue; }
    const tag = m[1], gt = xml.indexOf('>', lt);
    if (xml.charAt(gt - 1) === '/') { out.push({ tag: tag, s: lt, e: gt + 1 }); p = gt + 1; continue; }
    const open = new RegExp('<' + tag + '[\\s>]', 'g'), close = '</' + tag + '>';
    let depth = 1, q = gt + 1;
    while (depth > 0) {
      open.lastIndex = q;
      const o = open.exec(xml), c = xml.indexOf(close, q);
      if (c < 0) return null;
      if (o && o.index < c) {
        const g2 = xml.indexOf('>', o.index);
        if (xml.charAt(g2 - 1) !== '/') depth++;
        q = g2 + 1;
      } else { depth--; q = c + close.length; }
    }
    out.push({ tag: tag, s: lt, e: q });
    p = q;
  }
  return out;
}
// A room's photo table: a table whose first paragraph has the Heading1a style. Returns its heading or ''.
function wdrRoomHead_(tblXml) {
  const m = /<w:p[\s>](?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading1a"\/>(?:(?!<\/w:p>)[\s\S])*?<\/w:p>/.exec(tblXml);
  return m && tblXml.indexOf(m[0]) < 2600 ? wdrText_(m[0]).trim() : '';
}
// Rooms in a document: [{ name, i (photo table), j (item table), bm }] in order.
function wdrRooms_(xml, els) {
  const out = [];
  for (let i = 0; i < els.length; i++) {
    if (els[i].tag !== 'w:tbl') continue;
    const t = xml.slice(els[i].s, els[i].e), name = wdrRoomHead_(t);
    if (!name || !/Overview/.test(wdrText_(t))) continue;
    let j = i + 1;
    while (j < els.length && els[j].tag !== 'w:tbl') j++;
    if (j >= els.length) break;
    const bm = /<w:bookmarkStart w:id="\d+" w:name="([^"]+)"\/>/.exec(t);
    out.push({ name: name, i: i, j: j, bm: bm ? bm[1] : '' });
    i = j;
  }
  return out;
}
// Rename the copy of a room block: heading, bookmarks (unique), Word's paragraph ids dropped.
function wdrCopy_(blockXml, oldName, newName, k) {
  let x = blockXml.replace(/ w14:(paraId|textId)="[^"]*"/g, '');
  let first = true;
  x = x.replace(/(<w:pStyle w:val="Heading1a"\/>(?:(?!<\/w:p>)[\s\S])*?<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/, function (m, a, t, c) { return first ? (first = false, a + wdrEsc_(newName) + c) : m; });
  let n = 0;
  const ids = {};
  x = x.replace(/<w:bookmarkStart w:id="(\d+)" w:name="([^"]+)"\/>/g, function (m, id, nm) {
    const nid = String(WDR.BM_BASE + k * 10 + n), nn = n === 0 ? '_TocWPSRoom' + (k + 1) : nm + '_r' + (k + 1);
    n++; ids[id] = nid;
    return '<w:bookmarkStart w:id="' + nid + '" w:name="' + nn + '"/>';
  });
  x = x.replace(/<w:bookmarkEnd w:id="(\d+)"\/>/g, function (m, id) { return '<w:bookmarkEnd w:id="' + (ids[id] || id) + '"/>'; });
  return x;
}
// Contents line for a room (copied from the base room's line).
function wdrTocLine_(pXml, newName, k) {
  const nn = '_TocWPSRoom' + (k + 1);
  let x = pXml.replace(/ w14:(paraId|textId)="[^"]*"/g, '');
  x = x.replace(/w:anchor="[^"]+"/, 'w:anchor="' + nn + '"').replace(/PAGEREF _Toc\w+/, 'PAGEREF ' + nn);
  let first = true;
  x = x.replace(/(<w:rStyle w:val="Hyperlink"\/>(?:(?!<\/w:r>)[\s\S])*?<w:t(?:\s[^>]*)?>)([^<]*)(<\/w:t>)/, function (m, a, t, c) { return first ? (first = false, a + wdrEsc_(newName) + c) : m; });
  return x;
}
// Fits document.xml to the rooms. areas: rooms in order. Returns { xml, rooms: [{name, base}] } or { error }.
function wdrFit_(xml, areas) {
  if (!areas || !areas.length) return { error: 'no rooms in the photo set' };
  const els = wdrTop_(xml);
  if (!els) return { error: 'the Word file didn\'t read' };
  const rooms = wdrRooms_(xml, els);
  if (rooms.length < 2) return { error: 'no template rooms found in the Word file' };
  const names = rooms.map(function (r) { return r.name; });
  const plan = wdrPlan_(areas, names);
  const byName = {}; rooms.forEach(function (r) { byName[r.name] = r; });
  // spacer between rooms: the first empty paragraph after the first room's item table
  const after = els[rooms[0].j + 1];
  const spacer = after && after.tag === 'w:p' && !wdrText_(xml.slice(after.s, after.e)) && !/w:type="page"/.test(xml.slice(after.s, after.e)) ? xml.slice(after.s, after.e) : '<w:p/>';
  const blocks = plan.map(function (p, k) {
    const r = byName[p.base];
    return wdrCopy_(xml.slice(els[r.i].s, els[r.j].e), r.name, p.name, k);
  });
  const first = els[rooms[0].i].s, last = els[rooms[rooms.length - 1].j].e;
  let out = xml.slice(0, first) + blocks.join(spacer) + xml.slice(last);
  // Contents: the template rooms' lines become the new rooms' lines
  const toc = [];
  rooms.forEach(function (r) {
    if (!r.bm) return;
    const re = new RegExp('<w:p[\\s>](?:(?!<\\/w:p>)[\\s\\S])*?w:anchor="' + r.bm + '"(?:(?!<\\/w:p>)[\\s\\S])*?<\\/w:p>');
    const m = re.exec(out);
    if (m) toc.push({ name: r.name, s: m.index, e: m.index + m[0].length, x: m[0] });
  });
  if (toc.length === rooms.length) {
    toc.sort(function (a, b) { return a.s - b.s; });
    const tx = {}; toc.forEach(function (t) { tx[t.name] = t.x; });
    const lines = plan.map(function (p, k) { return wdrTocLine_(tx[p.base], p.name, k); }).join('');
    out = out.slice(0, toc[0].s) + lines + out.slice(toc[toc.length - 1].e);
  }
  return { xml: out, rooms: plan, contents: toc.length === rooms.length };
}

// ---------------- Google parts ----------------
// Rooms from the job's uploaded photo set. Returns { areas } or { error }.
function wdrPhotoAreas_(link) {
  if (!/^https:\/\/photos\.wellington-ps\.co\.uk\/photos\/[^\/?#]+\.zip$/i.test(String(link || ''))) return { error: 'no uploaded photo set on the job' };
  const get = function (range) {
    const r = UrlFetchApp.fetch(link, { muteHttpExceptions: true, headers: { Range: range } });
    const code = r.getResponseCode();
    if (code !== 206) throw new Error('photo store answered ' + code);
    const cr = String(r.getHeaders()['Content-Range'] || r.getHeaders()['content-range'] || '');
    const tot = Number((/\/(\d+)$/.exec(cr) || [])[1] || 0);
    return { bytes: r.getContent(), total: tot };
  };
  try {
    const t = get('bytes=-' + WDR.TAIL);
    let ix = wdrZipIndex_(t.bytes, t.total || t.bytes.length);
    if (ix.need) {
      const s = ix.need[0], n = ix.need[1];
      if (n > 4000000) return { error: 'zip index too big' };
      const c = get('bytes=' + s + '-' + (s + n - 1));
      ix = { names: wdrCdNames_(c.bytes, 0, 100000) };
    }
    if (ix.error) return { error: ix.error };
    const areas = wdrAreas_(ix.names);
    return areas.length ? { areas: areas } : { error: 'no rooms named in the photo set' };
  } catch (e) { return { error: e.message }; }
}
// Editor check (changes nothing): wdrTest('WPS261016') shows the rooms the job's photo set would give.
function wdrTest(jobNo) {
  wpsEditorOnly_();
  const no = kpNorm_(jobNo || 'WPS261016');
  const j = kpReadJobs_(kpJobLogSs_()).jobs.filter(function (x) { return kpNorm_(x.jobNo) === no; })[0];
  if (!j) { Logger.log(no + ' not in the Job Log'); return; }
  const r = wdrPhotoAreas_(j.photoLink);
  Logger.log(no + ': ' + (r.areas ? r.areas.join(' | ') : 'none: ' + r.error));
}
