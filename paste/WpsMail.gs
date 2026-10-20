// WpsMail (20 Oct 2026, Lex): one look for every email that goes out to tenants, landlords and agents.
// Navy "dashboard" theme: logo top left, italic heading, details box with a coral edge, coral buttons, footer
// with phone, email, website and "Full AIIC member".
// Built to survive awkward email apps:
//   - the logos are pictures with the navy built in, so apps that flip colours can't make them vanish;
//   - if pictures are blocked (Outlook on a PC does this by default), the logo's alternative text shows
//     "Wellington Property Services" in white lettering and everything else is real text;
//   - colours are set twice (old bgcolor attributes for Outlook, plus styles), text is off-white, not pure white;
//   - buttons are coloured table cells, so they keep their colour in Outlook (corners go square there);
//   - every email keeps its plain-text version as well.
// No WhatsApp links (Lex 20 Oct): replies must come by email so the system can read them.
// Used by: CheckinSend (check-in emails), Sign (signing invites, reminders, thanks, signed copy, agent copy),
// Code (comment receipts and process emails A-D), ReportSend (report emails to agents).

// ON: false = real emails keep their old look (wmSendSamples still shows the new one). Lex turns it on after checking samples.
const WM = {
  ON: false,
  BG: '#141D3D', NAVY: '#1F2D5A', NAVY2: '#2B3D74', LINE: '#33467F', CORAL: '#E8735A',
  TEXT: '#F3F5FA', SOFT: '#C3CBE3', HL: '#F2937D',   // HL: lighter coral for highlighted text on navy (readable contrast)
  LOGO: 'https://8kj2j8jv85-maker.github.io/wps-job-log/sig/email/wps-logo-navy.png',
  AIIC: 'https://8kj2j8jv85-maker.github.io/wps-job-log/sig/email/aiic-navy.png',
  PHONE: '07541 345053', PHONE_INTL: '+447541345053',
  EMAIL: 'hello@wellington-ps.co.uk', WEB: 'www.wellington-ps.co.uk',
  F: 'font-family:Arial,Helvetica,sans-serif;'
};

