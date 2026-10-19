import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Unit } from '../model';
import { timeToKill } from '../matchup';
import { TtkMatrix } from './ttk-matrix.component';

function makeUnit(name: string, patch: Partial<Unit>): Unit {
  return {
    name,
    price: 100,
    hp: 100,
    squadSize: 1,
    atk: 10,
    volley: 1,
    interval: 1,
    reach: 50,
    splash: 0,
    unitWidth: 2,
    speed: 10,
    flying: false,
    targetsAir: false,
    hpSquad: 100,
    damagePerAttack: 10,
    ...patch,
  };
}

// Different intervals/squads so each defender column yields a distinct row order.
function units(): Unit[] {
  return [
    makeUnit('fast', { interval: 1, damagePerAttack: 10, hp: 100, squadSize: 1 }),
    makeUnit('slow', { interval: 3, damagePerAttack: 10, hp: 100, squadSize: 1 }),
    makeUnit('swarm', { interval: 1, damagePerAttack: 10, hp: 50, squadSize: 4 }),
    makeUnit('thick', { interval: 2, damagePerAttack: 25, hp: 500, squadSize: 6 }),
  ];
}

function rowNames(fixture: ComponentFixture<TtkMatrix>): string[] {
  return fixture.debugElement
    .queryAll(By.css('tbody tr'))
    .map((row) => row.query(By.css('td')).nativeElement.textContent.trim());
}

function columnTexts(fixture: ComponentFixture<TtkMatrix>, columnIndex: number): string[] {
  return fixture.debugElement.queryAll(By.css('tbody tr')).map((row) => {
    const cells = row.queryAll(By.css('td'));
    return cells[columnIndex + 1].nativeElement.textContent.trim();
  });
}

function clickHeader(fixture: ComponentFixture<TtkMatrix>, index: number): void {
  const headers = fixture.debugElement.queryAll(By.css('th[mat-sort-header]'));
  headers[index].nativeElement.click();
  fixture.detectChanges();
}

describe('TtkMatrix sorting', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TtkMatrix] }).compileComponents();
  });

  function create(): ComponentFixture<TtkMatrix> {
    const fixture = TestBed.createComponent(TtkMatrix);
    fixture.componentRef.setInput('units', units());
    fixture.detectChanges();
    TestBed.flushEffects();
    return fixture;
  }

  it('orders rows by the clicked column’s raw TTK (pivot = clicked unit)', () => {
    const fixture = create();
    const list = units();

    for (const headerIndex of [0, 1, 2, 3]) {
      const pivot = list[headerIndex];
      clickHeader(fixture, headerIndex);

      const expected = [...list].sort((a, b) => {
        const av = timeToKill(a, pivot);
        const bv = timeToKill(b, pivot);
        if (av === null || bv === null) {
          return av === bv ? 0 : av === null ? 1 : -1;
        }
        return av - bv;
      });
      expect(rowNames(fixture), `sorted by ${pivot.name}`).toEqual(
        expected.map((unit) => unit.name),
      );
    }
  });

  it('shows monotonic TTK values down the clicked column', () => {
    const fixture = create();
    for (const headerIndex of [0, 1, 2, 3]) {
      clickHeader(fixture, headerIndex);
      const texts = columnTexts(fixture, headerIndex);
      const numbers = texts.map((text) =>
        text === '--'
          ? null
          : text.startsWith('>')
            ? Number.POSITIVE_INFINITY
            : Number.parseFloat(text),
      );
      for (let i = 1; i < numbers.length; i++) {
        const previous = numbers[i - 1];
        const current = numbers[i];
        const label = `column ${headerIndex}: ${texts.join(', ')}`;
        if (current === null) {
          expect(previous, label).toBeNull();
        } else if (previous !== null) {
          expect(current, label).toBeGreaterThanOrEqual(previous);
        }
      }
    }
  });

  it('sorts descending on the second click of the same header', () => {
    const fixture = create();
    const pivot = units()[1];
    clickHeader(fixture, 1);
    clickHeader(fixture, 1);
    const expected = [...units()]
      .sort((a, b) => (timeToKill(a, pivot) ?? Infinity) - (timeToKill(b, pivot) ?? Infinity))
      .reverse();
    expect(rowNames(fixture)).toEqual(expected.map((unit) => unit.name));
  });
});
