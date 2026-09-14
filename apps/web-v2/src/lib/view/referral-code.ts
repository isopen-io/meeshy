/**
 * LE CODE DE PARRAINAGE — d'où il vient, et à quoi il ressemble (#6584).
 *
 * Question porteur 2026-09-14 : « Qu'en est-il de la page référer ? Ou de la
 * possibilité d'entrer le code du référer lors de l'inscription ? »
 *
 * ## Ce que ce module N'EST PAS
 *
 * Il ne valide RIEN — seule la passerelle sait si un jeton est actif, non
 * expiré et sous sa limite (`GET /affiliate/validate/:token`). Ce qu'il tient,
 * c'est la seule question qu'un client peut trancher seul : « cette chaîne
 * a-t-elle la forme d'un code, ou est-ce un champ qu'on vient d'effleurer ? »
 * La réponse décide s'il faut DÉPENSER une requête, jamais si le code est bon.
 *
 * ## Pourquoi la forme est si permissive
 *
 * Le dépôt sert DEUX familles de codes, produites par le même générateur
 * (`utils/public-identifier.ts`) : `aff_…` (un jeton de campagne créé
 * explicitement, `AffiliateToken`) et `ref_…` (le code intrinsèque d'un
 * compte, #3690). Un motif qui figerait l'un des deux préfixes refuserait
 * l'autre le jour où le produit décide qu'il entre ici aussi. La garde est
 * donc celle d'un identifiant opaque : quelque chose, d'un seul tenant, de
 * longueur raisonnable.
 */

/**
 * LES CLÉS D'ADRESSE QUI PORTENT UN CODE, DANS L'ORDRE OÙ ON LES LIT.
 *
 * `ref` est la forme courte et internationale (celle que `/signup/affiliate/:token`
 * réécrit) ; `parrain` est celle qu'un lien partagé en français portera
 * naturellement. Les deux ouvrent la même porte plutôt que d'exiger de
 * connaître la bonne orthographe — et l'ordre est FIXÉ ici, jamais laissé au
 * hasard de l'adresse : deux clés présentes doivent donner le même résultat à
 * tout le monde.
 */
export const REFERRAL_SEARCH_KEYS = ['ref', 'parrain'] as const;

/** La borne haute, large exprès : elle écarte un collage accidentel de page
 * entière, pas un jeton un peu long. */
const MAX_CODE_LENGTH = 128;

/** Les espaces de bord d'un copier-coller, et rien d'autre — la CASSE est
 * conservée (§ doc-comment du module : un jeton est opaque). */
export function normalizeReferralCode(raw: string): string {
  return raw.trim();
}

/** Le code porté par l'adresse, `''` s'il n'y en a pas. */
export function referralCodeFromSearch(search: URLSearchParams): string {
  for (const key of REFERRAL_SEARCH_KEYS) {
    const code = normalizeReferralCode(search.get(key) ?? '');
    if (code !== '') return code;
  }
  return '';
}

/**
 * Le code porté par l'adresse COURANTE — lu sur `window.location`, jamais par
 * `useSearch()`.
 *
 * Ce n'est pas un raccourci : `useSearch()` exige le contexte du routeur, et
 * l'inscription est montée telle quelle par ses témoins de rendu (leçon apprise
 * sur `/login`, dont l'écran a dû être coupé en deux pour la même raison).
 * Lire l'adresse une fois, à l'initialisation d'un état, ne demande aucun
 * contexte et ne s'abonne à rien — ce qui est exactement ce qu'il faut : le
 * code d'invitation ne change pas sous les doigts de celui qui remplit le
 * formulaire.
 */
export function referralCodeFromLocation(): string {
  if (typeof window === 'undefined') return '';
  return referralCodeFromSearch(new URLSearchParams(window.location.search));
}

/** Assez plausible pour qu'on DÉPENSE une requête de validation (§ module). */
export function isReferralCodeShaped(code: string): boolean {
  const normalized = normalizeReferralCode(code);
  if (normalized === '' || normalized.length > MAX_CODE_LENGTH) return false;
  return !/\s/u.test(normalized);
}
