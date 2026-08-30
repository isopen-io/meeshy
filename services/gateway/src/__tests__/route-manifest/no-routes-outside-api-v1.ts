/**
 * Témoin de #4277, critère 6 — le manifeste (#4276) ne doit plus révéler
 * AUCUNE route hors `/api/v1`, sauf une liste NOMMÉE et JUSTIFIÉE.
 *
 * Trois familles peuplent légitimement cette liste, et une seule d'elles
 * doit tendre vers zéro :
 *
 *  - PERMANENT   : sondes de disponibilité (`/health`, `/info`) — jamais
 *                  versionnées par convention HTTP, déclarées directement
 *                  dans `route-registration.ts` (hors territoire de #4277).
 *  - DEPRECATED  : alias RACINE dépréciés — répondent encore, avec les
 *                  trois en-têtes `Deprecation`/`Sunset`/`Link` (#4274), et
 *                  ont une date de retrait gouvernée par le compteur
 *                  d'accès (#4275). Ce module ne peut PAS vérifier les
 *                  en-têtes depuis un manifeste statique (il ne lit que des
 *                  chemins) — la liste ici est donc une DÉCLARATION,
 *                  recoupée par les témoins d'intégration de chaque route
 *                  (`voice-analysis-legacy-alias.test.ts`).
 *  - KNOWN_GAP   : dette CONNUE, non résolue par ce lot, avec sa RAISON et
 *                  son suivi. Contrairement aux deux familles ci-dessus,
 *                  CELLE-CI doit se vider — chaque entrée est un aveu, pas
 *                  une décision.
 */

export type ManifestRoute = {
  readonly method: string;
  readonly path: string;
};

export type AllowedOutsideApiV1 = {
  readonly path: string;
  readonly family: 'permanent' | 'deprecated-alias' | 'known-gap';
  readonly reason: string;
};

/**
 * #4277 — liste des adresses hors `/api/v1` volontairement TOLÉRÉES, avant
 * ET après intégration (édits d'enregistrement de `edits_hors_territoire`
 * appliqués + manifeste régénéré) : aucun édit de ce lot ne RETIRE une
 * adresse existante — `voiceAnalysisRoutes` GARDE ses cinq adresses racine
 * (elles deviennent l'alias déprécié du critère 1) en gagnant leurs
 * jumelles sous `/api/v1` ; `userDeletionsRoutes` ne bouge aucune de ses
 * sept adresses (critère 3). Cette liste couvre donc le manifeste
 * MESURABLE AUJOURD'HUI aussi bien que celui d'après intégration — voir le
 * témoin d'intégration plus bas pour la mesure et ses deux limites (headers
 * de dépréciation et `mountPrefix`, invisibles à un scan par CHEMIN seul).
 */
