#!/usr/bin/env node
// Render every $...$ / $$...$$ in data/papers/**.json with KaTeX (strict) and report failures.
// Setup once:  npm install --no-save katex@0.16.11
const fs = require("fs"), path = require("path");
const katex = require("katex");
const root = path.join(__dirname, "..");
const files = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync(path.join(root, "data/papers")).flatMap((c) =>
      fs.readdirSync(path.join(root, "data/papers", c)).filter((f) => f.endsWith(".json")).map((f) => path.join(root, "data/papers", c, f)));
const re = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$((?:\\\$|[^$\n])+?)\$|\\\(([\s\S]+?)\\\)/g;
let bad = 0;
for (const f of files) {
  const p = JSON.parse(fs.readFileSync(f, "utf8"));
  (p.questions || []).forEach((q) => {
    for (const [fld, txt] of [["question", q.question], ["answer", q.answer], ...(q.options || []).map((o, i) => ["option " + "ABCD"[i], o])]) {
      for (const m of String(txt || "").matchAll(re)) {
        const src = m[1] ?? m[2] ?? m[3] ?? m[4];
        try { katex.renderToString(src, { throwOnError: true, displayMode: m[1] != null || m[2] != null }); }
        catch (e) { bad++; console.log(`${path.basename(f)} ${q.ref} ${fld}: ${e.message.split("\n")[0]}\n   ${src.slice(0, 160)}`); }
      }
    }
  });
}
console.log(bad ? `${bad} LaTeX error(s)` : "LaTeX OK");
process.exit(bad ? 1 : 0);
