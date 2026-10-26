export interface Row {
  [column: string]: string;
}

export interface Unit {
  name: string;
  price: number;
  hp: number;
  squadSize: number;
  atk: number;
  shotsPerVolley: number;
  interval: number;
  range: number;
  splash: number;
  unitWidth: number;
  speed: number;
  flying: boolean;
  targetsAir: boolean;
  hpSquad: number;
  damagePerAttack: number;
}
