/**
 * SMC (Smart Money Concepts) Detection Utilities for XAUUSD Scalping
 * Detects: Fair Value Gaps, Order Blocks, BOS/CHoCH, Liquidity, Sessions
 */

// ─────────────────────────────────────────────
// 1. Fair Value Gap Detection
// ─────────────────────────────────────────────
/**
 * Detects Fair Value Gaps using a 3-candle pattern.
 * Bullish FVG: candle[i-2].high < candle[i].low  → gap between C0 high and C2 low
 * Bearish FVG: candle[i-2].low  > candle[i].high → gap between C0 low  and C2 high
 */
export function detectFVG(candles) {
  const fvgs = [];
  if (!candles || candles.length < 3) return fvgs;

  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2]; // first candle
    const c2 = candles[i];     // third candle (middle is c1)

    // Bullish FVG: gap above C0 high and below C2 low
    if (c0.high < c2.low) {
      fvgs.push({
        type: 'bullish',
        top: c2.low,
        bottom: c0.high,
        time: c2.time,
        index: i,
        filled: false,
        size: c2.low - c0.high
      });
    }

    // Bearish FVG: gap below C0 low and above C2 high
    if (c0.low > c2.high) {
      fvgs.push({
        type: 'bearish',
        top: c0.low,
        bottom: c2.high,
        time: c2.time,
        index: i,
        filled: false,
        size: c0.low - c2.high
      });
    }
  }

  // Mark FVGs as filled when price trades back through them
  for (const fvg of fvgs) {
    for (let j = fvg.index + 1; j < candles.length; j++) {
      const c = candles[j];
      if (fvg.type === 'bullish' && c.low <= fvg.bottom) {
        fvg.filled = true;
        break;
      }
      if (fvg.type === 'bearish' && c.high >= fvg.top) {
        fvg.filled = true;
        break;
      }
    }
  }

  // Return last 20 FVGs (most recent, prioritise unfilled)
  const unfilled = fvgs.filter(f => !f.filled).slice(-15);
  const filled = fvgs.filter(f => f.filled).slice(-5);
  return [...unfilled, ...filled].sort((a, b) => a.index - b.index);
}

// ─────────────────────────────────────────────
// 2. Order Block Detection
// ─────────────────────────────────────────────
/**
 * Detects Order Blocks:
 * Bearish OB: Last bearish candle before a strong bullish move (BOS up)
 * Bullish OB: Last bullish candle before a strong bearish move (BOS down)
 *
 * "Strong move" = next N candles move more than `threshold` from OB close.
 */
export function detectOrderBlocks(candles) {
  const obs = [];
  if (!candles || candles.length < 5) return obs;

  const lookForward = 5;   // candles to check for strong move
  const threshold = 0.003; // 0.3% move considered significant

  for (let i = 1; i < candles.length - lookForward; i++) {
    const c = candles[i];
    const isBearishCandle = c.close < c.open;
    const isBullishCandle = c.close > c.open;

    if (isBearishCandle) {
      // Check if a strong bullish move follows
      let maxHigh = c.high;
      for (let j = i + 1; j <= i + lookForward && j < candles.length; j++) {
        maxHigh = Math.max(maxHigh, candles[j].high);
      }
      const moveUp = (maxHigh - c.close) / c.close;
      if (moveUp >= threshold) {
        // Confirm it's the LAST bearish candle before the move
        const prev = i > 0 ? candles[i - 1] : null;
        if (!prev || prev.close > prev.open) { // previous was bullish or doesn't exist
          obs.push({
            type: 'bullish', // OB type = direction price will react FROM (bearish OB = demand zone = price bounces UP)
            high: c.high,
            low: c.low,
            open: c.open,
            close: c.close,
            time: c.time,
            index: i,
            mitigated: false
          });
        }
      }
    }

    if (isBullishCandle) {
      // Check if a strong bearish move follows
      let minLow = c.low;
      for (let j = i + 1; j <= i + lookForward && j < candles.length; j++) {
        minLow = Math.min(minLow, candles[j].low);
      }
      const moveDown = (c.close - minLow) / c.close;
      if (moveDown >= threshold) {
        obs.push({
          type: 'bearish',
          high: c.high,
          low: c.low,
          open: c.open,
          close: c.close,
          time: c.time,
          index: i,
          mitigated: false
        });
      }
    }
  }

  // Mark mitigated OBs (price traded through them)
  for (const ob of obs) {
    for (let j = ob.index + 1; j < candles.length; j++) {
      const c = candles[j];
      if (ob.type === 'bullish' && c.low <= ob.low) {
        ob.mitigated = true;
        break;
      }
      if (ob.type === 'bearish' && c.high >= ob.high) {
        ob.mitigated = true;
        break;
      }
    }
  }

  // Return most recent 20 OBs
  return obs.slice(-20);
}

