# Manifeste des routes servies par la gateway

> **Fichier GÉNÉRÉ — ne pas éditer à la main.**
>
> Régénérer : `npx tsx scripts/route-manifest.ts` · Source : `scripts/route-manifest.ts`
>
> La table vient du serveur **assemblé** (`registerAllRoutes`, la fonction que la
> production exécute), lue par le hook `onRoute` de Fastify. Aucune ligne n'y est
> écrite à la main, aucune n'y entre par `grep`. Un cliquet
> (`services/gateway/src/__tests__/route-manifest-ratchet.test.ts`) la recalcule à
> chaque exécution des tests : une route ajoutée, retirée ou déplacée sans
> régénérer ce fichier fait rougir la suite.

**519 routes** déclarées par **123 modules**.

## Les niveaux — ce que cette table prouve, et ce qu'elle avoue

Vocabulaire : [`docs/product/api-simplification/securite.md` § 1](../product/api-simplification/securite.md).

| niveau | établi par | compte |
|---|---|---:|
| **S0** | la sonde anonyme passe, aucun limiteur déclaré sur la route | 51 |
| **S1** | la sonde anonyme passe, `config.rateLimit` déclaré sur la route | 3 |
| **S2** | la sonde anonyme reçoit 401/403 — **plancher** : l'appartenance (S3) vit dans le handler | 371 |
| **S4** | `requirePermission(canModerateContent)`, constaté par identité | 9 |
| **S5** | `requirePermission(<autre>)` ou une garde de `admin-permissions.middleware`, par identité | 82 |
| **S6** | `requireSovereign()`, constaté par identité | 0 |
| **inconnu** | la sonde n'a pas rendu de verdict (429/5xx), ou une garde hors de la table centrale | 3 |

Un niveau à **0** est une mesure, pas une absence de mesure : il dit que le
vocabulaire prévoit ce rang et qu'aucune route ne l'installe.

**`S3` n'apparaît sur aucune ligne, et c'est un constat, pas un oubli.**
L'appartenance se vérifie DANS le handler, après le pipeline de hooks : rien au
montage ne peut la voir. Une ligne `S2` dit « une identité est exigée » — elle ne
dit pas que la ressource d'autrui est refusée.

## Anomalies d'adressage — constatées, non corrigées (#4277)

Ces deux listes sont CALCULÉES depuis l'écart entre le préfixe donné à
`server.register(...)` et le chemin final. Ni la lecture d'un fichier ni un `grep`
ne les montre : chacune des deux moitiés est correcte isolément, c'est leur
composition qui ne l'est pas.

### Hors `/api/v1` sans justification (12)

