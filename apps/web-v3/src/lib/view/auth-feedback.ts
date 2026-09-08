import type { ApiFailure } from '../api/http';

/**
 * LE PLACEMENT D'UN REFUS DE CONNEXION / D'INSCRIPTION (#5555, E5) — pur,
 * miroir de `SignupViewModel.applyRejection` / `field(forServerName:)` /
 * `field(forCode:)` (`apps/ios/Meeshy/Features/Auth/Signup/SignupViewModel.swift`).
 *
 * Les textes utilisateur vivent ICI (prose française) — jamais dans l'écran,
 * qui ne fait que les poser au bon endroit. Un refus qu'aucun champ ne porte
 * ne rend JAMAIS `failure.error` brut au bandeau (#5325) : ce champ porte, sur
 * la passerelle réelle, soit un nom de classe humanisé (« User Locked
 * Error »), soit une chaîne machine (`RATE_LIMIT_EXCEEDED`), jamais une
 * phrase destinée à un lecteur.
 */

export type SignupField = 'displayName' | 'email' | 'phoneNumber' | 'password';

export type SignupFeedback = {
  readonly fieldErrors: Partial<Record<SignupField, string>>;
  readonly bannerError: string | null;
  /** Vrai quand le serveur a répondu `EMAIL_TAKEN` : l'écran offre alors
   * « Se connecter » sous le champ (miroir `emailAlreadyRegistered`). */
  readonly showSignIn: boolean;
};

/** Le conflit de numéro (`register.ts:301-331`) — AUCUN champ HTTP ne le
 * porte, c'est la BRANCHE de succès `phoneOwnershipConflict` qui le signale ;
 * l'écran le distingue donc AVANT d'appeler ce module. */
export type PhoneConflict = { readonly kind: 'phone-conflict' };

const EMAIL_TAKEN_CODE = 'EMAIL_TAKEN';
const USERNAME_TAKEN_CODE = 'USERNAME_TAKEN';
const PHONE_INVALID_CODE = 'PHONE_INVALID';

const PHONE_OWNERSHIP_CONFLICT_MESSAGE = 'Ce numéro est déjà rattaché à un compte. Laissez-le vide pour continuer.';
const NETWORK_UNAVAILABLE_MESSAGE = 'Pas de connexion. Vérifiez votre réseau et réessayez.';
const REJECTION_GENERIC_MESSAGE = "L'inscription a été refusée — réessayez dans un instant.";

/**
 * Le champ SERVEUR → la saisie qui le porte à l'écran — miroir EXACT de
 * `SignupViewModel.field(forServerName:)`. `username`/`firstName`/`lastName`
 * atterrissent tous sous le NOM AFFICHÉ : depuis #5218 le client ne les
 * envoie plus, la passerelle les DÉRIVE de `displayName`.
 */
function fieldForServerName(name: string): SignupField | null {
  switch (name) {
    case 'displayName':
    case 'username':
    case 'firstName':
    case 'lastName':
      return 'displayName';
    case 'email':
      return 'email';
    case 'phoneNumber':
    case 'phoneCountryCode':
      return 'phoneNumber';
    case 'password':
      return 'password';
    default:
      return null;
  }
}

/** Le champ qu'un CODE vise, quand la charge ne nomme pas de champ — miroir
 * `SignupViewModel.field(forCode:)`. */
function fieldForCode(code: string | undefined): SignupField | null {
  switch (code) {
    case EMAIL_TAKEN_CODE:
      return 'email';
    case USERNAME_TAKEN_CODE:
      return 'displayName';
    case PHONE_INVALID_CODE:
      return 'phoneNumber';
    default:
      return null;
  }
}

function rejectionBannerMessage(failure: ApiFailure): string {
  const supportCode = failure.code ?? String(failure.status);
  return `${REJECTION_GENERIC_MESSAGE} (${supportCode})`;
}

/**
 * Range un refus là où l'utilisateur le cherchera : sous le champ qu'il
 * vise, ou dans le bandeau quand il n'en vise aucun.
 *
 * `failure.field` (une seule clé — la passerelle ne sert qu'UN champ par
 * refus, `register.ts:401-407`/`409`) prime sur le CODE : un `field` explicite
 * dit exactement quelle saisie corriger, un code seul (`PHONE_INVALID`) est
 * le repli quand la validation a échoué avant d'atteindre la couche qui pose
 * `field`.
 */
export function placeSignupFailure(failure: ApiFailure | PhoneConflict): SignupFeedback {
  // Un seul prédicat, `in` sur `failure` DIRECTEMENT : `ApiFailure` ne déclare
  // aucune clé `kind`, donc TypeScript narrowe le reste de la fonction à
  // `ApiFailure` après ce retour anticipé — un `&&` composé ne l'aurait pas
  // fait aussi proprement.
  if ('kind' in failure) {
    return { fieldErrors: { phoneNumber: PHONE_OWNERSHIP_CONFLICT_MESSAGE }, bannerError: null, showSignIn: false };
  }

  const showSignIn = failure.code === EMAIL_TAKEN_CODE;

  if (failure.status === 0) {
    return { fieldErrors: {}, bannerError: NETWORK_UNAVAILABLE_MESSAGE, showSignIn };
  }

  const field = (failure.field !== undefined ? fieldForServerName(failure.field) : null) ?? fieldForCode(failure.code);

  if (field !== null) {
    return { fieldErrors: { [field]: failure.error }, bannerError: null, showSignIn };
  }

  // Un refus qu'aucun champ ne porte doit rester VISIBLE : sans ce repli, un
  // code inconnu effacerait le formulaire de toute trace de l'échec.
  return { fieldErrors: {}, bannerError: rejectionBannerMessage(failure), showSignIn };
}

// --- Connexion ---------------------------------------------------------

export type LoginFeedback = { readonly message: string };

/**
 * Quatre textes DISTINCTS, composés — jamais `failure.error` brut : sur la
 * passerelle réelle, ce champ porte un nom de classe humanisé pour un 423
 * (`typedErrorResponse`, « User Locked Error ») ou un jeton machine pour un
 * 429 (`RATE_LIMIT_EXCEEDED`, `rate-limiter.ts:307`), jamais une phrase
 * destinée à un lecteur.
 */
export function placeLoginFailure(failure: ApiFailure): LoginFeedback {
  if (failure.status === 0) return { message: NETWORK_UNAVAILABLE_MESSAGE };
  if (failure.code === 'USER_LOCKED' || failure.status === 423) {
    return { message: 'Compte verrouillé — réessayez plus tard.' };
  }
  if (failure.status === 429) {
    return { message: 'Trop de tentatives de connexion. Réessayez dans quelques minutes.' };
  }
  if (failure.code === 'INVALID_CREDENTIALS' || failure.status === 401) {
    return { message: 'Identifiants invalides.' };
  }
  return { message: `La connexion a échoué — réessayez dans un instant. (${failure.code ?? failure.status})` };
}
