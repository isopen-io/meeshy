import type { BringAvailabilityView } from './bring-api';

/**
 * **LE BRING DANS L'EN-TÊTE D'UN DIRECT** (#17442, iso iOS
 * `ConversationHeaderBringButton`) — la loi pure du bouton : ce qu'il fait.
 * Il s'adresse au pair d'un direct ouvert (ni groupe, ni aperçu, ni invité ;
 * décidé par `ThreadHeader`, qui ne charge pas le morceau sinon). La passerelle décide du reste (niveau dès Ami,
 * quota, blocage, service coupé) : `available: false` ⇒ aucun bouton.
 *
 * Contrairement au talkie, le chiffrement ne le retire pas : un Bring ne
 * transporte aucun contenu de la conversation.
 */
export type BringHeaderState = 'hidden' | 'send' | 'exhausted' | 'ringing';

export function bringHeaderState({
  availability,
  ringing,
}: {
  readonly availability: BringAvailabilityView | null;
  readonly ringing: boolean;
}): BringHeaderState {
  if (availability === null || !availability.available) return 'hidden';
  if (ringing) return 'ringing';
  return availability.remainingToday === 0 ? 'exhausted' : 'send';
}
