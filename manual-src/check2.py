from harness import H
import glob, zipfile, io
h=H(); pg=h.pg
def chk(n,c): print(("PASS " if c else "FAIL ")+n)
h.go("photos.html")
chk("photo tool loads, sees Job Log jobs", pg.locator("#jobsNote").is_hidden())
files=sorted(glob.glob("/home/claude/manual/photos/*.jpg"))
pg.set_input_files("#fileInput", files); pg.wait_for_timeout(2500)
print(pg.inner_text("#loadMsg")); print(pg.inner_text("#summary").replace("\n"," "))
heads=pg.locator(".ghead").all_inner_texts()
for x in heads: print("GROUP:", x.replace("\n"," | ")[:260])
chk("two jobs split", len(heads)==2)
# open first photo, set area chips
pg.locator(".ph").first.click(); pg.wait_for_timeout(200)
chk("photo panel opens", pg.locator("#panel").is_visible())
pg.locator("#panel .chip:has-text('External picture')").first.click(); pg.wait_for_timeout(100)
pg.locator("#panel .chip:has-text('Entrance and Hallway')").first.click(); pg.wait_for_timeout(100)
pg.keyboard.press("ArrowRight"); pg.keyboard.press("r"); pg.wait_for_timeout(100)
pg.keyboard.press("Escape")
# group 2: pick job from dropdown
sel=pg.locator("select[data-act='job']").nth(1)
opts=sel.locator("option").all_inner_texts(); print("dropdown:", opts[:6])
h.ctx.pages[0]
# open Job Log in a second tab BEFORE processing, to test photo link handoff
jl=h.ctx.new_page(); jl.goto("http://localhost:8765/"); jl.wait_for_timeout(400)
with pg.expect_download() as d:
    pg.locator("button:has-text('Process & download zip')").first.click()
z=d.value; print("zip name:", z.suggested_filename)
pg.wait_for_function("document.querySelector('.linkrow input')", timeout=60000)
zf=zipfile.ZipFile(z.path()); names=zf.namelist(); print(len(names), names[:4])
link=pg.locator(".linkrow input").first.input_value() if pg.locator(".linkrow input").count() else ""
print("link:", link)
import json
def joblink(page): return [j.get("photoLink") for j in page.evaluate("JSON.parse(localStorage.getItem('wps_standalone_jobs_v1'))") if j["jobNo"]=="WPS261006"]
print("storage photoLink after process:", joblink(pg))
# now make a change in the already-open Job Log tab
jl.locator(".d-tile").nth(7).click(); jl.wait_for_timeout(100)
jl.locator(".side-nav a:has-text('Job Log')").click(); jl.wait_for_timeout(100)
jl.locator("tr:has-text('WPS261003') .jt-inv .pill").click(); jl.wait_for_timeout(200)
print("photoLink after a change in the open Job Log tab:", joblink(jl))
print("photos-not-done tile in open tab:", jl.locator(".side-nav a:has-text('Dashboard')").click() or jl.locator(".d-tile").nth(6).inner_text().replace("\n"," "))
# settings
pg.locator("#lnkSettings").click(); pg.wait_for_timeout(200)
pg.locator("#btnPreviewWm").click(); pg.wait_for_timeout(300)
chk("watermark preview", pg.locator("#wmPreview canvas").count()==1)
# check a processed image carries a watermark-sized file
print("dialogs:",h.dialogs); print("errors:",[e for e in h.errors if "ERR_FAILED" not in e])
h.close()
