import type { FastifyReply } from 'fastify';
import { sendConflict } from '../../utils/response';

/**
 * Un identifiant que l'administration voulait écrire est déjà porté par une
 * AUTRE ligne (#8215). Typé pour que les routes le rendent en 409 — il tombait
 * jusqu'ici en 500 (violation d'index) ou, pire, passait : l'index
 * `User_email_key` est sensible à la casse, `Foo@x.com` et `foo@x.com`
 * coexistaient, et la connexion (insensible) choisissait l'une au hasard.
 *
 * Module à part du service : les suites de routes doublent le service entier,
 * et la route doit reconnaître la VRAIE classe.
 */
export type AdminIdentifierField = 'email';

const CODE_PAR_CHAMP: Readonly<Record<AdminIdentifierField, string>> = {
  email: 'EMAIL_TAKEN',
};

export class AdminIdentifierTakenError extends Error {
  readonly field: AdminIdentifierField;

  constructor(field: AdminIdentifierField) {
    super(`${field} already in use`);
    this.name = 'AdminIdentifierTakenError';
    this.field = field;
  }
}

/** Une course perdue contre l'index unique du champ (P2002). */
function isUniqueViolationOn(error: unknown, field: AdminIdentifierField): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== 'P2002') return false;
  const target = meta?.target;
  const targets = Array.isArray(target) ? target : [target];
  return targets.some((t) => typeof t === 'string' && t.includes(field));
}

export function rethrowIdentifierTaken(error: unknown): never {
  if (isUniqueViolationOn(error, 'email')) throw new AdminIdentifierTakenError('email');
  throw error;
}

/** Rend le refus en 409 typé ; `false` si l'erreur n'en est pas un. */
export function replyIdentifierTaken(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof AdminIdentifierTakenError)) return false;
  sendConflict(reply, `This ${error.field} is already used by another account`, {
    code: CODE_PAR_CHAMP[error.field],
  });
  return true;
}
