/**
 * emitConversationPreviewUpdate.emptyPreview.test.ts
 *
 * Le cycle 46 bis a appris à l'aperçu de RECULER quand le serveur déclare
 * l'avoir recalculé. Il reste un cran au-delà du recul : le cas où il n'y a
 * plus rien du tout à reculer vers.
 *
 * Un lecteur qui masque (suppression pour soi, ou purge d'historique) le
 * DERNIER message qui lui restait dans une conversation n'a plus AUCUN message
 * visible. `resolvePersonalPreviewOverrides` pose alors `null` pour lui, et
 * l'émetteur sert `messagePayloadFor(null)` — un payload dont chaque champ du
 * groupe d'aperçu vaut `null`.
 *
 * Ce fichier fixe la FORME de ce payload, parce que les clients en dépendent
 * désormais pour vider la ligne : c'est la PRÉSENCE de la clé `lastMessageId`
 * avec la valeur `null` qui dit « plus aucun message visible ici », par
 * opposition à son ABSENCE, qui dit « cet événement ne parle pas du dernier
 * message » (renommage, changement d'avatar). Omettre la clé — l'optimisation
 * la plus naturelle du monde sur un payload plein de `null` — rendrait le
 * signal indistinguable de ces mises à jour de métadonnées, et la ligne
 * garderait pour toujours l'aperçu de ce que le lecteur vient de masquer.
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

type Emission = { room: string; event: string; payload: Record<string, unknown> };

const makeIo = (emissions: Emission[]) => ({
  to: (room: string) => ({
    emit: (event: string, payload: unknown) => {
      emissions.push({ room, event, payload: payload as Record<string, unknown> });
    },
  }),
});

/**
 * Double COMPLET des quatre modèles lus par l'émetteur — il avale ses propres
 * pannes, donc un double amputé le rend MUET et laisse un témoin de forme vert
 * sur une version qui n'émet rien (leçon du cycle 40).
 *
 * `message.findFirst` répond au dernier message GLOBAL, mais `null` à la
 * requête de REMPLACEMENT : c'est exactement l'état « ce lecteur a masqué le
 * seul message qu'il voyait ».
 */
const makePrisma = () =>
  ({
    participant: {
      findMany: jest.fn(async () => [
        {
          id: 'part-actor',
          userId: ACTOR_ID,
          user: { systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
        },
        {
          id: 'part-peer',
          userId: PEER_ID,
          user: { systemLanguage: 'en', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null },
        },
      ]),
    },
    message: {
      findFirst: jest.fn(async (q: any) => {
        const isReplacement = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
        if (isReplacement) return null;
        return {
          id: LATEST_ID,
          content: 'le seul message',
          senderId: 'part-peer',
          originalLanguage: 'en',
          translations: { fr: { text: 'le seul message', isEncrypted: false } },
          createdAt: new Date('2026-08-16T10:00:00Z'),
        };
      }),
    },
    userMessageDeletion: {
      findMany: jest.fn(async () => [{ userId: ACTOR_ID, messageId: LATEST_ID }]),
    },
    userConversationPreferences: { findMany: jest.fn(async () => []) },
  }) as never;

const previewEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);

describe("emitConversationPreviewUpdate — « ce lecteur n'a plus aucun message visible »", () => {
  it('emits the whole preview group as EXPLICIT nulls, keys present', async () => {
    const emissions: Emission[] = [];

    await emitConversationPreviewUpdate(
      makePrisma(),
      makeIo(emissions),
      CONV_ID,
      ACTOR_ID,
      undefined,
      { onlyForReaderUserId: ACTOR_ID }
    );

    const previews = previewEmissions(emissions);
    expect(previews).toHaveLength(1);
    const payload = previews[0]!.payload;

    // La PRÉSENCE de la clé est le fait mesuré, pas seulement sa valeur : un
    // `undefined` ou une clé omise se lit côté client comme « cet événement ne
    // parle pas du dernier message ».
    expect(Object.prototype.hasOwnProperty.call(payload, 'lastMessageId')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(payload, 'lastMessageAt')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(payload, 'lastMessagePreview')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(payload, 'lastMessageTranslations')).toBe(true);
    // Cycle 50 — `location` a rejoint le groupe, et cette assertion dit
    // maintenant la même chose que ses quatre sœurs. Elle attendait
    // `undefined`, ce qui mesurait la forme du code (un spread conditionnel)
    // plutôt que le fait voulu : le commentaire d'origine — « aucune épingle
    // de position ne survit au message qui la portait » — est mieux servi par
    // une clé PRÉSENTE et nulle, seule forme que ce témoin tient pour un
    // signal (cf. l'en-tête de ce bloc, trois lignes plus haut).
    expect(Object.prototype.hasOwnProperty.call(payload, 'location')).toBe(true);

    expect(payload.lastMessageId).toBeNull();
    expect(payload.lastMessageAt).toBeNull();
    expect(payload.lastMessagePreview).toBeNull();
    expect(payload.lastMessageTranslations).toBeNull();
    expect(payload.lastMessageOriginalLanguage).toBeNull();
    expect(payload.senderId).toBeNull();
    // Aucune épingle de position ne survit non plus au message qui la portait.
    expect(payload.location).toBeNull();
  });

  /**
   * Le drapeau et le vidage voyagent ENSEMBLE. Le client applique le vidage sur
   * la seule foi de `lastMessageId: null` — c'est le seul émetteur capable de
   * produire cette forme — mais la garde monotone ne cède, elle, que devant le
   * drapeau. Les dissocier ferait un payload qui dit « plus rien » à un client
   * qui le rangerait parmi les diffusions périmées.
   */
  it('still declares the payload as a recalculation', async () => {
    const emissions: Emission[] = [];

    await emitConversationPreviewUpdate(
      makePrisma(),
      makeIo(emissions),
      CONV_ID,
      ACTOR_ID,
      undefined,
      { onlyForReaderUserId: ACTOR_ID }
    );

    expect(previewEmissions(emissions)[0]!.payload.previewRecalculated).toBe(true);
  });

  /**
   * Contre-épreuve : le participant qui n'a rien masqué reçoit le message
   * global, clés pleines. Sans elle, un émetteur qui viderait TOUT LE MONDE
   * passerait les deux témoins ci-dessus.
   */
  it('serves the untouched reader the real message, not the cleared shape', async () => {
    const emissions: Emission[] = [];

    await emitConversationPreviewUpdate(
      makePrisma(),
      makeIo(emissions),
      CONV_ID,
      ACTOR_ID,
      undefined,
      { onlyForReaderUserId: PEER_ID }
    );

    const previews = previewEmissions(emissions);
    expect(previews).toHaveLength(1);
    const payload = previews[0]!.payload;
    expect(payload.lastMessageId).toBe(LATEST_ID);
    expect(payload.lastMessagePreview).toBe('le seul message');
    expect(payload.lastMessageAt).not.toBeNull();
  });
});
