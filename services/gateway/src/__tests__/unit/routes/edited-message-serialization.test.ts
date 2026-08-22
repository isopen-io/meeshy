/**
 * Ce que les DEUX réponses d'édition servent réellement, à travers le
 * sérialiseur.
 *
 * **L'enveloppe de ce fichier est la charge utile RÉELLE, et c'est le point.**
 * `sendSuccess(reply, messageResponse)` reçoit le message LUI-MÊME : la réponse
 * est `{ success, data: <le message> }`, jamais `{ success, data: { message } }`.
 * Une première version de ce témoin construisait la seconde forme à la main et
 * passait, verte, sur un schéma qui décrivait une clé `data.message` qu'aucun
 * gestionnaire ne produit — donc sur un schéma qui aurait servi `data: {}`.
 * C'est la faute que ce dépôt nomme depuis le cycle 62 : **un témoin qui teste
 * une charge utile INVENTÉE n'atteste rien.** Les objets ci-dessous sont
 * calqués sur `messageResponse` tel que les deux gestionnaires le composent.
 *
 * **Ce qui tombe, et ce qui est seulement mesuré.** Le module de routes exige
 * prisma, le service de traduction, l'auth et Socket.IO ; un témoin qui les
 * monterait tous n'observerait plus le schéma mais le harnais. Ce fichier garde
 * donc les deux DÉCISIONS du cycle 93 — le `sender` élargi et l'omission
 * d'`isOnline` — et celles-là tombent pour de bon : en remettant
 * `messageResponseSchema` tel quel, cinq témoins tombent.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { editedMessageResponseSchema } from '../../../routes/conversations/messages-advanced';

/** L'expéditeur tel que le `include` des deux routes le charge — un Participant. */
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

/**
 * `messageResponse` tel que les deux gestionnaires le composent : le message
 * étalé, PAS enveloppé sous une clé `message`.
 */
function messageResponse(overrides: Record<string, unknown> = {}) {
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
    translations: [],
    sender: participantSender(),
    ...overrides
  };
}

let app: FastifyInstance | undefined;

async function serve(data: Record<string, unknown>) {
  app = Fastify({ logger: false });
  app.get('/edited', { schema: { response: { 200: editedMessageResponseSchema } } }, async () => ({
    success: true,
    data
  }));
  await app.ready();

  const response = await app.inject({ method: 'GET', url: '/edited' });
  return response.json().data;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("la charge utile d'édition est le MESSAGE, pas un objet qui le contient", () => {
  it('sert le message à la racine de `data`', async () => {
    const served = await serve(messageResponse());

    expect(served.id).toBe('message-1');
    expect(served.conversationId).toBe('conversation-1');
    expect(served.content).toBe('salut, corrigé');
    expect(served.isEdited).toBe(true);
  });

  it("ne porte AUCUNE clé `message` — l'enveloppe fantôme du cycle 88 bis", async () => {
    const served = await serve(messageResponse());

    expect(served.message).toBeUndefined();
  });

  it('sert `validatedMentions`, que les deux routes recomposent APRÈS l’écriture', async () => {
    const served = await serve(messageResponse());

    expect(served.validatedMentions).toEqual(['bob']);
  });

  it('sert `metadata` ENTIER — la clé la plus facile à vider en silence', async () => {
    const served = await serve(messageResponse());

    expect(served.metadata).toEqual({ postReplyTo: { id: 'post-1', mood: '🌊' } });
  });
});

describe("l'expéditeur est un PARTICIPANT, et le lot le déclare comme tel", () => {
  it('sert les champs que `userMinimalSchema` couvre déjà', async () => {
    const { sender } = await serve(messageResponse());

    expect(sender.id).toBe('participant-1');
    expect(sender.userId).toBe('user-1');
    expect(sender.displayName).toBe('Alice');
    expect(sender.type).toBe('user');
  });

  /**
   * Les témoins qui gardent la décision du cycle 93.
   *
   * `messageSchema.sender` est `userMinimalSchema`, délibérément minimal : il ne
   * déclare ni `role`, ni `language`, ni le `user` imbriqué, que les deux
   * `include` chargent. Remettre le schéma partagé tel quel les fait tomber.
   */
  it('sert `sender.role`, que `userMinimalSchema` ne déclare pas', async () => {
    const { sender } = await serve(messageResponse());

    expect(sender.role).toBe('MEMBER');
  });

  it('sert `sender.language`, que `userMinimalSchema` ne déclare pas', async () => {
    const { sender } = await serve(messageResponse());

    expect(sender.language).toBe('fr');
  });

  it('sert le `sender.user` IMBRIQUÉ, que `userMinimalSchema` ne déclare pas', async () => {
    const { sender } = await serve(messageResponse());

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
      messageResponse({
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
   * `userMinimalSchema` déclare `isOnline`, et la réparation de l'enveloppe
   * (cycle 88 bis) a rendu cette déclaration VIVANTE — vérifié au compilateur,
   * un `isOnline` posé sur l'objet serait désormais SERVI. Aucun des deux
   * `select` ne le charge, donc rien ne fuit ; mais le prochain qui l'ajoute le
   * mettrait sur le fil sans gate.
   *
   * Ce témoin force cette personne à voir ce qu'elle ouvre — il garde une
   * PORTE, pas un bug.
   */
  it("ne sert PAS `isOnline`, même quand l'objet le porte", async () => {
    const { sender } = await serve(
      messageResponse({ sender: participantSender({ isOnline: true }) })
    );

    expect(sender.isOnline).toBeUndefined();
  });

  it("ne sert PAS `lastActiveAt`, même quand l'objet le porte", async () => {
    const { sender } = await serve(
      messageResponse({ sender: participantSender({ lastActiveAt: '2026-08-22T09:00:00.000Z' }) })
    );

    expect(sender.lastActiveAt).toBeUndefined();
  });
});