export const ALLOWED_OUTSIDE_API_V1: readonly AllowedOutsideApiV1[] = [
  {
    path: '/health',
    family: 'permanent',
    reason: 'Sonde de disponibilité S0, sans jeton — un orchestrateur ne connaît pas de version d\'API.',
  },
  {
    path: '/info',
    family: 'permanent',
    reason: 'Point de diagnostic non versionné, déclaré à côté de /health dans registerAllRoutes.',
  },
  {
    path: '/api/attachments/file/*',
    family: 'deprecated-alias',
    reason:
      'Alias legacy DÉLIBÉRÉ (attachmentLegacyFileRoutes, hors territoire #4277) — des fileUrl en base ' +
      'pointent ici depuis des années et voyagent dans des notifications déjà livrées ; une URL en base ' +
      'ne se migre pas par un déploiement.',
  },
  // ── Les cinq alias dépréciés de #4277 critère 1 (voiceAnalysisLegacyAliasRoutes) ──
  // Mesuré au 2026-08-29 : `apps/web/hooks/use-voice-analysis.ts` (page
  // réglages vocaux, montée en prod) appelait déjà, via `buildApiUrl()`,
  // `/api/v1/voice/analysis` et `/api/v1/attachments/:id/analysis` — que le
  // serveur ne servait pas du tout avant ce lot. La migration vers /api/v1
  // corrige un défaut ACTIF ; l'alias racine ci-dessous protège tout appelant
  // qui connaîtrait encore l'ancienne forme bare-root (aucun mesuré, mais un
  // grep client ne voit pas une version déjà installée — #4274).
  {
    path: '/attachments/:attachmentId/analysis',
    family: 'deprecated-alias',
    reason: 'Alias racine de POST/GET /api/v1/attachments/:attachmentId/analysis (#4277 critère 1).',
  },
  {
    path: '/attachments/batch/analysis',
    family: 'deprecated-alias',
    reason: 'Alias racine de POST /api/v1/attachments/batch/analysis (#4277 critère 1).',
  },
  {
    path: '/voice/analysis',
    family: 'deprecated-alias',
    reason: 'Alias racine de GET/POST /api/v1/voice/analysis (#4277 critère 1).',
  },
  // ── Les deux alias dépréciés des gestes d'administration Socket.IO (#4376) ──
  // Ils ne sont pas NOUVEAUX : ils étaient servis en production depuis
  // toujours, et n'apparaissaient dans aucun manifeste parce que
  // `setupSocketIO()` monte ses routes hors de `registerAllRoutes`, le seul
  // graphe que le collecteur montait (#4376). Les rendre VISIBLES les a fait
  // tomber ici — le témoin faisant exactement son travail : une adresse hors
  // `/api/v1` se déclare, avec sa famille et sa raison, ou elle rougit. Elles
  // portent les trois en-têtes `Deprecation`/`Sunset`/`Link` (#4274) posés par
  // `aliasNonVersionne()` dans `socketio/socketio-admin-routes.ts`, et leur
  // successeur versionné est servi à côté d'elles depuis 00a56691c7.
  {
    path: '/api/socketio/stats',
    family: 'deprecated-alias',
    reason: 'Alias non versionné de GET /api/v1/socketio/stats (#4376) — en sursis, retrait gouverné par le compteur d\'accès (#4275).',
  },
  {
    path: '/api/socketio/disconnect-user',
    family: 'deprecated-alias',
    reason: 'Alias non versionné de POST /api/v1/socketio/disconnect-user (#4376) — en sursis, retrait gouverné par le compteur d\'accès (#4275).',
  },
  // ── Les sept routes de userDeletionsRoutes — DETTE CONNUE, pas une décision ──
  // `DELETE .../conversations/:conversationId/delete-for-me` PARTAGE son
  // adresse finale sous /api/v1 avec un DOUBLON déjà vivant
  // (routes/conversations/delete-for-me.ts, monté dans conversationRoutes) :
  // la faire migrer ferait lever Fastify au démarrage
  // (FST_ERR_DUPLICATED_ROUTE) tant qu'une décision produit n'a pas tranché
  // laquelle des deux implémentations reste. Les six autres routes du même
  // fichier n'ont AUCUN doublon et pourraient migrer seules — groupées ici
  // pour que le fichier garde une SEULE convention d'adressage (critère 3)
  // plutôt que d'en réintroduire une deuxième. Suivi : nouvelle issue à
  // ouvrir, « quelle implémentation de delete-for-me de conversation
  // reste ? » (voir routes/user-deletions.ts, doc-comment de
  // `UserDeletionsRoutesOptions`).
  {
    path: '/api/conversations/:conversationId/delete-for-me',
    family: 'known-gap',
    reason: 'Collision avec routes/conversations/delete-for-me.ts sous /api/v1 — décision produit requise.',
  },
  {
    path: '/api/conversations/:conversationId/restore-for-me',
    family: 'known-gap',
    reason: 'Groupée avec delete-for-me pour garder une seule convention d\'adressage dans le fichier.',
  },
  {
    path: '/api/conversations/:conversationId/clear-history',
    family: 'known-gap',
    reason: 'Groupée avec delete-for-me pour garder une seule convention d\'adressage dans le fichier.',
  },
  {
    path: '/api/messages/:messageId/delete-for-me',
    family: 'known-gap',
    reason: 'Groupée avec delete-for-me pour garder une seule convention d\'adressage dans le fichier.',
  },
  {
    path: '/api/messages/:messageId/restore-for-me',
    family: 'known-gap',
    reason: 'Groupée avec delete-for-me pour garder une seule convention d\'adressage dans le fichier.',
  },
  {
    path: '/api/messages/bulk/delete-for-me',
    family: 'known-gap',
    reason: 'Groupée avec delete-for-me pour garder une seule convention d\'adressage dans le fichier.',
  },
  {
    path: '/api/user/deleted-conversations',
    family: 'known-gap',
    reason: 'Groupée avec delete-for-me pour garder une seule convention d\'adressage dans le fichier.',
  },
];

/**
 * Rend les routes du manifeste qui sont hors `/api/v1` ET absentes de la
 * liste déclarée. Une liste VIDE est le seul résultat acceptable.
 */
export function routesOutsideApiV1(
  routes: readonly ManifestRoute[],
  allowlist: readonly AllowedOutsideApiV1[] = ALLOWED_OUTSIDE_API_V1
): ManifestRoute[] {
  const allowedPaths = new Set(allowlist.map((entry) => entry.path));
  return routes.filter((route) => !route.path.startsWith('/api/v1') && !allowedPaths.has(route.path));
}
