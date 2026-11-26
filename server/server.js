// Fortuna Radiante — servidor
// Precios en tiempo real (XAUUSD, DXY, BTC, USOIL) y velas vía MetaApi · Fortunaty (Claude + búsqueda web)
// · usuarios · liga de cuentas MT4/MT5 · chat · mentorías. Sirve la app de la carpeta public/.
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sdk = require('metaapi.cloud-sdk');
const MetaApi = sdk.default;
const { MetaStats } = sdk;

const env = process.env;
const TOKEN = env.METAAPI_TOKEN, ADMIN_KEY = env.ADMIN_KEY || '', PORT = Number(env.PORT || 3000);
const REFRESH_MIN = Number(env.REFRESH_MINUTES || 15);
const MARKET_ACCOUNT_ID = env.MARKET_ACCOUNT_ID || '';
const ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY || '';
const FORTUNATY_MODEL = env.FORTUNATY_MODEL || 'claude-sonnet-5-5';
// símbolo de la app = símbolo en tu bróker (cada bróker los llama distinto)
const SYMBOLS = Object.fromEntries((env.SYMBOL_MAP || 'XAUUSD=XAUUSD,DXY=USDX,BTCUSD=BTCUSD,USOIL=XTIUSD').split(',').map(p => p.split('=').map(s => s.trim())).filter(p => p[0] && p[1]));
const DATA = path.join(__dirname, 'data'), DB_FILE = path.join(DATA, 'db.json'), MENT_FILE = path.join(DATA, 'mentorias.json');
const CHANNELS = ['general', 'xauusd', 'analisis', 'mentorias'];

if (!TOKEN) { console.error('Falta METAAPI_TOKEN en .env (https://app.metaapi.cloud/token)'); process.exit(1); }
const api = new MetaApi(TOKEN);
const metaStats = new MetaStats(TOKEN);

