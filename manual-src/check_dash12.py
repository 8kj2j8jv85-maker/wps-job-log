from harness import H
import json, sys
ok=[]; bad=[]
def chk(n,c): (ok if c else bad).append(n); print(("PASS " if c else "FAIL ")+n)
W=int(sys.argv[1]) if len(sys.argv)>1 else 1920
Hh=int(sys.argv[2]) if len(sys.argv)>2 else 1080
h=H(W,Hh,mobile=W<600); pg=h.pg
h.go("")
jobs=pg.evaluate("JSON.parse(localStorage.getItem('wps_standalone_jobs_v1'))")
# add test jobs: booked, visit 2 days ago (should be 'to confirm'); processing visited 5 days ago (overdue)
base=dict(jobs[0]); 
def mk(i,status,date,time,typ="ICI"):
    j=dict(base); j.update(id="t"+str(i), jobNo="WPS26T0"+str(i), status=status, date=date, time=time, type=typ, address="Flat %d, Test House"%i, postcode="E3 9ZF", photoLink="")
    for k in ("sentAt","processingAt","reminderAt","reissuedAt","deemedAt","invoice"): j.pop(k,None)
    return j
jobs += [mk(1,"booked","2026-10-11","10:00"), mk(2,"processing","2026-10-08","10:00")]
pg.evaluate("j=>{localStorage.setItem('wps_standalone_jobs_v1', JSON.stringify(j)); location.reload();}", jobs); pg.wait_for_timeout(700)
tile=pg.locator(".d-tile").first.inner_text().replace("\n"," | "); print("tile:",tile)
chk("tile shows visits to confirm", "to confirm" in tile)
pg.locator(".d-tile").first.click(); pg.wait_for_timeout(100)
panel=pg.locator(".d-panel").inner_text(); print(panel[:600].replace("\n"," | "))
chk("panel has confirm section", "still at Booked" in panel)
chk("booked test job in confirm section, not as overdue", "WPS26T01" in panel)
# Job Log overdue count excludes booked
ovd=pg.evaluate("state.jobs.filter(j=>{const d=dueInfo(j);return d&&d.late}).map(j=>j.jobNo)"); print("late:",ovd)
chk("booked job not counted late", "WPS26T01" not in ovd)
chk("processing job counted late", "WPS26T02" in ovd)
# mark visited
pg.locator(".d-mv").first.click(); pg.wait_for_timeout(150)
j1=pg.evaluate("state.jobs.find(j=>j.id==='t1')"); print("t1:",j1["status"],j1.get("processingAt"))
chk("mark visited -> processing", j1["status"]=="processing")
chk("processingAt = visit time", (j1.get("processingAt") or "").startswith("2026-10-11T09:00"))
chk("undo bar shown", pg.locator("#undo-bar.show").count()==1)
if W<600: h.shot("undo_phone")
pg.locator("#undo-bar button:has-text('Undo')").click(); pg.wait_for_timeout(150)
j1=pg.evaluate("state.jobs.find(j=>j.id==='t1')")
chk("undo restores booked, no processingAt", j1["status"]=="booked" and "processingAt" not in j1)
saved=pg.evaluate("JSON.parse(localStorage.getItem('wps_standalone_jobs_v1')).find(j=>j.id==='t1').status")
chk("undo saved to storage", saved=="booked")
# pill click + undo on a sent job (dates must come back)
sj=pg.evaluate("state.jobs.find(j=>j.status==='sent' && j.sentAt)"); 
pg.evaluate("id=>cycleStatus(id)", sj["id"]); pg.wait_for_timeout(100)
mid=pg.evaluate("id=>state.jobs.find(j=>j.id===id).status", sj["id"])
pg.locator("#undo-bar button:has-text('Undo')").click(); pg.wait_for_timeout(100)
aft=pg.evaluate("id=>state.jobs.find(j=>j.id===id)", sj["id"])
chk("pill moved then undo restored status + sentAt", mid=="signed" and aft["status"]=="sent" and aft.get("sentAt")==sj.get("sentAt"))
# undo bar auto hides
pg.evaluate("id=>cycleStatus(id)", sj["id"]); pg.clock.run_for(9000); pg.wait_for_timeout(100)
chk("undo bar hides after 8s", pg.locator("#undo-bar.show").count()==0)
pg.evaluate("id=>{const j=state.jobs.find(x=>x.id===id); j.status='sent'; saveJobs(); render();}", sj["id"])
# auto refresh across midnight
before=pg.locator(".d-card").first.inner_text().split("\n")[0]
pg.clock.run_for(3*60*1000+1000); pg.wait_for_timeout(200)
chk("still fine after a 3-min tick", pg.locator(".d-tiles").count()==1)
pg.clock.fast_forward("24:00:00"); pg.clock.run_for(3*60*1000+1000); pg.wait_for_timeout(300)
today=pg.evaluate("isoToday(0)"); print("today now", today)
wk=pg.locator(".d-wk .wk-head").first.inner_text(); print("first week day:", wk)
chk("week strip moved on a day after midnight", "15" in wk)
# no refresh while form open
pg.locator(".d-add").first.click(); pg.wait_for_timeout(150)
pg.fill("#f_notes","typing in progress")
pg.locator("#f_notes").evaluate("e=>e.blur()")
pg.clock.run_for(3*60*1000+1000); pg.wait_for_timeout(200)
chk("form survives auto refresh", pg.locator("#f_notes").count()==1 and pg.locator("#f_notes").input_value()=="typing in progress")
sw=pg.evaluate("document.documentElement.scrollWidth"); print("scrollWidth",sw,"viewport",W)
chk("no sideways scroll", sw<=W)
print("errors:", [e for e in h.errors if "ERR_FAILED" not in e])
chk("no page errors", not [e for e in h.errors if "ERR_FAILED" not in e])
pg.locator("text=Cancel").last.click(); pg.wait_for_timeout(100)
pg.locator(".d-tile").first.click(); pg.wait_for_timeout(100)
h.shot("dash12_%d"%W)
print("PASS",len(ok),"FAIL",len(bad),bad)
h.close()
