import { Component, computed, inject, input } from '@angular/core';
import {
  ChartData,
  ChartDataset,
  ChartOptions,
  Plugin,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import type { FightSeriesData, FightTimeline } from '../fight-timeline.service';
import { FightTimelineService } from '../fight-timeline.service';
import { formatCount } from '../format';
import type { Unit } from '../model';
import { lineTooltips } from './line-tooltips';

interface FightDataset extends ChartDataset<'line'> {
  startHp: number;
}

interface AxisAnnotation {
  time: number;
  text: string;
  color: string;
}

@Component({
  selector: 'app-fight-chart',
  imports: [BaseChartDirective],
  providers: [
    provideCharts({
      registerables: [
        LineController,
        LineElement,
        PointElement,
        LinearScale,
        Tooltip,
        annotationPlugin,
      ],
    }),
  ],
  templateUrl: './fight-chart.component.html',
  styleUrl: './fight-chart.component.css',
})
export class FightChart {
  private readonly timelineService = inject(FightTimelineService);
  readonly a = input.required<Unit>();
  readonly d = input.required<Unit>();
  protected readonly axisAnnotations = computed(() => {
    const chart = this.chart();
    return chart ? this.buildAxisAnnotations(chart) : [];
  });
  protected readonly chartHeight = 360;
  protected readonly plugins: Plugin<'line'>[] = [
    lineTooltips,
    {
      id: 'fightAxisAnnotations',
      afterDraw: (chart) => this.drawAxisAnnotations(chart),
    },
  ];
  protected readonly formatCount = formatCount;

  protected readonly chart = computed(() =>
    this.timelineService.buildChart(this.a(), this.d()),
  );

  protected readonly winnerName = computed(() => {
    const chart = this.chart();
    if (!chart) {
      return '';
    }
    return chart.fight.winner === 'attacker' ? chart.a.name : chart.b.name;
  });

  protected readonly data = computed<ChartData<'line'>>(() => {
    const chart = this.chart();
    if (!chart) {
      return { datasets: [] };
    }
    return {
      datasets: [
        this.dataset(chart.a, '#2563eb'),
        this.dataset(chart.b, '#dc2626'),
      ],
    };
  });

  protected readonly options = computed<ChartOptions<'line'>>(() => {
    const chart = this.chart();
    if (!chart) {
      return {};
    }
    const annotations: Record<string, any> = {};
    if (chart.bothInRange !== null) {
      annotations['bothInRange'] = {
        type: 'line',
        xMin: chart.bothInRange,
        xMax: chart.bothInRange,
        borderColor: '#64748b',
        borderWidth: 1,
        borderDash: [4, 4],
      };
    }
    chart.a.modelDeathTimes?.forEach(([time], idx) => {
      annotations[`modelDeathA${idx}`] = {
        type: 'line',
        xMin: time,
        xMax: time,
        borderColor: '#2563eb',
        borderWidth: 1,
        borderDash: [2, 2],
      };
    });
    chart.b.modelDeathTimes?.forEach(([time], idx) => {
      annotations[`modelDeathB${idx}`] = {
        type: 'line',
        xMin: time,
        xMax: time,
        borderColor: '#dc2626',
        borderWidth: 1,
        borderDash: [2, 2],
      };
    });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: {
        padding: {
          bottom: 40,
          top: 10,
          left: 10,
          right: 10,
        },
      },
      interaction: { mode: 'index', intersect: false, axis: 'x' },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: () => undefined,
          mode: 'index',
          intersect: false,
          axis: 'x',
        },
        annotation: {
          clip: true,
          common: {
            drawTime: 'afterDatasetsDraw',
          },
          annotations,
        },
      },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: chart.duration,
          grid: { color: 'rgba(148, 163, 184, 0.25)' },
          border: { color: 'rgba(148, 163, 184, 0.5)' },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 5,
            callback: (value) => this.formatTime(Number(value)),
          },
        },
        y: {
          type: 'linear',
          beginAtZero: true,
          max: chart.maxHp,
          grid: { color: 'rgba(148, 163, 184, 0.25)' },
          border: { color: 'rgba(148, 163, 184, 0.5)' },
          ticks: {
            color: '#64748b',
            maxTicksLimit: 4,
            callback: (value) => formatCount(Number(value)),
          },
        },
      },
    };
  });

  private buildAxisAnnotations(chart: FightTimeline): AxisAnnotation[] {
    const annotations: AxisAnnotation[] = [];
    if (chart.bothInRange !== null) {
      annotations.push({
        time: chart.bothInRange,
        text: `both in range ${this.formatTime(chart.bothInRange)}`,
        color: '#64748b',
      });
    }

    let deadA = 0;
    chart.a.modelDeathTimes?.forEach(([time, count]) => {
      deadA += count;
      annotations.push({
        time,
        text: `(${chart.a.squadSize - deadA}/${chart.a.squadSize})`,
        color: '#2563eb',
      });
    });

    let deadB = 0;
    chart.b.modelDeathTimes?.forEach(([time, count]) => {
      deadB += count;
      annotations.push({
        time,
        text: `(${chart.b.squadSize - deadB}/${chart.b.squadSize})`,
        color: '#dc2626',
      });
    });

    annotations.sort((left, right) => left.time - right.time);
    const grouped: AxisAnnotation[] = [];
    for (const annotation of annotations) {
      const previous = grouped[grouped.length - 1];
      if (previous && Math.abs(previous.time - annotation.time) < 1e-9) {
        previous.text += ` · ${annotation.text}`;
        previous.color = '#334155';
      } else {
        grouped.push({ ...annotation });
      }
    }
    return grouped;
  }

  private drawAxisAnnotations(chart: Parameters<NonNullable<Plugin<'line'>['afterDraw']>>[0]): void {
    const annotations = this.axisAnnotations();
    if (annotations.length === 0) {
      return;
    }

    const ctx = chart.ctx;
    const xScale = chart.scales['x'];
    const font = '10px Roboto, sans-serif';
    const top = xScale.bottom + 8;
    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    annotations.forEach((annotation) => {
      const textWidth = ctx.measureText(annotation.text).width;
      const width = textWidth + 8;
      const height = 14;
      const centerX = xScale.getPixelForValue(annotation.time);
      const left = Math.max(2, Math.min(chart.width - width - 2, centerX - width / 2));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
      ctx.strokeStyle = annotation.color;
      ctx.lineWidth = 1;
      ctx.fillRect(left, top, width, height);
      ctx.strokeRect(left, top, width, height);
      ctx.fillStyle = annotation.color;
      ctx.fillText(annotation.text, left + width / 2, top + height / 2);
    });

    ctx.restore();
  }

  private dataset(series: FightSeriesData, color: string): FightDataset {
    return {
      label: series.name,
      data: series.points.map(({ t, hp }) => ({ x: t, y: hp })),
      startHp: series.startHp,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 0,
      stepped: 'before',
    };
  }

  protected seconds(value: number): string {
    return `${value.toFixed(2)}s`;
  }

  private formatTime(value: number): string {
    if (!Number.isFinite(value)) {
      return '--';
    }
    if (value === 0) {
      return '0s';
    }
    return value >= 10 ? `${value.toFixed(1)}s` : `${value.toFixed(2)}s`;
  }
}
