from harness import H
from PIL import Image, ImageDraw, ImageFont
import json, glob
FB="/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"
def badges(h, name, items, full=False, clip_sel=None, pad=34):
    pg=h.pg; dpr=pg.evaluate("devicePixelRatio"); sy=pg.evaluate("scrollY")
    boxes=[]
    for sel,num,*pos in items:
        loc=pg.locator(sel).first
        try: b=loc.bounding_box(timeout=4000)
        except Exception: b=None
        if not b: print("MISSING",name,sel); continue
        boxes.append((b,num,pos[0] if pos else "tl"))
    clip=None
    if clip_sel:
        cb=pg.locator(clip_sel).first.bounding_box()
        clip=dict(x=max(cb["x"]-pad,0),y=max(cb["y"]+sy-pad,0),width=cb["width"]+2*pad,height=cb["height"]+2*pad)
        full=True
    path=f"shots/{name}.png"
    pg.screenshot(path=path, full_page=full, clip=clip)
    im=Image.open(path).convert("RGB"); d=ImageDraw.Draw(im)
    ox=clip["x"] if clip else 0
    oy=(clip["y"]-sy) if clip else (-sy if full else 0)
    r=int(14*dpr); f=ImageFont.truetype(FB,int(16*dpr))
    for b,num,pos in boxes:
        x=(b["x"]-ox)*dpr; y=(b["y"]-oy)*dpr; w=b["width"]*dpr; hh=b["height"]*dpr
        if pos=="tl": x-=r+3*dpr; y+=min(hh/2, r)
        elif pos=="tr": x+=w+r+3*dpr; y+=min(hh/2, r)
        elif pos=="t": x+=w/2; y-=r*0.55
        elif pos=="b": x+=w/2; y+=hh+r*0.55
        elif pos=="in": x+=r+2; y+=r+2
        cx,cy=max(r+2,min(im.width-r-2,x)),max(r+2,min(im.height-r-2,y))
        d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=(224,104,75),outline=(255,255,255),width=int(2*dpr))
        d.text((cx,cy),str(num),font=f,fill=(255,255,255),anchor="mm")
    im.save(path); return path

def real_look(pg):
    pg.evaluate("""()=>{ state.gcalConnected=true; state.helpOn=false; setCloud('saved'); render(); }""")

h=H(1440,900); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go(""); real_look(pg)
badges(h,"d1_dashboard",[(".side-nav",1),(".side-links",2),(".side-tools",3),("button:has-text('Check for new bookings')",4),("button:has-text('+ New job')",5),(".d-tiles",6),(".d-card >> nth=0",7),(".d-card >> nth=1",8),(".d-panel",9)])
# tiles crop
badges(h,"d2_tiles",[],clip_sel=".d-tiles")
# comment windows panel
pg.locator(".d-tile").nth(3).click(); pg.wait_for_timeout(150)
badges(h,"d3_windows",[("button:has-text('Reminder due')",1,"tr")],clip_sel=".d-panel")
# amendments panel injected
pg.evaluate("""()=>{ state.amend={loaded:true,at:new Date(),autoRem:{},jobs:[{job:'WPS261005',address:'Flat 2, Sample House, 40 Example Way, E15 9ZE',first:'2026-10-10 18:22',names:new Set(['Pat Sample (Tenant)']),points:3,decided:1}]}; render(); }""")
pg.locator(".d-tile").nth(3).click(); pg.wait_for_timeout(150)
badges(h,"d4_windows_hold",[],clip_sel=".d-panel")
pg.locator(".d-tile").nth(4).click(); pg.wait_for_timeout(150)
badges(h,"d5_amend",[("a:has-text('Open review page') >> nth=0",1)],clip_sel=".d-panel")
pg.locator(".d-tile").nth(9).click(); pg.wait_for_timeout(150)
badges(h,"d6_turn",[],clip_sel=".d-panel")
# booking tray
pg.evaluate("""()=>{ state.queue=[
 {id:'q1',kind:'new',type:'ICI',client:'Example Lettings',date:'2026-10-20',time:'10:00',address:'Flat 8, Sample Court, 2 Test Street',town:'London',postcode:'E3 9ZR',tenants:'Max Example 07700 900456',summary:'New inventory & check-in booked for Tue 20 Oct, 10am.',sourceFrom:'Example Lettings <bookings@example.com>',sourceSubject:'Works order: Flat 8, Sample Court',sourceUrl:'https://mail.google.com/'},
 {id:'q2',kind:'update',type:'MTI',client:'Sample Estates',date:'2026-10-16',time:'14:00',address:'22 Dummy Crescent',town:'London',postcode:'E6 9ZM',summary:'Agent asks to move the mid-term to Fri 16 Oct, 2pm.',sourceFrom:'Sample Estates <office@example.org>',sourceSubject:'RE: Mid-term 22 Dummy Crescent',sourceUrl:'https://mail.google.com/'},
 {id:'q3',kind:'cancel',type:'SOC',client:'Example Lettings',date:'2026-10-17',address:'Unit 5, Test Wharf',town:'London',postcode:'E16 9ZN',summary:'Landlord has cancelled the schedule of condition.',sourceFrom:'Example Lettings <bookings@example.com>',sourceSubject:'Cancelled: Unit 5 Test Wharf',sourceUrl:'https://mail.google.com/'}];
 state.queueChecked=true; state.queueCheckedAt=new Date(); render(); }""")
