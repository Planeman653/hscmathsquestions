#!/usr/bin/env python3
"""THSC Online helper: list trial papers, pick the next ones to index, download PDFs, keep the ledger.

  python3 scripts/thsc.py list [--course extension2]          # all candidate papers (JSON lines)
  python3 scripts/thsc.py pick 5                               # next N papers to index (round-robin, newest first)
  python3 scripts/thsc.py download <course> "<title>" <out.pdf>
  python3 scripts/thsc.py mark <course> "<title>" indexed|skipped "<paper-id or reason>"

Candidates = trial papers listed on https://thsconline.github.io/s/yr12/Maths/trialpapers_<course>.html
whose title ends in "w. sol" (has solutions) and whose year >= MIN_YEAR (papers before 2019/2020 follow
an older syllabus).  The ledger (data/ledger.json) records every paper already indexed or skipped.
"""
import gzip, html, json, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEDGER = os.path.join(ROOT, "data/ledger.json")
COURSES = ["advanced", "extension1", "extension2"]
PAGE = "https://thsconline.github.io/s/yr12/Maths/trialpapers_{}.html"
API = "https://www.thsconline.net/api/v1"
MIN_YEAR = {"advanced": 2019, "extension1": 2019, "extension2": 2020}
UA = {"User-Agent": "Mozilla/5.0 (hscmathsquestions indexer)"}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def ledger():
    try:
        return json.load(open(LEDGER))
    except FileNotFoundError:
        return {"papers": []}


def key(course, title):
    return f"{course}|{title}"


def listing(course):
    page = get(PAGE.format(course))
    out = []
    for viewno, title in re.findall(r"pdf\(this,\s*'?([0-9A-Za-z]+)'?\)\">([^<]+)</a>", page):
        title = html.unescape(title).strip()
        m = re.match(r"(.+?) (\d{4})\b(.*)$", title)
        if not m:
            continue
        school, year, rest = m.group(1), int(m.group(2)), m.group(3)
        out.append({"course": course, "viewno": viewno, "title": title, "school": school, "year": year,
                    "solutions": "w. sol" in rest})
    return out


def candidates(course=None):
    done = {p["key"] for p in ledger()["papers"]}
    res = []
    for c in ([course] if course else COURSES):
        for p in listing(c):
            if p["solutions"] and p["year"] >= MIN_YEAR[c] and key(c, p["title"]) not in done:
                res.append(p)
    return res


def pick(n):
    pools = {c: sorted(candidates(c), key=lambda p: (-p["year"], p["school"])) for c in COURSES}
    # round-robin across courses, starting with the course that has the fewest indexed papers
    counts = {c: 0 for c in COURSES}
    for p in ledger()["papers"]:
        if p["status"] == "indexed":
            counts[p["course"]] += 1
    order = sorted(COURSES, key=lambda c: counts[c])
    chosen, i = [], 0
    while len(chosen) < n and any(pools.values()):
        c = order[i % len(order)]
        if pools[c]:
            chosen.append(pools[c].pop(0))
        i += 1
    return chosen


def download(course, title, out):
    viewno = next((p["viewno"] for p in listing(course) if p["title"] == title), None)
    if not viewno:
        sys.exit(f"Not found on THSC listing: {course} / {title}")
    t = re.sub(r"[^A-Za-z0-9._\- ()]", "", title)
    meta = json.loads(get(f"{API}/getmetadata/{viewno}/{urllib.parse.quote(t)}"))
    n = int(meta.get("fragmentCount") or 0)
    if n < 1:
        sys.exit(f"THSC has no downloadable file for '{title}' (fragmentCount={n}).")
    blob = b"".join(get(f"{API}/getfragment/{viewno}/{urllib.parse.quote(t)}/{i}", binary=True) for i in range(n))
    pdf = gzip.decompress(blob)
    if not pdf.startswith(b"%PDF-"):
        sys.exit("Downloaded data is not a PDF")
    open(out, "wb").write(pdf)
    print(json.dumps({"file": out, "original": meta.get("originalFileName"), "bytes": len(pdf), "viewno": viewno}))


def mark(course, title, status, note):
    L = ledger()
    L["papers"] = [p for p in L["papers"] if p["key"] != key(course, title)]
    import datetime
    L["papers"].append({"key": key(course, title), "course": course, "title": title, "status": status,
                        "note": note, "date": datetime.date.today().isoformat()})
    L["papers"].sort(key=lambda p: p["key"])
    json.dump(L, open(LEDGER, "w"), indent=1, ensure_ascii=False)
    print("ledger:", status, course, title)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a:
        sys.exit(__doc__)
    if a[0] == "list":
        c = a[a.index("--course") + 1] if "--course" in a else None
        for p in candidates(c):
            print(json.dumps(p))
    elif a[0] == "pick":
        for p in pick(int(a[1]) if len(a) > 1 else 5):
            print(json.dumps(p))
    elif a[0] == "download":
        download(a[1], a[2], a[3])
    elif a[0] == "mark":
        mark(a[1], a[2], a[3], a[4] if len(a) > 4 else "")
    else:
        sys.exit(__doc__)