function wmOn_() { return WM.ON === true; }
function wmEsc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Plain text to HTML: escapes, keeps line breaks, turns web and email addresses into links.
function wmText_(s) {
  return wmEsc_(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, function (u) {
    return '<a href="' + u + '" style="color:' + WM.CORAL + ';text-decoration:underline">' + (u.length > 60 ? u.slice(0, 57) + '...' : u) + '</a>';
  }).replace(/(^|[\s(])([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, function (m, pre, e) {
    return pre + '<a href="mailto:' + e + '" style="color:' + WM.CORAL + ';text-decoration:underline">' + e + '</a>';
  }).replace(/\b(0\d{4} \d{6})\b/g, '<span style="white-space:nowrap">$1</span>').replace(/\n/g, '<br>');
}

// Lex 20 Oct: the details people must not miss (address, dates) sit in the box with coral values, and the
// comments-form instructions sit in their own panel with a coral heading and one coral button.

// m = { title, preheader, blocks: [ {p}, {rows:[[label,value]]}, {button:href, text, primary}, {buttons:[...]},
//                                    {steps:{title, items:[...]}}, {small}, {link:href, text, before} ] }
function wmHtml_(m) {
  const F = WM.F;
  const p = function (t) { return '<p style="margin:0 0 14px;' + F + 'font-size:15px;line-height:1.55;color:' + WM.TEXT + '">' + wmText_(t) + '</p>'; };
  const small = function (t) { return '<p style="margin:0 0 12px;' + F + 'font-size:13px;line-height:1.5;color:' + WM.SOFT + '">' + wmText_(t) + '</p>'; };
  // Details box (Lex 20 Oct): label above value so the value gets the full width; an address keeps
  // "town, postcode" together, so if it must wrap it breaks cleanly before the town, never mid-way.
  const val = function (label, v) {
    const t = String(v == null ? '' : v);
    if (/^property/i.test(label) && t.split(',').length >= 3) {
      const parts = t.split(/,\s*/), tail = parts.splice(-2).join(', ');
      return wmText_(parts.join(', ')) + ', <span style="white-space:nowrap">' + wmText_(tail) + '</span>';
    }
    return wmText_(t);
  };
  const rows = function (rs) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + WM.NAVY2 + '" style="background:' + WM.NAVY2 + ';border-left:4px solid ' + WM.CORAL + ';margin:2px 0 18px"><tr><td style="padding:12px 16px 4px">'
      + rs.map(function (r) {
        const hl = /^(property|date|time|suggested time|comments close)/i.test(r[0]);
        return '<p style="margin:0 0 2px;' + F + 'font-size:11px;letter-spacing:1px;text-transform:uppercase;color:' + WM.SOFT + '">' + wmEsc_(r[0]) + '</p>'
          + '<p style="margin:0 0 10px;' + F + 'font-size:16px;line-height:1.4;font-weight:bold;color:' + (hl ? WM.HL : WM.TEXT) + '">' + val(r[0], r[1]) + '</p>';
      }).join('') + '</td></tr></table>';
  };
  const button = function (b) {
    const bg = b.primary === false ? WM.NAVY : WM.CORAL, border = b.primary === false ? WM.SOFT : WM.CORAL;
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 10px 10px 0"><tr>'
      + '<td bgcolor="' + bg + '" style="background:' + bg + ';border:1px solid ' + border + ';border-radius:6px;padding:11px 20px">'
      + '<a href="' + wmEsc_(b.button) + '" style="' + F + 'font-size:15px;font-weight:bold;color:#FFFFFF;text-decoration:none;display:inline-block">' + wmEsc_(b.text) + '</a></td></tr></table>';
  };
  const steps = function (s) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:2px 0 10px;border-top:1px solid ' + WM.LINE + '"><tr><td style="padding:12px 0 4px">'
      + '<p style="margin:0 0 8px;' + F + 'font-size:12px;letter-spacing:1px;text-transform:uppercase;color:' + WM.CORAL + ';font-weight:bold">' + wmEsc_(s.title) + '</p>'
      + s.items.map(function (t, i) {
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px"><tr><td valign="top" style="padding:0 10px 0 0;' + F + 'font-size:14px;font-weight:bold;color:' + WM.CORAL + '">' + (i + 1) + '.</td>'
          + '<td valign="top" style="' + F + 'font-size:14px;line-height:1.5;color:' + WM.TEXT + '">' + wmText_(t) + '</td></tr></table>';
      }).join('') + '</td></tr></table>';
  };
  const panel = function (x) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + WM.NAVY2 + '" style="background:' + WM.NAVY2 + ';border-radius:8px;margin:4px 0 18px"><tr><td style="padding:16px 18px 8px">'
      + '<p style="margin:0 0 8px;' + F + 'font-size:16px;font-weight:bold;color:' + WM.HL + '">' + wmEsc_(x.title) + '</p>'
      + (x.lead ? '<p style="margin:0 0 10px;' + F + 'font-size:14px;line-height:1.5;color:' + WM.TEXT + '">' + wmText_(x.lead) + '</p>' : '')
      + (x.items || []).map(function (t, i) {
        return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px"><tr><td valign="top" style="padding:0 10px 0 0;' + F + 'font-size:14px;font-weight:bold;color:' + WM.HL + '">' + (i + 1) + '.</td>'
          + '<td valign="top" style="' + F + 'font-size:14px;line-height:1.5;color:' + WM.TEXT + '">' + wmText_(t) + '</td></tr></table>';
      }).join('')
      + (x.button ? '<div style="margin:8px 0 6px">' + button({ button: x.button, text: x.buttonText }) + '</div>' : '')
      + '</td></tr></table>';
  };
  const body = (m.blocks || []).map(function (b) {
    if (b.p != null) return p(b.p);
    if (b.small != null) return small(b.small);
    if (b.rows) return b.rows.length ? rows(b.rows) : '';
    if (b.button) return '<div style="margin:4px 0 8px">' + button(b) + '</div>';
    if (b.buttons) return b.buttons.length ? '<div style="margin:4px 0 8px">' + b.buttons.map(button).join('') + '</div>' : '';
    if (b.steps) return steps(b.steps);
    if (b.panel) return panel(b.panel);
    if (b.link) return '<p style="margin:0 0 14px;' + F + 'font-size:15px;line-height:1.55;color:' + WM.TEXT + '">' + wmText_(b.before || '')
      + '<a href="' + wmEsc_(b.link) + '" style="color:' + WM.CORAL + ';font-weight:bold;text-decoration:underline">' + wmEsc_(b.text || b.link) + '</a></p>';
    return '';
  }).join('');
  const pre = m.preheader ? '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:' + WM.BG + '">' + wmEsc_(m.preheader) + '&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>' : '';
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="dark light"><meta name="supported-color-schemes" content="dark light"><title>' + wmEsc_(m.title || 'Wellington Property Services') + '</title></head>'
    + '<body style="margin:0;padding:0;background:' + WM.BG + '" bgcolor="' + WM.BG + '">' + pre
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + WM.BG + '" style="background:' + WM.BG + '"><tr><td align="center" style="padding:20px 10px">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="' + WM.NAVY + '" style="width:100%;max-width:600px;background:' + WM.NAVY + ';border-radius:10px">'
    + '<tr><td style="padding:24px 26px 4px"><img src="' + WM.LOGO + '" width="210" alt="Wellington Property Services" style="display:block;width:210px;max-width:70%;height:auto;border:0;outline:none;color:#FFFFFF;font-family:Georgia,\'Times New Roman\',serif;font-style:italic;font-size:22px;line-height:1.3"></td></tr>'
    + '<tr><td style="padding:16px 26px 6px">'
    + (m.title ? '<h1 style="margin:0 0 16px;font-family:\'Cormorant Garamond\',Georgia,\'Times New Roman\',serif;font-style:italic;font-weight:bold;font-size:27px;line-height:1.2;color:#FFFFFF">' + wmEsc_(m.title) + '</h1>' : '')
    + body + '</td></tr>'
    + '<tr><td style="padding:8px 26px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ' + WM.LINE + '"><tr><td style="padding-top:16px;' + WM.F + 'font-size:13px;line-height:1.6;color:' + WM.SOFT + '">'
    + 'Kind regards,<br><span style="color:#FFFFFF;font-weight:bold">Wellington Property Services</span><br>'
    + 'T&nbsp;<a href="tel:' + WM.PHONE_INTL + '" style="color:' + WM.SOFT + ';text-decoration:none">' + WM.PHONE + '</a> &nbsp;&middot;&nbsp; E&nbsp;<a href="mailto:' + WM.EMAIL + '" style="color:' + WM.SOFT + ';text-decoration:none">' + WM.EMAIL + '</a><br>'
    + '<a href="https://' + WM.WEB + '" style="color:' + WM.CORAL + ';text-decoration:none">' + WM.WEB + '</a>'
    + '</td></tr><tr><td style="padding-top:14px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td valign="middle" style="padding-right:12px"><img src="' + WM.AIIC + '" width="150" alt="AIIC" style="display:block;width:150px;height:auto;border:0;color:#FFFFFF;' + WM.F + 'font-size:13px;font-weight:bold"></td>'
    + '<td valign="middle" style="' + WM.F + 'font-size:12px;letter-spacing:1px;text-transform:uppercase;font-weight:bold;color:#FFFFFF">Full AIIC member</td>'
    + '</tr></table></td></tr></table></td></tr>'
    + '</table></td></tr></table></body></html>';
}

