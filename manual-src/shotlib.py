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

