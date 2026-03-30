# XAUUSD SMC Trading Platform

A professional Smart Money Concepts (SMC) trading platform for XAUUSD scalping.
Built with React + Vite (frontend) and Node.js Express (backend).

## Features

- **Live Candlestick Chart** — powered by TradingView Lightweight Charts v4
- **Fair Value Gap (FVG)** detection — bullish & bearish, with fill tracking
- **Order Block (OB)** detection — demand/supply zones with mitigation tracking
- **BOS / CHoCH** — Break of Structure and Change of Character signals
- **Liquidity levels** — BSL (equal highs) and SSL (equal lows) detection
- **Session boxes** — Asia, London, New York session highlights
- **Trade Journal** — with RR calculator, P&L tracking, and localStorage persistence
- **Live price ticker** — refreshes every 5 seconds
- **Auto-refresh** — candles refresh every 30 seconds

## Quick Start

### 1. Backend

```bash
cd trading-platform/backend
npm install

# Configure API key (get free key at https://twelvedata.com)
cp .env.example .env
# Edit .env and add your TWELVE_DATA_API_KEY

npm run dev     # development (requires nodemon)
# OR
npm start       # production
```

The backend runs on **http://localhost:3001**.
Without an API key, it automatically serves realistic mock XAUUSD data.

### 2. Frontend

```bash
cd trading-platform/frontend
npm install
npm run dev
```

The frontend runs on **http://localhost:3000**.

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/candles?symbol=XAU/USD&interval=5min&outputsize=150` | OHLCV candle data |
| `GET /api/price?symbol=XAU/USD` | Real-time quote |
| `GET /api/health` | Health check |

## SMC Algorithms

### Fair Value Gap (FVG)
3-candle pattern. Bullish: `C0.high < C2.low`. Bearish: `C0.low > C2.high`.
Gaps are tracked and marked filled when price trades through them.

### Order Blocks (OB)
- **Bullish OB (Demand)**: Last bearish candle before a 0.3%+ bullish move
- **Bearish OB (Supply)**: Last bullish candle before a 0.3%+ bearish move
- Marked as mitigated when price returns through the OB

### BOS / CHoCH
- Swing highs/lows identified using 3-bar look-left/look-right
- **BOS**: Break in direction of current trend (continuation)
- **CHoCH**: Break against current trend (potential reversal)

### Liquidity
- Equal highs within 0.1% = Buy Side Liquidity (BSL)
- Equal lows within 0.1% = Sell Side Liquidity (SSL)
- Session high/low marked automatically

## Tech Stack

- **Frontend**: React 18, Vite 5, Tailwind CSS 3, Lightweight Charts 4, Lucide React
- **Backend**: Node.js, Express 4, Axios, dotenv
- **Data**: Twelve Data API (free tier: 800 requests/day)