// ---------- adapters for the older email builders ----------
// Titles for emails that don't pass one, picked from their wording.
const WM_TITLES = [
  [/reminder to review and sign/i, 'Reminder: please review and sign'],
  [/please review and sign/i, 'Please review and sign your report'],
  [/received your signature/i, 'Signature received'],
  [/now been signed by all parties/i, 'Report signed and completed'],
  [/has been sent for signature/i, 'Report sent for signature'],
  [/received your \d+ comment|received comments on/i, 'Comments received'],
  [/window for comments .*closes/i, 'Reminder: comments window closing'],
  [/comment window .* closed/i, 'Report deemed agreed'],
  [/please find attached the check-out/i, 'Check-out report'],
  [/please find attached the mid-term/i, 'Mid-term inspection report'],
  [/please find attached the schedule of condition/i, 'Schedule of condition']
];
function wmTitleFor_(text) {
  for (let i = 0; i < WM_TITLES.length; i++) if (WM_TITLES[i][0].test(text)) return WM_TITLES[i][1];
  return '';
}
const WM_SIG_RE = /\n\s*(Kind regards|Warm regards|Best regards|Many thanks),?\s*\n[\s\S]*$/i;
// Paragraph lists to blocks: a short line straight after one ending "for:" / "below:" becomes the address box.
function wmBlocksFromParas_(paras, isObj) {
  const blocks = [];
  let box = false;
  paras.forEach(function (x) {
    if (isObj && typeof x === 'object') { blocks.push(x); box = false; return; }
    const t = String(x).trim();
    if (!t) return;
    if (box && t.length <= 140 && t.indexOf('\n') === -1 && !/[.!?]$/.test(t)) { blocks.push({ rows: [['Property', t]] }); box = false; return; }
    blocks.push({ p: t });
    box = /(for|below|of|at):$/i.test(t);
  });
  return blocks;
}
// Comments form instructions -> one panel; the closing date goes into the details box.
const WM_DATE_RE = /((Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)( \d{4})?)/;
function wmCommentsPanel_(blocks) {
  let date = '', url = '', at = -1;
  const keep = [];
  blocks.forEach(function (b) {
    const t = b.p || '';
    const dm = (/(closes on|until|by) /i.test(t) && WM_DATE_RE.exec(t)) || null;
    if (dm && !date) { date = dm[1]; if (b.p && /closes on /i.test(t) && t.length < 200) b = { p: t.replace('closes on ' + date, 'is closing soon') }; }
    if (b.p && /comments form/i.test(t)) { if (at < 0) at = keep.length; const um = /(https?:\/\/\S+)/.exec(t); if (um && !url) url = um[1].replace(/[).,]+$/, ''); return; }
    if (b.p && /^comments form: /i.test(t)) return;
    if (b.link && /comment/i.test(b.text || '')) { url = url || b.link; if (at < 0) at = keep.length; return; }
    if (b.small && /^https?:/.test(b.small) && at >= 0 && !url) { url = b.small; return; }
    if (b.p && /item numbers/i.test(t) && at >= 0) return;
    if (b.p && /7 days from receiving/i.test(t)) { keep.push({ p: 'If we don\'t hear from you within 7 days, the report will be deemed agreed by all parties.' }); return; }
    keep.push(b);
  });
  if (at < 0) return blocks;
  const items = [url ? 'Open the comments form with the button below.' : 'Open the report and click "click here to open our comments form" (page 8, or the Please note page near the end).',
    'Add each point with its item number from the report. Comments sent by other means cannot be accepted.'];
  if (date) items.push('Send your comments before ' + date + '.');
  keep.splice(at, 0, { panel: { title: 'Need to add something?', lead: 'If you find anything not recorded in the report, or disagree with anything in it, please tell us through our comments form.', items: items, button: url, buttonText: 'Open the comments form' } });
  if (date) {
    const box = keep.filter(function (b) { return b.rows; })[0];
    if (box) box.rows.push(['Comments close', date]);
  }
  return keep;
}
// Sentences that carry the address inline ("...report for <address> closes on...") -> details box
function wmPullAddress_(blocks) {
  if (blocks.some(function (b) { return b.rows; })) return blocks;
  const re = /\b(?:report for|for:?) ((?:Flat \w+, )?\d+[A-Za-z]?,? [^.;:\n]{3,90}?\b[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2})\b/;
  for (let i = 0; i < blocks.length; i++) {
    const m = blocks[i].p && re.exec(blocks[i].p);
    if (m) { blocks[i] = { p: blocks[i].p.replace(' for ' + m[1], '') }; blocks.splice(i + 1, 0, { rows: [['Property', m[1]]] }); break; }
  }
  return blocks;
}

