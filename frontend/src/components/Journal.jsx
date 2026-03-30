import { useState, useEffect } from 'react';
import { PlusCircle, Trash2, TrendingUp, TrendingDown, BookOpen } from 'lucide-react';

const STORAGE_KEY = 'xauusd_trade_journal';

const SETUPS = ['FVG', 'Order Block', 'Liquidity', 'BOS/CHoCH', 'Session', 'Other'];

const defaultForm = {
  date:      new Date().toISOString().slice(0, 16),
  direction: 'Buy',
  entry:     '',
  sl:        '',
  tp:        '',
  setup:     'FVG',
  notes:     '',
  result:    'Open'
};

function calcRR(entry, sl, tp, direction) {
  const e = parseFloat(entry);
  const s = parseFloat(sl);
  const t = parseFloat(tp);
  if (isNaN(e) || isNaN(s) || isNaN(t) || s === e) return null;

  const risk   = Math.abs(e - s);
  const reward = Math.abs(t - e);
  const rr     = reward / risk;

  // Check direction validity
  if (direction === 'Buy') {
    if (s >= e || t <= e) return null;
  } else {
    if (s <= e || t >= e) return null;
  }

  return rr.toFixed(2);
}

function calcPips(entry, result, direction, sl, tp) {
  if (result === 'Open') return null;
  const e = parseFloat(entry);
  const s = parseFloat(sl);
  const t = parseFloat(tp);
  if (isNaN(e)) return null;

  if (result === 'Win') {
    return direction === 'Buy' ? (t - e).toFixed(2) : (e - t).toFixed(2);
  }
  if (result === 'Loss') {
    return direction === 'Buy' ? (s - e).toFixed(2) : (e - s).toFixed(2);
  }
  return null;
}

