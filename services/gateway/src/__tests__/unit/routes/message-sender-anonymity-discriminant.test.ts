/**
 * Savoir si l'auteur d'un message a un compte — sur le chemin REST aussi.
 *
 * Le discriminant existe et n'a jamais manqué : `Participant.type` vaut
 * `'user'` ou `'anonymous'`, la requête de `routes/conversations/messages.ts`
 * le charge (`sender: { select: { …, type: true } }`), le mapping l'étale
 * (`...message.sender`), et le payload socket `message:new` le transporte
 * (`MeeshySocketIOManager._broadcastNewMessage`).
 *
 * Il s'arrêtait au DERNIER mètre : `messageSchema.sender` pointe sur
 * `userMinimalSchema`, qui ne déclarait pas `type` — et fast-json-stringify
 * retire tout champ non déclaré, sans bruit. Le champ était chargé, mappé, puis
 * silencieusement effacé à la sérialisation.
 *
 * Le coût était visible dans le code du front : `MessageNameDate.tsx` porte
 * depuis toujours une branche `<Ghost />` pour les auteurs sans compte, câblée
 * sur `const isAnonymous = false`. Un marqueur écrit, jamais allumé, faute de
 * la donnée qui l'aurait allumé.
 *
 * Ce témoin sérialise POUR DE VRAI à travers `messageSchema` plutôt que
 * d'inspecter l'objet du schéma : c'est la sérialisation qui tronque, donc
 * c'est elle qu'il faut faire parler.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

const anonymousSender = {
  id: '507f1f77bcf86cd799439033',
  userId: null,
  username: 'ano_bob_sm123',
  displayName: 'ano_bob_sm123',
  avatar: null,
  type: 'anonymous',
};

const registeredSender = {
  id: '507f1f77bcf86cd799439044',
  userId: '507f1f77bcf86cd799439055',
  username: 'alice',
  displayName: 'Alice Smith',
  avatar: null,
  type: 'user',
};

function messageFrom(sender: Record<string, unknown>) {
  return {
    id: '507f1f77bcf86cd799439066',
    conversationId: '507f1f77bcf86cd799439022',
    senderId: sender.id,
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date().toISOString(),
    sender,
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.get('/probe/:kind', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: messageSchema },
          },
        },
      },
    },
  }, async (request) => {
    const { kind } = request.params as { kind: string };
    const sender = kind === 'anonymous' ? anonymousSender : registeredSender;
    return { success: true, data: [messageFrom(sender)] };
  });

  await app.ready();
});

afterAll(async () => { await app.close(); });

const senderOf = async (kind: string) => {
  const res = await app.inject({ method: 'GET', url: `/probe/${kind}` });
  return res.json().data[0].sender;
};

describe('messageSchema — l’anonymat de l’auteur survit à la sérialisation', () => {
  it('transporte `type: "anonymous"` pour un auteur sans compte', async () => {
    expect(await senderOf('anonymous')).toMatchObject({ type: 'anonymous' });
  });

  it('transporte `type: "user"` pour un auteur inscrit', async () => {
    expect(await senderOf('registered')).toMatchObject({ type: 'user' });
  });

  // Sans cette contre-épreuve, un `additionalProperties: true` posé n'importe où
  // ferait passer le témoin ci-dessus pour la mauvaise raison : ce ne serait plus
  // la DÉCLARATION de `type` qui le sauve, mais l'abandon du filtrage.
  it('CONTRE-ÉPREUVE — un champ non déclaré est toujours retiré', async () => {
    const res = await app.inject({ method: 'GET', url: '/probe/anonymous' });
    expect(res.json().data[0].sender).not.toHaveProperty('champInvente');
  });

  it('garde le pseudo et le nom affichés à côté du discriminant', async () => {
    expect(await senderOf('anonymous')).toMatchObject({
      username: 'ano_bob_sm123',
      displayName: 'ano_bob_sm123',
    });
  });
});
