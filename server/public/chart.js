// FortunaChart — gráfico financiero interactivo estilo TradingView, sin dependencias.
// Arrastrar para mover · pellizcar o rueda para zoom · arrastrar la escala de precios para estirar
// (doble toque en la escala = automática) · pulsación larga = cruz · herramientas de dibujo editables.
(function () {
  // ---------- indicadores (funciones puras) ----------
  const ema = (a, n) => { const k = 2 / (n + 1), o = new Array(a.length); for (let i = 0; i < a.length; i++) o[i] = i ? a[i] * k + o[i - 1] * (1 - k) : a[i]; return o; };
  function bands(c, n, k) {
    const U = [], M = [], D = []; let s = 0, s2 = 0;
    for (let i = 0; i < c.length; i++) {
      s += c[i]; s2 += c[i] * c[i];
      if (i >= n) { s -= c[i - n]; s2 -= c[i - n] * c[i - n]; }
      if (i < n - 1) { U.push(null); M.push(null); D.push(null); continue; }
      const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)); M.push(m); U.push(m + k * sd); D.push(m - k * sd);
    }
    return { U, M, D };
  }
  function rsi(c, n) {
    const o = [null]; let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0);
      if (i <= n) { g += u / n; l += w / n; o.push(i < n ? null : 100 - 100 / (1 + g / (l || 1e-12))); continue; }
      g = (g * (n - 1) + u) / n; l = (l * (n - 1) + w) / n; o.push(100 - 100 / (1 + g / (l || 1e-12)));
    }
    return o;
  }
  function macd(c, f, s, g) { const a = ema(c, f), b = ema(c, s), m = c.map((_, i) => a[i] - b[i]), sg = ema(m, g); return { m, sg, h: m.map((v, i) => v - sg[i]) }; }
  function pivots(d, step) {
    if (d.length < 2) return [];
    let prev;
    if (step >= 864e5) { const p = d[d.length - 2]; prev = { h: p.high, l: p.low, c: p.close }; }
    else {
      const day = t => Math.floor(t / 864e5), today = day(d[d.length - 1].time); let h = -Infinity, l = Infinity, c = null, found = null;
      for (let i = d.length - 1; i >= 0; i--) { const k = day(d[i].time); if (k === today) continue; if (found === null) found = k; if (k !== found) break; h = Math.max(h, d[i].high); l = Math.min(l, d[i].low); if (c === null) c = d[i].close; }
      if (found === null) return []; prev = { h, l, c };
    }
    const P = (prev.h + prev.l + prev.c) / 3, r = prev.h - prev.l;
    return [['R2', P + r], ['R1', 2 * P - prev.l], ['P', P], ['S1', 2 * P - prev.h], ['S2', P - r]];
  }
  function heikin(d) { const o = []; d.forEach((x, i) => { const c = (x.open + x.high + x.low + x.close) / 4, op = i ? (o[i - 1].open + o[i - 1].close) / 2 : (x.open + x.close) / 2; o.push({ time: x.time, open: op, close: c, high: Math.max(x.high, op, c), low: Math.min(x.low, op, c) }); }); return o; }
  function analyze(d, step) {
    if (!d || d.length < 30) return null;
    const c = d.map(x => x.close), n = c.length - 1, e20 = ema(c, 20), e50 = ema(c, 50), e200 = ema(c, 200), r = rsi(c, 14), m = macd(c, 12, 26, 9), b = bands(c, 20, 2), w = d.slice(-50);
    const back = Math.min(n, Math.max(1, Math.round(864e5 / step)));
    return { close: c[n], ema20: e20[n], ema50: e50[n], ema200: e200[n], rsi14: r[n], macd: m.m[n], macdSignal: m.sg[n], bbUpper: b.U[n], bbLower: b.D[n], swingHigh50: Math.max(...w.map(x => x.high)), swingLow50: Math.min(...w.map(x => x.low)), change24hPct: (c[n] / c[n - back] - 1) * 100, pivots: Object.fromEntries(pivots(d, step)) };
  }

  const FIB = [0, .236, .382, .5, .618, .786, 1];

  function FortunaChart(wrap) {
    const cv = document.createElement('canvas'); cv.setAttribute('aria-label', 'Gráfico de precios interactivo'); wrap.appendChild(cv);
    const ctx = cv.getContext('2d');
    const S = { data: [], src: [], step: 36e5, digits: 2, type: 'candles', right: 0, barW: 8, auto: true, lo: 0, hi: 1, tool: 'cursor', magnet: false, sel: null, drawings: [], cross: null, measure: null };
    const ind = { ema: { on: true, p: [20, 50, 200] }, bb: { on: false, p: 20, k: 2 }, piv: { on: false }, rsi: { on: true, p: 14 }, macd: { on: false, f: 12, s: 26, g: 9 } };
    let C = {}, K = {}, lay = { W: 0, H: 0, PW: 0, AX: 60, TB: 24, mainH: 0, subH: 0, subs: [] }, raf = 0;
    const cbs = { change: () => {}, cross: () => {}, select: () => {}, tool: () => {} };

    function colors() {
      const p = document.createElement('span'); document.body.appendChild(p);
      const g = v => { p.style.color = `var(${v})`; return getComputedStyle(p).color; };
      C = { ink: g('--ink'), mute: g('--mute'), line: g('--line'), up: g('--up'), dn: g('--dn'), gold: g('--gold'), blue: g('--sky'), bg: g('--surface'), violet: g('--violet'), coral: g('--coral') };
      p.remove();
    }
    function compute() {
      const c = S.data.map(d => d.close);
      K.ema = ind.ema.p.map(n => ema(c, n));
      K.bb = bands(c, ind.bb.p, ind.bb.k);
      K.rsi = rsi(c, ind.rsi.p);
      K.macd = macd(c, ind.macd.f, ind.macd.s, ind.macd.g);
      K.piv = pivots(S.data, S.step);
      S.src = S.type === 'heikin' ? heikin(S.data) : S.data;
    }

    // ---------- coordenadas ----------
    const X = i => lay.PW - (S.right - i) * S.barW;
    const I = x => S.right - (lay.PW - x) / S.barW;
    const Y = p => 6 + (S.hi - p) / (S.hi - S.lo) * (lay.mainH - 12);
    const P = y => S.hi - (y - 6) / (lay.mainH - 12) * (S.hi - S.lo);
    function tAt(i) {
      const d = S.data, n = d.length - 1; if (!d.length) return 0;
      if (i <= 0) return d[0].time + i * S.step;
      if (i >= n) return d[n].time + (i - n) * S.step;
      const a = Math.floor(i), f = i - a; return d[a].time + (d[a + 1].time - d[a].time) * f;
    }
    function iAt(t) {
      const d = S.data, n = d.length - 1; if (!d.length) return 0;
      if (t <= d[0].time) return (t - d[0].time) / S.step;
      if (t >= d[n].time) return n + (t - d[n].time) / S.step;
      let lo = 0, hi = n; while (hi - lo > 1) { const m = (lo + hi) >> 1; d[m].time <= t ? lo = m : hi = m; }
      return lo + (t - d[lo].time) / (d[hi].time - d[lo].time);
    }
    const fmtP = v => v == null || !isFinite(v) ? '' : Number(v).toFixed(S.digits);
    function niceStep(r) { const p = 10 ** Math.floor(Math.log10(r)), m = r / p; return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p; }
    const tf = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' }), df = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }), ff = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

    function clampView() {
      const n = S.data.length; if (!n) return;
      S.barW = Math.max(1.5, Math.min(60, S.barW));
      const vis = lay.PW / S.barW; S.right = Math.max(Math.min(vis * .3, n - 1), Math.min(S.right, n - 1 + vis * .7));
    }
    function autoRange() {
      const a = Math.max(0, Math.floor(I(0))), b = Math.min(S.src.length - 1, Math.ceil(I(lay.PW)));
      let hi = -Infinity, lo = Infinity;
      for (let i = a; i <= b; i++) { hi = Math.max(hi, S.src[i].high); lo = Math.min(lo, S.src[i].low); if (ind.bb.on && K.bb.U[i] != null) { hi = Math.max(hi, K.bb.U[i]); lo = Math.min(lo, K.bb.D[i]); } }
      if (!isFinite(hi)) return; const pad = (hi - lo) * .08 || hi * .001; S.hi = hi + pad; S.lo = lo - pad;
    }
    const req = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

    // ---------- dibujo ----------
    function draw() {
      if (!C.ink) colors();
      const W = wrap.clientWidth, H = wrap.clientHeight, dpr = window.devicePixelRatio || 1; if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const subs = H < 250 ? [] : [ind.rsi.on && 'rsi', ind.macd.on && 'macd'].filter(Boolean).slice(0, H < 380 ? 1 : 2);
      lay = { W, H, AX: W < 520 ? 58 : 66, TB: 24, subs }; lay.PW = W - lay.AX; lay.subH = subs.length ? Math.round(H * (subs.length > 1 ? .17 : .2)) : 0; lay.mainH = H - lay.TB - lay.subH * subs.length;
      if (!S.data.length) return;
      clampView(); if (S.auto) autoRange();
      const { PW, AX, TB, mainH } = lay, a = Math.max(0, Math.floor(I(0)) - 1), b = Math.min(S.src.length - 1, Math.ceil(I(PW)) + 1);
      ctx.font = '11px Outfit, system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
      // rejilla horizontal + escala de precios
      const st = niceStep((S.hi - S.lo) / Math.max(3, Math.round(mainH / 60)));
      ctx.strokeStyle = C.line; ctx.fillStyle = C.mute; ctx.textAlign = 'left';
      for (let v = Math.ceil(S.lo / st) * st; v <= S.hi; v += st) { const y = Math.round(Y(v)) + .5; ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(fmtP(v), PW + 7, y); }
      // rejilla vertical + tiempos
      const every = Math.max(1, Math.ceil(84 / S.barW)); ctx.textAlign = 'center';
      for (let i = Math.floor(b / every) * every; i >= a; i -= every) {
        const x = Math.round(X(i)) + .5; if (x < 20 || x > PW - 20 || !S.data[i]) continue;
        ctx.globalAlpha = .35; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - TB); ctx.stroke(); ctx.globalAlpha = 1;
        const t = S.data[i].time, prev = S.data[i - every]; const newDay = !prev || Math.floor(prev.time / 864e5) !== Math.floor(t / 864e5);
        ctx.fillText(S.step >= 864e5 || newDay ? df.format(t) : tf.format(t), x, H - TB / 2);
      }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, PW, mainH); ctx.clip();
      // Bollinger
      if (ind.bb.on) {
        ctx.fillStyle = C.blue; ctx.globalAlpha = .07; ctx.beginPath(); let f = true;
        for (let i = a; i <= b; i++) if (K.bb.U[i] != null) { f ? ctx.moveTo(X(i), Y(K.bb.U[i])) : ctx.lineTo(X(i), Y(K.bb.U[i])); f = false; }
        for (let i = b; i >= a; i--) if (K.bb.D[i] != null) ctx.lineTo(X(i), Y(K.bb.D[i]));
        ctx.fill(); ctx.globalAlpha = 1; line(K.bb.U, C.blue, 1, a, b, Y); line(K.bb.D, C.blue, 1, a, b, Y); line(K.bb.M, C.blue, 1, a, b, Y, [4, 4]);
      }
      series(a, b);
      if (ind.ema.on) { const cs = [C.gold, C.blue, C.violet]; K.ema.forEach((e, k) => line(e, cs[k], 1.5, a, b, Y)); }
      if (ind.piv.on) K.piv.forEach(([k, v]) => { const y = Y(v); ctx.strokeStyle = k === 'P' ? C.mute : k[0] === 'R' ? C.dn : C.up; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = ctx.strokeStyle; ctx.textAlign = 'left'; ctx.fillText(k, 6, y - 8); });
      drawings();
      if (S.measure) measure();
      ctx.restore();
      // último precio + cuenta atrás
      const last = S.data[S.data.length - 1], up = last.close >= last.open, ly = Y(last.close);
      if (ly > 0 && ly < mainH) {
        ctx.strokeStyle = up ? C.up : C.dn; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(PW, ly); ctx.stroke(); ctx.setLineDash([]);
        const left = last.time + S.step - Date.now(), cd = left > 0 ? (left >= 36e5 ? `${Math.floor(left / 36e5)}:` : '') + new Date(left).toISOString().slice(left >= 36e5 ? 14 : 14, 19) : '';
        tag(fmtP(last.close), ly, up ? C.up : C.dn, '#fff', cd);
      }
      S.drawings.forEach(d => { if (d.type === 'hline') tag(fmtP(d.p[0].price), Y(d.p[0].price), d.color, '#111'); });
      subs.forEach((s, k) => sub(s, mainH + k * lay.subH, lay.subH, a, b));
      // cruz
      if (S.cross) {
        const { x, y } = S.cross, i = Math.round(I(x)), cx = S.data[i] ? X(i) : x;
        ctx.strokeStyle = C.mute; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H - TB); ctx.stroke();
        if (y < mainH) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(PW, y); ctx.stroke(); ctx.setLineDash([]); tag(fmtP(P(y)), y, C.ink, C.bg); }
        ctx.setLineDash([]);
        const t = tAt(i), txt = S.step >= 864e5 ? df.format(t) : ff.format(t); ctx.font = '11px Outfit, system-ui, sans-serif'; const tw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = C.ink; roundRect(Math.min(PW - tw, Math.max(0, cx - tw / 2)), H - TB + 2, tw, TB - 4, 5); ctx.fill(); ctx.fillStyle = C.bg; ctx.textAlign = 'center'; ctx.fillText(txt, Math.min(PW - tw / 2, Math.max(tw / 2, cx)), H - TB / 2);
        cbs.cross(S.data[i] ? i : null);
      }
    }
    function series(a, b) {
      const src = S.src, bw = Math.max(1, S.barW * .7);
      if (S.type === 'line' || S.type === 'area') {
        ctx.beginPath(); for (let i = a; i <= b; i++) { const x = X(i), y = Y(src[i].close); i === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        if (S.type === 'area') { ctx.save(); ctx.lineTo(X(b), lay.mainH); ctx.lineTo(X(a), lay.mainH); ctx.closePath(); const g = ctx.createLinearGradient(0, 0, 0, lay.mainH); g.addColorStop(0, C.gold.replace('rgb(', 'rgba(').replace(')', ',.35)')); g.addColorStop(1, C.gold.replace('rgb(', 'rgba(').replace(')', ',0)')); ctx.fillStyle = g; ctx.fill(); ctx.restore(); ctx.beginPath(); for (let i = a; i <= b; i++) { const x = X(i), y = Y(src[i].close); i === a ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } }
        ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; return;
      }
      for (let i = a; i <= b; i++) {
        const d = src[i], x = Math.round(X(i)) + .5, up = d.close >= d.open; ctx.strokeStyle = ctx.fillStyle = up ? C.up : C.dn;
        if (S.type === 'bars') { const t = Math.max(2, bw / 2); ctx.beginPath(); ctx.moveTo(x, Y(d.high)); ctx.lineTo(x, Y(d.low)); ctx.moveTo(x - t, Y(d.open)); ctx.lineTo(x, Y(d.open)); ctx.moveTo(x, Y(d.close)); ctx.lineTo(x + t, Y(d.close)); ctx.stroke(); continue; }
        ctx.beginPath(); ctx.moveTo(x, Y(d.high)); ctx.lineTo(x, Y(d.low)); ctx.stroke();
        const y1 = Y(Math.max(d.open, d.close)), y2 = Y(Math.min(d.open, d.close)); ctx.fillRect(Math.round(x - bw / 2), y1, Math.max(1, Math.round(bw)), Math.max(1, y2 - y1));
      }
    }
    function line(arr, color, w, a, b, Yf, dash) { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.beginPath(); let f = true; for (let i = a; i <= b; i++) { if (arr[i] == null) continue; f ? ctx.moveTo(X(i), Yf(arr[i])) : ctx.lineTo(X(i), Yf(arr[i])); f = false; } ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function tag(text, y, bg, fg, extra) {
      if (y < 0 || y > lay.mainH) return; const h = extra ? 32 : 20; ctx.fillStyle = bg; roundRect(lay.PW + 2, y - 10, lay.AX - 4, h, 5); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.font = '600 11px Outfit, system-ui, sans-serif'; ctx.fillText(text, lay.PW + 7, y); ctx.font = '11px Outfit, system-ui, sans-serif';
      if (extra) { ctx.globalAlpha = .85; ctx.fillText(extra, lay.PW + 7, y + 13); ctx.globalAlpha = 1; }
    }
    function sub(s, top, h, a, b) {
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, top + .5); ctx.lineTo(lay.W, top + .5); ctx.stroke();
      const ci = S.cross ? Math.round(I(S.cross.x)) : S.data.length - 1;
      ctx.textAlign = 'left'; ctx.fillStyle = C.mute;
      ctx.save(); ctx.beginPath(); ctx.rect(0, top, lay.W, h); ctx.clip();
      if (s === 'rsi') {
        const y = v => top + 6 + (100 - v) / 100 * (h - 12);
        ctx.fillStyle = C.violet; ctx.globalAlpha = .06; ctx.fillRect(0, y(70), lay.PW, y(30) - y(70)); ctx.globalAlpha = 1;
        [30, 70].forEach(v => { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(0, y(v)); ctx.lineTo(lay.PW, y(v)); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = C.mute; ctx.fillText(v, lay.PW + 7, y(v)); });
        ctx.save(); ctx.beginPath(); ctx.rect(0, top, lay.PW, h); ctx.clip(); line(K.rsi, C.violet, 1.5, a, b, y); ctx.restore();
        ctx.fillStyle = C.mute; ctx.fillText(`RSI ${ind.rsi.p}  `, 8, top + 12); const v = K.rsi[ci]; if (v != null) { ctx.fillStyle = C.violet; ctx.fillText(v.toFixed(1), 8 + ctx.measureText(`RSI ${ind.rsi.p}  `).width, top + 12); }
      } else {
        let m = 1e-12; for (let i = a; i <= b; i++) if (K.macd.m[i] != null) m = Math.max(m, Math.abs(K.macd.m[i]), Math.abs(K.macd.sg[i]), Math.abs(K.macd.h[i]));
        const y = v => top + h / 2 - v / m * (h / 2 - 8), bw = Math.max(1, S.barW * .6);
        for (let i = a; i <= b; i++) { if (X(i) > lay.PW) break; const v = K.macd.h[i]; ctx.fillStyle = v >= 0 ? C.up : C.dn; ctx.globalAlpha = .45; ctx.fillRect(X(i) - bw / 2, Math.min(y(0), y(v)), bw, Math.abs(y(v) - y(0))); }
        ctx.globalAlpha = 1; ctx.save(); ctx.beginPath(); ctx.rect(0, top, lay.PW, h); ctx.clip(); line(K.macd.m, C.blue, 1.4, a, b, y); line(K.macd.sg, C.coral, 1.4, a, b, y); ctx.restore();
        ctx.fillStyle = C.mute; ctx.fillText(`MACD ${ind.macd.f} ${ind.macd.s} ${ind.macd.g}`, 8, top + 12);
      }
      ctx.restore();
    }
    // ---------- herramientas de dibujo ----------
    const sp = q => ({ x: X(iAt(q.t)), y: Y(q.price) });
    function drawings() {
      for (const d of S.drawings) {
        const sel = d.id === S.sel, pts = d.p.map(sp); ctx.strokeStyle = ctx.fillStyle = d.color; ctx.lineWidth = sel ? 2.2 : 1.6;
        if (d.type === 'trend') { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); }
        else if (d.type === 'hline') { ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(lay.PW, pts[0].y); ctx.stroke(); }
        else if (d.type === 'rect') { const x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y), w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y); ctx.globalAlpha = .14; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1; ctx.strokeRect(x, y, w, h); }
        else if (d.type === 'fib') {
          const x1 = Math.min(pts[0].x, pts[1].x), p1 = d.p[0].price, p2 = d.p[1].price; ctx.textAlign = 'left'; ctx.font = '11px Outfit, system-ui, sans-serif';
          FIB.forEach((f, k) => { const pr = p2 + (p1 - p2) * f, y = Y(pr); ctx.globalAlpha = k === 0 || k === FIB.length - 1 ? 1 : .8; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(lay.PW, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(`${f} (${fmtP(pr)})`, x1 + 4, y - 7); });
          ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke(); ctx.setLineDash([]);
        }
        ctx.lineWidth = 1;
        if (sel) (d.type === 'hline' ? [{ x: lay.PW / 2, y: pts[0].y }] : pts).forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fillStyle = C.bg; ctx.fill(); ctx.strokeStyle = d.color; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1; });
      }
    }
    function measure() {
      const m = S.measure, a = { x: X(m.a.i), y: Y(m.a.price) }, b = { x: X(m.b.i), y: Y(m.b.price) }, up = m.b.price >= m.a.price;
      ctx.fillStyle = up ? C.blue : C.coral; ctx.globalAlpha = .16; ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); ctx.globalAlpha = 1;
      const d = m.b.price - m.a.price, pct = d / m.a.price * 100, bars = Math.round(m.b.i - m.a.i);
      const txt = `${d >= 0 ? '+' : ''}${fmtP(d)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)} %) · ${bars} velas`;
      ctx.font = '600 12px Outfit, system-ui, sans-serif'; const w = ctx.measureText(txt).width + 16, cx = Math.min(lay.PW - w / 2 - 4, Math.max(w / 2 + 4, (a.x + b.x) / 2)), cy = Math.max(16, Math.min(b.y, a.y) - 18);
      ctx.fillStyle = up ? C.blue : C.coral; roundRect(cx - w / 2, cy - 12, w, 24, 6); ctx.fill(); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(txt, cx, cy); ctx.font = '11px Outfit, system-ui, sans-serif';
    }
    function distSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); }
    function hit(p, touch) {
      const tol = touch ? 18 : 9;
      const order = [...S.drawings].sort((x, y) => (y.id === S.sel) - (x.id === S.sel));
      for (const d of order) {
        const pts = d.p.map(sp);
        if (d.type === 'hline') { if (Math.abs(p.y - pts[0].y) < tol) return { d, h: -1 }; continue; }
        for (let k = 0; k < pts.length; k++) if (Math.hypot(p.x - pts[k].x, p.y - pts[k].y) < tol + 4) return { d, h: k };
        if (d.type === 'trend' && distSeg(p, pts[0], pts[1]) < tol) return { d, h: -1 };
        if (d.type === 'rect') { const x1 = Math.min(pts[0].x, pts[1].x), x2 = Math.max(pts[0].x, pts[1].x), y1 = Math.min(pts[0].y, pts[1].y), y2 = Math.max(pts[0].y, pts[1].y); if (p.x > x1 - tol && p.x < x2 + tol && p.y > y1 - tol && p.y < y2 + tol) return { d, h: -1 }; }
        if (d.type === 'fib') { const x1 = Math.min(pts[0].x, pts[1].x); if (p.x > x1 - tol && FIB.some(f => Math.abs(p.y - Y(d.p[1].price + (d.p[0].price - d.p[1].price) * f)) < tol)) return { d, h: -1 }; }
      }
      return null;
    }
    function snap(p) {
      let i = I(p.x), price = P(p.y);
      if (S.magnet) { const k = Math.max(0, Math.min(S.data.length - 1, Math.round(i))), c = S.data[k]; let best = null; for (const v of [c.open, c.high, c.low, c.close]) if (best === null || Math.abs(Y(v) - p.y) < Math.abs(Y(best) - p.y)) best = v; if (Math.abs(Y(best) - p.y) < 40) { i = k; price = best; } }
      return { i, price, t: tAt(i) };
    }
    const COLOR = { trend: '#f2c14e', hline: '#4fc3f7', rect: '#b388ff', fib: '#f2c14e' };
    const uid = () => Math.random().toString(36).slice(2, 9);

    // ---------- gestos ----------
    const ptrs = new Map(); let G = null, longT = 0;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (x) {} const p = pos(e), touch = e.pointerType !== 'mouse'; ptrs.set(e.pointerId, p);
      if (ptrs.size === 2) { clearTimeout(longT); const [p1, p2] = [...ptrs.values()], mid = (p1.x + p2.x) / 2; G = { mode: 'pinch', d0: Math.abs(p1.x - p2.x) || 1, w0: S.barW, anchor: I(mid), mid }; S.cross = null; req(); return; }
      if (S.measure && S.tool !== 'measure') { S.measure = null; }
      if (p.x > lay.PW && p.y < lay.mainH) { G = { mode: 'yscale', y0: p.y, lo: S.lo, hi: S.hi, touch }; if (S.auto) { S.auto = false; } G.lo = S.lo; G.hi = S.hi; return; }
      if (p.y > lay.H - lay.TB) { G = { mode: 'xscale', x0: p.x, w0: S.barW }; return; }
      if (p.y > lay.mainH) { G = { mode: 'pan', x0: p.x, y0: p.y, r0: S.right, lo: S.lo, hi: S.hi, moved: false, touch, sub: true }; return; }
      if (S.tool !== 'cursor') {
        const q = snap(p);
        if (S.tool === 'measure') { S.measure = { a: q, b: q }; G = { mode: 'measure' }; req(); return; }
        const d = { id: uid(), type: S.tool, color: COLOR[S.tool], p: S.tool === 'hline' ? [{ t: q.t, price: q.price }] : [{ t: q.t, price: q.price }, { t: q.t, price: q.price }] };
        S.drawings.push(d); S.sel = d.id; G = { mode: 'handle', d, h: S.tool === 'hline' ? -1 : 1, creating: true, start: q, orig: d.p.map(x => ({ ...x })) }; req(); return;
      }
      const h = hit(p, touch);
      if (h) { S.sel = h.d.id; const q = { i: I(p.x), price: P(p.y) }; G = { mode: h.h >= 0 ? 'handle' : 'body', d: h.d, h: h.h, start: q, orig: h.d.p.map(x => ({ i: iAt(x.t), price: x.price })) }; cbs.select(h.d); req(); return; }
      if (S.sel) { S.sel = null; cbs.select(null); }
      G = { mode: 'pan', x0: p.x, y0: p.y, r0: S.right, lo: S.lo, hi: S.hi, moved: false, touch };
      if (touch) longT = setTimeout(() => { if (G && G.mode === 'pan' && !G.moved) { G.mode = 'cross'; S.cross = p; req(); if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {} } }, 380);
      req();
    });
    cv.addEventListener('pointermove', e => {
      const p = pos(e); if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
      if (!G) { if (e.pointerType === 'mouse') { S.cross = p.x < lay.PW && p.y < lay.H - lay.TB ? p : null; if (!S.cross) cbs.cross(null); req(); } return; }
      if (G.mode === 'pinch' && ptrs.size >= 2) { const [p1, p2] = [...ptrs.values()], d = Math.abs(p1.x - p2.x) || 1, mid = (p1.x + p2.x) / 2; S.barW = G.w0 * d / G.d0; clampView(); S.right = G.anchor + (lay.PW - mid) / S.barW; req(); return; }
      if (G.mode === 'yscale') { const f = Math.exp((p.y - G.y0) * .006), c = (G.hi + G.lo) / 2, r = (G.hi - G.lo) / 2 * f; S.lo = c - r; S.hi = c + r; req(); return; }
      if (G.mode === 'xscale') { const r0 = S.right; S.barW = G.w0 * Math.exp((p.x - G.x0) * .006); S.right = r0; req(); return; }
      if (G.mode === 'cross') { S.cross = p; req(); return; }
      if (G.mode === 'measure') { S.measure.b = snap(p); req(); return; }
      if (G.mode === 'pan') {
        const dx = p.x - G.x0, dy = p.y - G.y0; if (Math.hypot(dx, dy) > 6) { G.moved = true; clearTimeout(longT); }
        if (e.pointerType === 'mouse') S.cross = null;
        S.right = G.r0 - dx / S.barW;
        if (!S.auto && !G.sub) { const k = (G.hi - G.lo) / (lay.mainH - 12) * dy; S.lo = G.lo + k; S.hi = G.hi + k; }
        req(); return;
      }
      if (G.mode === 'handle' || G.mode === 'body') {
        const d = G.d;
        if (G.mode === 'handle') { const q = snap(p); if (d.type === 'hline') d.p[0] = { t: q.t, price: q.price }; else d.p[G.h] = { t: q.t, price: q.price }; }
        else { const di = I(p.x) - G.start.i, dp = P(p.y) - G.start.price; d.p = G.orig.map(o => ({ t: tAt(o.i + di), price: o.price + dp })); }
        req();
      }
    });
    function end(e) {
      ptrs.delete(e.pointerId); clearTimeout(longT);
      if (!G) return;
      if (G.mode === 'pinch') { if (ptrs.size === 1) { const p = [...ptrs.values()][0]; G = { mode: 'pan', x0: p.x, y0: p.y, r0: S.right, lo: S.lo, hi: S.hi, moved: true, touch: true }; } else G = null; return; }
      if (ptrs.size) return;
      if (G.mode === 'cross') { cbs.cross(null); S.cross = null; }
      if (G.mode === 'pan' && !G.moved && G.touch && S.cross) { S.cross = null; cbs.cross(null); }
      if (G.mode === 'handle' && G.creating) {
        const d = G.d, a = d.p[0], b = d.p[1];
        if (b && Math.abs(X(iAt(a.t)) - X(iAt(b.t))) < 8 && Math.abs(Y(a.price) - Y(b.price)) < 8) { // toque sin arrastrar: tamaño por defecto
          const i0 = iAt(a.t), span = Math.max(8, 60 / S.barW), dp = (S.hi - S.lo) * .12;
          d.p[1] = { t: tAt(i0 + span), price: a.price + (d.type === 'trend' ? dp : -dp) };
        }
        S.tool = 'cursor'; cbs.tool('cursor'); cbs.select(d);
      }
      if (G.mode === 'measure') { S.tool = 'cursor'; cbs.tool('cursor'); }
      if (G.mode === 'handle' || G.mode === 'body') cbs.change();
      G = null; req();
    }
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !G) { S.cross = null; cbs.cross(null); req(); } });
    cv.addEventListener('wheel', e => { e.preventDefault(); const p = pos(e), anchor = I(p.x); S.barW *= e.deltaY > 0 ? 1 / 1.12 : 1.12; clampView(); S.right = anchor + (lay.PW - p.x) / S.barW; req(); }, { passive: false });
    let lastTap = 0;
    cv.addEventListener('pointerup', e => { const p = pos(e); if (p.x > lay.PW && p.y < lay.mainH) { const now = Date.now(); if (now - lastTap < 350) { S.auto = true; req(); } lastTap = now; } });
    cv.addEventListener('dblclick', e => { const p = pos(e); if (p.x > lay.PW) { S.auto = true; req(); } });
    const ro = new ResizeObserver(req); ro.observe(wrap);
    const mo = new MutationObserver(() => { colors(); req(); }); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { colors(); req(); }); } catch (e) {}

    return {
      setData(d, step, digits, keep) {
        const oldLen = S.data.length, follow = S.right >= oldLen - 1.5;
        S.data = d; if (step) S.step = step; if (digits != null) S.digits = digits; compute();
        if (!keep) { S.barW = Math.max(4, Math.min(12, (wrap.clientWidth || 360) / 60)); S.right = d.length - 1 + 5; S.auto = true; S.cross = null; S.measure = null; }
        else if (follow && d.length > oldLen) S.right += d.length - oldLen;
        req();
      },
      setType(t) { S.type = t; compute(); req(); }, getType: () => S.type,
      setInd(o) { for (const k in o) Object.assign(ind[k], o[k]); if (S.data.length) compute(); req(); }, getInd: () => JSON.parse(JSON.stringify(ind)),
      setTool(t) { S.tool = t; if (t !== 'cursor') { S.sel = null; cbs.select(null); } req(); }, getTool: () => S.tool,
      setMagnet(v) { S.magnet = v; }, getMagnet: () => S.magnet,
      setDrawings(a) { S.drawings = a || []; S.sel = null; req(); }, getDrawings: () => S.drawings,
      deleteSelected() { S.drawings = S.drawings.filter(d => d.id !== S.sel); S.sel = null; cbs.select(null); cbs.change(); req(); },
      colorSelected(c) { const d = S.drawings.find(x => x.id === S.sel); if (d) { d.color = c; cbs.change(); req(); } },
      clearDrawings() { S.drawings = []; S.sel = null; cbs.select(null); cbs.change(); req(); },
      resetView() { S.barW = Math.max(4, Math.min(12, wrap.clientWidth / 60)); S.right = S.data.length - 1 + 5; S.auto = true; req(); },
      zoom(f) { const a = I(lay.PW * .75); S.barW *= f; clampView(); S.right = a + lay.PW * .25 / S.barW; req(); },
      isAuto: () => S.auto,
      candleAt: i => S.data[i], values(i) { return { e: K.ema.map(a => a[i]), rsi: K.rsi[i] }; },
      on(ev, fn) { cbs[ev] = fn; }, redraw: req,
    };
  }
  FortunaChart.analyze = analyze;
  window.FortunaChart = FortunaChart;
})();
