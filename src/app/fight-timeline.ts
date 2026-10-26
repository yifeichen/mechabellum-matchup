import { Injectable } from '@angular/core';
import type { Unit } from './model';
import { nbShotsToKillOneModel, splashTargets, nbVolleysToKill } from './matchup';
import type { FightResult } from './matchup';

export interface HpPoint {
  t: number;
  hp: number;
}

export interface FightSeriesData {
  name: string;
  startHp: number;
  finalHp: number;
  duration: number;
  points: HpPoint[];
  deathTime?: number | null;
  modelDeathTimes?: number[];
}

export interface FightTimeline {
  duration: number;
  maxHp: number;
  bothInRange: number | null;
  a: FightSeriesData;
  b: FightSeriesData;
}

@Injectable({ providedIn: 'root' })
export class FightTimelineService {
  buildSeries(unit: Unit, opponent: Unit, fight: FightResult): FightSeriesData | null {
    const durations = [fight.effectiveAttacker, fight.effectiveDefender].filter((value) =>
      Number.isFinite(value),
    );
    const duration = durations.length > 0 ? Math.min(...durations) : 0;
    if (!Number.isFinite(duration) || duration <= 0) {
      return null;
    }

    const hpSeriesResult = this.hpSeries(opponent, unit, duration);
    const points = this.withEndpoint(hpSeriesResult.points, duration);
    return {
      name: unit.name,
      startHp: unit.hpSquad,
      finalHp: points[points.length - 1].hp,
      duration,
      points,
      deathTime: hpSeriesResult.deathTime,
      modelDeathTimes: hpSeriesResult.modelDeathTimes,
    };
  }

  buildChart(a: Unit, d: Unit, fight: FightResult): FightTimeline | null {
    const aSeries = this.buildSeries(a, d, fight);
    const bSeries = this.buildSeries(d, a, fight);
    if (!aSeries || !bSeries) {
      return null;
    }

    return {
      duration: aSeries.duration,
      maxHp: Math.max(1, aSeries.startHp, bSeries.startHp),
      bothInRange: this.bothInRangeTime(a, d, aSeries.duration),
      a: aSeries,
      b: bSeries,
    };
  }

  hpAt(points: readonly HpPoint[], t: number): number {
    let hp = points[0]?.hp ?? 0;
    for (const point of points) {
      if (point.t > t + 1e-9) {
        break;
      }
      hp = point.hp;
    }
    return hp;
  }

  unionTimes(a: readonly HpPoint[], b: readonly HpPoint[]): number[] {
    const times = [...a, ...b].map((point) => point.t).sort((left, right) => left - right);
    const result: number[] = [];
    for (const t of times) {
      const previous = result[result.length - 1];
      if (previous === undefined || t - previous > 1e-9) {
        result.push(t);
      }
    }
    return result;
  }

  private closingTime(unit: Unit, target: Unit): number {
    if (unit.range >= target.range) {
      return 0;
    }
    const gap = target.range - unit.range;
    return unit.speed > 0 ? gap / unit.speed : Number.POSITIVE_INFINITY;
  }

  private bothInRangeTime(a: Unit, d: Unit, duration: number): number | null {
    const time = Math.max(this.closingTime(a, d), this.closingTime(d, a));
    return Number.isFinite(time) && time > 0 && time <= duration + 1e-9 ? time : null;
  }

  private withEndpoint(points: HpPoint[], duration: number): HpPoint[] {
    const last = points[points.length - 1];
    if (last && last.t < duration) {
      points.push({ t: duration, hp: last.hp });
    }
    return points;
  }

  private hpSeries(attacker: Unit, target: Unit, duration: number): { points: HpPoint[]; deathTime: number | null; modelDeathTimes: number[] } {
    const points: HpPoint[] = [{ t: 0, hp: target.hpSquad }];
    const closing = this.closingTime(attacker, target);
    const ticks = nbVolleysToKill(attacker, target);
    if (!Number.isFinite(closing) || ticks === null) {
      return { points, deathTime: null, modelDeathTimes: [] };
    }

    const perModel = nbShotsToKillOneModel(attacker, target);
    if (perModel === null) {
      return { points, deathTime: null, modelDeathTimes: [] };
    }

    const slots = attacker.squadSize * splashTargets(attacker, target);
    let deathTime: number | null = null;
    const modelDeathTimes: number[] = [];
    let lastKilled = 0;
    for (let volley = 1; volley <= ticks; volley++) {
      const t = closing + volley * attacker.interval;
      if (t > duration + 1e-9) {
        break;
      }
      const hits = volley * slots;
      const killed = Math.min(target.squadSize, Math.floor(hits / perModel));
      const leftover = hits % perModel;
      const scratch = Math.min(target.hp, leftover * attacker.damagePerAttack);
      const hp = Math.max(0, (target.squadSize - killed) * target.hp - scratch);
      if (killed > lastKilled) {
        for (let i = lastKilled; i < killed; i++) {
          modelDeathTimes.push(t);
        }
        lastKilled = killed;
      }
      points.push({ t, hp });
      if (hp <= 0 && deathTime === null) {
        deathTime = t;
        break;
      }
    }
    return { points, deathTime, modelDeathTimes };
  }
}

export const fightTimelineService = new FightTimelineService();
export const buildFightTimeline = (unit: Unit, opponent: Unit, fight: FightResult) =>
  fightTimelineService.buildSeries(unit, opponent, fight);
export const buildFightChart = (a: Unit, d: Unit, fight: FightResult) =>
  fightTimelineService.buildChart(a, d, fight);
export const hpAt = (points: readonly HpPoint[], t: number) => fightTimelineService.hpAt(points, t);
export const unionTimes = (a: readonly HpPoint[], b: readonly HpPoint[]) =>
  fightTimelineService.unionTimes(a, b);
