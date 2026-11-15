/**
 * Chaque route d'administration DÉCLARE une garde de permission — le cliquet
 * qui balaie L'ENSEMBLE des routes `/admin/*` (#4157, critère 6).
 *
 * ## Pourquoi un témoin par route ne suffit pas
 *
 * #4157 corrige des NIVEAUX incorrects (`canViewAnalytics` là où la matrice
 * dit `canAccessAdmin`, etc.) — chaque correction porte son propre témoin
 * comportemental, à côté de la route qu'il vérifie. Mais un témoin posé
 * route par route laisse la PROCHAINE route ajoutée échapper à la matrice
 * sans faire rougir personne : c'est exactement la classe de défaut que ce
 * fichier ferme, en énumérant les routes d'admin MONTÉES et en échouant si
 * l'une d'elles ne porte aucune garde de permission.
 *
 * ## Ce qu'il RÉUTILISE, et pourquoi
 *
 * `route-manifest/collect.ts` (#4276) dérive déjà, MÉCANIQUEMENT depuis le
 * serveur Fastify ASSEMBLÉ (jamais par lecture de source), si une route porte
 * une garde `requirePermission(...)` / `requireSovereign()` détectable
 * (`securityBasisKey`). Réimplémenter cette détection ici aurait recréé
 * exactement la classe de défaut que ce dépôt referme sans relâche — deux
 * détecteurs divergent tôt ou tard (`docs/product/.../collect.ts`, note de
 * module : « deux montages jetables divergent tôt ou tard »).
 *
 * ## Ce que ce témoin PEUT voir, et ce qu'il NE PEUT PAS
 *
 * `securityBasisKey` distingue « une garde de permission est posée » de « rien
 * au-delà de l'authentification » — mais PAS quelle permission exacte est
 * exigée (une variable capturée dans une fermeture, invisible depuis le
 * serveur assemblé — voir `collect.ts`). Ce témoin ferme donc la classe
 * « route montée SANS AUCUNE garde de rang » ; il ne remplace PAS les témoins
 * comportementaux par ligne du tableau de #4157 (rôle × route, dans les
 * fichiers `admin-dashboard.test.ts`, `admin-analytics.test.ts`,
 * `languages-extra.test.ts`, `system-rankings.test.ts`, `admin-content.test.ts`,
 * `agent-routes*.test.ts`), qui ferment « garde posée sur le MAUVAIS rang » —
 * une classe que CE témoin ne peut structurellement pas voir.
 *
 * @jest-environment node
 */

// Même mock que `route-manifest-ratchet.test.ts` et `route-auth-coverage.test.ts` :
// `@tus/server`/`@tus/file-store` sont publiés en ESM pur, non transformables
// par Jest — importer `route-manifest/collect` (via `route-registration.ts`,
// qui importe `routes/uploads/tus-handler.ts`) sans mock fait échouer TOUTE la
// suite au chargement. Ce test n'envoie aucune requête HTTP : il n'a besoin
// que d'un `Server` CONSTRUCTIBLE, jamais fonctionnel.
jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(_opts: any) {}
  },
}));
jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
  },
}));

// `routes/voice-profile.ts`/`routes/voice-analysis.ts` ouvrent un VRAI socket
// ZMQ à l'enregistrement — sans mock, Jest reste bloqué ~2 min sur le handle
// ouvert (même raison que les deux gardes citées ci-dessus).
jest.mock('../../services/ZmqSingleton', () => {
  const { EventEmitter: EE } = require('events');
  return { ZMQSingleton: { getInstance: jest.fn().mockResolvedValue(new EE()) } };
});

import { describe, it, expect } from '@jest/globals';
import { buildRouteManifest } from '../../route-manifest';

