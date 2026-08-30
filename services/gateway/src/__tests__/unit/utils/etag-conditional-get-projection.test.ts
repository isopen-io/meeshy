import Fastify from 'fastify';
import { conditionalGetOnSend } from '../../../utils/etag';

/**
 * #4173 critère 6 — « Interaction avec le levier acquis : l'ETag doit
 * distinguer deux jeux de `fields`/`expand` différents. Vérifier explicitement
 * qu'un 304 ne peut pas être servi à un appelant qui a changé de projection ».
 *
 * Ce fichier ne modifie ni `utils/etag.ts` ni `server.ts` : la lecture du hook
 * app-wide (`conditionalGetOnSend`, monté en `onSend` sur `server.ts:357`)
 * montre que la propriété demandée tient déjà PAR CONSTRUCTION — et c'est
 * exactement ce que documentent en commentaire `routes/me/get-me.ts`
 * (§ « L'ETag ne se calcule PAS ici ») et `routes/directory/person.ts`
 * (§ « Le cache conditionnel est CALCULÉ ici, et pas laissé au crochet
 * global ») : le validateur est le hash du corps DÉJÀ SÉRIALISÉ (ou, pour les
 * deux routes qui posent leur propre ETag, de l'enveloppe APRÈS filtrage), pas
 * d'une clé indépendante du contenu (URL sans query, `updatedAt`, etc.). Deux
 * projections différentes produisent donc deux corps différents, donc deux
 * ETags différents — un `If-None-Match` porté d'une projection vers une autre
 * ne peut matcher que par une collision SHA-256, jamais par construction.
 *
 * Ce test le VÉRIFIE explicitement sur le hook RÉEL (`app.inject()`, jamais un
 * double du handler — CLAUDE.md § « Un témoin de lecture assert sur ce que la
 * réponse DIT »), avec une route minimale dont le corps varie par `fields=`/
 * `expand=`, exactement comme `GET /directory/people/:handle` ou `GET /me`.
 * La preuve est générale : elle ne dépend d'aucune route métier, donc reste
 * valable pour toute future route qui adopte `fields`/`expand` sans poser son
 * propre ETag (critère 1 de #4173, hors du territoire de ce lot).
 */
function buildProjectionAwareApp() {
  const app = Fastify({ logger: false });
  app.addHook('onSend', conditionalGetOnSend);
  app.get('/resource', async (req, reply) => {
    const { fields, expand } = req.query as { fields?: string; expand?: string };
    const full: Record<string, unknown> = { id: '1', name: 'Alice', email: 'alice@example.com', bio: 'hello' };
    const requested = fields ? new Set(fields.split(',')) : null;
    const body: Record<string, unknown> = requested
      ? Object.fromEntries(Object.entries(full).filter(([key]) => requested.has(key)))
      : { ...full };
    if (expand === 'stats') body.stats = { posts: 42 };
    reply.header('content-type', 'application/json; charset=utf-8');
    return body;
  });
  return app;
}

describe('conditionalGetOnSend — #4173 critère 6 (ETag distingue fields/expand)', () => {
  it('pose un ETag sur la 1re lecture, et rend un 304 body-less sur une lecture IDENTIQUE avec ce même If-None-Match', async () => {
    const app = buildProjectionAwareApp();
    const first = await app.inject({ method: 'GET', url: '/resource?fields=id,name' });
    expect(first.statusCode).toBe(200);
    const etag = first.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: '/resource?fields=id,name',
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });

  it("un If-None-Match pris sous fields=id,name ne déclenche JAMAIS de 304 sous fields=id,name,email,bio — l'appelant a changé de projection", async () => {
    const app = buildProjectionAwareApp();
    const narrow = await app.inject({ method: 'GET', url: '/resource?fields=id,name' });
    const etagNarrow = narrow.headers.etag as string;

    const wide = await app.inject({
      method: 'GET',
      url: '/resource?fields=id,name,email,bio',
      headers: { 'if-none-match': etagNarrow },
    });

    expect(wide.statusCode).toBe(200);
    expect(wide.json()).toEqual({ id: '1', name: 'Alice', email: 'alice@example.com', bio: 'hello' });
    expect(wide.headers.etag).not.toBe(etagNarrow);
    await app.close();
  });

  it('et le SENS inverse tient aussi : un If-None-Match pris sous une projection LARGE ne fait pas sauter un GET plus étroit', async () => {
    const app = buildProjectionAwareApp();
    const wide = await app.inject({ method: 'GET', url: '/resource?fields=id,name,email,bio' });
    const etagWide = wide.headers.etag as string;

    const narrow = await app.inject({
      method: 'GET',
      url: '/resource?fields=id,name',
      headers: { 'if-none-match': etagWide },
    });

    expect(narrow.statusCode).toBe(200);
    expect(narrow.json()).toEqual({ id: '1', name: 'Alice' });
    expect(narrow.headers.etag).not.toBe(etagWide);
    await app.close();
  });

  it("MÊME défaut sur ?expand= : un If-None-Match posé SANS expand=stats ne fait pas sauter le calcul quand stats est ensuite demandé", async () => {
    const app = buildProjectionAwareApp();
    const base = await app.inject({ method: 'GET', url: '/resource' });
    const etagBase = base.headers.etag as string;

    const expanded = await app.inject({
      method: 'GET',
      url: '/resource?expand=stats',
      headers: { 'if-none-match': etagBase },
    });

    expect(expanded.statusCode).toBe(200);
    expect(expanded.json().stats).toEqual({ posts: 42 });
    expect(expanded.headers.etag).not.toBe(etagBase);
    await app.close();
  });

  it('un If-None-Match FABRIQUÉ (jamais rendu par le serveur, quelle que soit la projection) ne déclenche jamais de 304', async () => {
    const app = buildProjectionAwareApp();
    const res = await app.inject({
      method: 'GET',
      url: '/resource?fields=id,name',
      headers: { 'if-none-match': '"etag-invente-a-la-main"' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
