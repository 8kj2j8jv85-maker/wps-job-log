# Screenshots for the 19 Oct 2026 "manual for dummies": the screens added 18-19 Oct (PRs #33-#43).
# Made-up jobs only. Run: cd /home/claude/manual && ROOT=/home/claude/wps-job-log python3 shots4.py
import os, json, time
os.environ.setdefault("CLOCK", "2026-10-13T08:45:00+01:00")
from shotlib import H, badges, real_look

NOW = int(__import__("datetime").datetime(2026,10,13,7,45,tzinfo=__import__("datetime").timezone.utc).timestamp()*1000)
NEWS = {"at": NOW, "refreshed": NOW, "broken": [], "items": [
  {"t": "Example headline: what the new deposit rules mean for check-outs", "u": "https://www.lettingagenttoday.co.uk/", "s": "Letting Agent Today", "d": NOW - 3600e3},
  {"t": "Example headline: inventory clerks and the Renters' Rights Act", "u": "https://theaiic.co.uk/news", "s": "AIIC", "d": NOW - 86400e3}]}

def tile(pg, key):
    pg.evaluate(f"setDashPanel('{key}')"); pg.wait_for_timeout(150)

def setup(pg):
    pg.evaluate("localStorage.setItem('wps_help_on_v1','0')")
    pg.evaluate("(n)=>localStorage.setItem('wps_news_v1', JSON.stringify(n))", NEWS)

def slots(pg):
    pg.evaluate("""()=>{ state.gcalToken='x'; state.gcalTokenExpiry=Date.now()+3600e3; state.sheetsOk=false;
      state.amend={loaded:true,at:new Date(),autoRem:{},jobs:[]};
      state.slots={loaded:true,at:new Date(),list:[
        {created:'2026-10-12',job:'WPS261016',token:'a'.repeat(64),status:'Picked',slot:'2026-10-16T11:30',slotText:'Fri 16 Oct, 11:30',access:'Please use the keys',name:'Ray Sample',phone:'07700 900555',note:'',picked:'2026-10-12 19:02',detail:''}]};
      render(); }""")

h = H(1440, 900); pg = h.pg
h.go(""); setup(pg); h.go(""); real_look(pg); slots(pg); tile(pg, "due"); pg.wait_for_timeout(300)

