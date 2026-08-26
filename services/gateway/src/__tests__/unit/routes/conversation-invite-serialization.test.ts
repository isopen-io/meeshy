/**
 * `POST /conversations/:id/invite` — ce que le SÉRIALISEUR laisse passer.
 *
 * HISTOIRE DE CE FICHIER, parce qu'elle porte la règle.
 *
 * Le handler renvoyait `{ member, message }` quand le schéma déclarait
 * `{ membership, message }`. fast-json-stringify supprimant tout champ non
 * déclaré, le profil du nouvel adhérent — présence comprise — n'atteignait
 * jamais le fil. Ce témoin gardait alors la propriété de CONFIDENTIALITÉ qui en
 * découlait par accident (« aucune présence ne sort de cette route »), en disant
 * explicitement qu'il tomberait le jour où quelqu'un aligne les deux noms, et
 * qu'il l'obligerait à poser le gate dans le même lot.
 *
 * Ce jour est le cycle 92 bis, et le piège a fonctionné comme prévu : les deux
 * arrivent ensemble. La route sert désormais un participant SÉRIALISÉ sous la
 * clé déclarée, dont la présence est résolue pour l'INVITEUR par
 * `resolveForTarget` — régime STRICT (2026-08-25) : soi/ADMIN+/ami seuls,
 * jamais la co-participation que l'invitation vient de créer.
 *
 * Ce que ces témoins gardent maintenant : que la charge utile ATTEINT le fil
 * (elle ne l'avait jamais fait), et que le sérialiseur ne peut pas y remettre
 * une présence que la source a masquée.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect } from '@jest/globals';
import { conversationParticipantSchema } from '@meeshy/shared/types/api-schemas';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';

/** Le bloc EXACT que déclare `sharing.ts` sur cette route. */
const INVITE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        participant: conversationParticipantSchema,
      },
    },
  },
} as const;

/** Le rang Prisma que le handler charge, avec son état privé par paire. */
const invitedRow = () => ({
  id: 'part-new',
  conversationId: 'conv-1',
  userId: 'usr-invitee',
  type: 'user',
  displayName: 'Bob',
  avatar: null,
  role: 'member',
  language: 'fr',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date('2026-08-22T10:00:00.000Z'),
  joinedAt: new Date('2026-08-22T10:00:00.000Z'),
  permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true },
  nickname: 'surnom privé',
  shareLinkId: 'lnk-1',
  bannedAt: null,
  user: {
    id: 'usr-invitee',
    username: 'bob',
    firstName: 'Bob',
    lastName: 'B',
    displayName: 'Bob',
    avatar: null,
    role: 'USER',
    systemLanguage: 'fr',
    regionalLanguage: 'en',
    customDestinationLanguage: null,
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
});

async function serve(data: unknown) {
  const app = Fastify();
  app.post('/invite', { schema: { response: { 200: INVITE_RESPONSE_SCHEMA } } }, async () => ({
    success: true,
    data,
  }));
  const res = await app.inject({ method: 'POST', url: '/invite' });
  await app.close();
  return JSON.parse(res.body);
}

describe('POST /conversations/:id/invite — sérialisation de la réponse', () => {
  it('sert le nouvel adhérent — ce que la clé mal nommée empêchait', async () => {
    const body = await serve({
      participant: serializeConversationParticipant(invitedRow()),
      message: 'Bob a été invité à la conversation',
    });

    expect(body.data.message).toContain('invité');
    expect(body.data.participant.participantId).toBe('part-new');
    expect(body.data.participant.username).toBe('bob');
    expect(body.data.participant.conversationRole).toBe('member');
  });

  // La règle du cycle 84 : le gate s'applique à la SOURCE. Le sérialiseur n'est
  // pas une garde de confidentialité — il ne peut que laisser passer ce que la
  // source lui donne, et c'est précisément ce que ce témoin vérifie.
  it('ne peut pas remettre une présence que la source a masquée', async () => {
    const body = await serve({
      participant: serializeConversationParticipant(invitedRow(), {
        presence: { showOnline: false, showLastSeenTimestamp: false },
      }),
      message: 'ok',
    });

    expect(body.data.participant.isOnline).toBe(false);
    expect(body.data.participant.lastActiveAt).toBeNull();
  });

  it('sert la présence quand aucune préférence ne s\'y oppose', async () => {
    const body = await serve({
      participant: serializeConversationParticipant(invitedRow(), {
        presence: { showOnline: true, showLastSeenTimestamp: true },
      }),
      message: 'ok',
    });

    expect(body.data.participant.isOnline).toBe(true);
    expect(body.data.participant.lastActiveAt).toBe('2026-08-22T10:00:00.000Z');
  });

  // Ceci ne tient QUE parce que la fabrique ne recopie pas ces champs : le
  // sérialiseur les supprimerait ici, mais la diffusion Socket.IO de la route
  // jumelle (`PATCH …/role`) n'a aucun sérialiseur pour le faire.
  it('ne porte pas l\'état privé par paire du rang Prisma', async () => {
    const body = await serve({
      participant: serializeConversationParticipant(invitedRow()),
      message: 'ok',
    });

    expect(body.data.participant).not.toHaveProperty('nickname');
    expect(body.data.participant).not.toHaveProperty('shareLinkId');
    expect(body.data.participant).not.toHaveProperty('conversationId');
  });

  // Le défaut d'origine, gardé comme RAISON du correctif : si quelqu'un
  // repointait le handler sur `member`, la réponse redeviendrait vide.
  it('montre pourquoi la clé comptait : `member` ne sort toujours pas', async () => {
    const body = await serve({
      member: serializeConversationParticipant(invitedRow()),
      message: 'ok',
    });

    expect(body.data.member).toBeUndefined();
    expect(body.data.participant).toBeUndefined();
  });
});
