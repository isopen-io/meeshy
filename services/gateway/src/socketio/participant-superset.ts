import type { PrismaClient } from '@meeshy/shared/prisma/client';

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
 */
export async function fetchParticipantSuperset(
  prisma: PrismaClient,
  conversationId: string,
  transport: string
): Promise<ParticipantSuperset | undefined> {
  try {
    return await prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { ...PREVIEW_PRISM_PARTICIPANT_SELECT, joinedAt: true },
    }) as ParticipantSuperset;
  } catch (error) {
    logger.warn(
      'participant fetch failed — signaux cosmétiques sautés, la file hors ligne refait sa propre requête',
      { transport, conversationId, error }
    );
    return undefined;
  }
}
