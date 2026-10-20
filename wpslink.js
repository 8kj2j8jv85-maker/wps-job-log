// wpslink.js — lets the Photo Tool and Dictation talk to the WPS script with this device's key (Lex, 20 Oct 2026).
// The key is the one pasted on the dashboard (More > Device key); it never leaves this browser except to the WPS script.
// Without a key nothing here does anything and both tools work as before (they read the jobs this browser has).
(function () {
  "use strict";
  var URL_ = "https://script.google.com/macros/s/AKfycbxAJ7lbajJ81KFwi4G9tIGTUKXhofsFcJ8QM4K_Vu4gdOx_yaCPYpDIL-y7vQvlbPxR/exec";
  var KEY_RE = /^wpsdk_[A-Za-z0-9_-]{43}$/;
  function key() { try { var k = localStorage.getItem("wps_dash_key_v1") || ""; return KEY_RE.test(k) ? k : ""; } catch (e) { return ""; } }
  function call(op, data) {
    var body = {}; Object.keys(data || {}).forEach(function (k) { body[k] = data[k]; });
    body.action = "dash"; body.dk = key(); body.op = op;
    return fetch(URL_, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "Couldn't reach the WPS script (no connection?)" }; });
  }
  // Jobs from the Job Log Sheet (rows with a "Data (do not edit)" column), or null without a key / on failure.
  function sheetJobs() {
    if (!key()) return Promise.resolve(null);
    return call("jlRead").then(function (d) {
      if (!d || !d.ok || !Array.isArray(d.jobs) || d.jobs.length < 1) return null;
      var di = d.jobs[0].indexOf("Data (do not edit)"); if (di < 0) return null;
      return d.jobs.slice(1).map(function (r) { try { return JSON.parse(r[di]); } catch (e) { return null; } }).filter(Boolean);
    });
  }
  // This browser's jobs plus the Sheet's: per job, whichever copy was changed last. Jobs only in the Sheet are added.
  function merge(local, sheet) {
    if (!sheet) return local || [];
    var at = function (j) { return Date.parse(j && j.updatedAt || "") || 0; };
    var byId = {}, out = [];
    (local || []).forEach(function (j) { if (j && j.id) byId[j.id] = j; });
    sheet.forEach(function (s) { var l = byId[s.id]; out.push(l && at(l) > at(s) ? l : s); if (l) delete byId[s.id]; });
    Object.keys(byId).forEach(function (id) { out.push(byId[id]); });   // made on this device, not saved yet
    return out;
  }
  window.WPSLink = {
    key: key, call: call, sheetJobs: sheetJobs, merge: merge,
    savePhotoLink: function (job, id, link) { return key() ? call("jobPatch", { job: job, id: id, photoLink: link }) : Promise.resolve(null); },
    saveDictation: function (job, type, text) { return key() ? call("dictSave", { job: job, type: type, text: text }) : Promise.resolve(null); }
  };
})();
