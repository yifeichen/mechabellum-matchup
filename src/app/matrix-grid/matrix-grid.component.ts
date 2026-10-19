import { Component, computed, effect, input, viewChild } from '@angular/core';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { Unit } from '../model';

export interface CellView {
  text: string;
  background: string | null;
  tip: string;
}

@Component({
  selector: 'app-matrix-grid',
  imports: [MatTableModule, MatSortModule],
  templateUrl: './matrix-grid.component.html',
  styleUrl: './matrix-grid.component.css',
})
export class MatrixGrid {
  readonly columns = input.required<Unit[]>();
  readonly cell = input.required<(a: Unit, d: Unit) => CellView>();
  readonly sortValue = input<((row: Unit, pivot: Unit) => number | null) | null>(null);

  protected readonly columnNames = computed<string[]>(() => [
    'unit',
    ...this.columns().map((unit) => unit.name),
  ]);

  protected readonly dataSource = new MatTableDataSource<Unit>();

  private readonly sort = viewChild<MatSort>(MatSort);

  constructor() {
    this.dataSource.sortData = (data, sort) => this.sortRows(data, sort);

    effect(() => {
      this.dataSource.data = this.columns();
    });

    effect(() => {
      const sort = this.sort();
      if (sort && this.dataSource.sort !== sort) {
        this.dataSource.sort = sort;
      }
    });
  }

  // Rows are ordered by sortValue against the clicked column's unit (the pivot);
  // "cannot engage" rows (null) always sort last, in either direction.
  private sortRows(data: Unit[], sort: MatSort): Unit[] {
    const value = this.sortValue();
    if (!sort.active || sort.direction === '' || !value) {
      return data;
    }
    const pivot = this.columns().find((unit) => unit.name === sort.active);
    if (!pivot) {
      return data;
    }
    const dir = sort.direction === 'desc' ? -1 : 1;
    return [...data].sort((a, b) => {
      const av = value(a, pivot);
      const bv = value(b, pivot);
      if (av === null || bv === null) {
        return av === bv ? 0 : av === null ? 1 : -1;
      }
      return (av - bv) * dir;
    });
  }

  protected headerTip(defender: Unit): string {
    return `${defender.name} · ${defender.squadSize} models × ${defender.hp} HP${
      defender.flying ? ' · flying' : ''
    }`;
  }
}
