/**
 * Le compteur qui GOUVERNE le retrait d'un alias deprecie doit le SERVIR (#4470).
 *
 * ## Pourquoi ces temoins ne sont pas dans la suite du service
 *
 * La suite du service (`unit/services/route-usage.service.test.ts`) mesure le
 * COMPTAGE ; ceux-ci mesurent ce que la route S5 REND. La distinction est la
 * raison d'etre du lot, et elle est contre-intuitive :
 *
 * **La table brute comptait DEJA ces adresses.** `record()` incremente le seau
 * `methode route plateforme version` sans regarder aucun prefixe — un temoin
 * pose sur `record()` serait donc reste VERT avant comme apres le correctif,
 * et n'aurait rien prouve. Ce qui manquait est la MATERIALISATION dans la
 * portee `watched` : le seau TOTAL (`*` / `*`), le pre-semis a zero, la ligne
 * `watched[]` avec son `matched`, et le filtre de `servir()`. C'est cette
 * portee, et elle seule, que la route sert par defaut — et c'est sur elle que
 * quelqu'un repondra « les appelle-t-on encore ? » avant le `sunset`.
 *
 * Le temoin de contraste (`scope=all`) est donc essentiel : il reste vert des
 * deux cotes du correctif, et c'est ce qui prouve que le temoin principal
 * mesure le defaut plutot que l'absence de trafic.
 *
 * ## Le zero de ces neuf adresses est le SEUL argument de leur existence
 *
 * Un alias deprecie n'est servi que pour la duree de son sursis, et les quatre
 * modules qui les posent disent tous que leur retrait se decide sur ce
 * compteur (#4275) : `voiceAnalysisLegacyAliasRoutes` (5 adresses racine,
 * `sunset` 2027-02-25) et les quatre alias non versionnes de
 * `socketIOAdminRoutes`, `attachmentLegacyFileRoutes` et `userDeletionsRoutes`. Une adresse dont la
 * seule justification est un sursis, et que le compteur qui gouverne ce sursis
 * ne materialise pas, ne peut PAS etre retiree par la mesure — donc pas
 * retiree du tout.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { routeUsageAdminRoutes } from '../../../../routes/admin/route-usage';
import { registerRouteUsageHook } from '../../../../plugins/route-usage.plugin';
import {
  RouteUsageCounter,
  ROUTES_SURVEILLEES,
  setRouteUsageCounterForTests,
  type EtatSurveillee,
  type InstantaneUsage,
} from '../../../../services/route-usage.service';

type ChargeServie = InstantaneUsage & {
  readonly scope: string;
  readonly entriesTotal: number;
  readonly entriesTruncated: boolean;
};

type LigneManifeste = { readonly method: string; readonly path: string };

const PREFIXE = '/api/v1/admin';
const MANIFESTE = path.resolve(__dirname, '../../../../../route-manifest.json');

/**
 * Les neuf adresses attendues, ecrites A LA MAIN.
 *
 * Elles se trouvent en CROISANT deux mesures : les 17 adresses du manifeste
 * hors `/api/v1`, et les sites qui posent `depreciee()`. Une lecture seule en
 * avait rate une — `DELETE /api/conversations/:conversationId/delete-for-me`,
 * rangee parmi les `known-gap` de `ALLOWED_OUTSIDE_API_V1` alors qu'elle est,
 * seule de son module, un alias EN SURSIS (#4317).
 *
 * Les DERIVER de `ROUTES_SURVEILLEES` rendrait ces temoins vacuement verts le
 * jour ou quelqu'un retire une entree : « pour chaque element d'une liste
 * vide » ne tombe jamais. Le decompte et les adresses sont donc poses ici, et
 * confrontes a la liste.
 */
const ALIAS_ATTENDUS: readonly string[] = [
  'GET /attachments/:attachmentId/analysis',
  'POST /attachments/:attachmentId/analysis',
  'POST /attachments/batch/analysis',
  'GET /voice/analysis',
  'POST /voice/analysis',
  'GET /api/socketio/stats',
  'POST /api/socketio/disconnect-user',
  'GET /api/attachments/file/*',
  'DELETE /api/conversations/:conversationId/delete-for-me',
];

let compteur: RouteUsageCounter;
let ouverts: FastifyInstance[] = [];

