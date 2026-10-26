import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CellView, MatrixGrid } from './matrix-grid.component';
import { Unit } from '../model';

function makeUnit(name: string, hp: number): Unit {
  return {
    name,
    price: 100,
    hp,
    squadSize: 1,
    atk: 10,
    shotsPerVolley: 1,
    interval: 1,
    reach: 50,
    splash: 0,
    unitWidth: 2,
    speed: 10,
    flying: false,
    targetsAir: false,
    hpSquad: hp,
    damagePerAttack: 10,
  };
}

function units(): Unit[] {
  return [makeUnit('a', 10), makeUnit('b', 20), makeUnit('c', 30), makeUnit('d', 40)];
}

const cell: (a: Unit, d: Unit) => CellView = () => ({ text: '', background: null, tip: '' });

// "c" can never be engaged from this side, so its rows must sort last in both directions.
const sortValue: (row: Unit, pivot: Unit) => number | null = (row) =>
  row.name === 'c' ? null : row.hp;

function rowNames(fixture: ComponentFixture<MatrixGrid>): string[] {
  return fixture.debugElement
    .queryAll(By.css('tbody tr'))
    .map((row) => row.query(By.css('td')).nativeElement.textContent.trim());
}

function headers(fixture: ComponentFixture<MatrixGrid>): { nativeElement: HTMLElement }[] {
  return fixture.debugElement.queryAll(By.css('th[mat-sort-header]'));
}

function createGrid(): ComponentFixture<MatrixGrid> {
  const fixture = TestBed.createComponent(MatrixGrid);
  fixture.componentRef.setInput('columns', units());
  fixture.componentRef.setInput('cell', cell);
  fixture.componentRef.setInput('sortValue', sortValue);
  fixture.detectChanges();
  TestBed.flushEffects();
  return fixture;
}

describe('MatrixGrid', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MatrixGrid] }).compileComponents();
  });

  it('renders one row per unit in base order', () => {
    const fixture = createGrid();
    expect(rowNames(fixture)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts ascending by the clicked column, nulls last', () => {
    const fixture = createGrid();
    headers(fixture)[1].nativeElement.click();
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['a', 'b', 'd', 'c']);
  });

  it('toggles to descending on the second click, nulls still last', () => {
    const fixture = createGrid();
    headers(fixture)[1].nativeElement.click();
    fixture.detectChanges();
    headers(fixture)[1].nativeElement.click();
    fixture.detectChanges();
    expect(rowNames(fixture)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('keeps sorting state independent between grid instances', () => {
    const first = createGrid();
    const second = createGrid();

    headers(first)[1].nativeElement.click();
    first.detectChanges();

    expect(rowNames(first)).toEqual(['a', 'b', 'd', 'c']);
    expect(rowNames(second)).toEqual(['a', 'b', 'c', 'd']);
  });
});
