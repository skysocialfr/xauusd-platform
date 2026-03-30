import { useState, useEffect, useCallback, useRef } from 'react';
import api from './utils/api.js';
import {
  RefreshCw, TrendingUp, TrendingDown, Wifi, WifiOff,
  AlertTriangle, Activity, BarChart2, BookOpen,
  Bell, FileText, Volume2, VolumeX
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

// Refresh interval par timeframe (en ms) — adapté au scalping
const REFRESH_BY_TF = {
  '1min':  12_000,  // M1  → 12 secondes
  '5min':  20_000,  // M5  → 20 secondes
  '15min': 30_000,  // M15 → 30 secondes
  '30min': 45_000,  // M30 → 45 secondes
  '1h':    60_000,  // H1  → 60 secondes
  '4h':   120_000,  // H4  → 2 minutes
};

const MOBILE_TABS = [
  { id: 'chart',   label: 'Chart',   Icon: BarChart2 },
  { id: 'alertes', label: 'Alertes', Icon: Bell      },
  { id: 'revue',   label: 'Revue',   Icon: FileText  },
  { id: 'journal', label: 'Journal', Icon: BookOpen  },
];

// ── Son d'alerte (bip court via Web Audio API) ──────────────────────────────
function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

// ── Toast notification ────────────────────────────────────────────────────────
function AlertToast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-16 right-2 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
      {toasts.map(t => (
        <div key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`pointer-events-auto flex items-start gap-2 px-3 py-2.5 rounded-lg shadow-xl border cursor-pointer animate-slide-in ${
            t.direction === 'BUY'
              ? 'bg-emerald-950 border-emerald-600/60 text-emerald-200'
              : 'bg-red-950 border-red-600/60 text-red-200'
          }`}>
          <span className="text-lg shrink-0">{t.direction === 'BUY' ? '🟢' : '🔴'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide">
              Nouveau setup {t.direction} — {t.setup}
            </div>
            <div className="text-xs opacity-80 truncate mt-0.5">
              Entrée {t.entry} · SL {t.sl} · TP {t.tp} · {t.rr}R
            </div>
            <div className="text-xs opacity-60 mt-0.5 italic truncate">{t.firstReason}</div>
          </div>
          <span className="text-xs opacity-40 shrink-0">✕</span>
        </div>
      ))}
    </div>
  );
}

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
  const [rightTab,   setRightTab]   = useState('signals');
  const [mobileTab,  setMobileTab]  = useState('chart');
  const [soundOn,    setSoundOn]    = useState(true);
  const [toasts,     setToasts]     = useState([]);
  const [nextRefresh, setNextRefresh] = useState(null); // secondes avant prochain refresh
  const [newAlertCount, setNewAlertCount] = useState(0); // badge clignotant

  const prevPriceRef     = useRef(null);
  const prevProposalsRef = useRef([]); // IDs des proposals précédentes
  const refreshTimerRef  = useRef(null);
  const countdownRef     = useRef(null);

  // ── Détecte les nouvelles alertes et notifie ──────────────────────────────
  const checkNewProposals = useCallback((newProps) => {
    const prevIds = new Set(prevProposalsRef.current.map(p => p.id));
    const added   = newProps.filter(p => !prevIds.has(p.id));

    if (added.length > 0) {
      // Son
      if (soundOn) playAlertSound();

      // Toasts
      const newToasts = added.map(p => ({
        id:          `toast-${p.id}-${Date.now()}`,
        direction:   p.direction,
        setup:       p.setup,
        entry:       p.entry,
        sl:          p.sl,
        tp:          p.tp,
        rr:          p.rr,
        firstReason: p.reasons?.[0]?.detail?.slice(0, 80) || ''
      }));
      setToasts(prev => [...prev, ...newToasts]);

      // Badge onglet alertes
      setNewAlertCount(n => n + added.length);

      // Auto-dismiss toasts après 8 secondes
      newToasts.forEach(t => {
        setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 8000);
      });
    }

    prevProposalsRef.current = newProps;
  }, [soundOn]);

  const dismissToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // ── Countdown jusqu'au prochain refresh ──────────────────────────────────
  const startCountdown = useCallback((seconds) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setNextRefresh(seconds);
    let remaining = seconds;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setNextRefresh(remaining);
      if (remaining <= 0) clearInterval(countdownRef.current);
    }, 1000);
  }, []);

  // ── Fetch candles ─────────────────────────────────────────────────────────
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
      const newProps = generateTradeProposals(formatted, analysis);
      checkNewProposals(newProps);
      setProposals(newProps);
      setLastUpdate(new Date());

      if (formatted.length > 0) {
        const latest = formatted[formatted.length - 1].close;
        if (prevPriceRef.current !== null)
          setPriceDir(latest > prevPriceRef.current ? 'up' : latest < prevPriceRef.current ? 'down' : null);
        prevPriceRef.current = latest;
        setLivePrice(latest);
      }

      // Relance le countdown
      const interval = REFRESH_BY_TF[tf] || 30_000;
      startCountdown(Math.round(interval / 1000));

    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, [timeframe, checkNewProposals, startCountdown]);

  // ── Fetch live price ──────────────────────────────────────────────────────
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

  // Initial load
  useEffect(() => { fetchCandles(timeframe); }, []); // eslint-disable-line

  // Auto-refresh adapté au timeframe
  useEffect(() => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    const interval = REFRESH_BY_TF[timeframe] || 30_000;
    refreshTimerRef.current = setInterval(() => fetchCandles(timeframe), interval);
    return () => {
      clearInterval(refreshTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [timeframe, fetchCandles]);

  // Prix toutes les 5s
  useEffect(() => {
    const id = setInterval(fetchPrice, 5000);
    return () => clearInterval(id);
  }, [fetchPrice]);

  const handleTimeframeChange = (tf) => {
    setTimeframe(tf);
    fetchCandles(tf);
  };

  // Reset badge quand on ouvre l'onglet alertes
  const handleMobileTab = (id) => {
    setMobileTab(id);
    if (id === 'alertes') setNewAlertCount(0);
  };
  const handleRightTab = (id) => {
    setRightTab(id);
    if (id === 'alertes') setNewAlertCount(0);
  };

  const priceColor =
    priceDir === 'up'   ? 'text-emerald-400' :
    priceDir === 'down' ? 'text-red-400'     : 'text-white';

  const refreshInterval = REFRESH_BY_TF[timeframe] / 1000;

  // ── Chart content ─────────────────────────────────────────────────────────
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

  // ── Timeframe bar ─────────────────────────────────────────────────────────
  const timeframeBar = (
    <div className="flex items-center bg-dark-700 rounded p-0.5 gap-0.5">
      {TIMEFRAMES.map(tf => (
        <button key={tf.value} onClick={() => handleTimeframeChange(tf.value)}
          className={`px-2 py-1 rounded text-xs font-semibold transition-all ${
            timeframe === tf.value
              ? 'bg-yellow-500 text-black shadow'
              : 'text-gray-400 hover:text-gray-200 hover:bg-dark-600'
          }`}>
          {tf.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-dark-900 overflow-hidden">

      {/* Toast notifications */}
      <AlertToast toasts={toasts} onDismiss={dismissToast} />

      {/* ══ HEADER ══ */}
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

          {/* Countdown + refresh */}
          <div className="flex items-center gap-1.5">
            {nextRefresh !== null && nextRefresh > 0 && (
              <span className="hidden sm:flex items-center gap-1 text-xs text-gray-600 font-mono">
                <span className={nextRefresh <= 5 ? 'text-yellow-500' : 'text-gray-600'}>
                  {nextRefresh}s
                </span>
              </span>
            )}
            <button onClick={() => fetchCandles(timeframe)} disabled={loading}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-dark-700 hover:bg-dark-600 text-gray-300 hover:text-white rounded text-xs font-medium transition-all disabled:opacity-50">
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">{loading ? '…' : 'Refresh'}</span>
            </button>
          </div>

          {/* Son on/off */}
          <button onClick={() => setSoundOn(s => !s)}
            className="p-1.5 rounded bg-dark-700 hover:bg-dark-600 transition-all"
            title={soundOn ? 'Désactiver le son' : 'Activer le son'}>
            {soundOn
              ? <Volume2  size={13} className="text-yellow-400" />
              : <VolumeX  size={13} className="text-gray-600"   />
            }
          </button>

          {/* Connexion */}
          <div className="flex items-center gap-1 text-xs text-gray-500">
            {error
              ? <WifiOff size={12} className="text-red-400" />
              : <Wifi    size={12} className="text-emerald-400" />
            }
            {lastUpdate && (
              <span className="hidden md:inline">{lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </header>

      {/* Refresh info bar — scalping indicator */}
      <div className="flex items-center gap-3 px-3 py-1 bg-dark-800/70 border-b border-dark-600/50 shrink-0 text-xs">
        <SessionsLegend inline />
        <div className="flex-1" />
        <span className="text-gray-600">
          Auto-refresh :
          <span className="text-yellow-500 font-semibold ml-1">{refreshInterval}s</span>
        </span>
        <div className="flex items-center gap-1">
          <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-yellow-400 animate-pulse' : 'bg-emerald-400'}`} />
          <span className="text-gray-600">{loading ? 'Mise à jour…' : 'En direct'}</span>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-950/50 border-b border-red-800/50 text-red-400 text-xs shrink-0">
          <AlertTriangle size={12} />
          <span className="flex-1 truncate">{error}</span>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-400 shrink-0">✕</button>
        </div>
      )}

      {/* ══ MOBILE LAYOUT ══ */}
      <div className="flex md:hidden flex-1 flex-col overflow-hidden">

        {mobileTab === 'chart' && (
          <div className="flex items-center justify-center py-1.5 px-3 bg-dark-800 border-b border-dark-600 shrink-0">
            {timeframeBar}
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chart'   && chartContent}
          {mobileTab === 'alertes' && <div className="h-full overflow-hidden"><TradeProposals proposals={proposals} /></div>}
          {mobileTab === 'revue'   && <DailyReview candles={candles} smcData={smcData} livePrice={livePrice} />}
          {mobileTab === 'journal' && <div className="h-full overflow-hidden"><Journal /></div>}
        </div>

        {/* Bottom nav */}
        <nav className="flex shrink-0 bg-[#0d0d14] border-t border-dark-600" style={{ height: '64px' }}>
          {MOBILE_TABS.map(({ id, label, Icon }) => {
            const active = mobileTab === id;
            const badge  = id === 'alertes' ? newAlertCount : 0;
            return (
              <button key={id} onClick={() => handleMobileTab(id)}
                className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-all relative ${
                  active ? 'text-yellow-400' : 'text-gray-600 hover:text-gray-400'
                }`}>
                {active && (
                  <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-yellow-400 rounded-full" />
                )}
                <div className="relative">
                  <Icon size={20} className={active ? 'text-yellow-400' : 'text-gray-600'}
                    strokeWidth={active ? 2.5 : 1.8} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 text-xs font-bold px-1 rounded-full leading-none py-0.5 bg-yellow-500 text-black animate-pulse">
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

      {/* ══ DESKTOP LAYOUT ══ */}
      <div className="hidden md:flex flex-1 overflow-hidden">

        <div className="flex-1 overflow-hidden">{chartContent}</div>

        {/* Right panel */}
        <div className="w-72 shrink-0 flex flex-col overflow-hidden border-l border-dark-600">
          <div className="flex shrink-0 bg-dark-800 border-b border-dark-600">

            <button onClick={() => handleRightTab('signals')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${
                rightTab === 'signals' ? 'border-blue-500 text-blue-400 bg-dark-700/50' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <Activity size={11} /> Signaux
              {smcData.fvgs && (
                <span className="ml-0.5 bg-dark-600 text-gray-400 text-xs px-1.5 rounded-full">
                  {(smcData.fvgs?.length || 0) + (smcData.orderBlocks?.length || 0)}
                </span>
              )}
            </button>

            <button onClick={() => handleRightTab('alertes')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${
                rightTab === 'alertes' ? 'border-yellow-500 text-yellow-400 bg-dark-700/50' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <Bell size={11} /> Alertes
              {newAlertCount > 0 && rightTab !== 'alertes' && (
                <span className="ml-0.5 bg-yellow-500 text-black text-xs px-1.5 rounded-full font-bold animate-pulse">
                  {newAlertCount}
                </span>
              )}
              {proposals.length > 0 && newAlertCount === 0 && (
                <span className="ml-0.5 bg-yellow-900/60 text-yellow-400 text-xs px-1.5 rounded-full">
                  {proposals.length}
                </span>
              )}
            </button>

            <button onClick={() => handleRightTab('revue')}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold transition-all border-b-2 ${
                rightTab === 'revue' ? 'border-yellow-500 text-yellow-400 bg-dark-700/50' : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}>
              <FileText size={11} /> Revue
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {rightTab === 'signals' && <SignalsPanel   smcData={smcData}     />}
            {rightTab === 'alertes' && <TradeProposals proposals={proposals} />}
            {rightTab === 'revue'   && <DailyReview candles={candles} smcData={smcData} livePrice={livePrice} />}
          </div>
        </div>
      </div>

      {/* Journal desktop */}
      <div className="hidden md:block shrink-0">
        <Journal />
      </div>
    </div>
  );
}
