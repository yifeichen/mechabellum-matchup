import { Injectable, inject } from '@angular/core';
import type { Unit } from './model';
import { MatchupService } from './matchup.service';

export interface HpPoint {
  t: number;
  hp: number;
}

export type ModelDeathTime = [deathTime: number, modelCount: number];

export interface FightSeriesData {
  name: string;
  squadSize: number;
  startHp: number;
  finalHp: number;
  points: HpPoint[];
  deathTime?: number | null;
  modelDeathTimes?: ModelDeathTime[];
}

export interface FightTimelineOutcome {
  winner: 'attacker' | 'defender' | 'draw';
  hpLeft: number;
}

export interface FightTimeline {
  fight: FightTimelineOutcome;
  duration: number;
  maxHp: number;
  bothInRange: number | null;
  a: FightSeriesData;
  b: FightSeriesData;
}

interface CombatSideTimeline {
  points: HpPoint[];
  deathTime: number | null;
  modelDeathTimes: ModelDeathTime[];
}

interface CombatTimeline {
  attacker: CombatSideTimeline;
  defender: CombatSideTimeline;
  duration: number;
  fight: FightTimelineOutcome;
}

@Injectable({ providedIn: 'root' })
export class FightTimelineService {
  private readonly matchup = inject(MatchupService);

  buildSeries(unit: Unit, opponent: Unit): FightSeriesData | null {
    const combat = this.combat_time_line(unit, opponent);
    return combat && this.toSeries(unit, combat.attacker);
  }

  buildChart(a: Unit, d: Unit): FightTimeline | null {
    const combat = this.combat_time_line(a, d);
    if (!combat) {
      return null;
    }
    console.log('combat', combat);
    const aSeries = this.toSeries(a, combat.attacker);
    const bSeries = this.toSeries(d, combat.defender);

    return {
      fight: combat.fight,
      duration: combat.duration,
      maxHp: Math.max(1, aSeries.startHp, bSeries.startHp),
      bothInRange: this.bothInRangeTime(a, d, combat.duration),
      a: aSeries,
      b: bSeries,
    };
  }

  private toSeries(unit: Unit, timeline: CombatSideTimeline): FightSeriesData {
    const points = timeline.points;
    return {
      name: unit.name,
      squadSize: unit.squadSize,
      startHp: unit.hpSquad,
      finalHp: points[points.length - 1].hp,
      points,
      deathTime: timeline.deathTime,
      modelDeathTimes: timeline.modelDeathTimes,
    };
  }

  private bothInRangeTime(a: Unit, d: Unit, duration: number): number | null {
    const time = Math.max(this.matchup.closingTime(a, d), this.matchup.closingTime(d, a));
    return Number.isFinite(time) && time > 0 && time <= duration + 1e-9 ? time : null;
  }

  private combat_time_line(
    attacker: Unit,
    defender: Unit,
  ): CombatTimeline | null {
    const attackerModels = Array.from({ length: attacker.squadSize }, () => attacker.hp);
    const defenderModels = Array.from({ length: defender.squadSize }, () => defender.hp);
    const attackerTimeline: CombatSideTimeline = {
      points: [{ t: 0, hp: attacker.hpSquad }],
      deathTime: null,
      modelDeathTimes: [],
    };
    const defenderTimeline: CombatSideTimeline = {
      points: [{ t: 0, hp: defender.hpSquad }],
      deathTime: null,
      modelDeathTimes: [],
    };
    const attackerSplashTargets = this.matchup.splashTargets(attacker, defender);
    const defenderSplashTargets = this.matchup.splashTargets(defender, attacker);
    let nextAttackerVolley =
      this.matchup.canAttack(attacker) && this.matchup.canEngage(attacker, defender)
        ? this.matchup.closingTime(attacker, defender) + attacker.interval
        : Number.POSITIVE_INFINITY;
    let nextDefenderVolley =
      this.matchup.canAttack(defender) && this.matchup.canEngage(defender, attacker)
        ? this.matchup.closingTime(defender, attacker) + defender.interval
        : Number.POSITIVE_INFINITY;

    while (
      attackerModels.some((hp) => hp > 0) &&
      defenderModels.some((hp) => hp > 0)
    ) {
      const time = Math.min(nextAttackerVolley, nextDefenderVolley);
      if (!Number.isFinite(time)) {
        return null;
      }

      const attackerFires = nextAttackerVolley === time;
      const defenderFires = nextDefenderVolley === time;
      const attackerCount = attackerModels.filter((hp) => hp > 0).length;
      const defenderCount = defenderModels.filter((hp) => hp > 0).length;
      const defenderHits = attackerFires
        ? attackerCount * attacker.shotsPerVolley * attackerSplashTargets
        : 0;
      const attackerHits = defenderFires
        ? defenderCount * defender.shotsPerVolley * defenderSplashTargets
        : 0;

      if (attackerFires) {
        nextAttackerVolley += attacker.interval;
      }
      if (defenderFires) {
        nextDefenderVolley += defender.interval;
      }

      if (attackerFires) {
        this.applyHits(defenderModels, attacker, attackerCount,attackerSplashTargets);
      }
      if (defenderFires) {
        this.applyHits(attackerModels, defender, defenderCount,defenderSplashTargets);
      }

      const attackerHp = attackerModels.reduce((total, hp) => total + hp, 0);
      const defenderHp = defenderModels.reduce((total, hp) => total + hp, 0);
      const attackerDeaths = attackerCount - attackerModels.filter((hp) => hp > 0).length;
      const defenderDeaths = defenderCount - defenderModels.filter((hp) => hp > 0).length;
      if (attackerDeaths > 0) {
        attackerTimeline.modelDeathTimes.push([time, attackerDeaths]);
      }
      if (defenderDeaths > 0) {
        defenderTimeline.modelDeathTimes.push([time, defenderDeaths]);
      }
      attackerTimeline.points.push({ t: time, hp: attackerHp });
      defenderTimeline.points.push({ t: time, hp: defenderHp });
      if (attackerHp <= 0) {
        attackerTimeline.deathTime = time;
      }
      if (defenderHp <= 0) {
        defenderTimeline.deathTime = time;
      }
    }

    const attackerHp = attackerTimeline.points.at(-1)?.hp ?? attacker.hpSquad;
    const defenderHp = defenderTimeline.points.at(-1)?.hp ?? defender.hpSquad;
    if (attackerHp > 0 && defenderHp > 0) {
      return null;
    }

    return {
      attacker: attackerTimeline,
      defender: defenderTimeline,
      duration: Math.max(
        attackerTimeline.deathTime ?? 0,
        defenderTimeline.deathTime ?? 0,
      ),
      fight: {
        winner:
          attackerHp <= 0 && defenderHp <= 0
            ? 'draw'
            : attackerHp > 0
              ? 'attacker'
              : 'defender',
        hpLeft: attackerHp <= 0 && defenderHp <= 0 ? 0 : Math.max(attackerHp, defenderHp),
      },
    };
  }

  private applyHits(models: number[], attacker: Unit, attackerCount: number, splashTargets: number): void {
    let shoots = attacker.shotsPerVolley * attackerCount;
    while (shoots > 0) {
      shoots--;
      let targetIndex = -1;
      for (let i = 0; i < models.length; i++) {
        if (models[i] > 0 ) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex < 0) {
        return;
      }
      for (let i = targetIndex; i < targetIndex + splashTargets; i++) {
        if (i < models.length) {
          models[i] = Math.max(0, models[i] - attacker.atk);
        }
      }
    }
  }
}
