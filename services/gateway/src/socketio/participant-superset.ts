import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { scanLiveParticipants, type ParticipantScanOptions } from './conversationAudienceRooms';
import { enhancedLogger } from '../utils/logger-enhanced';

import {
  PREVIEW_PRISM_PARTICIPANT_SELECT,
  type PreviewPrismParticipant,
} from './utils/lastMessagePreviewPrism';

const logger = enhancedLogger.child({ module: 'ParticipantSuperset' });

export type ParticipantSuperset = Array<PreviewPrismParticipant & { joinedAt: Date }>;

/**
 * LA REQUÊTE DE PARTICIPANTS QUE LES DEUX PRODUCTEURS DE `message:new`
 * PARTAGENT — une seule, dont TROIS signaux se servent : l'éventail
 * `message:new`, `conversation:updated` et `conversation:unread-updated`.
 *
 * Le `select` est un SUPERSET qui satisfait les trois : `user` porte les
 * préférences de langue (le Prisme de la ligne de liste, résolu par
 * destinataire) et `joinedAt` est requis par l'enfilage hors ligne et par le
 * recompte des non-lus.
 *
 * **Elle rend `undefined` — jamais `[]` — quand elle tombe.** Les deux formes
 * se lisent pareil au site d'appel et ne disent pas la même chose : `[]`
 * AFFIRME que la conversation n'a aucun participant, `undefined` avoue qu'on
 * ne sait pas. L'enfilage hors ligne distingue les deux (`participants ?? sa
 * propre requête`), et c'est la seule des trois consommatrices dont l'abandon
 * soit DESTRUCTIF : un `[]` lui ferait enfiler pour PERSONNE — perdre le
 * message pour tous les absents — pendant que le journal n'annoncerait que
 * deux pertes cosmétiques.
 *
 * **Un seul site depuis le 2026-09-05.** Les deux transports en portaient une
 * copie chacun — `MessageHandler.broadcastNewMessage` (socket) et
 * `MeeshySocketIOManager._broadcastNewMessage` (REST/ZMQ) —, avec deux
 * doc-comments qui se CITAIENT l'un l'autre (« parité avec le chemin
 * REST/ZMQ … qui charge le même superset pour la même raison ») sans jamais
 * partager la ligne. Une jumelle documentée reste une jumelle : la prochaine
 * évolution du `select` n'aurait fait rougir aucun témoin en n'en touchant
 * qu'une.
 *
 * **Et la lecture est BORNÉE depuis #20051**, par le site unique de la borne
 * (`scanLiveParticipants`). Ce qui compte ici n'est pas la borne mais ce
 * qu'elle fait d'une TRONCATURE : la même chose qu'une panne, `undefined`.
 * Rendre les lignes LUES serait le pire des trois comportements possibles — la
 * file recevrait une liste PARTIELLE, qu'elle traiterait comme la liste
 * entière, et les absents qu'elle ne nomme pas ne recevraient jamais le
 * message : ni en direct (ils sont hors ligne), ni au rejeu (ils n'auraient pas
 * d'entrée). C'est l'asymétrie de #20050 portée au contenu le plus cher du
 * produit, et c'est pourquoi une borne naïve y serait pire que pas de borne.
 */
export async function fetchParticipantSuperset(
  prisma: PrismaClient,
  conversationId: string,
  transport: string,
  /** Le plafond, pour qu'un témoin puisse l'ATTEINDRE. La production ne le passe jamais. */
  options?: Pick<ParticipantScanOptions, 'cap'>
): Promise<ParticipantSuperset | undefined> {
  let failed: unknown;
  const scan = await scanLiveParticipants<PreviewPrismParticipant & { joinedAt: Date }>(
    prisma,
    conversationId,
    { ...PREVIEW_PRISM_PARTICIPANT_SELECT, joinedAt: true },
    {
      ...(options?.cap === undefined ? {} : { cap: options.cap }),
      scanLabel: `message-new-superset:${transport}`,
      onError: (error) => { failed = error; },
    },
  );
  if (failed !== undefined) {
    logger.warn(
      'participant fetch failed — signaux cosmétiques sautés, la file hors ligne refait sa propre requête',
      { transport, conversationId, error: failed }
    );
    return undefined;
  }
  // Une TRONCATURE se rend comme une PANNE, et pour la même raison : les deux
  // ne savent pas qui sont tous les participants. Le journal les SÉPARE —
  // `scanLiveParticipants` a déjà émis sa ligne de troncature, avec le
  // transport dans son `scanLabel` — mais le verdict rendu est le même, parce
  // que le consommateur destructif, lui, ne fait qu'une différence : liste, ou
  // pas de liste.
  if (!scan.complete) return undefined;
  return [...scan.rows] as ParticipantSuperset;
}