function horsPrefixeApiV1() {
  return ROUTES_SURVEILLEES.filter((r) => !r.route.startsWith('/api/v1/'));
}

/**
 * Le harnais monte le hook GLOBAL — comme `server.ts` — la route S5, et un
 * remplacant a chacune des huit adresses d'`ALIAS_ATTENDUS`. Les remplacants
 * ne font rien : ce qu'on mesure est le MOTIF que Fastify resout et ce que le
 * compteur en fait, jamais la reponse de l'alias.
 *
 * Le harnais monte la liste ECRITE, jamais `ROUTES_SURVEILLEES` : deriver les
 * montages de la liste sous test ferait tomber le temoin de CONTRASTE pour la
 * mauvaise raison — sans route montee, l'appel n'a plus de motif et tombe sous
 * `(unrouted)`, ce qui ressemble a « la table brute ne le compte pas ».
 */
async function monter(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    (request as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      registeredUser: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'BIGBOSS' },
    };
  });

  registerRouteUsageHook(app, compteur);

  for (const adresse of ALIAS_ATTENDUS) {
    const [method = '', url = ''] = adresse.split(' ');
    app.route({ method: method as 'GET', url, handler: async () => ({ ok: true }) });
  }
  app.get('/api/v1/auth/me', async () => ({ ok: true }));
  await app.register(routeUsageAdminRoutes, { prefix: PREFIXE });

  await app.ready();
  ouverts.push(app);
  return app;
}

async function lire(app: FastifyInstance, query = ''): Promise<ChargeServie> {
  const res = await app.inject({ method: 'GET', url: `${PREFIXE}/route-usage${query}` });
  expect(res.statusCode).toBe(200);
  return res.json().data as ChargeServie;
}

beforeEach(() => {
  compteur = new RouteUsageCounter({ watched: ROUTES_SURVEILLEES, instanceId: 'gw-4470' });
  setRouteUsageCounterForTests(compteur);
});

afterEach(async () => {
  await Promise.all(ouverts.map((app) => app.close()));
  ouverts = [];
  setRouteUsageCounterForTests(null);
});

