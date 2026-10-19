import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, shareReplay } from 'rxjs';
import { Row } from './model';
import { parseCsv } from './unit-stats';

const CSV_URL = 'Unit%20Stats.csv';

@Injectable({ providedIn: 'root' })
export class MatchupService {
  private readonly http = inject(HttpClient);

  readonly rows: Observable<Row[]> = this.http
    .get(CSV_URL, { responseType: 'text' })
    .pipe(map(parseCsv), shareReplay({ bufferSize: 1, refCount: false }));
}
