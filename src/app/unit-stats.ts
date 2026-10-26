import type { Row, Unit } from './model';

const SUSPECT: Record<string, string> = {
  'melting point': 'attack range x47 wide - high end is probably siege damage, not damage to units',
  'steel ball': 'attack range x47 wide - high end is probably siege damage, not damage to units',
  abyss: 'volley range x6 wide - level scaling is ambiguous',
};

export const DEFAULT_SKIP: string[] = Object.keys(SUSPECT);

// --------------------------------------------------------------------------- //
// parsing
// --------------------------------------------------------------------------- //

function clean(raw: string | undefined): string {
  return (raw ?? '')
    .trim()
    .replace(/^`+/, '')
    .replace(/`+$/, '')
    .replace(/,/g, '')
    .replace(/\$/g, '')
    .trim();
}

function toFloat(text: string): number | null {
  const value = clean(text);
  if (value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// A ranged cell resolves to the average of its low and high ends; blank or
// unparseable cells resolve to null.
export function parseRange(raw: string | undefined): number | null {
  const text = clean(raw);
  if (!text) {
    return null;
  }
  if (text.includes('-')) {
    const parts = text.split('-').filter((part) => clean(part));
    if (parts.length === 2) {
      const lo = toFloat(parts[0]);
      const hi = toFloat(parts[1]);
      if (lo === null || hi === null) {
        return null;
      }
      return (lo + hi) / 2;
    }
    return null;
  }
  return toFloat(text);
}

export const REQUIRED_COLUMNS = [
  'Price',
  'HP',
  'Squad Size',
  'Atk',
  'Attack Interval',
  'Range',
  'Splash',
  'unit width',
];

export function missingFields(row: Row): string[] {
  return REQUIRED_COLUMNS.filter((column) => parseRange(row[column]) === null);
}

export function parseCsv(text: string): Row[] {
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) {
    source = source.slice(1);
  }

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field);
      records.push(record);
      field = '';
      record = [];
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  const header = (records.shift() ?? []).map((name) => name.trim());
  return records
    .filter((cells) => cells.some((cell) => cell.trim() !== ''))
    .map((cells) => {
      const row: Row = {};
      header.forEach((name, index) => {
        row[name] = cells[index] ?? '';
      });
      return row;
    });
}

// --------------------------------------------------------------------------- //
// model
// --------------------------------------------------------------------------- //

export function buildUnit(row: Row): Unit | null {
  const name = (row['Name'] ?? '').trim();
  if (!name) {
    return null;
  }

  // A ranged cell resolves to its average; missing cells fall back.
  const price = parseRange(row['Price']) ?? 0;
  const hp = parseRange(row['HP']) ?? 0;
  const atkValue = parseRange(row['Atk']) ?? 0;
  const volley = parseRange(row['Volley']) ?? 1;
  const interval = parseRange(row['Attack Interval']) ?? 0;
  const reach = parseRange(row['Range']) ?? 0;
  const splash = parseRange(row['Splash']) ?? 0;
  const unitWidth = parseRange(row['unit width']) ?? 0;
  const speed = parseRange(row['Speed']) ?? 0;
  const flying = ['yes', 'y', 'true'].includes((row['Flying?'] ?? '').trim().toLowerCase());
  const targetsAir = (row['Target'] ?? '').trim().toLowerCase().startsWith('both');

  const squadSize = Math.max(1, Math.round(parseRange(row['Squad Size']) ?? 0));
  const damagePerAttack = atkValue * volley;

  const unit: Unit = {
    name,
    price,
    hp,
    squadSize,
    atk: atkValue,
    shotsPerVolley: volley,
    interval,
    range: reach,
    splash,
    unitWidth,
    speed,
    flying,
    targetsAir,
    hpSquad: hp * squadSize,
    damagePerAttack,
  };
  return unit;
}

export function buildUnits(rows: Row[]): Unit[] {
  return rows.map((row) => buildUnit(row)).filter((unit): unit is Unit => unit !== null);
}
