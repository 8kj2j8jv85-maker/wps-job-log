# Prints manual.html to WPS_Tools_Manual.pdf in the dashboard look: navy cover (first page, no margins),
# then a navy band with the dashboard logo at the top of every page and a page number at the bottom.
# Fonts: fonts/Jost.ttf and fonts/CormorantGaramond-Italic.ttf (Google Fonts, OFL), loaded by manual.html.
import os
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = open(os.path.join(HERE, "wps_logo_dash.svg")).read().replace('class="side-logo"', 'style="height:9.5mm;width:auto;display:block"')
HEADER = ('<style>html,body{margin:0!important;padding:0!important;-webkit-print-color-adjust:exact}#header{padding:0!important}</style>'
  '<div style="width:100%;height:17mm;margin-top:-1px;background:#1F2D5A;display:flex;align-items:center;justify-content:space-between;padding:0 15mm;box-sizing:border-box;-webkit-print-color-adjust:exact">'
  + LOGO +
  '<span style="font-family:Jost,Arial,sans-serif;font-size:9px;letter-spacing:.14em;color:#C9D6E8;font-weight:600">TOOLS MANUAL</span></div>')
FOOTER = ('<div style="width:100%;font-family:Jost,Arial,sans-serif;font-size:8px;color:#5C6470;padding:0 15mm;display:flex;justify-content:space-between;align-items:center">'
  '<span>Wellington Property Services &middot; Tools Manual &middot; 21 Oct 2026</span>'
  '<span style="color:#C8553A;font-weight:600"><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
COVER_ONLY = "<style>@page{margin:0} body>*:not(.cover){display:none!important}</style>"
BODY_ONLY = "<style>.cover{display:none!important}</style>"
out = os.path.join(HERE, "WPS_Tools_Manual.pdf")
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    url = "file://" + os.path.join(HERE, "manual.html")
    # 1. the cover on its own: full navy page, no band, no page number
    pg.goto(url); pg.wait_for_timeout(1200)
    pg.add_style_tag(content=COVER_ONLY.replace("<style>","").replace("</style>",""))
    pg.pdf(path=out + ".cover", format="A4", print_background=True, prefer_css_page_size=True, page_ranges="1")
    # 2. everything else with the navy band and page numbers
    pg.goto(url); pg.wait_for_timeout(1200)
    pg.add_style_tag(content=BODY_ONLY.replace("<style>","").replace("</style>",""))
    pg.pdf(path=out + ".body", format="A4", print_background=True, prefer_css_page_size=True,
      display_header_footer=True, header_template=HEADER, footer_template=FOOTER)
    b.close()
from pypdf import PdfWriter, PdfReader
w = PdfWriter()
for part in (out + ".cover", out + ".body"):
    for page in PdfReader(part).pages: w.add_page(page)
w.add_metadata({"/Title": "WPS Tools Manual", "/Author": "Wellington Property Services"})
with open(out, "wb") as f: w.write(f)
os.remove(out + ".cover"); os.remove(out + ".body")
