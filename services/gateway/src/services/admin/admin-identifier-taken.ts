import type { FastifyReply } from 'fastify';
import { sendError } from '../../utils/response';

/**
 * Un identifiant que l'administration voulait écrire est déjà porté par une
 * AUTRE ligne (#8215, #8217). Typé pour que les routes le rendent en 409 — il
 * tombait jusqu'ici en 500 (violation d'index) ou, pire, passait : les index
 * `User_email_key` et `User_username_key` sont sensibles à la casse,
 * `Foo@x.com` et `foo@x.com` coexistaient, et la connexion (insensible)
 * choisissait l'une au hasard.
 *
 * Module à part du service : les suites de routes doublent le service entier,
 * et la route doit reconnaître la VRAIE classe.
 */
export type AdminIdentifierField = 'email' | 'username';

const CODE_PAR_CHAMP: Readonly<Record<AdminIdentifierField, string>> = {
  email: 'EMAIL_TAKEN',
  username: 'USERNAME_TAKEN',
};

const CHAMPS: readonly AdminIdentifierField[] = ['email', 'username'];

export class AdminIdentifierTakenError extends Error {
  readonly field: AdminIdentifierField;
  /**
   * Des pseudos LIBRES dérivés de celui demandé (#8289) — servis avec le refus
   * pour que la fiche d'administration propose sans un second aller-retour.
   * Jamais pour une adresse : proposer une adresse n'a pas de sens.
   */
  readonly suggestions: readonly string[];

  constructor(field: AdminIdentifierField, suggestions: readonly string[] = []) {
    super(`${field} already in use`);
    this.name = 'AdminIdentifierTakenError';
    this.field = field;
    this.suggestions = suggestions;
  }
}

/** Le champ dont l'index unique a refusé l'écriture (P2002), s'il en est un des nôtres. */
function uniqueViolationField(error: unknown): AdminIdentifierField | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== 'P2002') return null;
  const target = meta?.target;
  const targets = (Array.isArray(target) ? target : [target]).filter((t): t is string => typeof t === 'string');
  return CHAMPS.find((champ) => targets.some((t) => t.includes(champ))) ?? null;
}

export function rethrowIdentifierTaken(error: unknown): never {
  const field = uniqueViolationField(error);
  if (field !== null) throw new AdminIdentifierTakenError(field);
  throw error;
}

/** Rend le refus en 409 typé ; `false` si l'erreur n'en est pas un. */
export function replyIdentifierTaken(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof AdminIdentifierTakenError)) return false;
  sendError(reply, 409, `This ${error.field} is already used by another account`, {
    code: CODE_PAR_CHAMP[error.field],
    details: {
      field: error.field,
      ...(error.suggestions.length > 0 ? { suggestions: [...error.suggestions] } : {}),
    },
  });
  return true;
}
