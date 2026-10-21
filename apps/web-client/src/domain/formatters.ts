export interface QualityCheckView {
  id: string;
  passed: boolean;
}

export function formatCostUsd(amount: number): string {
  return `US$ ${amount.toFixed(6)}`;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

export function parseQualityCheck(check: string): QualityCheckView {
  const separator = check.lastIndexOf(':');
  if (separator === -1) {
    return { id: check, passed: false };
  }
  const id = check.slice(0, separator);
  const result = check.slice(separator + 1);
  return { id, passed: result === 'pass' };
}

export function formatScore(score: number): string {
  return score.toFixed(2);
}
