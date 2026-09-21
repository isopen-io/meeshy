import { createHash } from 'node:crypto';

/**
 * RFC 8030 § 5.4 : un `Topic` Web Push tient en 32 caractères au plus de
 * l'alphabet base64url, et un service de push DOIT répondre 400 à tout autre
 * valeur — le message est alors PERDU, pas seulement non regroupé.
 *
 * Une valeur déjà conforme passe telle quelle ; une autre est condensée en un
 * sujet conforme et STABLE, pour que deux pushes de même `collapseId` se
 * remplacent encore l'un l'autre.
 */
const RFC8030_TOPIC = /^[A-Za-z0-9_-]{1,32}$/;

export function webPushTopic(collapseId: string): string {
  return RFC8030_TOPIC.test(collapseId)
    ? collapseId
    : createHash('sha256').update(collapseId).digest('base64url').slice(0, 32);
}