// ─────────────────────────────────────────────
// 3. BOS / CHoCH Detection
// ─────────────────────────────────────────────
/**
 * Detects Break of Structure (BOS) and Change of Character (CHoCH).
 *
 * Swing High: candle[i].high > candle[i-n].high && > candle[i+n].high
 * Swing Low:  candle[i].low  < candle[i-n].low  && < candle[i+n].low
 *
 * BOS Bullish: price breaks above previous swing high (continuation up)
 * BOS Bearish: price breaks below previous swing low (continuation down)
 * CHoCH: price breaks structure in the OPPOSITE direction to current trend
 */
export function detectBOSCHoCH(candles) {
  const signals = [];
  if (!candles || candles.length < 10) return signals;

  const swingLen = 3; // bars on each side to confirm a swing

  // Find swing points
  const swingHighs = [];
  const swingLows = [];

  for (let i = swingLen; i < candles.length - swingLen; i++) {
    const c = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;

    for (let j = i - swingLen; j <= i + swingLen; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isSwingHigh = false;
      if (candles[j].low <= c.low) isSwingLow = false;
    }

    if (isSwingHigh) swingHighs.push({ price: c.high, time: c.time, index: i });
    if (isSwingLow)  swingLows.push({ price: c.low,  time: c.time, index: i });
  }

  // Determine trend: higher highs + higher lows = uptrend, else downtrend
  let trend = 'neutral';
  if (swingHighs.length >= 2 && swingLows.length >= 2) {
    const lastTwoHighs = swingHighs.slice(-2);
    const lastTwoLows  = swingLows.slice(-2);
    const hhPattern = lastTwoHighs[1].price > lastTwoHighs[0].price;
    const hlPattern = lastTwoLows[1].price  > lastTwoLows[0].price;
    const llPattern = lastTwoLows[1].price  < lastTwoLows[0].price;
    const lhPattern = lastTwoHighs[1].price < lastTwoHighs[0].price;

    if (hhPattern && hlPattern) trend = 'bullish';
    else if (llPattern && lhPattern) trend = 'bearish';
  }

  // Check each candle for BOS/CHoCH
  const usedHighs = new Set();
  const usedLows  = new Set();

  for (let i = swingLen + 1; i < candles.length; i++) {
    const c = candles[i];

    // Check break of swing highs
    for (const sh of swingHighs) {
      if (sh.index >= i) continue;
      if (usedHighs.has(sh.index)) continue;
      if (c.close > sh.price) {
        const signalType = trend === 'bullish' ? 'BOS' : 'CHoCH';
        signals.push({
          type: signalType,
          direction: 'bullish',
          level: sh.price,
          time: c.time,
          index: i,
          brokenSwingIndex: sh.index
        });
        usedHighs.add(sh.index);
        if (signalType === 'CHoCH') trend = 'bullish';
        break;
      }
    }

    // Check break of swing lows
    for (const sl of swingLows) {
      if (sl.index >= i) continue;
      if (usedLows.has(sl.index)) continue;
      if (c.close < sl.price) {
        const signalType = trend === 'bearish' ? 'BOS' : 'CHoCH';
        signals.push({
          type: signalType,
          direction: 'bearish',
          level: sl.price,
          time: c.time,
          index: i,
          brokenSwingIndex: sl.index
        });
        usedLows.add(sl.index);
        if (signalType === 'CHoCH') trend = 'bearish';
        break;
      }
    }
  }

  return signals.slice(-30);
}

