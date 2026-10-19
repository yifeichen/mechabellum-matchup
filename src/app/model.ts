export interface Row {
  [column: string]: string;
}

export interface Unit {
  name: string;
  price: number;
  hp: number;
  squadSize: number;
  atk: number;
  volley: number;
  interval: number;
  reach: number;
  splash: number;
  unitWidth: number;
  speed: number;
  flying: boolean;
  targetsAir: boolean;
  hpSquad: number;
  damagePerAttack: number;
}
