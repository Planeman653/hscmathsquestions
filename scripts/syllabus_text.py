#!/usr/bin/env python3
"""Print a compact, greppable listing of a parsed syllabus (used when tagging questions)."""
import json, sys
d = json.load(open(sys.argv[1]))
for y in d["years"]:
    for t in y["topics"]:
        print(f"## {t['id']} {t['name']}")
        for s in t["subtopics"]:
            print(f"### {s['id']} {s['name']}")
            for p in s["dotpoints"]:
                print(f"{p['id']} {p['text']}")
