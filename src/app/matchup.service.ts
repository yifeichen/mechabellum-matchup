import { Injectable } from '@angular/core';
import type { Unit } from './model';

export interface TimeToKillWithModelLosses {
  time: number | null;
  volleys: number;
  attackerModelsRemaining: number;
}

export interface FightResult {
  winner: 'attacker' | 'defender' | 'draw';
  hpLeft: number;
  closingSeconds: number;
  effectiveAttacker: number;
  effectiveDefender: number;
  steps?: FightSteps;
}

// The intermediate numbers behind one side's damage during the fight.
interface FightSteps {
  loserClosing: number;
  firingWindow: number;
  volleys: number;
  targets: number;
  hits: number;
  perModel: number | null;
  killed: number;
  leftover: number;
  scratch: number;
}

function applyHitSlots(models: number[], slots: number, damagePerHit: number): void {
  let remainingSlots = slots;
  while (remainingSlots > 0) {
    let targetIndex = -1;
    for (let i = 0; i < models.length; i++) {
      if (models[i] > 0 && (targetIndex < 0 || models[i] < models[targetIndex])) {
        targetIndex = i;
      }
    }
    if (targetIndex < 0) {
      return;
    }
    const hitsToKill = Math.ceil(models[targetIndex] / damagePerHit);
    const hits = Math.min(remainingSlots, hitsToKill);
    models[targetIndex] = Math.max(0, models[targetIndex] - hits * damagePerHit);
    remainingSlots -= hits;
  }
}

@Injectable({ providedIn: 'root' })
export class MatchupService {
  canEngage(attacker: Unit, defender: Unit): boolean {
    return !defender.flying || attacker.targetsAir;
  }

  canAttack(unit: Unit): boolean {
    return unit.interval > 0 && unit.atk > 0 && unit.shotsPerVolley > 0;
  }

  nbShotsToKillOneModel(attacker: Unit, defender: Unit): number | null {
    if (!this.canAttack(attacker) || !this.canEngage(attacker, defender)) {
      return null;
    }
    if (defender.hp <= 0) {
      return null;
    }
    return Math.ceil(defender.hp / attacker.atk);
  }

  splashTargets(attacker: Unit, defender: Unit): number {
    if (attacker.splash <= 0 || defender.unitWidth <= 0) {
      return 1;
    }
    const width = defender.unitWidth;
    const radius = attacker.splash / 2;
    const limit = Math.floor(radius / width + 0.5);
    let count = 0;
    for (let i = -limit; i <= limit; i++) {
      for (let j = -limit; j <= limit; j++) {
        const dx = Math.max(Math.abs(i) * width - width / 2, 0);
        const dy = Math.max(Math.abs(j) * width - width / 2, 0);
        if (dx * dx + dy * dy <= radius * radius) {
          count++;
        }
      }
    }
    return Math.max(1, Math.min(defender.squadSize, count));
  }

  nbShotsToKillSquad(attacker: Unit, defender: Unit): number | null {
    const perModel = this.nbShotsToKillOneModel(attacker, defender);
    if (perModel === null) {
      return null;
    }
    return perModel * defender.squadSize;
  }

  nbVolleysToKill(attacker: Unit, defender: Unit): number | null {
    const hitsNeeded = this.nbShotsToKillSquad(attacker, defender);
    if (hitsNeeded === null) {
      return null;
    }
    const shots =
      attacker.squadSize * attacker.shotsPerVolley * this.splashTargets(attacker, defender);
    return Math.ceil(hitsNeeded / shots);
  }

  timeToKill(attacker: Unit, defender: Unit): number | null {
    const ticks = this.nbVolleysToKill(attacker, defender);
    if (ticks === null) {
      return null;
    }
    return ticks * attacker.interval;
  }

  timeToKillWithModelLosses(attacker: Unit, defender: Unit): TimeToKillWithModelLosses {
    const attackerModels = Array.from({ length: attacker.squadSize }, () => attacker.hp);
    const defenderModels = Array.from({ length: defender.squadSize }, () => defender.hp);
    let attackerVolleys = 0;
    let nextAttackerVolley =
      this.canAttack(attacker) && this.canEngage(attacker, defender)
        ? this.closingTime(attacker, defender) + attacker.interval
        : Number.POSITIVE_INFINITY;
    let nextDefenderVolley =
      this.canAttack(defender) && this.canEngage(defender, attacker)
        ? this.closingTime(defender, attacker) + defender.interval
        : Number.POSITIVE_INFINITY;

    while (attackerModels.some((hp) => hp > 0) && defenderModels.some((hp) => hp > 0)) {
      const time = Math.min(nextAttackerVolley, nextDefenderVolley);
      if (!Number.isFinite(time)) {
        break;
      }

      const attackerFires = Math.abs(nextAttackerVolley - time) < 1e-9;
      const defenderFires = Math.abs(nextDefenderVolley - time) < 1e-9;
      const attackerCount = attackerModels.filter((hp) => hp > 0).length;
      const defenderCount = defenderModels.filter((hp) => hp > 0).length;
      const hitsOnDefender = attackerFires
        ? attackerCount *
          attacker.shotsPerVolley *
          this.splashTargets(attacker, { ...defender, squadSize: defenderCount })
        : 0;
      const hitsOnAttacker = defenderFires
        ? defenderCount *
          defender.shotsPerVolley *
          this.splashTargets(defender, { ...attacker, squadSize: attackerCount })
        : 0;

      if (attackerFires) {
        attackerVolleys++;
        nextAttackerVolley += attacker.interval;
      }
      if (defenderFires) {
        nextDefenderVolley += defender.interval;
      }

      applyHitSlots(defenderModels, hitsOnDefender, attacker.atk);
      applyHitSlots(attackerModels, hitsOnAttacker, defender.atk);

      if (!defenderModels.some((hp) => hp > 0)) {
        return {
          time,
          volleys: attackerVolleys,
          attackerModelsRemaining: attackerModels.filter((hp) => hp > 0).length,
        };
      }
    }

    return {
      time: null,
      volleys: attackerVolleys,
      attackerModelsRemaining: attackerModels.filter((hp) => hp > 0).length,
    };
  }

