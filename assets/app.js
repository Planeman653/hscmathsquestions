/* HSC Maths Question Bank — course page app.  No build step. */
(function () {
  "use strict";
  const COURSE = document.body.dataset.course;
  const COURSE_NAME = {
    advanced: "Mathematics Advanced",
    extension1: "Mathematics Extension 1",
    extension2: "Mathematics Extension 2",
  }[COURSE];
  const DIFF = ["", "Easy", "Moderate", "Medium", "Hard", "Very hard"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("hscq:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("hscq:" + k, JSON.stringify(v)); } catch (e) {} },
  };

  const S = {
    syl: null, data: null, dp: {}, sub: {}, topic: {}, order: {},
    sel: new Set(),                       // selected dot point ids (empty = all)
    diff: new Set([1, 2, 3, 4, 5]),
    kinds: new Set(["mc", "written"]),
    papers: new Set(),                    // selected paper ids (empty = all)
    search: "",
    sort: "syllabus",
    group: "subtopic",
    showAnswers: store.get("showAnswers", false),
    hideEmpty: true,
    basket: new Set(store.get("basket:" + COURSE, [])),
    opened: new Set(),                    // per-question answers opened manually
  };

  /* ---------------- markdown + maths ---------------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function tex(src, display) {
    src = src.replace(/\u0003/g, "\\$");
    try { return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore" }); }
    catch (e) { return "<code>" + esc(src) + "</code>"; }
  }
  function md(text, inline) {
    if (!text) return "";
    const maths = [];
    const t = String(text).replace(/\\\$/g, "\u0003").replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\$([^$]+?)\$|\\\(([\s\S]+?)\\\)/g,
      (m, a, b, c, d) => { maths.push([a ?? b ?? c ?? d, a != null || b != null]); return "\u0001" + (maths.length - 1) + "\u0002"; });
    let html = inline ? marked.parseInline(t) : marked.parse(t);
    return html.replace(/\u0001(\d+)\u0002/g, (m, i) => tex(maths[+i][0], maths[+i][1])).replace(/\u0003/g, "$");
  }

  /* ---------------- data ---------------- */
  async function load() {
    const [syl, data] = await Promise.all([
      fetch("data/syllabus/" + COURSE + ".json").then((r) => r.json()),
      fetch("data/build/" + COURSE + ".json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { papers: {}, questions: [] })),
    ]);
    S.syl = syl; S.data = data;
    let n = 0;
    for (const y of syl.years) for (const t of y.topics) {
      S.topic[t.id] = { ...t, year: y.year };
      for (const s of t.subtopics) {
        S.sub[s.id] = { ...s, topic: t.id };
        for (const p of s.dotpoints) { S.dp[p.id] = { ...p, sub: s.id, topic: t.id }; S.order[p.id] = n++; }
      }
    }
    for (const q of data.questions) {
      q._order = S.order[q.dotpoints[0]] ?? 1e9;
      q._paper = data.papers[q.paper] || { label: q.paper, year: 0 };
      q._text = (q.question + " " + (q.options || []).join(" ") + " " + q._paper.label + " " + q.ref).toLowerCase();
    }
    for (const id of [...S.basket]) if (!data.questions.find((q) => q.id === id)) S.basket.delete(id);
  }

  /* ---------------- filtering ---------------- */
  function passesNonTopic(q) {
    if (!S.diff.has(q.difficulty)) return false;
    if (!S.kinds.has(q.kind)) return false;
    if (S.papers.size && !S.papers.has(q.paper)) return false;
    if (S.search) for (const w of S.search.split(/\s+/)) if (w && !q._text.includes(w)) return false;
    return true;
  }
  function passes(q) {
    if (!passesNonTopic(q)) return false;
    if (S.sel.size && !q.dotpoints.some((d) => S.sel.has(d))) return false;
    return true;
  }
  function sorted(list) {
    const by = {
      syllabus: (a, b) => a._order - b._order || b._paper.year - a._paper.year || a.seq - b.seq,
      "diff-asc": (a, b) => a.difficulty - b.difficulty || a._order - b._order,
      "diff-desc": (a, b) => b.difficulty - a.difficulty || a._order - b._order,
      newest: (a, b) => b._paper.year - a._paper.year || a.paper.localeCompare(b.paper) || a.seq - b.seq,
      marks: (a, b) => a.marks - b.marks || a._order - b._order,
    }[S.sort];
    return list.slice().sort(by);
  }

  /* ---------------- sidebar ---------------- */
  function dpCounts() {
    const c = {};
    for (const q of S.data.questions) if (passesNonTopic(q)) for (const d of q.dotpoints) (c[d] = c[d] || new Set()).add(q.id);
    return c;
  }
  function buildTree() {
    const c = dpCounts();
    const root = document.getElementById("tree");
    const openState = new Set([...root.querySelectorAll("details[open]")].map((d) => d.dataset.key));
    const firstBuild = !root.dataset.built;
    let html = "";
    for (const y of S.syl.years) {
      let yHtml = "", ySet = new Set();
      for (const t of y.topics) {
        let tHtml = "", tSet = new Set();
        for (const s of t.subtopics) {
          let sHtml = "", sSet = new Set();
          for (const p of s.dotpoints) {
            const n = c[p.id] ? c[p.id].size : 0; if (n) c[p.id].forEach((x) => { sSet.add(x); tSet.add(x); ySet.add(x); });
            if (S.hideEmpty && !n) continue;
            sHtml += `<label class="dp ${n ? "" : "empty"}" title="${esc(p.text.replace(/\$/g, ""))}"><input type="checkbox" data-dp="${p.id}" ${S.sel.has(p.id) ? "checked" : ""}><span class="lbl"><span class="id">${p.id}</span> <span class="md-inline" data-md="${esc(p.text)}"></span></span><span class="cnt">${n}</span></label>`;
          }
          const sCount = sSet.size;
          if (S.hideEmpty && !sCount) continue;
          const key = "s" + s.id;
          const multi = !(s.name === t.name && t.subtopics.length === 1);
          tHtml += multi
            ? `<details class="lvl-sub" data-key="${key}" ${openState.has(key) ? "open" : ""}><summary><span class="caret">▸</span><input type="checkbox" data-group="${s.id}"><span class="lbl">${esc(s.name)}</span><span class="cnt">${sCount}</span></summary><div class="kids">${sHtml}</div></details>`
            : sHtml;
        }
        const tCount = tSet.size;
        if (S.hideEmpty && !tCount) continue;
        const key = "t" + t.id;
        yHtml += `<details class="lvl-topic" data-key="${key}" ${openState.has(key) ? "open" : ""}><summary><span class="caret">▸</span><input type="checkbox" data-group="${t.id}"><span class="lbl">${esc(t.name)}</span><span class="cnt">${tCount}</span></summary><div class="kids">${tHtml}</div></details>`;
      }
      const yCount = ySet.size;
      if (S.hideEmpty && !yCount) continue;
      const key = "y" + y.year;
      const open = firstBuild || openState.has(key);
      html += S.syl.years.length > 1
        ? `<details class="lvl-year" data-key="${key}" ${open ? "open" : ""}><summary><span class="caret">▸</span><span class="lbl">Year ${y.year}</span><span class="cnt">${yCount}</span></summary>${yHtml}</details>`
        : yHtml;
    }
    root.innerHTML = html || `<div class="none" style="padding:10px">No indexed questions yet.</div>`;
    root.dataset.built = "1";
    root.querySelectorAll(".md-inline").forEach((el) => { el.innerHTML = md(el.dataset.md, true); });
    syncGroupBoxes();
  }
  function dpsUnder(prefix) { return Object.keys(S.dp).filter((id) => id === prefix || id.startsWith(prefix + ".")); }
  function syncGroupBoxes() {
    document.querySelectorAll("#tree input[data-group]").forEach((box) => {
      const ids = dpsUnder(box.dataset.group);
      const on = ids.filter((i) => S.sel.has(i)).length;
      box.checked = on > 0 && on === ids.length;
      box.indeterminate = on > 0 && on < ids.length;
    });
  }
  function buildPapers() {
    const papers = Object.values(S.data.papers).sort((a, b) => b.year - a.year || a.school.localeCompare(b.school));
    const counts = {};
    for (const q of S.data.questions) counts[q.paper] = (counts[q.paper] || 0) + 1;
    document.getElementById("papers").innerHTML = papers.length
      ? papers.map((p) => `<label class="switch" style="font-size:13.5px;margin:3px 0"><input type="checkbox" data-paper="${p.id}" ${S.papers.has(p.id) ? "checked" : ""}> ${esc(p.label)}${p.course !== COURSE ? ` <span class="cnt">(${esc(shortCourse(p.course))} paper)</span>` : ""} <span class="cnt" style="color:var(--faint)">${counts[p.id] || 0}</span></label>`).join("")
      : `<span class="cnt">None yet</span>`;
  }
  const shortCourse = (c) => ({ advanced: "Adv", extension1: "Ext 1", extension2: "Ext 2" }[c] || c);

  /* ---------------- main document ---------------- */
  function qHtml(q, num) {
    const p = q._paper;
    const opts = q.kind === "mc" && q.options ? (() => {
      const short = q.options.every((o) => o.includes("![") || o.replace(/\$[^$]*\$/g, "xxxx").length < 38);
      return `<div class="opts ${short ? "short" : ""}">${q.options.map((o, i) => {
        const L = "ABCD"[i];
        return `<div class="${(S.showAnswers || S.opened.has(q.id)) && q.correct === L ? "correct" : ""}"><b>(${L})</b><span>${md(o, true)}</span></div>`;
      }).join("")}</div>`;
    })() : "";
    const imgs = (q.images || []).map((s) => `<img src="${esc(s)}" alt="Diagram for ${esc(q.ref)}" loading="lazy">`).join("");
    const show = S.showAnswers || S.opened.has(q.id);
    const ansImgs = (q.answer_images || []).map((s) => `<img src="${esc(s)}" alt="Solution diagram" loading="lazy">`).join("");
    const ansLabel = p.answers === "short" ? "Answer" : "Worked solution";
    const ans = show ? `<div class="ans"><div class="ans-label">${ansLabel}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${q.kind === "mc" && q.answer.replace(/\*/g, "").trim() === q.correct ? "" : md(q.answer)}${ansImgs}</div></div>` : "";
    const dps = q.dotpoints.map((d) => d).join(", ");
    return `<article class="q" id="${q.id}">
      <div class="q-head"><span class="q-title">Question ${num} <span class="marks">(${q.marks} mark${q.marks === 1 ? "" : "s"})</span></span>
        <span class="diff d${q.difficulty}" title="Difficulty ${q.difficulty}/5 — ${DIFF[q.difficulty]}">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= q.difficulty ? "f" : ""}"></i>`).join("")}&nbsp;${DIFF[q.difficulty]}</span>
        <span class="grow"></span>
        <label class="pick"><input type="checkbox" data-pick="${q.id}" ${S.basket.has(q.id) ? "checked" : ""}> Add to PDF</label></div>
      <div class="q-body">${md(q.question)}${imgs}</div>${opts}
      <div class="src">Source: ${esc(p.label)}, ${esc(q.ref)}${q.kind === "mc" ? " (multiple choice)" : ""} · <span class="dps">Dot point${q.dotpoints.length > 1 ? "s" : ""} ${dps}</span></div>
      ${S.showAnswers ? "" : `<div class="ans-toggle"><button class="linkish" data-ans="${q.id}">${show ? "Hide" : "Show"} ${ansLabel.toLowerCase()}</button></div>`}
      ${ans}</article>`;
  }

  function groupKey(q) {
    if (S.group === "dotpoint") return q.dotpoints[0];
    if (S.group === "subtopic") return q.subtopic;
    return "all";
  }

  function render() {
    const list = sorted(S.data.questions.filter(passes));
    document.getElementById("count").textContent = `${list.length} question${list.length === 1 ? "" : "s"} · ${list.reduce((a, q) => a + q.marks, 0)} marks`;
    const docEl = document.getElementById("questions");
    const contentsEl = document.getElementById("contents");
    if (!list.length) {
      docEl.innerHTML = `<div class="none">No questions match these filters.</div>`;
      contentsEl.innerHTML = ""; return;
    }
    // group: keep topic -> group order by syllabus, sort within group
    const topics = new Map();
    for (const q of list) {
      const t = S.group === "none" ? "_" : q.topic;
      if (!topics.has(t)) topics.set(t, new Map());
      const g = groupKey(q), gm = topics.get(t);
      if (!gm.has(g)) gm.set(g, []);
      gm.get(g).push(q);
    }
    const tOrder = (id) => (id === "_" ? 0 : S.order[Object.keys(S.dp).find((d) => d.startsWith(id + "."))] ?? 1e9);
    const gOrder = (id) => (S.group === "dotpoint" ? S.order[id] : S.order[Object.keys(S.dp).find((d) => d.startsWith(id + "."))]) ?? 1e9;
    const tKeys = [...topics.keys()].sort((a, b) => (S.sort === "syllabus" || S.group !== "none" ? tOrder(a) - tOrder(b) : 0));
    let html = "", contents = "", num = 0;
    for (const t of tKeys) {
      const gm = topics.get(t);
      const tCount = [...gm.values()].reduce((a, l) => a + l.length, 0);
      if (t !== "_") {
        const tp = S.topic[t];
        html += `<h2 class="topic-h" id="topic-${t}">${esc(tp.name)}${S.syl.years.length > 1 ? ` <span style="font-size:14px;font-family:var(--sans);color:var(--muted);font-weight:400">Year ${tp.year}</span>` : ""}</h2>`;
        contents += `<li><a href="#topic-${t}">${esc(tp.name)}</a> <span class="n">(${tCount})</span></li>`;
      }
      const gKeys = [...gm.keys()].sort((a, b) => gOrder(a) - gOrder(b));
      for (const g of gKeys) {
        if (S.group === "subtopic") {
          const s = S.sub[g];
          if (!(s.name === S.topic[t].name && S.topic[t].subtopics.length === 1)) html += `<h3 class="sub-h">${esc(s.name)}</h3>`;
        } else if (S.group === "dotpoint") {
          html += `<h3 class="sub-h"><span class="dpid">${g}</span>${md(S.dp[g].text, true)}</h3>`;
        }
        for (const q of gm.get(g)) html += qHtml(q, ++num);
      }
    }
    docEl.innerHTML = html;
    contentsEl.innerHTML = S.group === "none" ? "" : `<h2>Contents</h2><ul>${contents}</ul>`;
  }

  function refresh(tree) { if (tree) buildTree(); else syncGroupBoxes(); render(); updateBasket(); }

  /* ---------------- basket / PDF ---------------- */
  function updateBasket() {
    document.getElementById("basket-n").textContent = S.basket.size;
    store.set("basket:" + COURSE, [...S.basket]);
    const qs = S.data.questions.filter((q) => S.basket.has(q.id));
    const order = [...S.basket];
    qs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    document.getElementById("basket-list").innerHTML = qs.length
      ? qs.map((q) => `<li>${esc(q._paper.label)} ${esc(q.ref)} · ${q.marks}m · ${DIFF[q.difficulty]}<button class="linkish" data-unpick="${q.id}">remove</button></li>`).join("")
      : `<li style="list-style:none;margin-left:-22px;color:var(--muted)">Tick “Add to PDF” on any question, or use “Add all shown”.</li>`;
    document.getElementById("basket-marks").textContent = qs.length ? `${qs.length} questions · ${qs.reduce((a, q) => a + q.marks, 0)} marks` : "";
  }
  function buildPdf() {
    const order = [...S.basket];
    let qs = S.data.questions.filter((q) => S.basket.has(q.id));
    const how = document.getElementById("pdf-order").value;
    if (how === "added") qs.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    else if (how === "syllabus") qs.sort((a, b) => a._order - b._order);
    else qs.sort((a, b) => a.difficulty - b.difficulty || a._order - b._order);
    if (!qs.length) { alertBox("Add some questions first."); return; }
    const title = document.getElementById("pdf-title").value || `${COURSE_NAME} — Practice Questions`;
    const ansMode = document.getElementById("pdf-answers").value;
    const space = document.getElementById("pdf-space").value;
    const showSrc = document.getElementById("pdf-src").checked;
    const total = qs.reduce((a, q) => a + q.marks, 0);
    let h = `<h1>${esc(title)}</h1><div class="p-sub">${esc(COURSE_NAME)} · ${qs.length} questions · ${total} marks</div>`;
    qs.forEach((q, i) => {
      const opts = q.kind === "mc" ? `<div class="opts ${q.options.every((o) => o.includes("![") || o.length < 38) ? "short" : ""}">${q.options.map((o, k) => `<div><b>(${"ABCD"[k]})</b><span>${md(o, true)}</span></div>`).join("")}</div>` : "";
      const imgs = (q.images || []).map((s) => `<img src="${esc(s)}">`).join("");
      const ans = `<div class="ans"><div class="ans-label">${q._paper.answers === "short" ? "Answer" : "Solution"}${q.kind === "mc" && q.correct ? " — " + q.correct : ""}</div><div class="ans-body">${md(q.answer)}${(q.answer_images || []).map((s) => `<img src="${esc(s)}">`).join("")}</div></div>`;
      h += `<div class="pq"><div class="pq-head">Question ${i + 1} <span>(${q.marks} mark${q.marks === 1 ? "" : "s"})</span></div><div class="q-body">${md(q.question)}${imgs}</div>${opts}`
        + (showSrc ? `<div class="src">Source: ${esc(q._paper.label)}, ${esc(q.ref)}</div>` : "")
        + (space !== "none" && q.kind === "written" && ansMode !== "inline" ? `<div class="work ${space}"></div>` : "")
        + (ansMode === "inline" ? ans : "") + `</div>`;
    });
    if (ansMode === "end") {
      h += `<div class="key"><h2>Answers</h2>` + qs.map((q, i) => `<div class="pq"><div class="pq-head">Question ${i + 1}</div><div class="ans-body">${q.kind === "mc" && q.correct ? `<p><b>${q.correct}</b></p>` : ""}${q.kind === "mc" && q.answer.replace(/\*/g, "").trim() === q.correct ? "" : md(q.answer)}${(q.answer_images || []).map((s) => `<img src="${esc(s)}">`).join("")}</div></div>`).join("") + `</div>`;
    }
    const root = document.getElementById("print-root");
    root.innerHTML = h;
    document.body.classList.add("printing");
    const prevTitle = document.title; document.title = title;
    const imgs = [...root.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })));
    Promise.all(imgs).then(() => setTimeout(() => {
      window.print();
      setTimeout(() => { document.body.classList.remove("printing"); root.innerHTML = ""; document.title = prevTitle; }, 500);
    }, 150));
  }
  function alertBox(msg) { const el = document.getElementById("toast"); el.textContent = msg; el.style.display = "block"; setTimeout(() => (el.style.display = "none"), 2500); }

  /* ---------------- events ---------------- */
  function bind() {
    const $ = (id) => document.getElementById(id);
    $("search").addEventListener("input", (e) => { S.search = e.target.value.trim().toLowerCase(); clearTimeout(bind.t); bind.t = setTimeout(() => refresh(true), 200); });
    document.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", () => {
      const d = +b.dataset.diff; S.diff.has(d) ? S.diff.delete(d) : S.diff.add(d); b.classList.toggle("on", S.diff.has(d)); refresh(true);
    }));
    document.querySelectorAll("[data-kind]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.kind; S.kinds.has(k) ? S.kinds.delete(k) : S.kinds.add(k); b.classList.toggle("on", S.kinds.has(k)); refresh(true);
    }));
    $("sort").addEventListener("change", (e) => { S.sort = e.target.value; refresh(); });
    $("group").addEventListener("change", (e) => { S.group = e.target.value; refresh(); });
    $("answers").checked = S.showAnswers;
    $("answers").addEventListener("change", (e) => { S.showAnswers = e.target.checked; store.set("showAnswers", S.showAnswers); refresh(); });
    $("hide-empty").addEventListener("change", (e) => { S.hideEmpty = e.target.checked; buildTree(); });
    $("clear-topics").addEventListener("click", () => { S.sel.clear(); refresh(true); });
    $("reset").addEventListener("click", () => {
      S.sel.clear(); S.papers.clear(); S.diff = new Set([1, 2, 3, 4, 5]); S.kinds = new Set(["mc", "written"]); S.search = ""; $("search").value = "";
      document.querySelectorAll("[data-diff],[data-kind]").forEach((b) => b.classList.add("on")); buildPapers(); refresh(true);
    });
    $("tree").addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.dp) { t.checked ? S.sel.add(t.dataset.dp) : S.sel.delete(t.dataset.dp); refresh(false); }
      else if (t.dataset.group) { for (const id of dpsUnder(t.dataset.group)) t.checked ? S.sel.add(id) : S.sel.delete(id); refresh(true); }
    });
    $("tree").addEventListener("click", (e) => { if (e.target.matches("summary input")) e.stopPropagation(); }, true);
    $("papers").addEventListener("change", (e) => { const id = e.target.dataset.paper; if (!id) return; e.target.checked ? S.papers.add(id) : S.papers.delete(id); refresh(true); });
    $("questions").addEventListener("click", (e) => {
      const a = e.target.closest("[data-ans]");
      if (a) { const id = a.dataset.ans; S.opened.has(id) ? S.opened.delete(id) : S.opened.add(id); const q = S.data.questions.find((x) => x.id === id); const el = document.getElementById(id); const num = el.querySelector(".q-title").firstChild.textContent.replace(/\D/g, ""); el.outerHTML = qHtml(q, +num); }
    });
    $("questions").addEventListener("change", (e) => { const id = e.target.dataset.pick; if (!id) return; e.target.checked ? S.basket.add(id) : S.basket.delete(id); updateBasket(); });
    $("add-all").addEventListener("click", () => { const l = sorted(S.data.questions.filter(passes)); l.forEach((q) => S.basket.add(q.id)); render(); updateBasket(); alertBox(`Added ${l.length} questions to the PDF.`); });
    const drawer = $("drawer"), scrim = $("scrim"), side = $("sidebar");
    const close = () => { drawer.classList.remove("show"); side.classList.remove("show"); scrim.classList.remove("show"); };
    $("basket-open").addEventListener("click", () => { drawer.classList.add("show"); scrim.classList.add("show"); });
    $("filters-open").addEventListener("click", () => { side.classList.add("show"); scrim.classList.add("show"); });
    scrim.addEventListener("click", close); $("drawer-close").addEventListener("click", close);
    $("basket-list").addEventListener("click", (e) => { const id = e.target.dataset.unpick; if (id) { S.basket.delete(id); render(); updateBasket(); } });
    $("basket-clear").addEventListener("click", () => { S.basket.clear(); render(); updateBasket(); });
    $("make-pdf").addEventListener("click", () => { close(); buildPdf(); });
  }

  /* ---------------- boot ---------------- */
  document.addEventListener("DOMContentLoaded", async () => {
    try { await load(); } catch (e) { document.getElementById("questions").innerHTML = `<div class="none">Could not load questions (${esc(e.message)}).</div>`; return; }
    document.getElementById("generated").textContent = S.data.generated ? `Last updated ${S.data.generated}.` : "";
    const ps = Object.values(S.data.papers);
    document.getElementById("sources").textContent = ps.length
      ? `${S.data.questions.length} questions from ${ps.length} paper${ps.length === 1 ? "" : "s"}, tagged to the NESA ${COURSE_NAME} 11–12 (2024) syllabus. Content outside that syllabus has been removed.`
      : "No papers indexed yet — new trial papers are added daily.";
    buildPapers(); buildTree(); bind(); render(); updateBasket();
  });
})();
