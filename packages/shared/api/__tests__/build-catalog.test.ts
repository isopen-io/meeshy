/**
 * TDD de `buildApiEndpointsCatalog()` — la fonction PURE qui transforme une
 * liste de routes (method, path) en source TypeScript du catalogue.
 *
 * Ces témoins ne lisent JAMAIS `services/gateway/route-manifest.json` : ils
 * fabriquent de petits manifestes synthétiques, pour deux raisons.
 *
 *   1. Isoler la RÈGLE DE DÉRIVATION (segments → namespace/clé/fonction) de
 *      la donnée réelle — un témoin sur le vrai manifeste ne prouverait rien
 *      sur un cas qu'il ne contient pas encore.
 *   2. Ne jamais toucher, même en lecture instable, à un fichier hors
 *      territoire pendant qu'on prouve un ROUGE : muter un manifeste
 *      synthétique local est sans risque, muter l'artefact du gateway ne
 *      l'est pas (trois autres agents y travaillent en ce moment).
 *
 * Le cliquet qui compare cette fonction au VRAI manifeste vit à côté :
 * `endpoints-manifest-ratchet.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { buildApiEndpointsCatalog, type ManifestRouteInput } from '../build-catalog.js';

/** Tout le texte généré — l'index `endpoints.ts` et chaque module de groupe. */
function generated(routes: readonly ManifestRouteInput[]): string {
  const built = buildApiEndpointsCatalog(routes);
  return [built.source, ...built.groups.map((group) => group.source)].join('\n');
}

/** Le module d'UN groupe, tel qu'écrit dans `api/endpoints/<fichier>.ts`. */
function group(routes: readonly ManifestRouteInput[], namespace: string): string {
  return buildApiEndpointsCatalog(routes).groups.find((candidate) => candidate.namespace === namespace)?.source ?? '';
}

