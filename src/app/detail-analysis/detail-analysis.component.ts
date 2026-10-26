import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { Unit } from '../model';
import { survivingHp } from '../matchup';
import { FightChart } from '../fight-chart/fight-chart.component';
import { DetailSide } from '../detail-side/detail-side.component';

@Component({
  selector: 'app-detail-analysis',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatSelectModule,
    FightChart,
    DetailSide,
  ],
  templateUrl: './detail-analysis.component.html',
  styleUrl: './detail-analysis.component.css',
})
export class DetailAnalysis {
  readonly units = input.required<Unit[]>();

  protected readonly open = signal(false);
  protected readonly modifiedLeft = signal<Unit | null>(null);
  protected readonly modifiedRight = signal<Unit | null>(null);

  protected readonly baseLeft = computed<Unit | null>(() => {
    const units = this.units();
    const current = this.modifiedLeft();
    if (current && units.some((unit) => unit.name === current.name)) {
      return current;
    }
    return units[0] ?? null;
  });

  protected readonly baseRight = computed<Unit | null>(() => {
    const units = this.units();
    const current = this.modifiedRight();
    if (current && units.some((unit) => unit.name === current.name)) {
      return current;
    }
    const leftName = this.baseLeft()?.name;
    return units.find((unit) => unit.name !== leftName) ?? units[0] ?? null;
  });

  protected readonly selectedLeft = signal<Unit | null>(null);
  protected readonly selectedRight = signal<Unit | null>(null);

  constructor() {
    // keep signals in sync when base changes
    setInterval(() => {
      const bl = this.baseLeft();
      const br = this.baseRight();
      if (bl && this.selectedLeft() !== bl) {
        this.selectedLeft.set({ ...bl });
      }
      if (br && this.selectedRight() !== br) {
        this.selectedRight.set({ ...br });
      }
    }, 0);
  }

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
      fight,
    };
  });

  protected select(side: 'left' | 'right', name: string): void {
    const found = this.units().find((unit) => unit.name === name);
    if (found) {
      const copy = { ...found };
      copy.hpSquad = copy.hp * copy.squadSize;
      copy.damagePerAttack = copy.atk * copy.shotsPerVolley;
      if (side === 'left') {
        this.modifiedLeft.set(copy);
        this.selectedLeft.set(copy);
      } else {
        this.modifiedRight.set(copy);
        this.selectedRight.set(copy);
      }
    }
  }

  protected onModified(side: 'left' | 'right', unit: Unit): void {
    const copy = { ...unit };
    copy.hpSquad = copy.hp * copy.squadSize;
    copy.damagePerAttack = copy.atk * copy.shotsPerVolley;
    if (side === 'left') {
      this.selectedLeft.set(copy);
    } else {
      this.selectedRight.set(copy);
    }
  }

}
