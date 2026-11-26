// Fortuna Radiante — app móvil para traders.
// Sin servidor: modo demo (precios simulados; Fortunaty usa la IA de la vista previa si está disponible).
// Servida por server.js: precios reales, Fortunaty con noticias, chat, liga y mentorías compartidos.
{
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = s => parseFloat(String(s ?? '').replace(/\s/g, '').replace(',', '.'));
const dec = (n, d = 2) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const sg = (n, d = 2) => (n > 0 ? '+' : n < 0 ? '−' : '') + dec(Math.abs(n), d);
const usd = n => (n < 0 ? '−' : '') + dec(Math.abs(n)) + ' $';
const hm = t => new Date(t).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const r2 = (n, d = 2) => n == null || !isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;
const wait = ms => new Promise(r => setTimeout(r, ms));
const LS = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

let LIVE = false, FEAT = {}, token = LS.get('fr.token'), user = LS.get('fr.user'), view = 'inicio';
async function api(path, opt = {}) {
  const r = await fetch(path, { ...opt, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: opt.body ? JSON.stringify(opt.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error ' + r.status);
  return j;
}
function toast(t) { $('#toasts').innerHTML = ''; const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; $('#toasts').append(d); setTimeout(() => d.remove(), 3000); }
function setUser(u, t) { user = u || null; token = t || null; u ? LS.set('fr.user', u) : LS.del('fr.user'); t ? LS.set('fr.token', t) : LS.del('fr.token'); $('#mebtn').textContent = u ? u.alias[0].toUpperCase() : '?'; }

// =============== navegación ===============
const TAB = { inicio: 'inicio', grafico: 'grafico', fortunaty: 'fortunaty', comunidad: 'comunidad', mas: 'mas', mentorias: 'mas', utiles: 'mas', diario: 'mas', cuenta: 'mas', instalar: 'mas' };
const RENDER = {};
function show(v) {
  if (!TAB[v]) v = 'inicio';
  view = v;
  $$('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  $$('.tabbar a').forEach(a => a.dataset.t === TAB[v] ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (v !== 'grafico') $('#app').classList.remove('full');
  $('#main').scrollTop = 0;
  RENDER[v] && RENDER[v]();
  if (location.hash !== '#' + v) try { history.replaceState(null, '', '#' + v); } catch (e) {}
}
addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== view) show(h); });
document.addEventListener('click', e => {
  const g = e.target.closest('[data-go]'); if (g) { e.preventDefault(); show(g.dataset.go); return; }
  const c = e.target.closest('[data-chart]'); if (c) { e.preventDefault(); openChart(c.dataset.chart); return; }
  const a = e.target.closest('[data-ask]'); if (a) { e.preventDefault(); show('fortunaty'); ask(a.dataset.ask); return; }
  const t = e.target.closest('[data-tab]'); if (t) { comTab = t.dataset.tab; }
});

// hoja inferior
function sheet(title, html, bind) { $('#sheet-t').textContent = title; $('#sheet-c').innerHTML = html; $('#sheet').hidden = $('#sheet-bg').hidden = false; bind && bind($('#sheet-c')); }
function closeSheet() { $('#sheet').hidden = $('#sheet-bg').hidden = true; }
$('#sheet-bg').onclick = closeSheet;
addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

// =============== mercados ===============
const SY = {
  XAUUSD: { n: 'Oro', d: 2, p: 4000, v: .00035, ic: 'Au', cls: '' },
  DXY: { n: 'Índice dólar', d: 3, p: 100.2, v: .00007, ic: 'DXY', cls: 'dxy' },
  BTCUSD: { n: 'Bitcoin', d: 1, p: 95000, v: .0009, ic: '₿', cls: 'btc' },
  USOIL: { n: 'Petróleo WTI', d: 2, p: 65, v: .0005, ic: 'WTI', cls: 'oil' },
};
const ORDER = Object.keys(SY);
const TFS = [['1m', 1], ['5m', 5], ['15m', 15], ['1H', 60], ['4H', 240], ['1D', 1440]];
const tfLabel = m => (TFS.find(t => t[1] === m) || ['1H'])[0];
const apiTf = m => ({ 1: '1m', 5: '5m', 15: '15m', 60: '1h', 240: '4h', 1440: '1d' }[m]);
const px = {}, ref = {}, series = {};
ORDER.forEach(s => { px[s] = SY[s].p * (1 + (rnd() - .5) * .01); });
function gen(s, m, n = 500) {
  const step = m * 6e4, vol = SY[s].v * Math.sqrt(m), out = new Array(n); let c = px[s], t = Math.floor(Date.now() / step) * step, drift = 0;
  for (let i = n - 1; i >= 0; i--) {
    if ((n - 1 - i) % 45 === 0) drift = (rnd() - .5) * vol * .35;
    const o = c / (1 + drift + (rnd() - .5) * 2 * vol);
    out[i] = { time: t, open: o, high: Math.max(o, c) * (1 + rnd() * vol * .6), low: Math.min(o, c) * (1 - rnd() * vol * .6), close: c };
    c = o; t -= step;
  }
  return out;
}
function seriesSync(s, m) { const k = s + '|' + m; if (!series[k] && !(LIVE && FEAT.candles)) series[k] = gen(s, m); return series[k]; }
async function getSeries(s, m) {
  const k = s + '|' + m;
  if (LIVE && FEAT.candles && !series[k]) { try { const j = await api(`/api/candles?symbol=${s}&tf=${apiTf(m)}`); if (j.candles && j.candles.length) series[k] = j.candles.map(c => ({ time: +c.time, open: +c.open, high: +c.high, low: +c.low, close: +c.close })); } catch (e) { console.warn(e); } }
  return series[k] || (series[k] = gen(s, m));
}
function applyPrice(s, p) {
  const old = px[s]; px[s] = p;
  for (const k in series) {
    const [ks, km] = k.split('|'); if (ks !== s) continue;
    const a = series[k], step = km * 6e4, l = a[a.length - 1]; if (!l) continue;
    if (Date.now() >= l.time + step) { a.push({ time: Math.floor(Date.now() / step) * step, open: l.close, high: p, low: p, close: p }); if (a.length > 1500) a.shift(); }
    else { l.close = p; l.high = Math.max(l.high, p); l.low = Math.min(l.low, p); }
  }
  return old;
}
function initRefs() { ORDER.forEach(s => { const a = seriesSync(s, 15); if (a && a.length) ref[s] = a[Math.max(0, a.length - 97)].close; }); }
const chg = s => ref[s] ? (px[s] / ref[s] - 1) * 100 : 0;

// cinta deslizante
const track = $('#tk-track'), tk = $('#ticker');
function buildTicker() {
  const item = s => `<button class="tk" data-chart="${s}"><b>${s === 'BTCUSD' ? 'BTC' : s}</b><span class="p" data-p="${s}"></span><span class="c" data-c="${s}"></span></button>`;
  const one = ORDER.map(item).join(''); track.innerHTML = one + one + one;
  updTicker();
}
const lastShown = {};
function updTicker() {
  ORDER.forEach(s => {
    const p = px[s], c = chg(s), dir = lastShown[s] == null ? '' : p > lastShown[s] ? 'fu' : p < lastShown[s] ? 'fd' : '';
    $$(`[data-p="${s}"]`).forEach(el => { el.textContent = p == null ? '—' : dec(p, SY[s].d); if (dir) { el.classList.remove('fu', 'fd'); void el.offsetWidth; el.classList.add(dir); } });
    $$(`[data-c="${s}"]`).forEach(el => { el.textContent = (c >= 0 ? '▲ ' : '▼ ') + dec(Math.abs(c)) + ' %'; el.className = 'c ' + (c >= 0 ? 'u' : 'd'); });
    lastShown[s] = p;
  });
}
let tkPos = 0, tkHold = 0, tkLast = 0;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
function tkLoop(t) {
  const dt = Math.min(64, t - (tkLast || t)); tkLast = t;
  if (!reduce && Date.now() > tkHold && !$('#app').classList.contains('full')) {
    tkPos += dt * .035; const third = track.scrollWidth / 3;
    if (third && tkPos >= third * 2) tkPos -= third;
    tk.scrollLeft = tkPos;
  }
  requestAnimationFrame(tkLoop);
}
['pointerdown', 'touchstart', 'wheel'].forEach(ev => tk.addEventListener(ev, () => { tkHold = Date.now() + 3000; }, { passive: true }));
tk.addEventListener('scroll', () => { if (Date.now() <= tkHold) { tkPos = tk.scrollLeft; const third = track.scrollWidth / 3; if (tkPos < third * .5) { tkPos += third; tk.scrollLeft = tkPos; } else if (tkPos > third * 2.2) { tkPos -= third; tk.scrollLeft = tkPos; } } }, { passive: true });

// =============== INICIO ===============
function sparkPath(a, W, H, pad = 4) { const lo = Math.min(...a), hi = Math.max(...a), k = hi - lo || 1; return a.map((v, i) => `${(i / (a.length - 1) * W).toFixed(1)},${(pad + (hi - v) / k * (H - pad * 2)).toFixed(1)}`); }
function drawRays() { const g = $('#raysg'); if (!g) return; if (g.childElementCount) return; let h = ''; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, b = a + .045; h += `<polygon points="200,200 ${200 + 260 * Math.cos(a)},${200 + 260 * Math.sin(a)} ${200 + 260 * Math.cos(b)},${200 + 260 * Math.sin(b)}" fill="url(#gg)" opacity="${i % 2 ? .25 : .5}"/>`; } g.innerHTML = h + '<circle cx="200" cy="200" r="46" fill="url(#gg)" opacity=".55"/>'; }
function renderHero() {
  const a = seriesSync('XAUUSD', 15); if (!a || !a.length) return;
  const d = a.slice(-96), c = chg('XAUUSD');
  $('#h-price').textContent = dec(px.XAUUSD, 2);
  const pc = $('#h-chg'); pc.textContent = (c >= 0 ? '▲ ' : '▼ ') + dec(Math.abs(c)) + ' % hoy'; pc.className = 'pill ' + (c >= 0 ? 'u' : 'd');
  $('#h-range').textContent = `Rango 24 h ${dec(Math.min(...d.map(x => x.low)))} – ${dec(Math.max(...d.map(x => x.high)))}`;
  const sv = $('#h-spark'), W = sv.clientWidth || 340, H = 84, pts = sparkPath(d.map(x => x.close), W, H);
  sv.setAttribute('viewBox', `0 0 ${W} ${H}`);
  sv.innerHTML = `<defs><linearGradient id="hf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f5c84c" stop-opacity=".45"/><stop offset="1" stop-color="#f5c84c" stop-opacity="0"/></linearGradient></defs><polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="url(#hf)"/><polyline points="${pts.join(' ')}" fill="none" stroke="url(#gg)" stroke-width="2.5" stroke-linejoin="round"/><circle cx="${pts[pts.length - 1].split(',')[0]}" cy="${pts[pts.length - 1].split(',')[1]}" r="4.5" fill="#fff0b8"/>`;
}
function renderMarkets() {
  $('#markets').innerHTML = ORDER.map(s => {
    const a = (seriesSync(s, 15) || []).slice(-48), c = chg(s), pts = a.length > 1 ? sparkPath(a.map(x => x.close), 72, 32, 3) : [];
    return `<button class="mk" data-chart="${s}"><span class="ic ${SY[s].cls}">${esc(SY[s].ic)}</span><span><b>${SY[s].n}</b><small>${s}</small></span><svg viewBox="0 0 72 32"><polyline points="${pts.join(' ')}" fill="none" stroke="${c >= 0 ? 'var(--up)' : 'var(--dn)'}" stroke-width="1.8"/></svg><span class="r"><b>${px[s] == null ? '—' : dec(px[s], SY[s].d)}</b><span class="pill ${c >= 0 ? 'u' : 'd'}">${sg(c)} %</span></span></button>`;
  }).join('');
}
function quickRead(a) {
  if (!a) return [];
  const t = a.close > a.ema200 && a.ema50 > a.ema200 ? ['Alcista', 'u'] : a.close < a.ema200 && a.ema50 < a.ema200 ? ['Bajista', 'd'] : ['Lateral', ''];
  const res = Math.min(...[a.pivots.R1, a.swingHigh50].filter(v => v > a.close)), sup = Math.max(...[a.pivots.S1, a.swingLow50].filter(v => v < a.close));
  return [['Tendencia H1', `<b class="${t[1]}">${t[0]}</b>`], ['RSI 14', `<b>${dec(a.rsi14, 1)}</b> · ${a.rsi14 > 70 ? 'sobrecompra' : a.rsi14 < 30 ? 'sobreventa' : 'neutral'}`], ['MACD', `<b class="${a.macd > a.macdSignal ? 'u' : 'd'}">${a.macd > a.macdSignal ? 'Impulso alcista' : 'Impulso bajista'}</b>`], ['Resistencia', isFinite(res) ? `<b>${dec(res)}</b>` : '—'], ['Soporte', isFinite(sup) ? `<b>${dec(sup)}</b>` : '—']];
}
function renderPulse() { const a = FortunaChart.analyze(seriesSync('XAUUSD', 60), 36e5); $('#pulse').innerHTML = quickRead(a).map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join(''); $('#pulse-src').textContent = LIVE && FEAT.candles ? 'Lectura automática del oro · datos reales' : 'Lectura automática del oro · datos simulados'; }
RENDER.inicio = () => {
  drawRays(); renderHero(); renderMarkets(); renderPulse(); sessMini();
  const all = ranked(), me = all.find(t => t.me), top = all.find(t => t.ok);
  $('#mini-liga').textContent = me ? (me.ok ? me.pos + 'º' : 'Sin clasificar') : top ? '1º ' + top.alias : '–';
  $('#mini-liga2').textContent = me ? `${sg(me.gain, 1)} % · ${me.score} pts` : 'Vincula tu cuenta y compite';
  const nx = MENT && upcoming()[0];
  $('#mini-ment').textContent = nx ? new Date(nx.start).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' }) + ' · ' + hm(nx.start) : '–';
  $('#mini-ment2').textContent = nx ? nx.title : '';
};

// =============== GRÁFICOS (hasta 3 a la vez) ===============
const DEF_PANES = [{ sym: 'XAUUSD', tf: 60 }, { sym: 'DXY', tf: 60 }, { sym: 'XAUUSD', tf: 15 }];
let LAY = LS.get('fr.layout') || { n: 1, panes: [] };
LAY.panes = DEF_PANES.map((p, i) => (LAY.panes && LAY.panes[i]) || { ...p });
LAY.panes.forEach(p => { if (!SY[p.sym]) p.sym = 'XAUUSD'; if (!TFS.some(t => t[1] === p.tf)) p.tf = 60; });
if (![1, 2, 3].includes(LAY.n)) LAY.n = 1;
let active = Math.min(LS.get('fr.active') || 0, LAY.n - 1), panes = [];
const saveLay = () => { LS.set('fr.layout', LAY); LS.set('fr.active', active); };
const AP = () => panes[active] || panes[0];
const TOOLS = [
  ['cursor', 'Cursor', '<path d="M6 3l13 7-6 1.8L10.5 19z"/>'],
  ['trend', 'Tendencia', '<path d="M4 19L20 5"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="5" r="2"/>'],
  ['hline', 'Horizontal', '<path d="M2 12h20"/><circle cx="12" cy="12" r="2"/>'],
  ['rect', 'Rectángulo', '<rect x="4" y="6" width="16" height="12" rx="1"/>'],
  ['fib', 'Fibonacci', '<path d="M3 5h18M3 9.5h18M3 13h18M3 19h18"/>'],
  ['measure', 'Medir', '<path d="M3 17L17 3l4 4L7 21zM7.5 12.5l2 2M10.5 9.5l2 2M13.5 6.5l2 2"/>'],
  ['magnet', 'Imán', '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3zM6 7h4M14 7h4"/>'],
  ['clear', 'Borrar', '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>'],
];
const COLORS = ['#f2c14e', '#3ddc97', '#ff5f5f', '#4fc3f7', '#c39bff', '#ffffff'];
function buildPanes() {
  const box = $('#c-panes'); box.innerHTML = ''; box.dataset.n = LAY.n; panes = [];
  $$('#c-lay button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.n === LAY.n));
  for (let i = 0; i < LAY.n; i++) {
    const el = document.createElement('div'); el.className = 'pane' + (i === active ? ' act' : '');
    el.innerHTML = `<div class="pane-h"><button class="sym" data-psym="${i}" aria-label="Cambiar mercado del gráfico ${i + 1}"><b></b><span></span><svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg></button><div class="tfs" data-ptf="${i}" role="group" aria-label="Temporalidad"></div></div><div class="c-wrap"><div class="c-canvas"></div><div class="c-legend"></div><div class="c-selbar" hidden></div><button class="c-auto" hidden>Ajustar</button></div>`;
    box.append(el);
    const chart = FortunaChart(el.querySelector('.c-canvas')), pane = { chart, el, i };
    const ind = LS.get('fr.ind.' + i); if (ind) chart.setInd(ind); else if (i > 0) chart.setInd({ rsi: { on: false } });
    chart.setType(LS.get('fr.type.' + i) || 'candles');
    chart.on('change', () => {
      const s = LAY.panes[i].sym, d = chart.getDrawings(); LS.set('fr.draw.' + s, d);
      panes.forEach(o => { if (o !== pane && LAY.panes[o.i].sym === s) o.chart.setDrawings(JSON.parse(JSON.stringify(d))); });
    });
    chart.on('tool', renderTools);
    chart.on('cross', idx => legend(pane, idx));
    const bar = el.querySelector('.c-selbar'), auto = el.querySelector('.c-auto');
    chart.on('select', d => { if (!d) { bar.hidden = true; return; } bar.innerHTML = COLORS.map(c => `<button class="sw" style="background:${c}" data-col="${c}" aria-label="Color"></button>`).join('') + '<button class="del" data-delsel>Eliminar</button>'; bar.hidden = false; });
    bar.onclick = e => { const c = e.target.closest('[data-col]'); if (c) chart.colorSelected(c.dataset.col); if (e.target.closest('[data-delsel]')) chart.deleteSelected(); };
    el.querySelector('.c-canvas').addEventListener('pointerup', () => setTimeout(() => { auto.hidden = chart.isAuto(); }, 0));
    auto.onclick = () => { chart.resetView(); auto.hidden = true; };
    el.addEventListener('pointerdown', () => setActive(i), true);
    panes.push(pane);
  }
}
function setActive(i) {
  if (i === active || !panes[i]) return;
  const prev = panes[active], t = prev ? prev.chart.getTool() : 'cursor';
  if (prev && t !== 'cursor') { prev.chart.setTool('cursor'); panes[i].chart.setTool(t); }
  active = i; saveLay(); panes.forEach(p => p.el.classList.toggle('act', p.i === i)); renderTools();
}
function legend(pane, i) {
  const c = LAY.panes[pane.i], d = SY[c.sym].d, a = series[c.sym + '|' + c.tf] || [];
  const idx = i == null ? a.length - 1 : i, k = pane.chart.candleAt(idx); if (!k) return;
  const v = pane.chart.values(idx), ind = pane.chart.getInd(), ch = (k.close / k.open - 1) * 100, col = k.close >= k.open ? 'u' : 'd', ec = ['var(--gold)', 'var(--sky)', 'var(--violet)'];
  pane.el.querySelector('.c-legend').classList.toggle('x', i != null);
  pane.el.querySelector('.c-legend').innerHTML = `<b>${c.sym}</b> · ${tfLabel(c.tf)} · ${esc(SY[c.sym].n)}<span class="ohlc"><br><i>A <i class="${col}">${dec(k.open, d)}</i></i> <i>M <i class="${col}">${dec(k.high, d)}</i></i> <i>m <i class="${col}">${dec(k.low, d)}</i></i> <i>C <i class="${col}">${dec(k.close, d)}</i></i> <i class="${col}">${sg(ch)} %</i></span>`
    + (ind.ema.on ? '<span class="ema"><br>' + ind.ema.p.map((p, j) => `<span style="color:${ec[j]}">EMA ${p} ${v.e[j] != null ? dec(v.e[j], d) : ''}</span>`).join(' &nbsp;') + '</span>' : '');
}
function paneHead(pane) {
  const c = LAY.panes[pane.i], ch = chg(c.sym), h = pane.el;
  h.querySelector('.sym b').textContent = c.sym;
  h.querySelector('.sym span').innerHTML = `${dec(px[c.sym], SY[c.sym].d)} <i class="${ch >= 0 ? 'u' : 'd'}" style="font-style:normal">${sg(ch)} %</i>`;
  const tfs = h.querySelector('.tfs');
  if (tfs.dataset.cur !== String(c.tf)) { tfs.dataset.cur = c.tf; tfs.innerHTML = TFS.map(([l, m]) => `<button data-tf="${m}" aria-pressed="${m === c.tf}">${l}</button>`).join(''); }
}
async function loadPane(pane) {
  if (!pane) return; const c = LAY.panes[pane.i]; paneHead(pane);
  const d = await getSeries(c.sym, c.tf);
  pane.chart.setData(d, c.tf * 6e4, SY[c.sym].d, false);
  pane.chart.setDrawings(LS.get('fr.draw.' + c.sym) || []);
  pane.el.querySelector('.c-selbar').hidden = true; pane.el.querySelector('.c-auto').hidden = true; legend(pane, null);
}
function loadAll() { buildPanes(); renderTools(); panes.forEach(p => loadPane(p)); }
function renderTools() {
  const ch = AP() && AP().chart, t = ch ? ch.getTool() : 'cursor', mg = ch && ch.getMagnet();
  $('#tools').innerHTML = TOOLS.map(([k, l, ic]) => `<button data-tool="${k}" aria-pressed="${k === 'magnet' ? !!mg : k === t}"><svg viewBox="0 0 24 24">${ic}</svg>${l}</button>`).join('');
}
$('#tools').onclick = e => {
  const b = e.target.closest('[data-tool]'), chart = AP() && AP().chart; if (!b || !chart) return; const k = b.dataset.tool;
  if (k === 'magnet') { const on = !chart.getMagnet(); panes.forEach(p => p.chart.setMagnet(on)); toast(on ? 'Imán activado: los puntos se pegan a las velas' : 'Imán desactivado'); }
  else if (k === 'clear') { if (!chart.getDrawings().length) return toast('No hay dibujos en este gráfico'); chart.clearDrawings(); toast('Dibujos borrados'); }
  else { chart.setTool(chart.getTool() === k && k !== 'cursor' ? 'cursor' : k); if (k !== 'cursor') toast({ trend: 'Arrastra para trazar la línea de tendencia', hline: 'Toca el precio donde quieres la línea', rect: 'Arrastra para dibujar la zona', fib: 'Arrastra de un extremo al otro del movimiento', measure: 'Arrastra para medir distancia y tiempo' }[k]); }
  renderTools();
};
RENDER.grafico = () => loadAll();
$('#c-lay').onclick = e => { const b = e.target.closest('[data-n]'); if (!b) return; LAY.n = +b.dataset.n; if (active >= LAY.n) active = 0; saveLay(); loadAll(); if (LAY.n > 1) toast('Toca un gráfico para elegirlo: las herramientas y ajustes se aplican al marcado en dorado'); };
$('#c-panes').addEventListener('click', e => {
  const s = e.target.closest('[data-psym]'); if (s) { symSheet(+s.dataset.psym); return; }
  const t = e.target.closest('[data-tf]'); if (t) { const i = +t.closest('[data-ptf]').dataset.ptf; LAY.panes[i].tf = +t.dataset.tf; saveLay(); loadPane(panes[i]); }
});
function symSheet(i) {
  sheet(LAY.n > 1 ? `Mercado · gráfico ${i + 1}` : 'Mercado', ORDER.map(s => { const c = chg(s); return `<button class="opt" data-s="${s}" aria-pressed="${s === LAY.panes[i].sym}"><span><b>${s}</b><br><small class="sub">${SY[s].n}</small></span><span>${dec(px[s], SY[s].d)} <span class="pill ${c >= 0 ? 'u' : 'd'}">${sg(c)} %</span></span></button>`; }).join(''),
    el => el.onclick = e => { const b = e.target.closest('[data-s]'); if (b) { closeSheet(); LAY.panes[i].sym = b.dataset.s; saveLay(); loadPane(panes[i]); } });
}
function openChart(s) { const i = Math.min(active, LAY.n - 1); LAY.panes[i].sym = s; saveLay(); if (view === 'grafico') loadPane(panes[i]); else show('grafico'); }
const nth = () => LAY.n > 1 ? ` · gráfico ${active + 1}` : '';
$('#c-type').onclick = () => { const chart = AP().chart, cur = chart.getType(); sheet('Tipo de gráfico' + nth(), [['candles', 'Velas japonesas'], ['heikin', 'Heikin Ashi'], ['bars', 'Barras OHLC'], ['line', 'Línea'], ['area', 'Área']].map(([k, l]) => `<button class="opt" data-ty="${k}" aria-pressed="${k === cur}"><b>${l}</b>${k === cur ? '<span class="u">✓</span>' : ''}</button>`).join(''), el => el.onclick = e => { const b = e.target.closest('[data-ty]'); if (b) { chart.setType(b.dataset.ty); LS.set('fr.type.' + active, b.dataset.ty); closeSheet(); } }); };
$('#c-ind').onclick = () => {
  const pane = AP(), chart = pane.chart, key = 'fr.ind.' + active, ind = chart.getInd(), sw = (k, on) => `<button class="sw-t" role="switch" aria-checked="${on}" data-sw="${k}" aria-label="Activar"></button>`;
  const inp = (k, f, v, l) => `<label>${l}<input inputmode="decimal" data-k="${k}" data-f="${f}" value="${v}"></label>`;
  sheet('Indicadores' + nth(), `
    <div class="indrow"><div class="hd"><b>Medias móviles EMA</b>${sw('ema', ind.ema.on)}</div><div class="ps">${ind.ema.p.map((p, i) => inp('ema', 'p' + i, p, 'Periodo ' + (i + 1))).join('')}</div></div>
    <div class="indrow"><div class="hd"><b>Bandas de Bollinger</b>${sw('bb', ind.bb.on)}</div><div class="ps">${inp('bb', 'p', ind.bb.p, 'Periodo')}${inp('bb', 'k', ind.bb.k, 'Desviaciones')}</div></div>
    <div class="indrow"><div class="hd"><b>Pivotes diarios</b>${sw('piv', ind.piv.on)}</div></div>
    <div class="indrow"><div class="hd"><b>RSI</b>${sw('rsi', ind.rsi.on)}</div><div class="ps">${inp('rsi', 'p', ind.rsi.p, 'Periodo')}</div></div>
    <div class="indrow"><div class="hd"><b>MACD</b>${sw('macd', ind.macd.on)}</div><div class="ps">${inp('macd', 'f', ind.macd.f, 'Rápida')}${inp('macd', 's', ind.macd.s, 'Lenta')}${inp('macd', 'g', ind.macd.g, 'Señal')}</div></div>
    <button class="btn ghost full" style="margin-top:14px" data-reset>Valores por defecto</button>`, el => {
    el.onclick = e => {
      const s = e.target.closest('[data-sw]'); if (s) { const on = s.getAttribute('aria-checked') !== 'true'; s.setAttribute('aria-checked', on); chart.setInd({ [s.dataset.sw]: { on } }); LS.set(key, chart.getInd()); legend(pane, null); }
      if (e.target.closest('[data-reset]')) { chart.setInd({ ema: { on: true, p: [20, 50, 200] }, bb: { on: false, p: 20, k: 2 }, piv: { on: false }, rsi: { on: true, p: 14 }, macd: { on: false, f: 12, s: 26, g: 9 } }); LS.set(key, chart.getInd()); closeSheet(); legend(pane, null); }
    };
    el.oninput = e => {
      const i = e.target.closest('[data-k]'); if (!i) return; const v = num(i.value), k = i.dataset.k, f = i.dataset.f; if (!(v > 0) || v > 500) return;
      const cur = chart.getInd()[k];
      if (k === 'ema') { const p = [...cur.p]; p[+f.slice(1)] = Math.round(v); chart.setInd({ ema: { p } }); } else chart.setInd({ [k]: { [f]: f === 'k' ? v : Math.round(v) } });
      LS.set(key, chart.getInd()); legend(pane, null);
    };
  });
};
$('#c-full').onclick = () => {
  const on = !$('#app').classList.contains('full'); $('#app').classList.toggle('full', on); $('#c-full').setAttribute('aria-pressed', on);
  try { if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
  panes.forEach(p => p.chart.redraw());
};

// =============== FORTUNATY ===============
const FT = { msgs: [], busy: false, mode: null };
const CHIPS = ['Análisis técnico del XAUUSD', 'Noticias del oro hoy', 'Niveles clave para hoy', '¿Cómo afecta el DXY al oro ahora?', 'Explícame el RSI actual', 'Revisa mis líneas del gráfico'];
const SYS = `Eres Fortunaty, la inteligencia artificial de la app Fortuna Radiante, especializada en el oro (XAUUSD) y en los mercados relacionados (DXY, Bitcoin, petróleo WTI).
Respondes siempre en español, con tono cercano, claro y profesional, pensado para leerse en el móvil: frases cortas, títulos breves con ###, listas con guiones y cifras concretas tomadas de los DATOS que se te dan. Máximo unas 220 palabras salvo que pidan más.
Para un análisis técnico usa esta estructura: ### Resumen · ### Tendencia (H1, H4, D1) · ### Niveles clave (soportes y resistencias con precio) · ### Escenarios (alcista y bajista, con qué confirmaría cada uno) · ### Riesgos.
Nunca garantices resultados ni des órdenes de compra/venta personalizadas; puedes describir escenarios y niveles. Termina los análisis con una línea breve: "Esto es información, no asesoramiento financiero."
Si los DATOS indican que los precios son simulados, dilo con naturalidad al principio ("Con los datos de demostración de la app…").`;
const SYS_NONEWS = `\nEn este modo NO tienes acceso a noticias ni a internet. Si te piden noticias, dilo claramente, no inventes titulares ni datos, y explica qué tipo de eventos suelen mover el oro (datos de empleo e inflación de EE. UU., decisiones de la Reserva Federal, el dólar, tensiones geopolíticas) para que el usuario los consulte.`;
function snapshot() {
  const o = { hora_madrid: new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }), fuente_de_precios: LIVE && FEAT.candles ? 'precios reales del bróker' : 'DATOS SIMULADOS (modo demostración de la app)', precios: {}, xauusd_indicadores: {} };
  ORDER.forEach(s => o.precios[s] = { precio: r2(px[s], SY[s].d), cambio_24h_pct: r2(chg(s)) });
  [['H1', 60], ['H4', 240], ['D1', 1440]].forEach(([l, m]) => { const a = FortunaChart.analyze(seriesSync('XAUUSD', m), m * 6e4); if (a) { const x = {}; for (const k in a) x[k] = typeof a[k] === 'number' ? r2(a[k]) : Object.fromEntries(Object.entries(a[k]).map(([kk, vv]) => [kk, r2(vv)])); o.xauusd_indicadores[l] = x; } });
  const lines = (LS.get('fr.draw.XAUUSD') || []).filter(d => d.type === 'hline').map(d => r2(d.p[0].price)); if (lines.length) o.lineas_horizontales_del_usuario_en_xauusd = lines;
  return o;
}
let samplerP = null;
function getSampler() {
  if (!samplerP) samplerP = (async () => {
    for (let k = 0; k < 30 && !(window.claude && window.claude.use); k++) await wait(100);
    if (!(window.claude && window.claude.use)) return null;
    try { return await window.claude.use('sample'); } catch (e) { return null; }
  })();
  return samplerP;
}
async function ftMode() {
  if (LIVE && FEAT.ai) return 'server';
  return (await getSampler()) ? 'sample' : 'offline';
}
function md(t) {
  const lines = esc(t).split('\n'); let h = '', inList = false;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  for (const raw of lines) {
    const l = raw.trim();
    if (/^([-*•]|\d+\.)\s+/.test(l)) { if (!inList) { h += '<ul>'; inList = true; } h += '<li>' + inline(l.replace(/^([-*•]|\d+\.)\s+/, '')) + '</li>'; continue; }
    if (inList) { h += '</ul>'; inList = false; }
    if (/^#{1,4}\s/.test(l)) h += '<h4>' + inline(l.replace(/^#{1,4}\s/, '')) + '</h4>';
    else if (l) h += '<p>' + inline(l) + '</p>';
  }
  return h + (inList ? '</ul>' : '');
}
function renderFT() {
  const box = $('#ft-msgs'), badge = { server: 'IA con noticias en tiempo real', sample: 'IA · análisis con los datos de la app', offline: 'Modo básico · análisis automático' }[FT.mode] || 'Conectando…';
  const hello = `<div class="ft-hello"><div class="ft-av"><img src="icons/logo-192.png" alt=""></div><h2>Fortunaty</h2><p>Tu analista del oro. Pregúntame por el XAUUSD, el dólar, niveles, noticias o cómo leer un indicador.</p><span class="badge">${badge}</span></div>`;
  box.innerHTML = hello + FT.msgs.map(m => m.role === 'user' ? `<div class="bub user">${esc(m.content)}</div>` : `<div class="bub ai"><div class="who">Fortunaty</div>${m.content ? md(m.content) : '<div class="dots"><span></span><span></span><span></span></div>'}${m.sources && m.sources.length ? `<div class="src"><b>Fuentes</b>${m.sources.filter(s => /^https:\/\//.test(s.url)).map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a>`).join('')}</div>` : ''}</div>`).join('') + (FT.msgs.length ? '<p class="disc">Fortunaty informa y analiza; no es asesoramiento financiero.</p>' : '');
  box.scrollTop = box.scrollHeight;
}
RENDER.fortunaty = async () => {
  $('#ft-chips').innerHTML = CHIPS.map(c => `<button data-chip="${esc(c)}">${esc(c)}</button>`).join('');
  renderFT(); if (!FT.mode) { FT.mode = await ftMode(); renderFT(); }
};
$('#ft-chips').onclick = e => { const b = e.target.closest('[data-chip]'); if (b) ask(b.dataset.chip); };
$('#ft-form').onsubmit = e => { e.preventDefault(); const t = $('#ft-in').value.trim(); if (t) { $('#ft-in').value = ''; ask(t); } };
function offlineAnswer(q) {
  const s = snapshot(), a = s.xauusd_indicadores, out = [`Ahora mismo no tengo conexión con la IA, así que te dejo la **lectura automática** de los indicadores${LIVE && FEAT.candles ? '' : ' (con los datos de demostración)'}:`];
  for (const [l, x] of Object.entries(a)) out.push(`- **${l}**: precio ${dec(x.close)} · ${x.close > x.ema200 ? 'por encima' : 'por debajo'} de la EMA 200 · RSI ${dec(x.rsi14, 1)} · MACD ${x.macd > x.macdSignal ? 'alcista' : 'bajista'}`);
  const h = a.H1; if (h) out.push(`### Niveles H1`, `- Resistencias: ${dec(h.pivots.R1)} y ${dec(h.swingHigh50)}`, `- Soportes: ${dec(h.pivots.S1)} y ${dec(h.swingLow50)}`);
  if (/notic/i.test(q)) out.push('Para noticias necesito la conexión con la IA del servidor.');
  out.push('Esto es información, no asesoramiento financiero.');
  return out.join('\n');
}
async function ask(q) {
  if (FT.busy) return toast('Fortunaty está terminando la respuesta anterior');
  FT.busy = true; if (!FT.mode) FT.mode = await ftMode();
  FT.msgs.push({ role: 'user', content: q }); const msg = { role: 'assistant', content: '' }; FT.msgs.push(msg); renderFT();
  try {
    const snap = snapshot(), hist = FT.msgs.slice(0, -1).filter(m => m.content).slice(-10).map(m => ({ role: m.role, content: m.content }));
    if (FT.mode === 'server') {
      const j = await api('/api/fortunaty', { method: 'POST', body: { messages: hist, snapshot: snap } });
      msg.content = j.text; msg.sources = j.sources;
    } else if (FT.mode === 'sample') {
      const sample = await getSampler();
      const input = hist.map((m, i) => i === hist.length - 1 ? { role: 'user', content: `${SYS}${SYS_NONEWS}\n\nDATOS DE MERCADO ACTUALES (JSON):\n${JSON.stringify(snap)}\n\nPREGUNTA DEL USUARIO: ${m.content}` } : m);
      while (input.length && input[0].role !== 'user') input.shift();
      let last = 0;
      const res = await sample(input, { cache: false, onText: ({ text }) => { msg.content = text; if (Date.now() - last > 120) { last = Date.now(); renderFT(); } } });
      msg.content = res.text;
    } else { await wait(500); msg.content = offlineAnswer(q); }
  } catch (e) {
    const code = e && e.code;
    msg.content = code === 'not_granted' ? 'Necesito tu permiso para usar la IA en esta vista. Vuelve a preguntar y acepta el aviso.' : code === 'rate_limited' ? 'Has hecho muchas preguntas seguidas. Espera un momento y vuelve a intentarlo.' : (e && e.message ? 'No he podido responder: ' + e.message : 'No he podido responder ahora mismo.');
    if (code === 'not_granted') FT.mode = null;
  }
  FT.busy = false; renderFT();
}

// =============== COMUNIDAD: chat + liga ===============
let comTab = 'chat';
RENDER.comunidad = () => {
  $$('#com-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.c === comTab));
  $('#com-chat').hidden = comTab !== 'chat'; $('#com-liga').hidden = comTab !== 'liga';
  comTab === 'chat' ? renderChat() : renderLiga();
};
$('#com-seg').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { comTab = b.dataset.c; RENDER.comunidad(); } };
const CHANNELS = [['general', 'General'], ['xauusd', 'XAUUSD'], ['analisis', 'Análisis'], ['mentorias', 'Mentorías']];
let ch = 'general', msgs = {}, lastId = {}, mid = 1;
function demoChat() {
  const now = Date.now(), m = (c, u, t, ago, role) => (msgs[c] = msgs[c] || []).push({ id: mid++, ch: c, user: u, text: t, ts: now - ago * 6e4, role });
  m('general', 'Carmen_FX', '¡Buenos días, familia radiante! ¿Quién opera hoy Londres?', 95);
  m('general', 'PipHunter', 'Yo, con media posición. Hay datos de EE. UU. por la tarde.', 90);
  m('general', 'ToroBravo', 'Subí 3 puestos en la liga esta semana 💪', 40);
  m('xauusd', 'GoldDigger', 'El oro respetando la EMA 50 en H1 otra vez.', 70);
  m('xauusd', 'LoboDeWallSt', 'RSI de H4 alto, yo esperaría un retroceso para entrar.', 50);
  m('xauusd', 'Martina.V', 'Atentos al pivote diario, ayer rebotó justo ahí.', 20);
  m('analisis', 'SwingKing', 'Mi idea: rango en D1, espero ruptura con fuerza antes de entrar.', 180);
  m('mentorias', 'Laura Méndez', 'Esta semana revisamos operaciones de la liga. Traed capturas del gráfico.', 300, 'mentor');
  m('mentorias', 'Laura Méndez', 'La grabación queda en Mentorías al día siguiente.', 110, 'mentor');
}
const REPLIES = ['Buena observación 👌', 'Lo veo parecido, pero esperaría confirmación en H1.', 'Cuidado con el spread en noticias.', '¿Dónde pondrías el stop?', 'Gracias por compartir.', 'Fortunaty me marcó el mismo nivel.'];
const FAKE = ['Carmen_FX', 'PipHunter', 'GoldDigger', 'NoaTrades', 'Martina.V', 'SwingKing'];
function renderChat() {
  $('#chans').innerHTML = CHANNELS.map(([k, n]) => `<button data-ch="${k}" aria-selected="${k === ch}"># ${n}</button>`).join('');
  const list = msgs[ch] || [], box = $('#msgs');
  box.innerHTML = list.length ? list.map(m => `<div class="m ${user && m.user === user.alias ? 'mine' : ''} ${m.role ? 'mtr' : ''}"><div class="h"><b>${esc(m.user)}</b>${m.role === 'mentor' ? ' · mentor' : ''} · ${hm(m.ts)}</div><div class="t">${esc(m.text)}</div></div>`).join('') : '<p class="sub">Todavía no hay mensajes. ¡Rompe el hielo!</p>';
  box.scrollTop = box.scrollHeight;
  $('#msg').placeholder = user ? `Mensaje en #${CHANNELS.find(c => c[0] === ch)[1]}` : 'Entra con tu alias para escribir';
  $('#chat-note').textContent = (LIVE ? 'Sé respetuoso: nada de spam ni venta de señales.' : 'Chat de demostración: los mensajes solo se ven en este dispositivo.') + ' Escribe /precio para ver el oro.';
}
$('#chans').onclick = e => { const b = e.target.closest('[data-ch]'); if (!b) return; ch = b.dataset.ch; renderChat(); if (LIVE) pollChat(); };
function pushMsg(m) { (msgs[m.ch] = msgs[m.ch] || []).push(m); if (view === 'comunidad' && comTab === 'chat' && m.ch === ch) renderChat(); }
$('#send').onsubmit = async e => {
  e.preventDefault(); const text = $('#msg').value.trim(); if (!text) return;
  if (!user) { toast('Entra con tu alias para escribir'); show('cuenta'); return; }
  $('#msg').value = '';
  if (text === '/precio') { pushMsg({ id: 'p' + Date.now(), ch, user: 'Fortunaty', text: `XAUUSD cotiza a ${dec(px.XAUUSD)} (${sg(chg('XAUUSD'))} % en 24 h).`, ts: Date.now(), role: 'sys' }); return; }
  if (LIVE) { try { await api('/api/chat', { method: 'POST', body: { ch, text } }); await pollChat(); } catch (x) { toast(x.message); $('#msg').value = text; } return; }
  pushMsg({ id: mid++, ch, user: user.alias, text, ts: Date.now() });
  if (rnd() < .7) { const c = ch; await wait(1800 + rnd() * 2500); pushMsg({ id: mid++, ch: c, user: FAKE[Math.floor(rnd() * FAKE.length)], text: REPLIES[Math.floor(rnd() * REPLIES.length)], ts: Date.now() }); }
};
async function pollChat() { try { const j = await api(`/api/chat?ch=${encodeURIComponent(ch)}&after=${lastId[ch] || 0}`); if (!j.messages.length) return; j.messages.forEach(m => { (msgs[m.ch] = msgs[m.ch] || []).push(m); lastId[m.ch] = Math.max(lastId[m.ch] || 0, m.id); }); if (view === 'comunidad' && comTab === 'chat') renderChat(); } catch (e) {} }

const SEASON_END = new Date('2026-12-31T23:59:59+01:00');
const RC = ['#f2c14e', '#4fc3f7', '#3ddc97', '#b388ff', '#ff8a65'];
let traders = [], prevPos = {};
function curve(dr, vo, n = 30) { let v = 1e4; const a = [v]; for (let i = 1; i < n; i++) { v *= 1 + dr + (rnd() - .5) * vo; a.push(v); } return a; }
function stats(t) { if (t.curve && t.curve.length > 1 && !t.fixed) { const c = t.curve; t.gain = (c[c.length - 1] / c[0] - 1) * 100; let pk = c[0], dd = 0; for (const v of c) { pk = Math.max(pk, v); dd = Math.max(dd, (pk - v) / pk * 100); } t.dd = dd; } t.gain = t.gain || 0; t.dd = t.dd || 0; t.score = Math.round(10 * (t.gain - .5 * t.dd)); t.ok = t.trades >= 10; return t; }
function badges(t) { const b = []; if (t.pos <= 3 && t.ok) b.push('Podio'); if (t.win >= 65) b.push('Francotirador'); if (t.dd < 5 && t.ok) b.push('Nervios de acero'); if (t.trades >= 150) b.push('Hiperactivo'); return b; }
const SEED = [['LoboDeWallSt', 'MT5', .006, .03], ['PipHunter', 'MT4', .004, .018], ['Carmen_FX', 'MT5', .005, .012], ['ScalperZen', 'MT5', .003, .04], ['ToroBravo', 'MT4', .007, .055], ['NoaTrades', 'MT5', .002, .01], ['Draco88', 'MT4', -.001, .03], ['GoldDigger', 'MT5', .005, .035], ['Martina.V', 'MT5', .0025, .015], ['SwingKing', 'MT4', .001, .02], ['Iker_Pips', 'MT5', .0035, .025], ['LunaCapital', 'MT5', .004, .02], ['Novato21', 'MT5', .001, .05]];
function demoLeague() { traders = SEED.map(([alias, platform, dr, vo], i) => stats({ id: 'd' + i, alias, platform, curve: curve(dr, vo), trades: i === 12 ? 6 : Math.round(20 + rnd() * 200), win: Math.round(42 + rnd() * 30) })); const m = LS.get('fr.mt'); if (m && user) traders.push(stats({ ...m, me: true, alias: user.alias })); }
function ranked() { const a = [...traders].sort((x, y) => (y.ok - x.ok) || (y.score - x.score)); a.forEach((t, i) => t.pos = i + 1); return a; }
function renderLiga() {
  const s = Math.max(0, SEASON_END - Date.now()) / 1000; $('#clock').textContent = `${Math.floor(s / 86400)} d ${Math.floor(s % 86400 / 3600)} h`;
  const all = ranked(), q = $('#q').value.trim().toLowerCase(), pf = $('#pf').value;
  $('#cta-link').hidden = all.some(t => t.me);
  const top = all.filter(t => t.ok).slice(0, 3), ord = [top[1], top[0], top[2]];
  $('#podium').innerHTML = ord.map((t, i) => t ? `<div class="step p${[2, 1, 3][i]}"><div class="who">${esc(t.alias)}</div><div class="g">${sg(t.gain, 1)} % · ${t.score}</div><div class="blk">${['II', 'I', 'III'][i]}</div></div>` : '<div></div>').join('');
  $('#rows').innerHTML = all.filter(t => (!pf || t.platform === pf) && (!q || t.alias.toLowerCase().includes(q))).map(t => {
    const p = prevPos[t.id], mv = p && p !== t.pos ? `<span class="mv ${p > t.pos ? 'u' : 'd'}">${p > t.pos ? '▲' : '▼'}${Math.abs(p - t.pos)}</span>` : '';
    return `<div class="rk ${t.me ? 'me' : ''} ${t.ok ? '' : 'out'}"><div class="pos">${t.ok ? t.pos : '–'}${mv}</div><div><b>${esc(t.alias)}</b>${t.me ? ' (tú)' : ''}<span class="tag ${t.platform === 'MT5' ? 'mt5' : ''}">${esc(t.platform)}</span><div class="badges">${t.ok ? badges(t).map(x => `<span>${esc(x)}</span>`).join('') : '<span>Sin clasificar</span>'}</div><small>DD ${dec(t.dd, 1)} % · ${Number(t.trades)} ops · ${Number(t.win)} % acierto</small></div><div class="r"><b class="${t.gain >= 0 ? 'u' : 'd'}">${sg(t.gain, 1)} %</b><small>${t.score} pts</small></div></div>`;
  }).join('') || '<p class="sub">Ningún trader coincide.</p>';
  all.forEach(t => prevPos[t.id] = t.pos);
  raceSet = all.filter(t => t.ok).slice(0, 5); drawRace();
}
const race = $('#race'); let raceSet = [];
function drawRace() {
  const W = race.clientWidth, H = race.clientHeight; if (!W) return;
  const se = raceSet.filter(t => t.curve && t.curve.length > 1).map(t => t.curve.map(v => (v / t.curve[0] - 1) * 100));
  if (!se.length) { race.innerHTML = ''; $('#legend').innerHTML = '<span>Aún no hay datos suficientes</span>'; return; }
  const n = Math.max(...se.map(s => s.length)); let lo = Math.min(0, ...se.flat()), hi = Math.max(1, ...se.flat()); const pd = (hi - lo) * .08; lo -= pd; hi += pd;
  const L = 32, R = 8, T = 8, B = 20, x = i => L + i / Math.max(1, n - 1) * (W - L - R), y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const st = Math.max(1, Math.ceil((hi - lo) / 4 / 5) * 5), ticks = []; for (let v = Math.ceil(lo / st) * st; v <= hi; v += st) ticks.push(v);
  race.innerHTML = ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 5}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="var(--mute)">${v}%</text>`).join('') + se.map((s, k) => `<polyline fill="none" stroke="${RC[k]}" stroke-width="${k ? 2 : 3}" stroke-linejoin="round" points="${s.map((v, i) => x(i + n - s.length).toFixed(1) + ',' + y(v).toFixed(1)).join(' ')}"/>`).join('');
  $('#legend').innerHTML = raceSet.map((t, k) => `<span><i style="background:${RC[k]}"></i>${t.pos}. ${esc(t.alias)}</span>`).join('');
}
const raceRO = new ResizeObserver(drawRace); raceRO.observe(race);
$('#q').oninput = renderLiga; $('#pf').onchange = renderLiga;
async function loadLeague() { const j = await api('/api/leaderboard'); traders = j.traders.map(t => stats({ ...t, fixed: true })); if (view === 'comunidad' && comTab === 'liga') renderLiga(); }
function leagueTick() { if (LIVE) return; for (const t of traders) if (rnd() < .5) { const c = t.curve; c[c.length - 1] *= 1 + (rnd() - .47) * .006; if (rnd() < .15) t.trades++; stats(t); } const me = traders.find(t => t.me); if (me) LS.set('fr.mt', me); if (view === 'comunidad' && comTab === 'liga') renderLiga(); }

// =============== MENTORÍAS ===============
let MENT = null, booked = new Set(LS.get('fr.book') || []), done = new Set(LS.get('fr.course') || []);
function demoMent() {
  const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  MENT = { mentors: [
    { id: 'laura', name: 'Laura Méndez', role: 'Price action en oro', bio: 'Soportes, resistencias y lectura de velas en XAUUSD.', color: '#d9961b' },
    { id: 'diego', name: 'Diego Arce', role: 'Indicadores y sistemas', bio: 'Medias, RSI y MACD aplicados con reglas claras.', color: '#8a6a1c' },
    { id: 'sara', name: 'Sara Vidal', role: 'Riesgo y psicología', bio: 'Gestión del capital, diario y control emocional.', color: '#7c4dff' }],
    sessions: [
    { id: 's1', title: 'Análisis semanal de XAUUSD', mentorId: 'laura', start: at(1, 19), durationMin: 60, capacity: 50, booked: 31 },
    { id: 's2', title: 'Cómo usar el RSI sin engañarte', mentorId: 'diego', start: at(2, 19), durationMin: 45, capacity: 40, booked: 18 },
    { id: 's3', title: 'Revisión de operaciones de la liga', mentorId: 'laura', start: at(4, 20), durationMin: 75, capacity: 30, booked: 27 },
    { id: 's4', title: 'Gestión del riesgo: la regla del 1 %', mentorId: 'sara', start: at(6, 19), durationMin: 60, capacity: 60, booked: 12 }] };
  MENT.sessions.forEach(s => { s.mine = booked.has(s.id); if (s.mine) s.booked++; });
}
const COURSE = [
  { t: 'Fundamentos del oro', l: [
    ['Qué mueve al XAUUSD', 'El oro cotiza en dólares, así que un dólar fuerte suele presionarlo a la baja. También le afectan los tipos de interés reales (cuando suben, el oro, que no paga intereses, pierde atractivo) y su papel de refugio en momentos de miedo.'],
    ['Sesiones y volatilidad', 'El mayor movimiento suele darse en Londres y en el solape con Nueva York; Asia acostumbra a ser más tranquila. Los datos de EE. UU. (empleo, inflación, Reserva Federal) provocan picos de volatilidad.'],
    ['Spread, swap y contrato', 'En la mayoría de brókers 1 lote = 100 onzas: 1 $ de movimiento vale 100 $ por lote. El spread se ensancha con noticias y en el cambio de día; el swap se cobra o paga por mantener posiciones de un día a otro.']] },
  { t: 'Análisis técnico', l: [
    ['Soportes y resistencias', 'Zonas donde el precio reaccionó antes. Piensa en zonas, no en líneas exactas: cuantos más toques y más alta la temporalidad, más relevantes. Dibújalas con la herramienta Horizontal o Rectángulo del gráfico.'],
    ['Medias EMA 20, 50 y 200', 'Precio y EMA 50 por encima de la EMA 200 describen un contexto alcista (y al revés). La EMA 20 sirve de referencia para retrocesos en tendencias fuertes.'],
    ['RSI y MACD', 'RSI por encima de 70 indica sobrecompra y por debajo de 30 sobreventa, pero en tendencias fuertes puede quedarse ahí mucho tiempo. El cruce del MACD con su señal confirma cambios de impulso: úsalos para confirmar, no como única razón para entrar.'],
    ['Fibonacci', 'Traza el Fibonacci desde el inicio hasta el final de un impulso. Los retrocesos del 38,2 %, 50 % y 61,8 % son zonas que muchos traders vigilan para reincorporarse a la tendencia.']] },
  { t: 'Riesgo y psicología', l: [
    ['La regla del 1 %', 'Arriesga como máximo un porcentaje pequeño del capital en cada operación. Con un 1 % hacen falta muchas pérdidas seguidas para dañar seriamente la cuenta.'],
    ['Calcular el lotaje', 'Lotes = (capital × riesgo %) ÷ (distancia al stop en $ × 100). Ejemplo: 10.000 $, 1 % y stop a 5 $ → 100 ÷ 500 = 0,20 lotes. Tienes la calculadora en Más.'],
    ['Drawdown y diario', 'Una caída del 20 % necesita un +25 % para recuperarse; una del 50 %, un +100 %. Apunta cada operación en el diario para detectar los errores que repites.']] },
];
const upcoming = () => [...MENT.sessions].filter(s => new Date(s.start).getTime() + s.durationMin * 6e4 > Date.now()).sort((a, b) => new Date(a.start) - new Date(b.start));
const when = iso => new Date(iso).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const safeColor = c => /^#[0-9a-f]{3,6}$/i.test(c || '') ? c : '#0d5c45';
RENDER.mentorias = () => {
  if (!MENT) return; const mentor = id => MENT.mentors.find(m => m.id === id) || { name: '' };
  const ss = upcoming(), nx = ss[0];
  $('#next').innerHTML = nx ? `<div class="date"><b>${new Date(nx.start).getDate()}</b>${new Date(nx.start).toLocaleDateString('es-ES', { month: 'short' })}</div><div><p>Próxima sesión · ${hm(nx.start)} · ${nx.durationMin} min</p><h3>${esc(nx.title)}</h3><p>con ${esc(mentor(nx.mentorId).name)}${nx.mine && nx.link && /^https:\/\//.test(nx.link) ? ` · <a href="${esc(nx.link)}" target="_blank" rel="noopener">Entrar a la sala</a>` : ''}</p></div><button class="btn gold" data-book="${esc(nx.id)}">${nx.mine ? 'Plaza reservada ✓' : 'Reservar plaza'}</button>` : '<div><h3>No hay sesiones programadas</h3></div>';
  $('#sessions').innerHTML = ss.slice(1).map(s => `<div class="ses"><span class="when">${esc(when(s.start))}</span><h3>${esc(s.title)}</h3><span class="sub">${esc(mentor(s.mentorId).name)} · ${s.durationMin} min · ${s.booked}/${s.capacity} plazas</span><div class="meter"><i style="width:${Math.min(100, s.booked / s.capacity * 100)}%"></i></div><button class="btn ${s.mine ? 'ghost' : 'gold'} sm" data-book="${esc(s.id)}" ${!s.mine && s.booked >= s.capacity ? 'disabled' : ''}>${s.mine ? 'Reservada · cancelar' : s.booked >= s.capacity ? 'Completa' : 'Reservar plaza'}</button></div>`).join('');
  const total = COURSE.reduce((a, m) => a + m.l.length, 0); $('#prog').textContent = `${done.size}/${total} lecciones`;
  $('#course').innerHTML = COURSE.map((m, i) => { const d = m.l.filter((_, j) => done.has(i + '.' + j)).length; return `<div class="mod"><h3><span>${i + 1}. ${esc(m.t)}</span><span class="sub">${d}/${m.l.length}</span></h3><div class="meter" style="margin:10px 0"><i style="width:${d / m.l.length * 100}%"></i></div>${m.l.map(([t, x], j) => { const k = i + '.' + j, ok = done.has(k); return `<details><summary><span class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'}</span>${esc(t)}</summary><p>${esc(x)}</p><button class="btn ${ok ? 'ghost' : 'gold'} sm" data-lesson="${k}">${ok ? 'Marcar como pendiente' : 'Marcar como vista'}</button></details>`; }).join('')}</div>`; }).join('');
  $('#mentors').innerHTML = MENT.mentors.map(m => `<div class="mentor"><div class="av" style="background:${safeColor(m.color)}">${esc(m.name[0])}</div><div><b>${esc(m.name)}</b><p>${esc(m.role)}</p><p>${esc(m.bio)}</p></div></div>`).join('');
};
$('#v-mentorias').addEventListener('click', async e => {
  const l = e.target.closest('[data-lesson]');
  if (l) { const k = l.dataset.lesson; done.has(k) ? done.delete(k) : done.add(k); LS.set('fr.course', [...done]); RENDER.mentorias(); const again = $(`[data-lesson="${k}"]`); if (again) again.closest('details').open = true; return; }
  const b = e.target.closest('[data-book]'); if (!b) return;
  if (!user) { toast('Entra con tu alias para reservar'); show('cuenta'); return; }
  const s = MENT.sessions.find(x => x.id === b.dataset.book);
  if (LIVE) { try { Object.assign(s, await api(`/api/mentorias/${encodeURIComponent(s.id)}/reserva`, { method: 'POST' })); } catch (x) { return toast(x.message); } }
  else { s.mine = !s.mine; s.booked += s.mine ? 1 : -1; s.mine ? booked.add(s.id) : booked.delete(s.id); LS.set('fr.book', [...booked]); }
  toast(s.mine ? 'Plaza reservada: ' + s.title : 'Reserva cancelada'); RENDER.mentorias();
});
async function loadMent() { try { MENT = await api('/api/mentorias'); } catch (e) {} }

// =============== ÚTILES ===============
function calc() {
  const bal = num($('#c-bal').value), risk = num($('#c-risk').value), en = num($('#c-in').value), sl = num($('#c-sl').value), rr = num($('#c-rr').value) || 0, out = $('#c-out');
  if (!(bal > 0 && risk > 0 && en > 0 && sl > 0) || en === sl) { out.innerHTML = '<div><span>Rellena capital, riesgo, entrada y stop</span><b>–</b></div>'; return; }
  const dist = Math.abs(en - sl), dir = sl < en ? 1 : -1, lots = Math.floor(bal * risk / 100 / (dist * 100) * 100) / 100, real = lots * dist * 100, tp = en + dir * dist * rr;
  out.innerHTML = `<div><span>${dir > 0 ? 'Compra' : 'Venta'} · tamaño de posición</span><b>${dec(lots)} lotes</b></div><div><span>Riesgo real</span><b class="d">${usd(real)}</b></div><div><span>Take profit ${dec(rr, 1)}R</span><b>${rr > 0 ? dec(tp) : '–'}</b><span>${rr > 0 ? '+' + usd(real * rr) : ''}</span></div>`;
}
['#c-bal', '#c-risk', '#c-in', '#c-sl', '#c-rr'].forEach(s => $(s).addEventListener('input', () => { calc(); LS.set('fr.calc', { bal: $('#c-bal').value, risk: $('#c-risk').value, rr: $('#c-rr').value }); }));
$('#c-now').onclick = () => { $('#c-in').value = px.XAUUSD.toFixed(2); $('#c-sl').value = (px.XAUUSD - 5).toFixed(2); calc(); };
const MK = [['Sídney', 'Australia/Sydney', 7, 16], ['Tokio', 'Asia/Tokyo', 9, 18], ['Londres', 'Europe/London', 8, 17], ['Nueva York', 'America/New_York', 8, 17]];
const FM = {};
function zt(tz, d) { const f = FM[tz] || (FM[tz] = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', hourCycle: 'h23' })); const p = {}; f.formatToParts(d).forEach(x => p[x.type] = x.value); return { wd: p.weekday, h: +p.hour }; }
function fxOpen(d) { const n = zt('America/New_York', d); return !(n.wd === 'Sat' || (n.wd === 'Fri' && n.h >= 17) || (n.wd === 'Sun' && n.h < 17)); }
function mkOpen(m, d) { if (!fxOpen(d)) return false; const t = zt(m[1], d); return t.wd !== 'Sat' && t.wd !== 'Sun' && t.h >= m[2] && t.h < m[3]; }
function sessMini() { const now = new Date(); $('#sess-mini').innerHTML = MK.map(m => { const on = mkOpen(m, now); return `<div><b>${m[0]}</b><span class="${on ? 'on' : 'off'}">${on ? '● Abierta' : 'Cerrada'}</span></div>`; }).join(''); }
function sessions() {
  const now = new Date(), q = 9e5, start = Math.ceil(now / q) * q;
  $('#sess').innerHTML = MK.map(m => {
    const on = mkOpen(m, now); let t = null; for (let k = 0; k < 8 * 96; k++) { const d = new Date(start + k * q); if (mkOpen(m, d) !== on) { t = d; break; } }
    const mins = t ? Math.round((t - now) / 6e4) : 0, rel = mins < 1440 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : t.toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="mkt"><b>${m[0]}</b><span class="st ${on ? 'on' : ''}">${on ? 'Abierta' : 'Cerrada'}</span><small>${t ? (on ? 'Cierra en ' : 'Abre en ') + rel + ' · ' + hm(t) + ' tu hora' : ''}</small></div>`;
  }).join('') + `<p class="sub" style="margin:10px 0 0">${mkOpen(MK[2], now) && mkOpen(MK[3], now) ? 'Solape Londres–Nueva York activo: suele ser el momento de más movimiento del oro.' : fxOpen(now) ? 'Mercado abierto.' : 'Mercado cerrado por fin de semana.'}</p>`;
}
RENDER.utiles = () => { const c = LS.get('fr.calc'); if (c) { $('#c-bal').value = c.bal; $('#c-risk').value = c.risk; $('#c-rr').value = c.rr; } if (!$('#c-in').value) $('#c-now').click(); calc(); sessions(); };

// =============== DIARIO ===============
let journal = LS.get('fr.journal') || [], jdir = 1;
const pl = j => (j.out - j.in) * j.dir * j.lots * 100;
RENDER.diario = () => {
  const tot = journal.reduce((a, j) => a + pl(j), 0), w = journal.filter(j => pl(j) > 0).length;
  $('#j-sum').innerHTML = `<div><span>Operaciones</span><b>${journal.length}</b></div><div><span>Acierto</span><b>${journal.length ? Math.round(w / journal.length * 100) + ' %' : '–'}</b></div><div><span>Resultado</span><b class="${tot >= 0 ? 'u' : 'd'}">${usd(tot)}</b></div>`;
  $('#j-rows').innerHTML = journal.length ? journal.map((j, i) => `<div class="jr"><div><b>${j.dir > 0 ? 'Compra' : 'Venta'} ${dec(j.lots)} lotes</b><small>${new Date(j.ts).toLocaleDateString('es-ES')} · ${dec(j.in)} → ${dec(j.out)}${j.note ? ' · ' + esc(j.note) : ''}</small></div><b class="${pl(j) >= 0 ? 'u' : 'd'}">${usd(pl(j))}</b><button class="x" data-j="${i}" aria-label="Borrar">×</button></div>`).join('') : '<p class="sub">Sin operaciones. Se guardan en este dispositivo.</p>';
};
$('#j-dir').onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; jdir = +b.dataset.d; $$('#j-dir button').forEach(x => x.setAttribute('aria-pressed', x === b)); };
$('#j-f').onsubmit = e => { e.preventDefault(); const j = { ts: Date.now(), dir: jdir, in: num($('#j-in').value), out: num($('#j-out').value), lots: num($('#j-lots').value), note: $('#j-note').value.trim().slice(0, 140) }; if (!(j.in > 0 && j.out > 0 && j.lots > 0)) return toast('Rellena entrada, salida y lotes'); journal.unshift(j); LS.set('fr.journal', journal); ['#j-in', '#j-out', '#j-lots', '#j-note'].forEach(s => $(s).value = ''); RENDER.diario(); toast('Operación añadida'); };
$('#j-rows').onclick = e => { const b = e.target.closest('[data-j]'); if (!b) return; journal.splice(+b.dataset.j, 1); LS.set('fr.journal', journal); RENDER.diario(); };

// =============== CUENTA ===============
let authMode = 'login';
RENDER.cuenta = () => {
  const el = $('#acct'), back = '<a class="back" href="#mas">‹ Más</a>';
  if (!user) {
    el.innerHTML = back + (LIVE ? `<h1 class="title">${authMode === 'login' ? 'Entra' : 'Crea tu cuenta'}</h1><form class="card authbox" id="auth"><div class="segm"><button type="button" data-am="login" aria-pressed="${authMode === 'login'}">Entrar</button><button type="button" data-am="register" aria-pressed="${authMode === 'register'}">Crear cuenta</button></div><label>Alias<input id="a-alias" maxlength="20" autocomplete="username" required></label><label>Contraseña<input id="a-pass" type="password" autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}" required></label><p class="err" id="a-err" role="alert"></p><button class="btn gold full">${authMode === 'login' ? 'Entrar' : 'Crear cuenta'}</button></form>`
      : `<h1 class="title">Únete a Fortuna Radiante</h1><form class="card authbox" id="auth"><p class="sub" style="margin:0">Elige tu alias para el chat y la liga.</p><label>Alias<input id="a-alias" maxlength="20" required></label><p class="err" id="a-err" role="alert"></p><button class="btn gold full">Entrar</button></form>`);
    return;
  }
  ranked(); const me = traders.find(t => t.me);
  el.innerHTML = back + `<div class="profile"><div class="av">${esc(user.alias[0].toUpperCase())}</div><div><h1 class="title" style="margin:0">${esc(user.alias)}</h1><span class="sub">${me ? `${esc(me.platform)} · ${esc(me.server || '')} · ${esc(me.loginMasked || '')}` : 'Sin cuenta MetaTrader vinculada'}</span></div></div>
  ${me ? `<div class="kpis"><div><span>Posición</span><b>${me.ok ? me.pos + 'º' : '–'}</b></div><div><span>Puntos</span><b>${me.score}</b></div><div><span>Ganancia</span><b class="${me.gain >= 0 ? 'u' : 'd'}">${sg(me.gain, 1)} %</b></div><div><span>Drawdown máx.</span><b>${dec(me.dd, 1)} %</b></div></div><p>${me.ok ? 'Insignias: ' + (badges(me).map(esc).join(', ') || 'ninguna todavía') : `Te faltan ${10 - me.trades} operaciones para clasificar.`}</p><button class="btn ghost full" id="unlink">Desvincular cuenta</button>`
  : `<h2 class="sec">Vincula tu cuenta MetaTrader</h2><form class="card authbox" id="link" novalidate><p class="sub" style="margin:0">Usa la <b>contraseña de inversor</b> (solo lectura): nadie podrá operar en tu cuenta.</p><div class="radio"><label><input type="radio" name="pl" value="MT5" checked>MetaTrader 5</label><label><input type="radio" name="pl" value="MT4">MetaTrader 4</label></div><label>Número de cuenta<input id="f-login" inputmode="numeric" required></label><label>Servidor del bróker<input id="f-server" placeholder="p. ej. ICMarketsSC-Demo" required></label><label>Contraseña de inversor<input id="f-pass" type="password" autocomplete="off" required></label><p class="err" id="f-err" role="alert"></p><ol class="lsteps" id="lsteps" hidden></ol><button class="btn gold full" id="go">Vincular y entrar en la liga</button></form>`}
  <button class="btn ghost full" id="logout" style="margin-top:12px">Cerrar sesión</button>`;
};
$('#acct').addEventListener('click', async e => {
  const am = e.target.closest('[data-am]'); if (am) { authMode = am.dataset.am; RENDER.cuenta(); return; }
  if (e.target.id === 'logout') { if (!LIVE) { LS.del('fr.mt'); traders = traders.filter(t => !t.me); } setUser(null); RENDER.cuenta(); toast('Sesión cerrada'); return; }
  if (e.target.id === 'unlink') { if (LIVE) { try { await api('/api/accounts/mine', { method: 'DELETE' }); await loadLeague(); } catch (x) { return toast(x.message); } } else { traders = traders.filter(t => !t.me); LS.del('fr.mt'); } toast('Cuenta desvinculada'); RENDER.cuenta(); }
});
$('#acct').addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'auth') {
    const alias = $('#a-alias').value.trim(), err = $('#a-err'); err.textContent = '';
    if (!/^[\p{L}\p{N}_.\-]{3,20}$/u.test(alias)) return err.textContent = 'Alias de 3 a 20 caracteres: letras, números, punto o guiones.';
    if (!LIVE) { setUser({ id: 'local', alias }); toast('¡Bienvenido, ' + alias + '!'); RENDER.cuenta(); return; }
    try { const j = await api('/api/' + authMode, { method: 'POST', body: { alias, password: $('#a-pass').value } }); setUser(j.user, j.token); await loadLeague(); toast('¡Bienvenido, ' + j.user.alias + '!'); RENDER.cuenta(); } catch (x) { err.textContent = x.message; }
    return;
  }
  if (e.target.id !== 'link') return;
  const err = $('#f-err'), login = $('#f-login').value.trim(), server = $('#f-server').value.trim(), password = $('#f-pass').value, platform = $('input[name=pl]:checked').value; err.textContent = '';
  if (!/^\d{4,12}$/.test(login)) return err.textContent = 'El número de cuenta solo lleva dígitos.';
  if (server.length < 3) return err.textContent = 'Indica el servidor exacto del bróker.';
  if (password.length < 4) return err.textContent = 'Introduce la contraseña de inversor.';
  const go = $('#go'), st = $('#lsteps'); go.disabled = true; st.hidden = false;
  const L = ['Conectando con el bróker', 'Verificando contraseña de inversor', 'Sincronizando historial', 'Calculando puntos'];
  const mark = i => st.innerHTML = L.map((t, k) => `<li class="${k < i ? 'ok' : k === i ? 'now' : ''}">${k < i ? '✓' : k === i ? '…' : '·'} ${t}</li>`).join('');
  try {
    if (LIVE) { mark(0); await api('/api/accounts', { method: 'POST', body: { login, server, password, platform } }); await loadLeague(); }
    else { for (let i = 0; i < 4; i++) { mark(i); await wait(600); } const me = stats({ id: 'me', me: true, alias: user.alias, platform, server, loginMasked: '•••' + login.slice(-3), curve: curve(.004, .022), trades: Math.round(12 + rnd() * 80), win: Math.round(45 + rnd() * 25) }); traders = traders.filter(t => !t.me); traders.push(me); LS.set('fr.mt', me); }
    toast('Cuenta vinculada. ¡Ya estás en la liga!'); RENDER.cuenta();
  } catch (x) { err.textContent = x.message; st.hidden = true; go.disabled = false; $('#f-pass').value = ''; }
});

// =============== INSTALAR (PWA) ===============
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('#inst-btn').hidden = false; });
$('#inst-btn').onclick = async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; $('#inst-btn').hidden = true; };
try { if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !/claude\.ai|claudeusercontent/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) {}

// =============== arranque ===============
setTimeout(() => { const sp = $('#splash'); sp.classList.add('out'); setTimeout(() => sp.remove(), 700); }, reduce ? 300 : 1400);
setUser(user, token);
initRefs(); demoLeague(); demoChat(); demoMent(); buildTicker(); requestAnimationFrame(tkLoop);
show(location.hash.slice(1) || 'inicio');
getSampler().then(s => { if (!FT.mode && !(LIVE && FEAT.ai)) { FT.mode = s ? 'sample' : 'offline'; if (view === 'fortunaty') renderFT(); } });

let tickN = 0;
function demoTick() {
  if (!(LIVE && FEAT.prices)) ORDER.forEach(s => applyPrice(s, px[s] * (1 + (rnd() - .5) * 2 * SY[s].v * .7)));
  updTicker(); tickN++;
  if (view === 'inicio') { renderHero(); if (tickN % 3 === 0) renderMarkets(); }
  if (view === 'grafico') panes.forEach(p => { const c = LAY.panes[p.i], k = c.sym + '|' + c.tf; if (series[k]) { p.chart.setData(series[k], null, null, true); legend(p, null); } paneHead(p); });
}
setInterval(demoTick, 1000);
setInterval(leagueTick, 3000);
setInterval(() => { if (!LIVE && view === 'comunidad' && comTab === 'chat' && rnd() < .5) pushMsg({ id: mid++, ch, user: FAKE[Math.floor(rnd() * FAKE.length)], text: REPLIES[Math.floor(rnd() * REPLIES.length)], ts: Date.now() }); }, 20000);
setInterval(() => { if (view === 'inicio') { renderPulse(); sessMini(); } if (view === 'utiles') sessions(); }, 30000);

fetch('/api/health').then(r => r.ok ? r.json() : null).then(async j => {
  if (!j || !j.ok) return;
  LIVE = true; FEAT = j.features || {}; $('#mode').textContent = 'En directo';
  msgs = {}; lastId = {}; FT.mode = null;
  if (user && user.id === 'local') setUser(null);
  if (token) { try { setUser((await api('/api/me')).user, token); } catch (e) { setUser(null); } }
  if (FEAT.candles) { for (const k in series) delete series[k]; await Promise.all(ORDER.map(s => getSeries(s, 15))); ORDER.forEach(s => { const a = series[s + '|15']; if (a && a.length) { px[s] = a[a.length - 1].close; ref[s] = a[Math.max(0, a.length - 97)].close; } }); await Promise.all([60, 240, 1440].map(m => getSeries('XAUUSD', m))); }
  if (FEAT.prices) { const poll = async () => { try { const p = await api('/api/prices'); for (const s in p.prices) if (SY[s] && p.prices[s]) applyPrice(s, (p.prices[s].bid + p.prices[s].ask) / 2); } catch (e) {} }; await poll(); setInterval(poll, 2000); }
  await Promise.all([loadLeague().catch(() => {}), loadMent()]);
  show(view);
  setInterval(() => loadLeague().catch(() => {}), 60000);
  setInterval(() => { if (view === 'comunidad' && comTab === 'chat') pollChat(); }, 3000);
  pollChat();
}).catch(() => {});
}
