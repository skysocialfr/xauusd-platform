import { useMemo } from 'react';
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, Eye,
  BarChart2, Layers, Clock, Target, ShieldAlert, FileText
} from 'lucide-react';

// ── Session detection ─────────────────────────────────────────────────────
function getCurrentSession() {
  const now   = new Date();
  const hour  = now.getUTCHours();
  const min   = now.getUTCMinutes();
  const total = hour * 60 + min;

  // Asia:   00:00 – 08:00 UTC
  // London: 07:00 – 16:00 UTC
  // NY:     13:00 – 22:00 UTC
  const inLondon = total >= 7 * 60  && total < 16 * 60;
  const inNY     = total >= 13 * 60 && total < 22 * 60;
  const inAsia   = total >= 0       && total < 8 * 60;

  if (inNY && inLondon)  return 'London/NY';
  if (inNY)              return 'New York';
  if (inLondon)          return 'London';
  if (inAsia)            return 'Asie';
  return 'Off-market';
}

function getSessionExpectation(session) {
  const map = {
    'Asie':       'Session asiatique - volatilité faible, range compressé. Les liquidités placées pendant cette session seront souvent chassées à l\'ouverture de Londres.',
    'London':     'Session de Londres active - forte liquidité, mouvements directionnels fréquents. Attendre la confirmation du biais après 08:30 UTC.',
    'New York':   'Session de New York - continuation ou reversal possible. L\'overlap NY/London (13h-16h UTC) est souvent le moment de volatilité maximal.',
    'London/NY':  'Overlap London/NY - session de forte volatilité. Les setups de continuation ou reversal se forment rapidement. Surveiller les liquidités des highs/lows asiatiques.',
    'Off-market': 'Marché hors session majeure - éviter les entrées, les spreads sont élevés et la liquidité faible.',
  };
  return map[session] || map['Off-market'];
}

// ── Bias calculation ──────────────────────────────────────────────────────
function computeBias(smcData) {
  const signals = smcData?.bosChoch || [];
  if (signals.length === 0) return { bias: 'NEUTRE', confidence: 0, details: [] };

  const last3 = signals.slice(-3);
  let bullish = 0;
  let bearish = 0;
  const details = [];

  last3.forEach(sig => {
    const isBullish = sig.type === 'BOS' ? sig.direction === 'up' : sig.direction === 'up';
    if (isBullish) { bullish++; } else { bearish++; }
    const price = sig.price?.toFixed(2) || '–';
    const typeLabel = sig.type === 'BOS'
      ? (sig.direction === 'up' ? 'BOS haussier' : 'BOS baissier')
      : (sig.direction === 'up' ? 'CHoCH haussier' : 'CHoCH baissier');
    details.push({ typeLabel, price, direction: sig.direction });
  });

  if (bullish > bearish) return { bias: 'BULLISH', confidence: Math.round((bullish / last3.length) * 100), details };
  if (bearish > bullish) return { bias: 'BEARISH', confidence: Math.round((bearish / last3.length) * 100), details };
  return { bias: 'NEUTRE', confidence: 50, details };
}

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(n) { return typeof n === 'number' ? n.toFixed(2) : '–'; }

