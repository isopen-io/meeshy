/**
 * Ce que les DEUX réponses d'édition servent réellement, à travers le
 * sérialiseur.
 *
 * Les deux déclaraient `message: { type: 'object', description: '…' }` : sans
 * `properties`, fast-json-stringify (`additionalProperties: false` par défaut)
 * rendait `{}`. La suite qui les couvre — `conversation-messages-advanced.test.ts`,
 * 152 témoins — ne pouvait pas le voir : elle MOCKE `sendSuccess`, donc rien n'y
 * traverse jamais un schéma.
 *
 * Ce fichier monte une vraie instance Fastify sur le schéma exporté et assert
 * sur les VALEURS servies.
 *
 * **Ce qui tombe ici, et ce qui est seulement mesuré.** La réparation `{}` → charge
 * utile ne se prouve pas en revertant : le module de routes exige prisma, le
 * service de traduction, l'auth et Socket.IO, et un témoin qui les monterait
 * tous n'observerait plus le schéma mais le harnais. Elle est mesurée par le
 * compilateur, dans le journal du cycle. Ce que ces témoins GARDENT, ce sont
 * les deux décisions du lot — le `sender` élargi et l'omission d'`isOnline` — et
 * ceux-là tombent pour de bon : une substitution par `messageResponseSchema`
 * tel quel en fait tomber trois, une reprise d'`isOnline` en fait tomber un.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { editedMessageResponseSchema } from '../../../routes/conversations/messages-advanced';

/** L'expéditeur tel que le `include` de la route PUT le charge — un Participant. */
function participantSender(overrides: Record<string, unknown> = {}) {
  return {
    id: 'participant-1',
    userId: 'user-1',
    displayName: 'Alice',
    avatar: '/avatars/alice.png',
    type: 'user',
    role: 'MEMBER',
    language: 'fr',
    user: {
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice',
      firstName: 'Alice',
      lastName: 'Lemoine',
      avatar: '/avatars/alice.png',
      role: 'USER'
    },
    ...overrides
  };
}

function editedMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversationId: 'conversation-1',
    senderId: 'participant-1',
    content: 'salut, corrigé',
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: true,
    editedAt: '2026-08-22T09:00:00.000Z',
    createdAt: '2026-08-22T08:00:00.000Z',
    validatedMentions: ['bob'],
    metadata: { postReplyTo: { id: 'post-1', mood: '🌊' } },
    sender: participantSender(),
    ...overrides
  };
}

let app: FastifyInstance | undefined;

async function serve(message: Record<string, unknown>) {
  app = Fastify({ logger: false });
  app.get('/edited', { schema: { response: { 200: editedMessageResponseSchema } } }, async () => ({
    success: true,
    data: { message }
  }));
  await app.ready();

  const response = await app.inject({ method: 'GET', url: '/edited' });
  return response.json().data.message;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("la réponse d'édition n'est plus `{}`", () => {
  it('sert le message et son identité', async () => {
    const served = await serve(editedMessage());

    expect(served.id).toBe('message-1');
    expect(served.conversationId).toBe('conversation-1');
    expect(served.content).toBe('salut, corrigé');
    expect(served.isEdited).toBe(true);
    expect(served.editedAt).toBe('2026-08-22T09:00:00.000Z');
  });

  it('sert `validatedMentions`, que les deux routes recomposent APRÈS l’écriture', async () => {
    const served = await serve(editedMessage());

    expect(served.validatedMentions).toEqual(['bob']);
  });

  it('sert `metadata` ENTIER — la clé la plus facile à vider en silence', async () => {
    const served = await serve(editedMessage());

    expect(served.metadata).toEqual({ postReplyTo: { id: 'post-1', mood: '🌊' } });
  });
});

describe("l'expéditeur est un PARTICIPANT, et le lot le déclare comme tel", () => {
  it('sert les champs que `userMinimalSchema` couvre déjà', async () => {
    const { sender } = await serve(editedMessage());

    expect(sender.id).toBe('participant-1');
    expect(sender.userId).toBe('user-1');
    expect(sender.displayName).toBe('Alice');
    expect(sender.type).toBe('user');
  });

  /**
   * Les trois témoins qui gardent la décision du lot.
   *
   * `messageResponseSchema` (`@meeshy/shared`) décrit exactement cette
   * enveloppe et aurait fait une substitution séduisante — mais son `sender`
   * est `userMinimalSchema`, délibérément minimal, qui ne déclare ni `role`, ni
   * `language`, ni le `user` imbriqué. Ces trois-là tomberaient.
   */
  it('sert `sender.role`, que `userMinimalSchema` ne déclare pas', async () => {
    const { sender } = await serve(editedMessage());

    expect(sender.role).toBe('MEMBER');
  });

  it('sert `sender.language`, que `userMinimalSchema` ne déclare pas', async () => {
    const { sender } = await serve(editedMessage());

    expect(sender.language).toBe('fr');
  });

  it('sert le `sender.user` IMBRIQUÉ, que `userMinimalSchema` ne déclare pas', async () => {
    const { sender } = await serve(editedMessage());

    expect(sender.user).toEqual({
      id: 'user-1',
      username: 'alice',
      displayName: 'Alice',
      firstName: 'Alice',
      lastName: 'Lemoine',
      avatar: '/avatars/alice.png',
      role: 'USER'
    });
  });

  it('sert un expéditeur ANONYME sans fabriquer son compte', async () => {
    const { sender } = await serve(
      editedMessage({
        sender: participantSender({ userId: null, type: 'anonymous', user: null })
      })
    );

    expect(sender.userId).toBeNull();
    expect(sender.type).toBe('anonymous');
    expect(sender.user).toBeNull();
  });
});

describe('la présence ne peut pas entrer par cette porte', () => {
  /**
   * Le témoin fail-closed du lot.
   *
   * `userMinimalSchema` déclare `isOnline` ; aucune des deux routes ne le
   * charge. Tant que la charge utile sortait `{}`, la question ne se posait
   * pas. En rendant la déclaration vivante, reprendre `isOnline` armerait le
   * piège du cycle 84 : le jour où quelqu'un l'ajoute au `select`, il
   * atteindrait le fil sans gate et sans qu'un témoin tombe.
   *
   * Ce témoin force cette personne à voir ce qu'elle ouvre — il garde une
   * PORTE, pas un bug.
   */
  it("ne sert PAS `isOnline`, même quand l'objet le porte", async () => {
    const { sender } = await serve(
      editedMessage({ sender: participantSender({ isOnline: true }) })
    );

    expect(sender.isOnline).toBeUndefined();
  });

  it("ne sert PAS `lastActiveAt`, même quand l'objet le porte", async () => {
    const { sender } = await serve(
      editedMessage({ sender: participantSender({ lastActiveAt: '2026-08-22T09:00:00.000Z' }) })
    );

    expect(sender.lastActiveAt).toBeUndefined();
  });
});
