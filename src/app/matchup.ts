import type { Unit } from './model';

// --------------------------------------------------------------------------- //
// matchup maths
// --------------------------------------------------------------------------- //

export function canEngage(attacker: Unit, defender: Unit): boolean {
  return !defender.flying || attacker.targetsAir;
}

export function canAttack(unit: Unit): boolean {
  return unit.interval > 0 && unit.damagePerAttack > 0;
}

export function attacksPerModel(attacker: Unit, defender: Unit): number | null {
  if (!canAttack(attacker) || !canEngage(attacker, defender)) {
    return null;
  }
  if (defender.hp <= 0) {
    return null;
  }
  return Math.ceil(defender.hp / attacker.damagePerAttack);
}

export function splashTargets(attacker: Unit, defender: Unit): number {
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

export function hitsToKill(attacker: Unit, defender: Unit): number | null {
  const perModel = attacksPerModel(attacker, defender);
  if (perModel === null) {
    return null;
  }
  return perModel * defender.squadSize;
}

export function ticksToKill(attacker: Unit, defender: Unit): number | null {
  const hits = hitsToKill(attacker, defender);
  const perModel = attacksPerModel(attacker, defender);
  if (hits === null || perModel === null) {
    return null;
  }
  const slots = attacker.squadSize * splashTargets(attacker, defender);
  return Math.ceil(hits / slots);
}

export function timeToKill(attacker: Unit, defender: Unit): number | null {
  const ticks = ticksToKill(attacker, defender);
  if (ticks === null) {
    return null;
  }
  return ticks * attacker.interval;
}

// --------------------------------------------------------------------------- //
// approach-then-stand fight: range and speed
// --------------------------------------------------------------------------- //

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

// Volleys land at t = interval, 2×interval … like the TTK tick count, so a
// window shorter than the loser's full TTK never delivers the killing volley.
// Each loser volley delivers loser models × splash target hit-slots, each
// winner model needs attacksPerModel hits to drop (overkill on the killing hit
// is wasted), and partial hits damage the next model without killing it.
function fightOutcome(
  loser: Unit,
  winner: Unit,
  winnerEffective: number,
  loserClosing: number,
): { steps: FightSteps; hpLeft: number } {
  const firingWindow = Math.max(0, winnerEffective - loserClosing);
  const volleys =
    loser.interval > 0 && firingWindow > 0 ? Math.floor(firingWindow / loser.interval) : 0;
  const targets = splashTargets(loser, winner);
  const hits = volleys * loser.squadSize * targets;
  const perModel = attacksPerModel(loser, winner);
  let killed = 0;
  let leftover = 0;
  let scratch = 0;
  if (volleys > 0 && perModel !== null) {
    killed = Math.min(winner.squadSize, Math.floor(hits / perModel));
    leftover = hits % perModel;
    scratch = Math.min(winner.hp, leftover * loser.damagePerAttack);
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
export function survivingHp(attacker: Unit, defender: Unit): FightResult | null {
  const ttkA = timeToKill(attacker, defender);
  const ttkB = timeToKill(defender, attacker);
  if (ttkA === null && ttkB === null) {
    return null;
  }

  const closing = (shorter: Unit, longer: Unit): number => {
    const gap = longer.reach - shorter.reach;
    if (gap <= 0) {
      return 0;
    }
    return shorter.speed > 0 ? gap / shorter.speed : Number.POSITIVE_INFINITY;
  };

  const closingA = attacker.reach < defender.reach ? closing(attacker, defender) : 0;
  const closingB = defender.reach < attacker.reach ? closing(defender, attacker) : 0;
  const effectiveA = ttkA === null ? null : ttkA + closingA;
  const effectiveB = ttkB === null ? null : ttkB + closingB;

  // The loser can never kill the winner, so the winner takes no damage.
  if (effectiveA === null) {
    const outcome = fightOutcome(attacker, defender, effectiveB as number, closingA);
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
    const outcome = fightOutcome(defender, attacker, effectiveA, closingB);
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
  const outcome = fightOutcome(loser, winner, winnerEffective, loserClosing);

  return {
    winner: attackerWins ? 'attacker' : 'defender',
    hpLeft: outcome.hpLeft,
    closingSeconds,
    effectiveAttacker: effectiveA,
    effectiveDefender: effectiveB,
    steps: outcome.steps,
  };
}
