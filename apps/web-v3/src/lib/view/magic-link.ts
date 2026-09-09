import type { ApiFailure, ApiResult } from '../api/http';

/**
 * LES LOIS PURES DU LIEN MAGIQUE (#5816) — miroir `MagicLinkView.swift`.
 * Aucun réseau, aucune horloge réelle, aucun JSX : entièrement pur, comme
 * `signup-form.ts`. La décision produit (quand appeler, où poser un texte)
 * vit dans l'écran et `view/auth-feedback.ts`.
 */

/** `expiresInSeconds` optionnel — le `?` DIT le § 3.1 de la spécification :
 * un succès de débit dépassé emballe le refus en 200 SANS ce champ. */
export type MagicLinkRequestData = { readonly expiresInSeconds?: number };

export type MagicLinkRequestOutcome =
  | { readonly kind: 'sent'; readonly expiresInSeconds: number }
  | { readonly kind: 'rate-limited' }
  | { readonly kind: 'invalid-email' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Lit un `ApiResult<MagicLinkRequestData>` — jamais `failure.error` brut
 * (§ Prisme cycle 122, même doctrine que `auth-feedback.ts`) : la passerelle
 * sert des phrases anglaises ou des jetons machine, jamais un texte destiné
 * à un lecteur.
 *
 * `data.expiresInSeconds` ABSENT sur un succès 200 est le SEUL discriminant
 * d'un débit dépassé (`MagicLinkService.ts:106-116` + `routes/magic-link.ts:112` —
 * la route emballe le refus de débit en 200 quand même, § 3.1 de la
 * spécification). C'est un défaut de contrat gateway, pas corrigé ici
 * (§ 9 Q3) : ce module se contente de le lire fidèlement.
 */
export function resolveMagicLinkRequest(result: ApiResult<MagicLinkRequestData>): MagicLinkRequestOutcome {
  if (result.ok) {
    const expiresInSeconds = result.data?.expiresInSeconds;
    return expiresInSeconds === undefined ? { kind: 'rate-limited' } : { kind: 'sent', expiresInSeconds };
  }
  return resolveMagicLinkFailure(result);
}

function resolveMagicLinkFailure(failure: ApiFailure): MagicLinkRequestOutcome {
  if (failure.status === 0 && failure.code === undefined) return { kind: 'offline' };
  if (failure.status === 400) return { kind: 'invalid-email' };
  if (failure.status === 429) return { kind: 'rate-limited' };
  return { kind: 'failed', message: `Une erreur est survenue. Veuillez réessayer. (${failure.code ?? failure.status})` };
}

/** Un compte à rebours ancré sur `Date.now()`, jamais un compteur qui saute
 * quand l'onglet dort (dimension 4). `now` est en ms, `startedAt` en ms,
 * `expiresInSeconds` en secondes (la forme exacte que sert la passerelle). */
export type MagicLinkDeadline = { readonly startedAt: number; readonly expiresInSeconds: number };

/** Secondes restantes, jamais négatif. */
export function countdownRemaining(deadline: MagicLinkDeadline, now: number): number {
  const elapsedMs = now - deadline.startedAt;
  const remainingSeconds = deadline.expiresInSeconds - Math.floor(elapsedMs / 1000);
  return Math.max(0, remainingSeconds);
}

/** « 9:59 » — motif `.minuteSecond` d'iOS (`LocalizedNumber.swift:116-128`) :
 * la minute n'est PAS paddée, les secondes le sont à deux chiffres DANS LA
 * LOCALE (chiffres arabo-indiens en `ar`, si l'ICU du runtime les sert). */
export function formatCountdown(seconds: number, locale: string): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const paddedSeconds = new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(secs);
  return `${minutes}:${paddedSeconds}`;
}

/** « 4 minutes 32 secondes » — unités `wide`, zéros masqués
 * (`LocalizedNumber.swift:187-199`). Le libellé PARLÉ du compte à rebours,
 * pour `aria-label` — un chiffre seul se lit mal par un lecteur d'écran. */
export function spokenCountdown(seconds: number, locale: string): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const parts: string[] = [];
  if (minutes > 0) parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'long' }).format(minutes));
  if (secs > 0 || minutes === 0) {
    parts.push(new Intl.NumberFormat(locale, { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(secs));
  }
  return parts.join(' ');
}

/**
 * Clampe `returnUrl` à un chemin MÊME-ORIGINE, jamais une URL absolue ni un
 * schéma alternatif — même doctrine que le legacy
 * (`apps/web/app/auth/magic-link/validate/page.tsx:94-97` : « returnUrl is
 * attacker-controlled … clamp it to a same-origin path »). Un `returnUrl`
 * suspect rend `'/'`, jamais l'entrée telle quelle.
 */
export function safeReturnPath(raw: string | null | undefined): string {
  if (raw === null || raw === undefined || raw === '') return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  if (raw.includes('\\')) return '/';
  return raw;
}
