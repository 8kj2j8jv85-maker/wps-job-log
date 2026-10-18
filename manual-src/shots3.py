# 18 Oct 2026 screenshots: new Dashboard bits (counter, Performance, milestone, themes),
# Photo Tool (area finder) and Dictation (rooms from last visit). Made-up jobs only.
# Run: cd /home/claude/manual && ROOT=/home/claude/wps-job-log PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 shots3.py
import json, glob
from shotlib import H, badges, real_look
DATA=json.load(open("/home/claude/manual/fix/data.json"))

# ---------------- Dashboard: counter, Performance, themes
h=H(1440,900); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0'); localStorage.setItem('wps_milestones_seen_v1','[50,100,250,500,1000,2000,3000,\"wp\"]')"); h.go(""); real_look(pg)
badges(h,"c1_counter",[(".done-count",1,"tl")],clip_sel=".done-count",pad=16)
pg.locator(".d-tile:has-text('On time')").click(); pg.wait_for_timeout(900)
badges(h,"d6_turn",[(".perf-quote",1,"tl")],clip_sel=".d-panel")
badges(h,"t3_theme_row",[(".theme-row select",1,"tr")],clip_sel=".theme-row",pad=10)
for t in ("light","night"):
    pg.evaluate(f"localStorage.setItem('wps_theme_v1','{t}')"); h.go(""); real_look(pg); pg.wait_for_timeout(300)
    h.shot("t_"+t)
pg.evaluate("localStorage.setItem('wps_theme_v1','classic')")
h.close()

# milestone: 50 made-up finished reports
h=H(1440,900,seed=False); pg=h.pg
jobs=list(DATA["jobs"]); base=[j for j in jobs if j["status"]=="sent"][0]
for i in range(50):
    j=dict(base); j["id"]=f"job_MS{i}"; j["jobNo"]=f"WPS2609{i:02d}"; j["sentAt"]="2026-09-%02dT12:00:00Z"%(1+i%28); j["date"]="2026-09-%02d"%(1+i%28); jobs.append(j)
pg.add_init_script("""(()=>{ if(localStorage.getItem('__seeded')) return;
 localStorage.setItem('wps_standalone_jobs_v1', %s); localStorage.setItem('wps_standalone_clients_v1', %s); localStorage.setItem('wps_job_log_contacts_v1', %s);
 localStorage.setItem('wps_help_on_v1','0'); localStorage.setItem('__seeded','1'); })();""" % tuple(json.dumps(json.dumps(x)) for x in (jobs, DATA["clients"], DATA["contacts"])))
h.go(""); real_look(pg)
badges(h,"c2_milestone",[(".milestone .btn",1,"tl")],clip_sel=".milestone",pad=14)
h.close()

# ---------------- Photo Tool
h=H(1440,900); pg=h.pg
h.go("photos.html"); pg.evaluate("localStorage.setItem('wps_help_on_v1','1')"); h.go("photos.html")
h.shot("p1_start")
pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go("photos.html")
pg.set_input_files("#fileInput", sorted(glob.glob("photos/*.jpg"))); pg.wait_for_timeout(3000)
def mark(idx, room):
    pg.locator(".ph").nth(idx).click(); pg.wait_for_timeout(120)
    pg.locator(f"#panel .chip:text-is('{room}')").first.click(); pg.wait_for_timeout(120)
seq=["External picture","Entrance and Hallway",None,"Kitchen",None,None,"Living Room",None,"Bedroom 1",None,"Bathroom",None,"Meters","Keys"]
for i,r in enumerate(seq):
    if r: mark(i,r)
pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
badges(h,"p2_sets",[(".group >> nth=0 >> .pill-ok",1,"tr"),(".group >> nth=0 >> select[data-act='job']",2,"t"),(".group >> nth=0 >> input[data-act='jobNo']",3,"t"),(".group >> nth=0 >> .preview-name",4,"tl"),(".group >> nth=0 >> button[data-act='process']",5,"tl"),(".group >> nth=0 >> .gactions .pill",6,"tl"),(".group >> nth=0 >> .ph >> nth=1",7),("#sideBatch",8),("#btnAll",9)])
pg.locator(".group >> nth=1 >> .ph").nth(1).click(); pg.wait_for_timeout(300)
pg.fill("#areaFilter","bed"); pg.locator("#areaFilter").dispatch_event("input"); pg.wait_for_timeout(200)
badges(h,"p3_panel",[("#areaFilter",1,"tl"),("#areaChips",2,"tl"),("#panel button:has-text('Rotate left')",3,"t"),("#panel button:has-text('Remove photo')",4,"t"),("#panel button:has-text('Start a new job from here')",5,"t"),("#panel button:has-text('Close')",6,"tr")],clip_sel="#panel",pad=0)
pg.fill("#areaFilter",""); pg.locator("#areaFilter").dispatch_event("input")
pg.keyboard.press("Escape")
badges(h,"p4_set2",[(".group >> nth=1 >> .pill-warn",1),(".group >> nth=1 >> button:has-text('Merge with job above')",2,"tr")],clip_sel=".group >> nth=1 >> .ghead")
with pg.expect_download(): pg.locator(".group >> nth=0 >> button[data-act='process']").click()
pg.wait_for_function("document.querySelector('.linkrow input')", timeout=60000); pg.wait_for_timeout(2500)
print("after zip:", pg.locator(".group").count(), pg.locator(".ghead").count(), pg.locator(".linkrow").count(), h.dialogs[-2:])
badges(h,"p5_done",[(".linkrow input",1),("button:has-text('Copy link')",2,"tr")],clip_sel=".group >> nth=0 >> .ghead")
pg.locator("#lnkSettings").click(); pg.wait_for_timeout(300); pg.locator("#btnPreviewWm").click(); pg.wait_for_timeout(500)
badges(h,"p6_settings",[("#s_gap",1),("#s_wmtext",2),("#s_base",3),("#s_areas",4),("#btnSaveSettings",5,"tr")],clip_sel="#settingsCard")
print("photo errors:", [e for e in h.errors if "ERR_FAILED" not in e])
h.close()

# ---------------- Dictation (phone)
R=lambda n:{"name":n,"text":"x","clips":[]}
DSEED={"jobs":[{"id":"a1","jobNo":"WPS260950","type":"ICI","address":"Flat 7, Demo Court, 5 Fictional Street, E3 9ZF","created":1791536000000,"current":None,
  "rooms":[R("Entrance and Hallway"),R("Lounge"),R("Kitchen"),R("Bedroom 1"),R("Shower Room"),R("Keys")]}],"currentId":"a1",
  "settings":{"rooms":["External picture","Exterior","Entrance and Hallway","Lounge","Kitchen","Dining Room","Bedroom 1","Bedroom 2","Bedroom 3","Bathroom","En-suite","WC","Landing","Stairs","Garden","Electricity meter","Gas meter","Heat meter","Keys","General"],"corrections":[],"audio":False}}
h=H(390,844,mobile=True); pg=h.pg
h.go("dictate.html"); pg.evaluate("s=>{localStorage.setItem('wps-dictate-v1',JSON.stringify(s)); localStorage.setItem('wps_help_on_v1','1');}", DSEED); h.go("dictate.html")
pg.locator("#jobsBtn").click(); pg.locator("#newJob").click(); pg.wait_for_timeout(200)
pg.fill("#jobNo","WPS261006"); pg.select_option("#jobType","CO"); pg.fill("#jobAddr","Flat 7, Demo Court, 5 Fictional Street, E3 9ZF"); pg.locator("#jobAddr").dispatch_event("input"); pg.wait_for_timeout(200)
pg.locator("#jobNo").focus(); pg.locator("#jobNo").blur(); pg.wait_for_timeout(200)
pg.wait_for_timeout(4500); pg.evaluate("scrollTo(0,0)")
badges(h,"x5_lastvisit",[("#lastVisit",1,"tl"),("#chips .chip.next",2,"t"),("#allRooms",3,"b")],clip_sel="section.card:has(#chips)",pad=26)
pg.locator(".chip[data-room='Lounge']").click(); pg.wait_for_timeout(150)
pg.fill("#roomText","Carpet vacuumed. Two small marks to the wall by the window."); pg.locator("#roomText").dispatch_event("input")
pg.locator(".chip[data-room='Kitchen']").click(); pg.wait_for_timeout(150)
pg.fill("#roomText","Worktop clean. Light scratch to the sink drainer.\n- Oven not cleaned, grease to the door glass."); pg.locator("#roomText").dispatch_event("input")
pg.evaluate("scrollTo(0,0)")
badges(h,"x1_dictate",[("#helpBtn",1,"b"),("#jobsBtn",2,"b"),("#setBtn",3,"b"),(".dnav",6,"b"),("#jobCard",4),("#chips",5)],full=False)
pg.evaluate("scrollTo(0, document.querySelector('#roomCard').offsetTop-70)"); pg.wait_for_timeout(200)
badges(h,"x2_dictate_room",[("#mic",1,"tr"),("#roomText",2),("#copyBtn",3),("#shareBtn",4)])
pg.locator("#jobsBtn").click(); pg.wait_for_timeout(300)
h.shot("x3_dictate_jobs")
pg.locator("#jobsSheet [data-close]").click(); pg.locator("#setBtn").click(); pg.wait_for_timeout(300)
h.shot("x4_dictate_settings")
print("dictate errors:", [e for e in h.errors if "ERR_FAILED" not in e])
h.close()