export default function Journal() {
  const [trades, setTrades]     = useState([]);
  const [form,   setForm]       = useState(defaultForm);
  const [showForm, setShowForm] = useState(false);

  // Load from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setTrades(JSON.parse(saved));
    } catch (_) {}
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
  }, [trades]);

  const rr = calcRR(form.entry, form.sl, form.tp, form.direction);

  const handleSubmit = (e) => {
    e.preventDefault();
    const newTrade = {
      id:        Date.now(),
      ...form,
      entry:     parseFloat(form.entry),
      sl:        parseFloat(form.sl),
      tp:        parseFloat(form.tp),
      rr:        rr,
      createdAt: new Date().toISOString()
    };
    setTrades(prev => [newTrade, ...prev]);
    setForm(defaultForm);
    setShowForm(false);
  };

  const deleteTrade = (id) => {
    setTrades(prev => prev.filter(t => t.id !== id));
  };

  const updateResult = (id, result) => {
    setTrades(prev => prev.map(t => t.id === id ? { ...t, result } : t));
  };

  // Stats
  const closed     = trades.filter(t => t.result !== 'Open');
  const wins       = trades.filter(t => t.result === 'Win');
  const winRate    = closed.length > 0 ? ((wins.length / closed.length) * 100).toFixed(1) : '0.0';
  const avgRR      = closed.length > 0
    ? (closed.reduce((sum, t) => sum + (parseFloat(t.rr) || 0), 0) / closed.length).toFixed(2)
    : '0.00';
  const totalPips  = trades.reduce((sum, t) => {
    const p = calcPips(t.entry, t.result, t.direction, t.sl, t.tp);
    return sum + (p ? parseFloat(p) : 0);
  }, 0).toFixed(2);

  return (
    <div className="bg-dark-800 border-t border-dark-600">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-dark-600">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-blue-400" />
          <h2 className="text-sm font-bold text-white tracking-wide">Trade Journal</h2>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs">
          <Stat label="Trades"   value={trades.length} />
          <Stat label="Win Rate" value={`${winRate}%`}  color={parseFloat(winRate) >= 50 ? 'text-emerald-400' : 'text-red-400'} />
          <Stat label="Avg RR"   value={`${avgRR}R`}    color="text-blue-400" />
          <Stat label="Total P/L" value={`${totalPips > 0 ? '+' : ''}${totalPips}`}
            color={parseFloat(totalPips) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          <button
            onClick={() => setShowForm(f => !f)}
            className="flex items-center gap-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold transition-colors"
          >
            <PlusCircle size={12} />
            {showForm ? 'Cancel' : 'Add Trade'}
          </button>
        </div>
      </div>

      {/* Add Trade Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="px-4 py-3 border-b border-dark-600 bg-dark-700/50">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 items-end">
            <FormField label="Date & Time">
              <input type="datetime-local" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="input-field" required />
            </FormField>

            <FormField label="Direction">
              <select value={form.direction}
                onChange={e => setForm(f => ({ ...f, direction: e.target.value }))}
                className="input-field">
                <option>Buy</option>
                <option>Sell</option>
              </select>
            </FormField>

            <FormField label="Entry">
              <input type="number" step="0.01" value={form.entry} placeholder="2340.00"
                onChange={e => setForm(f => ({ ...f, entry: e.target.value }))}
                className="input-field" required />
            </FormField>

            <FormField label="Stop Loss">
              <input type="number" step="0.01" value={form.sl} placeholder="2335.00"
                onChange={e => setForm(f => ({ ...f, sl: e.target.value }))}
                className="input-field" required />
            </FormField>

            <FormField label={`Take Profit${rr ? ` (${rr}R)` : ''}`}>
              <input type="number" step="0.01" value={form.tp} placeholder="2350.00"
                onChange={e => setForm(f => ({ ...f, tp: e.target.value }))}
                className="input-field" required />
            </FormField>

            <FormField label="Setup">
              <select value={form.setup}
                onChange={e => setForm(f => ({ ...f, setup: e.target.value }))}
                className="input-field">
                {SETUPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </FormField>

            <FormField label="Notes">
              <input type="text" value={form.notes} placeholder="Optional notes..."
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input-field" />
            </FormField>

            <FormField label=" ">
              <button type="submit"
                className="w-full px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors">
                Add
              </button>
            </FormField>
          </div>
        </form>
      )}

      {/* Trades table */}
      <div className="overflow-x-auto max-h-48">
        {trades.length === 0 ? (
          <div className="text-center text-gray-600 text-xs py-6 italic">
            No trades recorded yet. Click "Add Trade" to get started.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-dark-800">
              <tr className="border-b border-dark-600 text-gray-500 uppercase tracking-wider">
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Dir</th>
                <th className="px-3 py-2 text-right">Entry</th>
                <th className="px-3 py-2 text-right">SL</th>
                <th className="px-3 py-2 text-right">TP</th>
                <th className="px-3 py-2 text-right">RR</th>
                <th className="px-3 py-2 text-right">P/L</th>
                <th className="px-3 py-2 text-left">Setup</th>
                <th className="px-3 py-2 text-left">Notes</th>
                <th className="px-3 py-2 text-center">Result</th>
                <th className="px-3 py-2 text-center">Del</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(trade => {
                const pips = calcPips(trade.entry, trade.result, trade.direction, trade.sl, trade.tp);
                return (
                  <tr key={trade.id} className="border-b border-dark-700/50 hover:bg-dark-700/30 transition-colors">
                    <td className="px-3 py-2 text-gray-400">
                      {new Date(trade.date).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td className="px-3 py-2">
                      {trade.direction === 'Buy'
                        ? <span className="flex items-center gap-1 text-emerald-400"><TrendingUp size={10} /> Buy</span>
                        : <span className="flex items-center gap-1 text-red-400"><TrendingDown size={10} /> Sell</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-right text-gray-300">{trade.entry?.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-red-400">{trade.sl?.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-emerald-400">{trade.tp?.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right text-blue-400">{trade.rr ? `${trade.rr}R` : '-'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      pips === null ? 'text-gray-500' :
                      parseFloat(pips) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {pips !== null ? `${parseFloat(pips) > 0 ? '+' : ''}${pips}` : '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-400">{trade.setup}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{trade.notes || '-'}</td>
                    <td className="px-3 py-2 text-center">
                      <select
                        value={trade.result}
                        onChange={e => updateResult(trade.id, e.target.value)}
                        className={`text-xs rounded px-1 py-0.5 border-0 outline-none cursor-pointer ${
                          trade.result === 'Win'  ? 'bg-emerald-900/50 text-emerald-400' :
                          trade.result === 'Loss' ? 'bg-red-900/50 text-red-400' :
                          'bg-dark-600 text-gray-400'
                        }`}
                      >
                        <option value="Open">Open</option>
                        <option value="Win">Win</option>
                        <option value="Loss">Loss</option>
                        <option value="BE">BE</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
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
    </div>
  );
}

function Stat({ label, value, color = 'text-white' }) {
  return (
    <div className="text-center">
      <div className={`font-bold ${color}`}>{value}</div>
      <div className="text-gray-600">{label}</div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-gray-500 text-xs">{label}</label>
      {children}
    </div>
  );
}
