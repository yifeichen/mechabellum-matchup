import {
  Component,
  computed,
  effect,
  input,
  linkedSignal,
  OnInit,
  output,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { formatCount } from '../format';
import {
  nbShotsToKillOneModel,
  canAttack,
  canEngage,
  nbShotsToKillSquad,
  splashTargets,
  nbVolleysToKill,
  timeToKill,
} from '../matchup';
import { Unit } from '../model';

@Component({
  selector: 'app-detail-side',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './detail-side.component.html',
  styleUrl: './detail-side.component.css',
})
export class DetailSide implements OnInit {
  readonly currentUnit = input.required<Unit>();
  readonly opponent = input.required<Unit>();
  readonly modifiedUnit = output<Unit>();
  protected readonly modified = linkedSignal(() => this.currentUnit());
  protected readonly form = new FormGroup({
    price: new FormControl(0, { nonNullable: true }),
    hp: new FormControl(0, { nonNullable: true }),
    squadSize: new FormControl(0, { nonNullable: true }),
    atk: new FormControl(0, { nonNullable: true }),
    shotsPerVolley: new FormControl(0, { nonNullable: true }),
    interval: new FormControl(0, { nonNullable: true }),
    range: new FormControl(0, { nonNullable: true }),
    splash: new FormControl(0, { nonNullable: true }),
    unitWidth: new FormControl(0, { nonNullable: true }),
    speed: new FormControl(0, { nonNullable: true }),
    flying: new FormControl(false, { nonNullable: true }),
    targetsAir: new FormControl(false, { nonNullable: true }),
  });
  private readonly syncFormEffect = effect(() => {
    const unit = this.currentUnit();
    const values = {
      price: unit.price,
      hp: unit.hp,
      squadSize: unit.squadSize,
      atk: unit.atk,
      shotsPerVolley: unit.shotsPerVolley,
      interval: unit.interval,
      range: unit.range,
      splash: unit.splash,
      unitWidth: unit.unitWidth,
      speed: unit.speed,
      flying: unit.flying,
      targetsAir: unit.targetsAir,
    };
    this.form.setValue(values, { emitEvent: false });
  });

  protected readonly formatCount = formatCount;
  protected readonly report = computed(() => {
    const attacker = this.modified();
    const defender = this.opponent();
    const modelsHitPerShot = splashTargets(attacker, defender);
    const squadHp = attacker.hp * attacker.squadSize;
    const squadDps =
      attacker.interval > 0
        ? (attacker.damagePerAttack * attacker.squadSize) / attacker.interval
        : null;
    const hpPerCost = attacker.price > 0 ? squadHp / attacker.price : null;
    const dpsPerCost = attacker.price > 0 && squadDps !== null ? squadDps / attacker.price : null;

    const blocked = this.blockedReason(attacker, defender);
    const shotsToKillOneModel = nbShotsToKillOneModel(attacker, defender);
    const shotsToKillSquad = nbShotsToKillSquad(attacker, defender);
    const volleysToKill = nbVolleysToKill(attacker, defender);
    const ttk = timeToKill(attacker, defender);

    return {
      attacker,
      defender,
      blocked,
      shotsToKillOneModel,
      shotsToKillSquad,
      volleysToKill,
      modelsHitPerShot,
      ttk,
      squadHp,
      squadDps,
      hpPerCost,
      dpsPerCost,
    };
  });

  ngOnInit(): void {
    this.form.valueChanges.subscribe(() => {
      const values = this.form.getRawValue();
      const unit = { ...this.modified(), ...values };
      unit.hpSquad = unit.hp * unit.squadSize;
      unit.damagePerAttack = unit.atk * unit.shotsPerVolley;
      this.modified.set(unit);
      this.modifiedUnit.emit(unit);
    });
  }

  protected rate(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return '--';
    }
    return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
  }

  protected reset(): void {
    this.form.patchValue(this.currentUnit());
  }

  private blockedReason(attacker: Unit, defender: Unit): string | null {
    if (!canAttack(attacker)) {
      return `${attacker.name} cannot attack: interval or damage is zero`;
    }
    if (!canEngage(attacker, defender)) {
      return `${attacker.name} cannot hit flying units`;
    }
    if (defender.hp <= 0) {
      return `${defender.name} has no HP`;
    }
    return null;
  }
}
