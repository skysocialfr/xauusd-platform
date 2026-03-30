require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS : autoriser toutes les origines (Vercel, local, etc.)
app.use(cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// GET /api/candles - Fetch OHLCV candle data from Twelve Data
app.get('/api/candles', async (req, res) => {
  const symbol = req.query.symbol || 'XAU/USD';
  const interval = req.query.interval || '5min';
  const outputsize = req.query.outputsize || 100;

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    // Return mock data when no API key is configured
    return res.json(generateMockCandles(symbol, interval, Number(outputsize)));
  }

  try {
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data.status === 'error') {
      console.error('Twelve Data API error:', response.data.message);
      return res.status(400).json({
        error: response.data.message || 'API error from Twelve Data'
      });
    }

    return res.json(response.data);
  } catch (err) {
    console.error('Error fetching candles:', err.message);
    return res.status(500).json({ error: 'Failed to fetch candle data', details: err.message });
  }
});

// GET /api/price - Fetch real-time quote from Twelve Data
app.get('/api/price', async (req, res) => {
  const symbol = req.query.symbol || 'XAU/USD';

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey || apiKey === 'your_api_key_here') {
    // Return mock price
    const base = 2340.50;
    const price = (base + (Math.random() - 0.5) * 5).toFixed(2);
    return res.json({
      symbol,
      price,
      timestamp: new Date().toISOString(),
      is_mock: true
    });
  }

  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const response = await axios.get(url, { timeout: 10000 });

    if (response.data.status === 'error') {
      return res.status(400).json({ error: response.data.message });
    }

    return res.json(response.data);
  } catch (err) {
    console.error('Error fetching price:', err.message);
    return res.status(500).json({ error: 'Failed to fetch price', details: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Mock data generator (used when no API key is provided) ---
function generateMockCandles(symbol, interval, count) {
  const intervalMinutes = {
    '1min': 1, '5min': 5, '15min': 15, '30min': 30,
    '1h': 60, '4h': 240, '1day': 1440
  };
  const mins = intervalMinutes[interval] || 5;

  const values = [];
  let price = 2340.00;
  const now = Math.floor(Date.now() / 1000);

  for (let i = count - 1; i >= 0; i--) {
    const timestamp = now - i * mins * 60;
    const date = new Date(timestamp * 1000);
    const dateStr = date.toISOString().slice(0, 19).replace('T', ' ');

    const open = price + (Math.random() - 0.5) * 3;
    const close = open + (Math.random() - 0.5) * 6;
    const high = Math.max(open, close) + Math.random() * 2;
    const low = Math.min(open, close) - Math.random() * 2;
    const volume = Math.floor(500 + Math.random() * 2000);

    values.push({
      datetime: dateStr,
      open: open.toFixed(2),
      high: high.toFixed(2),
      low: low.toFixed(2),
      close: close.toFixed(2),
      volume: String(volume)
    });

    price = close;
  }

  return {
    meta: { symbol, interval, currency: 'USD', type: 'Physical Currency' },
    values,
    status: 'ok',
    is_mock: true
  };
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.TWELVE_DATA_API_KEY || process.env.TWELVE_DATA_API_KEY === 'your_api_key_here') {
    console.log('Note: No API key configured. Using mock data. Copy .env.example to .env and add your Twelve Data API key.');
  }
});
