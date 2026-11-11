# Daily indexing procedure

This is the procedure the daily scheduled task follows. Goal: **index 5 new THSC trial papers per day** into
`data/papers/`, rebuild, and push to `main` (GitHub Pages serves the site from `main`).

## 0. Setup

```bash
git clone https://github.com/Planeman653/hscmathsquestions && cd hscmathsquestions
npm install --no-save katex@0.16.11        # for scripts/check_tex.js
mkdir -p work                               # scratch area, git-ignored
```

## 1. Pick papers

```bash
python3 scripts/thsc.py pick 5
```

Prints 5 papers (round-robin across Advanced / Ext 1 / Ext 2, newest year first) that have solutions and
are not yet in `data/ledger.json`. For each one:

```bash
python3 scripts/thsc.py download <course> "<title>" work/<paper-id>.pdf
python3 scripts/pages.py render work/<paper-id>.pdf work/<paper-id>/
```

`<paper-id>` = `<adv|ext1|ext2>-<year>-<school-slug>`, e.g. `ext1-2026-baulkham-hills`.

If a download fails, or the PDF has no usable solutions (missing, or only an answer grid), mark it skipped
and pick another: `python3 scripts/thsc.py mark <course> "<title>" skipped "<reason>"` then re-run `pick 1`.

## 2. Read the paper

Look at every page image in `work/<paper-id>/` (p01.png …). `text.txt` is the text layer — useful for
copying words, but the maths in it is usually garbled, so always check against the image.
`python3 scripts/pages.py images work/<paper-id>.pdf` lists the bounding boxes (in %) of embedded pictures —
usually the diagrams — which can be passed straight to `pages.py crop`.
Handwritten/scanned solutions have no usable text layer: render them small and in pairs to read them
(`pdftoppm -r 62 -gray …`, then paste two pages side by side).

## 3. Write `data/papers/<course>/<paper-id>.json`

Schema is documented at the top of `scripts/build.py`. Rules:

**Splitting (match the layout of the original Ext 2 question bank).**
- One entry per independently answerable part: `Q11(a)`, `Q11(b)(i)`, `Q11(b)(ii)` … Each MC question is one entry.
- Every entry must be **self-contained**: repeat the stem/context it needs (definitions, given functions,
  earlier results to be used, "Hence…" → "Using the result …"). Light rewording is fine; never change the maths.
- `ref` is the original reference exactly as in the paper (`Q3`, `Q12(c)(ii)`).
- `marks` from the paper. `kind`: `mc` (with exactly 4 `options` and `correct`) or `written`.

**Tip:** write the paper as a small Python script in `work/` (gitignored) that builds the JSON from raw strings
(`r"""…"""`) — this avoids doubling every LaTeX backslash. See the shape used in `data/papers/*/*.json`.

**Maths and text.**
- Markdown with LaTeX: `$…$` inline, `$$…$$` display. Use `\dfrac` sparingly, `\mathbf{r}` / `\overrightarrow{AB}` for vectors,
  `\ddot{x}`, `\displaystyle\int`. Tables as Markdown tables.
- Money: write `\$` (e.g. `\$500`), both in text and inside maths.
- MC options that are graphs: crop each option and use Markdown images as the option text,
  e.g. `"![Graph A](assets/img/<id>/q2a.png)"`.
- Diagrams/graphs: crop them from the PDF and reference in `images`:
  `python3 scripts/pages.py crop work/<id>.pdf <page> <x0> <y0> <x1> <y1> assets/img/<id>/<ref-slug>.png`
  (coordinates are percentages of the page, read off the grid in the rendered PNGs). Look at the crop to confirm it
  contains the whole diagram and nothing else (no question text, no page furniture). Same for diagrams in solutions → `answer_images`.
- If a question is only answerable on a printed answer grid/template (e.g. "complete the table on the answer sheet"), rewrite so it is
  answerable, or include the template as a cropped image.

**Answers = worked solutions** from the paper's marking guidelines/solutions. Transcribe the working clearly
(not just the final answer). If the provided solution is illegible, missing a part, or wrong, write a correct worked
solution yourself and check it against the paper's final answer. For MC give `correct` plus a one-to-three-line reason.

**Syllabus tagging.** Use `data/syllabus/<course>.txt` (NESA 11–12 **2024** syllabus; ids like `12.3.4.2` = Year.Topic.Subtopic.Dotpoint).
- `dotpoints`: 1–3 ids, most relevant first (the first decides where it is listed). All ids must come from the
  syllabus of the question's own `course` (build.py rejects cross-course ids).
- Questions examining only content from a lower course (e.g. an Ext 2 paper question that is purely Ext 1 content)
  set `"course"` to that course and use its dot points; Advanced content in an Ext 1 paper → `"course": "advanced"`.
- Content that the 2024 syllabus moved to a **higher** course goes on that course's page instead of being dropped
  (set `"course"`). Seen so far: t-formulas and products-to-sums identities (Ext 1 → Ext 2 12.4.1),
  3D trigonometry/bearings in 3D (Advanced → Ext 1 11.3.1).
- **Out of syllabus → drop.** Past papers follow the 2017 syllabus. If a part needs content that is not in the 2024
  syllabus for any of the three courses, do not include it; add `{"ref": "...", "reason": "Not in 2024 syllabus: …"}` to `dropped`.
  Known removals (drop): Ext 2 exponential/Euler form ($re^{i\theta}$) — keep only if switching notation to polar form
  leaves the question unchanged in substance; Ext 1 pigeonhole principle, graphs of $y^2 = f(x)$, normal approximation to
  the binomial, sample proportions; Advanced bivariate data (scatter plots, correlation, regression), Pareto charts,
  box plots/IQR/outliers, mean and standard deviation of datasets. Also drop parts that only ask to label or complete a
  printed diagram. If a later part depends on a dropped part, make it self-contained (state the needed result) or drop it.
- Check the paper's solutions: if one is wrong (it happens — e.g. sine-rule ambiguous case), give the correct working
  and add a one-line note saying where the paper's answer differs.

**Difficulty 1–5** (judge the thinking required, not just marks):
1 = routine single step/recall · 2 = standard technique, few steps · 3 = multi-step standard problem ·
4 = unfamiliar setup or long chain of reasoning (typical late-paper part) · 5 = hardest discriminating parts (band E4 / final question).

Paper-level fields: `id`, `course`, `school`, `year`, `type: "Trial"`, `thsc: {viewno, title}`, `indexed` (today),
`answers: "worked"`, `dropped`, `questions` (in paper order).

## 4. Validate, record, publish

```bash
python3 scripts/build.py --check && node scripts/check_tex.js     # fix every error
python3 scripts/thsc.py mark <course> "<title>" indexed <paper-id> # once per paper
python3 scripts/build.py                                            # writes data/build/*.json
```

Spot-check the site: `python3 -m http.server 8765` and open `/<course>.html` with Playwright; confirm
`document.querySelectorAll('.katex-error').length === 0` and that images load.

Commit (one commit for the day) and push to `main`:
`git add -A && git commit -m "Index <n> papers: <labels>" && git push origin HEAD:main`

## 5. Report

Finish with a short summary: papers indexed (questions kept / dropped per paper), anything skipped and why.
