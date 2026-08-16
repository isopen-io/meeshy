/**
 * emitConversationPreviewUpdate.recalcFlag.test.ts
 *
 * Le défaut : un aperçu RECALCULÉ arrive chez le client indiscernable d'une
 * diffusion arrivée dans le désordre, et se fait jeter par sa garde monotone.
 *
 * Les clients tiennent le groupe d'aperçu (`lastMessageAt`, `lastMessageId`,
 * `lastMessagePreview`, la paire du Prisme) pour MONOTONE : un `lastMessageAt`
 * plus ancien que celui de la ligne désigne un message périmé, et tout le
 * groupe est écarté. Cette garde protège d'un cas réel — une diffusion pour un
 * message ANCIEN qui doublerait une plus récente laisserait la ligne afficher
 * l'horodatage du neuf avec le texte du vieux.
 *
 * Mais un recalcul autoritatif RECULE lui aussi, légitimement, et sur des
 * chemins nominaux :
 *   1. supprimer le dernier message pour tous → la ligne redescend sur le
 *      message PRÉCÉDENT, donc plus ancien ;
 *   2. un lecteur masque son propre dernier message visible → son remplaçant
 *      est plus ancien par construction.
 *
 * Du seul CONTENU, les deux sont identiques : `lastMessageAt` recule,
 * `lastMessageId` nomme un autre message. Seul l'ÉMETTEUR sait lequel des deux
 * il envoie — ce fichier fixe qu'il le déclare.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../../../socketio/emitConversationPreviewUpdate';

const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const ACTOR_ID = '507f1f77bcf86cd799439011';
const PEER_ID = '507f1f77bcf86cd799439012';
const LATEST_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const PREVIOUS_ID = 'cccccccccccccccccccccccc';

type Emission = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (emissions: Emission[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emissions.push({ room, event, payload: payload as Record<string, unknown> });
    },
  }),
});

/**
 * Double COMPLET des quatre modèles que l'émetteur lit.
 *
 * L'émetteur est un canal best-effort qui avale ses propres pannes : un double
 * amputé d'un seul modèle le rend MUET, et un témoin écrit dessus reste vert
 * sur une version qui n'émet rien. C'est la leçon du cycle 40, et elle vaut
 * exactement autant ici — le fait mesuré est la FORME du payload, qui n'existe
 * pas si rien n'est émis.
 */
const makePrisma = (opts: { hiddenForActor?: boolean } = {}) =>
  ({
    participant: {
      findMany: jest.fn(async () => [
        { id: 'part-actor', userId: ACTOR_ID },
        { id: 'part-peer', userId: PEER_ID },
      ]),
    },
    message: {
      findFirst: jest.fn(async (q: any) => {
        const isReplacement = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
        return isReplacement
          ? {
              id: PREVIOUS_ID,
              content: 'celui d avant',
              senderId: 'part-peer',
              createdAt: new Date('2026-08-15T09:00:00Z'),
            }
          : {
              id: LATEST_ID,
              content: 'le dernier',
              senderId: 'part-peer',
              createdAt: new Date('2026-08-15T10:00:00Z'),
            };
      }),
    },
    userMessageDeletion: {
      findMany: jest.fn(async () =>
        opts.hiddenForActor ? [{ userId: ACTOR_ID, messageId: LATEST_ID }] : []
      ),
    },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  }) as never;

const previewEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);

describe('emitConversationPreviewUpdate — le recalcul se déclare comme tel', () => {
  it('marks every recipient payload as a recalculation', async () => {
    const emissions: Emission[] = [];

    await emitConversationPreviewUpdate(
      makePrisma(),
      makeIo(emissions),
      CONV_ID,
      ACTOR_ID
    );

    const previews = previewEmissions(emissions);
    expect(previews.length).toBeGreaterThan(0);
    for (const emission of previews) {
      expect(emission.payload.previewRecalculated).toBe(true);
    }
  });

  /**
   * Le cas qui coûte le plus cher au lecteur : il masque son dernier message
   * visible, le serveur lui sert le REMPLAÇANT — plus ancien par construction.
   * Sans le drapeau, ce payload-là est précisément celui que la garde monotone
   * du client jette, et la ligne de liste continue d'afficher l'aperçu de ce
   * qu'il vient de masquer.
   */
  it('marks the reader-scoped payload whose preview legitimately moves BACKWARDS', async () => {
    const emissions: Emission[] = [];

    await emitConversationPreviewUpdate(
      makePrisma({ hiddenForActor: true }),
      makeIo(emissions),
      CONV_ID,
      ACTOR_ID,
      undefined,
      { onlyForReaderUserId: ACTOR_ID }
    );

    const previews = previewEmissions(emissions);
    expect(previews).toHaveLength(1);
    const payload = previews[0]!.payload;
    expect(payload.previewRecalculated).toBe(true);
    expect(payload.lastMessageId).toBe(PREVIOUS_ID);
    expect(new Date(payload.lastMessageAt as string).getTime()).toBe(
      new Date('2026-08-15T09:00:00Z').getTime()
    );
  });
});