function Section({ icon: Icon, title, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-yellow-400 shrink-0" />
        <h3 className="text-yellow-400 text-xs font-bold uppercase tracking-widest">{title}</h3>
      </div>
      <div className="border-t border-dark-600 pt-3">
        {children}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function DailyReview({ candles = [], smcData = {}, livePrice = null }) {
  const analysis = useMemo(() => {
    const session   = getCurrentSession();
    const sessionEx = getSessionExpectation(session);
    const biasInfo  = computeBias(smcData);

    // FVGs – top 3 closest to livePrice or just first 3
    const fvgs = (smcData.fvgs || []).slice(0, 6);
    const topFvgs = livePrice
      ? [...fvgs].sort((a, b) => Math.abs((a.high + a.low) / 2 - livePrice) - Math.abs((b.high + b.low) / 2 - livePrice)).slice(0, 3)
      : fvgs.slice(0, 3);

    // Order Blocks – top 3
    const obs = (smcData.orderBlocks || []).slice(0, 6);
    const topObs = livePrice
      ? [...obs].sort((a, b) => Math.abs((a.high + a.low) / 2 - livePrice) - Math.abs((b.high + b.low) / 2 - livePrice)).slice(0, 3)
      : obs.slice(0, 3);

    // Liquidity levels – top 3
    const liqLevels = (smcData.liquidityLevels || []).slice(0, 3);

    // BOS/CHoCH last signals
    const lastSignals = (smcData.bosChoch || []).slice(-5);

    // Market structure text
    const structureText = (() => {
      if (lastSignals.length === 0) return 'Aucun signal BOS/CHoCH détecté sur cette période.';
      const last = lastSignals[lastSignals.length - 1];
      const price = fmt(last.price);
      if (last.type === 'BOS') {
        return last.direction === 'up'
          ? `Le prix a effectué un BOS haussier à ${price}, confirmant la continuité de la tendance haussière. La structure de marché reste intacte à la hausse.`
          : `Le prix a effectué un BOS baissier à ${price}, confirmant la continuité de la tendance baissière. La structure de marché presse à la baisse.`;
      } else {
        return last.direction === 'up'
          ? `Un CHoCH haussier à ${price} signale un potentiel renversement de tendance vers la hausse. Attendre confirmation avant entrée.`
          : `Un CHoCH baissier à ${price} signale un potentiel renversement de tendance vers la baisse. Attendre confirmation avant entrée.`;
      }
    })();

    // Trade plan bullets
    const planBullets = (() => {
      const bullets = [];
      const bias = biasInfo.bias;

      if (topFvgs.length > 0) {
        const fvg = topFvgs[0];
        const mid = ((fvg.high + fvg.low) / 2).toFixed(2);
        bullets.push(`Surveiller le retour du prix vers le FVG ${fvg.bullish ? 'haussier' : 'baissier'} entre ${fmt(fvg.low)} – ${fmt(fvg.high)} (milieu: ${mid}) pour chercher une entrée en ${fvg.bullish ? 'achat' : 'vente'}.`);
      }
      if (topObs.length > 0) {
        const ob = topObs[0];
        const obType = ob.type === 'demand' || ob.bullish ? 'demande (support)' : 'offre (résistance)';
        bullets.push(`Order Block de ${obType} entre ${fmt(ob.low)} – ${fmt(ob.high)} : zone clé pour ${ob.type === 'demand' || ob.bullish ? 'achats' : 'ventes'} sur réaction.`);
      }
      if (bias === 'BULLISH') {
        bullets.push(`Biais haussier (${biasInfo.confidence}%) : privilégier les setups BUY sur les zones de support. Éviter les shorts contre-tendance sauf CHoCH clair.`);
      } else if (bias === 'BEARISH') {
        bullets.push(`Biais baissier (${biasInfo.confidence}%) : privilégier les setups SELL sur les zones de résistance. Éviter les longs contre-tendance sauf CHoCH clair.`);
      } else {
        bullets.push('Biais neutre : attendre une cassure structurelle claire (BOS) avant de prendre position. Rester patient et éviter les entrées en range.');
      }
      bullets.push(`Session actuelle : ${session}. ${session === 'Off-market' ? 'Pas de trades recommandés.' : 'Valider visuellement chaque setup avant entrée, gérer le risque à 1% du capital par trade.'}`);
      return bullets;
    })();

    // Risk zones
    const riskZones = (() => {
      const zones = [];
      if (liqLevels.length > 0) {
        liqLevels.forEach(l => {
          zones.push(`Niveau de liquidité à ${fmt(l.price)} – une cassure invaliderait le biais ${biasInfo.bias === 'BULLISH' ? 'haussier' : 'baissier'}.`);
        });
      }
      if (biasInfo.bias === 'BULLISH' && livePrice) {
        const below = (smcData.bosChoch || []).filter(s => s.price < livePrice).slice(-1)[0];
        if (below) zones.push(`Ne pas laisser le prix casser sous ${fmt(below.price)} (signal BOS/CHoCH) sans réévaluer le biais.`);
      }
      if (biasInfo.bias === 'BEARISH' && livePrice) {
        const above = (smcData.bosChoch || []).filter(s => s.price > livePrice).slice(-1)[0];
        if (above) zones.push(`Ne pas laisser le prix dépasser ${fmt(above.price)} (signal BOS/CHoCH) sans réévaluer le biais.`);
      }
      if (zones.length === 0) zones.push('Surveiller les récents highs/lows structurels. Toute cassure franche invalide le biais en cours.');
      return zones.slice(0, 3);
    })();

    return { session, sessionEx, biasInfo, topFvgs, topObs, liqLevels, lastSignals, structureText, planBullets, riskZones };
  }, [smcData, livePrice]);

  const noData = !smcData || (
    (!smcData.bosChoch || smcData.bosChoch.length === 0) &&
    (!smcData.fvgs || smcData.fvgs.length === 0) &&
    (!smcData.orderBlocks || smcData.orderBlocks.length === 0)
  );

  if (noData && candles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center bg-dark-900">
        <FileText size={40} className="text-gray-600 mb-4" />
        <div className="text-sm font-semibold text-gray-500">Chargement de l'analyse...</div>
        <div className="text-xs text-gray-600 mt-2 leading-relaxed">
          En attente de données de marché pour générer la revue quotidienne.
        </div>
      </div>
    );
  }

  const { bias, confidence } = analysis.biasInfo;

  const biasBadgeClass =
    bias === 'BULLISH' ? 'bg-emerald-900/60 text-emerald-300 border-emerald-700/60' :
    bias === 'BEARISH' ? 'bg-red-900/60 text-red-300 border-red-700/60'             :
                         'bg-gray-800 text-gray-400 border-gray-700/60';

  const BiasIcon = bias === 'BULLISH' ? TrendingUp : bias === 'BEARISH' ? TrendingDown : Minus;

  return (
    <div className="h-full overflow-y-auto bg-dark-900 custom-scrollbar">
      <div className="max-w-2xl mx-auto p-4 pb-8">

        {/* ── Title + Bias ─────────────────────────────── */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 size={16} className="text-yellow-400" />
              <h2 className="text-sm font-bold text-white tracking-wide">Revue Quotidienne</h2>
            </div>
            <div className="text-xs text-gray-500">
              {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </div>
          </div>

          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border font-bold text-sm ${biasBadgeClass}`}>
            <BiasIcon size={15} />
            <div>
              <div className="text-xs font-normal opacity-70 leading-none mb-0.5">Biais</div>
              <div>{bias}</div>
            </div>
            {confidence > 0 && (
              <span className="text-xs opacity-60 ml-1">{confidence}%</span>
            )}
          </div>
        </div>

        {/* ── 1. Structure de marché ────────────────────── */}
        <Section icon={TrendingUp} title="Structure de marché">
          <p className="text-xs text-gray-300 leading-relaxed mb-3">{analysis.structureText}</p>
          {analysis.lastSignals.length > 0 && (
            <div className="space-y-1.5">
              {analysis.lastSignals.slice(-3).reverse().map((sig, i) => {
                const isBull = sig.direction === 'up';
                return (
                  <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs ${
                    isBull ? 'bg-emerald-950/40 border border-emerald-800/40' : 'bg-red-950/40 border border-red-800/40'
                  }`}>
                    <span className={`font-bold ${isBull ? 'text-emerald-400' : 'text-red-400'}`}>
                      {sig.type} {isBull ? '▲' : '▼'}
                    </span>
                    <span className="text-gray-300 font-mono">{fmt(sig.price)}</span>
                    <span className="text-gray-500">{isBull ? 'Haussier' : 'Baissier'}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {/* ── 2. Niveaux clés ───────────────────────────── */}
        <Section icon={Layers} title="Niveaux clés à surveiller">

          {/* FVGs */}
          {analysis.topFvgs.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-400 mb-1.5">Fair Value Gaps (FVG)</div>
              <div className="space-y-1.5">
                {analysis.topFvgs.map((fvg, i) => (
                  <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border ${
                    fvg.bullish ? 'bg-emerald-950/30 border-emerald-800/30' : 'bg-red-950/30 border-red-800/30'
                  }`}>
                    <span className={`font-semibold ${fvg.bullish ? 'text-emerald-400' : 'text-red-400'}`}>
                      FVG {fvg.bullish ? 'Haussier' : 'Baissier'}
                    </span>
                    <span className="text-gray-300 font-mono text-xs">
                      {fmt(fvg.low)} – {fmt(fvg.high)}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {((fvg.high - fvg.low)).toFixed(2)} pts
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Order Blocks */}
          {analysis.topObs.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-400 mb-1.5">Order Blocks</div>
              <div className="space-y-1.5">
                {analysis.topObs.map((ob, i) => {
                  const isDemand = ob.type === 'demand' || ob.bullish;
                  return (
                    <div key={i} className={`flex items-center justify-between px-2.5 py-1.5 rounded text-xs border ${
                      isDemand ? 'bg-emerald-950/30 border-emerald-800/30' : 'bg-red-950/30 border-red-800/30'
                    }`}>
                      <span className={`font-semibold ${isDemand ? 'text-emerald-400' : 'text-red-400'}`}>
                        OB {isDemand ? 'Demande' : 'Offre'}
                      </span>
                      <span className="text-gray-300 font-mono text-xs">
                        {fmt(ob.low)} – {fmt(ob.high)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Liquidity */}
          {analysis.liqLevels.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-400 mb-1.5">Liquidités</div>
              <div className="space-y-1.5">
                {analysis.liqLevels.map((liq, i) => (
                  <div key={i} className="flex items-center justify-between px-2.5 py-1.5 rounded text-xs border bg-purple-950/30 border-purple-800/30">
                    <span className="font-semibold text-purple-400">
                      {liq.type === 'high' ? 'SSL (High)' : 'BSL (Low)'}
                    </span>
                    <span className="text-gray-300 font-mono">{fmt(liq.price)}</span>
                    <span className="text-gray-500">Zone cible</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.topFvgs.length === 0 && analysis.topObs.length === 0 && analysis.liqLevels.length === 0 && (
            <p className="text-xs text-gray-500 italic">Aucun niveau clé identifié sur ce timeframe.</p>
          )}
        </Section>

        {/* ── 3. Contexte de session ────────────────────── */}
        <Section icon={Clock} title="Contexte de session">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-1 rounded text-xs font-bold bg-yellow-900/50 text-yellow-300 border border-yellow-700/40">
              {analysis.session}
            </span>
            {analysis.session !== 'Off-market' && (
              <span className="text-xs text-emerald-400 font-semibold">Active</span>
            )}
          </div>
          <p className="text-xs text-gray-300 leading-relaxed">{analysis.sessionEx}</p>
        </Section>

        {/* ── 4. Plan de trading ────────────────────────── */}
        <Section icon={Target} title="Plan de trading du jour">
          <ul className="space-y-2">
            {analysis.planBullets.map((bullet, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-300 leading-relaxed">
                <span className="shrink-0 w-4 h-4 rounded-full bg-yellow-900/60 text-yellow-400 flex items-center justify-center text-xs font-bold mt-0.5">
                  {i + 1}
                </span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* ── 5. Zones de risque ────────────────────────── */}
        <Section icon={ShieldAlert} title="Zones de risque">
          <ul className="space-y-2">
            {analysis.riskZones.map((zone, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-400 leading-relaxed">
                <AlertTriangle size={12} className="text-orange-400 shrink-0 mt-0.5" />
                <span>{zone}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 p-2.5 rounded bg-yellow-950/30 border border-yellow-800/30 text-xs text-yellow-600/80 leading-relaxed">
            Ces analyses sont générées automatiquement à partir des données SMC. Toujours valider visuellement avant entrée en position. Gérez votre risque.
          </div>
        </Section>

        {/* ── Last updated ─────────────────────────────── */}
        <div className="flex items-center gap-1.5 text-xs text-gray-600 mt-2">
          <Eye size={11} />
          <span>Mise à jour : {new Date().toLocaleTimeString('fr-FR')}</span>
          {livePrice && (
            <span className="ml-2 text-gray-500 font-mono">
              XAU/USD : {livePrice.toFixed(2)}
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
