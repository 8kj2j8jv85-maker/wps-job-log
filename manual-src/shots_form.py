import os
os.environ.setdefault("CLOCK", "2026-10-13T15:00:00+01:00")
from shotlib import H, badges, real_look
h=H(1440,2400); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go(""); real_look(pg)
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200); real_look(pg)
pg.evaluate("openEdit('job_WPS261006')"); pg.wait_for_timeout(250); pg.evaluate("scrollTo(0,0)")
items=[(".extract-box",1),("#f_jobNo",2),("#f_status",3),("#f_invoice",4),("#f_clientSelect",5),(".tenant-block",6),(".copyto-block",7),("#f_photoLink",8),("button:has-text('Delete job')",9,"t"),("button:has-text('Save changes')",10,"t")]
fc=pg.locator(".form-card").bounding_box(); sy=pg.evaluate("scrollY")
print(fc, sy)
badges(h,"j2_form",items,clip_sel=".form-card",pad=40)
h.close()
