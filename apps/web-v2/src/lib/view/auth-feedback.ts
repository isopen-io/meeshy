import type { ApiFailure, ApiResult } from '../api/http';

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
/** Le repli générique des trois flux neufs (#5816) — `MagicLinkView.swift`'s
 * `auth.magiclink.error.generic` : « Une erreur est survenue. Veuillez
 * réessayer. », le code/statut adjoint entre parenthèses (#5325). */
const AUTH_GENERIC_FAILURE_MESSAGE = 'Une erreur est survenue. Veuillez réessayer.';

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
 * Le délai RÉEL d'un 429 à l'inscription (#5912) — jamais « dans un instant »
 * (faux, l'attente mesurée est de cinq minutes) ni `RATE_LIMIT_EXCEEDED` (un
 * jeton machine servi à un lecteur humain, alors que le fichier applique déjà
 * la règle inverse pour la connexion et le mot de passe oublié).
 *
 * Composé depuis `failure.retryAfter` — jamais un texte en dur — pour que le
 * message ne puisse pas mentir si la fenêtre du limiteur change côté serveur.
 * Repli SEULEMENT si la passerelle omet le champ (ne devrait pas arriver sur
 * la vraie 429 de `createRegisterRateLimiter`, `rate-limiter.ts:307`).
 */
function signupRateLimitedMessage(retryAfter: number | undefined): string {
  if (retryAfter === undefined || retryAfter <= 0) {
    return "Trop de tentatives d'inscription. Réessayez plus tard.";
  }
  const minutes = Math.ceil(retryAfter / 60);
  const delai = minutes <= 1 ? 'une minute' : `${minutes} minutes`;
  return `Trop de tentatives d'inscription. Réessayez dans ${delai}.`;
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

  // Avant le calcul de `field` : un 429 ne vise aucune saisie à corriger, et
  // `RATE_LIMIT_EXCEEDED` ne matche `fieldForCode` sur AUCUN cas — sans ce
  // retour anticipé il tombait déjà au bandeau générique, juste avec le
  // mauvais texte (#5912).
  if (failure.status === 429) {
    return { fieldErrors: {}, bannerError: signupRateLimitedMessage(failure.retryAfter), showSignIn: false };
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

// --- Mot de passe oublié (#5816, T5) ------------------------------------

/** `POST /auth/forgot-password` (`password-reset.ts:110-215`) : nominal
 * `data` ABSENT, erreur interne `{ message }` — aucun champ que ce client
 * consulte. */
export type ForgotPasswordData = { readonly message?: string } | undefined;

export type ForgotPasswordOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'invalid-email' }
  | { readonly kind: 'offline' }
  | { readonly kind: 'failed'; readonly message: string };

const FORGOT_PASSWORD_RATE_LIMITED_MESSAGE = 'Trop de demandes. Réessayez dans quelques minutes.';

/**
 * `200` ET `404` rendent la MÊME issue — la route ne sert jamais de 404
 * aujourd'hui (§ 3.3 de la spécification), mais un client qui en ferait un
 * texte distinct révélerait l'existence du compte le jour où un proxy ou une
 * version en introduirait un. Cette garde de NON-RÉVÉLATION est le sens du
 * critère (2) : « le MÊME écran pour 200 et 404 ».
 */
export function resolveForgotPasswordOutcome(result: ApiResult<ForgotPasswordData>): ForgotPasswordOutcome {
  if (result.ok || result.status === 404) return { kind: 'sent' };
  if (result.status === 400) return { kind: 'invalid-email' };
  if (result.status === 429) return { kind: 'failed', message: FORGOT_PASSWORD_RATE_LIMITED_MESSAGE };
  if (result.status === 0) return { kind: 'offline' };
  return { kind: 'failed', message: `${AUTH_GENERIC_FAILURE_MESSAGE} (${result.code ?? result.status})` };
}

// --- Validation d'un lien magique (#5816, T5b) --------------------------

export type MagicLinkValidationFeedback = { readonly message: string };

const MAGIC_LINK_INVALID_MESSAGE = 'Lien invalide ou expiré';

/**
 * UN SEUL texte pour les CINQ phrases anglaises que sert la passerelle
 * (`MagicLinkService.ts:309, 318, 324, 334, 348` : invalide / déjà utilisé /
 * expiré / révoqué) — on ne révèle jamais LEQUEL de ces cas s'est produit,
 * même doctrine que `placeLoginFailure` pour les identifiants.
 */
export function placeMagicLinkValidationFailure(failure: ApiFailure): MagicLinkValidationFeedback {
  if (failure.status === 0) return { message: NETWORK_UNAVAILABLE_MESSAGE };
  if (failure.status === 400) return { message: MAGIC_LINK_INVALID_MESSAGE };
  return { message: `${AUTH_GENERIC_FAILURE_MESSAGE} (${failure.code ?? failure.status})` };
}
