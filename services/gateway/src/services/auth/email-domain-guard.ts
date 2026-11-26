/**
 * SEULES DE VRAIES ADRESSES OUVRENT UN COMPTE (#16491) — la garde que la
 * passerelle pose à chaque porte qui écrit sur un compte une adresse SAISIE :
 * inscription, adresse inconnue qui devient un compte (connexion par mot de
 * passe, lien magique), changement d'e-mail (initiation et activation), et
 * l'adresse qu'un administrateur saisit à la création ou à la modification
 * d'un compte (#16492).
 *
 * La taxonomie vit dans `@meeshy/shared/utils/email-domain-policy` ; ce module
 * n'ajoute que la décision d'appliquer (l'échappatoire d'environnement) et la
 * réponse servie. Elle ne garde jamais l'ACCÈS : un compte existant sur un tel
 * domaine se connecte toujours, et les adresses que le serveur écrit lui-même
 * (`deleted.meeshy.invalid` à la suppression d'un compte) ne la traversent pas.
 *
 * @module services/auth/email-domain-guard
 */

import type { FastifyReply } from 'fastify';
import { isEmailDomainAllowed } from '@meeshy/shared/utils/email-domain-policy';

import { sendError } from '../../utils/response';

import { RESERVED_EMAIL_DOMAINS_ALLOWED } from './email-domain-escape';

export const EMAIL_DOMAIN_NOT_ALLOWED_CODE = 'EMAIL_DOMAIN_NOT_ALLOWED';

export const EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE =
  "Cette adresse e-mail n'est pas acceptée : les adresses d'exemple, de test ou jetables ne permettent pas d'ouvrir un compte. Utilisez une adresse réelle.";

export function isEmailDomainRefused(email: string): boolean {
  return !RESERVED_EMAIL_DOMAINS_ALLOWED && !isEmailDomainAllowed(email);
}

/** La réponse d'une route qui refuse l'adresse : 400, code stable, phrase lisible. */
export function sendEmailDomainNotAllowed(reply: FastifyReply): void {
  return sendError(reply, 400, EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE, { code: EMAIL_DOMAIN_NOT_ALLOWED_CODE });
}

/**
 * Le refus typé des services qui écrivent une adresse sans tenir la réponse
 * HTTP (l'administration, #16492) : la route le rend par
 * `replyEmailDomainRefused`, à la même forme que les portes publiques.
 */
export class EmailDomainRefusedError extends Error {
  constructor() {
    super(EMAIL_DOMAIN_NOT_ALLOWED_MESSAGE);
    this.name = 'EmailDomainRefusedError';
  }
}

export function assertEmailDomainAllowed(email: string): void {
  if (isEmailDomainRefused(email)) throw new EmailDomainRefusedError();
}

/** Rend le refus en 400 typé ; `false` si l'erreur n'en est pas un. */
export function replyEmailDomainRefused(reply: FastifyReply, error: unknown): boolean {
  if (!(error instanceof EmailDomainRefusedError)) return false;
  sendEmailDomainNotAllowed(reply);
  return true;
}
