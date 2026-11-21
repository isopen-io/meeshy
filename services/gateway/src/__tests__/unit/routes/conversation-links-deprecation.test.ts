/**
 * `GET /conversations/:conversationId/links` ANNONCE enfin son successeur (#4351).
 *
 * Ses deux sœurs du même fichier (`POST /conversations/:id/new-link`, `POST
 * /conversations/join/:linkId`) portent `depreciee(...)` depuis #4169/#4353.
 * Celle-ci ne le faisait pas alors qu'elle a un successeur STRICT et déjà
 * servi : `GET /links?conversationId=` (`routes/links/user.ts`, #4170) — voir
 * le commentaire posé au site d'enregistrement.
 *
 * Traverse la VRAIE sérialisation (`app.inject()`), comme
 * `attachments-legacy-deprecation.test.ts` pour le même mécanisme.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSharingRoutes } from '../../../routes/conversations/sharing';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439044';

/** Pose `authContext` comme le ferait `createUnifiedAuthMiddleware` pour un JWT valide. */
async function fakeRequiredAuth(request: FastifyRequest): Promise<void> {
  (request as any).authContext = {
    type: 'user', isAuthenticated: true, isAnonymous: false,
    userId: USER_ID, displayName: 'Ana', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true,
    registeredUser: { id: USER_ID, role: 'USER' },
  };
}

async function noopOptionalAuth(): Promise<void> {}

const LINK_ROW = {
  id: '507f1f77bcf86cd799439055',
  linkId: 'mshy_Abcdef12',
  name: 'Invitation',
  description: null,
  maxUses: 100,
  currentUses: 7,
  expiresAt: null,
  isActive: true,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  createdBy: USER_ID,
};

function buildPrisma(membership: unknown, links: readonly unknown[] = []) {
  return {
    participant: {
      findFirst: async () => membership,
    },
    conversationShareLink: {
      findMany: async () => links,
    },
  };
}

async function buildApp(
  membership: unknown = { role: 'member' },
  links: readonly unknown[] = []
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma(membership, links) as never);
  // `POST /conversations/:id/invite` (même fichier) déclare `onRequest:
  // [fastify.authenticate]` — un décorateur posé ailleurs en production.
  // `registerSharingRoutes` lève à l'ENREGISTREMENT sans lui.
  app.decorate('authenticate', fakeRequiredAuth as never);
  registerSharingRoutes(app as never, (app as any).prisma, fakeRequiredAuth);
  await app.ready();
  return app;
}

const getLinks = (app: FastifyInstance, conversationId: string = CONV_ID) =>
  app.inject({ method: 'GET', url: `/conversations/${conversationId}/links` });

describe("GET /conversations/:conversationId/links — dit qu'elle est en sursis", () => {
  it('porte Deprecation et un Link qui nomme le successeur AVEC le conversationId réel — succès', async () => {
    const app = await buildApp({ role: 'member' });

    const res = await getLinks(app);

    expect(res.statusCode).toBe(200);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(`</api/v1/links?conversationId=${CONV_ID}>; rel="successor-version"`);

    await app.close();
  });

  it("l'annonce part MÊME sur un refus (non membre ⇒ le 404 d'une conversation inexistante, #8116) — c'est l'ADRESSE qui est en sursis", async () => {
    const app = await buildApp(null); // pas de ligne Participant ⇒ 404

    const res = await getLinks(app);

    expect(res.statusCode).toBe(404);
    expect(res.headers['deprecation']).toMatch(/^@\d+$/);
    expect(res.headers['link']).toBe(`</api/v1/links?conversationId=${CONV_ID}>; rel="successor-version"`);

    await app.close();
  });

  it('le successeur porte le VRAI conversationId de la requête, jamais un gabarit', async () => {
    const otherConvId = '507f1f77bcf86cd799439099';
    const app = await buildApp({ role: 'member' });

    const res = await getLinks(app, otherConvId);

    expect(res.headers['link']).toBe(`</api/v1/links?conversationId=${otherConvId}>; rel="successor-version"`);

    await app.close();
  });
});

