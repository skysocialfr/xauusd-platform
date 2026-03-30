import { TrendingUp, TrendingDown, Minus, AlertCircle, Layers, Activity } from 'lucide-react';
import { formatPrice } from '../utils/smc';

function Badge({ children, color }) {
  const colors = {
    bullish: 'bg-emerald-900/40 text-emerald-400 border border-emerald-700/30',
    bearish: 'bg-red-900/40 text-red-400 border border-red-700/30',
    bsl:     'bg-orange-900/40 text-orange-400 border border-orange-700/30',
    ssl:     'bg-purple-900/40 text-purple-400 border border-purple-700/30',
    bos:     'bg-green-900/40 text-green-400 border border-green-700/30',
    choch:   'bg-purple-900/40 text-purple-400 border border-purple-700/30',
    neutral: 'bg-gray-800/40 text-gray-400 border border-gray-700/30'
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${colors[color] || colors.neutral}`}>
      {children}
    </span>
  );
}

function SectionHeader({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-1.5 text-gray-300 font-semibold text-sm">
        <Icon size={14} className="text-blue-400" />
        {title}
      </div>
      {count !== undefined && (
        <span className="text-xs text-gray-500 bg-dark-700 px-2 py-0.5 rounded-full">{count}</span>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <p className="text-gray-600 text-xs italic text-center py-2">{text}</p>
  );
}

// ── FVG Panel ──────────────────────────────────────────────────────────────
function FVGSection({ fvgs }) {
  const active = fvgs.filter(f => !f.filled).slice(-8).reverse();
  return (
    <div className="mb-4">
      <SectionHeader icon={Layers} title="Fair Value Gaps" count={active.length} />
      {active.length === 0 ? (
        <EmptyState text="No active FVGs detected" />
      ) : (
        <div className="space-y-1">
          {active.map((fvg, i) => (
            <div key={i} className="flex items-center justify-between bg-dark-700/50 rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {fvg.type === 'bullish'
                  ? <TrendingUp size={12} className="text-emerald-400" />
                  : <TrendingDown size={12} className="text-red-400" />
                }
                <Badge color={fvg.type}>{fvg.type.toUpperCase()}</Badge>
              </div>
              <div className="text-right">
                <div className="text-gray-300">{formatPrice(fvg.top)}</div>
                <div className="text-gray-500">{formatPrice(fvg.bottom)}</div>
              </div>
              <div className="text-gray-500 text-right">
                <div className="text-yellow-500/80">{formatPrice(fvg.size)} pts</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Order Blocks Panel ─────────────────────────────────────────────────────
function OBSection({ orderBlocks }) {
  const active = orderBlocks.filter(ob => !ob.mitigated).slice(-8).reverse();
  return (
    <div className="mb-4">
      <SectionHeader icon={AlertCircle} title="Order Blocks" count={active.length} />
      {active.length === 0 ? (
        <EmptyState text="No active order blocks" />
      ) : (
        <div className="space-y-1">
          {active.map((ob, i) => (
            <div key={i} className="flex items-center justify-between bg-dark-700/50 rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {ob.type === 'bullish'
                  ? <TrendingUp size={12} className="text-emerald-400" />
                  : <TrendingDown size={12} className="text-red-400" />
                }
                <Badge color={ob.type}>{ob.type === 'bullish' ? 'Demand' : 'Supply'}</Badge>
              </div>
              <div className="text-right">
                <div className="text-gray-300">{formatPrice(ob.high)}</div>
                <div className="text-gray-500">{formatPrice(ob.low)}</div>
              </div>
              <div className="text-gray-500 text-xs">
                {formatPrice(ob.high - ob.low)} pts
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── BOS / CHoCH Panel ──────────────────────────────────────────────────────
function BOSSection({ bosChoch }) {
  const recent = [...bosChoch].reverse().slice(0, 8);
  return (
    <div className="mb-4">
      <SectionHeader icon={Activity} title="BOS / CHoCH" count={recent.length} />
      {recent.length === 0 ? (
        <EmptyState text="No structure breaks detected" />
      ) : (
        <div className="space-y-1">
          {recent.map((sig, i) => (
            <div key={i} className="flex items-center justify-between bg-dark-700/50 rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {sig.direction === 'bullish'
                  ? <TrendingUp size={12} className="text-emerald-400" />
                  : <TrendingDown size={12} className="text-red-400" />
                }
                <Badge color={sig.type === 'BOS' ? (sig.direction === 'bullish' ? 'bos' : 'bearish') : 'choch'}>
                  {sig.type}
                </Badge>
                <span className="text-gray-400 capitalize">{sig.direction}</span>
              </div>
              <div className="text-gray-300">{formatPrice(sig.level)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Liquidity Panel ────────────────────────────────────────────────────────
function LiquiditySection({ liquidity }) {
  const bsl = liquidity.filter(l => l.type === 'BSL').slice(-5).reverse();
  const ssl = liquidity.filter(l => l.type === 'SSL').slice(-5).reverse();

  return (
    <div className="mb-4">
      <SectionHeader icon={Minus} title="Liquidity Levels" count={liquidity.length} />
      {liquidity.length === 0 ? (
        <EmptyState text="No liquidity levels detected" />
      ) : (
        <div className="space-y-1">
          {bsl.map((l, i) => (
            <div key={`bsl-${i}`} className="flex items-center justify-between bg-dark-700/50 rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <Badge color="bsl">BSL</Badge>
                {l.label && <span className="text-gray-500">{l.label}</span>}
              </div>
              <div className="text-orange-400">{formatPrice(l.level)}</div>
              <div className="text-gray-500">{l.touches}x touched</div>
            </div>
          ))}
          {ssl.map((l, i) => (
            <div key={`ssl-${i}`} className="flex items-center justify-between bg-dark-700/50 rounded px-2 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                <Badge color="ssl">SSL</Badge>
                {l.label && <span className="text-gray-500">{l.label}</span>}
              </div>
              <div className="text-purple-400">{formatPrice(l.level)}</div>
              <div className="text-gray-500">{l.touches}x touched</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function SignalsPanel({ smcData }) {
  const { fvgs = [], orderBlocks = [], bosChoch = [], liquidity = [] } = smcData || {};

  const totalSignals =
    fvgs.filter(f => !f.filled).length +
    orderBlocks.filter(ob => !ob.mitigated).length +
    bosChoch.length +
    liquidity.length;

  return (
    <div className="h-full flex flex-col bg-dark-800 border-l border-dark-600">
      {/* Panel header */}
      <div className="px-3 py-2 border-b border-dark-600 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white tracking-wide">SMC Signals</h2>
        <span className="text-xs text-gray-500">
          {totalSignals} active
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3">
        <FVGSection       fvgs={fvgs} />
        <OBSection        orderBlocks={orderBlocks} />
        <BOSSection       bosChoch={bosChoch} />
        <LiquiditySection liquidity={liquidity} />
      </div>
    </div>
  );
}
