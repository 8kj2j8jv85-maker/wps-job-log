# WPS Tools Manual — source

manual.pdf (in the site root) is built from manual.html here. The Manual links in index.html and
photos.html point at manual.pdf?v=<date>; change the date when the PDF is replaced so browsers load the new copy.

- img/ — screenshots used in the manual (made-up jobs, no real data)
- fix/ — the made-up jobs and contacts (jobs.py -> data.json) and sample photos script (photos.py)
- harness.py — test browser (Playwright) with the made-up jobs and contacts loaded; clock set by CLOCK
- shotlib.py — screenshot helpers (numbered markers)
- shots2.py, shots_form.py, shots_fix.py — the 14 Oct Dashboard / Job Log / phone screenshots
- shots.py — the 12 Oct script; still used for the Photo Tool and Dictation pictures (needs fix/jszip.min.js)
- check*.py — scripted checks from 12 Oct
- pdf.py — prints manual.html to manual.pdf

Paths in the scripts point at /home/claude/manual; copy this folder there to rerun
(ROOT=/path/to/repo PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 shots2.py).
Built 12 Oct 2026; rewritten 14 Oct 2026 for PRs #1-#14 (live main 45371bb).
