import { useEffect, useRef, useCallback, useState } from 'react';
import { createChart, LineStyle, CrosshairMode } from 'lightweight-charts';

// ── Visibility toggles ────────────────────────────────────────────────────
const LAYERS = [
  { key: 'fvg',  label: 'FVG',   color: '#3b82f6' },
  { key: 'ob',   label: 'OB',    color: '#10b981' },
  { key: 'bos',  label: 'BOS',   color: '#22c55e' },
  { key: 'liq',  label: 'LIQ',   color: '#f97316' },
];

export default function Chart({ candles, smcData }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);
  const overlaysRef  = useRef([]);

  // Layer visibility state
  const [visible, setVisible] = useState({ fvg: true, ob: true, bos: true, liq: true });
  const toggleLayer = (key) => setVisible(v => ({ ...v, [key]: !v[key] }));

  // ── Create chart once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#0a0a0f' },
        textColor:  '#9ca3af',
        fontSize:   11,
        fontFamily: "'Inter', system-ui, sans-serif"
      },
      grid: {
        vertLines: { color: '#111118', style: LineStyle.Solid },
        horzLines: { color: '#111118', style: LineStyle.Solid }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#374151', width: 1, labelBackgroundColor: '#1f2937' },
        horzLine: { color: '#374151', width: 1, labelBackgroundColor: '#1f2937' }
      },
      rightPriceScale: {
        borderColor:  '#1f2937',
        scaleMargins: { top: 0.08, bottom: 0.08 },
        minimumWidth: 70
      },
      timeScale: {
        borderColor:    '#1f2937',
        timeVisible:    true,
        secondsVisible: false
      },
      handleScroll: true,
      handleScale:  true
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:         '#26a69a',
      downColor:       '#ef5350',
      borderUpColor:   '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor:     '#3d9b93',
      wickDownColor:   '#c44545'
    });

    chartRef.current  = chart;
    seriesRef.current = candleSeries;

    const observer = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width:  containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Update candles ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !candles?.length) return;
    const formatted = candles
      .map(c => ({ time: c.time, open: +c.open, high: +c.high, low: +c.low, close: +c.close }))
      .filter(c => c.time && !isNaN(c.open))
      .sort((a, b) => a.time - b.time);
    seriesRef.current.setData(formatted);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // ── Clear overlays ─────────────────────────────────────────────────────
  const clearOverlays = useCallback(() => {
    if (!chartRef.current) return;
    for (const s of overlaysRef.current) {
      try { chartRef.current.removeSeries(s); } catch (_) {}
    }
    overlaysRef.current = [];
    // Also clear price lines by recreating the series is not possible,
    // so we track them separately — price lines are cleared on re-render
    // by the lightweight-charts internal mechanism when setData is called.
    // Instead, we store price line refs and remove them manually.
  }, []);

  // Keep track of price lines to remove them
  const priceLinesRef = useRef([]);
  const clearPriceLines = useCallback(() => {
    if (!seriesRef.current) return;
    for (const pl of priceLinesRef.current) {
      try { seriesRef.current.removePriceLine(pl); } catch (_) {}
    }
    priceLinesRef.current = [];
  }, []);

  // ── Draw SMC overlays ──────────────────────────────────────────────────
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !smcData || !candles?.length) return;

    clearOverlays();
    clearPriceLines();

    const chart        = chartRef.current;
    const cs           = seriesRef.current;
    const newOverlays  = [];
    const newPriceLines = [];

    const { fvgs = [], orderBlocks = [], bosChoch = [], liquidity = [] } = smcData;
    const lastTime = candles[candles.length - 1].time;

    // ── FVG — max 6 unfilled, most recent ──────────────────────────────
    if (visible.fvg) {
      const activeFVGs = fvgs.filter(f => !f.filled).slice(-6);
      for (const fvg of activeFVGs) {
        const isBull  = fvg.type === 'bullish';
        const color   = isBull ? '#3b82f6' : '#ef4444';
        const bgColor = isBull ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)';
        const label   = isBull ? 'FVG ▲' : 'FVG ▼';

        // Top line with label
        const plTop = cs.createPriceLine({
          price: fvg.top, color, lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: label
        });
        // Bottom line — no label (avoid clutter)
        const plBot = cs.createPriceLine({
          price: fvg.bottom, color, lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: ''
        });
        newPriceLines.push(plTop, plBot);

        // Shaded zone
        const startTime = fvg.time;
        const topS = chart.addLineSeries({
          color: bgColor, lineWidth: 0,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
        });
        const botS = chart.addLineSeries({
          color: bgColor, lineWidth: 0,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
        });
        topS.setData([{ time: startTime, value: fvg.top    }, { time: lastTime, value: fvg.top    }]);
        botS.setData([{ time: startTime, value: fvg.bottom }, { time: lastTime, value: fvg.bottom }]);
        newOverlays.push(topS, botS);
      }
    }

    // ── Order Blocks — max 4 active ────────────────────────────────────
    if (visible.ob) {
      const activeOBs = orderBlocks.filter(ob => !ob.mitigated).slice(-4);
      for (const ob of activeOBs) {
        const isBull = ob.type === 'bullish';
        const color  = isBull ? '#10b981' : '#f59e0b';
        const label  = isBull ? 'OB+' : 'OB-';

        const plH = cs.createPriceLine({
          price: ob.high, color, lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: label
        });
        const plL = cs.createPriceLine({
          price: ob.low, color, lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: ''
        });
        newPriceLines.push(plH, plL);
      }
    }

    // ── BOS / CHoCH — last 5 only ──────────────────────────────────────
    if (visible.bos) {
      // Deduplicate by level (keep most recent per level)
      const deduped = [];
      const seen = new Set();
      for (const s of [...bosChoch].reverse().slice(0, 8)) {
        const key = s.level.toFixed(0);
        if (!seen.has(key)) { deduped.push(s); seen.add(key); }
        if (deduped.length >= 5) break;
      }

      for (const signal of deduped) {
        const isBull = signal.direction === 'bullish';
        const isChoch = signal.type === 'CHoCH';
        const color = isChoch ? '#a855f7' : (isBull ? '#22c55e' : '#ef4444');
        const label = `${signal.type} ${isBull ? '↑' : '↓'}`;

        const pl = cs.createPriceLine({
          price: signal.level, color, lineWidth: 1,
          lineStyle: isChoch ? LineStyle.LargeDashed : LineStyle.Dashed,
          axisLabelVisible: true,
          title: label
        });
        newPriceLines.push(pl);
      }
    }

    // ── Liquidity — max 4 levels, no duplicate prices ─────────────────
    if (visible.liq) {
      const seen = new Set();
      const filtered = liquidity.filter(l => {
        const k = l.level.toFixed(0);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }).slice(-4);

      for (const liq of filtered) {
        const isBSL = liq.type === 'BSL';
        const color = isBSL ? '#f97316' : '#a855f7';
        const title = liq.label || (isBSL ? 'BSL' : 'SSL');

        const pl = cs.createPriceLine({
          price: liq.level, color, lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title
        });
        newPriceLines.push(pl);
      }
    }

    overlaysRef.current  = newOverlays;
    priceLinesRef.current = newPriceLines;
  }, [smcData, candles, visible, clearOverlays, clearPriceLines]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── Layer toggle buttons ── */}
      <div className="absolute top-2 left-2 flex flex-wrap gap-1 pointer-events-auto z-10">
        {LAYERS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => toggleLayer(key)}
            style={{ borderColor: visible[key] ? color : '#374151', color: visible[key] ? color : '#6b7280' }}
            className="px-2 py-0.5 rounded text-xs font-semibold border bg-dark-900/80 transition-all hover:opacity-80"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
