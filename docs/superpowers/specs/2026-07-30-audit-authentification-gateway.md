# Audit d'authentification du gateway — 2026-07-30

## Contexte

Quatre failles d'authentification ont été trouvées par hasard en cherchant autre chose, et toutes sont corrigées avant cet audit :

1. `POST /translate-blocking` — aucune authentification, garde d'appartenance enfermée dans `if (userId)` (`2c0f0fcca`).
2. `routes/voice/*` — l'en-tête client `x-user-id` valait preuve d'identité (`8c9b0b2fa`).
3. `routes/maintenance.ts` — cinq routes d'administration sans aucune garde (`8da4dc3be`).
4. `GET /test` — déclenchait un job du pipeline ML sans authentification (corrigé dans le même commit que le point 1).

Quatre trouvailles fortuites, c'est le signe qu'il faut arrêter de chercher au cas par cas. Cet audit répond en deux temps :

- **Mission 1** (ce document) : inventaire exhaustif des routes HTTP réellement enregistrées par `server.ts`, avec leur protection effective.
- **Mission 2** (`src/__tests__/security/route-auth-coverage.test.ts`) : un test qui assemble le VRAI graphe de routes et échoue si une route non exceptée laisse passer un appelant totalement anonyme — pour que la prochaine régression soit détectée automatiquement, pas trouvée par hasard.
- **Mission 3** (dernière section) : ce qu'il faudrait faire pour rattacher le middleware de limitation de débit Traefik au gateway, sans y toucher.

Infrastructure confirmée pendant l'audit : le gateway est atteignable depuis l'Internet public en production (`docker-compose.prod.yml`, routeur Traefik `Host` sans restriction de chemin) et en staging, le middleware `rate-limit` de `infrastructure/docker/compose/config/dynamic.yaml` n'est rattaché à AUCUN routeur (seul `compress@file` l'est), et le CORS autorise les requêtes sans en-tête `Origin` (`server.ts`, config CORS : `if (!origin || allowedOrigins.includes(origin))`). Aucune des failles ci-dessous n'était donc atténuée par le déploiement.

## Méthodologie

L'inventaire part de `server.ts` (aujourd'hui `route-registration.ts`, voir Mission 2), pas d'une recherche de motifs : chaque `await server.register(...)` a été tracé jusqu'au fichier de routes réel, en descendant dans chaque sous-module, pour déterminer ce qui protège RÉELLEMENT chaque route déclarée — `preHandler`, `onRequest`, `preValidation`, garde héritée d'un `fastify.addHook` posé en tête de fichier, ou rien. Neuf explorations parallèles ont couvert la totalité de l'arborescence `src/routes/`, avec deux pièges identifiés à l'avance et confirmés en cours de route :

- `requireAdmin`/`requireModerator`/`requireAnalyst` lisent `authContext.registeredUser.role`, **pas** `request.user`. Une garde posée sans qu'`authContext` soit peuplé en amont (par `fastify.authenticate` ou équivalent) échoue silencieusement — mais dans le sens **fermé** (403 pour tout le monde, y compris les admins légitimes), pas ouvert. Deux cas confirmés : `admin/agent-topics.ts` (`request.user.role`, jamais peuplé) et `routes/notifications.ts` `DELETE /admin/clear-all` (même lecture). Ce sont des régressions fonctionnelles, pas des trous — documentées ci-dessous mais **hors périmètre de correction** de cette mission.
- Une route peut être déclarée dans un fichier qui contient par ailleurs des routes protégées sans l'être elle-même — confirmé sur `admin/reports.ts` (`POST /` sans garde de rôle, alors que les 9 autres routes du fichier en ont une) et sur plusieurs fichiers `tracking-links`.

Un piège supplémentaire, non anticipé au départ mais retrouvé à plusieurs endroits indépendants, dérive de la valeur par défaut du contexte non authentifié (`middleware/auth.ts`, `createUnauthenticatedContext()`) : `isAuthenticated: false` **mais `isAnonymous: true`**, même en l'absence totale de credential. Toute garde écrite `!authContext.isAuthenticated && !authContext.isAnonymous` est donc **toujours fausse** pour un appelant sans rien du tout — le même anti-pattern que le vieux `if (userId) {...}` de `/translate-blocking`, sous une forme différente. Retrouvé sur quatre routes d'attachments (voir Mission 1 §7).

Code mort confirmé et exclu de l'inventaire vivant (aucun `server.ts`/`route-registration.ts` ne les enregistre, seuls des tests ou un `index.ts` lui-même mort les référencent) :
- `routes/admin/index.ts`, `routes/admin/roles.ts`, `routes/admin/system.ts` (`admin/system.ts` est un fichier vide).
- `routes/communities/{index,core,members,search,settings,types}.ts` — **collision de résolution de module** : `server.ts` importe `from './routes/communities'`, et Node/TypeScript résout le **fichier** `communities.ts` avant le **dossier** `communities/`. Le dossier contient une version plus aboutie (sanitisation XSS, gating de présence) mais n'est jamais exécuté — et porte le même bug d'IDOR que le fichier actif (§3), donc ce n'est pas un filet de sécurité de secours.

---

## Mission 1 — Inventaire des routes

**502 routes** réellement enregistrées (comptées par le hook `onRoute` de Fastify sur le graphe assemblé, HEAD/OPTIONS auto-générées exclues). Répartition par verdict :

