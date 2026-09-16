/**
 * **UN CURSEUR DE PAGINATION QUI N'EST PAS UN IDENTIFIANT N'ATTEINT PAS LA BASE**
 * (#6857).
 *
 * ## Ce qui était cassé
 *
 * `GET /conversations?before=<chaîne quelconque>` rendait **500**. La cause est
 * à `core-list.ts` : le curseur part en `prisma.conversation.findFirst({ where:
 * { id: beforeCursor } })`, Prisma caste `id` en ObjectId sous MongoDB, la
 * conversion LÈVE, et le `catch` générique du handler rend
 * `sendInternalError('Error retrieving conversations')`.
 *
 * Mesuré sur staging, la veille du correctif :
 *
 * ```
 * before=000000000000000000000000  → 200   (ObjectId valide, inexistant)
 * before=alice-bob-local           → 500   « Error retrieving conversations »
 * ```
 *
 * Ce n'est pas une faute théorique : iOS COMPOSE ce curseur. Quand
 * `nextCursor` est nil, `ConversationListViewModel.loadMore()` retombe sur
 * l'identifiant de la conversation la plus ancienne connue LOCALEMENT. Une
 * entrée de cache que le serveur ne sert plus empoisonne donc la requête — et
 * comme « Réessayer » rappelle `loadMore()`, qui recompose le MÊME curseur
 * depuis le MÊME état, l'erreur ne peut structurellement jamais se lever. La
 * liste restait bloquée sur une seule ligne là où l'API en servait 21.
 *
 * ## Pourquoi la garde est DÉCLARATIVE
 *
 * Un `if` dans le handler aurait marché, et aurait été une discipline de plus à
 * tenir : il faut s'en souvenir, et rien ne rougit quand on l'oublie. Le
 * `pattern` du schéma, lui, est appliqué par Fastify AVANT que le handler ne
 * s'exécute — la question ne se pose plus, elle est répondue à la frontière.
 *
 * ## Pourquoi ce témoin monte une VRAIE route
 *
 * Asserter que le schéma CONTIENT un `pattern` vérifierait une chaîne, pas un
 * comportement : le témoin verdirait sur un schéma juste qu'aucune route ne
 * porte. Ici Fastify valide pour de bon, et c'est son verdict qu'on lit.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { conversationListQuerystringSchema } from '../routes/conversations/list-querystring';

const OBJECT_ID = '68f3808baf186ffd9583b0fa';

async function serveur(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.get('/conversations', { schema: { querystring: conversationListQuerystringSchema } },
          async () => ({ success: true, data: [] }));
  await app.ready();
  return app;
}

const statut = async (query: string): Promise<number> => {
  const app = await serveur();
  const res = await app.inject({ method: 'GET', url: `/conversations${query}` });
  await app.close();
  return res.statusCode;
};

describe("le curseur `before` de /conversations est un identifiant, et rien d'autre (#6857)", () => {

  /**
   * Sans ce premier témoin, un schéma vidé — ou un import qui rendrait un objet
   * sans propriétés — laisserait TOUT passer, et les lois ci-dessous verdiraient
   * en ne gardant plus rien. C'est la garde de l'instrument, pas de la règle.
   */
  it('décrit bien des paramètres — un schéma vide validerait tout', () => {
    const proprietes = conversationListQuerystringSchema.properties;
    expect(Object.keys(proprietes).length).toBeGreaterThan(0);
    expect(proprietes).toHaveProperty('before');
  });

  it('accepte un identifiant de 24 caractères hexadécimaux', async () => {
    await expect(statut(`?before=${OBJECT_ID}`)).resolves.toBe(200);
  });

  it('accepte une requête SANS curseur — la première page n\'en a pas', async () => {
    await expect(statut('')).resolves.toBe(200);
  });

  /**
   * La forme EXACTE mesurée sur staging. Un identifiant local — celui qu'iOS
   * composait depuis son cache — doit être refusé À LA FRONTIÈRE.
   */
  it('refuse un curseur qui n\'est pas un identifiant, en 400 et non en 500', async () => {
    await expect(statut('?before=alice-bob-local')).resolves.toBe(400);
  });

  /**
   * Les trois familles qui atteignaient Prisma : trop court, trop long, et
   * hexadécimal de la bonne longueur mais porteur d'un caractère hors classe.
   * Les tester séparément évite qu'un `pattern` relâché (`.{24}`) passe pour
   * juste.
   */
  it.each([
    ['trop court', '68f3808baf186ffd9583b0f'],
    ['trop long', '68f3808baf186ffd9583b0fa0'],
    ['hors classe hexadécimale', '68f3808baf186ffd9583b0fz'],
    ['vide', ''],
  ])('refuse un curseur %s', async (_cas, valeur) => {
    await expect(statut(`?before=${valeur}`)).resolves.toBe(400);
  });
});