badges(h,"d7_tray",[(".qcard >> nth=0 >> button:has-text('Add to log')",1,"t"),(".qcard >> nth=0 >> button:has-text('Edit & add')",2,"t"),(".qcard >> nth=1 >> button:has-text('Apply change')",3,"t"),(".qcard >> nth=1 >> button:has-text('Edit first')",4,"t"),(".qcard >> nth=2 >> button:has-text('Delete cancelled job')",5,"t"),(".qcard >> nth=0 >> button:has-text('Dismiss')",6,"t"),(".qcard >> nth=0 >> a:has-text('Open email')",7,"t")],clip_sel=".tray")
pg.evaluate("()=>{state.queueChecked=false; state.queue=[]; render();}")
# Job Log
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200); real_look(pg)
badges(h,"j1_log",[(".status-strip",1),(".view-toggle",2),(".search-wrap",3,"t"),(".filter-select >> nth=0",4),("tr:has-text('WPS261007') .jt-status .pill",5,"t"),("tr:has-text('WPS261007') .jt-inv .pill",6,"t"),("tr:has-text('WPS261007') button[title^='Open and edit']",7,"t"),("tr:has-text('WPS261007') button[title^='Delete']",8,"b"),("tr:has-text('WPS261007') button[title*='calendar']",9,"t")])
# form
pg.locator("button:has-text('+ New job')").click(); pg.wait_for_timeout(200)
pg.fill("#extractRaw","Hi Lex, please can you book an Inventory and Check In for 21/10/2026 at 10am.\nFlat 5, 10 Example Road, London E3 9ZZ\nTenant: Max Sample")
pg.locator("button:has-text('Extract job details')").click(); pg.wait_for_timeout(200)
pg.select_option("#f_clientSelect","Example Lettings"); pg.wait_for_timeout(150)
pg.fill("#f_time","10:00"); pg.fill("#f_tenants","Max Sample 07700 900789"); pg.fill("#f_tenantEmails","max.sample@example.com")
pg.select_option("#f_propertyType","Flat"); pg.select_option("#f_bedrooms","2")
badges(h,"j2_form",[(".extract-box",1),("#f_jobNo",2),("#f_status",3),("#f_invoice",4),("#f_clientSelect",5),(".agent-contact-box",6),("#f_tenantEmails",7),("#f_agentEmail",8),("button:has-text('Save job')",9,"tr")],clip_sel=".form-card")
pg.locator("button:has-text('Cancel')").last.click()
# reissue
pg.locator("tr:has-text('WPS261004') button[title^='Open and edit']").click(); pg.wait_for_timeout(200)
badges(h,"j3_reissue",[("button:has-text('Re-issued today')",1,"tr")],clip_sel=".field-grid")
pg.locator("button:has-text('Cancel')").last.click()
# calendar
pg.locator(".view-toggle button:has-text('Calendar')").click(); pg.wait_for_timeout(200)
badges(h,"j4_calendar",[("button:has-text('← Prev')",1),("button.btn:has-text('Today')",2),(".cal-cell-today",3),(".cal-job-pill >> nth=0",4)],clip_sel=".cal-wrap")
# help-on views
pg.evaluate("()=>{state.helpOn=true; render();}")
pg.locator(".view-toggle button:has-text('List')").click(); pg.wait_for_timeout(150)
pg.locator(".side-nav a:has-text('Dashboard')").click(); pg.wait_for_timeout(200)
h.shot("h1_help_dash")
badges(h,"h2_help_sidebar",[("button:has-text('Help hints')",1),("a:has-text('Manual')",2)],clip_sel=".side-tools",pad=4)
pg.mouse.move(*[v+10 for v in (lambda b:(b['x'],b['y']))(pg.locator(".d-tile").nth(6).bounding_box())]); pg.wait_for_timeout(1500)
pg.evaluate("localStorage.setItem('wps_help_on_v1','0')")
h.close()

# ---------------- Photo Tool
h=H(1440,900); pg=h.pg
h.go("photos.html"); pg.evaluate("localStorage.setItem('wps_help_on_v1','1')"); h.go("photos.html")
h.shot("p1_start")
pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go("photos.html")
pg.set_input_files("#fileInput", sorted(glob.glob("photos/*.jpg"))); pg.wait_for_timeout(3000)
# mark rooms on set 1
def mark(idx, room):
    pg.locator(".ph").nth(idx).click(); pg.wait_for_timeout(120)
    pg.locator(f"#panel .chip:text-is('{room}')").first.click(); pg.wait_for_timeout(120)
