import { useEffect, useRef, useCallback } from 'react';
import { createChart, LineStyle, CrosshairMode } from 'lightweight-charts';

export default function Chart({ candles, smcData }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);
  const overlaysRef  = useRef([]); // keeps refs to extra series for cleanup

  // ── Create chart once ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width:  containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { color: '#0a0a0f' },
        textColor:  '#d1d4dc',
        fontSize:   12,
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif"
      },
      grid: {
        vertLines:  { color: '#1a1a27', style: LineStyle.Solid },
        horzLines:  { color: '#1a1a27', style: LineStyle.Solid }
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#4b5563', labelBackgroundColor: '#22223a' },
        horzLine: { color: '#4b5563', labelBackgroundColor: '#22223a' }
      },
      rightPriceScale: {
        borderColor: '#22223a',
        scaleMargins: { top: 0.1, bottom: 0.1 }
      },
      timeScale: {
        borderColor:      '#22223a',
        timeVisible:      true,
        secondsVisible:   false,
        fixLeftEdge:      false,
        fixRightEdge:     false
      },
      handleScroll:  true,
      handleScale:   true
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:          '#26a69a',
      downColor:        '#ef5350',
      borderUpColor:    '#26a69a',
      borderDownColor:  '#ef5350',
      wickUpColor:      '#26a69a',
      wickDownColor:    '#ef5350'
    });

    chartRef.current  = chart;
    seriesRef.current = candleSeries;

    // Resize observer
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

  // ── Update candle data ─────────────────────────────────────────────────
  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;

    const formatted = candles
      .map(c => ({
        time:  c.time,
        open:  parseFloat(c.open),
        high:  parseFloat(c.high),
        low:   parseFloat(c.low),
        close: parseFloat(c.close)
      }))
      .filter(c => c.time && !isNaN(c.open))
      .sort((a, b) => a.time - b.time);

    seriesRef.current.setData(formatted);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // ── Draw SMC overlays ──────────────────────────────────────────────────
  const clearOverlays = useCallback(() => {
    if (!chartRef.current) return;
    for (const s of overlaysRef.current) {
      try { chartRef.current.removeSeries(s); } catch (_) { /* already removed */ }
    }
    overlaysRef.current = [];
  }, []);

  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !smcData) return;

    clearOverlays();

    const chart        = chartRef.current;
    const candleSeries = seriesRef.current;
    const newOverlays  = [];

    // ── FVG Zones ──────────────────────────────────────────────────────
    const { fvgs = [], orderBlocks = [], bosChoch = [], liquidity = [], sessions = [] } = smcData;

    // Use price lines for FVG top & bottom
    for (const fvg of fvgs) {
      if (fvg.filled) continue;
      const color = fvg.type === 'bullish' ? '#3b82f6' : '#ef4444';
      const alpha = fvg.type === 'bullish' ? 'rgba(59,130,246,0.15)' : 'rgba(239,68,68,0.15)';

      candleSeries.createPriceLine({
        price:              fvg.top,
        color,
        lineWidth:          1,
        lineStyle:          LineStyle.Dashed,
        axisLabelVisible:   false,
        title:              fvg.type === 'bullish' ? 'FVG+' : 'FVG-'
      });
      candleSeries.createPriceLine({
        price:              fvg.bottom,
        color,
        lineWidth:          1,
        lineStyle:          LineStyle.Dashed,
        axisLabelVisible:   false,
        title:              ''
      });

      // Fill area using two line series + area overlay trick
      const topSeries = chart.addLineSeries({
        color:          alpha,
        lineWidth:      0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });
      const bottomSeries = chart.addLineSeries({
        color:          alpha,
        lineWidth:      0,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false
      });

      // Project the zone from its birth candle to the last candle
      const startTime = fvg.time;
      const endTime   = (candles && candles.length > 0)
        ? candles[candles.length - 1].time
        : fvg.time;

      topSeries.setData([
        { time: startTime, value: fvg.top },
        { time: endTime,   value: fvg.top }
      ]);
      bottomSeries.setData([
        { time: startTime, value: fvg.bottom },
        { time: endTime,   value: fvg.bottom }
      ]);

      newOverlays.push(topSeries, bottomSeries);
    }

    // ── Order Block Zones ──────────────────────────────────────────────
    for (const ob of orderBlocks) {
      if (ob.mitigated) continue;
      const color = ob.type === 'bullish' ? '#10b981' : '#f59e0b';

      candleSeries.createPriceLine({
        price:              ob.high,
        color,
        lineWidth:          2,
        lineStyle:          LineStyle.Solid,
        axisLabelVisible:   true,
        title:              ob.type === 'bullish' ? 'OB+' : 'OB-'
      });
      candleSeries.createPriceLine({
        price:              ob.low,
        color,
        lineWidth:          1,
        lineStyle:          LineStyle.Dashed,
        axisLabelVisible:   false,
        title:              ''
      });
    }

    // ── BOS / CHoCH ────────────────────────────────────────────────────
    for (const signal of bosChoch.slice(-10)) {
      const color =
        signal.type === 'BOS'
          ? (signal.direction === 'bullish' ? '#22c55e' : '#ef4444')
          : '#a855f7'; // CHoCH = purple

      candleSeries.createPriceLine({
        price:              signal.level,
        color,
        lineWidth:          1,
        lineStyle:          LineStyle.LargeDashed,
        axisLabelVisible:   true,
        title:              `${signal.type} ${signal.direction === 'bullish' ? '↑' : '↓'}`
      });
    }

    // ── Liquidity Levels ───────────────────────────────────────────────
    for (const liq of liquidity) {
      const color = liq.type === 'BSL' ? '#f97316' : '#a855f7';
      const title = liq.label || (liq.type === 'BSL' ? `BSL(${liq.touches})` : `SSL(${liq.touches})`);

      candleSeries.createPriceLine({
        price:              liq.level,
        color,
        lineWidth:          1,
        lineStyle:          LineStyle.Dotted,
        axisLabelVisible:   true,
        title
      });
    }

    overlaysRef.current = newOverlays;
  }, [smcData, candles, clearOverlays]);

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend */}
      <div className="absolute top-2 left-2 flex flex-wrap gap-2 pointer-events-none">
        <LegendItem color="#3b82f6"  label="FVG Bullish"  dash />
        <LegendItem color="#ef4444"  label="FVG Bearish"  dash />
        <LegendItem color="#10b981"  label="OB Demand"    />
        <LegendItem color="#f59e0b"  label="OB Supply"    />
        <LegendItem color="#22c55e"  label="BOS ↑"        />
        <LegendItem color="#ef4444"  label="BOS ↓"        />
        <LegendItem color="#a855f7"  label="CHoCH"        />
        <LegendItem color="#f97316"  label="BSL"          dot />
        <LegendItem color="#a855f7"  label="SSL"          dot />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dash = false, dot = false }) {
  const lineStyle = dot
    ? 'dotted'
    : dash
    ? 'dashed'
    : 'solid';

  return (
    <div className="flex items-center gap-1 bg-dark-800/80 px-2 py-0.5 rounded text-xs">
      <span
        style={{
          display:     'inline-block',
          width:       20,
          height:      2,
          background:  'transparent',
          borderTop:   `2px ${lineStyle} ${color}`
        }}
      />
      <span style={{ color: '#9ca3af' }}>{label}</span>
    </div>
  );
}