describe('buildApiEndpointsCatalog — dérivation namespace/clé', () => {
  it('un chemin fixe (sans paramètre) devient une constante littérale', () => {
    const routes: ManifestRouteInput[] = [{ method: 'POST', path: '/api/v1/auth/login' }];
    const source = group(routes, 'auth');

    expect(source).toContain("export const login = '/api/v1/auth/login';");
    expect(source).not.toContain('=>');
  });

  it('un chemin réduit à son namespace (aucun segment restant) prend la clé "root"', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/conversations' },
      { method: 'POST', path: '/api/v1/conversations' },
    ];
    const { pathTemplates } = buildApiEndpointsCatalog(routes);

    expect(group(routes, 'conversations')).toContain("export const root = '/api/v1/conversations';");
    // GET + POST sur le MÊME chemin ne doivent produire qu'UNE seule entrée de
    // catalogue — c'est le verbe qui varie au site d'appel, jamais le chemin.
    expect(pathTemplates).toEqual(['/api/v1/conversations']);
  });

  it('un segment `:param` devient un paramètre de fonction interpolé ET ENCODÉ au bon endroit (#7716)', () => {
    const routes: ManifestRouteInput[] = [{ method: 'GET', path: '/api/v1/conversations/:id' }];

    expect(group(routes, 'conversations')).toContain(
      'export const byId = (id: string): string => `/api/v1/conversations/${encodeURIComponent(id)}`;'
    );
  });

  it('plusieurs `:param` sont interpolés dans leur ORDRE d’apparition dans l’URL', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'DELETE', path: '/api/v1/communities/:groupId/members/:memberId' },
    ];
    expect(group(routes, 'communities')).toContain(
      'export const byGroupIdMembersByMemberId = (groupId: string, memberId: string): string => ' +
        '`/api/v1/communities/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`;'
    );
  });

  it('un segment `*` (chemin TUS) devient un paramètre `wildcard` dont seuls les SEGMENTS sont encodés', () => {
    const routes: ManifestRouteInput[] = [{ method: 'POST', path: '/api/v1/uploads/*' }];

    expect(group(routes, 'uploads')).toContain(
      "export const byWildcard = (wildcard: string): string => `/api/v1/uploads/${wildcard.split('/').map(encodeURIComponent).join('/')}`;"
    );
  });

  it('un segment à tiret est PascalCase-ifié sans le tiret', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/conversations/check-identifier/:identifier' },
    ];
    expect(group(routes, 'conversations')).toContain(
      'export const checkIdentifierByIdentifier = (identifier: string): string => ' +
        '`/api/v1/conversations/check-identifier/${encodeURIComponent(identifier)}`;'
    );
  });

  it('un segment débutant par un chiffre (2fa) reste un identifiant valide', () => {
    const routes: ManifestRouteInput[] = [{ method: 'POST', path: '/api/v1/auth/2fa/verify' }];
    // `2faVerify` n'est pas un identifiant JS valide (débute par un chiffre) —
    // la règle préfixe donc le PREMIER token numérique d'un `N`.
    expect(group(routes, 'auth')).toContain("export const n2FaVerify = '/api/v1/auth/2fa/verify';");
  });

  it('/api/xxx SANS version (userDeletionsRoutes) prend un namespace apiLegacy* — jamais le même que /api/v1/xxx', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'DELETE', path: '/api/conversations/:conversationId/delete-for-me' },
      { method: 'GET', path: '/api/v1/conversations/:id' },
    ];
    const { source, groups } = buildApiEndpointsCatalog(routes);

    expect(source).toContain('apiLegacyConversations: apiLegacyConversationsGroup,');
    expect(group(routes, 'apiLegacyConversations')).toContain(
      'export const byConversationIdDeleteForMe = (conversationId: string): string => ' +
        '`/api/conversations/${encodeURIComponent(conversationId)}/delete-for-me`;'
    );
    // Les deux familles ne doivent JAMAIS fusionner sous le même namespace —
    // sans quoi une lecture par erreur de l'une renverrait l'autre.
    expect(source).toContain('conversations: conversationsGroup,');
    expect(groups.map((candidate) => candidate.fileName)).toEqual(['api-legacy-conversations', 'conversations']);
  });

  it('un chemin SANS aucun préfixe /api (health, voice/analysis…) prend son premier segment pour namespace', () => {
    const routes: ManifestRouteInput[] = [{ method: 'GET', path: '/health' }];
    expect(buildApiEndpointsCatalog(routes).source).toContain(
      "import * as healthGroup from './endpoints/health.js';"
    );
    expect(group(routes, 'health')).toContain("export const root = '/health';");
  });

  it('le chemin PORTE son préfixe complet — /api/v1 est écrit dans la valeur, jamais recalculé', () => {
    // Décision du lot (critère 1c) : le manifeste ne préfixe pas toutes les
    // routes de façon uniforme (7 routes sans AUCUN /api, 7 sous /api SANS
    // version) — un catalogue qui prépendrait /api/v1 à l'exécution serait
    // donc FAUX sur ces 14 routes. La valeur porte le chemin COMPLET tel que
    // le manifeste le déclare, `buildApiUrl()` (apps/web) sait déjà passer un
    // chemin `/api/v...` intact.
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/auth/me' },
      { method: 'GET', path: '/voice/analysis' },
    ];
    expect(group(routes, 'auth')).toContain("export const me = '/api/v1/auth/me';");
    expect(group(routes, 'voice')).toContain("export const analysis = '/voice/analysis';");
  });

  it('un type ApiPath et une table de méthodes par chemin sont dérivés', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/conversations' },
      { method: 'POST', path: '/api/v1/conversations' },
      { method: 'GET', path: '/api/v1/auth/me' },
    ];
    const { source, pathMethods } = buildApiEndpointsCatalog(routes);

    expect(source).toContain('export type ApiPath = (typeof API_PATH_TEMPLATES)[number];');
    expect(pathMethods.get('/api/v1/conversations')).toEqual(['GET', 'POST']);
    expect(pathMethods.get('/api/v1/auth/me')).toEqual(['GET']);
  });

  it('aucun niveau de sécurité n’est dérivé comme DONNÉE — le manifeste le porte "inconnu" par refus délibéré (#4276)', () => {
    // Le mot peut légitimement apparaître en PROSE explicative (le fichier
    // généré documente pourquoi il est absent) — ce qui est interdit, c'est
    // qu'il devienne une clé ou une valeur de code : `securityLevel: …` ou un
    // libellé `'S0'`..`'S6'` porté par une route.
    const routes: ManifestRouteInput[] = [{ method: 'GET', path: '/api/v1/auth/me' }];
    const source = generated(routes);

    expect(source).not.toMatch(/securityLevel\s*:/);
    expect(source).not.toMatch(/'S[0-6]'/);
  });

  it('la sortie est déterministe : ordre des routes en entrée sans effet sur la source générée', () => {
    const a: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/messages/:messageId' },
      { method: 'GET', path: '/api/v1/auth/me' },
    ];
    const b: ManifestRouteInput[] = [...a].reverse();

    expect(generated(a)).toBe(generated(b));
  });

  it('une clé qui est un mot réservé (`me/export`) est exportée sous son nom par un alias local', () => {
    const routes: ManifestRouteInput[] = [{ method: 'GET', path: '/api/v1/me/export' }];

    expect(group(routes, 'me')).toContain(
      "const export_ = '/api/v1/me/export';\nexport { export_ as export };"
    );
  });

  it('chaque entrée porte ses verbes et son chemin brut en commentaire', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/links/:id' },
      { method: 'DELETE', path: '/api/v1/links/:id' },
    ];

    expect(group(routes, 'links')).toContain('/** GET · DELETE /api/v1/links/:id */');
  });

  it('une collision de namespace/clé entre deux chemins DIFFÉRENTS fait lever une erreur explicite plutôt que d’écraser en silence', () => {
    // Fabriqué : deux chemins dont la dérivation mécanique produirait la même
    // adresse de catalogue. Le vrai manifeste n'en a aucun (419 chemins, 0
    // collision — vérifié) ; ce témoin garde la règle qui le garantit.
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/foo/bar-baz' },
      { method: 'GET', path: '/api/v1/foo/bar_baz' },
    ];

    expect(() => buildApiEndpointsCatalog(routes)).toThrow(/collision/i);
  });

  it('une méthode HTTP hors de la liste connue fait lever une erreur plutôt que de la taire', () => {
    const routes: ManifestRouteInput[] = [{ method: 'TRACE', path: '/api/v1/auth/me' }];

    expect(() => buildApiEndpointsCatalog(routes)).toThrow(/méthode/i);
  });
});