| Verdict | Compte approximatif | Note |
|---|---|---|
| Protégée (authentification exigée, appelant anonyme rejeté en 401/403) | ~419 | Confirmé mécaniquement par le test de garde (Mission 2) |
| Légitimement publique (santé, inscription, connexion, flux de récupération de compte, lien de partage anonyme avec token vérifié) | 65 | Liste exhaustive dans `PUBLIC_ROUTES`, `route-auth-coverage.test.ts` |
| Trou confirmé (accessible sans aucune identité, non voulu) | 16 lignes de garde (18 entrées avec les doublons de montage `/api` legacy) | Liste `KNOWN_GAPS`, détaillée ci-dessous |
| IDOR/BOLA authentifié (rejette l'anonyme, mais pas le mauvais utilisateur) | ~15+ | Hors périmètre du test comportemental (authentification ≠ autorisation), documenté route par route ci-dessous |

Les tableaux ci-dessous sont organisés par domaine fonctionnel, dans l'ordre où `route-registration.ts` les enregistre. Colonnes : méthode, chemin complet, fichier:ligne, protection effective, verdict, et — pour tout ce qui n'est pas légitimement public — ce qu'un appelant anonyme obtient concrètement.

### 1. Authentification, sessions, comptes (`routes/auth/*`, `password-reset.ts`, `two-factor.ts`, `magic-link.ts`, `user-deletions.ts`)

| Méthode | Chemin | Fichier:ligne | Protection | Verdict | Anonyme obtient |
|---|---|---|---|---|---|
| POST | `/api/v1/auth/register` | `auth/register.ts:28` | `registerRateLimiter` + `authGlobalRateLimiter` | légitimement publique | — |
| POST | `/api/v1/auth/login` | `auth/login.ts:43` | `loginRateLimiter` + `authGlobalRateLimiter` | légitimement publique | — |
| POST | `/api/v1/auth/login/2fa` | `auth/login.ts:178` | aucune (rate-limit global uniquement) | légitimement publique (étape du flux, protégée par le `twoFactorToken` du corps) | brute-force du code TOTP possible sans limiteur dédié (contrairement à `/login`) — noté, pas un trou d'auth |
| POST | `/api/v1/auth/logout` | `auth/login.ts:291` | `fastify.authenticate` | protégée | — |
| GET | `/api/v1/auth/me` | `auth/magic-link.ts:33` | `createUnifiedAuthMiddleware({requireAuth:true})` | protégée | — |
| **POST** | **`/api/v1/auth/refresh`** | **`auth/magic-link.ts:113`** | **aucune** | **CRITIQUE — à protéger** | **Usurpation d'identité complète : le `catch` de `jwt.verify` retombe sur `jwt.decode(token)` non vérifié (l.149-155). Un JWT forgé `{"userId":"<victime>"}` avec une signature bidon renvoie un JWT valide signé par le serveur pour le compte de la victime + son profil complet.** |
| POST | `/api/v1/auth/verify-email` | `auth/magic-link.ts:228` | aucune (token) | légitimement publique | — |
| POST | `/api/v1/auth/resend-verification` | `auth/magic-link.ts:295` | aucune, rate-limit global uniquement | légitimement publique | pas de limiteur dédié (email-bombing possible) |
| POST | `/api/v1/auth/send-phone-code` | `auth/magic-link.ts:341` | aucune, rate-limit global uniquement | légitimement publique | pas de limiteur dédié (SMS-bombing / coût télécom) |
| POST | `/api/v1/auth/verify-phone` | `auth/magic-link.ts:386` | aucune, rate-limit global uniquement | légitimement publique | brute-force du code SMS sans limiteur dédié |
| GET | `/api/v1/auth/sessions` | `auth/magic-link.ts:431` | `fastify.authenticate` | protégée | — |
| DELETE | `/api/v1/auth/sessions/:sessionId` | `auth/magic-link.ts:487` | `fastify.authenticate` + vérif propriétaire | protégée | — |
| DELETE | `/api/v1/auth/sessions` | `auth/magic-link.ts:555` | `fastify.authenticate` | protégée | — |
| POST | `/api/v1/auth/validate-session` | `auth/magic-link.ts:607` | aucune (sessionToken du corps) | légitimement publique | pas de limiteur dédié |
| POST | `/api/v1/auth/phone-transfer/{check,initiate,verify,resend,initiate-registration,verify-registration}` | `auth/phone-transfer.ts` | rate-limiters dédiés par étape | légitimement publique | — |
| POST | `/api/v1/auth/phone-transfer/cancel` | `auth/phone-transfer.ts:305` | aucune, rate-limit global uniquement | légitimement publique (même flux pré-session) | `transferId` non lié à un compte — DoS ciblé possible sur un flux de récupération d'un tiers si l'id est deviné |
| GET | `/api/v1/auth/check-availability` | `register.ts:182` | aucune, rate-limit global uniquement | légitimement publique | énumération de comptes par username/email/téléphone |
| **POST** | **`/api/v1/auth/force-init`** | **`register.ts:302`** | **aucune** | **CRITIQUE — à protéger** | **Déclenche `InitService.initializeDatabase()` : crée un compte BIGBOSS `meeshy`/ADMIN `atabeth` avec mot de passe codé en dur (`bigboss123`/`admin123`) si `MEESHY_PASSWORD`/`ATABETH_PASSWORD` ne sont pas positionnées et que les comptes n'existent pas. Le garde-fou `FORCE_DB_RESET` ne bloque le reset complet qu'en `NODE_ENV==='production'` strict — vulnérable en staging.** |
| GET | `/api/v1/auth/auth/revoke-all-sessions` | `auth/revoke-all-sessions.ts:16` | lien signé JWT vérifié dans le handler + `config.rateLimit:{max:5,timeWindow:'1 minute'}` | légitimement publique dans son principe | **bug fonctionnel distinct** : chemin réel `/auth/auth/...` (double segment — la route est déclarée avec `/auth/...` sur une instance déjà préfixée `/auth`), alors que `NotificationService.ts:3436` envoie un lien vers `/auth/revoke-all-sessions` (un seul `/auth`) → 404 en production, la fonctionnalité de révocation d'urgence est cassée |
| POST | `/api/v1/auth/forgot-password` | `password-reset.ts:107` | 3 rate-limiters dédiés | légitimement publique | — |
| POST | `/api/v1/auth/reset-password` | `password-reset.ts:208` | aucune, rate-limit global uniquement | légitimement publique | pas de limiteur dédié (contrairement aux autres routes du même fichier) |
| GET | `/api/v1/auth/reset-password/verify-token` | `password-reset.ts:324` | aucune, rate-limit global uniquement | légitimement publique | oracle de validité de token sans limiteur dédié |
| POST | `/api/v1/auth/forgot-password/phone/{lookup,verify-identity,verify-code,resend}` | `password-reset.ts` | rate-limiters dédiés | légitimement publique | — |
| POST | `/api/v1/auth/magic-link/request` | `magic-link.ts:43` | aucune, rate-limit global uniquement | légitimement publique | pas de limiteur dédié |
| GET/POST | `/api/v1/auth/magic-link/validate` | `magic-link.ts:126,216` | aucune, rate-limit global uniquement | légitimement publique | — |
| GET/POST/DELETE | `/api/v1/auth/2fa/*` (7 routes) | `two-factor.ts` | `fastify.authenticate` (toutes) | protégées | — |
| DELETE/POST/GET | `user-deletions.ts` (7 routes, `/api/conversations|messages|user/...`, préfixe racine sans `/v1`) | `user-deletions.ts` | `createUnifiedAuthMiddleware({requireAuth:true})`, cible toujours `authContext.userId` | protégées, pas d'IDOR | — |

### 2. Utilisateurs (`routes/users.ts`, `routes/users/*`)

| Méthode | Chemin | Fichier:ligne | Protection | Verdict | Anonyme obtient |
|---|---|---|---|---|---|
| GET/PATCH `users/me/*` (profil, avatar, banner, mot de passe, username) | `users/profile.ts` | `fastify.authenticate` | protégées | — |
| GET | `/api/v1/u/:username`, `/users/:id`, `/users/id/:id` | `users/profile.ts` | `optionalAuth`, email/téléphone jamais renvoyés | légitimement publique | profil public par design |
| GET | `/api/v1/users/email/:email`, `/users/phone/:phone` | `users/profile.ts:1088,1192` | `optionalAuth`, aucun rate-limit dédié | légitimement publique | primitive d'énumération par email/téléphone |
| GET | `/api/v1/users/friend-requests`, POST/PATCH idem | `users/devices.ts` | `fastify.authenticate` | protégées, pas d'IDOR | — |
| **GET** | **`/api/v1/users/:userId/affiliate-token`** | **`users/devices.ts:551`** | **aucune** | **à protéger** | **IDOR de lecture : récupère le token d'affiliation actif de n'importe quel utilisateur, sans auth ni rate-limit.** |
| GET/PUT/DELETE | `/api/v1/users`, `/users/:id` | `users/devices.ts:624,650,683` | aucune | légitimement publique (stubs no-op aujourd'hui, aucune donnée réelle) | doc Swagger affirme "Admin-only" — piège si implémenté sans ajouter la garde, à surveiller |
| POST/DELETE | `/users/:userId/block` | `users/blocking.ts` | `fastify.authenticate` | protégées | — |
| POST | `users/me/change-email`, `/change-phone` + vérifications | `users/contact-change.ts` | `fastify.authenticate` | protégées | — |
| POST | `users/me/contacts/match` | `users/contacts-match.ts` | `fastify.authenticate` | protégée | — |
| GET | `users/me/dashboard-stats`, `/users/:userId/stats`, `/users/search` | `users/preferences.ts` | `fastify.authenticate` | protégées | — |
| GET | `users/presence` | `users/presence.ts` | `fastify.authenticate` | protégée | — |

### 3. Conversations, liens, participation anonyme (`routes/conversations/*`, `sync.ts`, `links/*`, `tracking-links/*`, `anonymous.ts`)

Quasi-totalité protégée par `requiredAuth`/`optionalAuth`-puis-vérification-fail-closed ou `fastify.authenticate`. Aucune occurrence du piège `if (userId) {...}` retrouvée dans `conversations/*`/`sync.ts`/`anonymous.ts` (contrairement à l'historique `/translate-blocking`) — chaque contrôle d'appartenance est inconditionnel ou correctement bifurqué authentifié/anonyme.

**Faille confirmée — prise de contrôle de liens de tracking orphelins.** Cinq endpoints de `tracking-links/creation.ts` et `tracking-links/tracking.ts` partagent le pattern fail-open :
```ts
if (trackingLink.createdBy && trackingLink.createdBy !== userId) {
  return sendForbidden(...)
}
```
Quand `createdBy` est `null` — cas **systématique**, pas marginal : `links/messages.ts:194` (envoi de message via lien de partage anonyme) appelle toujours `processMessageLinks({..., createdBy: undefined})` — le contrôle est **entièrement sauté**. C'est exactement le pattern « vérification enfermée dans un `if` qui saute silencieusement le contrôle ». Toutes ces routes exigent `fastify.authenticate`/`authRequired` (donc un appelant **réellement anonyme** est rejeté en 401, ce qui les exclut du test comportemental de Mission 2) — mais n'importe quel **compte enregistré quelconque**, sans rapport avec la conversation, peut :

| Méthode | Chemin | Fichier:ligne | Ce qu'un compte enregistré arbitraire obtient |
|---|---|---|---|
| GET | `/api/v1/tracking-links/:token` | `tracking-links/creation.ts:261` | lit `conversationId`, `messageId`, `totalClicks`, `originalUrl` d'un lien orphelin |
| PATCH | `/api/v1/tracking-links/:token/deactivate` | `tracking-links/creation.ts:585` | désactive n'importe quel lien orphelin |
| DELETE | `/api/v1/tracking-links/:token` | `tracking-links/creation.ts:664` | supprime définitivement le lien + ses données de clics |
| **PATCH** | **`/api/v1/tracking-links/:token`** | **`tracking-links/creation.ts:789`** | **le plus grave : modifie `originalUrl` ET régénère le `token` — détournement de redirection / pivot de phishing sur un lien déjà partagé** |
| GET | `/api/v1/tracking-links/:token/stats` | `tracking-links/tracking.ts:535` | lit les analytics complètes (pays, device, référents) d'un lien orphelin |

Comparer avec `GET /tracking-links/:token/clicks` (`tracking.ts:702-704`), qui filtre `createdBy: userId` directement dans la requête Prisma — c'est le correctif de référence à répliquer sur les 5 endpoints fautifs.

Autre trou : `POST /api/v1/tracking-links` (création, `creation.ts:41-200`) utilise `authOptional` **sans aucune vérification d'appartenance** sur `conversationId`/`messageId` — un appelant anonyme peut associer un `TrackingLink` à n'importe quel identifiant arbitraire (pollution de données, pas de fuite directe).

Note secondaire (pas un trou) : `links/retrieval.ts`/`anonymous.ts` acceptent aussi un ObjectId Mongo brut comme `identifier` en plus du `linkId` `mshy_*` prévu comme secret — combiné à l'aperçu public par défaut (`allowViewHistory` vrai par défaut), la vraie protection d'un salon partagé repose sur l'entropie du `linkId`, pas cryptographiquement forte (`Math.random()` pour sa partie temporelle, `links/utils/link-helpers.ts:73`).

### 4. Communautés, préférences, chiffrement (`communities.ts`, `community-preferences.ts`, `conversation-preferences.ts`, `conversation-encryption.ts`, `signal-protocol.ts`)

Toutes les routes vivantes portent `fastify.authenticate` ou un `createUnifiedAuthMiddleware({requireAuth:true, allowAnonymous:false})` local strictement équivalent — confirmé, aucune route accessible sans compte enregistré. La surface E2EE (`signal-protocol.ts`, `conversation-encryption.ts`) croise systématiquement l'identifiant cible avec une table de vérité (participants, demandes d'amis) avant tout accès aux clés — aucune faille trouvée.

**Faille confirmée — élévation de privilège inter-communautés (authentifiée).** `PATCH /api/v1/communities/:id/members/:memberId/role` (`communities.ts:1128-1244`) vérifie bien que l'appelant est admin de la communauté `:id`, mais l'update Prisma final (`communityMember.update({where:{id:memberId}, data:{role}})`, l.1223-1226) **ne filtre pas `communityId: id`** — `CommunityMember.id` est une clé globale, pas composite. Chaîne d'attaque : lister les membres d'une communauté publique cible (`GET /communities/:id/members`, accessible à tout utilisateur enregistré) → créer sa propre communauté triviale pour devenir automatiquement admin (`POST /communities`) → `PATCH .../own-community-id/members/{target-memberId}/role` avec `{role:"admin"}` → promotion/rétrogradation arbitraire dans une communauté à laquelle l'attaquant n'a jamais adhéré. Rejette bien l'anonyme total (401), donc hors du test comportemental de Mission 2 — documenté ici pour décision.

### 5. Administration (`routes/admin/*`)

39 fichiers, 2 groupes d'exploration. Bilan global : **verrouillage cohérent** — chaque route porte `fastify.authenticate` + une vérification de rôle explicite (`requireAdmin`/`requireModerator`/`requireAnalyst`/permission dédiée par domaine), avec deux exceptions :

- `POST /api/v1/admin/reports` (`admin/reports.ts:52`) — `fastify.authenticate` seul, sans garde de rôle, alors que les 9 autres routes du même fichier en ont une. Impact limité (`reporterId` forcé sur l'appelant, pas d'IDOR), probablement voulu (tout utilisateur doit pouvoir signaler du contenu) mais incohérent avec le reste du fichier — à trancher côté produit.
- `admin/agent-topics.ts` (6 routes) et `routes/notifications.ts` `DELETE /admin/clear-all` — gardes de rôle cassées mais **fail-closed** (lisent `request.user.role`, jamais peuplé par `createUnifiedAuthMiddleware`, donc 403 systématique y compris pour les vrais admins). Régression fonctionnelle, pas un trou de sécurité — cf. Méthodologie.

Toutes les surfaces à fort impact vérifiées verrouillées à `BIGBOSS`/`ADMIN` strict : `admin/broadcasts.ts` (envoi de masse), `admin/agent.ts` (reset nucléaire de l'agent IA, reconfiguration LLM/clé API), `admin/users.ts` (création/suppression de comptes, changement de rôle, reset mot de passe, 2FA).

### 6. `/me`, notifications, messages, contacts, affiliation (`me/*`, `push-tokens.ts`, `affiliate.ts`, `user-stats.ts`, `maintenance.ts`, `messages.ts`, `message-read-status.ts`, `mentions.ts`, `reactions.ts`, `notifications.ts`, `friends.ts`, `invitations.ts`)

`maintenance.ts` **vérifié indépendamment** : les 5 routes portent bien `onRequest:[fastify.authenticate, requireAdmin]`, aucune oubliée. Le reste du lot (messages, lecture, mentions, notifications, demandes d'amis) est protégé de bout en bout par `requiredAuth`/`fastify.authenticate` avec vérification d'appartenance systématique — aucun IDOR trouvé.

**Faille confirmée — sévère.** `POST /api/v1/affiliate/register` (`affiliate.ts:633`, `AffiliateTrackingService.convertAffiliateVisit`) — **aucune authentification**, body `{token, referredUserId, sessionKey?}`. Le service :
- crée une `AffiliateRelation` liant le créateur du `token` (librement créable via `POST /affiliate/tokens`, authentifié) à `referredUserId` — **n'importe quel ID utilisateur existant**, sans vérifier que l'appelant EST cet utilisateur ;
- **crée ET auto-accepte une `FriendRequest`** entre les deux, statut `'accepted'` directement, sans passer par le flux normal d'acceptation ;
- incrémente `currentUses` du token.

Un appelant anonyme qui connaît/énumère un ID utilisateur force donc une relation d'« ami accepté » sans consentement, puis lit via `GET /affiliate/stats` (authentifié, avec son propre compte attaquant) les données `referredUser` exposées (email, prénom, nom, avatar, `isOnline`, `createdAt`). IDOR classique : aucune preuve de possession de session n'est exigée pour lier `referredUserId` à l'appelant.

### 7. Pièces jointes, uploads (`attachments.ts`, `attachments/*`, `uploads/tus-handler.ts`)

`attachmentRoutes` est monté deux fois (`/api/v1/attachments/...` et legacy `/api/attachments/...`), mêmes gardes, donc chaque trou ci-dessous existe sur les deux préfixes.

| Méthode | Chemin | Fichier:ligne | Protection | Verdict | Anonyme obtient |
|---|---|---|---|---|---|
| GET | `/attachments/:attachmentId`, `/thumbnail` | `attachments/download.ts:67,160` | **aucune** | **à protéger** | télécharge le fichier original/miniature de n'importe quel attachment en devinant l'ObjectId (entropie faible : timestamp + compteur, pas un vrai token) ; ignore `isViewOnce`/`isBlurred` |
| GET | `/attachments/file/*` | `attachments/download.ts:248` | aucune, mais garde anti path-traversal + noms de fichiers UUIDv4 réels | légitimement publique (avec nuance) | CDN de fichiers publics par design, entropie forte |
| GET | `/attachments/:attachmentId/metadata` | `attachments/metadata.ts:79` | `authRequired` | protégée contre l'anonyme, **IDOR authentifié** | tout compte enregistré lit transcription/traductions/messageId d'un attachment d'un tiers (pas de vérif de membership) |
| **DELETE** | **`/attachments/:attachmentId`** | **`attachments/metadata.ts:163,179`** | **cassée (`!isAuthenticated && !isAnonymous`, toujours fausse pour un zéro-credential)** | **CRITIQUE — à protéger** | **suppression massive de pièces jointes d'autres utilisateurs anonymes, sans aucun jeton, dès lors qu'elles ont été uploadées via la même faille (uploadedBy:'anonymous')** |
| **GET** | **`/conversations/:conversationId/attachments`** | **`attachments/metadata.ts:282-328`** | **cassée, sans branche `else`** | **CRITIQUE — à protéger** | **liste complète des pièces jointes de N'IMPORTE QUELLE conversation privée, aucun header requis** |
| POST | `/attachments/:attachmentId/translate` | `attachments/translation.ts:137` | `authRequired` + `verifyUserAccess` (uploader OU membre) | protégée — **modèle de référence** | — |
| POST | `/attachments/:attachmentId/transcribe` | `attachments/translation.ts:332` | `authRequired`, **aucune vérif d'appartenance à l'attachment** | IDOR authentifié | tout compte enregistré lit la transcription d'un audio d'un tiers, ou force (`force:true`) une nouvelle transcription Whisper à ses frais |
| **POST** | **`/attachments/upload`** | **`attachments/upload.ts:84,125`** | **cassée, même pattern que DELETE ci-dessus** | **CRITIQUE — à protéger** | **upload de fichier jusqu'à 4 Go sans AUCUN credential et sans contrôle de quota** |
| POST | `/attachments/upload-text` | `attachments/upload.ts:221` | vérifie correctement `!isAuthenticated` | protégée | — |
| **ALL** | **`/api/v1/uploads`, `/api/v1/uploads/*`** | **`uploads/tus-handler.ts:57-101,281,285`** | **contourne `createUnifiedAuthMiddleware` — logique maison** | **CRITIQUE — à protéger** | **(a) présence de `Authorization` OU `X-Session-Token` vérifiée mais pas leur validité ; (b) `jwt.verify` échoué → repli sur `jwt.decode` non vérifié (même bug que `/auth/refresh`) → upload de 4 Go attribué à l'identité de son choix.** |

### 8. Appels et voix (`calls.ts`, `voice-profile.ts`, `voice-analysis.ts`, `routes/voice/*`)

Correctif `x-user-id` (commit `8c9b0b2fa`) **vérifié indépendamment et complet** : `voice/types.ts` `getUserId()` ne lit plus que `request.user?.userId`, chaque route de `voice/translation.ts`/`voice/analysis.ts` porte `preHandler:[fastify.authenticate]`, zéro occurrence résiduelle de `x-user-id` hors commentaires documentant le fix. `calls.ts` vérifie l'appartenance à la conversation/l'appel à double niveau (route + `CallService`) sur toutes ses routes.

`GET /api/v1/voice/health` et `/languages` : légitimement publiques (statut agrégé, liste statique). `voiceAnalysisRoutes` (fichier `voice-analysis.ts`, distinct de `voice/analysis.ts`) est monté **sans préfixe** (`server.ts`/`route-registration.ts` l'enregistre sans option `prefix`) — ses routes vivent à la racine absolue (`/attachments/...`, `/voice/analysis`), pas sous `/api/v1` ; le commentaire du code affirmant un préfixe `/api/voice-analysis` est trompeur, sans impact sécurité.

**Nouvelle classe de faille — IDOR sur `attachmentId` vocal**, distincte du spoofing déjà corrigé. Rejette bien l'anonyme total (`authMiddleware`/`fastify.authenticate` requis), donc hors périmètre du test comportemental de Mission 2, mais tout compte enregistré peut :

| Méthode | Chemin | Fichier:ligne | Ce qu'un compte enregistré arbitraire obtient |
|---|---|---|---|
| POST/GET | `/attachments/:attachmentId/analysis` | `voice-analysis.ts:93,318` | déclenche/lit l'analyse acoustique (pitch/timbre/MFCC — donnée biométrique) d'un message vocal d'un tiers |
| POST | `/attachments/batch/analysis` | `voice-analysis.ts:205` | idem en masse, jusqu'à 50 attachments arbitraires |
| POST | `/api/v1/voice/translate`, `/translate/async`, `/transcribe` | `voice/translation.ts` | branche `attachmentId` : lit/traduit/transcrit un message vocal privé d'un tiers sans vérif de conversation |

`GET /api/v1/voice/admin/metrics` : `fastify.authenticate` + `isAdmin(request)` cassé (lit `request.user.role`, jamais peuplé) — fail-closed, inaccessible même aux admins légitimes, régression fonctionnelle hors périmètre.

### 9. Traduction et posts/feed (`translation.ts`, `translation-non-blocking.ts`, `translation-jobs.ts`, `posts/*`)

`translation.ts` (`/translate-blocking`, `/test`) **vérifié indépendamment** : correctif `2c0f0fcca` complet, garde d'appartenance inconditionnelle, aucune régression.

**`translation-non-blocking.ts` n'a PAS reçu le même traitement — le trou le plus grave de tout l'audit après `/auth/refresh` et `/force-init` en termes de facilité d'exploitation.**

| Méthode | Chemin | Fichier:ligne | Protection | Verdict | Anonyme obtient |
|---|---|---|---|---|---|
| POST | `/api/v1/translate` | `translation-non-blocking.ts:268` | `fastify.authenticate` présent, mais branche `message_id` (retraduction, l.297-336) charge `participants` puis **ne les utilise jamais** | protégée contre l'anonyme, IDOR authentifié | tout compte enregistré déclenche la retraduction d'un message d'une conversation à laquelle il n'appartient pas |
| **GET** | **`/api/v1/status/:messageId/:language`** | **`translation-non-blocking.ts:406`** | **aucune, aucune vérification d'identité dans le handler** | **CRITIQUE — à protéger** | **lit le texte traduit et DÉCHIFFRÉ de n'importe quel message, y compris dans des conversations privées, en connaissant/devinant un `messageId`. Suffit à lui seul, sans passer par la branche vulnérable de `/translate`, dès qu'un message a déjà été traduit par le pipeline normal (quasi tous en prod).** |
| **GET** | **`/api/v1/conversation/:identifier`** | **`translation-non-blocking.ts:443`** | **aucune** | **à protéger** | **expose titre/type/dates/compteurs de n'importe quelle conversation par son identifiant** |
| GET/DELETE | `/api/v1/translate/jobs/:jobId` | `translation-jobs.ts` | `authRequired` | protégée | — |

`posts/*` : `requiredAuth`/`preValidation` systématique (donc anonyme total toujours rejeté), avec un **pattern d'incohérence documenté** — `PostService.recordView` porte un commentaire explicite prouvant que l'équipe a déjà identifié et corrigé ce risque (« Enforce visibility before recording... ») mais les méthodes sœurs ne l'ont jamais reçu :

| Méthode | Chemin | Fichier:ligne | Ce qu'un compte enregistré arbitraire obtient |
|---|---|---|---|
| GET | `/posts/:postId/comments`, `/replies` | `posts/comments.ts:51,83` | lit les commentaires d'un post `PRIVATE`/`FRIENDS`/`ONLY`/`EXCEPT` auquel il ne devrait pas avoir accès |
| POST | `/posts/:postId/comments`, `/like` (commentaire) | `posts/comments.ts` | commente/like sur un post restreint |
| POST/DELETE | `/posts/:postId/like`, `/bookmark` | `posts/interactions.ts` | like/bookmark un post restreint |
| **POST** | **`/posts/:postId/share`** | **`posts/interactions.ts:485`** | **le plus grave : avec `generateLink:true`, crée un lien de tracking PUBLIC PERSISTANT (`/l/<token>`) pointant vers un post `PRIVATE`/`FRIENDS`** |

`GET /posts/user/:userId`, `/community/:communityId`, `POST /posts/:postId/anonymous-view` : `optionalAuth` + filtre de visibilité PUBLIC appliqué côté service — vérifié, légitimement publics.

`GET /languages`, `POST /detect-language` : légitimement publics (données statiques / stateless).

---

## Les trois trous les plus graves (par facilité d'exploitation)

1. **`POST /api/v1/auth/refresh`** (`routes/auth/magic-link.ts:113-155`) — aucune authentification, `jwt.decode()` non vérifié en repli. Usurpation d'identité complète de n'importe quel utilisateur actif dont l'ID est connu, en une seule requête, sans mot de passe ni JWT valide.
2. **`GET /api/v1/status/:messageId/:language`** (`routes/translation-non-blocking.ts:406`) — aucune authentification, aucune vérification. Lit le contenu déchiffré de n'importe quel message privé déjà traduit, en une seule requête GET.
3. **Le trio de gardes cassées sur `attachments`** (`DELETE /attachments/:attachmentId`, `GET /conversations/:conversationId/attachments`, `POST /attachments/upload`, `routes/attachments/metadata.ts` + `upload.ts`) — le pattern `!isAuthenticated && !isAnonymous` est toujours faux pour un appelant sans rien : suppression de fichiers, divulgation totale de la liste de pièces jointes d'une conversation, et upload de 4 Go, tous sans un seul header.

(`POST /api/v1/auth/force-init` et `POST /api/v1/affiliate/register` suivent de très près en gravité mais demandent une action de suivi côté attaquant — respectivement connaître qu'aucun compte par défaut n'existe déjà, et connaître un ID de victime.)

---

## Mission 2 — La garde de non-régression

Fichier : `services/gateway/src/__tests__/security/route-auth-coverage.test.ts`.

### Ce qu'il fait

Le test importe `registerAllRoutes` (extrait de `MeeshyServer.setupRoutes()` dans un nouveau module `src/route-registration.ts` — voir « Refactor requis par la garde » ci-dessous), construit une vraie instance Fastify, décore les dépendances avec des stubs minimalistes (un Prisma « profond » via `Proxy`, un `fastify.authenticate` qui est le VRAI `createUnifiedAuthMiddleware` de production), enregistre l'intégralité du graphe de routes, puis pour chacune des 502 routes détectées via le hook `onRoute` :

1. Si la route figure dans `PUBLIC_ROUTES` ou `KNOWN_GAPS`, elle est ignorée (avec la justification en commentaire).
2. Sinon, le test envoie une VRAIE requête HTTP simulée (`app.inject`) **sans aucun credential** (ni `Authorization`, ni `X-Session-Token`), avec un corps/une querystring synthétisés à partir du schéma JSON déclaré de la route (pour ne pas confondre un 400 de validation de schéma avec une absence de garde — Fastify valide le schéma *après* `onRequest`/`preValidation` mais *avant* `preHandler`, donc un payload vide aurait pu masquer une garde posée en `preHandler`).
3. La route est considérée protégée seulement si la réponse est 401 ou 403. Tout le reste (200, 400 résiduel, 404, 500...) fait échouer le test avec le détail de la route fautive.

Ce test **n'évalue pas l'autorisation fine** (IDOR/BOLA du type « authentifié mais pas membre ») — un appelant réellement anonyme y est déjà rejeté par le `preHandler`, donc ces cas (communities, tracking-links, voice attachmentId, posts) sont correctement classés « protégés » du point de vue de ce test, et documentés dans ce fichier à la place.

### Refactor requis par la garde

`MeeshyServer.setupRoutes()` appelait directement `this.server.register(...)` pour ~50 fichiers de routes, mais `server.ts` a des effets de bord au chargement du module (`new MeeshyServer(); meeshyServer.start();` en bas de fichier — connexions DB/Redis/ZMQ réelles, `listen()`). L'importer depuis un test aurait démarré le vrai serveur. Le corps de `setupRoutes()` a donc été extrait tel quel (aucun changement de logique) dans `src/route-registration.ts` (nouveau fichier, sans effet de bord), avec le logger Winston partagé extrait dans `src/gateway-logger.ts` pour la même raison. `MeeshyServer.setupRoutes()` délègue maintenant à `registerAllRoutes(this.server, {...})`. Comportement de production inchangé (`bunx tsc --noEmit` à 0 erreur, 205 suites / 4990 tests de `src/__tests__/unit/routes` toujours verts après le refactor).

### La liste d'exceptions (65 + 18 entrées)

**`PUBLIC_ROUTES`** (65 entrées) — routes légitimement accessibles sans identité par conception : santé/méta (4), entrées du flux d'authentification pré-session — inscription, connexion, 2FA, vérification email/téléphone, reset de mot de passe, magic link, transfert de numéro (32), suppression de compte par lien email (3), profils publics (8, dont 2 stubs no-op à surveiller), participation anonyme par lien de partage avec token vérifié dans le handler (12), affiliation publique par design (3), sondes voice (2), feed posts avec filtre de visibilité côté service (3), CDN de fichiers publics (2). Chaque ligne porte sa justification individuelle dans le fichier.

**`KNOWN_GAPS`** (18 entrées, 16 trous distincts en comptant les doublons de montage `/api` legacy) — chaque trou confirmé ci-dessus qui laisse passer un zéro-credential, avec pointeur vers la section de ce document. Liste **destinée à décroître** : quand une entrée est corrigée, elle doit être retirée du fichier — le test se resserre alors automatiquement et retombe en erreur si la même route régresse un jour.

### Preuve rouge/vert

Une route factice sans aucune garde (`GET /api/v1/__debug-unprotected-probe/:userId`) a été ajoutée temporairement à `route-registration.ts` :

```
FAIL — GET /api/v1/__debug-unprotected-probe/:userId → HTTP 200 pour un appelant anonyme
       (attendu 401 ou 403). Ni dans PUBLIC_ROUTES ni dans KNOWN_GAPS.
```

puis retirée. Le test repasse au vert (`Tests: 2 passed, 2 total`) immédiatement après suppression, confirmant qu'il détecte bien une route non protégée nouvellement ajoutée et ne fait pas que passer par construction.

---

## Mission 3 — Limitation de débit

### Ce qui existe déjà

Le gateway a une couche de rate-limiting applicative substantielle, déjà active :
- Global : `@fastify/rate-limit`, 300 req/min par IP (`middleware/rate-limiter.ts`, `registerGlobalRateLimiter`), fail-open sur erreur Redis, IP locale et `/health` exemptées.
- Par route/domaine : login (`createLoginRateLimiter`), inscription, reset de mot de passe (3/30min + 3/jour), transfert de téléphone, révocation de session (5/min), Signal Protocol (lookup de clés 30/min, génération 5/min), posts (create 10/min, like 30/min...).

### Ce qui manque : le middleware Traefik

`infrastructure/docker/compose/config/dynamic.yaml` définit un middleware `rate-limit` (`average: 100, burst: 50, period: 1s`) — **confirmé non rattaché à aucun routeur** : `docker-compose.prod.yml:310` et `docker-compose.staging.yml:274` n'attachent que `middlewares=compress@file` au routeur `gateway`/`gateway-staging`. Le middleware existe, tourne dans la configuration dynamique de Traefik, mais aucun routeur ne le référence.

**Description de ce qu'il faudrait faire (aucun fichier d'infrastructure modifié dans le cadre de cette mission — changement de routage à faire par le porteur de la décision, avec test en staging avant prod) :**

Ajouter `rate-limit@file` à la liste `middlewares` des deux routeurs, par exemple :
```
traefik.http.routers.gateway.middlewares=compress@file,rate-limit@file
```
(et l'équivalent `docker-compose.staging.yml` pour `gateway-staging`). Deux points d'attention pour qui fera ce changement :
- **Ordre des middlewares** : Traefik les applique dans l'ordre de la liste. `rate-limit` avant `compress` évite de compresser une réponse 429 inutilement, mais l'ordre exact mérite un test dédié.
- **Valeur `average: 100/period: 1s`** : c'est un débit **beaucoup plus permissif** que les 300/min applicatifs actuels (100/s = 6000/min) — le middleware Traefik agit donc comme filet de dernier recours contre un flood volumétrique brut (avant même que Node ouvre une connexion), pas comme un remplacement du rate-limiting applicatif fin par utilisateur. Le paramétrer plus bas casserait potentiellement des clients légitimes à fort trafic (sync, polling) — à valider avec des métriques de trafic réel avant de resserrer.

### Où l'absence coûte le plus cher

1. **`POST /api/v1/auth/force-init`** (trou §1) : sans rate-limit d'aucune sorte, un flood de cette route pourrait, tant que le garde-fou `FORCE_DB_RESET`/`NODE_ENV` n'est pas strictement en prod, marteler des écritures BD (création de conversations, rattachement d'utilisateurs) à chaque appel.
2. **Le pipeline ML de traduction** (`/translate-blocking`, `/translate`, `/voice/translate`, `/voice/transcribe`) : chaque appel réussi déclenche un aller-retour ZMQ vers le service de traduction/transcription — un flood non freiné par un rate-limit dédié en amont de Node (le rate-limit applicatif existe mais tourne dans le même processus Node déjà sous charge) peut saturer le pipeline ML avant même que le rate-limiter applicatif ait eu la main.
3. **Les routes d'authentification sans limiteur dédié** identifiées en Mission 1 §1 (`GET /check-availability`, `/users/email/:email`, `/users/phone/:phone` pour l'énumération ; `/send-phone-code`, `/verify-phone`, `/resend-verification`, `/magic-link/request` pour le coût direct SMS/email) : le filet global 300/min/IP est contournable par rotation d'IP et largement suffisant pour un email/SMS-bombing ciblé sur une seule victime avant d'atteindre la limite.

---

## Fichiers concernés

- `docs/superpowers/specs/2026-07-30-audit-authentification-gateway.md` (ce document)
- `services/gateway/src/route-registration.ts` (nouveau — extraction de `registerAllRoutes`)
- `services/gateway/src/gateway-logger.ts` (nouveau — logger Winston partagé)
- `services/gateway/src/server.ts` (modifié — délègue à `registerAllRoutes`)
- `services/gateway/src/__tests__/security/route-auth-coverage.test.ts` (nouveau — garde de non-régression, Mission 2)
- `services/gateway/jest.setup.js` (modifié — `UPLOAD_PATH` par défaut pour l'environnement de test)