# 1. The whole dashboard, numbered
badges(h, "n0_dashboard", [(".pt-ticker", 1, "tl"), ("button:has-text('Check everything now')", 2, "t"), (".d-tiles", 3), (".dn-card", 4), (".d-card >> nth=1", 5, "tr"), (".d-week", 6), (".d-panel", 7), (".side-nav", 8), (".side-tools", 9)], full=True)
# 2. Ticker close up
badges(h, "n1_ticker", [(".pt-ticker .pt-run >> nth=0 >> .pt-main >> nth=0", 1, "b"), (".pt-ticker .pt-run >> nth=0 >> .pt-src >> nth=0", 2, "b")], clip_sel=".page-head", pad=10)
# 3. Tiles
badges(h, "n2_tiles", [], clip_sel=".d-tiles", pad=16)
# 4. Do next with numbered parts
badges(h, "n3_donext", [(".dn-row >> nth=0 >> .dn-what", 1, "tl"), (".dn-row >> nth=1 >> .c-job", 2, "b"), (".dn-row >> nth=1 >> .d-acts button >> nth=0", 3, "b"), (".dn-row >> nth=1 >> .dn-park", 4, "tr")], clip_sel=".dn-card", pad=30)
# 5. Park one job, show the Parked line
pg.evaluate("parkJob('job_WPS261014', true)"); pg.wait_for_timeout(300)
badges(h, "n4_parked", [(".dn-parked button:has-text('Un-park')", 1, "tr")], clip_sel=".dn-card", pad=30)
pg.evaluate("parkJob('job_WPS261014', false)"); pg.wait_for_timeout(200)
HIDE_UNDO = "()=>{ const u=document.getElementById('undo-bar'); if(u) u.style.display='none'; }"
# 6. Mid-terms panel with a pick
tile(pg, "mid"); pg.wait_for_timeout(200); pg.evaluate(HIDE_UNDO)
badges(h, "n5_mid", [(".sl-set button:has-text('Change')", 1, "tr"), ("button.sl-ok >> nth=-1", 2, "t"), ("button:has-text('Decline') >> nth=-1", 3, "t"), ("button:has-text('Send slot link') >> nth=-1", 4, "t"), ("button:has-text('Check for picks now')", 5, "tr")], clip_sel=".d-panel", pad=30)
pg.evaluate("state.slotEdit=true; render()"); pg.wait_for_timeout(200)
badges(h, "n6_slotset", [(".sl-edit .sl-row >> nth=0", 1), (".sl-edit .sl-row >> nth=1", 2), (".sl-edit .sl-row >> nth=2", 3), (".sl-edit .sl-row >> nth=3", 4), (".sl-edit button:has-text('Save')", 5, "t")], clip_sel=".sl-edit", pad=34)
pg.evaluate("state.slotEdit=false; render()")
# 7. Awaiting payment: money owed by client
tile(pg, "paid")
badges(h, "n7_money", [], clip_sel=".d-panel")
# 8. Next 7 days with Route and Map toggle
tile(pg, "due")
badges(h, "n8_week", [(".wk-route >> nth=0", 1, "t"), (".wm-toggle button:has-text('Map')", 2, "t"), (".wk-add >> nth=0", 3, "tr")], clip_sel=".d-week", pad=30)
# 9. Plan my day (list part; the map needs the internet, so it isn't shown here)
pg.evaluate("()=>{ state.gcalToken=null; openPlan(isoToday(0)); }"); pg.wait_for_timeout(1500)
badges(h, "n9_plan", [(".plan-home button:has-text('Change')", 1, "tr"), (".pl-tot", 2, "tl"), (".pl-gm", 3, "tr")], clip_sel=".plan-list", pad=40)
pg.evaluate("()=>{ state.gcalToken='x'; }")
pg.evaluate("closePlan()"); pg.wait_for_timeout(200)
# 10. Sidebar More opened
pg.evaluate("state.moreTools=true; render()"); pg.wait_for_timeout(200)
badges(h, "n10_more", [(".side-moretools summary", 1), ("button:has-text('Export backup')", 2), ("label:has-text('Import backup')", 3), ("button:has-text('Calendar connected')", 4)], clip_sel=".side-tools", pad=6)
pg.evaluate("state.moreTools=false; render()")
# 11. Job Log list, then Board view
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200); real_look(pg)
badges(h,"j1_log",[(".status-strip",1),(".view-toggle",2),(".search-wrap",3,"t"),(".filter-select >> nth=0",4),("tr:has-text('WPS261007') .jt-status .sel-box",5,"t"),("tr:has-text('WPS261007') .jt-inv .sel-box",6,"t"),("tr:has-text('WPS261007') button[title^='Open and edit']",7,"t"),("tr:has-text('WPS261007') button[title^='Delete']",8,"b"),(".status-card:has-text('Finished')",10,"b")])
pg.evaluate("setView('board')"); pg.wait_for_timeout(300)
badges(h, "n11_board", [(".bd-head >> nth=0", 1, "t"), (".bd-card >> nth=0", 2, "tl"), (".bd-card >> nth=0 >> .bd-sel", 3, "tr")], clip_sel=".board", pad=30)
# 12. Help hints on: the new boxes
pg.evaluate("()=>{ state.helpOn=true; render(); }"); pg.wait_for_timeout(200)
h.shot("n12_help_board", el=".help-box")
pg.evaluate("setView('today')"); pg.wait_for_timeout(300)
h.shot("n13_help_dash", el=".help-box")
pg.evaluate("localStorage.setItem('wps_help_on_v1','0')")
print("errors:", [e for e in h.errors if "ERR_FAILED" not in e and "Failed to load resource" not in e][:8])
h.close()

# Phone
h = H(390, 844, mobile=True); pg = h.pg
h.go(""); setup(pg); h.go(""); real_look(pg); slots(pg); pg.wait_for_timeout(300)
badges(h, "n20_phone", [(".pt-ticker", 1, "b"), (".d-tiles", 2, "b"), (".dn-card h3", 3, "tr")])
badges(h, "m1_phone_dash", [("#syncBtn", 1), (".side-menu-btn", 2, "tr")], full=True)
pg.locator(".side-menu-btn").click(); pg.wait_for_timeout(200)
h.shot("m2_phone_menu")
pg.locator(".side-menu-btn").click(); pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(300)
h.shot("m3_phone_log")
print("phone errors:", [e for e in h.errors if "ERR_FAILED" not in e and "Failed to load resource" not in e][:8])
h.close()
