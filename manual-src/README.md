# WPS Tools Manual — source

manual.pdf (in the site root) is built from manual.html here.

- img/ — screenshots used in the manual (made-up jobs, no real data)
- fix/ — the made-up jobs (jobs.py -> data.json) and sample photos script (photos.py)
- harness.py — test browser (Playwright) with the made-up jobs loaded
- check1/2/3.py — scripted checks of Dashboard/Job Log, Photo Tool, Dictation and phone sizes
- shots.py — takes the screenshots (writes shots/*.png; convert to img/*.jpg)
- pdf.py — prints manual.html to manual.pdf

Paths in the scripts point at /home/claude/manual; copy this folder there to rerun.
Built 12 Oct 2026.
