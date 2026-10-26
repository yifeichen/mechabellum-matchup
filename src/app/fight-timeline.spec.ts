import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Unit } from './model';
import { buildUnits, parseCsv } from './unit-stats';
import { survivingHp } from './matchup';
import { buildFightChart, buildFightTimeline, hpAt, unionTimes } from './fight-timeline';

const csv = readFileSync(resolve(process.cwd(), 'public', 'Unit Stats.csv'), 'utf-8');
const units = buildUnits(parseCsv(csv));
const byName = new Map(units.map((unit) => [unit.name, unit]));

function unit(name: string): Unit {
  const found = byName.get(name);
  if (!found) {
    throw new Error(`no unit ${name}`);
  }
  return found;
}

function series(aName: string, bName: string) {
  const a = unit(aName);
  const b = unit(bName);
  const fight = survivingHp(a, b);
  if (!fight) {
    throw new Error(`no fight for ${aName} vs ${bName}`);
  }
  const aSeries = buildFightTimeline(a, b, fight);
  const bSeries = buildFightTimeline(b, a, fight);
  if (!aSeries || !bSeries) {
    throw new Error(`no series for ${aName} vs ${bName}`);
  }
  return { fight, aSeries, bSeries };
}

function timeline(aName: string, bName: string) {
  const a = unit(aName);
  const b = unit(bName);
  const fight = survivingHp(a, b);
  if (!fight) {
    throw new Error(`no fight for ${aName} vs ${bName}`);
  }
  const timeline = buildFightChart(a, b, fight);
  if (!timeline) {
    throw new Error(`no timeline for ${aName} vs ${bName}`);
  }
  return { fight, timeline };
}

describe('buildFightTimeline', () => {
  it('builds one unit series per call', () => {
    const { fight, aSeries, bSeries } = series('Vulcan', 'Crawler');

    expect(aSeries.name).toBe('Vulcan');
    expect(bSeries.name).toBe('Crawler');
    expect(aSeries.startHp).toBe(unit('Vulcan').hpSquad);
    expect(bSeries.startHp).toBe(unit('Crawler').hpSquad);
    expect(aSeries.finalHp).toBe(fight.hpLeft);
    expect(bSeries.finalHp).toBe(0);
  });

  it('ends both series at the fight duration', () => {
    const { aSeries, bSeries } = series('Vulcan', 'Crawler');

    expect(aSeries.duration).toBeCloseTo(1.1, 6);
    expect(bSeries.duration).toBeCloseTo(1.1, 6);
    expect(aSeries.points.at(-1)).toEqual({ t: aSeries.duration, hp: aSeries.finalHp });
    expect(bSeries.points.at(-1)?.t).toBeCloseTo(bSeries.duration, 6);
  });

  it('marks the moment the shorter-range unit closes inside the fight', () => {
    const { timeline: chart } = timeline('Marksman', 'Hound');

    expect(chart.duration).toBeCloseTo(11.8, 6);
    expect(chart.bothInRange).toBeCloseTo(7, 6);
  });

  it('skips markers when both units start in range', () => {
    const { timeline: chart } = timeline('Arclight', 'Sledgehammer');

    expect(chart.bothInRange).toBeNull();
  });

  it('skips markers when the closer range is not reached before the fight ends', () => {
    const { timeline: chart } = timeline('Vulcan', 'Crawler');

    expect(chart.bothInRange).toBeNull();
  });

  it('reads HP at the post-volley time', () => {
    const { aSeries, bSeries } = series('Marksman', 'Hound');

    expect(hpAt(bSeries.points, 3)).toBe(unit('Hound').hpSquad);
    expect(hpAt(bSeries.points, 3.1)).toBeLessThan(unit('Hound').hpSquad);
    expect(hpAt(aSeries.points, 0)).toBe(unit('Marksman').hpSquad);
  });

  it('builds a shared timeline from zero to the fight duration', () => {
    const { timeline: chart } = timeline('Marksman', 'Hound');
    const times = unionTimes(chart.a.points, chart.b.points);

    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBeCloseTo(chart.duration, 6);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });
});
