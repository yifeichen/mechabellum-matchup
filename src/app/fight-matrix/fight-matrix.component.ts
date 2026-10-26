import { Component, computed, input } from '@angular/core';
import { Unit } from '../model';
import { CellView, MatrixGrid } from '../matrix-grid/matrix-grid.component';
import { FightResult, survivingHp } from '../matchup';
import { formatCount } from '../format';

@Component({
  selector: 'app-fight-matrix',
  imports: [MatrixGrid],
  templateUrl: './fight-matrix.component.html',
  styleUrl: './fight-matrix.component.css',
})
export class FightMatrix {
  readonly units = input.required<Unit[]>();

  protected readonly sortValue = (a: Unit, d: Unit): number | null =>
    this.fight(a, d)?.hpLeft ?? null;

  protected readonly fights = computed<Map<string, FightResult | null>>(() => {
    const units = this.units();
    const map = new Map<string, FightResult | null>();
    for (const a of units) {
      for (const d of units) {
        map.set(`${a.name}\u0000${d.name}`, survivingHp(a, d));
      }
    }
    return map;
  });

  protected readonly cellFn = (a: Unit, d: Unit): CellView => ({
    text: this.fightHpText(a, d),
    background: this.fightColor(a, d),
    tip: this.fightTip(a, d),
  });

  protected fight(a: Unit, d: Unit): FightResult | null {
    return this.fights().get(`${a.name}\u0000${d.name}`) ?? null;
  }

  protected fightHpText(a: Unit, d: Unit): string {
    const result = this.fight(a, d);
    if (!result) {
      return '--';
    }
    return Math.round(result.hpLeft).toLocaleString('en-US');
  }

  // Colour by the fraction of the winner's own squad HP that survives.
  protected fightColor(a: Unit, d: Unit): string | null {
    const result = this.fight(a, d);
    if (!result) {
      return null;
    }
    const winnerMax =
      result.winner === 'attacker' ? a.hpSquad : result.winner === 'defender' ? d.hpSquad : 0;
    if (winnerMax <= 0) {
      return null;
    }
    const fraction = Math.min(1, result.hpLeft / winnerMax);
    const hue = 0 + 145 * fraction;
    const saturation = 50;
    const lightness = 80 - 12 * (1 - fraction);
    if (result.winner === 'draw') {
      return `hsl(220 12% 55%)`;
    }
    return `hsl(${hue.toFixed(0)} ${saturation}% ${lightness.toFixed(0)}%)`;
  }

  protected fightTip(a: Unit, d: Unit): string {
    const result = this.fight(a, d);
    if (!result) {
      return 'cannot engage';
    }
    if (!Number.isFinite(result.closingSeconds)) {
      return `${a.name} vs ${d.name}: range gap never closes, winner stands off indefinitely`;
    }
    const winner = result.winner === 'attacker' ? a : result.winner === 'defender' ? d : null;
    const winnerMax = winner ? winner.hpSquad : 0;
    const percent = winnerMax > 0 ? ((result.hpLeft / winnerMax) * 100).toFixed(0) : '0';
    const fmt = (value: number) => (Number.isFinite(value) ? `${value.toFixed(2)}s` : 'never');
    return (
      `${a.name} (range ${a.range} m, speed ${a.speed}) vs ${d.name} (range ${d.range} m, ` +
      `speed ${d.speed}): effective TTK ${fmt(result.effectiveAttacker)} vs ` +
      `${fmt(result.effectiveDefender)} (${result.closingSeconds.toFixed(2)}s approach for the ` +
      `shorter-range unit); ` +
      (result.winner === 'draw'
        ? 'both squads go down at the same moment'
        : `${result.winner} wins with ${formatCount(result.hpLeft)} HP left ` +
          `(${percent}% of its ${formatCount(winnerMax)} squad HP)`)
    );
  }
}
