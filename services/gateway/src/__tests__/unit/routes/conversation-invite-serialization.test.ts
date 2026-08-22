/**
 * `POST /conversations/:id/invite` — ce que le SÉRIALISEUR laisse passer.
 *
 * Le handler renvoie `{ member: newMember, message }` ; le schéma de réponse
 * déclare `{ membership, message }`. fast-json-stringify supprimant tout champ
 * non déclaré, la clé `member` — et donc le profil du nouvel adhérent, présence
 * comprise — **n'atteint jamais le fil**. Le fichier de schémas partagés
 * documente déjà cette exacte maladie pour `conversationResponseSchema`
 * (« the actual wire response was effectively `{ success: true, data: {} }` »).
 *
 * Ce témoin ne fige PAS le défaut : il garde la propriété de confidentialité
 * qui en découle aujourd'hui — aucune présence ne sort de cette route. Le jour
 * où quelqu'un aligne les deux noms pour faire vivre la charge utile, il tombe,
 * et l'oblige à poser le gate `resolvePrefsOnly` en même temps — celui que
 * `PATCH /conversations/:id` porte désormais, à quelques lignes de là.
 *
 * @jest-environment node
 */
import Fastify from 'fastify';
import { describe, it, expect } from '@jest/globals';
import { conversationParticipantSchema } from '@meeshy/shared/types/api-schemas';

const INVITE_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        membership: conversationParticipantSchema,
      },
    },
  },
} as const;

describe('POST /conversations/:id/invite — sérialisation de la réponse', () => {
  it('ne laisse sortir aucune présence : la clé `member` du handler est supprimée', async () => {
    const app = Fastify();
    app.post('/invite', { schema: { response: { 200: INVITE_RESPONSE_SCHEMA } } }, async () => ({
      success: true,
      data: {
        // La forme EXACTE que produit le handler (`sharing.ts`).
        member: {
          id: 'part-new',
          userId: 'usr-invitee',
          isOnline: true,
          lastActiveAt: new Date('2026-08-22T10:00:00.000Z'),
          user: { id: 'usr-invitee', username: 'bob', isOnline: true },
        },
        message: 'Bob a été invité à la conversation',
      },
    }));

    const res = await app.inject({ method: 'POST', url: '/invite' });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data.message).toContain('invité');
    expect(body.data.member).toBeUndefined();
    expect(body.data.membership).toBeUndefined();
  });

  // Le corollaire, et la raison d'être du témoin ci-dessus : le schéma SAIT
  // servir la présence. Ce n'est que le nom de la clé qui l'en empêche.
  it('servirait bien la présence si la clé portait le nom déclaré', async () => {
    const app = Fastify();
    app.post('/invite', { schema: { response: { 200: INVITE_RESPONSE_SCHEMA } } }, async () => ({
      success: true,
      data: {
        membership: { id: 'part-new', userId: 'usr-invitee', isOnline: true },
        message: 'ok',
      },
    }));

    const res = await app.inject({ method: 'POST', url: '/invite' });
    const body = JSON.parse(res.body);
    await app.close();

    expect(body.data.membership.isOnline).toBe(true);
  });
});
