import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Unit } from './model';
import { buildUnits, parseCsv } from './unit-stats';
import { MatchupService } from './matchup.service';
import { FightTimelineService } from './fight-timeline.service';

let matchup: MatchupService;
let timelineService: FightTimelineService;

beforeEach(() => {
  TestBed.configureTestingModule({});
  matchup = TestBed.inject(MatchupService);
  timelineService = TestBed.inject(FightTimelineService);
});

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
  const fight = matchup.survivingHp(a, b);
  if (!fight) {
    throw new Error(`no fight for ${aName} vs ${bName}`);
  }
  const aSeries = timelineService.buildSeries(a, b, fight);
  const bSeries = timelineService.buildSeries(b, a, fight);
  if (!aSeries || !bSeries) {
    throw new Error(`no series for ${aName} vs ${bName}`);
  }
  return { fight, aSeries, bSeries };
}

function timeline(aName: string, bName: string) {
  const a = unit(aName);
  const b = unit(bName);
  const fight = matchup.survivingHp(a, b);
  if (!fight) {
    throw new Error(`no fight for ${aName} vs ${bName}`);
  }
  const timeline = timelineService.buildChart(a, b, fight);
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

    expect(timelineService.hpAt(bSeries.points, 3)).toBe(unit('Hound').hpSquad);
    expect(timelineService.hpAt(bSeries.points, 3.1)).toBeLessThan(unit('Hound').hpSquad);
    expect(timelineService.hpAt(aSeries.points, 0)).toBe(unit('Marksman').hpSquad);
  });

  it('builds a shared timeline from zero to the fight duration', () => {
    const { timeline: chart } = timeline('Marksman', 'Hound');
    const times = timelineService.unionTimes(chart.a.points, chart.b.points);

    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBeCloseTo(chart.duration, 6);
    expect(times).toEqual([...times].sort((left, right) => left - right));
  });
});
