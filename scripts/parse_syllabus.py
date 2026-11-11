#!/usr/bin/env python3
"""Parse a NESA 2024 Stage 6 maths syllabus (.docx) into a topic/subtopic/dot-point JSON tree.

Usage: python3 scripts/parse_syllabus.py <syllabus.docx> <course-id> <course-name> <out.json>
Requires pandoc.  IDs look like  "12.3.2.4"  = Year 12, topic 3, subtopic 2, dot point 4.
"""
import json, re, subprocess, sys

def clean(s):
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)          # strip links
    s = re.sub(r"\$\$(.+?)\$\$", lambda m: "$" + m.group(1).strip() + "$", s)
    s = s.replace("\\text{~}", " ").replace("~", " ")
    s = re.sub(r"(?<!\\)\*\*?([^*]*)\*\*?", r"\1", s)        # drop md emphasis
    s = s.replace("\\'", "'").replace("--", "–").replace("\\$", " ")
    s = re.sub(r"\^(\w+)\^", r"\1", s)                     # pandoc superscript ^th^
    return re.sub(r"\s+", " ", s).strip()

def plain_items(docx):
    """Bullet items from pandoc's plain-text output (simple maths as Unicode, complex maths as $$TeX$$)."""
    txt = subprocess.run(["pandoc", docx, "-t", "plain", "--wrap=none"], capture_output=True, text=True).stdout
    items, cur = [], None
    for line in txt.splitlines():
        if line.startswith("-   "):
            cur = [line[4:]]
            items.append(cur)
        elif cur is not None and line.startswith("    "):
            cur.append(line.strip())
        elif cur is not None and not line.strip():
            continue
        else:
            cur = None
    out = []
    for it in items:
        t = re.sub(r"\s+", " ", " ".join(it))
        t = re.sub(r"\$\$(.+?)\$\$", lambda m: "$" + m.group(1).strip().rstrip("\\").strip() + "$", t)
        t = re.sub(r"\s+([,.;:)])", r"\1", t).replace("( ", "(")
        out.append(t.strip())
    return out


def heading(line):
    m = re.match(r"^(#{2,5})\s+(.*)$", line)
    if not m: return None
    return len(m.group(1)), clean(m.group(2).replace("*", ""))

def main(docx, cid, cname, out):
    md = subprocess.run(["pandoc", docx, "-t", "markdown", "--wrap=none"],
                        capture_output=True, text=True).stdout.splitlines()
    plain = plain_items(docx)
    years, year, topic, sub, in_content = [], None, None, None, False
    bullet = -1
    use_plain = False
    for raw in md:
        if raw.startswith("-   "):
            bullet += 1
        h = heading(raw)
        if h:
            lvl, txt = h
            m = re.match(r"Outcomes and content for Year (\d+)", txt)
            if lvl == 2:
                year = {"year": int(m.group(1)), "topics": []} if m else None
                if year: years.append(year)
                topic = sub = None; in_content = False
            elif year and lvl == 3:
                topic = {"name": txt, "subtopics": []}; year["topics"].append(topic)
                sub = None; in_content = False
            elif year and topic and lvl == 4:
                in_content = (txt == "Content"); sub = None
            elif year and topic and in_content and lvl == 5:
                sub = {"name": txt, "dotpoints": []}; topic["subtopics"].append(sub)
            continue
        if year and topic and in_content and raw.startswith("-   "):
            if sub is None:
                sub = {"name": topic["name"], "dotpoints": []}; topic["subtopics"].append(sub)
            md_text = clean(raw[4:])
            p_text = plain[bullet] if bullet < len(plain) else md_text
            use_plain = p_text[:25] == md_text[:25] or "$" in md_text
            sub["dotpoints"].append(p_text if use_plain else md_text)
        elif year and topic and in_content and raw.startswith("    ") and sub and sub["dotpoints"] and not use_plain:
            sub["dotpoints"][-1] += " " + clean(raw)   # wrapped/nested text
    # assign ids
    for y in years:
        for ti, t in enumerate(y["topics"], 1):
            t["id"] = f"{y['year']}.{ti}"
            for si, s in enumerate(t["subtopics"], 1):
                s["id"] = f"{t['id']}.{si}"
                s["dotpoints"] = [{"id": f"{s['id']}.{di}", "text": d} for di, d in enumerate(s["dotpoints"], 1)]
    json.dump({"course": cid, "name": cname, "syllabus": "NESA 11–12 (2024)", "years": years},
              open(out, "w"), ensure_ascii=False, indent=1)
    for y in years:
        print("Year", y["year"])
        for t in y["topics"]:
            print(f"  {t['id']} {t['name']}  ({sum(len(s['dotpoints']) for s in t['subtopics'])} dp)")
            for s in t["subtopics"]:
                print(f"     {s['id']} {s['name']} ({len(s['dotpoints'])})")

if __name__ == "__main__":
    main(*sys.argv[1:5])
