// Page-level interactivity: chapter nav, layer map, charts, scene iframes.
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };

  // ---------- chapter nav highlight ----------
  const links = $$('nav.toc a');
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  $$('section.ch').forEach(s => io.observe(s));

  // ---------- scene iframes: load when near the viewport ----------
  const fio = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const f = e.target; if (!f.src && f.dataset.src) f.src = f.dataset.src; fio.unobserve(f);
  }), { rootMargin: '600px 0px' });
  $$('iframe[data-src]').forEach(f => fio.observe(f));

  // ---------- tooltip helper ----------
  function tooltip(box) {
    const tt = document.createElement('div'); tt.className = 'tt'; box.appendChild(tt);
    return {
      show(html, x, y) {
        tt.innerHTML = html; tt.style.opacity = 1;
        const bw = box.clientWidth, w = tt.offsetWidth;
        tt.style.left = Math.min(bw - w - 4, Math.max(4, x + 12)) + 'px'; tt.style.top = (y - 10) + 'px';
      },
      hide() { tt.style.opacity = 0; },
    };
  }

  // ---------- layer map ----------
  const lm = $('#lmap');
  if (lm && window.LAYERS) {
    const det = $('#lmap-detail');
    const colorOf = L => L.kind === 'swa' ? css('--idle') : L.kind === 'full' ? css('--kv') : L.kind === 'reindex' ? css('--nv') : L.l < 20 ? 'color-mix(in srgb,' + css('--sm') + ' 45%,' + css('--surface') + ')' : 'color-mix(in srgb,' + css('--sm') + ' 75%,' + css('--surface') + ')';
    const paint = () => $$('.c', lm).forEach((c, i) => c.style.background = colorOf(window.LAYERS[i]));
    window.LAYERS.forEach(L => {
      const c = document.createElement('div'); c.className = 'c'; c.tabIndex = 0;
      c.setAttribute('aria-label', 'L' + L.l + '：' + L.text.replace(/<[^>]+>/g, ''));
      if (L.engram) c.style.boxShadow = 'inset 0 -6px 0 ' + css('--hbm');
      if (L.kvsrc) c.style.outline = '2px solid ' + css('--kv');
      const on = () => { det.innerHTML = '<b class="mono">L' + L.l + '</b>　' + L.text; $$('.c', lm).forEach(x => x.style.opacity = x === c ? 1 : .55); };
      c.addEventListener('mouseenter', on); c.addEventListener('focus', on); c.addEventListener('click', on);
      lm.appendChild(c);
    });
    lm.addEventListener('mouseleave', () => $$('.c', lm).forEach(x => x.style.opacity = 1));
    const row = $('#lrow'); for (let l = 0; l < 40; l++) { const s = document.createElement('span'); s.textContent = l; if (l % 5) s.className = 'm5'; row.appendChild(s); }
    paint(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paint);
  }

  // ---------- HBM budget (per GPU, TP4) ----------
  function hbm() {
    const box = $('#hbm-chart'); if (!box || !window.HBM) return;
    const svg = box.querySelector('svg'); svg.innerHTML = '';
    const tt = box._tt || (box._tt = tooltip(box));
    const W = 720, H = 92, total = window.HBM.total;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let x = 0;
    window.HBM.parts.forEach(p => {
      const w = p.v / total * W;
      const r = svgEl('rect', { x: x + 1, y: 18, width: Math.max(1, w - 2), height: 40, rx: 3, fill: css(p.color), 'fill-opacity': p.ghost ? .35 : 1 }, svg);
      if (p.ghost) r.setAttribute('stroke', css('--idle')), r.setAttribute('stroke-dasharray', '3 3');
      const hit = svgEl('rect', { x, y: 10, width: w, height: 56, fill: 'transparent' }, svg);
      hit.addEventListener('mousemove', e => { const b = box.getBoundingClientRect(); tt.show(`<b>${p.name}</b><br>${p.v.toFixed(1)} GiB · ${p.src}`, e.clientX - b.left, e.clientY - b.top - 40); });
      hit.addEventListener('mouseleave', tt.hide);
      if (w > 64) { const t = svgEl('text', { x: x + 6, y: 80 }, svg); t.textContent = p.short + ' ' + p.v.toFixed(p.v < 10 ? 1 : 0); }
      x += w;
    });
    // mem fraction marker
    const mf = window.HBM.memFrac * total / total * W;
    svgEl('line', { x1: mf, x2: mf, y1: 8, y2: 64, stroke: css('--ink'), 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, svg);
    const t = svgEl('text', { x: mf - 4, y: 9, 'text-anchor': 'end' }, svg); t.textContent = 'mem_fraction_static 0.87';
    const t2 = svgEl('text', { x: 0, y: 9 }, svg); t2.textContent = '0';
    const t3 = svgEl('text', { x: W, y: 9, 'text-anchor': 'end' }, svg); t3.textContent = total + ' GiB';
  }

  // ---------- batch scaling chart ----------
  function scale() {
    const box = $('#scale-chart'); if (!box || !window.SCALE) return;
    const S = window.SCALE, svg = box.querySelector('svg'); svg.innerHTML = '';
    const tt = box._tt || (box._tt = tooltip(box));
    const W = 720, H = 340, m = { l: 46, r: 16, t: 14, b: 40 };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const bsMax = 512, yMax = 16;
    const X = b => m.l + Math.log2(b) / Math.log2(bsMax) * (W - m.l - m.r);
    const Y = v => H - m.b - v / yMax * (H - m.t - m.b);
    for (let v = 0; v <= yMax; v += 4) {
      svgEl('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), stroke: css('--rule') }, svg);
      const t = svgEl('text', { x: m.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }, svg); t.textContent = v;
    }
    [1, 4, 16, 64, 128, 256, 512].forEach(b => { const t = svgEl('text', { x: X(b), y: H - m.b + 18, 'text-anchor': 'middle' }, svg); t.textContent = b; });
    const tx = svgEl('text', { x: (W + m.l) / 2, y: H - 4, 'text-anchor': 'middle' }, svg); tx.textContent = 'batch size（对数轴）';
    const ty = svgEl('text', { x: m.l - 36, y: m.t + 4 }, svg); ty.textContent = 'ms';
    // TP4 capacity limit
    const cap = S.tpCap; svgEl('rect', { x: X(cap), y: m.t, width: W - m.r - X(cap), height: H - m.t - m.b, fill: css('--idle'), 'fill-opacity': .12 }, svg);
    const ct = svgEl('text', { x: X(cap) + 6, y: m.t + 14 }, svg); ct.textContent = 'TP4 KV 放不下（估算 ≈' + cap + '）';
    // predicted line (bs1 measured + extra expert read)
    const pts = [], rd = [];
    for (let i = 0; i <= 90; i++) { const b = Math.pow(2, i / 10); pts.push([X(b), Y(S.pred(b))]); rd.push([X(b), Y(S.moe(b))]); }
    svgEl('path', { d: 'M' + rd.map(p => p.join(',')).join('L'), fill: 'none', stroke: css('--hbm'), 'stroke-width': 2 }, svg);
    svgEl('path', { d: 'M' + pts.map(p => p.join(',')).join('L'), fill: 'none', stroke: css('--sm'), 'stroke-width': 2, 'stroke-dasharray': '6 4' }, svg);
    // measured points
    S.meas.forEach(p => {
      svgEl('circle', { cx: X(p.bs), cy: Y(p.v), r: 6, fill: css('--token'), stroke: css('--surface'), 'stroke-width': 2 }, svg);
      const t = svgEl('text', { x: X(p.bs) + (p.bs > 64 ? -10 : 10), y: Y(p.v) - 10, 'text-anchor': p.bs > 64 ? 'end' : 'start', style: 'fill:' + css('--ink') + ';font-weight:600' }, svg); t.textContent = p.v.toFixed(2) + ' ms 实测';
    });
    // hover crosshair
    const ch = svgEl('line', { y1: m.t, y2: H - m.b, stroke: css('--muted'), 'stroke-width': 1, opacity: 0 }, svg);
    const hit = svgEl('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' }, svg);
    hit.addEventListener('mousemove', e => {
      const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * W;
      const b = Math.max(1, Math.min(bsMax, Math.round(Math.pow(2, (sx - m.l) / (W - m.l - m.r) * Math.log2(bsMax)))));
      ch.setAttribute('x1', X(b)); ch.setAttribute('x2', X(b)); ch.setAttribute('opacity', 1);
      const bb = box.getBoundingClientRect();
      tt.show(`bs ${b}<br>激活 expert ≈ ${S.U(b).toFixed(0)} / 384<br>每 expert 平均 ${(b * 6 / S.U(b)).toFixed(1)} token<br>expert 读取 ≈ ${S.moe(b).toFixed(2)} ms<br>预测 TPOT ≈ ${S.pred(b).toFixed(1)} ms`, e.clientX - bb.left, e.clientY - bb.top - 60);
    });
    hit.addEventListener('mouseleave', () => { tt.hide(); ch.setAttribute('opacity', 0); });
  }

  function budget() {
    const box = $('#budget-bar'); if (!box || !window.BUDGET) return;
    const tot = window.BUDGET.total; box.innerHTML = '';
    const lg = $('#budget-legend'); if (lg) lg.innerHTML = '';
    window.BUDGET.parts.forEach(p => {
      const d = document.createElement('div'); d.style.flex = p.v / tot; d.style.background = css(p.color);
      if (p.ghost) d.style.background = 'repeating-linear-gradient(135deg,' + css('--idle') + ' 0 4px, transparent 4px 8px)';
      d.title = p.name + '：' + p.v.toFixed(2) + ' ms'; box.appendChild(d);
      if (lg) { const s = document.createElement('span'); s.innerHTML = `<i style="background:${p.ghost ? css('--idle') : css(p.color)}"></i>${p.name} <b class="mono">${p.v.toFixed(2)}</b>`; lg.appendChild(s); }
    });
  }

  const tb = $('#scale-table');
  if (tb && window.SCALE) {
    const S = window.SCALE;
    tb.innerHTML = S.rows.map(b => { const m = S.meas.find(p => p.bs === b);
      return `<tr><td class="num">${b}</td><td class="num">${S.U(b).toFixed(0)}</td><td class="num">${(b * 6 / S.U(b)).toFixed(1)}</td><td class="num">${S.moe(b).toFixed(2)} ms</td><td class="num">${S.pred(b).toFixed(1)} ms</td><td class="num">${m ? '<b>' + m.v.toFixed(2) + '</b>' : (b > S.tpCap ? '放不下' : '—')}</td></tr>`; }).join('');
  }
  const draw = () => { hbm(); scale(); budget(); };
  draw();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);
  new MutationObserver(draw).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
})();
