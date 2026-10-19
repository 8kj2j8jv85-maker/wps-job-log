import json, subprocess, time, os, socket
from playwright.sync_api import sync_playwright
ROOT=os.environ.get("ROOT","/home/claude/wps-job-log")
PORT=int(os.environ.get("PORT","8765"))
DATA=json.load(open("/home/claude/manual/fix/data.json"))
PCS={"E39ZF":(51.5300,-0.0250),"E19ZH":(51.515,-0.06),"E39ZJ":(51.531,-0.024),"E39ZA":(51.528,-0.03),"E39ZD":(51.526,-0.02),"E99ZK":(51.545,-0.045),"E39ZS":(51.529,-0.028),"E29ZT":(51.53,-0.06)}
def serve():
    s=socket.socket()
    if s.connect_ex(("127.0.0.1",PORT))!=0:
        subprocess.Popen(["python3","-m","http.server",str(PORT),"-d",ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        time.sleep(1)
SEED="""(()=>{ if(localStorage.getItem('__seeded')) return;
 localStorage.setItem('wps_standalone_jobs_v1', JSON.stringify(%s));
 localStorage.setItem('wps_standalone_clients_v1', JSON.stringify(%s));
 localStorage.setItem('wps_job_log_contacts_v1', JSON.stringify(%s));
 localStorage.setItem('__seeded','1'); })();""" % (json.dumps(DATA["jobs"]), json.dumps(DATA["clients"]), json.dumps(DATA["contacts"]))
def route(r):
    u=r.request.url
    if u.startswith(f"http://localhost:{PORT}") or u.startswith("data:") or u.startswith("blob:"): return r.continue_()
    if "postcodes.io" in u:
        body=json.loads(r.request.post_data or "{}")
        res=[{"query":q,"result":({"latitude":PCS[q.replace(' ','').upper()][0],"longitude":PCS[q.replace(' ','').upper()][1]} if q.replace(' ','').upper() in PCS else None)} for q in body.get("postcodes",[])]
        return r.fulfill(status=200,content_type="application/json",body=json.dumps({"result":res}))
    if "jszip" in u:
        return r.fulfill(status=200,content_type="application/javascript",body=open("/home/claude/manual/fix/jszip.min.js").read())
    return r.abort()
class H:
    def __init__(s, w=1440, h=900, mobile=False, seed=True):
        serve()
        s.p=sync_playwright().start(); s.b=s.p.chromium.launch(args=["--lang=en-GB","--accept-lang=en-GB"], env={**os.environ,"LANG":"en_GB.UTF-8","LANGUAGE":"en_GB"})
        kw=dict(viewport={"width":w,"height":h},timezone_id="Europe/London",locale="en-GB",accept_downloads=True,device_scale_factor=2 if mobile else 1.5)
        if mobile: kw.update(is_mobile=True,has_touch=True)
        s.ctx=s.b.new_context(**kw)
        s.ctx.route("**/*",route)
        if seed: s.ctx.add_init_script(SEED)
        s.pg=s.ctx.new_page()
        s.pg.clock.install(time=os.environ.get("CLOCK","2026-10-13T08:45:00+01:00"))
        s.errors=[]; s.dialogs=[]
        s.pg.on("console", lambda m: m.type=="error" and s.errors.append(m.text))
        s.pg.on("pageerror", lambda e: s.errors.append("PAGEERROR "+str(e)))
        def dlg(d): s.dialogs.append(d.message[:120]); d.accept()
        s.pg.on("dialog", dlg)
    def go(s, path=""):
        s.pg.goto(f"http://localhost:{PORT}/{path}"); s.pg.wait_for_timeout(500)
    def shot(s, name, full=False, el=None, clip=None):
        p=f"/home/claude/manual/shots/{name}.png"
        if el: s.pg.locator(el).first.screenshot(path=p)
        else: s.pg.screenshot(path=p, full_page=full, clip=clip)
        return p
    def close(s): s.b.close(); s.p.stop()
