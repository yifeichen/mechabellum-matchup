import { Component } from '@angular/core';
import { Matchup } from './matchup/matchup.component';

@Component({
  selector: 'app-root',
  imports: [Matchup],
  template: '<app-matchup />',
})
export class App {}
