import { translateAdmin, translateAdminMaybe } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LE VOCABULAIRE DES STATISTIQUES QUE LE SOCLE NE PORTE PAS** (#8876, #6728) —
 * les motifs de fin d'appel et les problèmes signalés après un appel, plus deux
 * petits outils d'affichage (fusion par libellé, décimale).
 *
 * Les motifs sont ceux que les clients sérialisent (`apps/web` : `local`,
 * `remote`, `rejected`, `missed`, `connectionLost`, `failed`, `busy`,
 * `permission`, `removed`), ceux que la passerelle ajoute (`completed`,
 * `heartbeatTimeout`, `garbageCollected`, `in_progress`, `unknown`) — la
 * passerelle a déjà replié `failed("…")` sur `failed`. Un code hors de cette
 * liste se dit « Non reconnu », le code brut n'est jamais peint.
 */
export const CALL_END_REASONS = [
  'completed',
  'local',
  'remote',
  'missed',
  'rejected',
  'failed',
  'connectionLost',
  'heartbeatTimeout',
  'garbageCollected',
  'busy',
  'permission',
  'removed',
  'in_progress',
  'unknown',
] as const;

/** Les motifs que `CALL_FEEDBACK_ISSUES` (`services/gateway/src/validation/call-schemas.ts`) accepte. */
export const CALL_ISSUES = ['audio_quality', 'video_quality', 'dropped', 'echo', 'sync', 'other'] as const;

const isIn = <T extends string>(list: readonly T[], code: string): boolean => list.some((entry) => entry === code);

function vocabulary(family: 'reason' | 'issue', known: readonly string[], code: string, language: InterfaceLanguage): string {
  const label = isIn(known, code) ? translateAdminMaybe(language, `admin.analytics.calls.${family}.${code}`) : null;
  return label ?? translateAdmin(language, 'admin.value.unrecognized');
}

export const callEndReasonLabel = (code: string, language: InterfaceLanguage): string => vocabulary('reason', CALL_END_REASONS, code, language);

export const callIssueLabel = (code: string, language: InterfaceLanguage): string => vocabulary('issue', CALL_ISSUES, code, language);

export type LabelledValue = { readonly key: string; readonly label: string; readonly value: number };

/**
 * Deux codes qui se disent pareil (« Ordinateur » pour macOS, Windows et Linux ;
 * « Non reconnu » pour trois motifs inconnus) ne font qu'UNE ligne, sommée : deux
 * barres du même nom feraient lire deux choses là où il n'y en a qu'une. Du plus
 * grand au plus petit ; la clé est celle de la première ligne rencontrée.
 */
export function mergeByLabel(items: readonly LabelledValue[]): readonly LabelledValue[] {
  const merged = items.reduce<readonly LabelledValue[]>((accumulated, item) => {
    const existing = accumulated.find((entry) => entry.label === item.label);
    return existing === undefined
      ? [...accumulated, item]
      : accumulated.map((entry) => (entry === existing ? { ...entry, value: entry.value + item.value } : entry));
  }, []);
  return [...merged].sort((left, right) => right.value - left.value);
}

/** Un nombre à décimales limitées (« 0,3 »), jamais « 0,30000000000000004 ». `null` se dit « — ». */
export function formatDecimal(value: number | null, language: InterfaceLanguage, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(language, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value);
}