// ---------------- almacenamiento ----------------
fs.mkdirSync(DATA, { recursive: true });
let db = { users: [], sessions: {}, accounts: [], chat: [], bookings: {}, nextMsgId: 1 };
try { db = { ...db, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) }; } catch {}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); }, 300); }
if (!fs.existsSync(MENT_FILE)) {
  const at = (d, h) => { const x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
  fs.writeFileSync(MENT_FILE, JSON.stringify({
    mentors: [
      { id: 'laura', name: 'Laura Méndez', role: 'Price action en oro', bio: 'Soportes, resistencias y lectura de velas en XAUUSD.', color: '#d9961b' },
      { id: 'diego', name: 'Diego Arce', role: 'Indicadores y sistemas', bio: 'Medias, RSI y MACD aplicados con reglas claras.', color: '#8a6a1c' },
      { id: 'sara', name: 'Sara Vidal', role: 'Riesgo y psicología', bio: 'Gestión del capital, diario y control emocional.', color: '#7c4dff' },
    ],
    sessions: [
      { id: 's1', title: 'Análisis semanal de XAUUSD', mentorId: 'laura', start: at(1, 19), durationMin: 60, capacity: 50, link: 'https://meet.example.com/sala-oro' },
      { id: 's2', title: 'Cómo usar el RSI sin engañarte', mentorId: 'diego', start: at(2, 19), durationMin: 45, capacity: 40, link: 'https://meet.example.com/sala-rsi' },
      { id: 's3', title: 'Revisión de operaciones de la liga', mentorId: 'laura', start: at(4, 20), durationMin: 75, capacity: 30, link: 'https://meet.example.com/sala-liga' },
    ],
  }, null, 2));
}
const readMent = () => JSON.parse(fs.readFileSync(MENT_FILE, 'utf8'));

// ---------------- utilidades ----------------
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const pub = u => ({ id: u.id, alias: u.alias, role: u.role || 'user' });
function auth(req, res, next) { const t = (req.get('authorization') || '').replace(/^Bearer /, ''), uid = t && db.sessions[t]; req.user = uid ? db.users.find(u => u.id === uid) : null; next(); }
const needUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Entra con tu cuenta para hacer esto.' });
const needAdmin = (req, res, next) => ADMIN_KEY && req.get('x-admin-key') === ADMIN_KEY ? next() : res.status(401).json({ error: 'No autorizado' });
const hits = new Map();
function limited(key, max, windowMs) { const now = Date.now(), list = (hits.get(key) || []).filter(t => now - t < windowMs); list.push(now); hits.set(key, list); return list.length > max; }

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', auth);

app.get('/api/health', (req, res) => res.json({ ok: true, refreshMinutes: REFRESH_MIN, features: { candles: !!MARKET_ACCOUNT_ID, prices: !!MARKET_ACCOUNT_ID, ai: !!ANTHROPIC_API_KEY } }));

// ---------------- mercado: precios en tiempo real y velas ----------------
const prices = {}; let rpc = null, marketAcc = null, polling = false;
async function getMarketAccount() {
  if (marketAcc) return marketAcc;
  marketAcc = await api.metatraderAccountApi.getAccount(MARKET_ACCOUNT_ID);
  if (marketAcc.state !== 'DEPLOYED') await marketAcc.deploy();
  await marketAcc.waitConnected();
  return marketAcc;
}
async function getRpc() {
  if (rpc) return rpc;
  const acc = await getMarketAccount(), c = acc.getRPCConnection();
  await c.connect(); await c.waitSynchronized();
  return (rpc = c);
}
async function pollPrices() {
  if (polling || !MARKET_ACCOUNT_ID) return; polling = true;
  try {
    const c = await getRpc();
    for (const [appSym, brokerSym] of Object.entries(SYMBOLS)) {
      try { const p = await c.getSymbolPrice(brokerSym); if (p && p.bid) prices[appSym] = { bid: p.bid, ask: p.ask, time: p.time }; }
      catch (e) { if (!prices[appSym]) console.warn(`[precio] ${appSym} (${brokerSym}): ${e.message}`); }
    }
  } catch (e) { console.warn('[precios]', e.message); rpc = null; marketAcc = null; }
  polling = false;
}
app.get('/api/prices', (req, res) => res.json({ prices }));
const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'], candleCache = {};
app.get('/api/candles', async (req, res) => {
  const symbol = String(req.query.symbol || 'XAUUSD'), tf = String(req.query.tf || '1h');
  if (!MARKET_ACCOUNT_ID) return res.status(404).json({ error: 'Velas no configuradas (MARKET_ACCOUNT_ID).' });
  if (!SYMBOLS[symbol] || !TFS.includes(tf)) return res.status(400).json({ error: 'Símbolo o temporalidad no válidos' });
  const key = symbol + '|' + tf, c = candleCache[key];
  if (c && Date.now() - c.at < 15e3) return res.json({ candles: c.data });
  try {
    const acc = await getMarketAccount();
    const raw = await acc.getHistoricalCandles(SYMBOLS[symbol], tf, undefined, 500);
    const data = raw.map(k => ({ time: new Date(k.time).getTime(), open: k.open, high: k.high, low: k.low, close: k.close })).sort((a, b) => a.time - b.time);
    candleCache[key] = { at: Date.now(), data };
    res.json({ candles: data });
  } catch (e) { console.warn('[velas]', symbol, e.message); res.status(502).json({ error: 'No se pudieron obtener las velas.' }); }
});

// ---------------- Fortunaty (Claude + búsqueda web) ----------------
const FORTUNATY_SYS = `Eres Fortunaty, la inteligencia artificial de la app Fortuna Radiante, especializada en el oro (XAUUSD) y en los mercados relacionados (DXY, Bitcoin, petróleo WTI).
Respondes siempre en español, con tono cercano, claro y profesional, pensado para leerse en el móvil: frases cortas, títulos breves con ###, listas con guiones y cifras concretas tomadas de los DATOS que acompañan a cada pregunta. Máximo unas 250 palabras salvo que pidan más.
Para un análisis técnico usa: ### Resumen · ### Tendencia (H1, H4, D1) · ### Niveles clave · ### Escenarios (alcista y bajista, con qué confirmaría cada uno) · ### Riesgos.
Tienes búsqueda web. Úsala siempre que pregunten por noticias, eventos, datos macro, la Reserva Federal o "qué está pasando": busca noticias recientes del oro y del dólar (prioriza Reuters, Bloomberg, Kitco, FXStreet, Investing.com, CNBC), indica la fecha de cada noticia y explica cómo puede afectar al XAUUSD. No inventes titulares ni cifras.
Nunca garantices resultados ni des órdenes personalizadas de compra o venta; describe escenarios y niveles. Termina los análisis con: "Esto es información, no asesoramiento financiero."`;
async function claude(body) {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j.error && j.error.message) || 'Error ' + r.status);
  return j;
}
app.post('/api/fortunaty', async (req, res) => {
  if (!ANTHROPIC_API_KEY) return res.status(404).json({ error: 'Fortunaty no está configurado (ANTHROPIC_API_KEY).' });
  const who = req.user ? 'u:' + req.user.id : 'ip:' + req.ip;
  if (limited('ai:' + who, Number(env.FORTUNATY_PER_HOUR || 30), 3600e3)) return res.status(429).json({ error: 'Has llegado al límite de preguntas por hora. Vuelve en un rato.' });
  let msgs = Array.isArray(req.body.messages) ? req.body.messages.slice(-12) : [];
  msgs = msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()).map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const clean = []; for (const m of msgs) { if (clean.length && clean[clean.length - 1].role === m.role) clean[clean.length - 1] = m; else clean.push(m); }
  if (!clean.length || clean[clean.length - 1].role !== 'user') return res.status(400).json({ error: 'Falta la pregunta.' });
  const snap = JSON.stringify(req.body.snapshot || {}).slice(0, 20000);
  // Los datos del servidor mandan: sustituye los precios del cliente por los reales si los hay
  const extra = Object.keys(prices).length ? `\nPRECIOS EN TIEMPO REAL DEL SERVIDOR: ${JSON.stringify(prices)}` : '';
  clean[clean.length - 1] = { role: 'user', content: `DATOS DE MERCADO ACTUALES (JSON): ${snap}${extra}\n\nPREGUNTA: ${clean[clean.length - 1].content}` };
  try {
    const body = { model: FORTUNATY_MODEL, max_tokens: 1600, system: FORTUNATY_SYS, messages: clean, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }] };
    let j = await claude(body), content = [...j.content];
    for (let k = 0; j.stop_reason === 'pause_turn' && k < 3; k++) { body.messages = [...clean, { role: 'assistant', content }]; j = await claude(body); content = [...content, ...j.content]; }
    const text = content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const seen = new Set(), sources = [];
    for (const b of content) for (const c of (b.type === 'text' && b.citations) || []) if (c.url && !seen.has(c.url) && /^https:\/\//.test(c.url)) { seen.add(c.url); sources.push({ title: c.title || c.url, url: c.url }); }
    res.json({ text: text || 'No he podido generar una respuesta. Prueba a reformular la pregunta.', sources: sources.slice(0, 6) });
  } catch (e) { console.warn('[fortunaty]', e.message); res.status(502).json({ error: 'Fortunaty no está disponible ahora mismo.' }); }
});

