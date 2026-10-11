from harness import H
def chk(n,c): print(("PASS " if c else "FAIL ")+n)
h=H(390,844,mobile=True); pg=h.pg
h.go("dictate.html")
chk("dictation loads", "Dictation" in pg.inner_text("header"))
pg.fill("#jobNo","WPS261006"); pg.select_option("#jobType","CO"); pg.fill("#jobAddr","Flat 7, Demo Court, 5 Fictional Street, E3 9ZF")
pg.locator(".chip[data-room='Kitchen']").click(); pg.wait_for_timeout(150)
pg.fill("#roomText","Worktop clean. Light scratch to sink drainer. Oven not cleaned, grease to door glass.")
pg.locator("#roomText").dispatch_event("input")
pg.locator(".chip[data-room='Lounge']").click(); pg.wait_for_timeout(150)
pg.fill("#roomText","Carpet vacuumed. Two small marks to wall by window."); pg.locator("#roomText").dispatch_event("input")
print("sum:", pg.inner_text("#sum"))
pg.locator("#mic").click(); pg.wait_for_timeout(300); print("mic status headless:", pg.inner_text("#status"))
pg.locator("#copyBtn").click(); pg.wait_for_timeout(300); print("toast:", pg.inner_text("#toast"))
pg.locator("#jobsBtn").click(); pg.wait_for_timeout(200); print("jobs sheet:", pg.inner_text("#jobList")[:120].replace("\n"," "))
sw=pg.evaluate("document.documentElement.scrollWidth"); chk("dictation no sideways scroll at 390", sw<=390)
for path,name in [("","dashboard"),("photos.html","photo tool")]:
    h.go(path); sw=pg.evaluate("document.documentElement.scrollWidth"); print(name,"scrollWidth at 390:",sw); chk(name+" no sideways scroll", sw<=391)
h.go(""); pg.locator(".side-menu-btn").click(); pg.wait_for_timeout(150)
chk("phone menu opens", pg.locator(".side-more.open").count()==1)
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(150)
sw=pg.evaluate("document.documentElement.scrollWidth"); chk("job log phone no sideways scroll", sw<=391); print(sw)
pg.locator("button:has-text('+ New job')").click(); pg.wait_for_timeout(150)
sw=pg.evaluate("document.documentElement.scrollWidth"); chk("job form phone fits", sw<=391); print(sw)
print("errors:",[e for e in h.errors if "ERR_FAILED" not in e]); h.close()
h=H(820,1180,mobile=True); pg=h.pg
for path,name in [("","dashboard"),("photos.html","photo tool"),("dictate.html","dictation")]:
    h.go(path); sw=pg.evaluate("document.documentElement.scrollWidth"); print("tablet",name,sw); chk("tablet "+name+" fits", sw<=821)
h.close()
