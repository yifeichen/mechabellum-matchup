import { Component, computed, inject, input } from '@angular/core';
import {
  ChartData,
  ChartDataset,
  ChartOptions,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { BaseChartDirective, provideCharts } from 'ng2-charts';
import type { FightSeriesData } from '../fight-timeline';
import { FightTimelineService } from '../fight-timeline';
import { formatCount } from '../format';
import type { FightResult } from '../matchup';
import type { Unit } from '../model';
import { lineTooltips } from './line-tooltips';

interface FightDataset extends ChartDataset<'line'> {
  startHp: number;
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
  private readonly timeline = inject(FightTimelineService);
  readonly a = input.required<Unit>();
  readonly d = input.required<Unit>();
  readonly fight = input.required<FightResult>();
  protected readonly plugins = [lineTooltips];
  protected readonly formatCount = formatCount;

  protected readonly chart = computed(() =>
    this.timeline.buildChart(this.a(), this.d(), this.fight()),
  );

  protected readonly winnerName = computed(() =>
    this.fight().winner === 'attacker' ? this.a().name : this.d().name,
  );

  protected readonly data = computed<ChartData<'line'>>(() => {
    const chart = this.chart();
    if (!chart) {
      return { datasets: [] };
    }
    const times = this.timeline.unionTimes(chart.a.points, chart.b.points);
    return {
      datasets: [this.dataset(chart.a, times, '#2563eb'), this.dataset(chart.b, times, '#dc2626')],
    };
  });

  protected readonly options = computed<ChartOptions<'line'>>(() => {
    const chart = this.chart();
    if (!chart) {
      return {};
    }
    const bothInRange = chart.bothInRange;
    const annotations: Record<string, any> = {};
    if (bothInRange !== null) {
      annotations['bothInRange'] = {
        type: 'line',
        xMin: bothInRange,
        xMax: bothInRange,
        borderColor: '#64748b',
        borderWidth: 1,
        borderDash: [4, 4],
        label: {
          display: true,
          content: `both in range ${this.formatTime(bothInRange)}`,
          position: 'start',
          yAdjust: 52,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          color: '#475569',
          font: { size: 11 },
          padding: 4,
        },
      };
    }
    const modelDeathTimesA = chart.a.modelDeathTimes ?? [];
    modelDeathTimesA.forEach((t, idx) => {
      const remaining = this.a().squadSize - (idx + 1);
      const total = this.a().squadSize;
      annotations[`modelDeathA${idx}`] = {
        type: 'line',
        xMin: t,
        xMax: t,
        borderColor: '#2563eb',
        borderWidth: 1,
        borderDash: [2, 2],
        label: {
          display: true,
          content: `(${remaining}/${total})`,
          position: 'end',
          yAdjust: 15 + idx * 12,
          xAdjust: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          color: '#2563eb',
          font: { size: 10 },
          padding: 3,
        },
      };
    });
    const modelDeathTimesB = chart.b.modelDeathTimes ?? [];
    modelDeathTimesB.forEach((t, idx) => {
      const remaining = this.d().squadSize - (idx + 1);
      const total = this.d().squadSize;
      annotations[`modelDeathB${idx}`] = {
        type: 'line',
        xMin: t,
        xMax: t,
        borderColor: '#dc2626',
        borderWidth: 1,
        borderDash: [2, 2],
        label: {
          display: true,
          content: `(${remaining}/${total})`,
          position: 'end',
          yAdjust: 30 + idx * 12,
          xAdjust: 2,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          color: '#dc2626',
          font: { size: 10 },
          padding: 3,
        },
      };
    });
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { bottom: 60, top: 10, left: 10, right: 10 } },
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

  private dataset(series: FightSeriesData, times: readonly number[], color: string): FightDataset {
    return {
      label: series.name,
      data: times.map((t) => ({ x: t, y: this.timeline.hpAt(series.points, t) })),
      startHp: series.startHp,
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 0,
      stepped: 'after',
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