// ─────────────────────────────────────────────
// 4. Liquidity Detection
// ─────────────────────────────────────────────
/**
 * Detects liquidity levels:
 * BSL (Buy Side Liquidity):  Equal highs within 0.1% tolerance → stops above highs
 * SSL (Sell Side Liquidity): Equal lows  within 0.1% tolerance → stops below lows
 */
export function detectLiquidity(candles) {
  const levels = [];
  if (!candles || candles.length < 5) return levels;

  const tolerance = 0.001; // 0.1%
  const minTouches = 2;

  // Collect all swing highs and lows (simplified — local extremes)
  const highs = [];
  const lows  = [];

  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isLocalHigh =
      c.high >= candles[i - 1].high &&
      c.high >= candles[i - 2].high &&
      c.high >= candles[i + 1].high &&
      c.high >= candles[i + 2].high;
    const isLocalLow  =
      c.low  <= candles[i - 1].low &&
      c.low  <= candles[i - 2].low &&
      c.low  <= candles[i + 1].low &&
      c.low  <= candles[i + 2].low;

    if (isLocalHigh) highs.push({ price: c.high, time: c.time, index: i });
    if (isLocalLow)  lows.push({ price: c.low,   time: c.time, index: i });
  }

  // Group equal highs → BSL
  const processedHighs = new Set();
  for (let i = 0; i < highs.length; i++) {
    if (processedHighs.has(i)) continue;
    const group = [highs[i]];
    for (let j = i + 1; j < highs.length; j++) {
      const diff = Math.abs(highs[j].price - highs[i].price) / highs[i].price;
      if (diff <= tolerance) {
        group.push(highs[j]);
        processedHighs.add(j);
      }
    }
    if (group.length >= minTouches) {
      const avgPrice = group.reduce((s, h) => s + h.price, 0) / group.length;
      const swept = candles.slice(group[group.length - 1].index).some(c => c.high > avgPrice * (1 + tolerance));
      if (!swept) {
        levels.push({
          type: 'BSL',
          level: avgPrice,
          time: group[0].time,
          lastTime: group[group.length - 1].time,
          touches: group.length,
          index: group[0].index
        });
      }
    }
    processedHighs.add(i);
  }

  // Group equal lows → SSL
  const processedLows = new Set();
  for (let i = 0; i < lows.length; i++) {
    if (processedLows.has(i)) continue;
    const group = [lows[i]];
    for (let j = i + 1; j < lows.length; j++) {
      const diff = Math.abs(lows[j].price - lows[i].price) / lows[i].price;
      if (diff <= tolerance) {
        group.push(lows[j]);
        processedLows.add(j);
      }
    }
    if (group.length >= minTouches) {
      const avgPrice = group.reduce((s, l) => s + l.price, 0) / group.length;
      const swept = candles.slice(group[group.length - 1].index).some(c => c.low < avgPrice * (1 - tolerance));
      if (!swept) {
        levels.push({
          type: 'SSL',
          level: avgPrice,
          time: group[0].time,
          lastTime: group[group.length - 1].time,
          touches: group.length,
          index: group[0].index
        });
      }
    }
    processedLows.add(i);
  }

  // Also add overall session high/low as liquidity
  if (candles.length > 10) {
    const recentHigh = Math.max(...candles.slice(-20).map(c => c.high));
    const recentLow  = Math.min(...candles.slice(-20).map(c => c.low));
    const lastCandle = candles[candles.length - 1];

    levels.push({
      type: 'BSL',
      level: recentHigh,
      time: lastCandle.time,
      lastTime: lastCandle.time,
      touches: 1,
      index: candles.length - 1,
      label: 'Session High'
    });
    levels.push({
      type: 'SSL',
      level: recentLow,
      time: lastCandle.time,
      lastTime: lastCandle.time,
      touches: 1,
      index: candles.length - 1,
      label: 'Session Low'
    });
  }

  return levels.sort((a, b) => a.index - b.index).slice(-20);
}

