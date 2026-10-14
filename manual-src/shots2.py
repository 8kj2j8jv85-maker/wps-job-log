# Screenshots for the 14 Oct 2026 manual: Dashboard, Job Log and phone (made-up jobs only).
# Photo Tool and Dictation pictures are unchanged from 12 Oct (those pages haven't changed since).
# Run: cd /home/claude/manual && ROOT=/home/claude/wps-job-log python3 shots2.py
import os
os.environ.setdefault("CLOCK", "2026-10-13T15:00:00+01:00")
from shotlib import H, badges, real_look

def tile(pg, key):
    pg.evaluate(f"setDashPanel('{key}')"); pg.wait_for_timeout(150)

h=H(1440,900); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go(""); real_look(pg)
tile(pg,"due")
badges(h,"d1_dashboard",[(".side-nav",1),(".side-links",2),(".side-tools",3),("button:has-text('Refresh all')",4,"t"),("button:has-text('+ New job')",5,"t"),(".d-tiles",6),(".d-card >> nth=0",7),(".d-card >> nth=1",8),(".d-panel",9)])
badges(h,"d2_tiles",[],clip_sel=".d-tiles")
# Reports due panel: Mark visited / Rearrange
badges(h,"d8_due",[("button:has-text('Mark visited') >> nth=0",1,"t"),("button:has-text('Rearrange') >> nth=0",2,"t")],clip_sel=".d-panel")
# Rearrange panel open
pg.evaluate("openRearrange('job_WPS261006')"); pg.wait_for_timeout(200)
badges(h,"d9_rearrange",[("#rr_date",1,"t"),("#rr_email",2),("#rr_box button:has-text('Save')",3,"t")],clip_sel="#rr_box",pad=14)
pg.evaluate("closeRearrange()")
# Comment windows
tile(pg,"win")
badges(h,"d3_windows",[("button:has-text('Reminder due')",1,"tr")],clip_sel=".d-panel")
pg.evaluate("""()=>{ state.amend={loaded:true,at:new Date(),autoRem:{},jobs:[{job:'WPS261005',address:'Flat 2, Sample House, 40 Example Way, E15 9ZE',first:'2026-10-10 18:22',names:new Set(['Pat Sample (Tenant)']),points:3,decided:1}]}; render(); }""")
tile(pg,"win")
badges(h,"d4_windows_hold",[],clip_sel=".d-panel")
tile(pg,"amend")
badges(h,"d5_amend",[("a:has-text('Open review page') >> nth=0",1)],clip_sel=".d-panel")
tile(pg,"turn")
badges(h,"d6_turn",[],clip_sel=".d-panel")
# Awaiting payment with Paid button, then the undo bar
tile(pg,"paid")
badges(h,"d10_paid",[("button.d-mv:has-text('Paid') >> nth=0",1,"t")],clip_sel=".d-panel")
pg.locator("button.d-mv:has-text('Paid')").first.click(); pg.wait_for_timeout(400)
badges(h,"d11_undo",[],clip_sel="#undo-bar",pad=10)
pg.locator("#undo-bar button:has-text('Undo')").click(); pg.wait_for_timeout(200)
# Booking tray including a Tide invoice card
pg.evaluate("""()=>{ state.queue=[
 {id:'q1',kind:'new',type:'ICI',client:'Example Lettings',date:'2026-10-20',time:'10:00',address:'Flat 8, Sample Court, 2 Test Street',town:'London',postcode:'E3 9ZR',tenants:'Max Example 07700 900456',tenantList:[{name:'Max Example',phone:'07700 900456',email:'max.example@example.com'}],copyTo:'alex@example.com',copyToName:'Alex Sample',summary:'New inventory & check-in booked for Tue 20 Oct, 10am.',sourceFrom:'Alex Sample (Example Lettings)',sourceSubject:'Works order: Flat 8, Sample Court',sourceUrl:'https://mail.google.com/'},
 {id:'q2',kind:'update',type:'MTI',client:'Sample Estates',date:'2026-10-16',time:'14:00',address:'22 Dummy Crescent',town:'London',postcode:'E6 9ZM',summary:'Agent asks to move the mid-term to Fri 16 Oct, 2pm.',sourceFrom:'Sample Estates <office@example.org>',sourceSubject:'RE: Mid-term 22 Dummy Crescent',sourceUrl:'https://mail.google.com/'},
 {id:'q3',kind:'cancel',type:'SOC',client:'Example Lettings',date:'2026-10-17',address:'Unit 5, Test Wharf',town:'London',postcode:'E16 9ZN',summary:'Landlord has cancelled the schedule of condition.',sourceFrom:'Example Lettings <bookings@example.com>',sourceSubject:'Cancelled: Unit 5 Test Wharf',sourceUrl:'https://mail.google.com/'},
 {id:'q4',kind:'invoice',jobNo:'WPS261003',invoiceNo:'INV-0150',amount:'£95.00',client:'Example Lettings',sourceDate:'2026-10-13T10:15:00Z',sourceUrl:'https://mail.google.com/',summary:'Tide invoice INV-0150 for WPS261003'}];
 state.queueChecked=true; state.queueCheckedAt=new Date(); render(); }""")
