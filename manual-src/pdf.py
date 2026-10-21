from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page()
    pg.goto("file:///home/claude/manual/manual.html"); pg.wait_for_timeout(800)
    pg.pdf(path="/home/claude/manual/WPS_Tools_Manual.pdf", format="A4", print_background=True, prefer_css_page_size=True,
      display_header_footer=True, header_template="<div></div>",
      footer_template='<div style="width:100%;font-family:Arial;font-size:8px;color:#7A8493;padding:0 15mm;display:flex;justify-content:space-between"><span>Wellington Property Services · Tools Manual · 21 Oct 2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>')
    b.close()
