import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { readFileSync } from 'node:fs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Matchup } from './matchup.component';
import { parseCsv, buildUnits, DEFAULT_SKIP } from '../unit-stats';
import { canAttack, timeToKill } from '../matchup';
import { Unit } from '../model';

const CSV_URL = 'Unit%20Stats.csv';

function loadUnits(): Unit[] {
  const csv = readFileSync('public/Unit Stats.csv', 'utf8');
  const skip = new Set(DEFAULT_SKIP.map((name) => name.trim().toLowerCase()));
  return buildUnits(parseCsv(csv)).filter(
    (unit) => canAttack(unit) && !skip.has(unit.name.toLowerCase()),
  );
}

function gridOf(fixture: ComponentFixture<Matchup>, index: number) {
  const grids = fixture.debugElement.queryAll(By.css('app-matrix-grid'));
  return grids[index];
}

function clickHeader(
  fixture: ComponentFixture<Matchup>,
  gridIndex: number,
  headerIndex: number,
): void {
  const headers = gridOf(fixture, gridIndex).queryAll(By.css('th[mat-sort-header]'));
  headers[headerIndex].nativeElement.click();
  fixture.detectChanges();
}

function readRows(fixture: ComponentFixture<Matchup>, gridIndex: number): string[][] {
  return gridOf(fixture, gridIndex)
    .queryAll(By.css('tbody tr'))
    .map((row) => row.queryAll(By.css('td')).map((cell) => cell.nativeElement.textContent.trim()));
}

function toNumber(text: string): number | null {
  if (text === '--') {
    return null;
  }
  return text.startsWith('>') ? Number.POSITIVE_INFINITY : Number.parseFloat(text);
}

describe('Matchup (full flow with real CSV)', () => {
  let fixture: ComponentFixture<Matchup>;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Matchup],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Matchup);
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    TestBed.flushEffects();
    http.expectOne(CSV_URL).flush(readFileSync('public/Unit Stats.csv', 'utf8'));
    fixture.detectChanges();
    TestBed.flushEffects();
    fixture.detectChanges();
  });

  it('renders both matrices from the CSV', () => {
    const grids = fixture.debugElement.queryAll(By.css('app-matrix-grid'));
    expect(grids.length).toBe(2);
    const rowLabels = readRows(fixture, 0).map((cells) => cells[0]);
    expect(rowLabels.length).toBe(loadUnits().length);
  });

  it('TTK grid orders rows by raw timeToKill of the clicked column', () => {
    const units = loadUnits();
    for (const headerIndex of [0, 7, 15, 24, 31]) {
      const pivot = units[headerIndex];
      clickHeader(fixture, 0, headerIndex);

      const expected = [...units].sort((a, b) => {
        const av = timeToKill(a, pivot);
        const bv = timeToKill(b, pivot);
        if (av === null || bv === null) {
          return av === bv ? 0 : av === null ? 1 : -1;
        }
        return av - bv;
      });
      const rows = readRows(fixture, 0);
      expect(
        rows.map((cells) => cells[0]),
        `rows sorted by ${pivot.name}`,
      ).toEqual(expected.map((unit) => unit.name));

      const column = rows.map((cells) => toNumber(cells[headerIndex + 1]));
      for (let i = 1; i < column.length; i++) {
        const previous = column[i - 1];
        const current = column[i];
        const label = `${pivot.name}: ${rows.map((cells) => cells[headerIndex + 1]).join(', ')}`;
        if (current === null) {
          expect(previous, label).toBeNull();
        } else if (previous !== null) {
          expect(current, label).toBeGreaterThanOrEqual(previous);
        }
      }
    }
  });

  it('TTK grid toggles to descending and keeps cannot-engage cells last', () => {
    const units = loadUnits();
    const pivot = units[4];
    clickHeader(fixture, 0, 4);
    clickHeader(fixture, 0, 4);

    const nonNull = units.filter((unit) => timeToKill(unit, pivot) !== null);
    // Stable descending comparator, exactly as MatrixGrid applies it (ties keep base order).
    const expected = [...nonNull]
      .sort((a, b) => (timeToKill(b, pivot) as number) - (timeToKill(a, pivot) as number))
      .map((unit) => unit.name);
    const nulls = units.filter((unit) => timeToKill(unit, pivot) === null).map((unit) => unit.name);

    const rows = readRows(fixture, 0);
    expect(rows.map((cells) => cells[0])).toEqual([...expected, ...nulls]);
  });
});
