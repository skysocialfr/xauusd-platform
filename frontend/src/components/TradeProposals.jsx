import { useState } from 'react';
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp, Zap, Star } from 'lucide-react';

// ── Strength badge ────────────────────────────────────────────────────────
function StrengthBadge({ strength, score }) {
  const config = {
    Fort:    { bg: 'bg-emerald-900/60', text: 'text-emerald-300', border: 'border-emerald-700/50' },
    Modéré:  { bg: 'bg-yellow-900/60',  text: 'text-yellow-300',  border: 'border-yellow-700/50'  },
    Faible:  { bg: 'bg-gray-800',       text: 'text-gray-400',    border: 'border-gray-700/50'    },
  };
  const c = config[strength] || config.Faible;
  return (
    <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${c.bg} ${c.text} ${c.border}`}>
      <Zap size={10} />
      {strength}
      <span className="ml-0.5 opacity-60">({score}/5)</span>
    </span>
  );
}

// ── Score stars ───────────────────────────────────────────────────────────
function ScoreStars({ score }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={10}
          className={i <= score ? 'text-yellow-400 fill-yellow-400' : 'text-gray-700'}
        />
      ))}
    </div>
  );
}

// ── Single proposal card ──────────────────────────────────────────────────
function ProposalCard({ proposal }) {
  const [expanded, setExpanded] = useState(false);
  const isBuy = proposal.direction === 'BUY';

  const borderColor  = isBuy ? 'border-emerald-700/60' : 'border-red-700/60';
  const headerBg     = isBuy ? 'bg-emerald-950/40'     : 'bg-red-950/40';
  const directionBg  = isBuy ? 'bg-emerald-500'        : 'bg-red-500';
  const priceColor   = isBuy ? 'text-emerald-400'      : 'text-red-400';
  const Icon         = isBuy ? TrendingUp              : TrendingDown;

  // "SURVEILLER" badge: within 1% of the zone mid-price
  const zoneMid    = proposal.entry;
  const withinPct  = proposal.distPct !== undefined ? parseFloat(proposal.distPct) : null;
  const isSurveill = !proposal.isActive && withinPct !== null && withinPct <= 1.0;

  // First reason (always shown)
  const firstReason    = proposal.reasons?.[0];
  const remainingCount = proposal.reasons?.length > 1 ? proposal.reasons.length - 1 : 0;

  return (
    <div className={`rounded-lg border ${borderColor} overflow-hidden mb-2`}>

      {/* ── Card header ── */}
      <div className={`${headerBg} px-3 py-2`}>
        <div className="flex items-center justify-between mb-1.5">
          {/* Direction + Setup */}
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded text-white ${directionBg}`}>
              <Icon size={11} />
              {proposal.direction}
            </span>
            <span className="text-xs text-gray-400">{proposal.setup}</span>
          </div>
          <StrengthBadge strength={proposal.strength} score={proposal.score} />
        </div>

        {/* Status badges + score stars */}
        <div className="flex items-center justify-between">
          <ScoreStars score={proposal.score} />
          <div className="flex items-center gap-2">
            {proposal.isActive ? (
              <span className="flex items-center gap-1.5 text-sm font-extrabold text-yellow-200 bg-yellow-600/80 border-2 border-yellow-400/80 px-3 py-1 rounded-lg animate-pulse shadow-lg shadow-yellow-500/20">
                ⚡ EN ZONE
              </span>
            ) : isSurveill ? (
              <span className="flex items-center gap-1 text-xs font-bold text-orange-200 bg-orange-700/60 border border-orange-500/60 px-2.5 py-0.5 rounded-lg">
                👁 SURVEILLER
              </span>
            ) : (
              <span className="text-xs text-gray-500">
                à <span className="text-gray-300 font-mono">{proposal.distPts} pts</span>
                <span className="text-gray-600 ml-1">({proposal.distPct}%)</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Price levels ── */}
      <div className="px-3 py-2 bg-dark-800/60 grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Entrée</div>
          <div className={`text-sm font-bold font-mono ${priceColor}`}>{proposal.entry.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Stop Loss</div>
          <div className="text-sm font-bold font-mono text-red-400">{proposal.sl.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-0.5">Take Profit</div>
          <div className="text-sm font-bold font-mono text-emerald-400">{proposal.tp.toFixed(2)}</div>
        </div>
      </div>

      {/* ── First reason (always visible) ── */}
      {firstReason && (
        <div className="px-3 py-2 bg-dark-800/40 border-t border-dark-600/30">
          <div className="flex gap-2">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
              isBuy ? 'bg-emerald-900/80 text-emerald-300' : 'bg-red-900/80 text-red-300'
            }`}>1</div>
            <div>
              <div className="text-xs font-semibold text-gray-200 mb-0.5 flex items-center gap-1">
                <span>{firstReason.icon}</span>
                <span>{firstReason.title}</span>
              </div>
              <div className="text-xs text-gray-400 leading-relaxed">
                {firstReason.detail.length > 100
                  ? firstReason.detail.slice(0, 100) + '…'
                  : firstReason.detail
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── RR + expand toggle ── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-dark-700/50 cursor-pointer hover:bg-dark-600/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Risk/Reward</span>
          <span className={`text-sm font-bold font-mono ${
            parseFloat(proposal.rr) >= 2 ? 'text-emerald-400' :
            parseFloat(proposal.rr) >= 1 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {proposal.rr}R
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {remainingCount > 0 && (
            <span>{expanded ? 'Masquer' : `Voir analyse complète (+${remainingCount})`}</span>
          )}
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </div>
      </div>

      {/* ── Expanded: remaining reasons ── */}
      {expanded && (
        <div className="px-3 py-2 bg-dark-900/80 border-t border-dark-600/40 space-y-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
            Analyse complète
          </div>
          {proposal.reasons.map((reason, i) => (
            <div key={i} className="flex gap-2">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  isBuy ? 'bg-emerald-900/80 text-emerald-300' : 'bg-red-900/80 text-red-300'
                }`}>
                  {i + 1}
                </div>
                {i < proposal.reasons.length - 1 && (
                  <div className="w-px flex-1 bg-dark-600 mt-1" />
                )}
              </div>
              <div className="pb-2">
                <div className="text-xs font-semibold text-gray-200 mb-0.5 flex items-center gap-1">
                  <span>{reason.icon}</span>
                  <span>{reason.title}</span>
                </div>
                <div className="text-xs text-gray-400 leading-relaxed">
                  {reason.detail}
                </div>
              </div>
            </div>
          ))}

          {/* Risk note */}
          <div className="mt-2 p-2 rounded bg-yellow-950/30 border border-yellow-800/30 text-xs text-yellow-600/80">
            ⚠️ Ces propositions sont des analyses techniques automatiques, pas des conseils financiers.
            Validez toujours le setup visuellement avant d'entrer en position.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function TradeProposals({ proposals = [] }) {
  if (proposals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 text-center px-4">
        <div className="text-3xl mb-3">🔍</div>
        <div className="text-sm font-semibold text-gray-500">Aucun setup détecté</div>
        <div className="text-xs text-gray-600 mt-1 leading-relaxed">
          Le moteur SMC analyse les confluences en temps réel.
          Un setup apparaîtra quand le prix approchera d'une zone avec au moins 2 confirmations.
        </div>
      </div>
    );
  }

  const buys  = proposals.filter(p => p.direction === 'BUY');
  const sells = proposals.filter(p => p.direction === 'SELL');

  return (
    <div className="h-full overflow-y-auto p-2 space-y-1 custom-scrollbar">

      {/* Summary bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 mb-2 bg-dark-700/50 rounded text-xs">
        <span className="text-gray-500">{proposals.length} setup{proposals.length > 1 ? 's' : ''} actif{proposals.length > 1 ? 's' : ''}</span>
        <div className="flex-1" />
        {buys.length > 0 && (
          <span className="flex items-center gap-1 text-emerald-400">
            <TrendingUp size={10} /> {buys.length} BUY
          </span>
        )}
        {sells.length > 0 && (
          <span className="flex items-center gap-1 text-red-400">
            <TrendingDown size={10} /> {sells.length} SELL
          </span>
        )}
      </div>

      {/* Cards */}
      {proposals.map(p => (
        <ProposalCard key={p.id} proposal={p} />
      ))}
    </div>
  );
}