badges(h,"d7_tray",[(".qcard >> nth=0 >> button:has-text('Add to log')",1,"t"),(".qcard >> nth=0 >> button:has-text('Edit & add')",2,"t"),(".qcard >> nth=1 >> button:has-text('Apply change')",3,"t"),(".qcard >> nth=1 >> button:has-text('Edit first')",4,"t"),(".qcard >> nth=2 >> button:has-text('Delete cancelled job')",5,"t"),(".qcard >> nth=0 >> button:has-text('Dismiss')",6,"t"),(".qcard >> nth=0 >> a:has-text('Open email')",7,"t"),(".qcard >> nth=3 >> button:has-text('Mark invoiced')",8,"t")],clip_sel=".tray")
pg.evaluate("()=>{state.queueChecked=false; state.queue=[]; render();}")
# Job Log
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200); real_look(pg)
badges(h,"j1_log",[(".status-strip",1),(".view-toggle",2),(".search-wrap",3,"t"),(".filter-select >> nth=0",4),("tr:has-text('WPS261007') .jt-status .pill",5,"t"),("tr:has-text('WPS261007') .jt-inv .pill",6,"t"),("tr:has-text('WPS261007') button[title^='Open and edit']",7,"t"),("tr:has-text('WPS261007') button[title^='Delete']",8,"b"),("tr:has-text('WPS261007') button[title*='calendar']",9,"t"),(".status-card:has-text('Finished')",10,"b")])
# Job form on an existing job (tenant rows, Copy to, photo link, Delete job)
pg.evaluate("openEdit('job_WPS261006')"); pg.wait_for_timeout(250)
badges(h,"j2_form",[(".extract-box",1),("#f_jobNo",2),("#f_status",3),("#f_invoice",4),("#f_clientSelect",5),(".tenant-block",6),(".copyto-block",7),("#f_photoLink",8),("button:has-text('Delete job')",9,"t"),("button:has-text('Save changes')",10,"tr")],clip_sel=".form-card",pad=40)
pg.locator(".form-actions button:has-text('Cancel')").click(); pg.wait_for_timeout(150)
# Re-issue
pg.evaluate("openEdit('job_WPS261004')"); pg.wait_for_timeout(250)
badges(h,"j3_reissue",[("button:has-text('Re-issued today')",1,"tr")],clip_sel="#f_status",pad=60)
pg.locator(".form-actions button:has-text('Cancel')").click(); pg.wait_for_timeout(150)
# Calendar
pg.locator(".view-toggle button:has-text('Calendar')").click(); pg.wait_for_timeout(200)
badges(h,"j4_calendar",[("button:has-text('← Prev')",1),("button.btn:has-text('Today')",2),(".cal-cell-today",3),(".cal-job-pill >> nth=0",4)],clip_sel=".cal-wrap")
# Help-on views
pg.evaluate("()=>{state.helpOn=true; render();}")
pg.locator(".view-toggle button:has-text('List')").click(); pg.wait_for_timeout(150)
pg.locator(".side-nav a:has-text('Dashboard')").click(); pg.wait_for_timeout(200)
h.shot("h1_help_dash")
badges(h,"h2_help_sidebar",[("button:has-text('Help hints')",1),("a:has-text('Manual')",2)],clip_sel=".side-tools",pad=4)
pg.evaluate("localStorage.setItem('wps_help_on_v1','0')")
print("errors:", h.errors[:5])
h.close()

# Phone
h=H(390,844,mobile=True); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go(""); real_look(pg)
badges(h,"m1_phone_dash",[("#syncBtn",1),(".side-menu-btn",2,"tr")],full=True)
pg.locator(".side-menu-btn").click(); pg.wait_for_timeout(200)
h.shot("m2_phone_menu")
pg.locator(".side-menu-btn").click(); pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200)
h.shot("m3_phone_log")
print("phone errors:", h.errors[:5])
h.close()
