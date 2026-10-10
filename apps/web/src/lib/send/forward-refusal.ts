/**
 * LE REFUS DU SERVEUR, RECONNU (#9573) — la passerelle fait foi : quand elle
 * refuse un transfert (`admitMessageForward`) ou une publication, la feuille
 * d'envoi doit DIRE pourquoi, pas « L'envoi a été refusé ».
 *
 * La passerelle rend le motif d'un transfert refusé comme PHRASE
 * (`describeForwardRefusal`), sans `code`. Ce module reconnaît ces phrases —
 * un témoin les relit dans la source de la passerelle — et le motif lui-même
 * s'il est un jour servi comme `code`.
 */
export type SendRefusal = 'view-once' | 'after-read' | 'unavailable' | 'protected-media';

export const SERVER_FORWARD_REFUSALS = [
  { reason: 'view-once-not-forwardable', sentence: 'Un message à vue unique ne peut pas être transféré', refusal: 'view-once' },
  { reason: 'ephemeral-not-forwardable', sentence: 'Un message qui disparaît après lecture ne peut pas être transféré', refusal: 'after-read' },
  { reason: 'forward-source-unavailable', sentence: 'Le message d’origine n’est plus disponible : rien à transférer', refusal: 'unavailable' },
] as const satisfies readonly { readonly reason: string; readonly sentence: string; readonly refusal: SendRefusal }[];

export function sendRefusalOf(failure: { readonly message: string; readonly code?: string }): SendRefusal | null {
  if (failure.code === 'PROTECTED_MEDIA') return 'protected-media';
  const known = SERVER_FORWARD_REFUSALS.find((entry) => entry.reason === failure.code || entry.sentence === failure.message);
  return known === undefined ? null : known.refusal;
}
