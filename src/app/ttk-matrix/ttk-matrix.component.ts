import { Component, computed, input } from '@angular/core';
import { MatChipsModule } from '@angular/material/chips';
import { Unit } from '../model';
import { CellView, MatrixGrid } from '../matrix-grid/matrix-grid.component';
import { attacksPerModel, hitsToKill, splashTargets, ticksToKill, timeToKill } from '../matchup';
import { formatCount, formatRatio } from '../format';

// Colour sweep matches the fight matrix: constant saturation, hue interpolated
// red (slowest cell) -> yellow (mid rank) -> green (fastest cell), with the
// same narrow lightness band. `distance` is a rank scale over all cells
// (-1 fastest .. +1 slowest), so the full range is used however tightly the
// raw values cluster around the median.
function colorForDistance(distance: number): string {
  const fraction = Math.min(1, Math.max(0, (1 - distance) / 2));
  const hue = 0 + 145 * fraction;
  const saturation = 50;
  const lightness = 80 - 12 * (1 - fraction);
  return `hsl(${hue.toFixed(0)} ${saturation}% ${lightness.toFixed(0)}%)`;
}

@Component({
  selector: 'app-ttk-matrix',
  imports: [MatChipsModule, MatrixGrid],
  templateUrl: './ttk-matrix.component.html',
  styleUrl: './ttk-matrix.component.css',
})
export class TtkMatrix {
  readonly units = input.required<Unit[]>();

  protected readonly sortValue = timeToKill;

  protected readonly cap = 99;

  protected readonly colorScale = computed<{ median: number; sorted: number[] }>(() => {
    const units = this.units();
    const values: number[] = [];
    for (const a of units) {
      for (const d of units) {
        const ttk = timeToKill(a, d);
        if (ttk !== null) {
          values.push(this.normalized(ttk, a, d));
        }
      }
    }
    if (values.length === 0) {
      return { median: 0, sorted: [] };
    }
    const sorted = [...values].sort((a, b) => a - b);
    const middle = sorted.length >> 1;
    const median =
      sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return { median, sorted };
  });

  protected readonly legend = computed(() => {
    const { median, sorted } = this.colorScale();
    const last = sorted.length - 1;
    return [-1, -0.5, 0, 0.5, 1].map((distance) => {
      const index = Math.min(last, Math.max(0, Math.round(((distance + 1) / 2) * last)));
      const value = last >= 0 ? sorted[index] : median;
      return {
        distance,
        color: colorForDistance(distance),
        ratio: median > 0 ? value / median : 1,
      };
    });
  });

  protected readonly cellFn = (a: Unit, d: Unit): CellView => ({
    text: this.secondsText(a, d),
    background: this.colorAt(a, d),
    tip: this.tip(a, d),
  });

  protected readonly formatRatio = formatRatio;

  private normalized(ttk: number, attacker: Unit, defender: Unit): number {
    return defender.price > 0 ? (ttk * attacker.price) / defender.price : ttk;
  }

  // Rank scale over the sorted values: -1 = fastest cell, 0 = median rank,
  // +1 = slowest. Tie groups share their midpoint rank, so equal values keep
  // one colour.
  private distance(value: number): number {
    const sorted = this.colorScale().sorted;
    const count = sorted.length;
    if (count < 2) {
      return 0;
    }
    let lo = 0;
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const first = lo;
    lo = 0;
    hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] <= value) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    const rank = Math.min(1, Math.max(0, (first + lo - 1) / 2 / (count - 1)));
    return 2 * (rank - 0.5);
  }

  protected secondsText(attacker: Unit, defender: Unit): string {
    const ttk = timeToKill(attacker, defender);
    if (ttk === null) {
      return '--';
    }
    return ttk > this.cap ? `>${this.cap}` : ttk.toFixed(2);
  }

  protected colorAt(attacker: Unit, defender: Unit): string | null {
    const ttk = timeToKill(attacker, defender);
    if (ttk === null) {
      return null;
    }
    return colorForDistance(this.distance(this.normalized(ttk, attacker, defender)));
  }

  protected tip(attacker: Unit, defender: Unit): string {
    const ttk = timeToKill(attacker, defender);
    if (ttk === null) {
      return 'cannot engage';
    }
    const targets = splashTargets(attacker, defender);
    const perModel = attacksPerModel(attacker, defender);
    const hits = hitsToKill(attacker, defender);
    const ticks = ticksToKill(attacker, defender);
    const slots = attacker.squadSize * targets;
    const { median } = this.colorScale();
    const ratio = median > 0 ? this.normalized(ttk, attacker, defender) / median : 1;
    return (
      `${attacker.name} vs ${defender.name}: ${formatCount(perModel)} hits per model x ` +
      `${formatCount(defender.squadSize)} models = ${formatCount(hits)} hit-slots; each ` +
      `attack covers ${targets} model(s) (splash ${attacker.splash} m vs width ` +
      `${defender.unitWidth} m), so ${attacker.squadSize} x ${targets} = ${slots} slots/tick = ` +
      `${ticks} ticks x ${attacker.interval}s = ${ttk.toFixed(2)}s ` +
      `(${formatCount(attacker.damagePerAttack)} damage per attack); price-normalised ` +
      `${formatRatio(ratio)} the matrix median`
    );
  }
}
