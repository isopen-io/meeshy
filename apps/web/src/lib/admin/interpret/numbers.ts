import type { AdminLanguage } from '@/lib/i18n-admin-catalog';

/**
 * LES NOMBRES, DITS EN MOTS (#8876) — comptes, parts, octets, montants.
 *
 * **Deux échelles coexistent dans les charges servies** : des taux en 0–1
 * (`ratio`) et d'autres en 0–100 (`hundred`). `formatPercent` exige que
 * l'appelant écrive l'échelle À SON SITE D'APPEL : deviner depuis la valeur
 * ferait lire 0,8 % un taux de 80 % servi en 0–1.
 */
const NONE = '—';

const isNumber = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

export function formatCount(value: number | null | undefined, language: AdminLanguage): string {
  return isNumber(value) ? new Intl.NumberFormat(language).format(value) : NONE;
}

export function formatCompact(value: number | null | undefined, language: AdminLanguage): string {
  return isNumber(value)
    ? new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : NONE;
}

export function formatPercent(
  value: number | null | undefined,
  scale: 'ratio' | 'hundred',
  language: AdminLanguage,
  digits = 0,
): string {
  if (!isNumber(value)) return NONE;
  return new Intl.NumberFormat(language, {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(scale === 'hundred' ? value / 100 : value);
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;

export function formatBytes(bytes: number | null | undefined, language: AdminLanguage): string {
  if (!isNumber(bytes) || bytes < 0) return NONE;
  const exponent = Math.min(BYTE_UNITS.length - 1, bytes < 1024 ? 0 : Math.floor(Math.log(bytes) / Math.log(1024)));
  const scaled = bytes / 1024 ** exponent;
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: BYTE_UNITS[exponent] ?? 'byte',
    unitDisplay: 'short',
    maximumFractionDigits: exponent === 0 || scaled >= 100 ? 0 : 1,
  }).format(scaled);
}

export function formatMoney(usd: number | null | undefined, language: AdminLanguage): string {
  return isNumber(usd)
    ? new Intl.NumberFormat(language, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(usd)
    : NONE;
}

/** `(courant − précédent) / précédent` ; un précédent nul n'a pas de variation — `null`, jamais l'infini. */
export function deltaRatio(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (!isNumber(current) || !isNumber(previous) || previous === 0) return null;
  return (current - previous) / previous;
}