- `POST /api/conversations/:conversationId/clear-history  ← services/gateway/src/routes/user-deletions.ts`
- `DELETE /api/conversations/:conversationId/delete-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `POST /api/conversations/:conversationId/restore-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `DELETE /api/messages/:messageId/delete-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `POST /api/messages/:messageId/restore-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `DELETE /api/messages/bulk/delete-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `GET /api/user/deleted-conversations  ← services/gateway/src/routes/user-deletions.ts`
- `GET /attachments/:attachmentId/analysis  ← services/gateway/src/routes/voice-analysis.ts`
- `POST /attachments/:attachmentId/analysis  ← services/gateway/src/routes/voice-analysis.ts`
- `POST /attachments/batch/analysis  ← services/gateway/src/routes/voice-analysis.ts`
- `GET /voice/analysis  ← services/gateway/src/routes/voice-analysis.ts`
- `POST /voice/analysis  ← services/gateway/src/routes/voice-analysis.ts`

Les seuls chemins hors `/api/v1` que ce calcul ADMET, et pourquoi — toute autre
racine remonte dans la liste ci-dessus :

- `^\/health$` — sonde de santé infra, appelée par l'orchestrateur avant tout routage applicatif
- `^\/info$` — métadonnées statiques du service
- `^\/api\/attachments\/file\/` — montage LEGACY assumé (#4187) : des `fileUrl` de cette forme sont persistées en base depuis des années et voyagent dans des notifications déjà livrées — une URL en base ne se migre pas par un déploiement. Seule la lecture d'octets y survit.

### Préfixe codé en dur dans le module (22)

Montage sans préfixe (`register(x)` ou `{ prefix: '' }`) et chemin qui commence
déjà par `/api/` : l'adresse est écrite dans le module, donc `route-registration.ts`
ne la gouverne plus. Une refonte du versionnage d'API les oublierait toutes.

- `POST /api/conversations/:conversationId/clear-history  ← services/gateway/src/routes/user-deletions.ts`
- `DELETE /api/conversations/:conversationId/delete-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `POST /api/conversations/:conversationId/restore-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `DELETE /api/messages/:messageId/delete-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `POST /api/messages/:messageId/restore-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `DELETE /api/messages/bulk/delete-for-me  ← services/gateway/src/routes/user-deletions.ts`
- `GET /api/user/deleted-conversations  ← services/gateway/src/routes/user-deletions.ts`
- `POST /api/v1/uploads  ← services/gateway/src/routes/uploads/tus-handler.ts`
- `DELETE /api/v1/uploads/*  ← services/gateway/src/routes/uploads/tus-handler.ts`
- `PATCH /api/v1/uploads/*  ← services/gateway/src/routes/uploads/tus-handler.ts`
- `POST /api/v1/uploads/*  ← services/gateway/src/routes/uploads/tus-handler.ts`
- `GET /api/v1/voice/admin/metrics  ← services/gateway/src/routes/voice/analysis.ts`
- `POST /api/v1/voice/analyze  ← services/gateway/src/routes/voice/analysis.ts`
- `POST /api/v1/voice/compare  ← services/gateway/src/routes/voice/analysis.ts`
- `POST /api/v1/voice/feedback  ← services/gateway/src/routes/voice/analysis.ts`
- `GET /api/v1/voice/history  ← services/gateway/src/routes/voice/analysis.ts`
- `DELETE /api/v1/voice/job/:jobId  ← services/gateway/src/routes/voice/translation.ts`
- `GET /api/v1/voice/job/:jobId  ← services/gateway/src/routes/voice/translation.ts`
- `GET /api/v1/voice/languages  ← services/gateway/src/routes/voice/analysis.ts`
- `POST /api/v1/voice/transcribe  ← services/gateway/src/routes/voice/translation.ts`
- `POST /api/v1/voice/translate  ← services/gateway/src/routes/voice/translation.ts`
- `POST /api/v1/voice/translate/async  ← services/gateway/src/routes/voice/translation.ts`

## La table

| méthode | chemin | niveau | garde | préfixe de montage | module |
|---|---|---|---|---|---|
| `GET` | `/api/attachments/file/*` | S0 | — | `/api` | `services/gateway/src/routes/attachments/download.ts` |
| `POST` | `/api/conversations/:conversationId/clear-history` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `DELETE` | `/api/conversations/:conversationId/delete-for-me` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `POST` | `/api/conversations/:conversationId/restore-for-me` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `DELETE` | `/api/messages/:messageId/delete-for-me` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `POST` | `/api/messages/:messageId/restore-for-me` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `DELETE` | `/api/messages/bulk/delete-for-me` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `GET` | `/api/user/deleted-conversations` | S2 | — | `(vide)` | `services/gateway/src/routes/user-deletions.ts` |
| `POST` | `/api/v1/account/deletion/resolve` | S1 | — | `/api/v1/account/deletion` | `services/gateway/src/routes/account-deletion.ts` |
| `GET` | `/api/v1/admin/agent/archetypes` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `DELETE` | `/api/v1/admin/agent/configs/:conversationId` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs/:conversationId` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `PUT` | `/api/v1/admin/agent/configs/:conversationId` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs/:conversationId/live` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs/:conversationId/messages` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs/:conversationId/roles` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs/:conversationId/schedule` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `POST` | `/api/v1/admin/agent/configs/:conversationId/stop` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/configs/:conversationId/summary` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `POST` | `/api/v1/admin/agent/configs/:conversationId/trigger` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/delivery-queue` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `DELETE` | `/api/v1/admin/agent/delivery-queue/:id` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `PATCH` | `/api/v1/admin/agent/delivery-queue/:id` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/global-config` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `PUT` | `/api/v1/admin/agent/global-config` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/llm` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `PUT` | `/api/v1/admin/agent/llm` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/recent-activity` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `DELETE` | `/api/v1/admin/agent/reset` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `DELETE` | `/api/v1/admin/agent/reset/conversation/:conversationId` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `DELETE` | `/api/v1/admin/agent/reset/user/:userId` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `POST` | `/api/v1/admin/agent/roles/:conversationId/:userId/assign` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `POST` | `/api/v1/admin/agent/roles/:conversationId/:userId/unlock` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/scan-logs` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/scan-logs/:logId` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/scan-logs/stats` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/stats` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent.ts` |
| `GET` | `/api/v1/admin/agent/topics` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent-topics.ts` |
| `POST` | `/api/v1/admin/agent/topics` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent-topics.ts` |
| `DELETE` | `/api/v1/admin/agent/topics/:id` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent-topics.ts` |
| `GET` | `/api/v1/admin/agent/topics/:id` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent-topics.ts` |
| `PATCH` | `/api/v1/admin/agent/topics/:id` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent-topics.ts` |
| `POST` | `/api/v1/admin/agent/topics/:id/test` | S5 | requirePermission(canManageAgent) | `/api/v1/admin/agent` | `services/gateway/src/routes/admin/agent-topics.ts` |
| `GET` | `/api/v1/admin/analytics/calls` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/hourly-activity` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/kpis` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/language-distribution` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/message-types` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/realtime` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/user-distribution` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/analytics/volume-timeline` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/analytics` | `services/gateway/src/routes/admin/analytics.ts` |
| `GET` | `/api/v1/admin/anonymous-users` | S5 | requirePermission(canViewUsers) | `/api/v1/admin` | `services/gateway/src/routes/admin/anonymous-users.ts` |
| `GET` | `/api/v1/admin/broadcasts` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `POST` | `/api/v1/admin/broadcasts` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `DELETE` | `/api/v1/admin/broadcasts/:id` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `GET` | `/api/v1/admin/broadcasts/:id` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `PUT` | `/api/v1/admin/broadcasts/:id` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `POST` | `/api/v1/admin/broadcasts/:id/preview` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `POST` | `/api/v1/admin/broadcasts/:id/send` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `POST` | `/api/v1/admin/broadcasts/:id/send-inapp` | S5 | requirePermission(canManageNotifications) | `/api/v1/admin/broadcasts` | `services/gateway/src/routes/admin/broadcasts.ts` |
| `GET` | `/api/v1/admin/communities` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/content.ts` |
| `GET` | `/api/v1/admin/conversations/:conversationId/messages` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `GET` | `/api/v1/admin/conversations/:conversationId/participants` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `GET` | `/api/v1/admin/dashboard` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin` | `services/gateway/src/routes/admin/dashboard.ts` |
| `POST` | `/api/v1/admin/dashboard/invalidate-cache` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin` | `services/gateway/src/routes/admin/dashboard.ts` |
| `GET` | `/api/v1/admin/invitations` | S5 | requirePermission(canCreateUsers) | `/api/v1/admin/invitations` | `services/gateway/src/routes/admin/invitations.ts` |
| `GET` | `/api/v1/admin/invitations/:id` | S5 | requirePermission(canCreateUsers) | `/api/v1/admin/invitations` | `services/gateway/src/routes/admin/invitations.ts` |
| `PATCH` | `/api/v1/admin/invitations/:id` | S5 | requirePermission(canCreateUsers) | `/api/v1/admin/invitations` | `services/gateway/src/routes/admin/invitations.ts` |
| `GET` | `/api/v1/admin/invitations/stats` | S5 | requirePermission(canCreateUsers) | `/api/v1/admin/invitations` | `services/gateway/src/routes/admin/invitations.ts` |
| `GET` | `/api/v1/admin/invitations/timeline/daily` | S5 | requirePermission(canCreateUsers) | `/api/v1/admin/invitations` | `services/gateway/src/routes/admin/invitations.ts` |
| `GET` | `/api/v1/admin/languages/stats` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/languages` | `services/gateway/src/routes/admin/languages.ts` |
| `GET` | `/api/v1/admin/languages/timeline` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/languages` | `services/gateway/src/routes/admin/languages.ts` |
| `GET` | `/api/v1/admin/languages/translation-accuracy` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin/languages` | `services/gateway/src/routes/admin/languages.ts` |
| `GET` | `/api/v1/admin/me/permissions` | S2 | fastify.authenticate | `/api/v1/admin` | `services/gateway/src/routes/admin/me-permissions.ts` |
| `GET` | `/api/v1/admin/messages` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/content.ts` |
| `GET` | `/api/v1/admin/messages/engagement` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin/messages` | `services/gateway/src/routes/admin/messages.ts` |
| `GET` | `/api/v1/admin/messages/stats` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin/messages` | `services/gateway/src/routes/admin/messages.ts` |
| `GET` | `/api/v1/admin/messages/trends` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin/messages` | `services/gateway/src/routes/admin/messages.ts` |
| `GET` | `/api/v1/admin/posts` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/posts.ts` |
| `DELETE` | `/api/v1/admin/posts/:postId` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/posts.ts` |
| `GET` | `/api/v1/admin/posts/:postId` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/posts.ts` |
| `GET` | `/api/v1/admin/posts/stats` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/posts.ts` |
| `GET` | `/api/v1/admin/ranking` | S5 | requirePermission(canViewAnalytics) | `/api/v1/admin` | `services/gateway/src/routes/admin/system-rankings.ts` |
| `GET` | `/api/v1/admin/reports` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `POST` | `/api/v1/admin/reports` | S2 | fastify.authenticate | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `DELETE` | `/api/v1/admin/reports/:id` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `GET` | `/api/v1/admin/reports/:id` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `PATCH` | `/api/v1/admin/reports/:id` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `POST` | `/api/v1/admin/reports/:id/assign` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `GET` | `/api/v1/admin/reports/entity/:type/:id` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `GET` | `/api/v1/admin/reports/moderator/mine` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `GET` | `/api/v1/admin/reports/recent` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `GET` | `/api/v1/admin/reports/stats` | S4 | requirePermission(canModerateContent) | `/api/v1/admin/reports` | `services/gateway/src/routes/admin/reports.ts` |
| `GET` | `/api/v1/admin/route-usage` | S5 | requirePermission(canAccessAdmin, canViewAnalytics) | `/api/v1/admin` | `services/gateway/src/routes/admin/route-usage.ts` |
| `GET` | `/api/v1/admin/share-links` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/content.ts` |
| `GET` | `/api/v1/admin/translations` | S5 | requirePermission(canAccessAdmin) | `/api/v1/admin` | `services/gateway/src/routes/admin/content.ts` |
| `GET` | `/api/v1/admin/users` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `POST` | `/api/v1/admin/users` | S5 | requirePermission(canCreateUsers) | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `DELETE` | `/api/v1/admin/users/:userId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `GET` | `/api/v1/admin/users/:userId` | S5 | requirePermission(canViewUserDetails) | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `PATCH` | `/api/v1/admin/users/:userId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `GET` | `/api/v1/admin/users/:userId/activity` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `PATCH` | `/api/v1/admin/users/:userId/consents` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `GET` | `/api/v1/admin/users/:userId/conversations` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `POST` | `/api/v1/admin/users/:userId/disable-2fa` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/admin/users/:userId/enable-2fa` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `GET` | `/api/v1/admin/users/:userId/media` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `GET` | `/api/v1/admin/users/:userId/reported-messages` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `GET` | `/api/v1/admin/users/:userId/reports` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `POST` | `/api/v1/admin/users/:userId/reset-password` | S5 | requirePermission(canResetPasswords) + requireHierarchy(:userId) | `/api/v1` | `services/gateway/src/routes/admin/users.ts` |
| `PATCH` | `/api/v1/admin/users/:userId/role` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `PATCH` | `/api/v1/admin/users/:userId/security` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `PATCH` | `/api/v1/admin/users/:userId/status` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/admin/users/:userId/unlock` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `PATCH` | `/api/v1/admin/users/:userId/verifications` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/admin/users/:userId/verify-age` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/admin/users/:userId/verify-email` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/admin/users/:userId/verify-phone` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/admin/users/:userId/voice-consent` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/admin/users-write.ts` |
| `POST` | `/api/v1/affiliate/click/:token` | S0 | — | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `POST` | `/api/v1/affiliate/register` | S2 | — | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `GET` | `/api/v1/affiliate/stats` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `GET` | `/api/v1/affiliate/tokens` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `POST` | `/api/v1/affiliate/tokens` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `DELETE` | `/api/v1/affiliate/tokens/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `POST` | `/api/v1/affiliate/track-visit` | S0 | — | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `GET` | `/api/v1/affiliate/validate/:token` | S0 | — | `/api/v1` | `services/gateway/src/routes/affiliate.ts` |
| `POST` | `/api/v1/anonymous/join/:linkId` | S0 | — | `/api/v1` | `services/gateway/src/routes/anonymous.ts` |
| `POST` | `/api/v1/anonymous/leave` | S0 | — | `/api/v1` | `services/gateway/src/routes/anonymous.ts` |
| `GET` | `/api/v1/anonymous/link/:identifier` | S0 | — | `/api/v1` | `services/gateway/src/routes/anonymous.ts` |
| `POST` | `/api/v1/anonymous/refresh` | S2 | — | `/api/v1` | `services/gateway/src/routes/anonymous.ts` |
| `GET` | `/api/v1/app/min-version` | S0 | — | `/api/v1` | `services/gateway/src/routes/app.ts` |
| `DELETE` | `/api/v1/attachments/:attachmentId` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/metadata.ts` |
| `GET` | `/api/v1/attachments/:attachmentId` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/download.ts` |
| `GET` | `/api/v1/attachments/:attachmentId/metadata` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/metadata.ts` |
| `POST` | `/api/v1/attachments/:attachmentId/status` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `GET` | `/api/v1/attachments/:attachmentId/status-details` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `GET` | `/api/v1/attachments/:attachmentId/thumbnail` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/download.ts` |
| `POST` | `/api/v1/attachments/:attachmentId/transcribe` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/translation.ts` |
| `POST` | `/api/v1/attachments/:attachmentId/translate` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/translation.ts` |
| `GET` | `/api/v1/attachments/file/*` | S0 | — | `/api/v1` | `services/gateway/src/routes/attachments/download.ts` |
| `POST` | `/api/v1/attachments/upload` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/upload.ts` |
| `POST` | `/api/v1/attachments/upload-text` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/upload.ts` |
| `POST` | `/api/v1/auth/2fa/backup-codes` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `POST` | `/api/v1/auth/2fa/cancel` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `POST` | `/api/v1/auth/2fa/disable` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `POST` | `/api/v1/auth/2fa/enable` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `POST` | `/api/v1/auth/2fa/setup` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `GET` | `/api/v1/auth/2fa/status` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `POST` | `/api/v1/auth/2fa/verify` | S2 | fastify.authenticate | `/api/v1/auth/2fa` | `services/gateway/src/routes/two-factor.ts` |
| `GET` | `/api/v1/auth/check-availability` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/register.ts` |
| `POST` | `/api/v1/auth/forgot-password` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `POST` | `/api/v1/auth/forgot-password/phone/lookup` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `POST` | `/api/v1/auth/forgot-password/phone/resend` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `POST` | `/api/v1/auth/forgot-password/phone/verify-code` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `POST` | `/api/v1/auth/forgot-password/phone/verify-identity` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `POST` | `/api/v1/auth/login` | S2 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/login.ts` |
| `POST` | `/api/v1/auth/login/2fa` | S2 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/login.ts` |
| `POST` | `/api/v1/auth/logout` | S2 | fastify.authenticate | `/api/v1/auth` | `services/gateway/src/routes/auth/login.ts` |
| `POST` | `/api/v1/auth/magic-link/request` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/magic-link.ts` |
| `POST` | `/api/v1/auth/magic-link/validate` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/magic-link.ts` |
| `GET` | `/api/v1/auth/me` | S2 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `POST` | `/api/v1/auth/phone-transfer/cancel` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/phone-transfer/check` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/phone-transfer/initiate` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/phone-transfer/initiate-registration` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/phone-transfer/resend` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/phone-transfer/verify` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/phone-transfer/verify-registration` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/phone-transfer.ts` |
| `POST` | `/api/v1/auth/refresh` | S2 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `POST` | `/api/v1/auth/register` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/register.ts` |
| `POST` | `/api/v1/auth/resend-verification` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `POST` | `/api/v1/auth/reset-password` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `GET` | `/api/v1/auth/reset-password/verify-token` | inconnu | — | `/api/v1/auth` | `services/gateway/src/routes/password-reset.ts` |
| `GET` | `/api/v1/auth/revoke-all-sessions` | S1 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/revoke-all-sessions.ts` |
| `POST` | `/api/v1/auth/send-phone-code` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `DELETE` | `/api/v1/auth/sessions` | S2 | fastify.authenticate | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `GET` | `/api/v1/auth/sessions` | S2 | fastify.authenticate | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | S2 | fastify.authenticate | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `POST` | `/api/v1/auth/verify-email` | S0 | — | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `POST` | `/api/v1/auth/verify-phone` | inconnu | — | `/api/v1/auth` | `services/gateway/src/routes/auth/magic-link.ts` |
| `POST` | `/api/v1/calls` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `DELETE` | `/api/v1/calls/:callId` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `GET` | `/api/v1/calls/:callId` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `POST` | `/api/v1/calls/:callId/participants` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `DELETE` | `/api/v1/calls/:callId/participants/:participantId` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `GET` | `/api/v1/calls/:callId/transcript` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `GET` | `/api/v1/calls/active` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `GET` | `/api/v1/calls/history` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `POST` | `/api/v1/cleanup` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/maintenance.ts` |
| `GET` | `/api/v1/communities` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/core.ts` |
| `POST` | `/api/v1/communities` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/core.ts` |
| `DELETE` | `/api/v1/communities/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/settings.ts` |
| `GET` | `/api/v1/communities/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/core.ts` |
| `PUT` | `/api/v1/communities/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/settings.ts` |
| `GET` | `/api/v1/communities/:id/conversations` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/core.ts` |
| `POST` | `/api/v1/communities/:id/conversations/:conversationId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/core.ts` |
| `POST` | `/api/v1/communities/:id/invite` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/membership.ts` |
| `POST` | `/api/v1/communities/:id/join` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/membership.ts` |
| `POST` | `/api/v1/communities/:id/leave` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/membership.ts` |
| `GET` | `/api/v1/communities/:id/members` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/members.ts` |
| `POST` | `/api/v1/communities/:id/members` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/members.ts` |
| `DELETE` | `/api/v1/communities/:id/members/:memberId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/members.ts` |
| `PATCH` | `/api/v1/communities/:id/members/:memberId/role` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/members.ts` |
| `GET` | `/api/v1/communities/check-identifier/:identifier` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/core.ts` |
| `GET` | `/api/v1/communities/mine` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/membership.ts` |
| `GET` | `/api/v1/communities/search` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/communities/search.ts` |
| `GET` | `/api/v1/conversation/:identifier` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation-non-blocking.ts` |
| `GET` | `/api/v1/conversations` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `POST` | `/api/v1/conversations` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `GET` | `/api/v1/conversations/:conversationId/active-call` | S2 | — | `/api/v1` | `services/gateway/src/routes/calls.ts` |
| `GET` | `/api/v1/conversations/:conversationId/attachments` | S2 | — | `/api/v1` | `services/gateway/src/routes/attachments/metadata.ts` |
| `POST` | `/api/v1/conversations/:conversationId/encryption` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversation-encryption.ts` |
| `GET` | `/api/v1/conversations/:conversationId/encryption-status` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversation-encryption.ts` |
| `GET` | `/api/v1/conversations/:conversationId/links` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/sharing.ts` |
| `POST` | `/api/v1/conversations/:conversationId/mark-as-read` | S2 | — | `/api/v1` | `services/gateway/src/routes/message-read-status.ts` |
| `POST` | `/api/v1/conversations/:conversationId/mark-as-received` | S2 | — | `/api/v1` | `services/gateway/src/routes/message-read-status.ts` |
| `POST` | `/api/v1/conversations/:conversationId/messages/:messageId/delivery-receipt` | S2 | — | `/api/v1` | `services/gateway/src/routes/message-read-status.ts` |
| `GET` | `/api/v1/conversations/:conversationId/read-statuses` | S2 | — | `/api/v1` | `services/gateway/src/routes/message-read-status.ts` |
| `DELETE` | `/api/v1/conversations/:id` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `GET` | `/api/v1/conversations/:id` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `PATCH` | `/api/v1/conversations/:id` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `PUT` | `/api/v1/conversations/:id` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `GET` | `/api/v1/conversations/:id/analysis` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `DELETE` | `/api/v1/conversations/:id/delete-for-me` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/delete-for-me.ts` |
| `POST` | `/api/v1/conversations/:id/invite` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/conversations/sharing.ts` |
| `POST` | `/api/v1/conversations/:id/leave` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/leave.ts` |
| `POST` | `/api/v1/conversations/:id/mark-read` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `POST` | `/api/v1/conversations/:id/mark-unread` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `GET` | `/api/v1/conversations/:id/messages` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `POST` | `/api/v1/conversations/:id/messages` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `DELETE` | `/api/v1/conversations/:id/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages-advanced.ts` |
| `PUT` | `/api/v1/conversations/:id/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages-advanced.ts` |
| `POST` | `/api/v1/conversations/:id/messages/:messageId/consume` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `DELETE` | `/api/v1/conversations/:id/messages/:messageId/pin` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `PUT` | `/api/v1/conversations/:id/messages/:messageId/pin` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `GET` | `/api/v1/conversations/:id/messages/search` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `POST` | `/api/v1/conversations/:id/new-link` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/sharing.ts` |
| `GET` | `/api/v1/conversations/:id/participants` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/participants.ts` |
| `POST` | `/api/v1/conversations/:id/participants` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/participants.ts` |
| `GET` | `/api/v1/conversations/:id/participants/:participantId/profile` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/participants.ts` |
| `PATCH` | `/api/v1/conversations/:id/participants/:participantId/rights` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/participants.ts` |
| `DELETE` | `/api/v1/conversations/:id/participants/:userId` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/participant-removal.ts` |
| `PATCH` | `/api/v1/conversations/:id/participants/:userId/ban` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/ban.ts` |
| `PATCH` | `/api/v1/conversations/:id/participants/:userId/role` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/participant-role.ts` |
| `PATCH` | `/api/v1/conversations/:id/participants/:userId/unban` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/ban.ts` |
| `GET` | `/api/v1/conversations/:id/pinned-messages` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages.ts` |
| `GET` | `/api/v1/conversations/:id/reactions` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages-advanced.ts` |
| `GET` | `/api/v1/conversations/:id/stats` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/stats.ts` |
| `GET` | `/api/v1/conversations/:id/status` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages-advanced.ts` |
| `GET` | `/api/v1/conversations/:id/threads/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/threads.ts` |
| `GET` | `/api/v1/conversations/check-identifier/:identifier` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/core.ts` |
| `POST` | `/api/v1/conversations/join/:linkId` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/sharing.ts` |
| `GET` | `/api/v1/conversations/search` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/search.ts` |
| `POST` | `/api/v1/detect-language` | S0 | — | `/api/v1` | `services/gateway/src/routes/translation.ts` |
| `GET` | `/api/v1/directory/availability` | S0 | — | `/api/v1/directory` | `services/gateway/src/routes/directory/availability.ts` |
| `GET` | `/api/v1/directory/blocks` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/blocks.ts` |
| `DELETE` | `/api/v1/directory/blocks/:userId` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/blocks.ts` |
| `PUT` | `/api/v1/directory/blocks/:userId` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/blocks.ts` |
| `DELETE` | `/api/v1/directory/contacts` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/contacts.ts` |
| `GET` | `/api/v1/directory/contacts` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/contacts.ts` |
| `PATCH` | `/api/v1/directory/contacts` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/contacts.ts` |
| `PUT` | `/api/v1/directory/contacts` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/contacts.ts` |
| `GET` | `/api/v1/directory/friend-requests` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/friend-requests.ts` |
| `POST` | `/api/v1/directory/friend-requests` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/friend-requests.ts` |
| `PATCH` | `/api/v1/directory/friend-requests/:id` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/friend-requests.ts` |
| `GET` | `/api/v1/directory/people` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/people.ts` |
| `GET` | `/api/v1/directory/people/:handle` | S0 | — | `/api/v1/directory` | `services/gateway/src/routes/directory/person.ts` |
| `GET` | `/api/v1/directory/presence` | S2 | fastify.authenticate | `/api/v1/directory` | `services/gateway/src/routes/directory/presence.ts` |
| `POST` | `/api/v1/friend-requests` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/friends.ts` |
| `DELETE` | `/api/v1/friend-requests/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/friends.ts` |
| `PATCH` | `/api/v1/friend-requests/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/friends.ts` |
| `GET` | `/api/v1/friend-requests/received` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/friends.ts` |
| `GET` | `/api/v1/friend-requests/sent` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/friends.ts` |
| `GET` | `/api/v1/hashtags/trending` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/hashtag.ts` |
| `GET` | `/api/v1/health/circuit-breakers` | S5 | requirePermission(canAccessAdmin, canViewAnalytics) | `/api/v1/health` | `services/gateway/src/routes/health/index.ts` |
| `GET` | `/api/v1/health/metrics` | S5 | requirePermission(canAccessAdmin, canViewAnalytics) | `/api/v1/health` | `services/gateway/src/routes/health/index.ts` |
| `GET` | `/api/v1/health/ready` | S0 | — | `/api/v1/health` | `services/gateway/src/routes/health/index.ts` |
| `POST` | `/api/v1/invitations/email` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/invitations.ts` |
| `GET` | `/api/v1/l/:token` | S0 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/languages` | S0 | — | `/api/v1` | `services/gateway/src/routes/translation.ts` |
| `GET` | `/api/v1/links` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/user.ts` |
| `POST` | `/api/v1/links` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/creation.ts` |
| `GET` | `/api/v1/links/:identifier` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/retrieval.ts` |
| `GET` | `/api/v1/links/:identifier/messages` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/messages-retrieval.ts` |
| `POST` | `/api/v1/links/:identifier/messages` | S0 | — | `/api/v1` | `services/gateway/src/routes/links/messages.ts` |
| `DELETE` | `/api/v1/links/:linkId` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/admin.ts` |
| `PATCH` | `/api/v1/links/:linkId` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/management.ts` |
| `PATCH` | `/api/v1/links/:linkId/extend` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/admin.ts` |
| `PATCH` | `/api/v1/links/:linkId/toggle` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/admin.ts` |
| `GET` | `/api/v1/links/check-identifier/:identifier` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/validation.ts` |
| `GET` | `/api/v1/links/my-links` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/admin.ts` |
| `GET` | `/api/v1/links/stats` | S2 | — | `/api/v1` | `services/gateway/src/routes/links/user.ts` |
| `GET` | `/api/v1/me` | S2 | fastify.authenticate | `/api/v1/me` | `services/gateway/src/routes/me/index.ts` |
| `GET` | `/api/v1/me/account/deletion` | S2 | fastify.authenticate | `/api/v1/me` | `services/gateway/src/routes/me/delete-account.ts` |
| `POST` | `/api/v1/me/account/deletion` | S2 | fastify.authenticate | `/api/v1/me` | `services/gateway/src/routes/me/delete-account.ts` |
| `DELETE` | `/api/v1/me/delete-account` | S2 | fastify.authenticate | `/api/v1/me` | `services/gateway/src/routes/me/delete-account.ts` |
| `GET` | `/api/v1/me/delete-account/cancel` | S0 | — | `/api/v1/me` | `services/gateway/src/routes/me/delete-account.ts` |
| `GET` | `/api/v1/me/delete-account/confirm` | S0 | — | `/api/v1/me` | `services/gateway/src/routes/me/delete-account.ts` |
| `GET` | `/api/v1/me/delete-account/delete-now` | S0 | — | `/api/v1/me` | `services/gateway/src/routes/me/delete-account.ts` |
| `GET` | `/api/v1/me/export` | S2 | fastify.authenticate | `/api/v1/me` | `services/gateway/src/routes/me/export.ts` |
| `DELETE` | `/api/v1/me/preferences` | S2 | — | `/api/v1/me/preferences` | `services/gateway/src/routes/me/preferences/unified-routes.ts` |
| `GET` | `/api/v1/me/preferences` | S2 | — | `/api/v1/me/preferences` | `services/gateway/src/routes/me/preferences/unified-routes.ts` |
| `PATCH` | `/api/v1/me/preferences` | S2 | — | `/api/v1/me/preferences` | `services/gateway/src/routes/me/preferences/unified-routes.ts` |
| `DELETE` | `/api/v1/me/preferences/application` | S2 | — | `/api/v1/me/preferences/application` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/application` | S2 | — | `/api/v1/me/preferences/application` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/application` | S2 | — | `/api/v1/me/preferences/application` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/application` | S2 | — | `/api/v1/me/preferences/application` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `DELETE` | `/api/v1/me/preferences/audio` | S2 | — | `/api/v1/me/preferences/audio` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/audio` | S2 | — | `/api/v1/me/preferences/audio` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/audio` | S2 | — | `/api/v1/me/preferences/audio` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/audio` | S2 | — | `/api/v1/me/preferences/audio` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/categories` | S2 | — | `/api/v1/me/preferences/categories` | `services/gateway/src/routes/me/preferences/categories.ts` |
| `POST` | `/api/v1/me/preferences/categories` | S2 | — | `/api/v1/me/preferences/categories` | `services/gateway/src/routes/me/preferences/categories.ts` |
| `DELETE` | `/api/v1/me/preferences/categories/:categoryId` | S2 | — | `/api/v1/me/preferences/categories` | `services/gateway/src/routes/me/preferences/categories.ts` |
| `GET` | `/api/v1/me/preferences/categories/:categoryId` | S2 | — | `/api/v1/me/preferences/categories` | `services/gateway/src/routes/me/preferences/categories.ts` |
| `PATCH` | `/api/v1/me/preferences/categories/:categoryId` | S2 | — | `/api/v1/me/preferences/categories` | `services/gateway/src/routes/me/preferences/categories.ts` |
| `POST` | `/api/v1/me/preferences/categories/reorder` | S2 | — | `/api/v1/me/preferences/categories` | `services/gateway/src/routes/me/preferences/categories.ts` |
| `DELETE` | `/api/v1/me/preferences/document` | S2 | — | `/api/v1/me/preferences/document` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/document` | S2 | — | `/api/v1/me/preferences/document` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/document` | S2 | — | `/api/v1/me/preferences/document` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/document` | S2 | — | `/api/v1/me/preferences/document` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/encryption` | S2 | — | `/api/v1/me/preferences` | `services/gateway/src/routes/me/preferences/index.ts` |
| `DELETE` | `/api/v1/me/preferences/message` | S2 | — | `/api/v1/me/preferences/message` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/message` | S2 | — | `/api/v1/me/preferences/message` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/message` | S2 | — | `/api/v1/me/preferences/message` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/message` | S2 | — | `/api/v1/me/preferences/message` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `DELETE` | `/api/v1/me/preferences/notification` | S2 | — | `/api/v1/me/preferences/notification` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/notification` | S2 | — | `/api/v1/me/preferences/notification` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/notification` | S2 | — | `/api/v1/me/preferences/notification` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/notification` | S2 | — | `/api/v1/me/preferences/notification` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `DELETE` | `/api/v1/me/preferences/privacy` | S2 | — | `/api/v1/me/preferences/privacy` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/privacy` | S2 | — | `/api/v1/me/preferences/privacy` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/privacy` | S2 | — | `/api/v1/me/preferences/privacy` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/privacy` | S2 | — | `/api/v1/me/preferences/privacy` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `DELETE` | `/api/v1/me/preferences/video` | S2 | — | `/api/v1/me/preferences/video` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/me/preferences/video` | S2 | — | `/api/v1/me/preferences/video` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PATCH` | `/api/v1/me/preferences/video` | S2 | — | `/api/v1/me/preferences/video` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `PUT` | `/api/v1/me/preferences/video` | S2 | — | `/api/v1/me/preferences/video` | `services/gateway/src/routes/me/preferences/preference-router-factory.ts` |
| `GET` | `/api/v1/mentions/me` | S2 | — | `/api/v1` | `services/gateway/src/routes/mentions.ts` |
| `GET` | `/api/v1/mentions/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/mentions.ts` |
| `GET` | `/api/v1/mentions/suggestions` | S2 | — | `/api/v1` | `services/gateway/src/routes/mentions.ts` |
| `DELETE` | `/api/v1/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `GET` | `/api/v1/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `PATCH` | `/api/v1/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/conversations/messages-advanced.ts` |
| `PUT` | `/api/v1/messages/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `GET` | `/api/v1/messages/:messageId/read-status` | S2 | — | `/api/v1` | `services/gateway/src/routes/message-read-status.ts` |
| `GET` | `/api/v1/messages/:messageId/status-details` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `GET` | `/api/v1/messages/:messageId/translations` | S2 | — | `/api/v1` | `services/gateway/src/routes/messages.ts` |
| `GET` | `/api/v1/notifications` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `DELETE` | `/api/v1/notifications/:id` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `POST` | `/api/v1/notifications/:id/read` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `DELETE` | `/api/v1/notifications/admin/clear-all` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `POST` | `/api/v1/notifications/conversation/:conversationId/read` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `GET` | `/api/v1/notifications/counts` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `POST` | `/api/v1/notifications/post/:postId/read` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `DELETE` | `/api/v1/notifications/read` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `POST` | `/api/v1/notifications/read-all` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `POST` | `/api/v1/notifications/read-by-types` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `GET` | `/api/v1/notifications/unread-count` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/notifications.ts` |
| `POST` | `/api/v1/posts` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/core.ts` |
| `DELETE` | `/api/v1/posts/:postId` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/core.ts` |
| `GET` | `/api/v1/posts/:postId` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/core.ts` |
| `PUT` | `/api/v1/posts/:postId` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/core.ts` |
| `POST` | `/api/v1/posts/:postId/anonymous-view` | S1 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `DELETE` | `/api/v1/posts/:postId/bookmark` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/bookmarks.ts` |
| `POST` | `/api/v1/posts/:postId/bookmark` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/bookmarks.ts` |
| `GET` | `/api/v1/posts/:postId/comments` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `POST` | `/api/v1/posts/:postId/comments` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `DELETE` | `/api/v1/posts/:postId/comments/:commentId` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `PATCH` | `/api/v1/posts/:postId/comments/:commentId` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `DELETE` | `/api/v1/posts/:postId/comments/:commentId/like` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `POST` | `/api/v1/posts/:postId/comments/:commentId/like` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `GET` | `/api/v1/posts/:postId/comments/:commentId/replies` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `POST` | `/api/v1/posts/:postId/comments/:commentId/translate` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/comments.ts` |
| `POST` | `/api/v1/posts/:postId/downloads` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `POST` | `/api/v1/posts/:postId/impression` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/impressions.ts` |
| `GET` | `/api/v1/posts/:postId/interactions` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `DELETE` | `/api/v1/posts/:postId/like` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `POST` | `/api/v1/posts/:postId/like` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `DELETE` | `/api/v1/posts/:postId/pin` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `POST` | `/api/v1/posts/:postId/pin` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `POST` | `/api/v1/posts/:postId/repost` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `POST` | `/api/v1/posts/:postId/republish` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `POST` | `/api/v1/posts/:postId/share` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/share.ts` |
| `POST` | `/api/v1/posts/:postId/translate` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/core.ts` |
| `POST` | `/api/v1/posts/:postId/view` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `GET` | `/api/v1/posts/:postId/views` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `GET` | `/api/v1/posts/bookmarks` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `GET` | `/api/v1/posts/community/:communityId` | S0 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `POST` | `/api/v1/posts/engagement/batch` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/interactions.ts` |
| `GET` | `/api/v1/posts/feed` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `GET` | `/api/v1/posts/feed/reels` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `GET` | `/api/v1/posts/feed/statuses` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `GET` | `/api/v1/posts/feed/statuses/discover` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `GET` | `/api/v1/posts/feed/stories` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `POST` | `/api/v1/posts/from-attachment` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/core.ts` |
| `GET` | `/api/v1/posts/hashtag/:tag` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/hashtag.ts` |
| `POST` | `/api/v1/posts/impressions/batch` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/impressions.ts` |
| `DELETE` | `/api/v1/posts/media/:mediaId` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/media.ts` |
| `GET` | `/api/v1/posts/nearby` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/nearby.ts` |
| `GET` | `/api/v1/posts/nearby/density` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/nearby.ts` |
| `GET` | `/api/v1/posts/stories/mine` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `GET` | `/api/v1/posts/user/:userId` | S0 | — | `/api/v1` | `services/gateway/src/routes/posts/feed.ts` |
| `POST` | `/api/v1/reactions` | S2 | — | `/api/v1` | `services/gateway/src/routes/reactions.ts` |
| `GET` | `/api/v1/reactions/:messageId` | S2 | — | `/api/v1` | `services/gateway/src/routes/reactions.ts` |
| `DELETE` | `/api/v1/reactions/:messageId/:emoji` | S2 | — | `/api/v1` | `services/gateway/src/routes/reactions.ts` |
| `GET` | `/api/v1/reactions/user/:userId` | S2 | — | `/api/v1` | `services/gateway/src/routes/reactions.ts` |
| `POST` | `/api/v1/reports` | S2 | fastify.authenticate | `/api/v1/reports` | `services/gateway/src/routes/reports/index.ts` |
| `POST` | `/api/v1/signal/keys` | S2 | — | `/api/v1` | `services/gateway/src/routes/signal-protocol.ts` |
| `GET` | `/api/v1/signal/keys/:userId` | S2 | — | `/api/v1` | `services/gateway/src/routes/signal-protocol.ts` |
| `POST` | `/api/v1/signal/session/establish` | S2 | — | `/api/v1` | `services/gateway/src/routes/signal-protocol.ts` |
| `GET` | `/api/v1/sounds/:id` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/sounds.ts` |
| `PATCH` | `/api/v1/sounds/:id` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/sounds.ts` |
| `GET` | `/api/v1/sounds/:id/posts` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/sounds.ts` |
| `GET` | `/api/v1/sounds/mine` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/sounds.ts` |
| `GET` | `/api/v1/static/:filename` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/audio.ts` |
| `GET` | `/api/v1/stats` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/maintenance.ts` |
| `GET` | `/api/v1/status-metrics` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/maintenance.ts` |
| `POST` | `/api/v1/status-metrics/reset` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/maintenance.ts` |
| `GET` | `/api/v1/status/:messageId/:language` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation-non-blocking.ts` |
| `GET` | `/api/v1/stories/audio` | S2 | — | `/api/v1` | `services/gateway/src/routes/posts/audio.ts` |
| `GET` | `/api/v1/sync` | S2 | — | `/api/v1` | `services/gateway/src/routes/sync.ts` |
| `GET` | `/api/v1/test` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation.ts` |
| `POST` | `/api/v1/tracking-links` | S0 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `DELETE` | `/api/v1/tracking-links/:token` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `GET` | `/api/v1/tracking-links/:token` | S0 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `PATCH` | `/api/v1/tracking-links/:token` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `POST` | `/api/v1/tracking-links/:token/click` | S0 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/tracking-links/:token/clicks` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `PATCH` | `/api/v1/tracking-links/:token/deactivate` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `POST` | `/api/v1/tracking-links/:token/redirect-status` | S0 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/tracking-links/:token/resolve` | S0 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `GET` | `/api/v1/tracking-links/:token/stats` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/tracking-links/admin/:token/clicks` | S5 | requirePermission(canViewAnalytics) | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/tracking-links/admin/all` | S5 | requirePermission(canViewAnalytics) | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/tracking-links/check-token/:token` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `GET` | `/api/v1/tracking-links/conversation/:conversationId` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `GET` | `/api/v1/tracking-links/stats` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/tracking.ts` |
| `GET` | `/api/v1/tracking-links/user/me` | S2 | — | `/api/v1` | `services/gateway/src/routes/tracking-links/creation.ts` |
| `POST` | `/api/v1/translate` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation-non-blocking.ts` |
| `POST` | `/api/v1/translate-blocking` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation.ts` |
| `DELETE` | `/api/v1/translate/jobs/:jobId` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation-jobs.ts` |
| `GET` | `/api/v1/translate/jobs/:jobId` | S2 | — | `/api/v1` | `services/gateway/src/routes/translation-jobs.ts` |
| `GET` | `/api/v1/u/:username` | S0 | — | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `POST` | `/api/v1/uploads` | S2 | — | `(vide)` | `services/gateway/src/routes/uploads/tus-handler.ts` |
| `DELETE` | `/api/v1/uploads/*` | S2 | — | `(vide)` | `services/gateway/src/routes/uploads/tus-handler.ts` |
| `PATCH` | `/api/v1/uploads/*` | S2 | — | `(vide)` | `services/gateway/src/routes/uploads/tus-handler.ts` |
| `POST` | `/api/v1/uploads/*` | S2 | — | `(vide)` | `services/gateway/src/routes/uploads/tus-handler.ts` |
| `GET` | `/api/v1/user-preferences/communities` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/community-preferences.ts` |
| `DELETE` | `/api/v1/user-preferences/communities/:communityId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/community-preferences.ts` |
| `GET` | `/api/v1/user-preferences/communities/:communityId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/community-preferences.ts` |
| `PUT` | `/api/v1/user-preferences/communities/:communityId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/community-preferences.ts` |
| `POST` | `/api/v1/user-preferences/communities/reorder` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/community-preferences.ts` |
| `GET` | `/api/v1/user-preferences/conversations` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/conversation-preferences.ts` |
| `DELETE` | `/api/v1/user-preferences/conversations/:conversationId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/conversation-preferences.ts` |
| `GET` | `/api/v1/user-preferences/conversations/:conversationId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/conversation-preferences.ts` |
| `PUT` | `/api/v1/user-preferences/conversations/:conversationId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/conversation-preferences.ts` |
| `POST` | `/api/v1/user-preferences/reorder` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/conversation-preferences.ts` |
| `POST` | `/api/v1/user-status` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/maintenance.ts` |
| `GET` | `/api/v1/users/:id` | S0 | — | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `GET` | `/api/v1/users/:userId/affiliate-token` | S2 | — | `/api/v1` | `services/gateway/src/routes/users/devices.ts` |
| `DELETE` | `/api/v1/users/:userId/block` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/blocking.ts` |
| `POST` | `/api/v1/users/:userId/block` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/blocking.ts` |
| `GET` | `/api/v1/users/:userId/stats` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/preferences.ts` |
| `GET` | `/api/v1/users/email/:email` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `GET` | `/api/v1/users/friend-requests` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/devices.ts` |
| `GET` | `/api/v1/users/id/:id` | S0 | — | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `PATCH` | `/api/v1/users/me` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `PATCH` | `/api/v1/users/me/avatar` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `PATCH` | `/api/v1/users/me/banner` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `GET` | `/api/v1/users/me/blocked-users` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/blocking.ts` |
| `POST` | `/api/v1/users/me/change-email` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contact-change.ts` |
| `POST` | `/api/v1/users/me/change-phone` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contact-change.ts` |
| `DELETE` | `/api/v1/users/me/contacts` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contacts-directory.ts` |
| `GET` | `/api/v1/users/me/contacts` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contacts-directory.ts` |
| `POST` | `/api/v1/users/me/contacts/match` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contacts-match.ts` |
| `POST` | `/api/v1/users/me/contacts/sync` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contacts-directory.ts` |
| `GET` | `/api/v1/users/me/dashboard-stats` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/preferences.ts` |
| `GET` | `/api/v1/users/me/devices` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/push-tokens.ts` |
| `DELETE` | `/api/v1/users/me/devices/:deviceId` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/push-tokens.ts` |
| `PATCH` | `/api/v1/users/me/password` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `POST` | `/api/v1/users/me/resend-email-change-verification` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contact-change.ts` |
| `GET` | `/api/v1/users/me/stats` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/user-stats.ts` |
| `GET` | `/api/v1/users/me/stats/achievements` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/user-stats.ts` |
| `GET` | `/api/v1/users/me/stats/timeline` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/user-stats.ts` |
| `PATCH` | `/api/v1/users/me/username` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `POST` | `/api/v1/users/me/verify-email-change` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contact-change.ts` |
| `POST` | `/api/v1/users/me/verify-phone-change` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/contact-change.ts` |
| `GET` | `/api/v1/users/phone/:phone` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/profile.ts` |
| `GET` | `/api/v1/users/presence` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/presence.ts` |
| `DELETE` | `/api/v1/users/register-device-token` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/push-tokens.ts` |
| `POST` | `/api/v1/users/register-device-token` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/push-tokens.ts` |
| `GET` | `/api/v1/users/search` | S2 | fastify.authenticate | `/api/v1` | `services/gateway/src/routes/users/preferences.ts` |
| `GET` | `/api/v1/voice/admin/metrics` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/analysis.ts` |
| `POST` | `/api/v1/voice/analyze` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/analysis.ts` |
| `POST` | `/api/v1/voice/compare` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/analysis.ts` |
| `POST` | `/api/v1/voice/feedback` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/analysis.ts` |
| `GET` | `/api/v1/voice/history` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/analysis.ts` |
| `DELETE` | `/api/v1/voice/job/:jobId` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/translation.ts` |
| `GET` | `/api/v1/voice/job/:jobId` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/translation.ts` |
| `GET` | `/api/v1/voice/languages` | inconnu | — | `(vide)` | `services/gateway/src/routes/voice/analysis.ts` |
| `DELETE` | `/api/v1/voice/profile` | S2 | — | `/api/v1/voice/profile` | `services/gateway/src/routes/voice-profile.ts` |
| `GET` | `/api/v1/voice/profile` | S2 | — | `/api/v1/voice/profile` | `services/gateway/src/routes/voice-profile.ts` |
| `PUT` | `/api/v1/voice/profile/:profileId` | S2 | — | `/api/v1/voice/profile` | `services/gateway/src/routes/voice-profile.ts` |
| `GET` | `/api/v1/voice/profile/consent` | S2 | — | `/api/v1/voice/profile` | `services/gateway/src/routes/voice-profile.ts` |
| `POST` | `/api/v1/voice/profile/consent` | S2 | — | `/api/v1/voice/profile` | `services/gateway/src/routes/voice-profile.ts` |
| `POST` | `/api/v1/voice/profile/register` | S2 | — | `/api/v1/voice/profile` | `services/gateway/src/routes/voice-profile.ts` |
| `POST` | `/api/v1/voice/transcribe` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/translation.ts` |
| `POST` | `/api/v1/voice/translate` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/translation.ts` |
| `POST` | `/api/v1/voice/translate/async` | S2 | — | `(vide)` | `services/gateway/src/routes/voice/translation.ts` |
| `GET` | `/attachments/:attachmentId/analysis` | S2 | — | `(vide)` | `services/gateway/src/routes/voice-analysis.ts` |
| `POST` | `/attachments/:attachmentId/analysis` | S2 | — | `(vide)` | `services/gateway/src/routes/voice-analysis.ts` |
| `POST` | `/attachments/batch/analysis` | S2 | — | `(vide)` | `services/gateway/src/routes/voice-analysis.ts` |
| `GET` | `/health` | S0 | — | `(vide)` | `services/gateway/src/route-registration.ts` |
| `GET` | `/info` | S0 | — | `(vide)` | `services/gateway/src/route-registration.ts` |
| `GET` | `/voice/analysis` | S2 | — | `(vide)` | `services/gateway/src/routes/voice-analysis.ts` |
| `POST` | `/voice/analysis` | S2 | — | `(vide)` | `services/gateway/src/routes/voice-analysis.ts` |
