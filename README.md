# Fortuna Radiante

App móvil para traders del oro:

- **Cinta de precios** que se desliza sola (y con el dedo) con XAUUSD, DXY, BTC y USOIL en tiempo real. Toca uno para abrir su gráfico.
- **Gráfico estilo TradingView** (motor propio, sin librerías):
  - arrastrar para moverse, pellizcar o rueda para hacer zoom, arrastrar la escala de precios para estirarla (doble toque = automática), pulsación larga para la cruz;
  - temporalidades 1m, 5m, 15m, 1H, 4H y 1D; velas, Heikin Ashi, barras, línea y área;
  - herramientas: línea de tendencia, línea horizontal, rectángulo, Fibonacci, regla de medir e imán. Cada dibujo se puede seleccionar, mover, estirar, cambiar de color y borrar, y se guarda por símbolo;
  - indicadores con ajustes: EMA (3 periodos), Bandas de Bollinger, pivotes diarios, RSI y MACD;
  - pantalla completa.
- **Fortunaty**, la IA: análisis técnico con los indicadores reales de H1/H4/D1, niveles, escenarios y **noticias del oro con fuentes** (búsqueda web).
- **Comunidad**: chat por canales y liga de trading con cuentas MT4/MT5.
- **Más**: mentorías con reservas y curso, calculadora de lotaje, sesiones de mercado, diario de operaciones, cuenta.
- **Instalable** en el móvil (PWA): icono propio, pantalla completa y apertura instantánea.

## Puesta en marcha

1. Node.js 18 o superior.
2. En `server/`:
   ```bash
   cp .env.example .env
   npm install
   npm start
   ```
3. Abre http://localhost:3000

### Lo que hay que rellenar en `.env`

| Variable | Para qué |
|---|---|
| `METAAPI_TOKEN` | Liga (cuentas MT4/MT5), precios y velas. Token en https://app.metaapi.cloud/token |
| `MARKET_ACCOUNT_ID` | Una cuenta tuya añadida en MetaApi (vale una demo). De ella salen los precios en tiempo real y el gráfico. |
| `SYMBOL_MAP` | Cómo llama tu bróker a cada símbolo. Ej.: `XAUUSD=XAUUSD.m,DXY=USDX,BTCUSD=BTCUSD,USOIL=WTI`. **Muchos brókers no tienen DXY**: elige uno que lo ofrezca o déjalo fuera y en la cinta saldrá «—». |
| `ANTHROPIC_API_KEY` | Fortunaty. Clave en https://console.anthropic.com. Para las noticias, el administrador debe activar la **búsqueda web** en la consola. |
| `FORTUNATY_MODEL` | Modelo de Claude (por defecto `claude-sonnet-5-5`). |
| `FORTUNATY_PER_HOUR` | Preguntas por usuario y hora (control de gasto). |

Si falta algo, esa parte sigue en modo demo y la app lo indica.

## Publicarla

- Hosting de Node con **HTTPS** (Render, Railway, Fly.io o un VPS) y disco persistente para `server/data/`.
- Con HTTPS, desde el móvil: Safari → Compartir → *Añadir a pantalla de inicio*; Chrome → *Instalar aplicación*.

### ¿Y en App Store / Google Play?

La app ya está hecha como PWA. Para subirla a las tiendas, envuélvela con **Capacitor**:

```bash
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Fortuna Radiante" com.fortunaradiante.app --web-dir=server/public
npx cap add android && npx cap add ios
```

En `capacitor.config` pon `server.url` con la dirección HTTPS de tu servidor para que las llamadas a `/api` funcionen. Apple y Google revisan las apps de trading: necesitarás política de privacidad y avisos de riesgo.

## Administración

Cabecera `x-admin-key: TU_ADMIN_KEY`:

- `POST /api/admin/user` `{"alias":"Laura","role":"mentor"}` — nombrar mentor
- `POST /api/admin/user` `{"alias":"X","muted":true}` — silenciar en el chat
- `DELETE /api/admin/chat/:id` — borrar mensaje
- `DELETE /api/admin/accounts/:id` — expulsar cuenta de la liga

Mentores y sesiones: `server/data/mentorias.json` (se crea al arrancar).

## A tener en cuenta

- **Costes**: MetaApi cobra por cuenta conectada; Claude cobra por uso (y la búsqueda web aparte). `FORTUNATY_PER_HOUR` limita el gasto.
- **SDK de MetaApi**: nombres como `getSymbolPrice`, `getHistoricalCandles` o los campos de MetaStats pueden variar entre versiones; están agrupados en `server.js` (secciones *mercado* y *liga*).
- **Chat**: consulta cada 3 s; para miles de usuarios conviene pasarlo a WebSockets.
- Diario, dibujos del gráfico, ajustes de indicadores y progreso del curso se guardan en el móvil de cada usuario.
- Fortunaty y la app ofrecen información y formación, no asesoramiento financiero. Si das premios en la liga, publica unas bases legales.
