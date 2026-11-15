import type { Message } from '@/lib/api/types';

/**
 * **QUI A ÉCRIT L'ADRESSE DÉCIDE SI ELLE DEVIENT UN LIEN (#10286).**
 *
 * Directive porteur 2026-10-12 : un participant ANONYME (invité sans compte,
 * entré par un lien de partage) peut écrire n'importe quelle adresse. Rendue
 * cliquable, raccourcie en `/l/…` ou posée en carte, elle porterait la
 * caution du domaine Meeshy — un vecteur de hameçonnage. Ses adresses restent
 * donc du TEXTE, telles qu'écrites.
 *
 * `live` exige un expéditeur DÉCLARÉ et inscrit (`user`) ou `bot` ; tout le
 * reste — anonyme, forme historique `anonymousSender`, expéditeur absent — est
 * `plain` (fail-closed). La passerelle sert `sender.type` sur la liste REST
 * (`messages-list-query.ts`) comme sur `message:new` (`buildSenderPayload`),
 * et la bulle optimiste porte la ligne du participant (`selfSenderOf`).
 *
 * Site UNIQUE de la décision : les deux peaux du fil (`bubble.tsx`,
 * `focal-row.tsx`) et l'index des liens (`media-hub.ts`) la lisent, aucune ne
 * réécrit la condition.
 */
export type LinkRendering = 'live' | 'plain';

const LINKING_SENDERS: ReadonlySet<string> = new Set(['user', 'bot']);

export function linkRenderingOf(message: Pick<Message, 'sender' | 'anonymousSender'>): LinkRendering {
  if (message.anonymousSender !== undefined) return 'plain';
  const type = message.sender?.type;
  return type !== undefined && LINKING_SENDERS.has(type) ? 'live' : 'plain';
}
