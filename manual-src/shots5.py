# Screenshots for the 21 Oct 2026 manual update (PRs #66-#83): Reports page (PC and phone),
# version label and New job door button, mid-term Email box. Made-up jobs only.
# Run: cd /home/claude/manual && ROOT=/home/claude/wps-job-log PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 shots5.py
import os
os.environ.setdefault("CLOCK", "2026-10-13T08:45:00+01:00")
from shotlib import H, badges, real_look

def prep(h, view):
    pg = h.pg
    h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go("")
    real_look(pg); pg.evaluate(f"setView('{view}')"); pg.wait_for_timeout(700)

# 1. Reports page, PC
h = H(1440, 900); pg = h.pg
prep(h, "reports")
badges(h, "r1_reports", [(".rp-search", 1, "tl"), (".rp-grp >> nth=2", 2, "tl"), (".rp-tile >> nth=0", 3, "tl"),
    (".rp-tile >> nth=0 >> .rp-st", 4, "tl"), (".rp-tile >> nth=0 >> .rp-acts", 5, "tl"), ("select >> nth=1", 6, "tl")])
# 2. Top right: version label and New job door button (Dashboard)
pg.evaluate("setView('today')"); pg.wait_for_timeout(500)
badges(h, "r3_head", [("text=/^Version \\d/", 1, "tl"), (".nj-lbl", 2, "b")], clip_sel=".page-right", pad=40)
# 3. Mid-term Email box on an MTI job (box only; Preview needs the live script)
pg.evaluate("window.keyMode=()=>true")
mid = pg.evaluate("state.jobs.find(j=>j.type==='MTI' && !j.time).id")
pg.evaluate(f"openMtBox('{mid}')"); pg.wait_for_timeout(500)
h.shot("r4_mtbox", el="#mt_box")
print("errors (fetch blocks expected):", [e for e in h.errors if "ERR_FAILED" not in e][:5])
h.close()

# 4. Reports page, phone
h = H(390, 844, mobile=True); pg = h.pg
prep(h, "reports")
h.shot("r2_reports_phone")
h.close()
