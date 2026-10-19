export function formatCount(value: number | null): string {
  return value === null ? '--' : Math.round(value).toLocaleString('en-US');
}

export function formatRatio(value: number): string {
  return `${value >= 1 ? value.toFixed(1) : value.toFixed(2)}×`;
}
