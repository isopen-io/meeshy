import type { BatteryReaderState } from '@meeshy/shared/types/battery';

/**
 * **LA TEINTE D'UNE BATTERIE SERVIE** (#14147) — module minuscule et sans catalogue : l'avatar le lit pour peindre
 * son icône, sans emporter les libellés (`battery-view.ts`).
 */

export type BatteryTone = 'low' | 'critical' | 'off' | 'charging';

/** Branché pendant un épisode, la charge l'emporte : c'est ce que la personne fait MAINTENANT. */
export function batteryToneOf(state: Pick<BatteryReaderState, 'phase' | 'charging'>): BatteryTone {
  if (state.phase === 'off') return 'off';
  if (state.charging || state.phase === 'charging') return 'charging';
  return state.phase === 'critical' ? 'critical' : 'low';
}

/** La couleur de chaque teinte : sémantique, jamais l'accent de la conversation. */
export const BATTERY_TONE_COLOR: Readonly<Record<BatteryTone, string>> = {
  low: 'var(--color-warn)',
  critical: 'var(--color-error)',
  off: 'var(--color-ios-ink-2)',
  charging: 'var(--color-success)',
};