// ───────────────────────────────────────────────────────────────────────────
// Ce que la route SERT — le seul temoin qui distingue ce defaut
// ───────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/admin/route-usage — la portee servie materialise les alias en sursis', () => {
  it('sert l’appel enregistre sur /voice/analysis dans la portee par defaut', async () => {
    const app = await monter();
    await app.inject({ method: 'GET', url: '/voice/analysis' });

    const servi = await lire(app);
    expect(servi.scope).toBe('watched');

    const ligne = servi.watched.find((w: EtatSurveillee) => w.route === '/voice/analysis' && w.method === 'GET');
    expect(ligne).toBeDefined();
    expect(ligne?.count).toBe(1);
    expect(ligne?.matched).toBe(true);

    const seaux = servi.entries.filter((e) => e.route === '/voice/analysis');
    expect(seaux.length).toBeGreaterThan(0);
  });

  it('CONTRASTE — la table brute les comptait deja, donc un temoin sur record() ne prouverait rien', async () => {
    // Ce temoin est VERT des deux cotes du correctif, a dessein : c'est lui qui
    // etablit que le defaut porte sur la MATERIALISATION et non sur le
    // comptage. Sans lui, un lecteur pourrait croire que l'appel n'etait pas
    // compte du tout — et le correctif viserait alors autre chose.
    const app = await monter();
    await app.inject({ method: 'GET', url: '/voice/analysis' });

    const brut = await lire(app, '?scope=all');
    expect(brut.scope).toBe('all');
    expect(brut.entries.some((e) => e.route === '/voice/analysis' && e.count === 1)).toBe(true);
  });

  it('pre-seme a ZERO les neuf alias, pour qu’un silence soit OBSERVE et non ABSENT', async () => {
    // Aucun appel : la valeur de tout le lot tient a ce que ce zero-la se
    // distingue d'un seau jamais vu (§ « Le zero OBSERVE n'est pas l'absence
    // de seau », route-usage.service.ts).
    const app = await monter();

    const servi = await lire(app);
    const servis = servi.watched
      .filter((w: EtatSurveillee) => !w.route.startsWith('/api/v1/'))
      .map((w: EtatSurveillee) => `${w.method} ${w.route}`)
      .sort();

    expect(servis).toEqual([...ALIAS_ATTENDUS].sort());
    for (const w of servi.watched.filter((x: EtatSurveillee) => !x.route.startsWith('/api/v1/'))) {
      expect(w.count).toBe(0);
      expect(w.lastSeenAt).toBeNull();
    }
  });

  it('reconcilie les neuf alias avec la table de routage REELLE', async () => {
    // `matched: false` serait un verdict PERMANENT et faux — l'alarme qui crie
    // sans arret. Le joker `/api/attachments/file/*` est le cas qui pouvait le
    // produire : `hasRoute` rend bien `true` dessus (mesure #4470).
    const app = await monter();

    const servi = await lire(app);
    const alias = servi.watched.filter((w: EtatSurveillee) => !w.route.startsWith('/api/v1/'));
    expect(alias).toHaveLength(ALIAS_ATTENDUS.length);
    for (const w of alias) {
      expect(w.matched).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Les adresses declarees designent des routes REELLES
// ───────────────────────────────────────────────────────────────────────────

describe('Les alias surveilles hors /api/v1 sont ceux du manifeste', () => {
  it('nomme exactement les neuf adresses depreciees hors /api/v1', () => {
    const declares = horsPrefixeApiV1()
      .map((r) => `${r.method} ${r.route}`)
      .sort();
    expect(declares).toEqual([...ALIAS_ATTENDUS].sort());
  });

  it('epuise le manifeste — ce qui reste hors /api/v1 n’est PAS un alias en sursis', () => {
    // C'est le temoin qui referme la LISTE, et il vaut plus que les autres.
    //
    // Une enumeration ecrite a la main porte deux affirmations : « ces adresses
    // appliquent la regle » (verifiable) et « ce sont les seules concernees »
    // (presque jamais verifiee). La premiere passe de ce lot en avait declare
    // HUIT ; le croisement manifeste x sites `depreciee()` en a rendu NEUF —
    // `DELETE /api/conversations/:id/delete-for-me`, rangee parmi les
    // `known-gap` de `ALLOWED_OUTSIDE_API_V1` alors qu'elle est, seule de son
    // module, un alias EN SURSIS (#4317).
    //
    // Le reste est ferme et NOMME : deux sondes d'infrastructure, qui ne se
    // versionnent pas et n'ont aucun sunset ; six routes de
    // `userDeletionsRoutes` qui ne portent AUCUNE annonce `depreciee()` et
    // dont le successeur n'existe pas — une dette en attente d'une decision
    // produit, jamais un alias. Le jour ou une adresse hors `/api/v1` apparait,
    // ce temoin rougit et quelqu'un doit dire laquelle des deux elle est.
    const manifeste = JSON.parse(fs.readFileSync(MANIFESTE, 'utf-8')) as {
      readonly routes: readonly LigneManifeste[];
    };
    const horsApiV1 = manifeste.routes
      .filter((r) => !r.path.startsWith('/api/v1'))
      .map((r) => `${r.method} ${r.path}`);
    expect(horsApiV1).toHaveLength(17);

    const surveilles = new Set(ALIAS_ATTENDUS);
    expect(horsApiV1.filter((a) => !surveilles.has(a)).sort()).toEqual([
      'DELETE /api/messages/:messageId/delete-for-me',
      'DELETE /api/messages/bulk/delete-for-me',
      'GET /api/user/deleted-conversations',
      'GET /health',
      'GET /info',
      'POST /api/conversations/:conversationId/clear-history',
      'POST /api/conversations/:conversationId/restore-for-me',
      'POST /api/messages/:messageId/restore-for-me',
    ]);
  });

  it('chacune existe dans route-manifest.json — un motif ecrit a la main peut ne designer RIEN', () => {
    const manifeste = JSON.parse(fs.readFileSync(MANIFESTE, 'utf-8')) as {
      readonly routes: readonly LigneManifeste[];
    };
    const montees = new Set(manifeste.routes.map((r) => `${r.method} ${r.path}`));

    const declares = horsPrefixeApiV1().map((r) => `${r.method} ${r.route}`);
    expect(declares).toHaveLength(ALIAS_ATTENDUS.length);
    for (const adresse of declares) {
      expect(montees.has(adresse)).toBe(true);
    }
  });
});
