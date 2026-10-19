import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Unit } from '../model';
import {
  attacksPerModel,
  canAttack,
  canEngage,
  hitsToKill,
  splashTargets,
  survivingHp,
  ticksToKill,
  timeToKill,
} from '../matchup';
import { formatCount } from '../format';

type NumberField =
  | 'price'
  | 'hp'
  | 'squadSize'
  | 'atk'
  | 'volley'
  | 'interval'
  | 'reach'
  | 'splash'
  | 'unitWidth'
  | 'speed';

type BoolField = 'flying' | 'targetsAir';

const NUMBER_FIELDS: { key: NumberField; label: string }[] = [
  { key: 'price', label: 'price' },
  { key: 'hp', label: 'HP per model' },
  { key: 'squadSize', label: 'squad size' },
  { key: 'atk', label: 'attack value' },
  { key: 'volley', label: 'volley' },
  { key: 'interval', label: 'attack interval (s)' },
  { key: 'reach', label: 'range (m)' },
  { key: 'splash', label: 'splash (m)' },
  { key: 'unitWidth', label: 'unit width (m)' },
  { key: 'speed', label: 'speed (m/s)' },
];

interface TtkDetail {
  attacker: Unit;
  defender: Unit;
  blocked: string | null;
  perModel: number | null;
  hits: number | null;
  targets: number;
  slots: number;
  ticks: number | null;
  ttk: number | null;
}

@Component({
  selector: 'app-detail-analysis',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './detail-analysis.component.html',
  styleUrl: './detail-analysis.component.css',
})
export class DetailAnalysis {
  readonly units = input.required<Unit[]>();

  protected readonly open = signal(false);
  protected readonly editsLeft = signal<Unit | null>(null);
  protected readonly editsRight = signal<Unit | null>(null);
  protected readonly fields = NUMBER_FIELDS;

  protected readonly formatCount = formatCount;

  protected readonly selectedLeft = computed<Unit | null>(() => {
    const units = this.units();
    const edits = this.editsLeft();
    if (edits && units.some((unit) => unit.name === edits.name)) {
      return edits;
    }
    return units[0] ?? null;
  });

  protected readonly selectedRight = computed<Unit | null>(() => {
    const units = this.units();
    const edits = this.editsRight();
    if (edits && units.some((unit) => unit.name === edits.name)) {
      return edits;
    }
    const leftName = this.selectedLeft()?.name;
    return units.find((unit) => unit.name !== leftName) ?? units[0] ?? null;
  });

  protected readonly report = computed(() => {
    const a = this.selectedLeft();
    const d = this.selectedRight();
    if (!a || !d || a.name === d.name) {
      return null;
    }
    const fight = survivingHp(a, d);
    return {
      a,
      d,
      aToB: this.ttkDetail(a, d),
      bToA: this.ttkDetail(d, a),
      fight,
      winner: fight && fight.winner !== 'draw' ? (fight.winner === 'attacker' ? a : d) : null,
      loser: fight && fight.winner !== 'draw' ? (fight.winner === 'attacker' ? d : a) : null,
      shorter: a.reach < d.reach ? a : d,
      gap: Math.abs(a.reach - d.reach),
    };
  });

  protected select(side: 'left' | 'right', name: string): void {
    const found = this.units().find((unit) => unit.name === name);
    if (found) {
      (side === 'left' ? this.editsLeft : this.editsRight).set({ ...found });
    }
  }

  protected setNumber(side: 'left' | 'right', key: NumberField, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    this.update(side, (unit) => ({ ...unit, [key]: value }));
  }

  protected setBool(side: 'left' | 'right', key: BoolField, checked: boolean): void {
    this.update(side, (unit) => ({ ...unit, [key]: checked }));
  }

  protected reset(side: 'left' | 'right'): void {
    const current = side === 'left' ? this.editsLeft() : this.editsRight();
    const source = this.units().find((unit) => unit.name === current?.name);
    if (source) {
      (side === 'left' ? this.editsLeft : this.editsRight).set({ ...source });
    }
  }

  protected seconds(value: number | null): string {
    if (value === null) {
      return '--';
    }
    return Number.isFinite(value) ? `${value.toFixed(2)}s` : 'never';
  }

  protected pct(value: number, max: number): number {
    return max > 0 ? Math.round((value / max) * 100) : 0;
  }

  private update(side: 'left' | 'right', change: (unit: Unit) => Unit): void {
    const current = side === 'left' ? this.selectedLeft() : this.selectedRight();
    if (!current) {
      return;
    }
    const next = change({ ...current });
    next.hpSquad = next.hp * next.squadSize;
    next.damagePerAttack = next.atk * next.volley;
    (side === 'left' ? this.editsLeft : this.editsRight).set(next);
  }

  private ttkDetail(attacker: Unit, defender: Unit): TtkDetail {
    const targets = splashTargets(attacker, defender);
    return {
      attacker,
      defender,
      blocked: this.blockedReason(attacker, defender),
      perModel: attacksPerModel(attacker, defender),
      hits: hitsToKill(attacker, defender),
      targets,
      slots: attacker.squadSize * targets,
      ticks: ticksToKill(attacker, defender),
      ttk: timeToKill(attacker, defender),
    };
  }

  private blockedReason(attacker: Unit, defender: Unit): string | null {
    if (!canAttack(attacker)) {
      return `${attacker.name} cannot attack: interval or damage is zero`;
    }
    if (!canEngage(attacker, defender)) {
      return `${attacker.name} cannot hit flying units`;
    }
    if (defender.hp <= 0) {
      return `${defender.name} has no HP`;
    }
    return null;
  }
}
