// Hero scene: the 4×GB200 machine + the 40-layer tower one decode token climbs.
// Timing model: bs1 = 3.20 ms measured TPOT (stable decode window); bs128 = 12.71 ms.
(function () {
  const host = document.getElementById('machine');
  if (!host || !window.THREE) return;
  const C = {
    bg: 0x0e1320, token: 0xffcf5a, hbm: 0xe08a4a, sm: 0x8f84ff, nv: 0x45c6e8,
    kv: 0x5fd3a0, cpu: 0xc9d1e0, idle: 0x4a5570, line: 0x2a3550,
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(C.bg);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.bg, 38, 90);
  const cam = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x10131c, 0.75));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(8, 20, 12); scene.add(dl);

  const std = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.25 }, o));
  const labels = [];
  const labelLayer = host.querySelector('.labels');
  function label(text, pos, cls = '') {
    const el = document.createElement('div');
    el.className = 'lbl ' + cls; el.textContent = text; labelLayer.appendChild(el);
    labels.push({ el, pos }); return el;
  }

  // ---- board ----
  const board = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 16), std(0x141b2b, { roughness: 0.9 }));
  board.position.y = -0.2; scene.add(board);
  const grid = new THREE.GridHelper(30, 30, C.line, 0x1b2336); grid.position.y = 0.01; grid.scale.z = 16 / 30; scene.add(grid);

  // GPUs: x positions; Grace CPUs behind pairs
  const gpuX = [-10.5, -3.5, 3.5, 10.5];
  const gpus = gpuX.map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 0, 2);
    const sub = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.3, 5.2), std(0x1d2740)); sub.position.y = 0.15; g.add(sub);
    const die = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.35, 2.6), std(C.sm, { emissive: C.sm, emissiveIntensity: 0.15 }));
    die.position.y = 0.47; g.add(die);
    const hbms = [];
    for (let k = 0; k < 8; k++) {
      const side = k < 4 ? -1 : 1;
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.9), std(C.hbm, { emissive: C.hbm, emissiveIntensity: 0.05 }));
      h.position.set(-1.35 + (k % 4) * 0.9, 0.65, side * 1.95); g.add(h); hbms.push(h);
    }
    scene.add(g);
    label(`GPU${i} · B200`, new THREE.Vector3(x, 0.2, 5.4), 'gpu');
    return { g, die, hbms };
  });
  label('HBM3e 185 GiB · 8 TB/s', new THREE.Vector3(gpuX[0], 1.4, 4.1), 'hbm');

  const graces = [-7, 7].map((x, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.6, 2.6), std(C.cpu, { emissive: C.cpu, emissiveIntensity: 0.05, metalness: 0.4 }));
    m.position.set(x, 0.3, -4.6); scene.add(m);
    label(`Grace CPU${i} · 480 GB LPDDR5X`, new THREE.Vector3(x, 0.2, -6.4), 'cpu');
    // C2C bridges to its two GPUs
    [gpuX[i * 2], gpuX[i * 2 + 1]].forEach(gx => {
      const a = new THREE.Vector3(x, 0.35, -3.3), b = new THREE.Vector3(gx, 0.35, -0.6);
      const len = a.distanceTo(b);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, len), std(C.cpu, { transparent: true, opacity: 0.45 }));
      br.position.copy(a).add(b).multiplyScalar(0.5); br.lookAt(b); scene.add(br);
    });
    return m;
  });
  label('NVLink-C2C 900 GB/s', new THREE.Vector3(-5.2, 0.6, -2.0), 'cpu small');

  // NVLink full mesh arcs (NV18 between every pair)
  const nvArcs = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = new THREE.Vector3(gpuX[i], 0.9, 4.2), b = new THREE.Vector3(gpuX[j], 0.9, 4.2);
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.0 + (j - i) * 0.9; mid.z += 0.6 + (j - i) * 0.5;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05, 6, false),
      new THREE.MeshBasicMaterial({ color: C.nv, transparent: true, opacity: 0.35 }));
    scene.add(tube); nvArcs.push({ curve, tube });
  }
  label('NVLink 5 · 任意两卡 NV18 · 单向 900 GB/s', new THREE.Vector3(0, 4.4, 6.2), 'nv');

  // ---- 40-layer tower spanning the 4 GPUs (TP4: every layer runs on all 4) ----
  // layer types from config (0-index): ratio 0 → L0,L1 (SWA only); m=2 → L2–19; m=1 → L20–39
  const KV_SRC = [2, 8, 14, 20], FULL = [2, 8, 14, 20], REINDEX = [24, 28, 32, 36], ENGRAM = [1, 14];
  const towerBase = 2.4, slabH = 0.12, gap = 0.2;
  const layerY = l => towerBase + l * (slabH + gap) + (l >= 20 ? 0.9 : 0);
  const slabGeo = new THREE.BoxGeometry(26, slabH, 3.4);
  const edgeGeo = new THREE.EdgesGeometry(slabGeo);
  const slabs = [];
  for (let l = 0; l < 40; l++) {
    let col = l < 2 ? 0x7d8aa8 : l < 20 ? 0x5f86c8 : 0x9a85e6;
    const m = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.06, depthWrite: false, roughness: 0.7, emissive: col, emissiveIntensity: 0.1 }));
    m.position.set(0, layerY(l), 2); scene.add(m); slabs.push(m);
    const edge = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.55 }));
    edge.position.copy(m.position); scene.add(edge);
    if (KV_SRC.includes(l)) {
      const kvb = new THREE.Mesh(new THREE.BoxGeometry(26.4, slabH * 0.6, 0.25), std(C.kv, { emissive: C.kv, emissiveIntensity: 0.4 }));
      kvb.position.set(0, layerY(l), 3.9); scene.add(kvb);
    }
    if (ENGRAM.includes(l)) {
      const eb = new THREE.Mesh(new THREE.BoxGeometry(26.4, slabH * 0.6, 0.25), std(C.hbm, { emissive: C.hbm, emissiveIntensity: 0.5 }));
      eb.position.set(0, layerY(l), 0.1); scene.add(eb);
    }
  }
  label('Encoder L0–19（m=2，L0–1 只有 SWA）', new THREE.Vector3(-13.6, layerY(9), 3.8), 'enc');
  label('Decoder L20–39（m=1）', new THREE.Vector3(-13.6, layerY(30), 3.8), 'dec');
  label('KV source 层 2·8·14·20', new THREE.Vector3(13.4, layerY(8), 4.2), 'kv');
  label('Engram 层 1·14', new THREE.Vector3(13.4, layerY(1), 0.1), 'hbmL');
  const lmY = layerY(39) + 1.0;
  const lm = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 3.4), new THREE.MeshStandardMaterial({ color: 0x8a6a2a, transparent: true, opacity: 0.4, emissive: 0x8a6a2a, emissiveIntensity: 0.2 }));
  lm.position.set(0, lmY, 2); scene.add(lm);
  label('lm_head · vocab 129,280', new THREE.Vector3(13.4, lmY, 2), 'tok');

  // ---- tokens: one amber "shard" per GPU column (TP4 = same token on all 4) ----
  const tokGeo = new THREE.SphereGeometry(0.32, 20, 14);
  const tokMat = new THREE.MeshStandardMaterial({ color: C.token, emissive: C.token, emissiveIntensity: 1.1 });
  const toks = gpuX.map(x => { const t = new THREE.Mesh(tokGeo, tokMat); t.position.set(x, 1, 2); scene.add(t); return t; });
  const glow = new THREE.PointLight(C.token, 1.4, 9); scene.add(glow);
  // bs128 swarm
  const SW = 128;
  const swarm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: C.token, emissive: C.token, emissiveIntensity: 0.9 }), SW * 4);
  swarm.visible = false; scene.add(swarm);
  const jitter = []; let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < SW * 4; i++) jitter.push([(rnd() - 0.5) * 4.4, (rnd() - 0.5) * 0.16, (rnd() - 0.5) * 3]);
  const dummy = new THREE.Object3D();

  // host-side token (scheduler on Grace → into GPUs)
  const hostTok = new THREE.Mesh(tokGeo, tokMat); scene.add(hostTok);

  // pulses on NVLink during collectives
  const pulseGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const pulses = nvArcs.map(a => { const p = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: C.nv })); p.visible = false; scene.add(p); return { p, a }; });

  // ---- timeline model of one step ----
  // phases in fractions of the step; per layer: attn, AR, (engram), moe, AR
  const state = { bs: 1, t: 0, playing: !reduce, speed: 1 };
  const STEP_MS = { 1: 3.20, 128: 12.71 };
  const phases = [];
  phases.push({ k: 'host', name: 'Scheduler（Grace）准备 batch → 拷入 CUDA graph 输入缓冲', w: 1.6 });
  phases.push({ k: 'embed', name: 'Embedding（vocab 按 TP 切）→ 展开成 4 路 mHC residual', w: 1.2 });
  for (let l = 0; l < 40; l++) {
    phases.push({ k: 'attn', l, name: `L${l} Attention${FULL.includes(l) ? ' · indexer Full 打分' : REINDEX.includes(l) ? ' · indexer Reindex' : ''}${KV_SRC.includes(l) ? ' · 写 KV' : ''}`, w: 1 });
    phases.push({ k: 'ar', l, name: `L${l} all-reduce（attention 输出，每卡 bs×5120×2 B）`, w: 0.45 });
    if (ENGRAM.includes(l)) phases.push({ k: 'engram', l, name: `L${l} Engram：n-gram 哈希查表（表按行切在 4 卡 HBM）`, w: 0.6 });
    phases.push({ k: 'moe', l, name: `L${l} MoE：router → top-6 routed + 1 shared expert（FP4，TP4）`, w: 1 });
    phases.push({ k: 'ar', l, name: `L${l} all-reduce（MoE 输出）`, w: 0.45 });
  }
  phases.push({ k: 'head', name: 'mHC 合流 → final norm → lm_head（每卡 1/4 词表）→ logits', w: 1.4 });
  phases.push({ k: 'sample', name: '采样 → next token id → 回到 Scheduler / Detokenizer', w: 1.4 });
  const W = phases.reduce((a, p) => a + p.w, 0);
  let acc = 0; phases.forEach(p => { p.a = acc / W; acc += p.w; p.b = acc / W; });

  const hud = {
    t: host.querySelector('[data-hud=t]'), total: host.querySelector('[data-hud=total]'),
    ph: host.querySelector('[data-hud=phase]'), bar: host.querySelector('[data-hud=bar]'),
  };
  const btnPlay = document.getElementById('hero-play');
  const scrub = document.getElementById('hero-scrub');
  document.querySelectorAll('[data-bs]').forEach(b => b.addEventListener('click', () => {
    state.bs = +b.dataset.bs;
    document.querySelectorAll('[data-bs]').forEach(x => x.setAttribute('aria-pressed', x === b));
    swarm.visible = state.bs > 1; toks.forEach(t => t.visible = state.bs === 1);
    hud.total.textContent = STEP_MS[state.bs].toFixed(2);
  }));
  btnPlay.addEventListener('click', () => { state.playing = !state.playing; syncPlay(); });
  function syncPlay() { btnPlay.textContent = state.playing ? '❚❚ 暂停' : '▶ 播放'; btnPlay.setAttribute('aria-pressed', state.playing); }
  syncPlay();
  scrub.addEventListener('input', () => { state.t = scrub.value / 1000; state.playing = false; syncPlay(); });

  // ---- orbit ----
  const orb = { th: -0.35, ph: 0.26, r: 50, tgt: new THREE.Vector3(0, 5.2, 0.5), auto: !reduce, drag: null };
  const el = renderer.domElement;
  el.addEventListener('pointerdown', e => { orb.drag = [e.clientX, e.clientY]; orb.auto = false; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!orb.drag) return;
    orb.th -= (e.clientX - orb.drag[0]) * 0.005; orb.ph = Math.min(1.35, Math.max(0.05, orb.ph + (e.clientY - orb.drag[1]) * 0.004));
    orb.drag = [e.clientX, e.clientY];
  });
  el.addEventListener('pointerup', () => orb.drag = null);
  el.addEventListener('wheel', e => { e.preventDefault(); orb.auto = false; orb.r = Math.min(80, Math.max(18, orb.r * (1 + e.deltaY * 0.001))); }, { passive: false });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h); cam.aspect = w / h;
    cam.fov = w < 600 ? 62 : 36; if (w < 600 && orb.auto) orb.r = 58; cam.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host); resize();

  let visible = true;
  new IntersectionObserver(es => visible = es[0].isIntersecting).observe(host);

  const tmp = new THREE.Vector3();
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!visible || document.hidden) return;
    if (state.playing) { state.t += dt / (state.bs === 1 ? 9 : 14) * state.speed; if (state.t >= 1) state.t = 0; scrub.value = Math.round(state.t * 1000); }
    if (orb.auto) orb.th += dt * 0.05;
    cam.position.set(orb.tgt.x + orb.r * Math.cos(orb.ph) * Math.sin(orb.th), orb.tgt.y + orb.r * Math.sin(orb.ph), orb.tgt.z + orb.r * Math.cos(orb.ph) * Math.cos(orb.th));
    cam.lookAt(orb.tgt);

    // locate phase
    const t = state.t;
    const p = phases.find(q => t >= q.a && t < q.b) || phases[phases.length - 1];
    const u = (t - p.a) / (p.b - p.a);
    hud.t.textContent = (t * STEP_MS[state.bs]).toFixed(3);
    hud.ph.textContent = p.name; hud.bar.style.width = (t * 100) + '%';

    // token y
    let y, hostVis = false, hx = 0, hz = 0;
    if (p.k === 'host') { hostVis = true; y = 0.9; hx = -7 + 0; hz = -4.6 + u * 4; }
    else if (p.k === 'embed') y = 0.9 + u * (towerBase - 0.9);
    else if (p.k === 'head') y = layerY(39) + u * (lmY - layerY(39));
    else if (p.k === 'sample') { y = lmY + 0.4; hostVis = u > 0.45; hx = 7; hz = -4.6 + (1 - u) * 3; }
    else y = layerY(p.l) + (p.k === 'moe' ? 0.08 : p.k === 'ar' ? 0.12 : 0);
    hostTok.visible = hostVis; hostTok.position.set(hx, 0.95, hz);
    const tokVis = !(p.k === 'host') && !(p.k === 'sample' && u > 0.45);
    toks.forEach((tk, i) => { tk.visible = tokVis && state.bs === 1; tk.position.set(gpuX[i], y, 2); });
    glow.position.set(0, hostVis ? 2 : y + 1, 2);
    if (state.bs > 1) {
      swarm.visible = tokVis;
      for (let i = 0; i < SW * 4; i++) {
        const j = jitter[i], gi = i % 4;
        dummy.position.set(gpuX[gi] + j[0] * 0.55, y + j[1], 2 + j[2] * 0.7); dummy.updateMatrix(); swarm.setMatrixAt(i, dummy.matrix);
      }
      swarm.instanceMatrix.needsUpdate = true;
    }
    // slab highlight
    slabs.forEach((s, l) => { const on = p.l === l; s.material.opacity = on ? 0.7 : 0.06; s.material.emissiveIntensity = on ? (p.k === 'moe' ? 0.6 : 0.4) : 0.05; });
    // HBM glow during weight reads (attn / moe / engram / head), die glow
    const reading = ['attn', 'moe', 'engram', 'head', 'embed'].includes(p.k);
    const hbmI = reading ? (p.k === 'moe' ? (state.bs > 1 ? 1.0 : 0.45) : p.k === 'engram' ? 0.8 : 0.35) * (0.6 + 0.4 * Math.sin(now * 0.02)) : 0.03;
    gpus.forEach(g => { g.hbms.forEach(h => h.material.emissiveIntensity = hbmI); g.die.material.emissiveIntensity = reading ? 0.45 : 0.12; });
    // collectives
    const ar = p.k === 'ar' || p.k === 'engram';
    nvArcs.forEach(a => a.tube.material.opacity = ar ? 0.9 : 0.25);
    pulses.forEach(({ p: m, a }, i) => { m.visible = ar; if (ar) { a.curve.getPoint((u + i * 0.13) % 1, tmp); m.position.copy(tmp); } });
    graces.forEach((g, i) => g.material.emissiveIntensity = (p.k === 'host' && i === 0) || (p.k === 'sample' && i === 1 && u > 0.4) ? 0.6 : 0.05);

    renderer.render(scene, cam);
    const w = host.clientWidth, h = host.clientHeight;
    labels.forEach(L => {
      tmp.copy(L.pos).project(cam);
      const show = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
      L.el.style.display = show ? '' : 'none';
      if (show) L.el.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * w}px, ${(-tmp.y * 0.5 + 0.5) * h}px) translate(-50%,-50%)`;
    });
  }
  requestAnimationFrame(frame);
})();
