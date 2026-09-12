/**
 * **L'APERÇU D'UN DERNIER MESSAGE PROTÉGÉ NE PART PAS EN CLAIR** — le témoin
 * qui manquait (audit de cohérence iOS ↔ passerelle, 2026-09-11).
 *
 * ## Ce qui était cassé, et pourquoi personne ne le voyait
 *
 * Quatre drapeaux gouvernent la protection d'un aperçu de liste :
 * `isViewOnce`, `isBlurred`, `expiresAt`, `effectFlags`. Ils étaient
 *
 * - **chargés** par le `select` Prisma (`core-selects.ts`),
 * - **répandus** par le mapper (`...msgRest`, `core-list.ts`),
 * - **décodés** par iOS (`APIConversationLastMessage`,
 *   `packages/MeeshySDK/.../ConversationModels.swift`),
 * - et **classés** par une loi dédiée (`LastMessageSummaryKind` :
 *   « le contenu ne doit pas être exposé »),
 *
 * …mais **non déclarés** par `messageMinimalSchema`. Or `fast-json-stringify`
 * retire en SILENCE toute propriété absente du schéma. Les quatre drapeaux
 * n'arrivaient donc jamais par REST — et le serveur, lui, servait `content`
 * sans condition.
 *
 * Résultat mesurable : **au démarrage à froid, la ligne de liste affichait le
 * texte en clair du dernier message d'une conversation à vue unique, floutée
 * ou périmée.** Le socket, qui transporte les mêmes drapeaux en clés plates,
 * réparait l'affichage à la première mise à jour temps réel — ce qui rendait le
 * défaut fugace, donc invisible à l'usage comme au test.
 *
 * ## Pourquoi ce témoin asserte sur le corps SÉRIALISÉ
 *
 * C'est la seule lecture qui mesure quelque chose. Asserter sur l'objet que le
 * handler construit prouverait qu'il POSE les champs — ce qu'il a toujours
 * fait. Le défaut vivait un cran plus bas, dans le sérialiseur compilé depuis
 * le schéma. Même parti que `posts-canvas-refusal-contract.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { conversationListResponseSchema } from '@meeshy/shared/types/api-schemas';
import { lastMessageTextMayTravel } from '@meeshy/shared/utils/last-message-protection';

const SECRET = 'le code du coffre est 4731';

/** La charge que le mapper compose pour UN aperçu, réduite à ce qui se mesure. */
const apercu = (surcharge: Record<string, unknown>) => ({
  id: 'm1',
  content: SECRET,
  senderId: 'p1',
  messageType: 'text',
  createdAt: new Date('2026-09-11T10:00:00Z').toISOString(),
  ...surcharge,
});

const conversation = (lastMessage: Record<string, unknown> | null) => ({
  id: 'c1',
  type: 'direct',
  createdAt: new Date('2026-09-11T09:00:00Z').toISOString(),
  lastMessage,
});

async function serveur(charge: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get('/conversations', {
    schema: { response: { 200: conversationListResponseSchema } },
  }, async () => charge);
  await app.ready();
  return app;
}

const servi = async (lastMessage: Record<string, unknown> | null) => {
  const app = await serveur({
    success: true,
    data: [conversation(lastMessage)],
    pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
  });
  const res = await app.inject({ method: 'GET', url: '/conversations' });
  await app.close();
  return res.json().data[0].lastMessage;
};

describe('les quatre drapeaux de protection SURVIVENT au sérialiseur', () => {
  /**
   * LE TÉMOIN DE LA RÉGRESSION. Avant la déclaration des quatre champs dans
   * `messageMinimalSchema`, ce test échouait sur les quatre `toBe` : le
   * sérialiseur rendait un `lastMessage` sans aucun d'eux.
   */
  it('un aperçu à vue unique porte ses drapeaux jusqu’au client', async () => {
    const last = await servi(
      apercu({ isViewOnce: true, isBlurred: false, expiresAt: null, effectFlags: 4, content: '' }),
    );
    expect(last.isViewOnce).toBe(true);
    expect(last.isBlurred).toBe(false);
    expect(last.effectFlags).toBe(4);
    expect(last).toHaveProperty('expiresAt');
  });

  it('un aperçu éphémère porte sa date de péremption', async () => {
    const expiresAt = new Date('2026-09-11T11:00:00Z').toISOString();
    const last = await servi(apercu({ expiresAt, isViewOnce: false, isBlurred: false, effectFlags: 2 }));
    expect(last.expiresAt).toBe(expiresAt);
  });

  it('un aperçu ordinaire garde son texte — la garde ne mord pas sur le cas nominal', async () => {
    const last = await servi(apercu({ isViewOnce: false, isBlurred: false, expiresAt: null, effectFlags: 0 }));
    expect(last.content).toBe(SECRET);
    expect(last.isViewOnce).toBe(false);
  });
});

/**
 * LA LOI ET LE SÉRIALISEUR SE RÉPONDENT. Ce bloc ne teste pas le handler (il
 * vit dans une route trop lourde pour être montée ici) : il épingle que la loi
 * appliquée par `core-list.ts` classe bien en PROTÉGÉ les trois formes dont le
 * schéma transporte désormais les drapeaux. Si l'une des deux moitiés dérivait
 * — un drapeau retiré du schéma, ou un cas retiré de la loi — l'autre
 * deviendrait inutile en silence, et c'est exactement ce qui s'était produit.
 */
describe('la loi que le serveur applique couvre les trois formes protégées', () => {
  const maintenant = new Date('2026-09-11T12:00:00Z');

  it('vue unique, flouté et éphémère périmé : le texte ne voyage pas', () => {
    expect(lastMessageTextMayTravel({ isViewOnce: true }, maintenant)).toBe(false);
    expect(lastMessageTextMayTravel({ isBlurred: true }, maintenant)).toBe(false);
    expect(lastMessageTextMayTravel({ expiresAt: '2026-09-11T11:00:00Z' }, maintenant)).toBe(false);
  });

  it('éphémère encore valide : le texte voyage — c’est tout son propos', () => {
    expect(lastMessageTextMayTravel({ expiresAt: '2026-09-11T13:00:00Z' }, maintenant)).toBe(true);
  });
});

afterAll(() => {
  // Rien à libérer : chaque témoin ferme son instance.
});
