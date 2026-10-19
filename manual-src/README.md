# WPS Tools Manual — source

manual.pdf (in the site root) is built from manual.html here. The Manual links in index.html and
photos.html point at manual.pdf?v=<date>; change the date when the PDF is replaced so browsers load the new copy.

- img/ — screenshots used in the manual (made-up jobs, no real data)
- fix/ — the made-up jobs and contacts (jobs.py -> data.json) and sample photos script (photos.py)
- harness.py — test browser (Playwright) with the made-up jobs and contacts loaded; clock set by CLOCK
- shotlib.py — screenshot helpers (numbered markers)
- shots2.py, shots_form.py, shots_fix.py — the 14 Oct Dashboard / Job Log / phone screenshots
- shots3.py — the 18 Oct pictures: counter, milestone, Performance, themes, Photo Tool and Dictation (needs fix/jszip.min.js, from cdnjs jszip 3.10.1, and the sample photos from fix/photos.py)
- shots4.py — the 19 Oct pictures (n*.jpg, j1_log, m1-m3 phone): Do next, Park, Mid-terms and slot settings, Plan my day, Board, money owed, More, news line, help boxes. Needs the extra jobs and postcodes in fix/jobs.py and harness.py (19 Oct)
- shots.py — the 12 Oct script (replaced by shots3.py for the Photo Tool and Dictation)
- check*.py — scripted checks from 12 Oct
- pdf.py — prints manual.html to manual.pdf

Paths in the scripts point at /home/claude/manual; copy this folder there to rerun
(ROOT=/path/to/repo PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers python3 shots2.py).
Built 12 Oct 2026; rewritten 14 Oct 2026 for PRs #1-#14 (live main 45371bb); rewritten 18 Oct 2026 for PRs #15-#29 (main 6adbff1 plus the PR #29 Photo Tool zip name fix), report auto-send and the signing page (live 18 Oct 01:38).
Rewritten 19 Oct 2026 as a plain-words manual (Part 1 quick start, Part 2 "How do I…?", Part 3 full detail) for PRs #33-#43. Edit manual.html directly from now on, then run pdf.py and copy the PDF to manual.pdf in the site root.
