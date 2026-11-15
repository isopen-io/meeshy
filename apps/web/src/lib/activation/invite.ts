import type { Activation } from '@/lib/api/activation';
import type { SafeStorage } from '@/lib/storage';

/**
 * **QUAND INVITER À VALIDER SON COMPTE** (#8239) — la règle, sans DOM ni
 * réseau. La modal ne s'ouvre qu'en phase `invite` et quand il reste quelque
 * chose à demander ; au plus une fois par jour et par APPAREIL — le jour est
 * la date LOCALE, retenue dans le stockage de l'appareil.
 */

const DAY_MS = 86_400_000;
const SHOWN_ON_KEY = 'meeshy.activation-invite.shown-on';

export function inviteDue(activation: Activation | null): activation is Activation {
  return activation !== null && activation.phase === 'invite' && activation.missing.length > 0;
}

export function daysLeft(deadline: string | null, now: number): number | null {
  if (deadline === null) return null;
  const at = Date.parse(deadline);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / DAY_MS));
}

export function localDay(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function wasInviteShownToday(storage: SafeStorage, now: number): boolean {
  return storage.getItem(SHOWN_ON_KEY) === localDay(now);
}

export function rememberInviteShown(storage: SafeStorage, now: number): void {
  storage.setItem(SHOWN_ON_KEY, localDay(now));
}
