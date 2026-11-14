/**
 * #18124 — la réaction à une PIÈCE JOINTE porte l'identité de son auteur, comme
 * sa jumelle message-level.
 *
 * Le miroir Kotlin DÉCLARE et LIT `userId` sur cet événement depuis toujours
 * (`AttachmentReactionUpdateEvent`, puis `MessageDeltaApplier.kt` :
 * `val mine = viewerId != null && event.userId == viewerId`). Le contrat ne le
 * déclarait nulle part et l'émetteur ne le posait jamais : un champ optionnel
 * absent se décode en `null` sans bruit, donc `mine` était TOUJOURS faux.
 * Conséquence pour l'utilisateur : sur le chemin « conversation non ouverte »,
 * la réaction qu'il vient de poser depuis un autre appareil n'est jamais
 * marquée comme sienne — la pastille ne s'allume pas, et le prochain tap
 * compte comme un ajout au lieu d'un retrait.
 *
 * Ce n'était pas une décision : le doc-comment du contrat exemptait cet
 * événement en disant que « l'état *ma réaction* reste maintenu côté client »,
 * ce qui est vrai de l'appareil qui RÉAGIT et faux de tous les autres.
 *
 * **Aucun double partiel de `@meeshy/shared/types/socketio-events` ici**, à la
 * différence de la suite voisine : un double qui énumère deux constantes à la
 * main est ce qui a laissé `COMMENT_UNLIKED` s'émettre sous le nom `undefined`
 * pendant des mois (cycle 104). Le témoin assert sur le COUPLE (room, charge).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import type { AttachmentReactionUpdateEventData } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));

import { AttachmentReactionHandler } from '../../../socketio/handlers/AttachmentReactionHandler';
import type { AttachmentReactionHandlerDependencies } from '../../../socketio/handlers/AttachmentReactionHandler';

const MESSAGE = 'aaaaaa000000000000000001';
const ATTACHMENT = 'bbbbbb000000000000000002';
const CONVERSATION = 'cccccc000000000000000003';
const PARTICIPANT = 'dddddd000000000000000004';
const USER = 'eeeeee000000000000000005';
const GUEST_PARTICIPANT = 'ffffff000000000000000006';
const SOCKET = 'socket-abc';

type Emission = { readonly room: string; readonly event: string; readonly payload: AttachmentReactionUpdateEventData };

function harness(options: { readonly anonymous?: boolean } = {}) {
  const anonymous = options.anonymous === true;
  const emissions: Emission[] = [];
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload: payload as AttachmentReactionUpdateEventData });
      },
    }),
  };

  // L'invité de lien partagé : sa clé de « connected user » est sa clé de
  // PARTICIPANT, et c'est ce que `resolveParticipant` rend sous `userId`.
  const key = anonymous ? GUEST_PARTICIPANT : USER;
  const connectedUsers = new Map<string, unknown>([[key, {
    id: key,
    userId: anonymous ? undefined : USER,
    participantId: anonymous ? GUEST_PARTICIPANT : null,
    isAnonymous: anonymous,
    displayName: anonymous ? 'Invitée' : 'Alice',
  }]]);

  const participantRow = anonymous
    ? { id: GUEST_PARTICIPANT, displayName: 'Invitée', nickname: null }
    : { id: PARTICIPANT, displayName: 'Alice', nickname: null };

  const prisma = {
    message: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONVERSATION }) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(participantRow) },
    messageAttachment: { findUnique: jest.fn<any>().mockResolvedValue({ messageId: MESSAGE }) },
  };

  const service = {
    resolveConversationId: jest.fn<any>().mockResolvedValue(CONVERSATION),
    addAttachmentReaction: jest.fn<any>().mockResolvedValue({ changed: true }),
    removeAttachmentReaction: jest.fn<any>().mockResolvedValue(true),
    getReactionSummary: jest.fn<any>().mockResolvedValue({ '👍': 1 }),
  };

  const deps = {
    io: io as never,
    prisma: prisma as never,
    service: service as never,
    connectedUsers: connectedUsers as never,
    socketToUser: new Map([[SOCKET, key]]),
  } as unknown as AttachmentReactionHandlerDependencies;

  return { handler: new AttachmentReactionHandler(deps), emissions };
}

const react = async (h: ReturnType<typeof harness>) =>
  h.handler.handleAdd(
    { id: SOCKET } as never,
    { attachmentId: ATTACHMENT, messageId: MESSAGE, emoji: '👍' },
  );

const reactionEmission = (emissions: readonly Emission[]): Emission | undefined =>
  emissions.find((e) => e.event === SERVER_EVENTS.ATTACHMENT_REACTION_ADDED);

describe("#18124 — l'écho d'une réaction de pièce jointe nomme son auteur", () => {
  it("sert le `User.id` du réacteur inscrit, sur la room de la conversation", async () => {
    const h = harness();

    await react(h);

    const sent = reactionEmission(h.emissions);
    expect(sent?.room).toBe(ROOMS.conversation(CONVERSATION));
    expect(sent?.payload.userId).toBe(USER);
  });

  it("garde `participantId` à côté : les deux identités voyagent, aucune ne remplace l'autre", async () => {
    const h = harness();

    await react(h);

    const sent = reactionEmission(h.emissions);
    expect(sent?.payload.participantId).toBe(PARTICIPANT);
    // `not.toBe(participantId)` SEUL ne peut pas tomber : un champ absent vaut
    // `undefined`, qui diffère déjà de tout. L'assertion porte donc sur la
    // PRÉSENCE d'une chaîne, puis sur la distinction des deux identités.
    expect(typeof sent?.payload.userId).toBe('string');
    expect(sent?.payload.userId).not.toBe(sent?.payload.participantId);
  });

  it("sert `null` pour un invité de lien partagé — jamais sa clé de participant sous un champ qui déclare un `User.id`", async () => {
    const h = harness({ anonymous: true });

    await react(h);

    const sent = reactionEmission(h.emissions);
    expect(sent?.payload.participantId).toBe(GUEST_PARTICIPANT);
    expect(sent?.payload.userId).toBeNull();
  });
});
