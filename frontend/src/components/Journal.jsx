import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, TrendingUp, TrendingDown, BookOpen,
  ChevronDown, ChevronUp, X, Trophy, AlertCircle
} from 'lucide-react';

const STORAGE_KEY    = 'xauusd_journal_v2';
const LEGACY_KEY     = 'xauusd_trade_journal';

const SETUPS   = ['FVG', 'Order Block', 'Liquidité', 'BOS/CHoCH', 'Session', 'Autre'];
const EMOTIONS = ['Confiant', 'Neutre', 'Hésitant', 'FOMO'];
const RESULTS  = ['Open', 'Win', 'Loss', 'BE'];

const defaultForm = {
  date:      new Date().toISOString().slice(0, 16),
  direction: 'BUY',
  entry:     '',
  sl:        '',
  tp:        '',
  setup:     'FVG',
  emotion:   'Neutre',
  notes:     '',
  result:    'Open',
};

// ── Helpers ───────────────────────────────────────────────────────────────
function calcRR(entry, sl, tp, direction) {
  const e = parseFloat(entry), s = parseFloat(sl), t = parseFloat(tp);
  if (isNaN(e) || isNaN(s) || isNaN(t) || s === e) return null;
  if (direction === 'BUY'  && (s >= e || t <= e)) return null;
  if (direction === 'SELL' && (s <= e || t >= e)) return null;
  return (Math.abs(t - e) / Math.abs(e - s)).toFixed(2);
}

function calcPnl(trade) {
  if (trade.result === 'Open') return null;
  const e = parseFloat(trade.entry);
  const s = parseFloat(trade.sl);
  const t = parseFloat(trade.tp);
  if (isNaN(e)) return null;
  if (trade.result === 'Win')  return trade.direction === 'BUY' ? (t - e) : (e - t);
  if (trade.result === 'Loss') return trade.direction === 'BUY' ? (s - e) : (e - s);
  if (trade.result === 'BE')   return 0;
  return null;
}

function migrateLegacy() {
  try {
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return [];
    const trades = JSON.parse(legacy);
    // Normalise direction Buy→BUY, Sell→SELL
    return trades.map(t => ({
      ...t,
      direction: t.direction === 'Buy' ? 'BUY' : t.direction === 'Sell' ? 'SELL' : t.direction,
      emotion: t.emotion || 'Neutre',
    }));
  } catch (_) { return []; }
}

// ── Stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, color = 'text-white', sub }) {
  return (
    <div className="bg-dark-800 rounded-lg p-3 flex flex-col items-center justify-center text-center border border-dark-600">
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-600 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Trade card (mobile) ───────────────────────────────────────────────────
function TradeCard({ trade, onDelete, onUpdateResult }) {
  const [showNotes, setShowNotes] = useState(false);
  const pnl   = calcPnl(trade);
  const isBuy = trade.direction === 'BUY';

  const resultColors = {
    Win:  'bg-emerald-900/50 text-emerald-400 border-emerald-700/50',
    Loss: 'bg-red-900/50 text-red-400 border-red-700/50',
    BE:   'bg-blue-900/50 text-blue-400 border-blue-700/50',
    Open: 'bg-dark-600 text-gray-400 border-dark-500',
  };

  return (
    <div className={`rounded-lg border overflow-hidden mb-2 ${
      isBuy ? 'border-emerald-800/40' : 'border-red-800/40'
    }`}>
      {/* Header row */}
      <div className={`flex items-center justify-between px-3 py-2 ${
        isBuy ? 'bg-emerald-950/40' : 'bg-red-950/40'
      }`}>
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded text-white ${
            isBuy ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {isBuy ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {trade.direction}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(trade.date).toLocaleString('fr-FR', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            })}
          </span>
        </div>
        <button onClick={() => onDelete(trade.id)}
          className="text-gray-600 hover:text-red-400 transition-colors p-1">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Price row */}
      <div className="grid grid-cols-3 gap-1 px-3 py-2 bg-dark-800/60 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Entrée</div>
          <div className={`text-xs font-bold font-mono ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
            {parseFloat(trade.entry).toFixed(2)}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">SL</div>
          <div className="text-xs font-bold font-mono text-red-400">{parseFloat(trade.sl).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">TP</div>
          <div className="text-xs font-bold font-mono text-emerald-400">{parseFloat(trade.tp).toFixed(2)}</div>
        </div>
      </div>

      {/* Stats + Result row */}
      <div className="flex items-center justify-between px-3 py-2 bg-dark-700/40">
        <div className="flex items-center gap-3 text-xs">
          {trade.rr && (
            <span className="text-blue-400 font-semibold font-mono">{trade.rr}R</span>
          )}
          {pnl !== null && (
            <span className={`font-bold font-mono ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnl > 0 ? '+' : ''}{pnl.toFixed(2)} pts
            </span>
          )}
          <span className="text-gray-500">{trade.setup}</span>
        </div>
        <select
          value={trade.result}
          onChange={e => onUpdateResult(trade.id, e.target.value)}
          className={`text-xs rounded px-1.5 py-0.5 border outline-none cursor-pointer bg-transparent ${resultColors[trade.result] || resultColors.Open}`}
        >
          {RESULTS.map(r => <option key={r} value={r} className="bg-dark-800 text-gray-300">{r}</option>)}
        </select>
      </div>

      {/* Notes toggle */}
      {trade.notes && (
        <div className="border-t border-dark-600/40">
          <button
            onClick={() => setShowNotes(v => !v)}
            className="flex items-center gap-1 w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            {showNotes ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            Notes
          </button>
          {showNotes && (
            <div className="px-3 pb-2 text-xs text-gray-400 leading-relaxed">{trade.notes}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add Trade Modal ────────────────────────────────────────────────────────
function AddTradeModal({ onClose, onSave }) {
  const [form, setForm] = useState(defaultForm);
  const rr = calcRR(form.entry, form.sl, form.tp, form.direction);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      id:        Date.now(),
      ...form,
      entry:     parseFloat(form.entry),
      sl:        parseFloat(form.sl),
      tp:        parseFloat(form.tp),
      rr,
      createdAt: new Date().toISOString(),
    });
    onClose();
  };

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-dark-800 w-full sm:max-w-lg sm:rounded-xl border border-dark-600 flex flex-col max-h-[90vh] overflow-hidden">

        {/* Modal header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-dark-600 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-yellow-400" />
            <h3 className="text-sm font-bold text-white">Nouveau Trade</h3>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white p-1">
            <X size={16} />
          </button>
        </div>

        {/* Modal body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">

          {/* Date */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date & Heure</label>
            <input type="datetime-local" value={form.date} onChange={f('date')} required
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/60 transition-colors" />
          </div>

          {/* Direction */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Direction</label>
            <div className="grid grid-cols-2 gap-2">
              {['BUY', 'SELL'].map(dir => (
                <button key={dir} type="button"
                  onClick={() => setForm(prev => ({ ...prev, direction: dir }))}
                  className={`py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border-2 ${
                    form.direction === dir
                      ? dir === 'BUY'
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-red-600 border-red-500 text-white'
                      : 'bg-dark-700 border-dark-500 text-gray-400 hover:border-dark-400'
                  }`}>
                  {dir === 'BUY' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  {dir}
                </button>
              ))}
            </div>
          </div>

          {/* Price inputs */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Entrée', field: 'entry', placeholder: '3245.00' },
              { label: 'Stop Loss', field: 'sl', placeholder: '3240.00' },
              { label: 'Take Profit', field: 'tp', placeholder: '3255.00' },
            ].map(({ label, field, placeholder }) => (
              <div key={field}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <input type="number" step="0.01" value={form[field]} placeholder={placeholder}
                  onChange={f(field)} required
                  className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-yellow-500/60 transition-colors font-mono" />
              </div>
            ))}
          </div>

          {/* Auto RR */}
          {rr && (
            <div className="flex items-center gap-2 px-3 py-2 bg-dark-700/60 rounded-lg border border-blue-800/40">
              <span className="text-xs text-gray-500">Risk/Reward calculé :</span>
              <span className={`text-sm font-bold font-mono ${
                parseFloat(rr) >= 2 ? 'text-emerald-400' : parseFloat(rr) >= 1 ? 'text-yellow-400' : 'text-red-400'
              }`}>{rr}R</span>
            </div>
          )}

          {/* Setup + Emotion */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Setup</label>
              <select value={form.setup} onChange={f('setup')}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-yellow-500/60 transition-colors">
                {SETUPS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Emotion</label>
              <select value={form.emotion} onChange={f('emotion')}
                className="w-full bg-dark-700 border border-dark-500 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-yellow-500/60 transition-colors">
                {EMOTIONS.map(em => <option key={em} value={em}>{em}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={f('notes')} rows={3}
              placeholder="Contexte du trade, confluences observées..."
              className="w-full bg-dark-700 border border-dark-500 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-yellow-500/60 transition-colors resize-none leading-relaxed" />
          </div>
        </form>

        {/* Modal footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-dark-600 shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 rounded-lg border border-dark-500 text-gray-400 text-sm font-semibold hover:border-dark-400 hover:text-gray-300 transition-colors">
            Annuler
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              const fakeEvt = { preventDefault: () => {} };
              // Re-validate
              const entry = parseFloat(form.entry);
              const sl    = parseFloat(form.sl);
              const tp    = parseFloat(form.tp);
              if (isNaN(entry) || isNaN(sl) || isNaN(tp)) return;
              onSave({
                id:        Date.now(),
                ...form,
                entry, sl, tp,
                rr,
                createdAt: new Date().toISOString(),
              });
              onClose();
            }}
            className="flex-1 py-2.5 rounded-lg bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm transition-colors">
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Performance panel ─────────────────────────────────────────────────────
function PerformancePanel({ trades }) {
  const stats = useMemo(() => {
    if (trades.length === 0) return null;

    // Streaks
    let winStreak = 0, lossStreak = 0, curWin = 0, curLoss = 0;
    const closed = trades.filter(t => t.result !== 'Open');
    closed.forEach(t => {
      if (t.result === 'Win') { curWin++; curLoss = 0; lossStreak = Math.max(lossStreak, curWin); }
      else if (t.result === 'Loss') { curLoss++; curWin = 0; lossStreak = Math.max(lossStreak, curLoss); }
    });
    winStreak = curWin;

    const pnls = trades.map(t => ({ ...t, pnl: calcPnl(t) })).filter(t => t.pnl !== null);
    const best  = pnls.length > 0 ? pnls.reduce((a, b) => a.pnl > b.pnl ? a : b) : null;
    const worst = pnls.length > 0 ? pnls.reduce((a, b) => a.pnl < b.pnl ? a : b) : null;

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = trades.filter(t => new Date(t.date) >= weekStart).length;

    return { winStreak, lossStreak: curLoss, best, worst, thisWeek };
  }, [trades]);

  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 gap-2 mt-3">
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-600">
        <div className="flex items-center gap-1.5 mb-1">
          <Trophy size={12} className="text-yellow-400" />
          <span className="text-xs text-gray-500">Série gagnante</span>
        </div>
        <div className="text-lg font-bold text-emerald-400">{stats.winStreak}</div>
      </div>
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-600">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertCircle size={12} className="text-red-400" />
          <span className="text-xs text-gray-500">Série perdante</span>
        </div>
        <div className="text-lg font-bold text-red-400">{stats.lossStreak}</div>
      </div>
      {stats.best && (
        <div className="bg-dark-800 rounded-lg p-3 border border-dark-600">
          <div className="text-xs text-gray-500 mb-1">Meilleur trade</div>
          <div className="text-sm font-bold text-emerald-400 font-mono">+{stats.best.pnl.toFixed(2)} pts</div>
          <div className="text-xs text-gray-600 truncate">{stats.best.setup}</div>
        </div>
      )}
      {stats.worst && (
        <div className="bg-dark-800 rounded-lg p-3 border border-dark-600">
          <div className="text-xs text-gray-500 mb-1">Pire trade</div>
          <div className="text-sm font-bold text-red-400 font-mono">{stats.worst.pnl.toFixed(2)} pts</div>
          <div className="text-xs text-gray-600 truncate">{stats.worst.setup}</div>
        </div>
      )}
      <div className="bg-dark-800 rounded-lg p-3 border border-dark-600 col-span-2">
        <div className="text-xs text-gray-500 mb-1">Trades cette semaine</div>
        <div className="text-lg font-bold text-blue-400">{stats.thisWeek}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function Journal() {
  const [trades,       setTrades]       = useState([]);
  const [showModal,    setShowModal]    = useState(false);
  const [showPerf,     setShowPerf]     = useState(false);
  const [filterResult, setFilterResult] = useState('Tous');

  // Load from localStorage (with migration)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setTrades(JSON.parse(saved));
      } else {
        const migrated = migrateLegacy();
        if (migrated.length > 0) {
          setTrades(migrated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  }, [trades]);

  const addTrade = (trade) => setTrades(prev => [trade, ...prev]);
  const deleteTrade = (id) => setTrades(prev => prev.filter(t => t.id !== id));
  const updateResult = (id, result) => setTrades(prev => prev.map(t => t.id === id ? { ...t, result } : t));

  // Stats
  const closed   = trades.filter(t => t.result !== 'Open');
  const wins     = trades.filter(t => t.result === 'Win');
  const winRate  = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : '0.0';
  const avgRR    = closed.length > 0
    ? (closed.reduce((s, t) => s + (parseFloat(t.rr) || 0), 0) / closed.length).toFixed(2)
    : '0.00';
  const totalPnl = trades.reduce((s, t) => { const p = calcPnl(t); return s + (p ?? 0); }, 0);

  // Filtered trades
  const visible = filterResult === 'Tous' ? trades : trades.filter(t => t.result === filterResult);

  return (
    <div className="relative h-full bg-dark-900 flex flex-col overflow-hidden">

      {/* ── Stats bar ── */}
      <div className="shrink-0 p-3 bg-dark-900 border-b border-dark-600">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen size={15} className="text-yellow-400" />
          <h2 className="text-sm font-bold text-white tracking-wide">Trade Journal</h2>
          <span className="ml-auto text-xs text-gray-600">XAU/USD</span>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <StatCard label="Trades" value={trades.length} />
          <StatCard
            label="Win Rate"
            value={`${winRate}%`}
            color={parseFloat(winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'}
          />
          <StatCard label="Avg RR" value={`${avgRR}R`} color="text-blue-400" />
          <StatCard
            label="Total P&L"
            value={`${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(1)}`}
            color={totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
            sub="pts"
          />
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 bg-dark-800 border-b border-dark-600">
        {['Tous', ...RESULTS].map(r => (
          <button key={r} onClick={() => setFilterResult(r)}
            className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
              filterResult === r
                ? r === 'Win'  ? 'bg-emerald-700 text-white' :
                  r === 'Loss' ? 'bg-red-700 text-white'    :
                  r === 'Open' ? 'bg-dark-500 text-white'   :
                  'bg-yellow-600 text-black'
                : 'text-gray-500 hover:text-gray-300'
            }`}>
            {r}
          </button>
        ))}

        <button onClick={() => setShowPerf(v => !v)}
          className="ml-auto flex items-center gap-1 text-xs text-gray-500 hover:text-yellow-400 transition-colors">
          <Trophy size={11} />
          <span>Stats</span>
          {showPerf ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {/* ── Performance panel (collapsible) ── */}
      {showPerf && (
        <div className="shrink-0 px-3 pb-3 bg-dark-800 border-b border-dark-600">
          <PerformancePanel trades={trades} />
        </div>
      )}

      {/* ── Trade list ── */}
      <div className="flex-1 overflow-y-auto px-3 pt-3 custom-scrollbar">

        {/* Desktop table */}
        <div className="hidden md:block">
          {visible.length === 0 ? (
            <div className="text-center text-gray-600 text-xs py-10 italic">
              Aucun trade enregistré. Appuyez sur + pour ajouter.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-dark-900">
                <tr className="border-b border-dark-600 text-gray-500 uppercase tracking-wider">
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Dir</th>
                  <th className="px-2 py-2 text-right">Entrée</th>
                  <th className="px-2 py-2 text-right">SL</th>
                  <th className="px-2 py-2 text-right">TP</th>
                  <th className="px-2 py-2 text-right">RR</th>
                  <th className="px-2 py-2 text-right">P&L</th>
                  <th className="px-2 py-2 text-left">Setup</th>
                  <th className="px-2 py-2 text-left">Emotion</th>
                  <th className="px-2 py-2 text-left">Notes</th>
                  <th className="px-2 py-2 text-center">Résultat</th>
                  <th className="px-2 py-2 text-center">Del</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(trade => {
                  const pnl   = calcPnl(trade);
                  const isBuy = trade.direction === 'BUY';
                  return (
                    <tr key={trade.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                      <td className="px-2 py-2 text-gray-400">
                        {new Date(trade.date).toLocaleString('fr-FR', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                      <td className="px-2 py-2">
                        {isBuy
                          ? <span className="flex items-center gap-1 text-emerald-400"><TrendingUp size={10} />BUY</span>
                          : <span className="flex items-center gap-1 text-red-400"><TrendingDown size={10} />SELL</span>
                        }
                      </td>
                      <td className="px-2 py-2 text-right text-gray-300 font-mono">{parseFloat(trade.entry).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-red-400 font-mono">{parseFloat(trade.sl).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-emerald-400 font-mono">{parseFloat(trade.tp).toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-blue-400 font-mono">{trade.rr ? `${trade.rr}R` : '–'}</td>
                      <td className={`px-2 py-2 text-right font-bold font-mono ${
                        pnl === null ? 'text-gray-500' : pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {pnl !== null ? `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}` : '–'}
                      </td>
                      <td className="px-2 py-2 text-gray-400">{trade.setup}</td>
                      <td className="px-2 py-2 text-gray-500">{trade.emotion || '–'}</td>
                      <td className="px-2 py-2 text-gray-500 max-w-[100px] truncate">{trade.notes || '–'}</td>
                      <td className="px-2 py-2 text-center">
                        <select value={trade.result} onChange={e => updateResult(trade.id, e.target.value)}
                          className={`text-xs rounded px-1.5 py-0.5 border outline-none cursor-pointer bg-transparent ${
                            trade.result === 'Win'  ? 'border-emerald-700 text-emerald-400' :
                            trade.result === 'Loss' ? 'border-red-700 text-red-400'         :
                            trade.result === 'BE'   ? 'border-blue-700 text-blue-400'       :
                            'border-dark-500 text-gray-400'
                          }`}>
                          {RESULTS.map(r => <option key={r} value={r} className="bg-dark-800">{r}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => deleteTrade(trade.id)}
                          className="text-gray-600 hover:text-red-400 transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden">
          {visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen size={36} className="text-gray-700 mb-3" />
              <div className="text-sm font-semibold text-gray-500">Aucun trade enregistré</div>
              <div className="text-xs text-gray-600 mt-1">Appuyez sur le bouton + pour ajouter votre premier trade.</div>
            </div>
          ) : (
            visible.map(trade => (
              <TradeCard
                key={trade.id}
                trade={trade}
                onDelete={deleteTrade}
                onUpdateResult={updateResult}
              />
            ))
          )}
          {/* Spacer for FAB */}
          <div className="h-20" />
        </div>
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-yellow-500 hover:bg-yellow-400 text-black shadow-2xl flex items-center justify-center transition-all active:scale-95 md:hidden"
        aria-label="Ajouter un trade"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>

      {/* Desktop add button */}
      <div className="hidden md:flex shrink-0 px-3 py-2 border-t border-dark-600 bg-dark-800">
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg text-sm font-bold transition-colors">
          <Plus size={15} />
          Nouveau Trade
        </button>
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <AddTradeModal onClose={() => setShowModal(false)} onSave={addTrade} />
      )}
    </div>
  );
}
