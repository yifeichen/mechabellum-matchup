import type { ChartDataset, Plugin } from 'chart.js';
import { formatCount } from '../format';

interface SeriesDataset extends ChartDataset<'line'> {
  startHp?: number;
}

interface TooltipEntry {
  x: number;
  y: number;
  title: string;
  value: string;
  color: string;
}

interface TooltipBox extends TooltipEntry {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PADDING_X = 8;
const PADDING_Y = 5;
const LINE_HEIGHT = 16;
const GAP = 12;
const RADIUS = 4;
const BACKGROUND = '#1f2937';
const TEXT = '#f9fafb';

export const lineTooltips: Plugin<'line'> = {
  id: 'lineTooltips',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements() ?? [];
    if (active.length === 0) {
      return;
    }

    const entries = active
      .map((item): TooltipEntry | null => {
        const context = (
          item.element as {
            $context?: { raw?: { x: number; y: number } };
          }
        ).$context;
        const raw = context?.raw;
        const dataset = chart.data.datasets[item.datasetIndex] as SeriesDataset | undefined;
        if (!raw || !dataset) {
          return null;
        }
        const startHp = dataset.startHp ?? 0;
        const percent = startHp > 0 ? (raw.y / startHp) * 100 : 0;
        return {
          x: raw.x,
          y: raw.y,
          title: `${dataset.label ?? ''} · ${formatTime(raw.x)}`,
          value: `${formatCount(raw.y)} HP (${percent.toFixed(0)}%)`,
          color: typeof dataset.borderColor === 'string' ? dataset.borderColor : '#64748b',
        };
      })
      .filter((entry): entry is TooltipEntry => entry !== null)
      .sort(
        (left, right) =>
          chart.scales['y'].getPixelForValue(left.y) - chart.scales['y'].getPixelForValue(right.y),
      );

    const ctx = chart.ctx;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const boxes: TooltipBox[] = [];
    for (const entry of entries) {
      ctx.font = '600 12px Roboto, sans-serif';
      const titleWidth = ctx.measureText(entry.title).width;
      ctx.font = '12px Roboto, sans-serif';
      const valueWidth = ctx.measureText(entry.value).width;
      const width = Math.ceil(Math.max(titleWidth, valueWidth)) + PADDING_X * 2;
      const height = LINE_HEIGHT * 2 + PADDING_Y * 2;
      const pointX = chart.scales['x'].getPixelForValue(entry.x);
      const pointY = chart.scales['y'].getPixelForValue(entry.y);
      let left = pointX + GAP;
      if (left + width > chart.chartArea.right - 4) {
        left = pointX - GAP - width;
      }
      left = clamp(left, chart.chartArea.left + 4, chart.chartArea.right - width - 4);
      let top = clamp(
        pointY - height / 2,
        chart.chartArea.top + 4,
        chart.chartArea.bottom - height - 4,
      );

      for (const box of boxes) {
        if (overlaps(left, top, width, height, box)) {
          top = box.top + box.height + 4;
          if (top + height > chart.chartArea.bottom - 4) {
            top = box.top - height - 4;
          }
        }
      }
      top = clamp(top, chart.chartArea.top + 4, chart.chartArea.bottom - height - 4);

      const box = { ...entry, left, top, width, height };
      boxes.push(box);
      drawBox(ctx, box);
    }

    ctx.restore();
  },
};

function drawBox(ctx: CanvasRenderingContext2D, box: TooltipBox): void {
  ctx.beginPath();
  ctx.roundRect(box.left, box.top, box.width, box.height, RADIUS);
  ctx.fillStyle = BACKGROUND;
  ctx.fill();
  ctx.strokeStyle = box.color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = TEXT;
  ctx.font = '600 12px Roboto, sans-serif';
  ctx.fillText(box.title, box.left + PADDING_X, box.top + PADDING_Y + LINE_HEIGHT / 2);
  ctx.font = '12px Roboto, sans-serif';
  ctx.fillText(box.value, box.left + PADDING_X, box.top + PADDING_Y + LINE_HEIGHT * 1.5);
}

function overlaps(
  left: number,
  top: number,
  width: number,
  height: number,
  box: TooltipBox,
): boolean {
  return (
    left < box.left + box.width &&
    left + width > box.left &&
    top < box.top + box.height &&
    top + height > box.top
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTime(value: number): string {
  if (!Number.isFinite(value)) {
    return '--';
  }
  if (value === 0) {
    return '0s';
  }
  return value >= 10 ? `${value.toFixed(1)}s` : `${value.toFixed(2)}s`;
}
