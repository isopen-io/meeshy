/**
 * Les REFUS TYPÉS de l'inscription (#5216).
 *
 * ## Le défaut que ce module ferme
 *
 * `AuthService.register` levait des `Error` dont le TEXTE portait le motif
 * (`'Nom d\'utilisateur déjà utilisé'`), puis les rattrapait toutes dans un
 * `catch` terminal qui rendait `null`. La route, elle, branchait sur ce texte :
 *
 * ```ts
 * if (errorMessage.includes('déjà utilisé')) return sendBadRequest(…);
 * ```
 *
 * **Ces branches étaient INATTEIGNABLES** — le service ne laissait rien
 * remonter, il rendait `null`, et la route servait un 400 « Erreur lors de la
 * création du compte » sans code ni champ. Un pseudo pris et une panne Mongo
 * rendaient la même réponse, et les témoins qui exerçaient ces branches
 * simulaient un `reject` que la production n'a jamais produit — la forme exacte
 * du « témoin qui atteste un comportement absent ».
 *
 * ## Ce que porte un refus, et pourquoi ces champs-là
 *
 * Un refus d'inscription se REND à un formulaire : il doit désigner le CHAMP à
 * corriger (`field`), porter un CODE stable pour le client (`code`), et son
 * STATUT — un conflit d'unicité est un 409, une saisie malformée un 400. Trois
 * clients lisent ces champs pour surligner le bon champ ; un texte français ne
 * leur sert à rien.
 *
 * Les `suggestions` n'accompagnent qu'`USERNAME_TAKEN` : c'est le seul refus
 * dont le remède se propose. On ne suggère pas d'e-mail de rechange.
 *
 * ## Ce qui n'est PAS un refus
 *
 * Une panne (Mongo, e-mail, socket) n'en est pas un : elle reste une erreur
 * ordinaire, que la route rend en 500 `REGISTRATION_ERROR`. La distinction est
 * la valeur du module — un refus est une réponse au FORMULAIRE, une panne est
 * une réponse au SERVICE, et les confondre a coûté les branches mortes ci-dessus.
 *
 * @module services/auth/registration-refusal
 */

/** Les motifs de refus qu'une inscription peut opposer à un formulaire. */
export type RegistrationRefusalCode = 'USERNAME_TAKEN' | 'EMAIL_TAKEN' | 'PHONE_INVALID';

/** Le champ du formulaire que le refus désigne. */
export type RegistrationRefusalField = 'username' | 'email' | 'phoneNumber';

const STATUT_PAR_CODE: Readonly<Record<RegistrationRefusalCode, 400 | 409>> = {
  // Un conflit d'unicité : la saisie est valide, elle est PRISE.
  USERNAME_TAKEN: 409,
  EMAIL_TAKEN: 409,
  // Une saisie malformée : rien n'est pris, la valeur n'est pas un numéro.
  PHONE_INVALID: 400,
};

const CHAMP_PAR_CODE: Readonly<Record<RegistrationRefusalCode, RegistrationRefusalField>> = {
  USERNAME_TAKEN: 'username',
  EMAIL_TAKEN: 'email',
  PHONE_INVALID: 'phoneNumber',
};

/**
 * Un refus d'inscription — LEVÉ par le service, traduit en réponse par la route.
 *
 * Le statut et le champ se DÉRIVENT du code plutôt que d'être passés : deux
 * sites qui lèvent le même code doivent rendre le même statut, et un paramètre
 * les laisserait diverger sans qu'aucun témoin ne le voie.
 */
export class RegistrationRefusal extends Error {
  readonly code: RegistrationRefusalCode;
  readonly field: RegistrationRefusalField;
  readonly status: 400 | 409;
  readonly suggestions?: readonly string[];

  constructor(
    code: RegistrationRefusalCode,
    message: string,
    options?: { readonly suggestions?: readonly string[] },
  ) {
    super(message);
    this.name = 'RegistrationRefusal';
    this.code = code;
    this.field = CHAMP_PAR_CODE[code];
    this.status = STATUT_PAR_CODE[code];
    if (options?.suggestions) this.suggestions = options.suggestions;
  }
}

/**
 * Reconnaît un refus SANS `instanceof`.
 *
 * `instanceof` traverse mal les frontières de module — deux exemplaires du
 * même fichier (double de test, chargement transpilé) produisent deux classes
 * distinctes, et la route retomberait alors en 500 sur un refus parfaitement
 * formé. Le prédicat porte sur la FORME, qui, elle, traverse.
 */
export function isRegistrationRefusal(error: unknown): error is RegistrationRefusal {
  if (typeof error !== 'object' || error === null) return false;
  const candidat = error as Partial<RegistrationRefusal>;
  return (
    typeof candidat.code === 'string' &&
    Object.hasOwn(STATUT_PAR_CODE, candidat.code) &&
    typeof candidat.field === 'string' &&
    (candidat.status === 400 || candidat.status === 409)
  );
}
