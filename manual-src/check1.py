from harness import H
import sys
h=H(); pg=h.pg; ok=[]; bad=[]
def chk(name, cond): (ok if cond else bad).append(name); print(("PASS " if cond else "FAIL ")+name)
h.go("")
t=pg.inner_text("body")
chk("dashboard loads with title", "Wellington Dashboard" in t)
tiles=pg.locator(".d-tile").all_inner_texts(); print(tiles)
chk("10 tiles", len(tiles)==10)
for i,tl in enumerate(tiles):
    pg.locator(".d-tile").nth(i).click(); pg.wait_for_timeout(100)
    chk("tile click "+tl.split("\n")[1], pg.locator(".d-panel h3").inner_text()!="")
chk("today shows 2 jobs", "2 jobs" in pg.locator(".d-card").first.inner_text())
chk("today's route link", pg.locator("a.d-route").count()==1)
# status pill on dashboard
pg.locator(".d-tile").nth(0).click()
before=pg.locator(".d-panel .pill").first.inner_text()
pg.locator(".d-panel .pill").first.click(); pg.wait_for_timeout(100)
print("pill",before,"->",pg.locator(".d-panel").inner_text()[:200].replace("\n"," | "))
# + on week strip
pg.locator(".d-add").first.click(); pg.wait_for_timeout(200)
chk("+ on week opens new job form with date", pg.locator("#f_date").input_value()=="2026-10-14")
pg.locator("text=Cancel").last.click()
# new job flow
pg.locator("button:has-text('+ New job')").first.click(); pg.wait_for_timeout(200)
jn=pg.locator("#f_jobNo").input_value(); print("suggested jobno",jn)
pg.fill("#extractRaw","Please book an Inventory and Check In at Flat 5, 10 Example Road, London E3 9ZZ on 21/10/2026 at 10am. Tenant: Max Sample")
pg.locator("button:has-text(\"Extract job details\")").click(); pg.wait_for_timeout(150)
chk("extract postcode", pg.locator("#f_postcode").input_value()=="E3 9ZZ")
chk("extract date", pg.locator("#f_date").input_value()=="2026-10-21")
print("extract addr/town:", pg.locator("#f_address").input_value(),"|",pg.locator("#f_town").input_value())
pg.select_option("#f_clientSelect","__add_new__"); pg.wait_for_timeout(150)
pg.fill("#newClientInput","Trial Homes"); pg.locator("button:has-text('Add agent')").click(); pg.wait_for_timeout(150)
chk("new agent added", pg.locator("#f_clientSelect").input_value()=="Trial Homes")
pg.locator("button:has-text(\"agent contact details\")").click(); pg.fill("#ac_name","Kim Example"); pg.locator("button:has-text(\"Save agent details\")").click(); pg.wait_for_timeout(100)
chk("agent contact saved", "Kim Example" in pg.inner_text(".form-card"))
pg.fill("#f_time","10:00"); pg.fill("#f_tenantEmails","max@example.com; bad, sam@example.com")
pg.locator("button:has-text('Save job')").click(); pg.wait_for_timeout(200)
jobs=pg.evaluate("JSON.parse(localStorage.getItem('wps_standalone_jobs_v1'))")
new=[j for j in jobs if j["postcode"]=="E3 9ZZ"]
chk("job saved", len(new)==1); print(new and {k:new[0][k] for k in ("jobNo","client","date","time","tenantEmails","type")})
# Job Log
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200)
chk("job log list", pg.locator(".tablewrap tr").count()>10)
cards=pg.locator(".status-card").all_inner_texts(); print([c.replace("\n"," ") for c in cards])
pg.locator(".status-card:has-text('Reports overdue')").click(); pg.wait_for_timeout(100)
print("overdue rows", pg.locator(".tablewrap tbody tr").count())
pg.locator(".status-card:has-text('Reports overdue')").click()
pg.fill(".search-wrap input","Trial"); pg.wait_for_timeout(100)
print("search rows", pg.locator(".tablewrap tbody tr").count()); pg.fill(".search-wrap input","")
# invoice pill cycle
row=pg.locator("tr:has-text('WPS261003')")
inv=row.locator(".jt-inv .pill"); a=inv.inner_text(); inv.click(); b=pg.locator("tr:has-text('WPS261003') .jt-inv .pill").inner_text(); print("invoice",a,"->",b)
chk("invoice pill moves", a!=b)
# status pill
st=pg.locator("tr:has-text('WPS261008') .jt-status .pill"); a=st.inner_text(); st.click(); b=pg.locator("tr:has-text('WPS261008') .jt-status .pill").inner_text(); print("status",a,"->",b)
chk("status pill moves", a!=b)
# edit + save
pg.locator("tr:has-text('WPS261011') button[title^='Open and edit']").click(); pg.wait_for_timeout(150)
pg.fill("#f_notes","Key from office"); pg.locator("button:has-text(\"Save changes\")").click(); pg.wait_for_timeout(150)
chk("edit saved", "Key from office" in pg.evaluate("localStorage.getItem('wps_standalone_jobs_v1')"))
# reissue button on a sent ICI
pg.locator("tr:has-text('WPS261004') button[title^='Open and edit']").click(); pg.wait_for_timeout(150)
chk("re-issue button shows on sent ICI", pg.locator("button:has-text(\"Re-issued today\")").count()==1)
pg.locator("text=Cancel").last.click()
# delete
n0=pg.locator(".tablewrap tbody tr").count()
pg.locator("tr:has-text('Trial Homes') button[title^='Delete this job']").click(); pg.wait_for_timeout(150)
chk("delete works (confirm shown)", pg.locator(".tablewrap tbody tr").count()==n0-1)
# calendar
pg.locator(".view-toggle button:has-text('Calendar')").click(); pg.wait_for_timeout(150)
chk("calendar shows", pg.locator(".cal-cell").count()>27)
pg.locator("text=Next →").click(); pg.locator("button:has-text('Today')").first.click()
pg.locator(".cal-job-pill").first.click(); pg.wait_for_timeout(100)
chk("calendar pill opens job", pg.locator(".form-card").count()==1)
# export
with pg.expect_download() as d: pg.locator("button:has-text('Export backup')").click()
chk("export backup downloads", d.value.suggested_filename.endswith(".json"))
# sync without google
pg.locator("button:has-text('Sync now (Google Sheet)')").click(); pg.wait_for_timeout(300)
print("sync msg w/o google:", pg.locator("#cloudPill").inner_text())
pg.locator("button:has-text('Check for new bookings')").first.click(); pg.wait_for_timeout(300)
print("bookings w/o google:", pg.inner_text("body")[:0], pg.locator(".tray").count(), pg.locator("button:has-text('Check')").first.inner_text())
print("dialogs:",h.dialogs); print("errors:",h.errors)
print("PASS",len(ok),"FAIL",len(bad),bad)
h.close()