/**
 * CE QUE CETTE ROUTE SERT RÉELLEMENT — et ce que son commentaire affirmait
 * qu'elle servait (#20190).
 *
 * Le gestionnaire contournait `sendSuccess()` — le producteur UNIQUE que le
 * `CLAUDE.md` impose — sous cette justification, posée en NOTE sur le
 * `reply.send` :
 *
 * > Cannot use sendSuccess() — response includes a top-level `isModerator`
 * > field that iOS SDK (ConversationLinksResponse) and web parse at root level.
 * > Migration to sendSuccess requires a coordinated client update (breaking
 * > change).
 *
 * **Les trois affirmations sont fausses, mesurées le 2026-11-21 :**
 *
 * 1. `ConversationLinksResponse` n'existe **nulle part** dans le dépôt — ni
 *    dans `packages/MeeshySDK`, ni dans `apps/ios`, ni ailleurs.
 * 2. **Aucun client ne lit `isModerator`** de cette route : la seule occurrence
 *    du dépôt est une propriété calculée PRIVÉE d'une vue iOS sans rapport
 *    (`ParticipantsView.swift`).
 * 3. **Aucun client n'APPELLE cette route.** Les deux seules occurrences de son
 *    chemin sont les catalogues d'adresses GÉNÉRÉS depuis `route-manifest.json`
 *    (`ConversationsEndpoint.swift`, `ApiRoutesConversations.kt`) : zéro site
 *    d'appel sur les trois clients.
 *
 * Et le champ que ce contournement existait pour préserver **n'atteignait
 * aucun fil** : le schéma de réponse de la route ne déclare ni `isModerator`
 * ni `participantCount`, et `fast-json-stringify` applique
 * `additionalProperties: false` par défaut. Le contournement protégeait un
 * champ que son propre schéma supprimait.
 *
 * > **Une NOTE qui justifie d'enfreindre une règle du dépôt est une
 * > AFFIRMATION, et se vérifie comme telle** — au même titre qu'un compte
 * > (cycle 93), un tri (cycle 86 bis) ou une contrainte de schéma (cycle 94).
 * > Celle-ci a tenu une route hors du producteur unique pendant toute sa vie,
 * > en nommant un type qui n'a jamais existé. Et elle était INVISIBLE aux
 * > témoins de la route, qui assertaient `reply._body` — l'objet du
 * > gestionnaire — jamais le fil.
 *
 * Ces témoins traversent `app.inject()`, donc le VRAI sérialiseur : c'est la
 * seule place d'où l'on peut voir ce qu'un client reçoit.
 */
describe('GET /conversations/:conversationId/links — ce que le FIL porte (#20190)', () => {
  it('sert ses liens sous `data`, par le producteur unique', async () => {
    const app = await buildApp({ role: 'moderator' }, [LINK_ROW]);

    const res = await getLinks(app);

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: LINK_ROW.id, linkId: LINK_ROW.linkId, currentUses: 7 });

    await app.close();
  });

  it("ne porte NI `isModerator` NI `participantCount` — le schéma les supprimait, et le gestionnaire ne les compose plus", async () => {
    const app = await buildApp({ role: 'moderator' }, [LINK_ROW]);

    const res = await getLinks(app);
    const body = res.json();

    expect(body).not.toHaveProperty('isModerator');
    expect(body.data[0]).not.toHaveProperty('participantCount');

    await app.close();
  });

  it("le rang gouverne toujours la SÉLECTION — c'est la seule chose que `isModerator` décidait vraiment", async () => {
    // Un membre non-modérateur ne voit que SES liens : la variable survit, seul
    // le champ de réponse part. Sans ce témoin, retirer le champ pourrait
    // emporter le filtre, et personne ne le verrait.
    const wheres: Array<Record<string, unknown>> = [];
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('prisma', {
      participant: { findFirst: async () => ({ role: 'member' }) },
      conversationShareLink: {
        findMany: async (args: any) => { wheres.push(args.where); return []; },
      },
    } as never);
    app.decorate('authenticate', fakeRequiredAuth as never);
    registerSharingRoutes(app as never, (app as any).prisma, fakeRequiredAuth);
    await app.ready();

    await getLinks(app);

    expect(wheres[0]).toMatchObject({ conversationId: CONV_ID, createdBy: USER_ID });

    await app.close();
  });
});
