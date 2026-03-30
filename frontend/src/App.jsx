import { useState, useEffect, useCallback, useRef } from 'react';
import api from './utils/api.js';
import {
  RefreshCw, TrendingUp, TrendingDown, Wifi, WifiOff,
  AlertTriangle, Activity, BarChart2, BookOpen,
  Bell, FileText, Lightbulb
} from 'lucide-react';

import Chart          from './components/Chart.jsx';
import SignalsPanel   from './components/SignalsPanel.jsx';
import Journal        from './components/Journal.jsx';
import SessionsLegend from './components/SessionsLegend.jsx';
import TradeProposals from './components/TradeProposals.jsx';
import DailyReview    from './components/DailyReview.jsx';
import { runSMCAnalysis, generateTradeProposals } from './utils/smc.js';

const TIMEFRAMES = [
  { label: 'M1',  value: '1min'  },
  { label: 'M5',  value: '5min'  },
  { label: 'M15', value: '15min' },
  { label: 'M30', value: '30min' },
  { label: 'H1',  value: '1h'   },
  { label: 'H4',  value: '4h'   },
];

const REFRESH_INTERVAL = 30_000;

// ── Mobile bottom nav tabs ────────────────────────────────────────────────
const MOBILE_TABS = [
  { id: 'chart',   label: 'Chart',   Icon: BarChart2 },
  { id: 'alertes', label: 'Alertes', Icon: Bell      },
  { id: 'revue',   label: 'Revue',   Icon: FileText  },
  { id: 'journal', label: 'Journal', Icon: BookOpen  },
];

