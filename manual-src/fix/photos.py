from PIL import Image, ImageDraw, ImageFont
import random, os
from fractions import Fraction
F="/usr/share/fonts/truetype/freefont/FreeSans.ttf"
def rat(x): f=Fraction(x).limit_denominator(1000000); return (f.numerator,f.denominator)
def dms(v):
    v=abs(v); d=int(v); m=int((v-d)*60); s=(v-d-m/60)*3600
    return (d,m,round(s,4))
rooms=[("External picture",1),("Entrance and Hallway",2),("Kitchen",3),("Living Room",2),("Bedroom 1",2),("Bathroom",2)]
cols={"External picture":(150,170,190),"Entrance and Hallway":(200,190,170),"Kitchen":(215,210,195),"Living Room":(190,180,160),"Bedroom 1":(180,190,200),"Bathroom":(210,220,225),"Meters":(160,160,150),"Keys":(170,150,120)}
def make(path, label, t, gps):
    w,h=1600,1200
    c=cols.get(label,(190,190,190))
    im=Image.new("RGB",(w,h),c); d=ImageDraw.Draw(im)
    for i in range(6):
        x=random.randint(0,w-500); y=random.randint(300,h-300)
        d.rectangle([x,y,x+random.randint(200,500),y+random.randint(150,400)],fill=tuple(max(0,v-random.randint(20,60)) for v in c))
    d.rectangle([0,h-260,w,h],fill=tuple(max(0,v-35) for v in c))
    d.text((60,60),label,font=ImageFont.truetype(F,90),fill=(40,45,60))
    d.text((60,170),"Sample photo for the manual",font=ImageFont.truetype(F,44),fill=(60,65,80))
    ex=Image.Exif()
    ex[0x0110]="Sample camera"
    ei=ex.get_ifd(0x8769); ei[0x9003]=t; ei[0x9004]=t
    if gps:
        lat,lon=gps; g=ex.get_ifd(0x8825)
        g[1]="N"; g[2]=dms(lat); g[3]="W" if lon<0 else "E"; g[4]=dms(lon)
    im.save(path,"JPEG",quality=80,exif=ex)
os.makedirs("photos",exist_ok=True)
n=0
def run(start_h,start_m,gps,seq):
    global n
    mins=start_m
    for room,k in seq:
        for i in range(k):
            n+=1; mins+=1+random.random()
            hh=start_h+int(mins//60); mm=int(mins%60); ss=random.randint(0,59)
            make(f"photos/IMG_{4000+n}.jpg",room,f"2026:10:12 {hh:02d}:{mm:02d}:{ss:02d}",gps)
random.seed(4)
run(11,3,(51.5301,-0.0252),rooms+[("Meters",1),("Keys",1)])
run(15,5,None,[("External picture",1),("Kitchen",2),("Living Room",2),("Bedroom 1",1),("Bathroom",1)])
print(n)
