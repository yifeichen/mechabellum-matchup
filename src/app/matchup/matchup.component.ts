import { Component, computed, effect, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { Row, Unit } from '../model';
import { DEFAULT_SKIP, buildUnits, missingFields } from '../unit-stats';
import { canAttack } from '../matchup';
import { MatchupService } from '../matchup.service';
import { TtkMatrix } from '../ttk-matrix/ttk-matrix.component';
import { FightMatrix } from '../fight-matrix/fight-matrix.component';
import { DetailAnalysis } from '../detail-analysis/detail-analysis.component';

@Component({
  selector: 'app-matchup',
  imports: [DetailAnalysis, MatCardModule, TtkMatrix, FightMatrix],
  templateUrl: './matchup.component.html',
  styleUrl: './matchup.component.css',
})
export class Matchup {
  private readonly service = inject(MatchupService);

  protected readonly rows = signal<Row[] | null>(null);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect((onCleanup) => {
      const subscription = this.service.rows.subscribe({
        next: (rows) => {
          this.error.set(null);
          this.rows.set(rows);
        },
        error: () => this.error.set('could not load "Unit Stats.csv"'),
      });
      onCleanup(() => subscription.unsubscribe());
    });

    effect(() => {
      const report = this.missing();
      if (report.length > 0) {
        console.warn(
          'missing values in "Unit Stats.csv":',
          report.map((entry) => `${entry.name}: ${entry.fields.join(', ')}`).join('; '),
        );
      }
    });
  }

  protected readonly missing = computed<{ name: string; fields: string[] }[]>(() => {
    const rows = this.rows();
    if (!rows) {
      return [];
    }
    return rows
      .map((row) => ({ name: (row['Name'] ?? '').trim(), fields: missingFields(row) }))
      .filter((entry) => entry.name !== '' && entry.fields.length > 0);
  });

  protected readonly combat = computed<Unit[]>(() => {
    const rows = this.rows();
    if (!rows) {
      return [];
    }
    const skip = new Set(DEFAULT_SKIP.map((name) => name.trim().toLowerCase()));
    return buildUnits(rows).filter((unit) => canAttack(unit) && !skip.has(unit.name.toLowerCase()));
  });
}