// ---------------- usuarios ----------------
app.post('/api/register', (req, res) => {
  if (limited('reg:' + req.ip, 5, 3600e3)) return res.status(429).json({ error: 'Demasiados intentos. Prueba más tarde.' });
  const alias = String(req.body.alias || '').trim(), password = String(req.body.password || '');
  if (!/^[\p{L}\p{N}_.\-]{3,20}$/u.test(alias)) return res.status(400).json({ error: 'Alias de 3 a 20 caracteres: letras, números, punto o guiones.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña necesita al menos 8 caracteres.' });
  if (db.users.some(u => u.alias.toLowerCase() === alias.toLowerCase())) return res.status(409).json({ error: 'Ese alias ya existe.' });
  const salt = crypto.randomBytes(16).toString('hex'), user = { id: crypto.randomUUID(), alias, salt, hash: hash(password, salt), role: 'user', createdAt: new Date().toISOString() };
  db.users.push(user); const token = crypto.randomBytes(32).toString('hex'); db.sessions[token] = user.id; save();
  res.status(201).json({ user: pub(user), token });
});
app.post('/api/login', (req, res) => {
  if (limited('login:' + req.ip, 10, 900e3)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  const user = db.users.find(u => u.alias.toLowerCase() === String(req.body.alias || '').trim().toLowerCase());
  if (!user || !crypto.timingSafeEqual(Buffer.from(hash(String(req.body.password || ''), user.salt), 'hex'), Buffer.from(user.hash, 'hex'))) return res.status(401).json({ error: 'Alias o contraseña incorrectos.' });
  const token = crypto.randomBytes(32).toString('hex'); db.sessions[token] = user.id; save();
  res.json({ user: pub(user), token });
});
app.get('/api/me', needUser, (req, res) => res.json({ user: pub(req.user) }));

// ---------------- liga ----------------
async function refreshAccount(acc) {
  try {
    const m = await metaStats.getMetrics(acc.id, true);
    acc.gain = Number(m.gain || 0); acc.dd = Number(m.maxDrawdown || 0); acc.trades = Number(m.trades || 0); acc.win = Math.round(Number(m.wonTradesPercent || 0));
    const equity = Number(m.equity ?? m.balance ?? 0), today = new Date().toISOString().slice(0, 10);
    acc.curve = acc.curve || []; const last = acc.curve[acc.curve.length - 1];
    if (last && last.d === today) last.v = equity; else if (equity) acc.curve.push({ d: today, v: equity });
    acc.curve = acc.curve.slice(-120); acc.updatedAt = new Date().toISOString(); acc.error = null;
  } catch (e) { acc.error = e.message; console.warn(`[métricas] ${acc.alias}: ${e.message}`); }
}
let refreshing = false;
async function refreshAll() { if (refreshing) return; refreshing = true; for (const a of db.accounts) await refreshAccount(a); save(); refreshing = false; }
app.get('/api/leaderboard', (req, res) => res.json({ traders: db.accounts.map(a => { const u = db.users.find(x => x.id === a.userId); return { id: a.id, alias: u ? u.alias : a.alias, platform: a.platform, server: a.server, loginMasked: a.loginMasked, gain: a.gain || 0, dd: a.dd || 0, trades: a.trades || 0, win: a.win || 0, curve: (a.curve || []).map(p => p.v), me: !!req.user && a.userId === req.user.id }; }) }));
app.post('/api/accounts', needUser, async (req, res) => {
  if (limited('link:' + req.user.id, 5, 3600e3)) return res.status(429).json({ error: 'Demasiados intentos. Prueba dentro de una hora.' });
  const { login, server, password, platform } = req.body || {}, pf = String(platform || '').toUpperCase();
  if (!/^\d{4,12}$/.test(String(login || ''))) return res.status(400).json({ error: 'Login no válido.' });
  if (!server || !password) return res.status(400).json({ error: 'Faltan servidor o contraseña.' });
  if (!['MT4', 'MT5'].includes(pf)) return res.status(400).json({ error: 'Plataforma no válida.' });
  if (db.accounts.some(a => a.userId === req.user.id)) return res.status(409).json({ error: 'Ya tienes una cuenta vinculada.' });
  if (db.accounts.some(a => a.login === String(login) && a.server === server)) return res.status(409).json({ error: 'Esta cuenta ya está en la liga.' });
  let account;
  try {
    account = await api.metatraderAccountApi.createAccount({ name: `fortuna-${req.user.alias}`, type: 'cloud', login: String(login), password, server, platform: pf.toLowerCase(), magic: 0 });
    try { await account.deploy(); } catch {}
    await account.waitConnected(300);
  } catch (e) {
    if (account) { try { await account.remove(); } catch {} }
    console.warn('[vincular]', e.message);
    return res.status(400).json({ error: /auth|password|E_AUTH/i.test(e.message) ? 'Login, servidor o contraseña incorrectos.' : 'No se pudo conectar con la cuenta. Revisa el servidor del bróker.' });
  }
  const acc = { id: account.id, userId: req.user.id, alias: req.user.alias, platform: pf, server, login: String(login), loginMasked: '•••' + String(login).slice(-3), createdAt: new Date().toISOString(), curve: [] };
  db.accounts.push(acc); save(); refreshAccount(acc).then(save);
  res.status(201).json({ id: acc.id }); // la contraseña de inversor se envía a MetaApi y NO se guarda aquí
});
async function removeAccount(acc) { try { const a = await api.metatraderAccountApi.getAccount(acc.id); await a.remove(); } catch (e) { console.warn(e.message); } db.accounts = db.accounts.filter(a => a !== acc); save(); }
app.delete('/api/accounts/mine', needUser, async (req, res) => { const acc = db.accounts.find(a => a.userId === req.user.id); if (!acc) return res.status(404).json({ error: 'No tienes cuenta vinculada.' }); await removeAccount(acc); res.json({ ok: true }); });
app.delete('/api/admin/accounts/:id', needAdmin, async (req, res) => { const acc = db.accounts.find(a => a.id === req.params.id); if (!acc) return res.status(404).json({ error: 'No existe' }); await removeAccount(acc); res.json({ ok: true }); });

// ---------------- chat ----------------
app.get('/api/chat', (req, res) => {
  const ch = String(req.query.ch || 'general'), after = Number(req.query.after || 0);
  if (!CHANNELS.includes(ch)) return res.status(400).json({ error: 'Canal no válido' });
  res.json({ messages: db.chat.filter(m => m.ch === ch && m.id > after).slice(-100) });
});
app.post('/api/chat', needUser, (req, res) => {
  const ch = String(req.body.ch || ''), text = String(req.body.text || '').trim();
  if (!CHANNELS.includes(ch)) return res.status(400).json({ error: 'Canal no válido' });
  if (!text || text.length > 500) return res.status(400).json({ error: 'El mensaje debe tener entre 1 y 500 caracteres.' });
  if (req.user.muted) return res.status(403).json({ error: 'No puedes escribir en el chat.' });
  if (limited('chat:' + req.user.id, 10, 60e3)) return res.status(429).json({ error: 'Vas muy rápido. Espera un momento.' });
  const m = { id: db.nextMsgId++, ch, user: req.user.alias, role: req.user.role === 'mentor' ? 'mentor' : undefined, text, ts: Date.now() };
  db.chat.push(m);
  const per = db.chat.filter(x => x.ch === ch); if (per.length > 1000) { const cut = per[per.length - 1000].id; db.chat = db.chat.filter(x => x.ch !== ch || x.id >= cut); }
  save(); res.status(201).json(m);
});
app.delete('/api/admin/chat/:id', needAdmin, (req, res) => { db.chat = db.chat.filter(m => m.id !== Number(req.params.id)); save(); res.json({ ok: true }); });
app.post('/api/admin/user', needAdmin, (req, res) => {
  const u = db.users.find(x => x.alias.toLowerCase() === String(req.body.alias || '').toLowerCase()); if (!u) return res.status(404).json({ error: 'No existe' });
  if (req.body.role) u.role = req.body.role === 'mentor' ? 'mentor' : 'user';
  if (typeof req.body.muted === 'boolean') u.muted = req.body.muted;
  save(); res.json({ user: pub(u), muted: !!u.muted });
});

// ---------------- mentorías ----------------
function mentView(s, user) { const list = db.bookings[s.id] || [], mine = !!user && list.includes(user.id); return { id: s.id, title: s.title, mentorId: s.mentorId, start: s.start, durationMin: s.durationMin, capacity: s.capacity, booked: list.length, mine, link: mine ? s.link : undefined }; }
app.get('/api/mentorias', (req, res) => { const m = readMent(); res.json({ mentors: m.mentors, sessions: m.sessions.map(s => mentView(s, req.user)) }); });
app.post('/api/mentorias/:id/reserva', needUser, (req, res) => {
  const s = readMent().sessions.find(x => x.id === req.params.id); if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
  const list = db.bookings[s.id] = db.bookings[s.id] || [], i = list.indexOf(req.user.id);
  if (i >= 0) list.splice(i, 1); else { if (list.length >= s.capacity) return res.status(409).json({ error: 'La sesión está completa.' }); list.push(req.user.id); }
  save(); res.json(mentView(s, req.user));
});

app.listen(PORT, () => {
  console.log(`Fortuna Radiante en http://localhost:${PORT}`);
  refreshAll(); setInterval(refreshAll, REFRESH_MIN * 60e3);
  if (MARKET_ACCOUNT_ID) { pollPrices(); setInterval(pollPrices, 2000); }
});
