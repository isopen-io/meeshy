/**
 * LE REFUS DU SERVEUR, RECONNU (#9573) — la passerelle fait foi : quand elle
 * refuse un transfert (`admitMessageForward`) ou une publication, la feuille
 * d'envoi doit DIRE pourquoi, pas « L'envoi a été refusé ».
 *
 * La passerelle rend le motif d'un transfert refusé par un CODE stable
 * (`FORWARD_REFUSAL_CODES`, #9598), à côté de la phrase française
 * (`describeForwardRefusal`) gardée pour les anciens clients. Ce module lit le
 * code d'abord, la phrase ensuite (un ancien serveur n'a que la phrase) — un
 * témoin relit les deux dans la source de la passerelle.
 */
export type SendRefusal = 'view-once' | 'after-read' | 'unavailable' | 'encrypted' | 'not-in-source' | 'protected-media';

export const SERVER_FORWARD_REFUSALS = [
  { reason: 'view-once-not-forwardable', sentence: 'Un message à vue unique ne peut pas être transféré', refusal: 'view-once' },
  { reason: 'ephemeral-not-forwardable', sentence: 'Un message qui disparaît après lecture ne peut pas être transféré', refusal: 'after-read' },
  { reason: 'forward-source-unavailable', sentence: 'Le message d’origine n’est plus disponible : rien à transférer', refusal: 'unavailable' },
  { reason: 'encrypted-source-not-server-copyable', sentence: 'Un message chiffré se transfère depuis l’appareil : la passerelle n’en copie rien', refusal: 'encrypted' },
  { reason: 'forwarded-attachment-not-in-source', sentence: 'Une pièce demandée n’appartient pas au message transféré', refusal: 'not-in-source' },
] as const satisfies readonly { readonly reason: string; readonly sentence: string; readonly refusal: SendRefusal }[];

export function sendRefusalOf(failure: { readonly message: string; readonly code?: string }): SendRefusal | null {
  if (failure.code === 'PROTECTED_MEDIA') return 'protected-media';
  const known = SERVER_FORWARD_REFUSALS.find((entry) => entry.reason === failure.code || entry.sentence === failure.message);
  return known === undefined ? null : known.refusal;
}