  closingTime(unit: Unit, target: Unit): number {
    if (unit.range >= target.range) {
      return 0;
    }
    return unit.speed > 0 ? (target.range - unit.range) / unit.speed : Number.POSITIVE_INFINITY;
  }

  // Volleys land at t = interval, 2×interval … like the TTK tick count, so a
  // window shorter than the loser's full TTK never delivers the killing volley.
  // Each loser volley delivers loser models × splash target hit-slots, each
  // winner model needs attacksPerModel hits to drop (overkill on the killing hit
  // is wasted), and partial hits damage the next model without killing it.
  private fightOutcome(
    loser: Unit,
    winner: Unit,
    winnerEffective: number,
    loserClosing: number,
  ): { steps: FightSteps; hpLeft: number } {
    const firingWindow = Math.max(0, winnerEffective - loserClosing);
    const volleys =
      loser.interval > 0 && firingWindow > 0 ? Math.floor(firingWindow / loser.interval) : 0;
    const targets = this.splashTargets(loser, winner);
    const hits = volleys * loser.squadSize * loser.shotsPerVolley * targets;
    const perModel = this.nbShotsToKillOneModel(loser, winner);
    let killed = 0;
    let leftover = 0;
    let scratch = 0;
    if (volleys > 0 && perModel !== null && perModel > 0) {
      killed = Math.min(winner.squadSize, Math.floor(hits / perModel));
      leftover = hits - killed * perModel;
      if (killed < winner.squadSize) {
        scratch = leftover * loser.atk;
      }
    }
    const hpLeft = Math.max(0, (winner.squadSize - killed) * winner.hp - scratch);
    return {
      steps: {
        loserClosing,
        firingWindow,
        volleys,
        targets,
        hits,
        perModel,
        killed,
        leftover,
        scratch,
      },
      hpLeft,
    };
  }

  // Effective TTK = the first-matrix TTK plus the approach time for the
  // shorter-range unit (range gap ÷ its speed). The faster effective TTK wins;
  // fightOutcome below works out the winner's remaining HP.
  survivingHp(attacker: Unit, defender: Unit): FightResult | null {
    const ttkA = this.timeToKill(attacker, defender);
    const ttkB = this.timeToKill(defender, attacker);
    if (ttkA === null && ttkB === null) {
      return null;
    }

    const closingA = this.closingTime(attacker, defender);
    const closingB = this.closingTime(defender, attacker);
    const effectiveA = ttkA === null ? null : ttkA + closingA;
    const effectiveB = ttkB === null ? null : ttkB + closingB;

    // The loser can never kill the winner, so the winner takes no damage.
    if (effectiveA === null) {
      const outcome = this.fightOutcome(attacker, defender, effectiveB as number, closingA);
      return {
        winner: 'defender',
        hpLeft: outcome.hpLeft,
        closingSeconds: closingB,
        effectiveAttacker: Number.POSITIVE_INFINITY,
        effectiveDefender: effectiveB as number,
        steps: outcome.steps,
      };
    }
    if (effectiveB === null) {
      const outcome = this.fightOutcome(defender, attacker, effectiveA, closingB);
      return {
        winner: 'attacker',
        hpLeft: outcome.hpLeft,
        closingSeconds: closingA,
        effectiveAttacker: effectiveA,
        effectiveDefender: Number.POSITIVE_INFINITY,
        steps: outcome.steps,
      };
    }

    const closingSeconds = closingA > 0 ? closingA : closingB;
    if (effectiveA === effectiveB) {
      return {
        winner: 'draw',
        hpLeft: 0,
        closingSeconds,
        effectiveAttacker: effectiveA,
        effectiveDefender: effectiveB,
      };
    }

    const attackerWins = effectiveA < effectiveB;
    const winner = attackerWins ? attacker : defender;
    const loser = attackerWins ? defender : attacker;
    const winnerEffective = attackerWins ? effectiveA : effectiveB;
    // The loser only starts firing once its own range gap has closed; if it is
    // the longer-range unit it can shoot the whole time.
    const loserClosing = attackerWins ? closingB : closingA;
    const outcome = this.fightOutcome(loser, winner, winnerEffective, loserClosing);

    return {
      winner: attackerWins ? 'attacker' : 'defender',
      hpLeft: outcome.hpLeft,
      closingSeconds,
      effectiveAttacker: effectiveA,
      effectiveDefender: effectiveB,
      steps: outcome.steps,
    };
  }
}
