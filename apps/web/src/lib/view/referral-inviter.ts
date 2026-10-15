import type { InviterCard } from '@/lib/api/affiliate';

import { normalizeReferralCode } from './referral-code';
import { REFERRAL_MEMORY_TTL_MS, type StorageLike } from './referral-memory';

/**
 * L'INVITANT DÉJÀ VU (#10559) — ce qui permet au cadre « qui m'invite » de
 * paraître à la première image d'un retour sur l'inscription, sans attendre la
 * passerelle (cache d'abord). La réponse le rafraîchit ; un jeton devenu
 * invalide l'efface.
 *
 * UNE entrée, liée à SON code : la carte d'un autre lien ne nomme personne. Elle
 * ne porte que ce que le cadre montre — nom, pseudo, avatar, bannière — et vit
 * aussi longtemps que le code lui-même (`REFERRAL_MEMORY_TTL_MS`).
 */

export const REFERRAL_INVITER_KEY = 'meeshy_affiliate_inviter';

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function cardOf(raw: unknown): InviterCard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const fields: Readonly<Record<string, unknown>> = { ...raw };
  const name = textOrNull(fields.name);
  if (name === null) return null;
  return { name, username: textOrNull(fields.username), avatar: textOrNull(fields.avatar), banner: textOrNull(fields.banner) };
}

export function recallReferralInviter(code: string, storage: StorageLike | null = defaultStorage()): InviterCard | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(REFERRAL_INVITER_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const entry: Readonly<Record<string, unknown>> = { ...parsed };
    if (entry.code !== normalizeReferralCode(code)) return null;
    if (typeof entry.savedAt !== 'number' || Date.now() - entry.savedAt > REFERRAL_MEMORY_TTL_MS) return null;
    return cardOf(entry.card);
  } catch {
    return null;
  }
}

export function rememberReferralInviter(code: string, card: InviterCard, storage: StorageLike | null = defaultStorage()): void {
  if (storage === null) return;
  const { name, username, avatar, banner } = card;
  try {
    storage.setItem(
      REFERRAL_INVITER_KEY,
      JSON.stringify({ code: normalizeReferralCode(code), card: { name, username, avatar, banner }, savedAt: Date.now() }),
    );
  } catch {
    /* stockage bloqué — le cadre attendra la passerelle à la prochaine visite */
  }
}

export function forgetReferralInviter(storage: StorageLike | null = defaultStorage()): void {
  if (storage === null) return;
  try {
    storage.removeItem(REFERRAL_INVITER_KEY);
  } catch {
    /* idem */
  }
}