// ─────────────────────────────────────────────
// 5. Session Detection
// ─────────────────────────────────────────────
/**
 * Identifies trading sessions and computes their high/low ranges.
 * Asia:     00:00–09:00 UTC
 * London:   07:00–16:00 UTC
 * New York: 12:00–21:00 UTC
 */
export function detectSessions(candles) {
  if (!candles || candles.length === 0) return [];

  const sessions = {
    Asia:     { start: 0,  end: 9  },
    London:   { start: 7,  end: 16 },
    NewYork:  { start: 12, end: 21 }
  };

  const sessionColors = {
    Asia:    'rgba(59, 130, 246, 0.06)',   // blue
    London:  'rgba(16, 185, 129, 0.06)',   // green
    NewYork: 'rgba(245, 158, 11, 0.06)'   // amber
  };

  // Group candles by session day + session name
  const sessionMap = new Map();

  for (const candle of candles) {
    // candle.time is a Unix timestamp (seconds)
    const date = new Date(candle.time * 1000);
    const hour = date.getUTCHours();
    const dayKey = date.toISOString().slice(0, 10);

    for (const [name, { start, end }] of Object.entries(sessions)) {
      if (hour >= start && hour < end) {
        const key = `${dayKey}-${name}`;
        if (!sessionMap.has(key)) {
          sessionMap.set(key, {
            name,
            color: sessionColors[name],
            startTime: candle.time,
            endTime: candle.time,
            high: candle.high,
            low: candle.low
          });
        } else {
          const s = sessionMap.get(key);
          s.endTime = candle.time;
          s.high = Math.max(s.high, candle.high);
          s.low  = Math.min(s.low,  candle.low);
        }
      }
    }
  }

  return Array.from(sessionMap.values()).slice(-15); // last 15 session blocks
}

// ─────────────────────────────────────────────
// Helper: Get current session name
// ─────────────────────────────────────────────
export function getCurrentSession() {
  const now = new Date();
  const hour = now.getUTCHours();
  if (hour >= 0 && hour < 7)   return 'Asia';
  if (hour >= 7 && hour < 12)  return 'Asia/London Overlap';
  if (hour >= 12 && hour < 16) return 'London/NY Overlap';
  if (hour >= 16 && hour < 21) return 'New York';
  return 'Off-session';
}

// ─────────────────────────────────────────────
// Helper: Format price for display
// ─────────────────────────────────────────────
export function formatPrice(price) {
  return typeof price === 'number' ? price.toFixed(2) : parseFloat(price).toFixed(2);
}

// ─────────────────────────────────────────────
// Main SMC Analysis Runner
// ─────────────────────────────────────────────
export function runSMCAnalysis(candles) {
  if (!candles || candles.length < 5) {
    return { fvgs: [], orderBlocks: [], bosChoch: [], liquidity: [], sessions: [] };
  }

  return {
    fvgs:        detectFVG(candles),
    orderBlocks: detectOrderBlocks(candles),
    bosChoch:    detectBOSCHoCH(candles),
    liquidity:   detectLiquidity(candles),
    sessions:    detectSessions(candles)
  };
}

// ─────────────────────────────────────────────
// 6. Trade Proposals Generator
// ─────────────────────────────────────────────
/**
 * Generates trade proposals based on SMC confluences.
 * Each proposal includes entry, SL, TP, RR and a detailed explanation.
 *
 * Scoring (1 pt each):
 *  - FVG present near price           (base)
 *  - Confluent Order Block            (+1)
 *  - BOS/CHoCH in same direction      (+1)
 *  - Liquidity swept in opposite dir  (+1)
 *  - CHoCH confirming reversal        (+1)
 */
