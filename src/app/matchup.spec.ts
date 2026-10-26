import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Unit } from './model';
import { buildUnits, missingFields, parseCsv, parseRange } from './unit-stats';
import { splashTargets, survivingHp, timeToKill } from './matchup';

const csv = readFileSync(resolve(process.cwd(), 'public', 'Unit Stats.csv'), 'utf-8');
const rows = parseCsv(csv);
const units = buildUnits(rows);
const byName = new Map(units.map((unit) => [unit.name, unit]));
const rowByName = new Map(rows.map((row) => [(row['Name'] ?? '').trim(), row]));

function unit(name: string): Unit {
  const found = byName.get(name);
  if (!found) {
    throw new Error(`no unit ${name}`);
  }
  return found;
}

describe('parseCsv / parseRange', () => {
  it('reads every unit row', () => {
    expect(rows).toHaveLength(35);
  });

  it('averages both ends of a range', () => {
    expect(parseRange('168 - 7,952')).toBe(4060);
    expect(parseRange('840 - 39,760')).toBe(20300);
  });
});

describe('buildUnit', () => {
  it('uses the average of a range', () => {
    const melting = unit('Melting Point');
    expect(melting.atk).toBe(4060);
    expect(melting.damagePerAttack).toBe(4060);
  });

  it('defaults a missing volley to 1', () => {
    expect((unit('Vulcan') as any).shotsPerVolley ?? (unit('Vulcan') as any).volley).toBe(1);
  });

  it('reads squad size, width and splash', () => {
    expect(unit('Crawler').squadSize).toBe(24);
    expect(unit('Crawler').unitWidth).toBe(6);
    expect(unit('Vulcan').splash).toBe(15);
  });

  it('does not flag a missing volley as a missing value', () => {
    const vulcan = rowByName.get('Vulcan');
    if (!vulcan) {
      throw new Error('no row Vulcan');
    }
    expect(missingFields(vulcan)).not.toContain('Volley');
  });
});

describe('timeToKill', () => {
  const cases: [string, string, number][] = [
    ['Vulcan', 'Crawler', 1.1],
    ['Vulcan', 'Fang', 0.4],
    ['Arclight', 'Fang', 3.6],
    ['Arclight', 'Mustang', 10.8],
    ['Sledgehammer', 'Crawler', 22.5],
    ['War Factory', 'Crawler', 43.2],
    ['Vulcan', 'Typhoon', 25.6],
    ['Fortress', 'Mustang', 21.6],
    ['Crawler', 'Arclight', 1.7999999999999998],
    ['Marksman', 'Wasp', 37.2],
  ];

  it.each(cases)('%s vs %s = %s', (a, b, expected) => {
    expect(timeToKill(unit(a), unit(b))).toBeCloseTo(expected, 6);
  });

  it('cannot engage a flying defender with a ground-only attacker', () => {
    expect(timeToKill(unit('Vulcan'), unit('Wasp'))).toBeNull();
  });
});

describe('splashTargets', () => {
  it('counts grid squares the blast circle touches', () => {
    expect(splashTargets(unit('Vulcan'), unit('Crawler'))).toBe(9);
    expect(splashTargets(unit('Arclight'), unit('Fang'))).toBe(5);
  });

  it('treats single-target attacks as one model', () => {
    expect(splashTargets(unit('Arclight'), unit('Mustang'))).toBe(1);
    expect(splashTargets(unit('Vulcan'), unit('Typhoon'))).toBe(1);
  });
});

describe('survivingHp', () => {
  it('reads speed from the csv', () => {
    expect(unit('Crawler').speed).toBe(16);
    expect(unit('Sledgehammer').speed).toBe(7);
  });

  it('penalises the shorter-range unit with approach time', () => {
    const result = survivingHp(unit('Vulcan'), unit('Crawler'));
    if (!result) {
      throw new Error('expected a fight');
    }
    expect(result.winner).toBe('attacker');
    expect(result.closingSeconds).toBeCloseTo(89 / 16, 6);
    expect(result.effectiveAttacker).toBeCloseTo(1.1, 6);
    expect(result.effectiveDefender).toBeCloseTo(10.8 + 89 / 16, 6);
    // vulcan kills in 1.1s, before the crawler's 5.56s approach ends: no volleys land
    expect(result.hpLeft).toBe(32559);
    expect(result.steps).toMatchObject({
      loserClosing: 89 / 16,
      volleys: 0,
      hits: 0,
      killed: 0,
      scratch: 0,
    });
  });

  it('compares effective TTKs when ranges are equal', () => {
    const result = survivingHp(unit('Arclight'), unit('Sledgehammer'));
    if (!result) {
      throw new Error('expected a fight');
    }
    expect(result.winner).toBe('defender');
    expect(result.closingSeconds).toBe(0);
    expect(result.effectiveAttacker).toBeCloseTo(45, 6);
    expect(result.effectiveDefender).toBeCloseTo(9, 6);
    // arclight lands 10 volleys in 9s; each hound-style model takes
    // ceil(3478/365) = 10 hits, so exactly one sledge dies, overkill wasted
    expect(result.hpLeft).toBe(4 * 3478);
    expect(result.steps).toMatchObject({
      volleys: 10,
      hits: 10,
      perModel: 10,
      killed: 1,
      leftover: 0,
      scratch: 0,
    });
  });

  it('lets a ground-only defender never shoot back', () => {
    const result = survivingHp(unit('Wasp'), unit('Arclight'));
    if (!result) {
      throw new Error('expected a fight');
    }
    expect(result.winner).toBe('attacker');
    expect(result.hpLeft).toBe(unit('Wasp').hpSquad);
  });

  it('wastes overkill on each killed model', () => {
    // hound wins on effective TTK (4.8s + 7s approach = 11.8s vs 15.5s); the
    // marksman's volleys land at 3.1/6.2/9.3s (the 4th at 12.4s is too late),
    // each one-shots a hound, so 2 of 5 survive
    const result = survivingHp(unit('Marksman'), unit('Hound'));
    if (!result) {
      throw new Error('expected a fight');
    }
    expect(result.winner).toBe('defender');
    expect(result.hpLeft).toBe(2 * 879);
  });

  it('does not let a losing side land its killing blow out of time', () => {
    // scorpion wins at 12.57s (9s + 25m/7), but the farseer needs 14s for
    // its 7th volley, so only 6 land: scorpion survives, scratched
    const result = survivingHp(unit('Farseer'), unit('Scorpion'));
    if (!result) {
      throw new Error('expected a fight');
    }
    expect(result.winner).toBe('defender');
    expect(result.hpLeft).toBe(18632 - 6 * 2696);
  });

  it('returns null when neither side can damage the other', () => {
    const flyer: Unit = { ...unit('Wasp'), targetsAir: false };
    expect(survivingHp(flyer, { ...flyer, flying: true })).toBeNull();
  });
});
