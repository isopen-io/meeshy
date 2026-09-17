import { isReferralCodeShaped, normalizeReferralCode } from './referral-code';

/**
 * LE CODE D'INVITATION, ENTRE LE CLIC ET L'INSCRIPTION (#6584).
 *
 * ## Pourquoi il ne suffit pas de lire l'adresse
 *
 * Quelqu'un qui reçoit une invitation clique, regarde l'accueil, lit deux
 * écrans, puis s'inscrit — parfois le lendemain. À cet instant, l'adresse ne
 * porte plus rien. Ne lire que `?ref=` au chargement de `/signup` perdrait donc
 * le parrainage dans le cas NOMINAL d'un lien partagé, et ne le garderait que
 * dans le cas rare où l'on s'inscrit sans jamais quitter la page d'arrivée.
 *
 * **C'est le legacy qui l'avait déjà résolu**, et c'est de lui que vient cette
 * mémoire : `apps/web/app/signup/affiliate/[token]/page.tsx` écrit le jeton en
 * `localStorage` ET en cookie 30 jours, et `use-registration-submit.ts` le
 * relit au moment de créer le compte.
 *
 * ## Ce qui est repris, et ce qui est corrigé
 *
 * La CLÉ est la sienne (`meeshy_affiliate_token`) : même vocabulaire, et le
 * jour où `apps/web-v2` prend la place d'`apps/web`, les jetons déjà posés dans
 * les navigateurs sont relus plutôt que jetés. Une ligne écrite PAR le legacy —
 * le jeton nu, sans objet ni date — est donc comprise telle quelle.
 *
 * L'ÉCHÉANCE, elle, est corrigée : le legacy borne son cookie à 30 jours et
 * laisse la copie `localStorage` sans date, donc un jeton y survit
 * indéfiniment. Ici, la date est PORTÉE par la valeur — il n'y a pas deux
 * supports à faire périr ensemble, il n'y en a qu'un.
 *
 * ## Rien ne jette, jamais
 *
 * Navigation privée, stockage bloqué, quota plein, ligne écrite par une version
 * future : la lecture rend `''` et l'écriture ne fait rien. Un parrainage perdu
 * est un désagrément ; une inscription qui plante est un compte perdu.
 */

/** Ce qu'un magasin doit savoir faire — le même contrat que
 * `lib/reading-mode/store.ts`, pour que les témoins n'aient pas à monter un
 * navigateur. */
export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** LA clé du legacy — voir le doc-comment du module. */
export const REFERRAL_MEMORY_KEY = 'meeshy_affiliate_token';

/** Trente jours, comme le cookie du legacy (`page.tsx:39`). */
export const REFERRAL_MEMORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type RememberedCode = { readonly code: string; readonly savedAt: number };

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string): RememberedCode | null {
  // Une ligne du LEGACY est le jeton NU : elle n'est pas du JSON, et c'est
  // exactement ce que ce premier essai attrape (§ doc-comment).
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'code' in parsed && 'savedAt' in parsed) {
      const { code, savedAt } = parsed as { code: unknown; savedAt: unknown };
      if (typeof code === 'string' && typeof savedAt === 'number') return { code, savedAt };
    }
    return null;
  } catch {
    return isReferralCodeShaped(raw) ? { code: normalizeReferralCode(raw), savedAt: Date.now() } : null;
  }
}

export function recallReferralCode(storage: StorageLike | null = defaultStorage()): string {
  if (storage === null) return '';
  try {
    const raw = storage.getItem(REFERRAL_MEMORY_KEY);
    if (raw === null) return '';
    const remembered = parse(raw);
    if (remembered === null) return '';
    if (Date.now() - remembered.savedAt > REFERRAL_MEMORY_TTL_MS) {
      storage.removeItem(REFERRAL_MEMORY_KEY);
      return '';
    }
    return isReferralCodeShaped(remembered.code) ? normalizeReferralCode(remembered.code) : '';
  } catch {
    return '';
  }
}

export function rememberReferralCode(code: string, storage: StorageLike | null = defaultStorage()): void {
  if (storage === null) return;
  const normalized = normalizeReferralCode(code);
  // Mémoriser « rien » EFFACERAIT un code déjà posé : c'est `forgetReferralCode`
  // qui efface, et lui seul, une fois le parrainage noué.
  if (!isReferralCodeShaped(normalized)) return;
  try {
    storage.setItem(REFERRAL_MEMORY_KEY, JSON.stringify({ code: normalized, savedAt: Date.now() } satisfies RememberedCode));
  } catch {
    /* stockage bloqué — le parrainage ne survivra pas à la navigation, l'inscription si */
  }
}

export function forgetReferralCode(storage: StorageLike | null = defaultStorage()): void {
  if (storage === null) return;
  try {
    storage.removeItem(REFERRAL_MEMORY_KEY);
  } catch {
    /* idem */
  }
}
