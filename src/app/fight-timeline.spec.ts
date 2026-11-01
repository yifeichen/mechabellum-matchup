import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { Unit } from './model';
import { buildUnits, parseCsv } from './unit-stats';
import { FightTimelineService } from './fight-timeline.service';

let timelineService: FightTimelineService;

beforeEach(() => {
  TestBed.configureTestingModule({});
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
  const chart = timelineService.buildChart(a, b);
  if (!chart) {
    throw new Error(`no timeline for ${aName} vs ${bName}`);
  }
  return { fight: chart.fight, aSeries: chart.a, bSeries: chart.b };
}

function timeline(aName: string, bName: string) {
  const a = unit(aName);
  const b = unit(bName);
  const timeline = timelineService.buildChart(a, b);
  if (!timeline) {
    throw new Error(`no timeline for ${aName} vs ${bName}`);
  }
  return { fight: timeline.fight, timeline };
}

describe('buildFightTimeline', () => {
  it('builds both series and the outcome from one combat timeline', () => {
    const { fight, aSeries, bSeries } = series('Vulcan', 'Crawler');

    expect(aSeries.name).toBe('Vulcan');
    expect(bSeries.name).toBe('Crawler');
    expect(aSeries.startHp).toBe(unit('Vulcan').hpSquad);
    expect(bSeries.startHp).toBe(unit('Crawler').hpSquad);
    expect(aSeries.finalHp).toBe(fight.hpLeft);
    expect(bSeries.finalHp).toBe(0);
  });

  it('ends both series at the simulation terminal time', () => {
    const { fight, aSeries, bSeries } = series('Vulcan', 'Crawler');

    expect(aSeries.points.at(-1)?.t).toBeCloseTo(1.2, 6);
    expect(aSeries.points.at(-1)?.hp).toBe(fight.hpLeft);
    expect(bSeries.points.at(-1)).toEqual({ t: aSeries.points.at(-1)?.t, hp: 0 });
  });

  it('marks the moment the shorter-range unit closes inside the fight', () => {
    const { timeline: chart } = timeline('Marksman', 'Hound');

    expect(chart.duration).toBeCloseTo(15.5, 6);
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

  it('applies each faster attacker volley between defender volleys', () => {
    const fastAttacker: Unit = {
      ...unit('Vulcan'),
      hp: 100,
      hpSquad: 100,
      squadSize: 1,
      atk: 10,
      interval: 1,
      range: 100,
    };
    const slowDefender: Unit = {
      ...unit('Crawler'),
      hp: 100,
      hpSquad: 100,
      squadSize: 1,
      atk: 10,
      interval: 3,
      range: 100,
    };
    const defenderSeries = timelineService.buildSeries(slowDefender, fastAttacker);
    if (!defenderSeries) {
      throw new Error('no series for slow defender');
    }

    expect(defenderSeries.points.slice(0, 4)).toEqual([
      { t: 0, hp: 100 },
      { t: 1, hp: 90 },
      { t: 2, hp: 80 },
      { t: 3, hp: 70 },
    ]);
  });

  it('records multiple model deaths at one volley as one grouped event', () => {
    const attacker: Unit = {
      ...unit('Vulcan'),
      hp: 100,
      hpSquad: 300,
      squadSize: 3,
      atk: 10,
      interval: 0.5,
      range: 100,
    };
    const defender: Unit = {
      ...unit('Crawler'),
      hp: 10,
      hpSquad: 30,
      squadSize: 3,
      interval: 0,
      range: 100,
    };
    const chart = timelineService.buildChart(attacker, defender);

    expect(chart?.b.modelDeathTimes).toEqual([[0.5, 3]]);
  });

  it('applies every shot in a volley to individual models', () => {
    const attacker: Unit = {
      ...unit('Vulcan'),
      hp: 100,
      hpSquad: 100,
      squadSize: 1,
      atk: 10,
      shotsPerVolley: 3,
      splash: 0,
      interval: 1,
      range: 100,
    };
    const defender: Unit = {
      ...unit('Crawler'),
      hp: 20,
      hpSquad: 60,
      squadSize: 3,
      atk: 0,
      interval: 0,
      range: 100,
    };
    const chart = timelineService.buildChart(attacker, defender);

    expect(chart?.b.points).toContainEqual({ t: 1, hp: 30 });
    expect(chart?.b.modelDeathTimes).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('builds a shared timeline from zero to the fight duration', () => {
    const { fight, timeline: chart } = timeline('Marksman', 'Hound');

    expect(chart.fight).toEqual(fight);
    for (const series of [chart.a, chart.b]) {
      expect(series.points[0].t).toBe(0);
      expect(series.points.at(-1)?.t).toBeCloseTo(chart.duration, 6);
      expect(series.points.map(({ t }) => t)).toEqual(
        [...series.points.map(({ t }) => t)].sort((left, right) => left - right),
      );
    }
  });
});
