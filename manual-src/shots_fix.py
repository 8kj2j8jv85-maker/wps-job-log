import os
os.environ.setdefault("CLOCK", "2026-10-13T15:00:00+01:00")
from shotlib import H, badges, real_look
h=H(1440,2400); pg=h.pg
h.go(""); pg.evaluate("localStorage.setItem('wps_help_on_v1','0')"); h.go(""); real_look(pg)
pg.evaluate("setDashPanel('due')"); pg.evaluate("openRearrange('job_WPS261006')"); pg.wait_for_timeout(250); pg.evaluate("scrollTo(0,0)")
badges(h,"d9_rearrange",[("#rr_date",1,"t"),("#rr_email",2,"tl"),("#rr_box button:has-text('Save')",3,"b")],clip_sel="#rr_box",pad=24)
pg.evaluate("closeRearrange()")
pg.locator(".side-nav a:has-text('Job Log')").click(); pg.wait_for_timeout(200)
pg.evaluate("openEdit('job_WPS261004')"); pg.wait_for_timeout(250); pg.evaluate("scrollTo(0,0)")
pg.evaluate("document.querySelector('#f_status').closest('label').id='st_lbl'")
badges(h,"j3_reissue",[("button:has-text('Re-issued today')",1,"tr")],clip_sel="#st_lbl",pad=30)
h.close()