export function generateTradeProposals(candles, smcData) {
  if (!candles || candles.length < 10 || !smcData) return [];

  const { fvgs = [], orderBlocks = [], bosChoch = [], liquidity = [] } = smcData;
  const currentPrice = candles[candles.length - 1].close;

  // Proximity élargie à 3% — on affiche tous les setups actifs
  // et on indique la distance au prix actuel
  const proximity = currentPrice * 0.03;

  // Last structural signals
  const lastBullBOS   = [...bosChoch].filter(b => b.direction === 'bullish').slice(-1)[0];
  const lastBearBOS   = [...bosChoch].filter(b => b.direction === 'bearish').slice(-1)[0];
  const lastBullChoch = [...bosChoch].filter(b => b.type === 'CHoCH' && b.direction === 'bullish').slice(-1)[0];
  const lastBearChoch = [...bosChoch].filter(b => b.type === 'CHoCH' && b.direction === 'bearish').slice(-1)[0];

  const bslLevels = liquidity.filter(l => l.type === 'BSL');
  const sslLevels = liquidity.filter(l => l.type === 'SSL');

  const proposals = [];

  // ── BULLISH PROPOSALS ────────────────────────────────────────────────
  const unfilledBullFVGs = fvgs.filter(f => f.type === 'bullish' && !f.filled);
  const bullishOBs       = orderBlocks.filter(ob => ob.type === 'bullish' && !ob.mitigated);

  for (const fvg of unfilledBullFVGs) {
    // Price must be at or just above the FVG, or inside it
    const insideFVG  = currentPrice >= fvg.bottom && currentPrice <= fvg.top;
    const aboveFVG   = currentPrice > fvg.top  && currentPrice < fvg.top  + proximity * 2;
    const belowFVG   = currentPrice < fvg.bottom && currentPrice > fvg.bottom - proximity * 2;
    if (!insideFVG && !aboveFVG && !belowFVG) continue;

    const reasons = [];
    let score = 1;

    // 1 — FVG base reason
    reasons.push({
      icon: '📊',
      title: 'Bullish FVG (Imbalance)',
      detail: `Zone non comblée entre ${fvg.bottom.toFixed(2)} et ${fvg.top.toFixed(2)}. ` +
              `Le prix a laissé un déséquilibre haussier (${fvg.size.toFixed(2)} pts) que les institutions ` +
              `ont tendance à revenir combler — offrant une entrée à haute probabilité.`
    });

    // 2 — Confluent OB
    const nearOB = bullishOBs.find(ob =>
      Math.abs(ob.high - fvg.bottom) <= proximity * 4 ||
      (ob.low <= fvg.top && ob.high >= fvg.bottom)
    );
    if (nearOB) {
      score++;
      reasons.push({
        icon: '🟩',
        title: 'Order Block haussier confluent',
        detail: `Un OB haussier (${nearOB.low.toFixed(2)}–${nearOB.high.toFixed(2)}) chevauche le FVG. ` +
                `C'est une zone d'accumulation institutionnelle : les smart money ont placé des ordres ` +
                `d'achat ici. La double confluence FVG + OB renforce fortement le setup.`
      });
    }

    // 3 — BOS/CHoCH haussier
    if (lastBullBOS) {
      score++;
      reasons.push({
        icon: '📈',
        title: `${lastBullBOS.type} haussier confirmé`,
        detail: `Le prix a cassé la structure haussière à ${lastBullBOS.level.toFixed(2)}. ` +
                `Un ${lastBullBOS.type} (Break of Structure) haussier confirme que les acheteurs ` +
                `sont en contrôle — le biais directionnnel est UP.`
      });
    }

    // 4 — SSL sweepé (liquidité vendeurs raflée)
    const nearSSL = sslLevels.find(ssl =>
      ssl.level < fvg.bottom && ssl.level > fvg.bottom - proximity * 8
    );
    if (nearSSL) {
      score++;
      reasons.push({
        icon: '💧',
        title: 'Liquidité SSL raflée',
        detail: `Un niveau SSL (equal lows / stops vendeurs) à ${nearSSL.level.toFixed(2)} est proche. ` +
                `Les smart money ont probablement raflé ces stops avant de pousser le prix vers le haut — ` +
                `c'est le classique "liquidity grab" avant un mouvement impulsif haussier.`
      });
    }

    // 5 — CHoCH haussier
    if (lastBullChoch) {
      score++;
      reasons.push({
        icon: '🔄',
        title: 'CHoCH haussier (renversement)',
        detail: `Un CHoCH (Change of Character) haussier à ${lastBullChoch.level.toFixed(2)} a été détecté. ` +
                `Cela indique que la tendance précédente s'inverse — les institutions commencent à ` +
                `accumuler des positions longues.`
      });
    }

    if (score < 2) continue; // Minimum 2 confluences

    // ── Niveaux d'entrée / SL / TP ──────────────────────────────────
    const entry = insideFVG ? currentPrice : belowFVG ? fvg.bottom + 0.1 : fvg.bottom + (fvg.top - fvg.bottom) * 0.2;
    const slBase = nearOB ? nearOB.low : fvg.bottom;
    const sl     = parseFloat((slBase - proximity * 0.3).toFixed(2));

    const risk   = entry - sl;
    const nextBSL = bslLevels.filter(b => b.level > entry + risk).sort((a, b) => a.level - b.level)[0];
    const tp      = nextBSL ? parseFloat(nextBSL.level.toFixed(2)) : parseFloat((entry + risk * 2.5).toFixed(2));
    const rr      = risk > 0 ? ((tp - entry) / risk).toFixed(1) : 'N/A';

    const distPts  = Math.abs(currentPrice - entry).toFixed(1);
    const distPct  = ((Math.abs(currentPrice - entry) / currentPrice) * 100).toFixed(2);
    const isActive = currentPrice >= fvg.bottom && currentPrice <= fvg.top;

    proposals.push({
      id:        `bull-${fvg.index}`,
      direction: 'BUY',
      entry:     parseFloat(entry.toFixed(2)),
      sl,
      tp,
      rr,
      score,
      reasons,
      setup:    nearOB ? 'FVG + Order Block' : 'Fair Value Gap',
      strength: score >= 4 ? 'Fort' : score === 3 ? 'Modéré' : 'Faible',
      time:     new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      distPts,
      distPct,
      isActive,
      status:   isActive ? 'EN ZONE' : currentPrice < entry ? 'PRIX EN DESSOUS' : 'PRIX AU-DESSUS'
    });
  }

  // ── BEARISH PROPOSALS ────────────────────────────────────────────────
  const unfilledBearFVGs = fvgs.filter(f => f.type === 'bearish' && !f.filled);
  const bearishOBs       = orderBlocks.filter(ob => ob.type === 'bearish' && !ob.mitigated);

  for (const fvg of unfilledBearFVGs) {
    const insideFVG = currentPrice >= fvg.bottom && currentPrice <= fvg.top;
    const belowFVG  = currentPrice < fvg.bottom && currentPrice > fvg.bottom - proximity * 2;
    const aboveFVG  = currentPrice > fvg.top    && currentPrice < fvg.top    + proximity * 2;
    if (!insideFVG && !belowFVG && !aboveFVG) continue;

    const reasons = [];
    let score = 1;

    reasons.push({
      icon: '📊',
      title: 'Bearish FVG (Imbalance)',
      detail: `Zone non comblée entre ${fvg.bottom.toFixed(2)} et ${fvg.top.toFixed(2)}. ` +
              `Déséquilibre baissier (${fvg.size.toFixed(2)} pts) — le prix a tendance à revenir ` +
              `combler ce gap avant de continuer sa descente.`
    });

    const nearOB = bearishOBs.find(ob =>
      Math.abs(ob.low - fvg.top) <= proximity * 4 ||
      (ob.low <= fvg.top && ob.high >= fvg.bottom)
    );
    if (nearOB) {
      score++;
      reasons.push({
        icon: '🟥',
        title: 'Order Block baissier confluent',
        detail: `Un OB baissier (${nearOB.low.toFixed(2)}–${nearOB.high.toFixed(2)}) chevauche le FVG. ` +
                `Zone de distribution institutionnelle : les smart money ont placé des ordres de ` +
                `vente ici. La confluence FVG + OB maximise la probabilité de rejet.`
      });
    }

    if (lastBearBOS) {
      score++;
      reasons.push({
        icon: '📉',
        title: `${lastBearBOS.type} baissier confirmé`,
        detail: `Le prix a cassé la structure à ${lastBearBOS.level.toFixed(2)} vers le bas. ` +
                `Un ${lastBearBOS.type} baissier confirme que les vendeurs dominent — ` +
                `le biais directionnel est DOWN.`
      });
    }

    const nearBSL = bslLevels.find(bsl =>
      bsl.level > fvg.top && bsl.level < fvg.top + proximity * 8
    );
    if (nearBSL) {
      score++;
      reasons.push({
        icon: '💧',
        title: 'Liquidité BSL raflée',
        detail: `Un niveau BSL (equal highs / stops acheteurs) à ${nearBSL.level.toFixed(2)} est proche. ` +
                `Les smart money ont probablement raflé ces stops avant de distribuer — ` +
                `"liquidity grab" classique précédant un mouvement baissier.`
      });
    }

    if (lastBearChoch) {
      score++;
      reasons.push({
        icon: '🔄',
        title: 'CHoCH baissier (renversement)',
        detail: `CHoCH baissier à ${lastBearChoch.level.toFixed(2)} détecté. ` +
                `La tendance s'inverse : les institutions commencent à distribuer ` +
                `leurs positions — favorisant un mouvement baissier.`
      });
    }

    if (score < 2) continue;

    const entry  = insideFVG ? currentPrice : aboveFVG ? fvg.top - 0.1 : fvg.top - (fvg.top - fvg.bottom) * 0.2;
    const slBase = nearOB ? nearOB.high : fvg.top;
    const sl     = parseFloat((slBase + proximity * 0.3).toFixed(2));

    const risk   = sl - entry;
    const nextSSL = sslLevels.filter(s => s.level < entry - risk).sort((a, b) => b.level - a.level)[0];
    const tp      = nextSSL ? parseFloat(nextSSL.level.toFixed(2)) : parseFloat((entry - risk * 2.5).toFixed(2));
    const rr      = risk > 0 ? ((entry - tp) / risk).toFixed(1) : 'N/A';

    const distPts  = Math.abs(currentPrice - entry).toFixed(1);
    const distPct  = ((Math.abs(currentPrice - entry) / currentPrice) * 100).toFixed(2);
    const isActive = currentPrice >= fvg.bottom && currentPrice <= fvg.top;

    proposals.push({
      id:        `bear-${fvg.index}`,
      direction: 'SELL',
      entry:     parseFloat(entry.toFixed(2)),
      sl,
      tp,
      rr,
      score,
      reasons,
      setup:    nearOB ? 'FVG + Order Block' : 'Fair Value Gap',
      strength: score >= 4 ? 'Fort' : score === 3 ? 'Modéré' : 'Faible',
      time:     new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      distPts,
      distPct,
      isActive,
      status:   isActive ? 'EN ZONE' : currentPrice > entry ? 'PRIX AU-DESSUS' : 'PRIX EN DESSOUS'
    });
  }

  // Best proposals first (score desc), max 5
  return proposals.sort((a, b) => b.score - a.score).slice(0, 5);
}