describe('buildApiEndpointsCatalog — les entrées DÉRIVÉES sont exposées (#4282)', () => {
  /**
   * La projection Swift du catalogue (#4282) doit porter les MÊMES noms que la
   * projection TypeScript, sans quoi « un chemin s'écrit à un seul endroit »
   * devient « un chemin s'écrit une fois par surface, avec un nom par
   * surface ». Elle a donc besoin de la STRUCTURE dérivée — namespace, clé,
   * paramètres — et pas seulement du fichier `.ts` rendu, qu'il faudrait
   * re-parser pour la retrouver.
   *
   * Re-dériver le nommage côté Swift serait la faute que ce lot corrige :
   * une seconde règle, juste le jour où on l'écrit, divergente au premier
   * changement de segment.
   */
  it('expose namespace, clé, chemin brut, paramètres et verbes pour chaque adresse', () => {
    const routes: ManifestRouteInput[] = [
      { method: 'POST', path: '/api/v1/auth/login' },
      { method: 'GET', path: '/api/v1/conversations/:conversationId/messages' },
      { method: 'POST', path: '/api/v1/conversations/:conversationId/messages' },
    ];

    const { entries } = buildApiEndpointsCatalog(routes);

    expect(entries).toHaveLength(2);

    const login = entries.find((entry) => entry.rawPath === '/api/v1/auth/login');
    expect(login).toMatchObject({
      namespace: 'auth',
      key: 'login',
      paramNames: [],
      methods: ['POST'],
    });

    const messages = entries.find((entry) => entry.rawPath.endsWith('/messages'));
    expect(messages).toMatchObject({
      namespace: 'conversations',
      paramNames: ['conversationId'],
    });
    expect(messages?.methods).toEqual(['GET', 'POST']);
  });

  it("l'ordre des entrées ne dépend pas de l'ordre des routes en entrée", () => {
    const routes: ManifestRouteInput[] = [
      { method: 'GET', path: '/api/v1/users/me' },
      { method: 'POST', path: '/api/v1/auth/login' },
    ];
    const forward = buildApiEndpointsCatalog(routes).entries.map((entry) => entry.rawPath);
    const reversed = buildApiEndpointsCatalog([...routes].reverse()).entries.map((entry) => entry.rawPath);
    expect(forward).toEqual(reversed);
  });
});