describe('Chaque route /admin/* montée déclare une garde de permission', () => {
  it('aucune route /admin ne reste "authenticated-only" ou "no-standard-auth-hook" (#4157)', async () => {
    const artifact = await buildRouteManifest();
    const adminRoutes = artifact.routes.filter((r) => r.adminPrefixed);

    // Garde-fou du harnais lui-même : si l'assemblage cesse d'enregistrer les
    // routes d'admin, ce test passerait au vert en ne mesurant plus rien.
    expect(adminRoutes.length).toBeGreaterThan(50);

    // Exceptions justifiées et datées — chacune vérifiée sur place, pas
    // supposée. Cette liste doit rester à cette taille : elle n'est pas un
    // endroit où ranger ce qu'on n'a pas eu le temps de corriger.
    const EXCEPTIONS_JUSTIFIEES = new Set<string>([
      // `POST /admin/reports` N'EST PAS un geste d'ADMINISTRATION : c'est un
      // adaptateur mince vers `POST /reports` (#4155), monté sous `/admin`
      // pour des raisons historiques le temps que les trois clients migrent
      // (doc-comment de `routes/admin/reports.ts`). Signaler est ouvert à
      // TOUT utilisateur authentifié, jamais à un rôle d'administration
      // particulier — `authenticated-only` y est le niveau JUSTE.
      'POST /api/v1/admin/reports',
      // `GET /admin/me/permissions` N'EST PAS un geste d'administration non
      // plus : c'est la SEULE route par laquelle un client lit SES PROPRES
      // permissions (#4152), pour les tenir à jour entre deux connexions. Le
      // doc-comment de `routes/admin/me-permissions.ts` le dit explicitement
      // — « En S2, pas S5 : lire SES PROPRES permissions n'est pas un geste
      // d'administration » — et un USER a le droit de savoir qu'il n'en a
      // aucune, c'est même la réponse la plus fréquente qu'elle rend.
      'GET /api/v1/admin/me/permissions',
    ]);

    const sansGarde = adminRoutes
      // `admin-rank` (#6862) rejoint les deux bases déjà admises : elle GARDE,
      // et plus strictement qu'une permission seule — BIGBOSS ou ADMIN, quand
      // `permission-gated` laisserait passer tout porteur de la permission,
      // MODERATOR compris. L'omettre ici aurait fait passer une route MIEUX
      // gardée pour une route sans garde.
      .filter(
        (r) =>
          r.securityBasisKey !== 'permission-gated' &&
          r.securityBasisKey !== 'sovereign' &&
          r.securityBasisKey !== 'admin-rank',
      )
      .map((r) => ({ key: `${r.method} ${r.path}`, ligne: `${r.method} ${r.path}  (${r.securityBasisKey}, module ${r.module})` }))
      .filter(({ key }) => !EXCEPTIONS_JUSTIFIEES.has(key))
      .map(({ ligne }) => ligne);

    expect(sansGarde).toEqual([]);

    // L'exception ne doit pas non plus survivre à sa propre résolution :
    // si `POST /admin/reports` cesse d'être `authenticated-only` (retirée,
    // ou son statut change), cette liste doit rétrécir avec elle — sans quoi
    // elle couvrirait en silence la PROCHAINE route qui atterrirait à la
    // même adresse sans garde.
    const exceptionsEncoreValides = adminRoutes
      .filter((r) => EXCEPTIONS_JUSTIFIEES.has(`${r.method} ${r.path}`))
      .filter((r) => r.securityBasisKey === 'authenticated-only')
      .map((r) => `${r.method} ${r.path}`);
    expect(new Set(exceptionsEncoreValides)).toEqual(EXCEPTIONS_JUSTIFIEES);
  });

  // #4157, critère 2 : DEUX gestes restent en S6 (souverain, BIGBOSS seul) —
  // `agent.ts` : `PUT /llm`, `DELETE /reset`. Ils touchent à la configuration
  // du service lui-même : « qui POSSÈDE ce service » plutôt que « qui
  // l'administre », et aucune permission de domaine ne doit pouvoir le
  // déléguer.
  it('PUT /admin/agent/llm et DELETE /admin/agent/reset montent en S6 (souverain)', async () => {
    const artifact = await buildRouteManifest();
    const cible = (method: string, path: string) =>
      artifact.routes.find((r) => r.method === method && r.path === path);

    const putLlm = cible('PUT', '/api/v1/admin/agent/llm');
    const deleteReset = cible('DELETE', '/api/v1/admin/agent/reset');

    expect(putLlm).toBeDefined();
    expect(deleteReset).toBeDefined();
    expect(putLlm!.securityLevel).toBe('S6');
    expect(putLlm!.securityBasisKey).toBe('sovereign');
    expect(deleteReset!.securityLevel).toBe('S6');
    expect(deleteReset!.securityBasisKey).toBe('sovereign');
  });

  /**
   * **LA LECTURE D'UNE CONVERSATION PRIVÉE A CHANGÉ DE SEUIL** — directive
   * porteur du 2026-09-16 : « permettre aussi aux ADMIN de pouvoir accéder à
   * ces informations **pour le moment** ».
   *
   * `GET /admin/conversations/:id/messages` était le TROISIÈME geste S6 de
   * #4157 c.2 (#4333 c.3 l'y avait fait monter). Elle descend en
   * `permission-gated`, et ce témoin change AVEC elle plutôt que d'être
   * supprimé : un cliquet qu'on retire cesse de garder, un cliquet qu'on
   * déplace garde le nouveau seuil.
   *
   * Ce qui est exigé désormais, et qui n'est pas moins précis :
   *
   * - la route reste **gardée** (`permission-gated`, jamais
   *   « authenticated-only ») — c'est ce que le premier test de ce fichier
   *   balaie pour TOUTES les adresses `/admin` ;
   * - son seuil de RANG (BIGBOSS ou ADMIN, jamais MODERATOR bien qu'il porte
   *   `canManageConversations`) est gardé par les témoins comportementaux de
   *   `admin-user-conversations.test.ts`, seuls capables de le voir — ce
   *   fichier-ci ne lit que la BASE de la garde, jamais le rang qu'elle exige.
   *
   * Ce que la directive n'a PAS demandé, et qui n'a donc pas bougé : le motif
   * écrit obligatoire et la trace `AdminAuditLog`. Un ADMIN lit ; sa lecture
   * laisse la même empreinte qu'un BIGBOSS.
   */
  it("GET /admin/conversations/:id/messages reste GARDÉE après son passage en rang d'administration", async () => {
    const artifact = await buildRouteManifest();
    const conversationMessages = artifact.routes.find(
      (r) => r.method === 'GET' && r.path === '/api/v1/admin/conversations/:conversationId/messages',
    );

    expect(conversationMessages).toBeDefined();
    // `admin-rank` et non `permission-gated` : la route porte les DEUX gardes,
    // et c'est la plus stricte qui la qualifie. Le collecteur la détecte par
    // `UserRoleEnum.ADMIN`, testé avant le marqueur souverain — sans cet
    // ordre, l'artefact annoncerait encore S6 une route qu'un ADMIN franchit.
    expect(conversationMessages!.securityBasisKey).toBe('admin-rank');
    // Le contraste qui donne sa valeur au témoin : une route qui perdrait sa
    // garde retomberait ici, et non sur une valeur voisine.
    expect(conversationMessages!.securityBasisKey).not.toBe('authenticated-only');
  });

  /**
   * LE LISTING DE L'INSTANCE (#6861) porte le MÊME régime que la lecture de
   * contenu : permission de domaine + rang d'administration. Ce témoin est
   * distinct du précédent parce que les deux routes peuvent diverger — elles
   * vivent dans deux fichiers, et rien d'autre ne les tient d'accord.
   */
  it('GET /admin/conversations monte en rang d\'administration', async () => {
    const artifact = await buildRouteManifest();
    const listing = artifact.routes.find((r) => r.method === 'GET' && r.path === '/api/v1/admin/conversations');

    expect(listing).toBeDefined();
    expect(listing!.securityBasisKey).toBe('admin-rank');
  });
});