seq=["External picture","Entrance and Hallway",None,"Kitchen",None,None,"Living Room",None,"Bedroom 1",None,"Bathroom",None,"Meters","Keys"]
for i,r in enumerate(seq):
    if r: mark(i,r)
pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
badges(h,"p2_sets",[(".group >> nth=0 >> .pill-ok",1,"tr"),(".group >> nth=0 >> select[data-act='job']",2,"t"),(".group >> nth=0 >> input[data-act='jobNo']",3,"t"),(".group >> nth=0 >> .preview-name",4,"tl"),(".group >> nth=0 >> button[data-act='process']",5,"tl"),(".group >> nth=0 >> .gactions .pill",6,"tl"),(".group >> nth=0 >> .ph >> nth=1",7),("#sideBatch",8),("#btnAll",9)])
# panel open on a photo of set 2
pg.locator(".group >> nth=1 >> .ph").nth(1).click(); pg.wait_for_timeout(300)
badges(h,"p3_panel",[("#panel .chips",1),("#customArea",2),("#panel button:has-text('Rotate left')",3,"t"),("#panel button:has-text('Remove photo')",4,"t"),("#panel button:has-text('Start a new job from here')",5,"t"),("#panel button:has-text('Close')",6,"tr")],clip_sel="#panel",pad=0)
pg.keyboard.press("Escape")
badges(h,"p4_set2",[(".group >> nth=1 >> .pill-warn",1),(".group >> nth=1 >> button:has-text('Merge with job above')",2,"tr")],clip_sel=".group >> nth=1 >> .ghead")
with pg.expect_download(): pg.locator(".group >> nth=0 >> button[data-act='process']").click()
pg.wait_for_function("document.querySelector('.linkrow input')", timeout=60000); pg.wait_for_timeout(800)
badges(h,"p5_done",[(".linkrow input",1),("button:has-text('Copy link')",2,"tr")],clip_sel=".group >> nth=0 >> .ghead")
pg.locator("#lnkSettings").click(); pg.wait_for_timeout(300); pg.locator("#btnPreviewWm").click(); pg.wait_for_timeout(500)
badges(h,"p6_settings",[("#s_gap",1),("#s_wmtext",2),("#s_base",3),("#s_areas",4),("#btnSaveSettings",5,"tr")],clip_sel="#settingsCard")
h.close()

# zip contents for manual
import zipfile

# ---------------- phone
h=H(390,844,mobile=True); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go(""); real_look(pg)
badges(h,"m1_phone_dash",[("#syncBtn",1),(".side-menu-btn",2,"tr")],full=True)
pg.locator(".side-menu-btn").click(); pg.wait_for_timeout(200)
h.shot("m2_phone_menu")
pg.locator(".side-menu-btn").click(); pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200)
h.shot("m3_phone_log")
pg.evaluate("localStorage.setItem('wps_help_on_v1','1')")
h.go("dictate.html")
pg.fill("#jobNo","WPS261006"); pg.select_option("#jobType","CO"); pg.fill("#jobAddr","Flat 7, Demo Court, 5 Fictional Street, E3 9ZF"); pg.locator("#jobAddr").dispatch_event("input")
pg.locator(".chip[data-room='Lounge']").click(); pg.wait_for_timeout(150)
pg.fill("#roomText","Carpet vacuumed. Two small marks to the wall by the window."); pg.locator("#roomText").dispatch_event("input")
pg.locator(".chip[data-room='Kitchen']").click(); pg.wait_for_timeout(150)
pg.fill("#roomText","Worktop clean. Light scratch to the sink drainer.\n- Oven not cleaned, grease to the door glass."); pg.locator("#roomText").dispatch_event("input")
pg.evaluate("scrollTo(0,0)")
badges(h,"x1_dictate",[("#helpBtn",1,"b"),("#jobsBtn",2,"b"),("#setBtn",3,"b"),("a.home",6,"b"),("#jobCard",4),("#chips",5)],full=False)
pg.evaluate("scrollTo(0, document.querySelector('#roomCard').offsetTop-70)"); pg.wait_for_timeout(200)
badges(h,"x2_dictate_room",[("#mic",1,"tr"),("#roomText",2),("#copyBtn",3),("#shareBtn",4)])
pg.locator("#jobsBtn").click(); pg.wait_for_timeout(300)
h.shot("x3_dictate_jobs")
pg.locator("#jobsSheet [data-close]").click(); pg.locator("#setBtn").click(); pg.wait_for_timeout(300)
h.shot("x4_dictate_settings")
h.close()