// Plain-text email (process emails, receipts) -> themed HTML. The text keeps going out as the plain part.
function wmFromText_(text, title) {
  const t = String(text || '').replace(/\r/g, '').replace(WM_SIG_RE, '');
  const paras = t.split(/\n\s*\n/);
  const blocks = wmCommentsPanel_(wmPullAddress_(wmBlocksFromParas_(paras, false)));
  const first = (blocks.filter(function (b) { return b.p && !/^(dear|hello|hi)\b/i.test(b.p); })[0] || {}).p || '';
  return wmHtml_({ title: title || wmTitleFor_(t), preheader: first.slice(0, 110), blocks: blocks });
}
// Signing emails (Sign file): its parts list -> themed HTML. Strings are lines ('' = new paragraph),
// {button, text} = coral button, {before, link, text} = a link line.
function wmFromParts_(parts, title) {
  const out = [];
  let buf = [];
  const flush = function () { if (buf.length) { out.push(buf.join('\n')); buf = []; } };
  parts.forEach(function (x) {
    if (x && typeof x === 'object' && x.button) { flush(); out.push({ button: x.button, text: x.text }); }
    else if (x && typeof x === 'object' && x.link) { flush(); out.push({ link: x.link, text: x.text, before: x.before || '' }); }
    else if (x === '') flush();
    else buf.push(String(x));
  });
  flush();
  // "for:" followed directly by the address on the next line (same paragraph): split them
  const split = [];
  out.forEach(function (x) {
    if (typeof x === 'string') {
      const lines = x.split('\n');
      if (lines.length === 2 && /(for|below):$/i.test(lines[0])) { split.push(lines[0]); split.push(lines[1]); return; }
    }
    split.push(x);
  });
  const blocks = wmCommentsPanel_(wmBlocksFromParas_(split, true).map(function (b) {
    if (b.p && /^https?:\/\//.test(b.p)) return { small: b.p };
    return b;
  }));
  const all = split.filter(function (x) { return typeof x === 'string'; }).join(' ');
  const first = (blocks.filter(function (b) { return b.p && !/^(dear|hello|hi)\b/i.test(b.p); })[0] || {}).p || '';
  return wmHtml_({ title: title || wmTitleFor_(all), preheader: first.slice(0, 110), blocks: blocks });
}

// ---------- editor: send one of each email to info@ and Lex's Hotmail to check the look ----------
function wmSendSamples() {
  wpsEditorOnly_();
  const was = WM.ON; WM.ON = true;   // samples always show the new look
  try { wmSendSamples_(); } finally { WM.ON = was; }
}
function wmSendSamples_() {
  const to = 'info@wellingtonparker.com, lex.salami@hotmail.com';
  const job = { jobNo: 'WPS000000', type: 'ICI', status: 'booked', client: 'McQueens', date: '2026-11-02', address: '2 The Courtyard, 154 Goswell Road', town: 'London', postcode: 'EC1V 7DX',
    tenantEmails: 'tenant@example.com', tenantList: [{ name: 'Robbie Boyle' }, { name: 'Honor Burns' }], agentEmail: 'agent@example.com', tenantAsked: '13:00', tenantArrival: '13:30' };
  const send = function (label, subject, body, html) {
    GmailApp.sendEmail(to, '[SAMPLE ' + label + '] ' + subject, body, { name: CS.NAME, from: CS.FROM, htmlBody: html });
  };
  ['ask', 'propose', 'confirm'].forEach(function (k) {
    const m = csEmail_(Object.assign({}, job, k === 'confirm' ? { tenantAsked: '13:30' } : {}), k, [], [{ name: 'Jamal Gormati', email: 'agent@example.com' }]);
    send('check-in ' + k, m.subject, m.body, m.html);
  });
  const addr = '2 The Courtyard, 154 Goswell Road, London, EC1V 7DX';
  const inv = sgCompose_(['Dear Robbie,', '', 'Please review and sign the Inventory and Check In report for:', addr, '',
    'The report is attached, and you can download your photo set from the link on the first page of the report.', '',
    { button: 'https://www.wellington-ps.co.uk', text: 'Review and sign the report' }, '',
    'This link is just for you, so please don\'t forward this email.', '',
    'If you find anything not recorded in the report, or disagree with anything in it, please use our comments form:',
    { before: '', link: 'https://www.wellington-ps.co.uk', text: 'open the comments form' },
    'You will need the item numbers from the report. Comments sent by other means cannot be accepted.', '',
    'You have 7 days from receiving the report to send any comments (until Monday 9 November). If we don\'t hear from you within 7 days, the report will be deemed agreed by all parties.']);
  const rem = sgCompose_(['Dear Robbie,', '', 'Just a reminder to review and sign the Inventory and Check In report for:', addr, '',
    { button: 'https://www.wellington-ps.co.uk', text: 'Review and sign the report' }, '',
    'This link is just for you, so please don\'t forward this email.', '',
    'The 7-day window for comments closes on Monday 9 November. If you find anything not recorded in the report, or disagree with anything in it, please use our comments form:',
    { before: '', link: 'https://www.wellington-ps.co.uk', text: 'open the comments form' }, '',
    'If we don\'t hear from you by then, the report will be deemed agreed by all parties.']);
  send('signing reminder', 'Reminder: WPS000000 - Inventory and Check In - ' + addr + ' - please sign', rem.body, rem.html);
  send('signing invite', 'WPS000000 - Inventory and Check In - ' + addr + ' - please review and sign', inv.body, inv.html);
  const rb = rsBody_('CO', 'bowpropman@winkworth.co.uk', addr, 'http://www.wellingtonparker.com/photos/WPS000000.zip', 'http://www.wellingtonparker.com/photos/WPS000001.zip');
  send('report to agent', 'WPS000000 - Check Out - ' + addr, rb.body, rb.html);
  const d = 'Hello,\n\nJust a reminder that the 7-day window for comments on the Inventory and Check In report for ' + addr + ' closes on Monday 9 November.\n\nIf you find anything not recorded in the report, or disagree with anything in it, please use our comments form: open the report and click "click here to open our comments form" (page 8, or the Please note page near the end). You will need the job number at the top of the report and the item numbers.\n\nComments form: ' + (typeof sgCommentsUrl_ === 'function' ? sgCommentsUrl_('WPS000000', addr) : 'https://www.wellington-ps.co.uk') + '\n\nIf we don\'t hear from you by then, the report will be deemed agreed by all parties.' + PE_SIG;
  send('process email D', 'Reminder: WPS000000 - Inventory and Check In - ' + addr + ' - comments close 9 Nov', d, receiptHtml_(d));
  Logger.log('Samples sent to ' + to);
}