export default function App() {
  const [candles,    setCandles]    = useState([]);
  const [smcData,    setSMCData]    = useState({});
  const [proposals,  setProposals]  = useState([]);
  const [livePrice,  setLivePrice]  = useState(null);
  const [priceDir,   setPriceDir]   = useState(null);
  const [timeframe,  setTimeframe]  = useState('5min');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [isMock,     setIsMock]     = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [rightTab,   setRightTab]   = useState('signals');  // desktop right panel
  const [mobileTab,  setMobileTab]  = useState('chart');    // mobile bottom nav
  const prevPriceRef = useRef(null);

  // ── Fetch candles ────────────────────────────────────────────────────────
  const fetchCandles = useCallback(async (tf = timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/candles', {
        params: { symbol: 'XAU/USD', interval: tf, outputsize: 150 },
        timeout: 15000
      });
      const data = res.data;
      setIsMock(!!data.is_mock);
      if (!data.values || !Array.isArray(data.values))
        throw new Error('Format de réponse invalide');

      const formatted = data.values
        .map(v => ({
          time:  Math.floor(new Date(v.datetime).getTime() / 1000),
          open:  parseFloat(v.open),
          high:  parseFloat(v.high),
          low:   parseFloat(v.low),
          close: parseFloat(v.close)
        }))
        .filter(c => !isNaN(c.time) && !isNaN(c.open))
        .sort((a, b) => a.time - b.time);

      setCandles(formatted);
      const analysis = runSMCAnalysis(formatted);
      setSMCData(analysis);
      setProposals(generateTradeProposals(formatted, analysis));
      setLastUpdate(new Date());

      if (formatted.length > 0) {
        const latest = formatted[formatted.length - 1].close;
        if (prevPriceRef.current !== null)
          setPriceDir(latest > prevPriceRef.current ? 'up' : latest < prevPriceRef.current ? 'down' : null);
        prevPriceRef.current = latest;
        setLivePrice(latest);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  // ── Fetch live price ─────────────────────────────────────────────────────
  const fetchPrice = useCallback(async () => {
    try {
      const res = await api.get('/api/price', { params: { symbol: 'XAU/USD' }, timeout: 8000 });
      const p = parseFloat(res.data.price || res.data.close);
      if (!isNaN(p)) {
        setPriceDir(prevPriceRef.current !== null
          ? p > prevPriceRef.current ? 'up' : p < prevPriceRef.current ? 'down' : null
          : null);
        prevPriceRef.current = p;
        setLivePrice(p);
      }
    } catch (_) {}
  }, []);

  useEffect(() => { fetchCandles(timeframe); }, []); // eslint-disable-line
  useEffect(() => {
    const id = setInterval(() => fetchCandles(timeframe), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [fetchCandles, timeframe]);
  useEffect(() => {
    const id = setInterval(fetchPrice, 5000);
    return () => clearInterval(id);
  }, [fetchPrice]);

  const handleTimeframeChange = (tf) => { setTimeframe(tf); fetchCandles(tf); };

  const priceColor =
    priceDir === 'up'   ? 'text-emerald-400' :
    priceDir === 'down' ? 'text-red-400'     : 'text-white';

  // ── Chart content ────────────────────────────────────────────────────────
  const chartContent = candles.length === 0 && !loading ? (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <div className="text-4xl mb-3">📈</div>
        <div className="text-base font-semibold text-gray-500">Pas de données</div>
        <div className="text-sm text-gray-600 mt-1">Vérifiez que le backend tourne sur le port 3001</div>
        <button onClick={() => fetchCandles(timeframe)}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">
          Réessayer
        </button>
      </div>
    </div>
  ) : (
    <Chart candles={candles} smcData={smcData} />
  );

  // ── Timeframe selector ───────────────────────────────────────────────────
  const timeframeBar = (
    <div className="flex items-center bg-dark-700 rounded p-0.5 gap-0.5">
      {TIMEFRAMES.map(tf => (
        <button key={tf.value} onClick={() => handleTimeframeChange(tf.value)}
          className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
            timeframe === tf.value
              ? 'bg-blue-600 text-white shadow'
              : 'text-gray-400 hover:text-gray-200 hover:bg-dark-600'
          }`}>
          {tf.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-dark-900 overflow-hidden">

      {/* ══════════════════════════════════════════
          HEADER  — responsive
      ══════════════════════════════════════════ */}
      <header className="flex items-center justify-between px-3 py-2 bg-dark-800 border-b border-dark-600 shrink-0">

        {/* Brand */}
        <div className="flex items-center gap-2">
          <span className="text-yellow-400 font-black tracking-tight text-base">XAU</span>
          <span className="text-gray-500 text-sm">/USD</span>
          <span className="hidden md:inline text-xs text-gray-600 font-medium uppercase tracking-widest ml-1">
            SMC Scalping
          </span>
          {isMock && (
            <span className="flex items-center gap-1 text-xs text-yellow-500 bg-yellow-900/30 border border-yellow-700/30 px-1.5 py-0.5 rounded">
              <AlertTriangle size={9} /> DEMO
            </span>
          )}
        </div>

        {/* Live price */}
        <div className="flex items-center gap-1.5">
          {priceDir === 'up'   && <TrendingUp   size={14} className="text-emerald-400" />}
          {priceDir === 'down' && <TrendingDown  size={14} className="text-red-400"     />}
          <span className={`text-lg font-bold font-mono transition-colors duration-300 ${priceColor}`}>
            {livePrice !== null ? livePrice.toFixed(2) : '––'}
          </span>
          <span className="text-xs text-gray-500 hidden sm:inline">USD/oz</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex">{timeframeBar}</div>

          <button onClick={() => fetchCandles(timeframe)} disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 hover:text-white rounded text-xs font-medium transition-all disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">{loading ? 'Chargement…' : 'Refresh'}</span>
          </button>

          <div className="flex items-center gap-1 text-xs text-gray-500">
            {error
              ? <WifiOff size={12} className="text-red-400" />
              : <Wifi    size={12} className="text-emerald-400" />
            }
            {lastUpdate && (
              <span className="hidden sm:inline">{lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </header>

      {/* Sessions bar */}
      <SessionsLegend />

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950/50 border-b border-red-800/50 text-red-400 text-xs shrink-0">
          <AlertTriangle size={12} />
          <span className="flex-1 truncate">{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 shrink-0">✕</button>
        </div>
      )}

      {/* ══════════════════════════════════════════
          MOBILE LAYOUT  (< md)
      ══════════════════════════════════════════ */}
      <div className="flex md:hidden flex-1 flex-col overflow-hidden">

        {/* Timeframe bar (chart tab only) */}
        {mobileTab === 'chart' && (
          <div className="flex items-center justify-center py-1.5 px-3 bg-dark-800 border-b border-dark-600 shrink-0">
            {timeframeBar}
          </div>
        )}

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chart'   && chartContent}
          {mobileTab === 'alertes' && (
            <div className="h-full overflow-hidden">
              <TradeProposals proposals={proposals} />
            </div>
          )}
          {mobileTab === 'revue'   && (
            <DailyReview candles={candles} smcData={smcData} livePrice={livePrice} />
          )}
          {mobileTab === 'journal' && (
            <div className="h-full overflow-hidden">
              <Journal />
            </div>
          )}
        </div>

        {/* ── Premium mobile bottom navigation ── */}
        <nav className="flex shrink-0 bg-[#0d0d14] border-t border-dark-600 safe-area-inset-bottom"
          style={{ height: '64px' }}>
          {MOBILE_TABS.map(({ id, label, Icon }) => {
            const active = mobileTab === id;
            const badge =
              id === 'alertes' ? proposals.length : 0;

            return (
              <button key={id} onClick={() => setMobileTab(id)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-all relative ${
                  active ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
                }`}>
                {/* Active indicator dot above icon */}
                {active && (
                  <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                )}
                <div className="relative">
                  <Icon
                    size={20}
                    className={active ? 'text-yellow-400' : 'text-gray-600'}
                    strokeWidth={active ? 2.5 : 1.8}
                    fill={active ? 'currentColor' : 'none'}
                  />
                  {badge > 0 && !active && (
                    <span className="absolute -top-1 -right-1.5 text-xs font-bold px-1 rounded-full leading-none py-0.5 bg-yellow-500 text-black">
                      {badge}
                    </span>
                  )}
                </div>
                <span className={`text-xs transition-all ${active ? 'font-bold text-yellow-400' : 'font-normal text-gray-600'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* ══════════════════════════════════════════
          DESKTOP LAYOUT  (≥ md)
      ══════════════════════════════════════════ */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        {/* Chart */}
        <div className="flex-1 overflow-hidden">
          {chartContent}
        </div>

        {/* Right panel — 3 tabs: Signaux | Alertes | Revue */}
        <div className="w-72 shrink-0 flex flex-col overflow-hidden border-l border-dark-600">

          {/* Tab bar */}
          <div className="flex shrink-0 bg-dark-800 border-b border-dark-600">
            <button onClick={() => setRightTab('signals')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${
                rightTab === 'signals'
                  ? 'border-blue-500 text-blue-400 bg-dark-700/50'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <Activity size={11} />
              Signaux
              {smcData.fvgs && (
                <span className="ml-0.5 bg-dark-600 text-gray-400 text-xs px-1.5 rounded-full">
                  {(smcData.fvgs?.length || 0) + (smcData.orderBlocks?.length || 0)}
                </span>
              )}
            </button>

            <button onClick={() => setRightTab('alertes')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${
                rightTab === 'alertes'
                  ? 'border-yellow-500 text-yellow-400 bg-dark-700/50'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <Bell size={11} />
              Alertes
              {proposals.length > 0 && (
                <span className="ml-0.5 bg-yellow-900/60 text-yellow-400 text-xs px-1.5 rounded-full animate-pulse">
                  {proposals.length}
                </span>
              )}
            </button>

            <button onClick={() => setRightTab('revue')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${
                rightTab === 'revue'
                  ? 'border-yellow-500 text-yellow-400 bg-dark-700/50'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <FileText size={11} />
              Revue
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === 'signals' && <SignalsPanel   smcData={smcData}     />}
            {rightTab === 'alertes' && <TradeProposals proposals={proposals} />}
            {rightTab === 'revue'   && (
              <DailyReview candles={candles} smcData={smcData} livePrice={livePrice} />
            )}
          </div>
        </div>
      </div>

      {/* Journal — desktop only (mobile has its own tab) */}
      <div className="hidden md:block shrink-0">
        <Journal />
      </div>
    </div>
  );
}
