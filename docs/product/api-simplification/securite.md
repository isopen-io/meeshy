# Sécurité de la surface API — modèle, niveaux, constats vérifiés

> Annexe de [`README.md`](README.md). Compte rendu daté du **2026-08-28**.
> Chaque constat de ce document a été soumis à un vérificateur dont la consigne
> était de le **réfuter**. Sur 26 constats : **aucun réfuté**, 8 confirmés tels
> quels, 18 nuancés (portée surestimée, ou atténuation trouvée ailleurs). Les
> nuances sont conservées telles quelles — elles disent ce qui n'est *pas* vrai.

---

## 1. Les sept niveaux

Chaque route cible de cet audit porte un niveau. Le vocabulaire est le même
dans les douze sections de module.

| Niveau | Nom | Qui passe | Ce qui le garde | Ce qu'il ne doit jamais rendre |
|---|---|---|---|---|
| **S0** | public ouvert | n'importe qui | rien | rien de nominatif |
| **S1** | public à débit strict | n'importe qui, **compté** | limiteur sur l'IP client réelle | un profil, un identifiant, une existence détaillée |
| **S2** | authentifié | tout compte connecté | JWT ou jeton de session | e-mail ou téléphone en clair d'un tiers, présence hors amitié |
| **S3** | propriétaire / participant | celui à qui la ressource appartient | appartenance vérifiée **dans la requête** | la ressource d'un autre, même par erreur de `where` |
| **S4** | modération | `canModerateContent` | permission nommée de la matrice centrale | du contenu que nul signalement ne désigne |
| **S5** | administration | `canAccessAdmin` + permission nommée | permission nommée de la matrice centrale | un secret d'authentification (hash de session, jeton) |
| **S6** | souverain | BIGBOSS seul | rôle | — |

**S1 n'existe pas aujourd'hui dans le produit.** Toute route publique est soit
ouverte sans compteur, soit « limitée » par un compteur inerte (§ 3.1). C'est
le niveau que réclame la vérification de pseudo à l'inscription.

---

## 2. Le modèle de permission — ce qu'il est, et ce que les routes en font

### 2.1 La matrice centrale

`services/gateway/src/services/admin/permissions.service.ts` définit
**17 permissions × 6 rôles**. Hiérarchie : `BIGBOSS 7 > ADMIN 5 > MODERATOR 4 >
AUDIT 3 > ANALYST 2 > USER 1`.

| Permission | BIGBOSS | ADMIN | MODERATOR | AUDIT | ANALYST | USER |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `canAccessAdmin` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `canViewUsers` / `canViewUserDetails` | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `canViewSensitiveData` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `canCreateUsers` / `canUpdateUsers` / `canDeleteUsers` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `canUpdateUserRoles` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `canResetPasswords` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `canViewAuditLogs` | ✅ | **❌** | ❌ | ✅ | ❌ | ❌ |
| `canManageCommunities` / `canManageConversations` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `canViewAnalytics` | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `canModerateContent` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `canManageNotifications` / `canManageTranslations` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `canViewPresence` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

Deux asymétries voulues, à connaître : **ADMIN ne lit pas les journaux d'audit**
(seuls BIGBOSS et AUDIT), et **la présence s'arrête à ADMIN** (directive
produit du 2026-08-25 — MODERATOR modère du contenu, il ne surveille pas les
gens).

### 2.2 Ce que les routes en font : treize gardes locales, sept homonymes, cinq lois

Le middleware central `middleware/admin-permissions.middleware.ts` expose des
gardes fondées sur cette matrice. **Treize fichiers de `routes/admin/` la
contournent en redéfinissant leur propre garde.** Sept portent le même nom —
`requireAdmin` — et appliquent **cinq lois différentes** :

| Fichier | Ce que `requireAdmin` autorise réellement |
|---|---|
| `admin/languages.ts:92` | BIGBOSS, ADMIN, AUDIT, **ANALYST** |
| `admin/system-rankings.ts:11` | BIGBOSS, ADMIN, AUDIT, **ANALYST** |
| `admin/anonymous-users.ts:12` | BIGBOSS, ADMIN, **MODERATOR**, AUDIT |
| `admin/messages.ts:9` | BIGBOSS, ADMIN, **MODERATOR**, AUDIT |
| `admin/invitations.ts:10` | BIGBOSS, ADMIN seulement |
| `admin/posts.ts:78` | `canAccessAdmin` (la matrice) |
| `admin/content.ts:125` | `canAccessAdmin` (la matrice) |

**La contradiction est dure** : la matrice pose `ANALYST.canAccessAdmin = false`.
`languages.ts` et `system-rankings.ts` le laissent entrer quand même, par une
liste écrite à la main. Une liste de rôles en dur dans un fichier de route ne
peut pas être une variante d'une matrice : c'est une loi concurrente.

Les six autres gardes locales : `requireAgentAdmin` (`agent.ts:23` **et**
`agent-topics.ts:24` — deux copies), `requireModeratorPermission`
(`reports.ts:31`), `requireAnalyticsPermission` (`analytics.ts:19`),
`requireBroadcastPermission` (`broadcasts.ts:19`), `requireDashboardPermission`
(`dashboard.ts:11`).

### 2.3 L'escalade ADMIN → BIGBOSS

Trois routes de `routes/admin/users.ts` chargent leur `targetUser` — elles ont
donc son rôle sous la main — et **omettent l'appel à
`permissionsService.canModifyUser(adminRole, targetUser.role)`** :

| Route | Ligne | Ce qu'un ADMIN peut faire à un BIGBOSS |
|---|---|---|
| `POST /admin/users/:userId/unlock` | `:603` | déverrouiller son compte |
| `POST /admin/users/:userId/enable-2fa` | `:646` | lui imposer un second facteur |
| `POST /admin/users/:userId/disable-2fa` | `:690` | **lui retirer son second facteur** |

Ce n'est pas une décision : **dix routes sœurs du même fichier appliquent bien
cette garde** (lignes 301, 448, 516, 570, 753, 817, 881, 950 …). C'est une
omission, et elle se combine : retirer la 2FA d'un souverain, puis lui
réinitialiser son mot de passe (`:reset-password`, qui garde la hiérarchie mais
sur `canUpdateUsers` au lieu de `canResetPasswords`), est une chaîne complète.

### 2.4 Une route utilisateur sous un préfixe administrateur

`POST /api/v1/admin/reports` (`routes/admin/reports.ts:52`) porte
`onRequest: [fastify.authenticate]` **sans garde de rôle** : c'est le
signalement de contenu par un utilisateur ordinaire, et c'est fonctionnellement
juste. Mais son **adresse ment sur son niveau de privilège**, et elle est la
seule de `routes/admin/` dans ce cas. Elle appartient à `/reports`, pas à
`/admin/reports`.

---

## 3. Les constats vérifiés

## Récapitulatif des 26 constats vérifiés

| # | Gravité | Verdict | Constat |
|---:|---|---|---|
| 1 | 🔴 Critique | **confirmé** | Tout le parcours de réinitialisation de mot de passe par SMS est cassé de bout en bout par des schémas de réponse qui décrivent la mauvaise enveloppe : lookup perd `tokenId`, … |
| 2 | 🔴 Critique | **confirmé** | PATCH /api/v1/communities/:id/members/:memberId/role écrit `communityMember.update({ where: { id: memberId } })` sans borner la ligne à la communauté `:id` — être admin d'une … |
| 3 | 🟠 Élevé | **confirmé** | PATCH /api/v1/users/me écrit `email` et `phoneNumber` directement en base sans preuve de possession et sans remettre `emailVerifiedAt` / `phoneVerifiedAt` à null, rendant les cinq … |
| 4 | 🟠 Élevé | **confirmé** | GET /api/v1/users/search met `email` à la fois dans la clause OR du `where` et dans le `select`/schéma servi : tout compte authentifié peut chercher `contains: "gmail.com"` et … |
| 5 | 🟠 Élevé | **confirmé** | GET /api/v1/messages/:messageId/translations n'applique aucun plancher d'historique et sert `originalContent` (le texte intégral du message), alors que GET /messages/:messageId, la … |
| 6 | 🟠 Élevé | **confirmé** | Cinq routes tracking-links gardent par `if (trackingLink.createdBy && trackingLink.createdBy !== userId)` — garde conditionnée à la PRÉSENCE de ce qu'elle garde — alors que POST … |
| 7 | 🟠 Élevé | **confirmé** | GET /api/v1/admin/conversations/:conversationId/messages sert le contenu intégral de n'importe quelle conversation (directe entre tiers incluse) à MODERATOR et AUDIT, messages … |
| 8 | 🟠 Élevé | nuancé | Tous les rate limiters nommés du gateway sont INERTES en production : RateLimiter.middleware() sort immédiatement si isLocalIp(request.ip), Fastify tourne sans trustProxy derrière … |
| 9 | 🟠 Élevé | nuancé | GET /attachments/file/* est entièrement public alors que c'est l'URL nominale écrite en base ; GET /attachments/:attachmentId/metadata n'a aucun contrôle d'appartenance et sert … |
| 10 | 🟠 Élevé | nuancé | Les routes ML de voix (POST /attachments/:id/transcribe, POST /voice/transcribe, POST /voice/translate, GET /attachments/:id/analysis) lisent le contenu vocal d'autrui sans contrôle de … |
| 11 | 🟠 Élevé | nuancé | `audioPath` client-fourni sur POST /attachments/:id/analysis, POST /attachments/batch/analysis et POST /voice/analysis, relayé tel quel au translator par ZMQ sans confinement ; et POST … |
| 12 | 🟠 Élevé | nuancé | POST /api/v1/voice/translate/async accepte `webhookUrl` (format: 'uri' seul, ni allowlist ni blocage d'IP privées) et le worker POSTe le résultat de traduction dessus ; `priority` est … |
| 13 | 🟠 Élevé | nuancé | POST /attachments/upload-text accepte un `messageId` de corps transmis tel quel jusqu'à prisma.messageAttachment.create, sans vérifier existence, propriété ni participation : on greffe … |
| 14 | 🟠 Élevé | nuancé | POST /api/v1/translate-blocking prend `conversation_id` BRUT sans vérification d'appartenance et, dans le cas « nouveau message » (sans `id`), crée le message en base via … |
| 15 | 🟠 Élevé | nuancé | GET /api/v1/users/email/:email et GET /api/v1/users/phone/:phone sont publiques et rendent « le profil complet », là où leur jumelle authentifiée POST /users/me/contacts/match applique … |
| 16 | 🟠 Élevé | nuancé | GET /api/v1/me/delete-account/{confirm,cancel,delete-now} sont trois routes PUBLIQUES et MUTANTES en GET, sans preHandler d'auth, secret en query string, sans TTL — un pré-chargeur de … |
| 17 | 🟠 Élevé | nuancé | Révoquer une session ne déconnecte personne : DELETE /auth/sessions, DELETE /auth/sessions/:sessionId et POST /auth/logout passent isValid:false sans jamais appeler … |
| 18 | 🟠 Élevé | nuancé | POST /auth/refresh accepte un JWT authentique mais EXPIRÉ (ignoreExpiration) et rend un JWT neuf, sans exiger de jeton de session et sans aucune liste de révocation, ni rate limiter. |
| 19 | 🟠 Élevé | nuancé | POST /auth/login/2fa n'a aucun preHandler ni rate limiter, et ni AuthService.completeAuthWith2FA ni TwoFactorService ne comptent les tentatives — même constat sur /auth/2fa/verify et … |
| 20 | 🟠 Élevé | nuancé | POST /conversations/join/:linkId ne teste que isActive et expiresAt : maxUses, maxConcurrentUsers, maxUniqueSessions, allowedCountries, allowedLanguages, allowedIpRanges sont écrits à … |
| 21 | 🟠 Élevé | nuancé | POST /api/v1/conversations/:id/new-link est la porte la plus large du système et la SEULE sans rang : n'importe quel membre actif crée un lien public avec allowAnonymousMessages / … |
| 22 | 🟠 Élevé | nuancé | GET /api/v1/conversations/:id/analysis sert à tout membre ordinaire les profils psychométriques nominatifs des autres participants (traits notés, personaSummary, sentimentScore, … |
| 23 | 🟡 Moyen | **confirmé** | PUT/PATCH /api/v1/me/préférences/application écrit les cinq horodatages de consentement dans le blob de préférences, et ConsentValidationService les relit avec PRIORITÉ sur les … |
| 24 | 🟡 Moyen | nuancé | GET /api/v1/admin/anonymous-users expose `sessionTokenHash` — « la valeur même que createAnonymousUserContext compare pour authentifier » — et `anonymousSession: true` charge la … |
| 25 | 🟡 Moyen | nuancé | DELETE /users/register-device-token n'a aucun appelant de production côté iOS : logout() n'appelle que resetSession() (purge locale) et logoutThrowing(token:) ne transporte aucun … |
| 26 | 🟡 Moyen | nuancé | Côté web, plusieurs gestes de sécurité partent vers des routes inexistantes et annoncent quand même un succès : révocation du consentement de clonage vocal affichant « Voice cloning … |

---

## Détail

### 1. 🔴 Critique — **confirmé**

**Constat soumis à réfutation** — Tout le parcours de réinitialisation de mot de passe par SMS est cassé de bout en bout par des schémas de réponse qui décrivent la mauvaise enveloppe : lookup perd `tokenId`, verify-code perd `resetToken`, verify-token sert `{}`, forgot-password sert `{"success":true}` sans message.

**Preuve**

```
Mécanisme : les handlers renvoient l'enveloppe `{success,data,message,pagination,meta}` (services/gateway/src/utils/response.ts:19-37 `sendSuccess`) alors que les blocs `response.200` décrivent une forme PLATE, sans `data`. fast-json-stringify supprime par défaut les propriétés non déclarées.

- services/gateway/src/routes/password-reset.ts:480-500 (schéma plat `{success, tokenId, maskedUserInfo, error}`) vs :541-542 `const { success: _s1, ...data1 } = result as any; return sendSuccess(reply, data1);` → `tokenId`/`maskedUserInfo` partent dans `data`, qui n'est pas au schéma.
- password-reset.ts:643-652 (schéma `{success, resetToken, error}`) vs :677-678 `sendSuccess(reply, data3)` → `resetToken` perdu.
- password-reset.ts:350-370 (schéma `{valid, requires2FA, expiresAt}`, sans `success` ni `data`) vs :415/:436 `sendSuccess(reply, {valid:...})` → AUCUNE clé déclarée n'est présente à la racine ⇒ `{}`.
- password-reset.ts:136-152 vs :188 `sendSuccess(reply, undefined, { message: result.message })` → `message` est une clé de l'enveloppe, absente du schéma ⇒ `{"success":true}`.
- password-reset.ts:573-579 + :607-608 : même défaut sur verify-identity (`codeSent`, `attemptsRemaining` perdus) — non cité par le constat.

Mesure réelle (fastify 5.11.2 de services/gateway/node_modules, mêmes schémas, mêmes objets envoyés, `app.inject`) :
POST /forgot-password -> 200 {"success":true}
POST /lookup          -> 200 {"success":true}
POST /verify-code     -> 200 {"success":true}
GET  /verify-token    -> 200 {}

Atteignabilité HTTP prouvée : route-registration.ts:81 + :193 `server.register(passwordResetRoutes, { prefix: `${API_PREFIX}/auth` })`, API_PREFIX=`/api/v1` ⇒ `POST /api/v1/auth/forgot-password/phone/lookup` etc. Aucun `setSerializerCompiler`, aucun schemaController : server.ts:196-225 ne passe que `ajv.customOptions`. Le seul onSend global est `conditionalGetOnSend` (server.ts:326, ETag) — il n'ajoute rien au corps déjà sérialisé.

Ce qui aurait pu réfuter, et ne réfute pas :
- Les tests existants NE prouvent pas le contraire : __tests__/unit/routes/password-reset.test.ts:434 s'intitule « returns 200 with tokenId and masked user info » mais n'assère que `res.statusCode` et `body.success` (idem :509 pour `resetToken`). Le titre ment, l'assertion ne couvre pas le champ perdu.
- Pas de route jumelle/morte : `passwordResetRoutes` est le seul producteur de ces chemins.
- Les clients lisent bien la forme PLATE, donc rien ne rattrape en aval : apps/web/services/phone-password-reset.service.ts:103 `return data;` puis apps/web/components/auth/PhoneResetFlow.tsx:314 `if (result.success && result.tokenId && result.maskedUserInfo)`; apps/web/services/password-reset.service.ts:154 `if (response.ok && data.valid)`.
- Origine : commit e9e51bfe7a « standardize remaining reply.send() … » a remplacé `reply.send(result)` par `sendSuccess(...)` sans toucher aux blocs `response`.
```

**Impact réel** — Atteignable par simple appel HTTP, pas seulement en théorie — les quatre corps ci-dessus sont mesurés au vrai sérialiseur, sur les URL réellement montées.

Web, reset par SMS : `PhoneResetFlow` bloque à l'étape 1 (`result.tokenId` undefined) et affiche « Lookup failed ». Le parcours SMS ne démarre jamais côté web ; le SMS n'y est donc pas encore consommé.

iOS, reset par SMS : pire, car le coût est payé. `MeeshyForgotPasswordView.swift:333` décode `APIResponse<LookupRes>` (data non optionnel) → le décodeur lève sur `{"success":true}` → message « Aucun compte trouvé avec ce numéro » alors que le compte existe. Et si un tokenId est obtenu autrement, :373 `struct CodeRes { let resetToken: String }` lève sur la réponse de verify-code — le code SMS a été VÉRIFIÉ et CONSOMMÉ côté serveur, le jeton de reset a été émis, et l'utilisateur voit « Code invalide ». C'est le scénario le plus coûteux : SMS facturé, jeton brûlé, aucun moyen de reprendre le compte.

Web, reset par e-mail (au-delà du constat) : `GET /auth/reset-password/verify-token` servant `{}`, `data.valid` est undefined ⇒ password-reset.service.ts renvoie `valid:false`, et ResetPasswordForm.tsx:213 `if (!tokenValid)` remplace le formulaire par « Invalid or expired reset token ». Le lien d'e-mail reçu est donc REFUSÉ pour tout le monde, y compris avec un jeton parfaitement valide. La réinitialisation par e-mail est aussi morte sur le web (l'endpoint `POST /reset-password` lui-même est correct — son schéma déclare bien `data.message` — mais l'UI n'y arrive plus).

Aucun gain pour un attaquant : rien ne FUIT, tout est retenu. Le défaut est une panne de contrat, pas une vulnérabilité. C'est une privation totale de reprise de compte.

Part à nuancer dans le constat : le point `POST /forgot-password` est techniquement exact (le `message` est bien effacé) mais SANS impact utilisateur — apps/web/services/password-reset.service.ts:84 remplace la clé absente par un texte en dur, et ForgotPasswordForm.tsx:115 redirige de toute façon. Le classer au même rang que les trois autres surévalue ce point. Symétriquement, le constat est INCOMPLET : `verify-identity` perd aussi `codeSent`/`attemptsRemaining` (le compteur …

**Correctif** — Aligner les blocs `response.200` sur l'enveloppe réellement émise : envelopper la forme utile dans `data: { type:'object', properties: {...} }` aux quatre routes (`/forgot-password` avec `message` à la racine de l'enveloppe, `/forgot-password/phone/lookup`, `/verify-identity`, `/verify-code`, `/reset-password/verify-token`), ou — si les clients doivent rester sur la forme plate — remplacer `sendSuccess` par un `reply.status(200).send({...})` plat à ces cinq sites. Ajouter au test existant les assertions qui manquent (`body.data.tokenId`, `body.data.resetToken`, `body.data.valid`) : sans elles, la garde est décorative et le défaut reviendra à la première standardisation. Et poser une garde générique qui refuse un schéma de réponse 200 déclarant des clés métier hors de `data` sur toute route passant par `sendSuccess`.

---

### 2. 🔴 Critique — **confirmé**

**Constat soumis à réfutation** — PATCH /api/v1/communities/:id/members/:memberId/role écrit `communityMember.update({ where: { id: memberId } })` sans borner la ligne à la communauté `:id` — être admin d'une communauté quelconque (créée soi-même) suffit pour changer le rôle de n'importe quelle ligne CommunityMember du dépôt.

**Preuve**

```
L'ACL et l'écriture, dans le même handler, ne parlent pas de la même ligne :

services/gateway/src/routes/communities/members.ts:426-447 — l'autorisation ne lit QUE l'appelant dans `:id` :
```
const community = await fastify.prisma.community.findFirst({
  where: { id },
  select: { createdBy: true, members: { where: { userId }, select: { role: true } } }
});
const isAdmin = userMember && userMember.role === CommunityRole.ADMIN;
if (!isAdmin) return sendForbidden(reply, 'Only community admins can update member roles');
```
services/gateway/src/routes/communities/members.ts:453-455 — l'écriture, elle, ne mentionne jamais `id` :
```
const updatedMember = await fastify.prisma.communityMember.update({
  where: { id: memberId },
  data: { role: validatedData.role as string },
```
`grep communityId routes/communities/members.ts` rend 145, 162, 313, 325, 567 — la liste, le compte, l'ajout et la suppression sont TOUS scopés ; la ligne 453 est le seul write du fichier qui ne l'est pas (le DELETE voisin, :565-568, fait bien `deleteMany({ where: { communityId: id, userId: memberId } })`).

Tentatives de réfutation, toutes négatives :
- Ombrage de module : `route-registration.ts:39` importe `'./routes/communities'` sans extension, et `routes/communities.ts` existe — mais c'est une coquille (`export { communityRoutes } from './communities/index';`, routes/communities.ts:17), et `__tests__/unit/routes/module-shadowing.test.ts` le prouve par le comportement. Le répertoire est bien servi.
- Montage : `route-registration.ts:220` → `register(communityRoutes, { prefix: API_PREFIX })`, `API_PREFIX = '/api/v1'` (:91). L'URL du constat est exacte, sans hook ajouté à l'enregistrement.
- Hooks globaux : `server.ts` n'ajoute que `onSend` conditional-GET, `preHandler` device-locale/country, request-id et logs. Aucun onRequest d'autorisation. La route ne porte que `onRequest: [fastify.authenticate]`.
- Précondition « coût nul » vérifiée : `routes/communities/core.ts:411-448`, POST /communities n'exige qu'une authentification et crée d'office `members: { create: { userId, role: CommunityRole.ADMIN } }`.
- Tests : `__tests__/unit/routes/communities-members.test.ts:493-507` ne vérifie que `statusCode === 200` ; aucun test du dépôt n'assert le `where` de l'update ni un cas inter-communauté.
```

**Impact réel** — Atteignable par de simples appels HTTP, sans interaction d'un tiers.

Chemin le plus fort, sans aucune condition de découverte : un membre ORDINAIRE d'une communauté X (privée comprise) appelle `GET /api/v1/communities/X/members` — auquel il a droit en tant que membre — et y lit `id` de SA propre ligne (`communityMemberSchema` expose `id`, packages/shared/types/api-schemas.ts:2472). Il crée ensuite sa propre communauté C (une requête, il en est ADMIN), puis `PATCH /api/v1/communities/C/members/<sa_ligne_dans_X>/role {"role":"admin"}`. Il est désormais admin de X : ajout/retrait de membres, réglages, conversations de la communauté. Escalade de privilège complète, zéro prérequis.

Second chemin, sans être membre : `GET /communities/:id/members` est ouvert à tout authentifié dès que `isPrivate === false` (members.ts:369-371), et la recherche publique (search.ts:137-166) renvoie jusqu'à 5 lignes membres complètes de toute communauté publique. Les `id` de lignes des communautés PUBLIQUES sont donc librement moissonnables : un attaquant peut rétrograder tous leurs admins en `member` (déni de gouvernance) ou promouvoir un complice.

Nuance sur la portée : le constat dit « n'importe quelle ligne, privée comprise ». C'est exact au sens de l'AUTORISATION — le serveur n'oppose rien. C'est borné en pratique par la DÉCOUVERTE de l'`id` de ligne pour une communauté privée avec laquelle l'attaquant n'a aucun lien : la liste y est fermée (403), et il faudrait deviner un ObjectId. Cette borne ne protège ni les communautés publiques ni les privées dont l'attaquant est simple membre — c'est-à-dire pas le cas le plus grave.

**Correctif** — Borner l'écriture par la communauté qui a autorisé : remplacer l'`update` par `updateMany({ where: { id: memberId, communityId: id }, data: { role } })` et rendre 404 si `count === 0` (puis relire la ligne pour la réponse) — Prisma/Mongo n'offrant pas de `where` composé sur un `@id`. Dans le même mouvement, extraire les six copies d'ACL (core.ts:366, :562 ; members.ts:132, :294, :446, :558) en un seul `requireCommunityAdmin(prisma, communityId, userId)` qui rend l'appartenance SCOPÉE, de sorte que le `communityId` autorisé soit la seule valeur disponible en aval. Trancher au passage la divergence sémantique de `memberId` — la route rôle le traite comme l'`id` de la ligne, le DELETE voisin comme un `userId` — et ajouter une garde rouge sur le cas inter-communauté (admin de C patchant une ligne de X ⇒ 404), qu'aucun test n'exerce aujourd'hui.

---

### 3. 🟠 Élevé — **confirmé**

**Constat soumis à réfutation** — PATCH /api/v1/users/me écrit `email` et `phoneNumber` directement en base sans preuve de possession et sans remettre `emailVerifiedAt` / `phoneVerifiedAt` à null, rendant les cinq routes de contact-change.ts facultatives.

**Preuve**

```
Écriture directe — `services/gateway/src/routes/users/profile.ts:143` `if (body.email !== undefined) updateData.email = normalizeEmail(body.email);` et `:144-148` (phoneNumber), poussés tels quels en `:199-201` `fastify.prisma.user.update({ where: { id: userId }, data: updateData })`. Le seul contrôle est l'unicité (`:157-183`, deux `findFirst`) — aucune preuve de possession.

Absence de reset — `grep -n "VerifiedAt|pendingEmail" services/gateway/src/routes/users/profile.ts` ne rend AUCUNE ligne : ni `emailVerifiedAt: null`, ni `phoneVerifiedAt: null`, ni purge de `pendingEmail*`. La voie légitime, elle, pose `emailVerifiedAt: new Date()` seulement après le jeton (`contact-change.ts:296-306`) et `phoneVerifiedAt: new Date()` après le code SMS (`contact-change.ts:672-682`).

Les champs sont VOULUS par le schéma — `packages/shared/utils/validation.ts:366-367` : `email: z.email().optional(), phoneNumber: z.union([z.string(), z.null()]).optional()` dans `updateUserProfileSchema` (`.strict()` ne les rejette donc pas, il les autorise).

Atteignable par HTTP — le schéma Fastify `updateUserRequestSchema` (`packages/shared/types/api-schemas.ts:3730-3746`) ne déclare pas `email`, mais ne pose ni `additionalProperties: false` ni `removeAdditional` (ajv configuré `services/gateway/src/server.ts:204-209` / `219-224` : seulement `strict:'log'` + keyword `example`). Reproduit : un Fastify avec CE schéma et un PATCH `{"email":"victim@example.com","phoneNumber":"+33600000000"}` rend `200 {"received":{"email":"victim@example.com","phoneNumber":"+33600000000"}}` — la propriété survit à la validation et atteint le handler. Montage : `route-registration.ts:266` `server.register(userRoutes, { prefix: API_PREFIX })`, `API_PREFIX = /api/v1` ⇒ `PATCH /api/v1/users/me`, `onRequest: [fastify.authenticate]` seul (aucun `requireEmailVerification`, aucun hook global de strip : `server.ts` n'a qu'un `onSend` conditional-GET et les preHandler locale/pays). Aucun `prisma.$use` ni extension qui réinitialiserait les drapeaux.

Le test existant `__tests__/unit/routes/users/profile.test.ts:318-334` PATCHe déjà `{ email: 'taken@example.com' }` et n'assert que le 400 d'unicité — la route accepte donc bien le champ, et rien ne garde le drapeau.
```

**Impact réel** — Atteignable en pratique par un simple appel HTTP authentifié (curl), pas seulement en théorie : les clients (iOS `UpdateProfileRequest`, UserModels.swift:3-11, n'a pas de champ email ; web ProfileSettings appelle `/auth/me/email/request` — une route qui N'EXISTE PAS côté gateway) n'exercent pas ce chemin, mais rien ne le ferme.

Ce qu'un attaquant obtient réellement :
1. Contournement complet du flux de vérification : il fixe n'importe quel e-mail/numéro non encore pris, et si son compte portait déjà un `emailVerifiedAt` / `phoneVerifiedAt` (gagné sur une AUTRE adresse, ou posé sans preuve à l'inscription — `AuthService.ts:599` `phoneVerifiedAt: cleanPhoneNumber ? new Date() : null`), la nouvelle valeur hérite du label « vérifié ».
2. Usurpation dans le carnet d'adresses : `ContactDirectoryService.match` (`:159-161`) rapproche sur `phoneNumber`/`email` SANS filtre de vérification ⇒ tous ceux qui ont le numéro de la victime dans leur répertoire voient le compte de l'attaquant comme étant elle. Idem `GET /users/phone/:phone` (profile.ts:1201) et `GET /users/email/:email` (profile.ts:1097).
3. Squat/déni : l'unicité rend ensuite l'adresse indisponible pour son vrai propriétaire (pour l'e-mail il n'existe aucun flux de reprise ; pour le téléphone, `PhoneTransferService` en offre un, par code SMS au vrai porteur).
4. Étiquette d'ownership fausse pour `PhoneTransferService` (`:154-156`, `:205`) et `PhonePasswordResetService` (`:235`), qui traitent `phoneVerifiedAt` comme une preuve de possession ⇒ des SMS de réinitialisation partent vers un tiers innocent.

Part à NUANCER dans le « pourquoi grave » du constat : il n'y a PAS de prise de contrôle d'un compte tiers. L'unicité (`profile.ts:157-183`) interdit de reprendre une adresse déjà enregistrée, et la porte de réinitialisation (`PasswordResetService.ts:134`) envoie le lien à l'adresse INSCRITE — donc à la boîte de la victime, pas à l'attaquant : s'attribuer l'adresse de quelqu'un ne donne pas son compte, cela donne un compte qui se fait passer pour elle. Par ailleurs `requireEmailVerification` (`middleware/auth.ts:659-671`) n'est monté sur AUCUNE route de production, ce qui réduit encore la surface côté e-mail. …

**Correctif** — Retirer `email` et `phoneNumber` de `updateUserProfileSchema` (`packages/shared/utils/validation.ts:366-367`) et poser `additionalProperties: false` sur `updateUserRequestSchema`, pour que `POST /users/me/change-email` et `/change-phone` soient l'UNIQUE chemin de changement de contact (400 explicite pointant vers ces routes si le champ est envoyé). Si l'on veut conserver l'écriture par le profil, alors elle DOIT poser `emailVerifiedAt: null` / `phoneVerifiedAt: null` (et purger `pendingEmail*`) dans le même `update` dès que la valeur change. Ajouter une garde de source NÉGATIVE (qui rougit si `updateData.email` réapparaît sans reset) plus un test HTTP qui prouve le 400 avec le schéma RÉEL — le test actuel mocke `updateUserProfileSchema` et `updateUserRequestSchema` en `additionalProperties: true`, il ne pouvait donc pas attraper ceci.

---

### 4. 🟠 Élevé — **confirmé**

**Constat soumis à réfutation** — GET /api/v1/users/search met `email` à la fois dans la clause OR du `where` et dans le `select`/schéma servi : tout compte authentifié peut chercher `contains: "gmail.com"` et récupérer les adresses en clair, 100 par page, sans rate limit de route.

**Preuve**

```
Montage — `services/gateway/src/route-registration.ts:266` : `server.register(userRoutes, { prefix: API_PREFIX })` ; `services/gateway/src/routes/users/index.ts:96` : `await searchUsers(fastify)` ; `services/gateway/src/routes/users/preferences.ts:516` : `fastify.get('/users/search', ...)` ⇒ chemin réel `/api/v1/users/search`. Seule porte : `preferences.ts:517` `onRequest: [fastify.authenticate]` — aucun rôle, aucune amitié exigée.

Le `where` — `preferences.ts:614-619` :
```
{ email: { contains: searchTerm, mode: 'insensitive' as const } },
```
placé dans le `OR` aux côtés de firstName/lastName/username/displayName.

Le `select` servi — `preferences.ts:648` : `email: true,` ; et le schéma de réponse `preferences.ts:545` déclare `email: { type: 'string' }`, donc fast-json-stringify le SÉRIALISE (il ne le retire pas).

Repro HTTP exécutée (jest + `app.inject` sur le vrai handler, prisma mocké, viewer `role: 'USER'`, presence masquée) — `GET /users/search?q=gmail.com&limit=100` → **200** avec :
`{"success":true,"data":[{"id":"…011","username":"alice",…,"email":"alice@gmail.com","isOnline":false,…},{…,"email":"bob@gmail.com",…}],"pagination":{"total":2,"offset":0,"limit":100}}`
et le `where` réellement transmis à Prisma : `…{"email":{"contains":"gmail.com","mode":"insensitive"}}…`, `take: 100`.

Ce qui NE refute PAS :
- `validatePagination` (`src/utils/pagination.ts:23`) plafonne bien `limit` à 100 et `offset` à 100 000 — cela BORNE la moisson, ne l'interdit pas.
- La garde de présence de 2026-08-25 est bien portée (`preferences.ts:663-673`, `applyPresenceVisibilityAsOffline` + `servedOnlineFirst`) — elle ne touche QUE `isOnline`/`lastActiveAt` (`packages/shared/utils/presence-visibility.ts:131-156`, le `...profile` réétale `email` tel quel).
- Aucun hook `onSend` global ne filtre le corps : `server.ts:326` n'enregistre que `conditionalGetOnSend` (ETag).
- Aucun `preHandler`/`allowList` ne neutralise la route.

Nuance mesurée sur le rate limit : il n'existe effectivement AUCUN rate limit de route ici (comparer `createPostRouteRateLimitConfig`, `src/middleware/rate-limiter.ts:150+`, appliqué aux posts), mais un limiteur GLOBAL existe — `server.ts:507` `registerGlobalRateLimiter`, 300 req/min, `keyGenerator: global:${request.ip}` (`rate-limiter.ts:68`). Le commentaire du fichier lui-même (`rate-limiter.ts:74-83`) note que Fastify tourne sans `trustProxy` derrière Traefik : `request.ip` est l'IP du conteneur proxy, IDENTIQUE pour tout le monde — le seau est donc partagé par toute la plateforme, il ne cible pas l'attaquant et ne l'isole pas.
```

**Impact réel** — Atteignable en pratique par un simple appel HTTP, avec n'importe quel compte inscrit fraîchement créé (aucun rôle, aucune amitié, aucune conversation partagée) :

1. Moisson de PII en masse. `GET /api/v1/users/search?q=gmail.com&limit=100&offset=N` rend 100 lignes `{id, username, firstName, lastName, displayName, email, systemLanguage}` par appel — identité civile + e-mail en clair, corrélés. En balayant `@gmail.com`, `@outlook.`, `@yahoo.`, puis les TLD (`.fr`, `.com`) et des bigrammes (`a@`, `b@`…), l'annuaire e-mail de la plateforme se sort intégralement. Plafond par terme : 100 000 lignes (cap `maxOffset`), donc aucune limite pratique en multipliant les termes.
2. Oracle d'énumération/confirmation. `q=<adresse complète>` renvoie `pagination.total` = 1 ou 0 : test d'existence d'un e-mail sur la plateforme, y compris pour un compte avec lequel l'attaquant n'a aucun lien. `total` est servi même quand l'offset dépasse la page.
3. Aggravant : le champ n'est même pas consommé par l'UI qui appelle la route — `apps/web/app/search/SearchPageContent.tsx:139` fait l'appel et ne lit jamais `email`. C'est une exposition sans usage.

Ce qui borne (honnêtement) : il faut un compte authentifié, et le seau global 300 req/min freine le débit (≈30 000 lignes/min au maximum théorique, seau partagé avec le trafic légitime, donc en pratique moins). Rien de tout cela n'empêche l'extraction complète en quelques heures.

Le point du constat « la garde de présence a été portée, celle sur l'e-mail n'existe pas » est exact et vérifié ligne à ligne : la même route applique un régime strict à `isOnline`/`lastActiveAt` et sert `email` sans aucune condition.

**Correctif** — Retirer `email` des DEUX côtés de la route : supprimer la branche `{ email: { contains: … } }` du `OR` (`preferences.ts:614-619`) et `email: true` du `select` (`preferences.ts:648`) ainsi que `email` du schéma de réponse (`preferences.ts:545`) — le web ne le lit pas, et la recherche par e-mail LÉGITIME est déjà couverte par la route à correspondance EXACTE `GET /users/email/:email` (`routes/users/profile.ts:1097`, `where: { email }` normalisé, `select: publicUserSelect`). Si un besoin de « trouver quelqu'un par son e-mail » doit rester dans `/users/search`, le faire en égalité stricte sur l'adresse entière (jamais `contains`) et ne JAMAIS réémettre l'adresse dans la réponse. Ajouter dans la foulée un rate limit de route avec `keyGenerator` explicite par `authContext.userId` (modèle `createPostRouteRateLimitConfig`, `middleware/rate-limiter.ts` — un `keyGenerator` hérité du global serait keyé sur l'IP Traefik partagée, donc inopérant), et une garde de source négative interdisant le retour de `email` dans ce `select`.

---

### 5. 🟠 Élevé — **confirmé**

**Constat soumis à réfutation** — GET /api/v1/messages/:messageId/translations n'applique aucun plancher d'historique et sert `originalContent` (le texte intégral du message), alors que GET /messages/:messageId, la liste, la recherche, les épingles et /mentions/messages/:id appliquent tous la borne.

**Preuve**

```
Le handler complet, sans plancher (services/gateway/src/routes/messages.ts:1052-1103) — la SEULE garde est l'appartenance, non bornée dans le temps :
- :1064-1076 `prisma.message.findFirst({ where: { id: messageId, deletedAt: null }, select: { id, content, originalLanguage, translations, conversationId } })` — `createdAt` n'est même pas projeté, donc aucune comparaison de plancher n'est possible en aval.
- :1083-1093 `prisma.participant.findFirst({ where: { conversationId: message.conversationId, userId, isActive: true } })` → 403 si absent. Aucun `joinedAt`, aucun `permissions`, aucun `shareLinkId` lu.
- :1095-1102 `sendSuccess(reply, { originalContent: message.content, translations: transformTranslationsToArray(...) })` — le texte original ET toutes ses traductions.

La jumelle, elle, applique la borne (messages.ts:336-347) : `const historyFloor = await loadHistoryFloor(prisma, readerRow); if (historyFloor && message.createdAt < historyFloor) return sendNotFound(...)`, alimentée par `HISTORY_FLOOR_PARTICIPANT_SELECT` étalé dans le select (messages.ts:322-325). L'import de `loadHistoryFloor` existe donc DÉJÀ dans le fichier (messages.ts:6) et n'est utilisé qu'une fois.

Les sites comparés appliquent bien la borne :
- routes/conversations/messages.ts:582,627,852,1470,1489 (liste, mode `around`, agrégats), :2461-2468 (épingles), :2896-2911 (recherche in-conversation)
- routes/conversations/search.ts:228 · routes/conversations/threads.ts:223-292 · routes/mentions.ts:160-164 · routes/attachments/metadata.ts:358-367

Tentatives de réfutation, toutes négatives :
1. Préfixe de montage reconstitué : route-registration.ts:298 `server.register(messageRoutes, { prefix: API_PREFIX })` avec `API_PREFIX = /api/${API_VERSION}` (:91) ⇒ l'URL `/api/v1/messages/:messageId/translations` est bien exposée.
2. Aucun hook global n'est un contrôle d'accès : server.ts:326 (`onSend` conditional-GET), :521/:528 (device locale/country), :538 (log client), :567/:571 (timing). Aucun `addHook` dans routes/messages.ts.
3. Aucune route concurrente/masquante : `grep '/messages/:messageId/translations'` ne rend qu'UNE déclaration dans tout le gateway.
4. Ce n'est pas du code mort : apps/web/services/message-translation.service.ts:144 et apps/ios/.../MessageLanguageDetailView.swift:490 l'appellent.
5. Aucun test ne prouve le contraire : `__tests__/unit/routes/message-detail-history-floor.test.ts` couvre `GET /messages/:messageId`, pas `/translations`.

Le plancher est réellement non nul pour un INSCRIT : routes/conversations/sharing.ts:525-541 pose `permissions.canViewHistory = shareLink.allowViewHistory` + `shareLinkId` sur la ligne d'un utilisateur inscrit entrant par lien ; services/historyFloor.ts:118-126 (`settleBeforeLink`) rend alors `{ settled, floor: join.joinedAt }`. Idem pour `historyVisibleFrom` (octroi/restriction par date d'un admin).
```

**Impact réel** — Atteignable en pratique par un simple appel HTTP authentifié (JWT), pas seulement en théorie.

Ce qu'obtient l'attaquant : membre ACTIF d'une conversation dont l'historique lui est borné (entré par lien `allowViewHistory:false`, ou `historyVisibleFrom` posé par un admin), il envoie `GET /api/v1/messages/<id>/translations` avec son Bearer et reçoit `originalContent` = le texte INTÉGRAL d'un message écrit avant son arrivée, plus toutes ses traductions. Aucune élévation de privilège n'est requise ; la route est ouverte aux inscrits (`allowAnonymous: false`, donc PAS aux anonymes de lien).

Le périmètre reste borné à la conversation dont il est membre : le contrôle `conversationId: message.conversationId` empêche la lecture d'une conversation tierce. Ce n'est donc pas une lecture globale.

Acquisition de l'identifiant — le point qui décide entre « théorique » et « pratique » :
- Cas pleinement pratique, sans devinette : un participant dont l'historique est RESTREINT APRÈS COUP (`historyVisibleFrom` posé par un admin, ou réintégration) garde dans son cache client (iOS/web) tous les ids déjà vus. Il les rejoue un par un.
- Vecteur serveur : le `replyTo` imbriqué de la liste (conversations/messages.ts:794-800) sert l'id du message cité sans plancher ; `forwardedFromId` est servi par la route de détail.
- Énumération d'ObjectId (4 o horodatage + 5 o aléa par processus + 3 o compteur) : faisable mais bruyante, et ce n'est pas le chemin nécessaire.

NUANCE de cadrage (n'atténue pas le défaut, corrige une phrase de l'énoncé) : `/translations` n'est pas STRICTEMENT le seul trou de cette famille — le même `replyTo` de la liste (conversations/messages.ts:797, `content: true`) sert déjà le CONTENU d'un parent sous le plancher. `/translations` reste le trou le plus large, car il vise n'importe quel id, pas seulement un message cité. À noter aussi : la route omet également le masquage personnel (`applyPersonalHistoryHiding`, absent du fichier) et ne consulte ni `isViewOnce`/`isBlurred`/`expiresAt` — mais la route de détail ne les consulte pas davantage, donc ce n'est pas un écart entre les deux.

**Correctif** — Dans services/gateway/src/routes/messages.ts (handler ligne 1052) : ajouter `createdAt: true` au `select` du message (:1069-1075), remplacer le `participant.findFirst` nu (:1083-1089) par un `select: HISTORY_FLOOR_PARTICIPANT_SELECT` (déjà importé ligne 6), puis appliquer exactement le patron de la route sœur — `const floor = await loadHistoryFloor(prisma, membership); if (floor && message.createdAt < floor) return sendNotFound(reply, 'Message non trouvé');` — le 404 (et non 403) pour ne pas révéler l'existence du message. Ajouter dans la foulée `applyPersonalHistoryHiding` comme sur la liste, et une garde de test dans `message-detail-history-floor.test.ts` qui rougirait si la borne disparaissait de CE handler. Vérifier au passage le `replyTo` non borné de conversations/messages.ts:797 (issue distincte).

---

### 6. 🟠 Élevé — **confirmé**

**Constat soumis à réfutation** — Cinq routes tracking-links gardent par `if (trackingLink.createdBy && trackingLink.createdBy !== userId)` — garde conditionnée à la PRÉSENCE de ce qu'elle garde — alors que POST /api/v1/tracking-links est authOptional, donc un lien créé anonymement (createdBy null) est lisible, désactivable, supprimable, RÉÉCRIVABLE (originalUrl) et statistiquement lisible par n'importe quel compte USER.

**Preuve**

```
Les quatre gardes de creation.ts (numéros de ligne du constat imprécis — voici les vrais) :
- services/gateway/src/routes/tracking-links/creation.ts:283 (GET /:token, `onRequest: [authOptional]`) : `if (trackingLink.createdBy) { if (!isRegisteredUser(...) || ...id !== trackingLink.createdBy) return sendForbidden(...) }` — forme NESTED : createdBy null ⇒ aucune garde du tout, y compris pour un appelant NON authentifié.
- creation.ts:607 (PATCH /:token/deactivate) · creation.ts:686 (DELETE /:token) · creation.ts:811 (PATCH /:token, qui écrit `originalUrl`) : `if (trackingLink.createdBy && trackingLink.createdBy !== userId) return sendForbidden(...)`.
- services/gateway/src/routes/tracking-links/tracking.ts:536 (GET /:token/stats) : idem (le constat disait :400).
Jumelle saine, bornée dans le WHERE : tracking.ts:703-705 `findFirst({ where: { token, createdBy: userId } })` (GET /:token/clicks) — et tracking.ts:602-609 (GET /tracking-links/stats agrégé).

Le createdBy null est atteignable, et pas seulement en théorie :
- creation.ts:29-32 `authOptional = createUnifiedAuthMiddleware(prisma, { requireAuth: false, allowAnonymous: true })` posé sur POST /tracking-links ; middleware/auth.ts:509-520 ne rejette rien sans en-tête (createUnauthenticatedContext). creation.ts:152-156 : `let createdBy: string | undefined;` rempli SEULEMENT `if (isRegisteredUser(...))`.
- packages/shared/prisma/schema.prisma:1759 `createdBy String? @db.ObjectId // Utilisateur qui a créé le lien (null si anonyme)`.
- Chemin SERVEUR, plus grave : MessageProcessor.ts:123-134 `resolveLinkAuthorUserId` rend `participant?.userId ?? undefined`, et Participant.userId est nullable pour un anonyme (schema.prisma, `/// FK to User (null for anonymous/bot participants)`). Donc tout message d'un participant ANONYME contenant une URL crée un TrackingLink createdBy=null (TrackingLinkService.ts:733/780/868), dont le token est publié dans le contenu (`m+<token>`) et dans `metadata.trackingLinks`. Pire : TrackingLinkService.ts:226-241 `findExistingTrackingLink(url, conversationId)` ne filtre PAS sur createdBy — un utilisateur ENREGISTRÉ qui reposte la même URL dans la même conversation RÉUTILISE le lien orphelin.
- Montage : route-registration.ts:214 `server.register(trackingLinksRoutes, { prefix: API_PREFIX })`, API_PREFIX = `/api/v1` (ligne 91). Aucun onRequest global d'authentification (server.ts:538 et :567 = logging client et chronométrage uniquement).
- Effet du PATCH : creation.ts:811 franchi ⇒ `updateTrackingLink({ originalUrl })` ; apps/web/app/l/[token]/page.tsx:367-369 et :436 redirigent vers cet `originalUrl` (seul filtre : `isHttpUrl` creation.ts:840 — http(s) suffit au phishing).
- Le comportement est VERROUILLÉ par les tests : __tests__/unit/routes/tracking-links/creation-remaining.test.ts:147-151 `it('returns 200 when link has no createdBy (public link)')` sur DELETE, idem :190+ sur PATCH, et creation-extended.test.ts:160-163. Aucun test ne le contredit ; __tests__/security/route-auth-coverage.test.ts:416-418 n'exempte que l'OUVERTURE de POST et la lecture publique du token, jamais l'écriture.
```

**Impact réel** — Atteignable par appel HTTP réel, pas seulement en théorie. Prérequis unique : connaître le token — or le token EST public par construction (il est dans l'URL courte meeshy.me/l/<token> diffusée, et dans le corps du message sous forme `m+<token>`). Concrètement :
1. Détournement de cible (le pire) : `PATCH /api/v1/tracking-links/<token>` avec `{"originalUrl":"https://evil.tld/login"}` par N'IMPORTE QUEL compte USER (aucun rôle privilégié requis) réécrit la destination d'un lien court déjà diffusé sous le domaine de confiance Meeshy — phishing parfait, l'URL vue par la victime ne change pas. `isHttpUrl` n'y oppose rien.
2. Vandalisme / déni : DELETE (perte irréversible du lien ET de toutes ses analytics) ou PATCH deactivate ⇒ 410 sur un lien en circulation.
3. Fuite : `GET /:token/stats` livre les analytics agrégées (pays, device, navigateur, OS, langue, référents, horaires) à tout USER ; et `GET /:token` livre la fiche complète du lien à un appelant même NON authentifié (garde nested, route authOptional).
Cible réelle : les liens orphelins, c'est-à-dire ceux créés (a) par un participant ANONYME d'une conversation dont le message contient une URL — leur token est visible de tous les membres — et (b) par n'importe qui via un simple `curl -X POST /api/v1/tracking-links` sans en-tête. La réutilisation `findExistingTrackingLink` fait qu'un lien orphelin peut ensuite porter le partage d'utilisateurs enregistrés.
Ce qui NE tient PAS dans le constat : (i) les numéros de ligne cités (228/545/625/704 et tracking.ts:400) ne pointent pas les gardes mais leurs blocs `schema` — les vraies lignes sont 283/607/686/811 et 536 ; (ii) « tout compte USER peut lire » est trop faible pour GET /:token, qui est plus ouvert encore (non authentifié) parce que sa garde a une forme nested, pas la forme `&&` ; (iii) les liens créés par un utilisateur enregistré sont, eux, correctement protégés — le trou est strictement l'ensemble createdBy=null ; (iv) ce n'est pas une régression accidentelle : quatre tests figent explicitement « public link », donc le correctif devra les réécrire.

**Correctif** — Faire de l'ABSENCE de propriétaire un refus, jamais une permission : remplacer les cinq gardes par une comparaison inconditionnelle (`if (trackingLink.createdBy !== userId) return sendForbidden(...)` — `null !== userId` est toujours vrai), avec une échappatoire explicite BIGBOSS/ADMIN si un besoin d'administration existe (les routes `/tracking-links/admin/*` la couvrent déjà). Mieux : borner dans le WHERE comme le fait la jumelle saine `GET /:token/clicks` (`findFirst({ where: { token, createdBy: userId } })`) pour que la propriété soit une PROPRIÉTÉ DE LA REQUÊTE et non une comparaison qu'un futur écrivain pourra ré-oublier. En complément, faire porter à `POST /tracking-links` anonyme un propriétaire de substitution (participant/session) ou rendre ces liens immuables, et réécrire les quatre tests qui figent le 200 « public link ».

---

### 7. 🟠 Élevé — **confirmé**

**Constat soumis à réfutation** — GET /api/v1/admin/conversations/:conversationId/messages sert le contenu intégral de n'importe quelle conversation (directe entre tiers incluse) à MODERATOR et AUDIT, messages supprimés inclus, sans lire encryptionMode/isViewOnce/isBlurred/expiresAt et sans trace d'audit ; GET /admin/users/:userId/media sélectionne messageAttachment sans lire isViewOnce/isBlurred/effectFlags et sert fileUrl + thumbnailUrl tels quels.

**Preuve**

```
Montage — route-registration.ts:91 `const API_PREFIX = '/api/${API_VERSION}'` et :229 `await server.register(userAdminRoutes, { prefix: API_PREFIX })` ⇒ les chemins déclarés `'/admin/conversations/:conversationId/messages'` (routes/admin/users.ts:1513) et `'/admin/users/:userId/media'` (:1217) sont bien /api/v1/admin/... Aucun hook global d'auth ni d'audit : server.ts n'enregistre que conditionalGetOnSend (:326), deviceLocale/deviceCountry (:521,:528), un log client (:538), un timing (:567/:571).

Seuil de rôle — users.ts:1514 `preHandler: [fastify.authenticate, requireUserViewAccess]` ; admin-user-auth.middleware.ts:26 `if (!permissionsService.hasPermission(userRole, 'canViewUsers'))` ; permissions.service.ts:82 MODERATOR `canViewUsers: true` et :101 AUDIT `canViewUsers: true` (AUDIT a pourtant `canModerateContent: false` et `canManageConversations: false`).

Messages — users.ts:1529 `const where = { conversationId };` puis :1535 `content: true,` dans le select : aucun filtre `deletedAt`, `expiresAt`, `isViewOnce`, aucune lecture de `encryptionMode`, aucun `schema.response` qui filtrerait à la sérialisation, et zéro appel `userAuditService` après la ligne 963 — alors que la simple consultation d'une fiche utilisateur est tracée (users.ts:207 `await userAuditService.logViewUser(...)`).

Contenu réellement présent en base — routes/messages.ts:887-890 la suppression « pour tout le monde » écrit `data: { translations: null, deletedAt: new Date() }` et LAISSE `content` intact ⇒ le texte rappelé est servi verbatim.

Média — users.ts:1236-1239 `const mediaSelect = { id, originalName, mimeType, fileUrl, thumbnailUrl, fileSize, width, height, duration, createdAt }` : ni `isViewOnce`, ni `isBlurred`, ni `effectFlags`, qui existent pourtant sur le modèle (schema.prisma:889/895/898). `mediaMayTravel` n'existe qu'à un seul endroit du dépôt — services/messaging/messageNotificationFanOut.ts:416 — jamais ici.

Et l'URL servie n'est pas gardée : UploadProcessor.ts:369-371 `getAttachmentPath → '/api/v1/attachments/file/' + encodeURIComponent(filePath)`, et routes/attachments/download.ts:312 déclare `'/attachments/file/*'` SANS `onRequest` d'authentification — contrairement à son jumeau download.ts:129 `'/attachments/:attachmentId'` qui porte `onRequest: [... fastify.authenticate]` puis `resolveAttachmentReadVerdict` (participation + `carrierMessageStillServesBytes`). Le dépôt le dit lui-même : services/attachments/carrierMessageLifecycle.ts « `/api/v1/attachments/file/<chemin>`, servie SANS authentification et par chemin ».

Chaîne d'appel réelle, pas théorique : apps/web/components/admin/user-detail/UserConversationsSection.tsx:155 puis :251 (`/admin/conversations/${conversation.id}/messages`) et UserMediaSection.tsx:63, qui rend le média en clair — UserMediaSection.tsx:120 `const preview = kind === 'image' ? (item.thumbnailUrl || item.fileUrl) : item.thumbnailUrl` puis `<img src={preview}>` dans un `<a href={item.fileUrl}>`.

Ce que j'ai cherché pour réfuter, en vain : un hook global (aucun), un `schema.response` filtrant (aucun sur ces deux routes), un test attestant une rédaction (les seules assertions de masquage des suites admin portent sur la PRÉSENCE — admin-user-conversations.test.ts:243, admin-user-routes.test.ts:1303), un `uploadedBy` qui stockerait un participantId et rendrait la route morte (non : UploadProcessor.ts:508 `uploadedBy: userId`).
```

**Impact réel** — Atteignable par un simple appel HTTP, avec un compte MODERATOR ou AUDIT et rien d'autre. La chaîne complète tient dans la même permission : GET /api/v1/admin/users/:userId/conversations (users.ts:1118, `where.participants.some({ userId })`, aucun filtre de type — les conversations DIRECT y sont) donne les conversationId, puis GET /api/v1/admin/conversations/:id/messages rend le fil entier d'une conversation privée entre deux tiers, page par page, y compris le texte des messages que l'expéditeur a rappelés, ceux à vue unique non encore brûlés et les éphémères non encore balayés. Aucune ligne d'audit n'est écrite — alors que la consultation d'une fiche utilisateur, elle, est tracée.

Sur le média, le constat SOUS-ESTIME le problème. Il n'est pas seulement que la garde de protection manque au select : l'URL rendue pointe vers `/api/v1/attachments/file/*`, une route sans aucune authentification. Un MODERATOR qui recevrait 403 sur `/attachments/:id` (il n'est pas participant) obtient les octets par l'URL que la route admin vient de lui donner — et cette URL, une fois recopiée, fonctionne pour n'importe qui, sans compte. Le fichier d'un média à VUE UNIQUE envoyé en privé s'affiche donc ENTIER, en pleine résolution, dans la grille de l'écran admin (UserMediaSection.tsx:120-131), tant que le balayage ne l'a pas `unlink`.

Deux précisions qui bornent la portée, sans l'annuler :
1. « Contenu INTÉGRAL de n'importe quelle conversation » est exact pour les conversations NON chiffrées — le cas par défaut, `encryptionEnabledAt` étant nul tant que personne n'active le chiffrement. Pour une conversation en mode `server` ou `hybrid` (et `e2ee` avec un client conforme), MessageProcessor.ts:412 écrit `content: encryptionContext.isEncrypted ? '' : processedContent.trim()` : la colonne `content` est VIDE en base et la route, qui ne sélectionne pas `encryptedContent`, ne rend rien. L'absence de lecture d'`encryptionMode` est donc un manque de principe, pas le vecteur de la fuite — la fuite vient du chemin nominal en clair. Cas résiduel : mode `e2ee` avec un client qui poste du texte clair (MessageProcessor.ts:197-205 se contente d'un `logger.warn`), où `content` reste en clair.
2. …

**Correctif** — Porter la garde du cycle 125 à ces deux routes : sur /admin/conversations/:id/messages, sélectionner `isViewOnce`/`isBlurred`/`expiresAt`/`isEncrypted` et substituer un placeholder au `content` protégé (même prédicat que `protectedPreview`), et écrire une ligne d'audit par lecture, à l'image de `userAuditService.logViewUser`. Sur /admin/users/:userId/media, lire `isViewOnce`/`isBlurred`/`effectFlags` de la pièce jointe ET du message porteur, et n'émettre `fileUrl`/`thumbnailUrl` que si le prédicat autorise le voyage du média — sinon rendre une vignette masquée sans URL, puisque `/attachments/file/*` ne rattrapera rien en aval. Et relever le seuil : la lecture du contenu d'une conversation tierce relève d'ADMIN+ (ou d'un motif de modération lié à un signalement), pas de `canViewUsers`.

---

### 8. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — Tous les rate limiters nommés du gateway sont INERTES en production : RateLimiter.middleware() sort immédiatement si isLocalIp(request.ip), Fastify tourne sans trustProxy derrière Traefik donc request.ip est une adresse Docker 172.x pour tout le monde ; le seul filet restant est le limiteur global, keyé global:${request.ip}, soit UN SEUL SEAU pour toute la plateforme, fail-open si Redis tombe.

**Preuve (extrait)** — MÉCANISME — CONFIRMÉ intégralement :

services/gateway/src/utils/rate-limiter.ts:223 (dans `RateLimiter.middleware()`)
    if (isLocalIp(request.ip)) return;
— inconditionnel, aucun garde NODE_ENV. Introduit par 61bef1f2bb (« rate limiter improvements »).

services/gateway/src/utils/rate-limiter.ts:31-38 (isLocalIp)
    normalized === '127.0.0.1' || … || normalized.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(normalized)
— couvre exactement le pool d'adresses par défaut de Docker (172.17.0.0/12, 10.x).

services/gateway/src/server.ts:196 et :215 — les DEUX constructions `fastify({...})` (HTTPS et HTTP) : `logger`, `disableRequestLogging`, `bodyLimit`, `https`, `ajv`. **Aucun `trustProxy`.** `grep -rn trustProxy src/` ne rend que des COMMENTAIRES et des tests — zéro option réelle. Aucun hook onRequest ne réécrit `request.ip` (server.ts:538 et :567 n'écrivent que `request.log`).

docker-compose.prod.yml:327 `traefik.http.routers.gateway.middlewares=compress@file` + bloc final `networks: meeshy-network: driver: bridge` (aucun `subnet:` déclaré → pool Docker par défaut …


*Sites :* `calls.ts:112`, `docker-compose.prod.yml:209`, `docker-compose.prod.yml:327`, `middleware/rate-limit.ts:51`, `middleware/rate-limiter.ts:70`, `middleware/rate-limiter.ts:77`, `middleware/rate-limiter.ts:85`, `posts/audio.ts:47`

**Impact réel** — Ce qu'un attaquant obtient par un simple appel HTTP à https://gate.meeshy.me, sans outillage particulier :

1. Bruteforce de mot de passe SANS AUCUN frein par appelant ni par compte. `loginRateLimiter` (5/15 min) et `authGlobalRateLimiter` (20/min) sortent à la ligne 223 avant de compter quoi que ce soit, et `AuthService.authenticate` n'a ni compteur d'échecs ni verrouillage. Atteignable en pratique.
2. Énumération de comptes et création de masse : `registerRateLimiter` (3/5 min) idem inerte ; `POST /auth/check-availability`, `POST /register` sans frein par appelant.
3. Pompage e-mail de réinitialisation : `createPasswordResetDailyRateLimiter` (3/jour par e-mail) inerte — un tiers peut noyer la boîte d'une victime.
4. Énumération de numéros par `phone-reset/lookup` : la limite 3/heure/IP est inerte.
5. Le SEUL plafond réel restant est le seau plateforme `global:<IP Traefik>` = 300 req/min PARTAGÉ par tous les utilisateurs. Double conséquence : (a) il borne l'attaque à ~18 000 requêtes/heure — assez pour du bruteforce de mot de passe faible et de l'énumération, pas assez pour un TOTP à 6 chiffres avec fenêtre 90 s ; (b) c'est une DoS triviale : un seul client qui tient 300 req/min fait répondre 429 à toute la plateforme. Et `skipOnError: true` fait tomber ce dernier filet en grand dès que Redis a une erreur.

CE QUI N'EST PAS ATTEIGNABLE, contrairement à ce qu'affirme le « pourquoi grave » :
- Bruteforce du code SMS à 6 chiffres : borné à 5 essais par token en base (`codeAttempts`), plus 3 essais d'identité — le limiteur inerte n'ouvre rien.
- Pompage SMS illimité : le renvoi est bloqué à 1/60 s par token par le cache applicatif, hors du limiteur.
- Amplification ML / spam de posts-stories : les routes posts/sounds/signal/calls gardent leurs limites par userId via @fastify/rate-limit, non touchées par la ligne 223.

Le constat reste donc la garde structurante à corriger — mais il surestime sa portée (« tous ») et impute au bypass deux impacts (code SMS, ML) que d'autres gardes couvrent déjà.

**Correctif** — Deux gestes, dans cet ordre. (1) Supprimer purement la ligne `services/gateway/src/utils/rate-limiter.ts:223` — l'exemption « IP locale » n'a aucun sens dans un déploiement conteneurisé et neutralise les 15 limiteurs d'auth ; en garder l'esprit pour le dev via un `skip` explicite conditionné à `config.isDev`, jamais via l'adresse source. (2) Activer `trustProxy` sur les deux constructions `fastify({...})` (server.ts:196 et :215) — en le bornant aux IP du réseau `meeshy-network`, pas `true` — afin que `request.ip` redevienne l'IP client réelle, ce qui rend en même temps son sens au seau `global:${request.ip}` (aujourd'hui un seau plateforme unique). Ces deux changements se tiennent : l'un sans l'autre transforme le seau partagé en refus généralisé. En complément immédiat, monter un limiteur par jeton sur `POST /login/2fa` (routes/auth/login.ts:195, aujourd'hui sans preHandler) et supprimer le code mort `registerRateLimiting` (middleware/rate-limit.ts:51) en conservant `ROUTE_RATE_LIMITS`, qui lui est bien utilisé.

---

### 9. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — GET /attachments/file/* est entièrement public alors que c'est l'URL nominale écrite en base ; GET /attachments/:attachmentId/metadata n'a aucun contrôle d'appartenance et sert filePath — les deux composent une chaîne d'exfiltration à partir d'un seul ObjectId, y compris pour un message éphémère, à vue unique, rappelé ou expiré.

**Preuve (extrait)** — 1) Route SANS aucune garde — confirmé après reconstitution du montage :
services/gateway/src/routes/attachments/download.ts:311-313 → `fastify.get('/attachments/file/*', { schema…, onSend: … }, handler)` — pas de `onRequest`, pas de `preHandler`, pas de `preValidation`. Ses deux voisines EN ONT une : download.ts:131 et download.ts:232 → `onRequest: [(req, rep) => fastify.authenticate(req, rep)]`.
Montage : routes/attachments/index.ts:52 `registerDownloadRoutes(fastify, prisma)` (aucun middleware passé, contrairement à `registerMetadataRoutes(fastify, authRequired, authOptional, prisma)` ligne 54), puis route-registration.ts:307 `server.register(attachmentRoutes, { prefix: API_PREFIX })` ET :311 `{ prefix: '/api' }` → la route est joignable en `/api/v1/attachments/file/*` ET `/api/attachments/file/*`.
Hooks GLOBAUX vérifiés un par un (server.ts:521 deviceLocale, :528 deviceCountry, :538 log client, :567 timing, middleware/clientMutationId.ts:58, middleware/request-id.ts:15) : AUCUN n'authentifie. Traefik prod : `traefik.http.routers.gateway.middlewares=compress@file` …


*Sites :* `AttachmentService.ts:276`, `UploadProcessor.ts:174`, `__tests__/unit/routes/attachments/metadata.test.ts:128`, `api-schemas.ts:277`, `docker-compose.prod.yml:327`, `download.ts:131`, `download.ts:232`, `download.ts:373`

**Impact réel** — La chaîne existe et est atteignable par appel HTTP, mais elle n'est pas anonyme de bout en bout — c'est la nuance.

Ce qu'obtient un attaquant DISPOSANT D'UN COMPTE ENREGISTRÉ (inscription libre) : `GET /api/v1/attachments/<objectId>/metadata` avec son propre Bearer rend, pour N'IMPORTE QUELLE pièce jointe du produit, `fileUrl` + `filePath` + `transcription` + `translations` + `metadata`. Deux impacts distincts :
(a) la TRANSCRIPTION et ses traductions fuient en clair immédiatement — pour un vocal, le contenu est exfiltré sans même toucher au fichier ;
(b) `fileUrl` est la capacité qui ouvre `/attachments/file/*`, servie sans identité, sans lecture base, donc sans la garde `resolveAttachmentReadVerdict` (participation) NI `carrierMessageStillServesBytes` (deletedAt/expiresAt) que download.ts:128-232 applique à ses jumelles. Les octets d'un message rappelé, expiré ou dont la vue unique est brûlée sont servis tant que le balayage n'a pas `unlink` le fichier.
Praticabilité : il faut un `attachmentId`. C'est un ObjectId Mongo généré côté processus applicatif (schema.prisma:843 `@default(auto())`) : les 5 octets aléatoires sont constants par processus et le compteur est séquentiel, donc à partir d'UN id obtenu légitimement (son propre upload) le voisinage est largement prédictible. Le quota global de 300 req/min par IP (server.ts:507) freine sans empêcher. Le moissonnage à grande échelle est donc réaliste mais bruyant et lent, pas instantané.
Ce qui rend le constat NUANCÉ et non pleinement CONFIRMÉ : (i) metadata exige une authentification (le constat laisse entendre le contraire en le mettant sur le même plan que la route publique) ; (ii) `/attachments/file/*` seule n'est pas exploitable sans le chemin — c'est une URL-capacité 122 bits, et le dépôt documente explicitement ce compromis comme assumé, pas comme un oubli ; (iii) l'ETag de :90 est un bug de fraîcheur de cache, pas un vecteur d'exfiltration — l'inclure dans un constat de sécurité affaiblit le reste.

**Correctif** — Extraire `resolveAttachmentReadVerdict` de la closure de `registerDownloadRoutes` (download.ts:74) vers un module partagé et l'appeler dans `GET /attachments/:attachmentId/metadata` avant tout `sendSuccess` — c'est l'unique correctif qui casse la chaîne, puisqu'il ferme à la fois la fuite de transcription et la remise de la capacité. Dans le même mouvement, retirer `filePath` (et idéalement `fileUrl`) du `select` de `getAttachmentWithMetadata` : un client n'en a pas l'usage, la route `/attachments/:id` sert les octets. Ajouter `updatedAt: true` à ce `select` pour rendre l'ETag non dégénéré, et faire rougir une garde sans `updatedAt` dans le mock. Pour `/attachments/file/*`, ne pas y poser une lecture base (route la plus chaude) : lui donner une URL signée à échéance courte, ce qui restaure la révocation que le doc-comment de carrierMessageLifecycle.ts:42-55 identifie déjà comme le vrai manque.

---

### 10. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — Les routes ML de voix (POST /attachments/:id/transcribe, POST /voice/transcribe, POST /voice/translate, GET /attachments/:id/analysis) lisent le contenu vocal d'autrui sans contrôle de propriété : tout compte authentifié obtient transcription intégrale, traductions et URLs audio d'un vocal privé.

**Preuve (extrait)** — CONFIRMÉ — l'absence de garde de propriété sur trois routes :

1. `services/gateway/src/routes/attachments/translation.ts:342-346` — `prisma.messageAttachment.findUnique({ where: { id: attachmentId }, select: { id: true, mimeType: true, uploadedBy: true } })`. `uploadedBy` n'est ensuite lu NULLE PART dans le handler (grep sur le fichier : une seule occurrence, celle du `select`). Le seul contrôle est `consentService.getConsentStatus(userId)` (`:352-357`) — le consentement de l'APPELANT. Puis `:363` `getAttachmentWithTranscription(attachmentId)` et `:381` `transcribeAttachment(attachmentId)`, aucun des deux ne reçoit d'identité.

2. La jumelle `/translate` du MÊME fichier porte bien la garde, par délégation : `:233` `translateService.translate(userId, attachmentId, …)` → `services/AttachmentTranslateService.ts:137` `const hasAccess = await this.verifyUserAccess(userId, attachment)` → `:240-259` (uploader OU `participant` actif de la conversation), `ACCESS_DENIED` → 403. La moitié pauvre est bien `/transcribe`.

3. `services/gateway/src/routes/voice/translation.ts:179` et `:696` — …


*Sites :* `__tests__/unit/routes/attachments/translation.test.ts:63`, `route-registration.ts:307`, `route-registration.ts:336`, `route-registration.ts:343`, `routes/attachments/download.ts:105`, `routes/attachments/index.ts:56`, `routes/voice/index.ts:18`, `server.ts:538`

**Impact réel** — Atteignable par un simple appel HTTP, en pratique, par tout compte authentifié (JWT ; les anonymes sont exclus par `allowAnonymous:false`) qui connaît un `attachmentId` — un ObjectId 24-hex, non énumérable, mais que TOUT ancien participant conserve dans ses payloads de messages en cache. Scénario réaliste : un membre retiré d'une conversation garde à vie l'accès aux transcriptions de ses vocaux.

Ce qu'il obtient sur `POST /api/v1/attachments/<id>/transcribe` (ou `POST /api/v1/voice/transcribe` avec `{"attachmentId":"<id>"}`) : le TEXTE INTÉGRAL en clair du message vocal privé, ses segments horodatés mot à mot, la langue détectée, et tous les textes de traduction déjà produits, plus les métadonnées du fichier (nom d'origine, chemin, taille, durée, codec). Si aucune transcription n'existe encore, il en DÉCLENCHE une sur l'audio d'autrui, sous le consentement du seul appelant.

Sur `POST /api/v1/voice/translate` avec `attachmentId`, il déclenche en plus `translateAttachment` — génération TTS, potentiellement avec clonage de la voix de l'émetteur original (`AttachmentTranslateService.translateAudio` élit `voiceUserId = originalSenderId` par défaut).

Sur `GET /attachments/<id>/analysis`, il obtient l'empreinte vocale biométrique (pitch, timbre, MFCC) de l'émetteur — pas son texte.

Ce qu'il N'obtient PAS : les octets audio. Les URLs rendues restent gardées par `download.ts` (participant actif requis) et le gateway ne sert aucun répertoire statique.

**Correctif** — Extraire `AttachmentTranslateService.verifyUserAccess` (uploader OU participant actif de `message.conversationId`) en une garde partagée — par ex. `assertAttachmentReadable(prisma, viewerId, attachmentId)` — et l'appeler avant tout accès dans les quatre handlers : `routes/attachments/translation.ts` `/transcribe` (là où `uploadedBy` est déjà chargé mais jamais lu), `routes/voice/translation.ts:179` et `:696`, et `routes/voice-analysis.ts:339` (ainsi que le POST `:90` et le batch, qui souffrent du même trou). Mieux : rendre `getAttachmentWithTranscription(attachmentId, viewerId)` fail-closed en exigeant l'identité dans sa signature, pour qu'aucun appelant futur ne puisse l'omettre en silence, et ajouter une garde de régression asservissant un 403 pour un `attachmentId` d'une conversation dont l'appelant n'est pas participant.

---

### 11. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — `audioPath` client-fourni sur POST /attachments/:id/analysis, POST /attachments/batch/analysis et POST /voice/analysis, relayé tel quel au translator par ZMQ sans confinement ; et POST /attachments/:attachmentId/analysis ne vérifie que l'existence de l'attachment avec `persist: true` par défaut, donc réécrit le blob `transcription` d'autrui (la variante batch ne fait aucun findUnique). Les 5 routes sont montées à la racine.

**Preuve (extrait)** — CONFIRMÉ — le montage à la racine : `services/gateway/src/route-registration.ts:336` → `await server.register(voiceAnalysisRoutes);` sans `prefix`, alors que `API_PREFIX = /api/${API_VERSION}` est défini :91 et passé à toutes les autres. Aucun préfixe global (`server.ts:805` appelle `registerAllRoutes` nu), aucun StripPrefix Traefik (`docker-compose.prod.yml:324` n'a qu'une règle `Host()`). Les chemins réels sont donc `/attachments/:attachmentId/analysis`, `/attachments/batch/analysis`, `/voice/analysis`.

CONFIRMÉ — le chemin client non confiné, de bout en bout : `voice-analysis.ts:118` déclare `audioPath: { type: 'string' }` dans le schéma de corps (donc conservé, pas de `removeAdditional`), `:190` et `:316` et `:457` le passent au service ; `VoiceAnalysisService.ts:97` et `:217` → `this.audioTranslateService.analyzeVoice(userId, { audioPath, … })` ; `AudioTranslateService.ts:604` → `audioPath: options.audioPath` dans le `VoiceAnalyzeRequest` ; `ZmqRequestSender.ts:344-346` → `sendVoiceAPIRequest` fait `await this.connectionManager.send(request)` sans filtrage de champ ; …


*Sites :* `AudioTranslateService.ts:604`, `VoiceAnalysisService.ts:172`, `VoiceAnalysisService.ts:97`, `ZmqConnectionManager.ts:78`, `ZmqRequestSender.ts:156`, `ZmqRequestSender.ts:344`, `__tests__/security/route-auth-coverage.test.ts:33`, `apps/web/hooks/use-voice-analysis.ts:40`

**Impact réel** — Atteignable en pratique par un simple appel HTTP, avec n'importe quel compte enregistré (JWT ; les sessions anonymes sont refusées 403 par `auth.ts:516`), sans rôle particulier :

1. IDOR EN ÉCRITURE cross-tenant (l'impact réel). `POST /attachments/<id-de-la-victime>/analysis` avec son propre `audioBase64` écrase la sous-clé `transcription.voiceQualityAnalysis` de l'attachment vocal de n'importe qui, et `/attachments/batch/analysis` le fait 50 fois par requête. Le rate limit global (300/min, `middleware/rate-limiter.ts:64`) laisse passer ~15 000 écrasements/minute — et derrière Traefik sans `trustProxy` le seau est partagé par tout le monde (`:80-84`). Pas de destruction du transcript, mais empoisonnement durable et relisible de métadonnées vocales d'autrui (score de qualité, aptitude au clonage vocal).
2. IDOR EN LECTURE : `GET /attachments/<id>/analysis` rend le `voiceQualityAnalysis` de n'importe quel attachment.
3. Le chemin non confiné : primitive d'ouverture de fichier arbitraire SUR LE CONTENEUR TRANSLATOR, mais sans valeur d'exfiltration — pas de contenu, pas d'oracle d'existence, et pas d'accès aux uploads en prod. Ce qui reste concret est un levier de DoS : `librosa.load` décode intégralement le fichier pointé (ex. un poids de modèle sous `/workspace/models`), 50 par requête, sur le conteneur ML.

« Théoriquement atteignable » : l'exfiltration de fichiers. « Atteignable en pratique » : l'IDOR lecture/écriture et le DoS ML.

**Correctif** — Poser une garde de propriété partagée par les trois routes d'attachment : charger l'attachment avec son `Message` et refuser (404) si l'appelant n'est pas membre de la conversation — la route unitaire ET l'intérieur de `analyzeAttachmentsBatch`, jamais seulement la route. Supprimer `audioPath` des trois schémas de corps (aucun client ne l'utilise, le web n'envoie que `audioBase64`) et ne laisser le champ être renseigné que par le gateway depuis `MessageAttachment.filePath` après `realpath` confiné à `UPLOAD_PATH`. Enfin monter les routes avec `{ prefix: API_PREFIX }` dans `route-registration.ts:336` et corriger les chemins de `apps/web/hooks/use-voice-analysis.ts` en conséquence.

---

### 12. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /api/v1/voice/translate/async accepte `webhookUrl` (format: 'uri' seul, ni allowlist ni blocage d'IP privées) et le worker POSTe le résultat de traduction dessus ; `priority` est fixé par le client sans contrôle de rôle.

**Preuve (extrait)** — VRAI — aucune validation nulle part. `services/gateway/src/routes/voice/translation.ts:257` : `webhookUrl: { type: 'string', format: 'uri' }` ; transmis tel quel à `translateAsync` (translation.ts:403) → `services/gateway/src/services/AudioTranslateService.ts:435` `webhookUrl: options.webhookUrl` → ZMQ → `services/translator/src/services/voice_api/voice_api_handler.py:233` → `operation_handlers.py:139` → `translation_pipeline_service.py:431`, et le worker fait bien `session.post(job.webhook_url, json=payload, timeout=30)` (`translation_pipeline_service.py:787`). Un `grep -rni "ssrf|169\.254|isPrivateIp|allowlist"` sur gateway+translator+shared ne rend AUCUNE garde d'URL.

FAUX SUR LA ROUTE CITÉE — le POST ne part jamais depuis ce chemin. `_send_webhook` construit sa charge AVANT l'appel HTTP :
  translation_pipeline_service.py:781-785  `payload = { "event": ..., "job": job.to_dict(), "metadata": job.callback_metadata }`
  translation_pipeline_service.py:98       `"priority": self.priority.value,`
Or sur le chemin ZMQ, `priority` arrive en `int` BRUT : gateway `priority: …


*Sites :* `AudioTranslateService.ts:436`, `AudioTranslateService.ts:437`, `infrastructure/docker/compose/docker-compose.prod.yml:206`, `services/gateway/src/routes/voice/translation.ts:257`, `services/gateway/src/services/AudioTranslateService.ts:435`, `translation.ts:369`, `translation.ts:403`

**Impact réel** — Par la route citée (gateway, utilisateur authentifié) : RIEN aujourd'hui. L'attaquant obtient un job qui se termine, une ligne de log `[PIPELINE] Erreur webhook: 'int' object has no attribute 'value'`, et aucun paquet vers l'hôte qu'il a choisi. C'est un SSRF LATENT, à une ligne de vivre : quiconque « corrige » le type de `priority` sur le chemin ZMQ (`JobPriority(priority)`, alignement sur voice_api.py:433) ou retire `self.priority.value` de `to_dict()` l'arme sans toucher au webhook. Le constat semblait vrai parce que toute la chaîne d'appel est présente et non gardée — ce qui l'interrompt est un bug de type sans rapport, dans une fonction voisine, invisible depuis la route.

Par le site voisin (translator public) : exploitable en pratique et SANS COMPTE. `curl -F audio=@x.wav -F webhook_url=http://169.254.169.254/latest/meta-data/... https://ml.meeshy.me/api/v1/voice/translate/async` fait émettre au worker ML un POST depuis l'intérieur du réseau (métadonnées cloud, `http://gateway:3000`, `http://mongo:27017`, Redis, Traefik) — SSRF aveugle en écriture (le corps de la réponse n'est pas restitué à l'appelant, seul le code >= 400 est journalisé côté serveur), doublé d'une exfiltration NON aveugle : la charge POSTée contient `job.to_dict()`, donc `result` — texte transcrit et traductions — vers l'hôte de son choix. aiohttp suit les redirections par défaut, donc même une allowlist d'hôtes serait contournable sans `allow_redirects=False`.

**Correctif** — Poser une validation d'URL UNIQUE au point de création du job (`TranslationPipelineService.submit_job`, pas au bord) : schéma https seul, résolution DNS explicite puis rejet de loopback/link-local/RFC1918/CGNAT/IPv6 ULA sur TOUTES les adresses résolues, allowlist d'hôtes par variable d'environnement, `allow_redirects=False` sur le `session.post` et signature HMAC de la charge — et ne jamais compter sur l'`AttributeError` de `to_dict()` comme protection : corriger ce bug de type (`JobPriority(int(priority))` côté `operation_handlers.py:139`) DANS le même lot que la garde, jamais avant. Indépendamment : authentifier (ou dé-publier de Traefik) le FastAPI du translator, dont `POST /api/v1/voice/translate/async` est aujourd'hui joignable sans jeton depuis Internet.

---

### 13. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /attachments/upload-text accepte un `messageId` de corps transmis tel quel jusqu'à prisma.messageAttachment.create, sans vérifier existence, propriété ni participation : on greffe un fichier .txt sur le message de n'importe qui.

**Preuve (extrait)** — La chaîne est exactement celle décrite, sans aucune garde intermédiaire :

1. `services/gateway/src/routes/attachments/upload.ts:255-258` — seule condition d'entrée :
   `if (!authContext || !authContext.isAuthenticated) { return sendUnauthorized(...) }`
2. `upload.ts:260` — `const { content, messageId } = request.body as UploadTextBody;`
   Le schéma Fastify (`upload.ts:228-231`) DÉCLARE `messageId: { type: 'string' }`, donc AJV ne le retire pas.
3. `upload.ts:316-321` — `attachmentService.createTextAttachment(content, userId, isAnonymous, messageId)` : `messageId` n'est jamais relu entre 260 et 316. La seule garde ajoutée depuis (`upload.ts:295-313`) porte sur `allowAnonymousFiles`, pas sur le message.
4. `services/attachments/AttachmentService.ts:142` → `services/attachments/UploadProcessor.ts:739` (`createTextAttachment` passe `messageId` tel quel à `uploadFile`).
5. `services/attachments/UploadProcessor.ts:477` — `const finalMessageId = messageId || null;`
6. `services/attachments/UploadProcessor.ts:485` — `messageId: finalMessageId,` dans `prisma.messageAttachment.create({ …


*Sites :* `MessageProcessor.ts:862`, `packages/shared/prisma/schema.prisma:844`, `routes/attachments/index.ts:52`, `routes/attachments/metadata.ts:185`, `routes/attachments/metadata.ts:321`, `routes/conversations/messages.ts:759`, `routes/uploads/tus-handler.ts:502`, `services/attachments/AttachmentService.ts:142`

**Impact réel** — CONFIRMÉ sur le fond, NUANCÉ sur une seule prémisse.

Ce qu'un attaquant obtient concrètement, par un appel HTTP unique et réel (pas théorique) :

    POST /api/v1/attachments/upload-text
    Authorization: Bearer <JWT de n'importe quel compte valide>
    {"content":"<jusqu'à 10 Mo de texte arbitraire>","messageId":"<ObjectId du message de la victime>"}

→ une ligne `MessageAttachment` est créée avec `messageId` = le message de la victime et `uploadedBy` = l'attaquant. À la prochaine lecture du fil, `routes/conversations/messages.ts:759` renvoie cette pièce jointe DANS le message de la victime, à TOUS les participants de la conversation. L'attaquant n'a pas besoin d'être membre de cette conversation : aucune ligne de code ne regarde l'appartenance. Un participant ANONYME y arrive aussi, dès que son lien porte `allowAnonymousFiles: true`.

Résultat : falsification du contenu d'un message tiers (un fichier `.txt` que la victime n'a jamais envoyé apparaît sous son nom), plus un canal de stockage/diffusion de 10 Mo par appel non attribué à l'attaquant dans l'UI.

LA PART NUANCÉE — deux points, aucun ne sauve la route :

1. « n'importe qui » suppose de CONNAÎTRE l'ObjectId du message visé. Le code ne le vérifie pas, mais l'API ne sert les ids de messages qu'aux membres de la conversation. En pratique : trivial contre quiconque partage une seule conversation avec l'attaquant (y compris un lien public), et contre un fil qu'il a quitté (l'id reste valide, l'appartenance n'est jamais relue). Contre un inconnu strict, il faut deviner un ObjectId 24-hex — partiellement prédictible (timestamp + compteur) mais pas immédiat. Le scénario « conversation à laquelle l'attaquant n'appartient pas » est donc VRAI dès qu'il a vu l'id une fois, pas VRAI en aveugle.

2. `uploadedBy` figure dans `attachmentMediaSelect` (`attachmentIncludes.ts`), donc la divergence expéditeur/uploader est TECHNIQUEMENT visible sur le fil. Mais aucun client ne la compare : l'UI rend la pièce jointe comme partie du message. La donnée est présente, la garde ne l'est pas.

Pas d'exfiltration : c'est un IDOR EN ÉCRITURE (intégrité), pas en lecture.

**Correctif** — Le plus propre : RETIRER `messageId` du schéma de corps de `POST /attachments/upload-text` (`upload.ts:228-231`) et de `UploadTextBody` — aucun client ne l'envoie (`apps/web/services/attachmentService.ts:230` poste `JSON.stringify({ content })` seul, iOS n'appelle pas la route), et le rattachement se fait déjà à la création du message. Si le paramètre doit survivre, poser dans le handler, avant l'appel au service, une garde symétrique de `metadata.ts:185-194` : charger `prisma.message.findUnique({ where: { id: messageId }, select: { senderId: true, conversationId: true, anonymousSenderId: true } })`, rendre 404 s'il n'existe pas, et 403 si l'auteur n'est pas l'appelant (`senderId === authContext.userId`, ou `anonymousSenderId === authContext.participantId` pour un anonyme). Verrouiller par un test négatif qui rougirait au retour de l'interdit — un utilisateur A qui poste `messageId` d'un message de B doit recevoir 403 et laisser `messageAttachment.create` non appelé.

---

### 14. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /api/v1/translate-blocking prend `conversation_id` BRUT sans vérification d'appartenance et, dans le cas « nouveau message » (sans `id`), crée le message en base via handleNewMessage → _saveMessageToDatabase ; le repli `senderId: senderParticipant?.id || senderId` écrit de plus un User.id dans une colonne qui référence Participant.id. Sa jumelle non-bloquante refuserait ce cas.

**Preuve (extrait)** — J'ai cherché à réfuter par le montage, un hook global, un preHandler plus haut, une garde en aval et les tests de régression existants. Rien ne referme le trou.

MONTAGE — la route est bien vivante sur `/api/v1/translate-blocking` :
- services/gateway/src/route-registration.ts:62 `import { translationRoutes as translationBlockingRoutes } from './routes/translation';`
- :180-187 `await fastify.register(translationRoutes); await fastify.register(translationBlockingRoutes); ... }, { prefix: API_PREFIX });`
- :90-91 `const API_VERSION = 'v1'; const API_PREFIX = `/api/${API_VERSION}`;`
Aucune collision de chemin entre les trois modules (`/translate`, `/status/...`, `/conversation/...` vs `/translate-blocking`, `/languages`, `/detect-language`, `/test`), donc pas de FST_ERR_DUPLICATED_ROUTE qui rendrait le code mort.

AUCUNE GARDE GLOBALE — les seuls hooks de portée serveur sont `createDeviceLocaleMiddleware` / `createDeviceCountryMiddleware` (server.ts:521,528), deux `onRequest` de log, `request-id` et `clientMutationId`. Aucun `onRoute`. Aucun ne regarde une conversation.

QUI PEUT …


*Sites :* `middleware/auth.ts:528`, `packages/shared/prisma/schema.prisma:665`, `server.ts:521`, `services/gateway/src/route-registration.ts:62`, `services/gateway/src/routes/translation.ts:436`, `services/gateway/src/server.ts:712`, `services/gateway/src/services/message-translation/MessageTranslationService.ts:279`, `translation-non-blocking.ts:266`

**Impact réel** — Atteignable en pratique par un simple appel HTTP, avec un compte ordinaire :

  POST https://gate.meeshy.me/api/v1/translate-blocking
  Authorization: Bearer <JWT de n'importe quel compte>
  {"text":"...","target_language":"en","conversation_id":"<ObjectId de la conversation visée>"}

Ce que l'attaquant obtient :
1. ÉCRITURE dans n'importe quelle conversation privée dont il connaît l'ObjectId, sans en être membre — jusqu'à 1000 caractères (borne Zod translation.ts:10). Le message est persisté et `lastMessageAt` est bumpé (MessageTranslationService.ts:353-356), donc la conversation remonte en tête de la liste de tous ses membres légitimes.
2. Un ancien membre EXCLU (Participant `isActive: false`) continue d'écrire indéfiniment : le filtre `isActive: true` ne sert qu'à résoudre un id, pas à refuser.
3. Création de conversations arbitraires avec un id choisi (MessageTranslationService.ts:326-339) si l'ObjectId n'existe pas encore — pollution de base, conversation `type: 'group'` sans participants.
4. Corruption référentielle : `senderId` porte un User.id pendant. `sender Participant` étant une relation REQUISE, toute lecture avec `include: { sender: ... }` (routes/messages.ts:299, :683, :798) est très probablement une erreur Prisma « Field sender is required to return data, got null » — ce qui transformerait l'injection en panne de lecture de TOUTE la conversation pour ses membres légitimes. Je n'ai pas pu exécuter la requête contre MongoDB : je donne ce point comme probable, pas comme prouvé ; l'écriture, elle, est prouvée par lecture de code.

Ce qui LIMITE la portée, et pourquoi ce n'est pas « critique » : il faut un compte authentifié (les anonymes sont refusés par `allowAnonymous: false`), et il faut CONNAÎTRE l'ObjectId de la conversation cible — il n'est pas énumérable via cette route. Aucun contenu d'autrui n'est LU par ce chemin (la fuite de lecture, elle, a bien été fermée au commit 2c0f0fccae). Un attaquant qui dispose d'un id — ancien membre, id vu dans un lien de partage, id capté côté client — exploite en une requête.

**Correctif** — Dans services/gateway/src/routes/translation.ts, cas 2 : transformer la résolution de participant en GARDE — `if (!senderParticipant) return sendForbidden(reply, 'Access denied to this conversation');` — et supprimer le repli `|| senderId` de la ligne 463, pour que `senderId` ne puisse porter qu'un `Participant.id`. Mieux : extraire `callerParticipatesIn` de translation-non-blocking.ts:266 vers un module partagé et l'appeler dans les DEUX branches des DEUX routes, la jumelle non-bloquante devant en outre répondre 403 au lieu d'un 200 `processing` trompeur quand le participant est introuvable. Ajouter au fichier translation-blocking-ownership.test.ts un cas `{ text, conversation_id }` avec `participant.findFirst → null` qui exige un refus ET zéro appel à `handleNewMessage` — c'est exactement le témoin qui manquait pour que le correctif 2c0f0fccae voie la branche qu'il laissait ouverte.

---

### 15. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — GET /api/v1/users/email/:email et GET /api/v1/users/phone/:phone sont publiques et rendent « le profil complet », là où leur jumelle authentifiée POST /users/me/contacts/match applique borne, gate de présence et filtre de blocage.

**Preuve (extrait)** — VRAI — aucune authentification, sur les deux routes :
- services/gateway/src/routes/users/profile.ts:1098 et :1202 → `preValidation: [getOptionalAuth(fastify.prisma)]`
- services/gateway/src/routes/users/présence-gate.ts:130-135 → `createUnifiedAuthMiddleware(prisma, { requireAuth: false, allowAnonymous: true })` ; middleware/auth.ts:509 ne rejette que si `options.requireAuth`.
- Montage : routes/users/index.ts:82,84 (`await getUserByEmail(fastify)` / `getUserByPhone`) → route-registration.ts:266 `server.register(userRoutes, { prefix: API_PREFIX })`, API_PREFIX = `/api/v1` (:91). Aucun `addHook('onRequest')` d'auth global dans server.ts (seuls logging client :538, timing :567). Aucune `config.rateLimit` par route.
- Gardes de la jumelle absentes du chemin public : `where: { email }` / `where: { phoneNumber }` sans `isActive`, sans exclusion de blocage (comparer ContactDirectoryService.match + `getBlockedUserIdsAmong`, contacts-match.ts:89-92 `onRequest: [fastify.authenticate]`, borne MAX_CONTACTS_PER_SYNC = 2000, utils/contact-identifiers.ts:24).
- Les tests CONSACRENT l'oracle : …


*Sites :* `__tests__/unit/routes/users/profile.test.ts:1072`, `contacts-match.ts:89`, `middleware/auth.ts:509`, `profile.ts:1083`, `profile.ts:1137`, `route-registration.ts:266`, `routes/auth/register.ts:242`, `routes/users/index.ts:82`

**Impact réel** — Atteignable en pratique par un simple curl, vérifié sur gate.meeshy.me. Ce qu'un attaquant obtient réellement : un ANNUAIRE INVERSÉ. À partir d'une liste d'e-mails ou de numéros (fuite tierce, carnet acheté), il obtient sans compte l'identité civile associée — prénom, nom, pseudo, photo de profil, bannière, bio, rôle, date d'inscription, langues. Ce qu'il n'obtient PAS : l'e-mail/le téléphone en sortie (vidés), les permissions, la présence (masquée par le gate). Le delta de gravité par rapport à l'existant est donc la CLÉ DE RECHERCHE, pas le contenu : le même profil est déjà servi publiquement par GET /u/:username (profile.ts:783, même auth optionnelle), et l'existence d'un e-mail est déjà confirmée publiquement par /auth/check-availability. Ces deux routes sont les seules à joindre « ce numéro » à « cette personne » — dé-anonymisation d'un numéro de téléphone, donnée personnelle au sens RGPD. Deux fuites secondaires réelles et absentes de la jumelle : aucun filtre `isActive` (un compte désactivé reste consultable, `deactivatedAt` servi) et aucun filtre de blocage (un utilisateur bloqué retrouve le profil de qui l'a bloqué, s'il connaît son e-mail ou son numéro). Frein pratique, faible : le rate limiter global (middleware/rate-limiter.ts:61-97) plafonne à 300 req/min, mais keyé sur `request.ip` — sans `trustProxy` derrière Traefik, l'IP est la même 172.x pour tout le monde (le commentaire l'assume), donc le seau est partagé et `skipOnError: true` le rend fail-open sur incident Redis ; l'énumération de masse est ralentie, la recherche ciblée ne l'est pas.

**Correctif** — Poser `onRequest: [fastify.authenticate]` sur `/users/email/:email` et `/users/phone/:phone` (profile.ts:1097 et :1201) — la recherche par identifiant de contact a déjà sa porte authentifiée, POST /users/me/contacts/match, dont les clients iOS/Android/SDK devraient devenir les seuls appelants (UserService.swift:141/157, UserApi.kt:75/81). Si un chemin public doit survivre pour l'onboarding, l'aligner sur la jumelle : `where` restreint aux comptes actifs, exclusion des relations de blocage, et un rate limit DÉDIÉ par route (`config: { rateLimit: ... }`) keyé sur autre chose que `request.ip`, qui est constante derrière Traefik. Ajouter une garde de test négative asserting 401 sans jeton — les tests actuels (profile.test.ts:1072) consacrent aujourd'hui l'inverse.

---

### 16. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — GET /api/v1/me/delete-account/{confirm,cancel,delete-now} sont trois routes PUBLIQUES et MUTANTES en GET, sans preHandler d'auth, secret en query string, sans TTL — un pré-chargeur de lien déclenche l'effet, et sur /delete-now cet effet est la suppression du compte.

**Preuve (extrait)** — MÉCANISME — CONFIRMÉ intégralement.
Montage : `services/gateway/src/route-registration.ts:269` → `await server.register(meRoutes, { prefix: `${API_PREFIX}/me` })` ; `routes/me/index.ts:23` → `await fastify.register(deleteAccountRoutes)` (aucun préfixe). Chemin public reconstitué : `/api/v1/me/delete-account/{confirm,cancel,delete-now}`.

Absence d'auth : la sœur authentifiée pose bien la garde — `delete-account.ts:38` `preValidation: [fastify.authenticate]` sur `DELETE /delete-account`. Les trois GET ne portent QUE la validation de forme : `:157`, `:213`, `:274` → `preHandler: [validateQuery(TokenQuerySchema)]`, où `TokenQuerySchema = z.object({ token: z.string().min(1) })` (`validation/delete-account-schemas.ts`).

Réfutations cherchées et tombées :
- Fuite de hook depuis la sœur : `routes/me/preferences/index.ts:55` fait `fastify.addHook('preHandler', authMiddleware)` — mais `userPreferencesRoutes` n'est PAS enveloppé dans `fastify-plugin` (grep `fp(`/`fastify-plugin` sur les quatre fichiers de `routes/me/` : zéro occurrence). Le hook reste encapsulé dans l'enfant `/preferences` …


*Sites :* `MaintenanceService.ts:412`, `MaintenanceService.ts:731`, `__tests__/unit/routes/me-delete-account.test.ts:478`, `apps/ios/Meeshy/Features/Main/Views/DeleteAccountView.swift:254`, `delete-account.ts:38`, `middleware/clientMutationId.ts:58`, `packages/shared/prisma/schema.prisma:3624`, `request-id.ts:15`

**Impact réel** — Atteignable en pratique par un simple appel HTTP, sans en-tête : trois mutations d'état déclenchées par une requête GET dépourvue de tout effet de bord assumé. Le porteur du jeton est le seul facteur — et ce jeton arrive dans la boîte de la victime, donc la menace réaliste est un pré-chargeur non humain sur le trajet de son courrier (antivirus, Safe Links, prefetch), pas un attaquant distant qui choisirait sa cible.

Le dommage le plus grave n'est PAS sur /delete-now mais sur /confirm, contrairement à ce que dit le constat. Un utilisateur qui lance la suppression depuis l'app puis se ravise et ne clique rien croit avoir tout arrêté : un scanner qui suit le lien pose `status: 'CONFIRMED'` + `gracePeriodEndsAt` à J+90 (`:171-181`), et RIEN ne le prévient — aucun e-mail n'est émis entre la confirmation et l'expiration. Quatre-vingt-dix jours plus tard, le job de maintenance désactive le compte et déconnecte toutes ses sessions. Un consentement destructeur a été fabriqué par une machine.

Sur /delete-now, le dommage réel est la perte DÉFINITIVE du recours : `cancel` n'accepte que `PENDING_EMAIL_CONFIRMATION | CONFIRMED | GRACE_PERIOD_EXPIRED` (`:227`) et rejette `COMPLETED`. L'e-mail de rappel hebdomadaire contient les DEUX liens (`EmailService.ts:1544` et `:1565`) : un pré-chargeur qui les suit dans l'ordre du document atteint le rouge « supprimer maintenant » et scelle la désactivation avant que l'utilisateur n'ait lu quoi que ce soit. Rien n'est effacé — mais plus rien n'est récupérable en libre-service.

Sur /cancel, l'effet est bénin quant aux données mais consomme le jeton (`cancelTokenHash: 'used'`), donc l'ordre de visite du scanner décide de l'issue.

Enfin, la régénération hebdomadaire (`MaintenanceService.ts:781-796`) rejoue ce tirage tous les sept jours, avec des jetons neufs, tant que la demande reste en `GRACE_PERIOD_EXPIRED` : ce n'est pas un coup de dé unique.

**Correctif** — Faire du GET une page de CONSENTEMENT et non un effet : que `/confirm`, `/cancel` et `/delete-now` ne fassent en GET que valider le jeton et rendre un formulaire, l'écriture ne se produisant que sur le POST correspondant (un pré-chargeur n'émet jamais de POST) — c'est le seul correctif qui neutralise la classe entière. Ajouter au modèle `AccountDeletionRequest` un `tokenExpiresAt: DateTime?` vérifié dans les deux lookups (`:169`, `:286`), afin qu'un lien mort le soit vraiment. Et cesser de transporter le secret en query : le poser en corps de POST, ou à défaut le retirer de la ligne journalisée en `server.ts:581`.

---

### 17. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — Révoquer une session ne déconnecte personne : DELETE /auth/sessions, DELETE /auth/sessions/:sessionId et POST /auth/logout passent isValid:false sans jamais appeler disconnectRevokedSessions ; le SEUL site qui l'appelle est le lien d'urgence « ce n'était pas moi », dont l'URL est en 404 (route '/auth/revoke-all-sessions' sur une instance déjà préfixée '/api/v1/auth').

**Preuve (extrait)** — PART VRAIE 1 — le 404 est PROUVÉ MÉCANIQUEMENT, pas déduit.
- `services/gateway/src/route-registration.ts:190` : `await server.register(authRoutes, { prefix: `${API_PREFIX}/auth` })`, avec `route-registration.ts:91` : `const API_PREFIX = `/api/${API_VERSION}``.
- `services/gateway/src/routes/auth/revoke-all-sessions.ts:17` : `'/auth/revoke-all-sessions'` — SEULE route du module à re-préfixer. Ses onze voisines déclarent nu : `login.ts:43 '/login'`, `login.ts:308 '/logout'`, `magic-link.ts:456 '/sessions'`, `magic-link.ts:512 '/sessions/:sessionId'`, `magic-link.ts:576 '/sessions'`, `register.ts:30 '/register'`.
- Preuve indépendante d'une lecture de source : `services/gateway/src/__tests__/security/route-auth-coverage.test.ts:389` énumère les routes RÉELLEMENT enregistrées par `registerAllRoutes` via le hook `onRoute` de Fastify, et liste `{ method: 'GET', url: '/api/v1/auth/auth/revoke-all-sessions', why: '... chemin réel dupliqué "/auth/auth" — bug fonctionnel documenté dans l'audit ...' }`. Le chemin doublé est donc celui de la table de routage assemblée.
- URL postée : …


*Sites :* `.../auth/revoke-all-sessions.test.ts:71`, `__tests__/unit/routes/auth-revoke-all-sessions.test.ts:62`, `login.ts:308`, `login.ts:43`, `magic-link.ts:456`, `magic-link.ts:512`, `magic-link.ts:576`, `middleware/auth.ts:126`

**Impact réel** — Atteignable en pratique par un simple GET, pas seulement en théorie.

1) Lien d'urgence mort (le cœur du constat, CONFIRMÉ). À chaque connexion depuis un appareil non trusté, la victime reçoit un message contenant `https://gate.meeshy.me/api/v1/auth/revoke-all-sessions?token=…`. Cliquer rend 404 : aucune ligne `UserSession` n'est invalidée, aucun socket n'est coupé, et l'utilisateur qui vient de voir « connexion depuis un appareil inconnu » n'a AUCUN retour d'erreur exploitable — il croit raisonnablement avoir agi. L'intrus garde et son JWT et son socket. Le jeton signé est valable 24h et se périme sans avoir jamais servi.

2) Révocation par session sans effet sur le temps réel (CONFIRMÉ, mais moins grave que présenté). Un appareil « révoqué » depuis l'écran Sessions garde son socket dans `ROOMS.user(userId)` et continue de recevoir `message:new`, `conversation:updated`, etc., indéfiniment — l'authentification socket ne relit jamais `UserSession`. À noter : ce n'est pas un contournement complet, la révocation ne casse de toute façon pas le JWT (valable jusqu'à expiration), donc la fenêtre est celle du JWT, pas « indéfiniment » côté REST.

3) Ce que le constat SURESTIME. « La seule révocation qui coupe réellement les sockets est celle dont l'URL est fausse » est faux : `POST /api/v1/auth/reset-password` (chemin correct, atteignable, `password-reset.ts:306`) coupe bien tous les sockets, tout comme la suppression de compte et les deux chemins admin. Le parcours d'urgence n'est donc pas entièrement cassé — il l'est sur sa porte à un clic ; la porte « changer mon mot de passe » fonctionne. C'est ce qui fait passer le verdict de CONFIRME à NUANCE, et ce qui doit descendre la sévérité d'un cran par rapport à « parcours d'urgence CASSÉ ».

**Correctif** — Remplacer `'/auth/revoke-all-sessions'` par `'/revoke-all-sessions'` dans `routes/auth/revoke-all-sessions.ts:17` (alignement sur ses onze voisines), et retirer l'entrée `/api/v1/auth/auth/revoke-all-sessions` de `route-auth-coverage.test.ts:389` au profit du chemin simple — cette liste étant construite sur la table de routage réelle, elle devient le témoin qui rougit si le doublon revient ; les tests unitaires, qui montent la route sur une app nue, ne peuvent pas jouer ce rôle. Pour la révocation par session, ne PAS brancher `disconnectRevokedSessions` sur `DELETE /sessions*` (cela déconnecterait l'appareil appelant) : faire d'abord porter l'identifiant de session par la poignée de main socket et le stocker sur `SocketUser`, afin qu'une coupure ciblée devienne possible — c'est une issue à part entière, pas un ajout d'appel.

---

### 18. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /auth/refresh accepte un JWT authentique mais EXPIRÉ (ignoreExpiration) et rend un JWT neuf, sans exiger de jeton de session et sans aucune liste de révocation, ni rate limiter.

**Preuve (extrait)** — VRAI — route publique, JWT expiré accepté, session facultative :
- services/gateway/src/route-registration.ts:190 — `await server.register(authRoutes, { prefix: `${API_PREFIX}/auth` });` (API_PREFIX = `/api/v1`, route-registration.ts:91) ⇒ chemin réel `POST /api/v1/auth/refresh`.
- services/gateway/src/routes/auth/magic-link.ts:114 — `fastify.post('/refresh', {` … magic-link.ts:135 `security: []` — AUCUN `preValidation`, contrairement à `/me` (magic-link.ts:56) et `DELETE /sessions` (magic-link.ts:604 `preValidation: [fastify.authenticate]`). Aucun hook global d'auth : les seuls `addHook('onRequest')` de server.ts (538, 567) ne font que du logging/timing.
- magic-link.ts:158 — `decoded = jwt.verify(token, authService['jwtSecret'], { ignoreExpiration: true }) as {...}` ; aucun `maxAge`, aucune lecture de `exp`/`iat` en aval ⇒ un JWT expiré depuis n'importe quelle durée est accepté.
- packages/shared/utils/validation.ts:468-471 — `refreshToken: z.object({ token: z.string().min(1), sessionToken: z.string().optional() })` ; magic-link.ts:188-198 — `let activeSession = null; if …


*Sites :* `AuthService.ts:682`, `AuthService.ts:734`, `auth.ts:17`, `auth.ts:323`, `auth.ts:337`, `magic-link.ts:135`, `magic-link.ts:158`, `magic-link.ts:188`

**Impact réel** — Atteignable en pratique par UN appel HTTP non authentifié : `curl -X POST https://gate.meeshy.me/api/v1/auth/refresh -d '{"token":"<JWT volé, même expiré>"}'` rend `data.token` (JWT neuf 24 h) + le profil complet de la victime. L'attaquant n'a besoin ni du mot de passe, ni du sessionToken, ni d'un cookie ; il lui suffit de rejouer l'appel une fois par 24 h pour conserver un accès permanent. Ni `POST /logout`, ni `DELETE /sessions`, ni `DELETE /sessions/:id`, ni le lien e-mail `revoke-all-sessions` n'y changent quoi que ce soit : ils n'écrivent que des lignes `UserSession`, que l'authentification par Bearer JWT ne lit jamais. Le vecteur d'entrée reste le vol d'un JWT authentique (pas de forge : la signature est vérifiée, magic-link.ts:172-181 + test magic-link.test.ts:389), donc ce n'est pas une escalade autonome. Deux clauses du constat sont à corriger avant publication : (1) un rate limiter global 300 req/min/IP s'applique bien — sans effet protecteur ici, l'attaque coûte 1 requête, mais l'affirmation est fausse ; (2) « il n'existe aucun moyen de couper un accès compromis » est trop fort — passer `User.isActive = false` coupe /refresh ET les requêtes en cours sous 60 s ; ce coupe-circuit existe, il n'est simplement exposé par aucun geste de gestion de sessions côté utilisateur.

**Correctif** — Donner au JWT une épreuve d'invalidation : ajouter un `User.tokenEpoch` (ou `sessionsRevokedAt`) incrémenté par `logout`, `revokeAllSessionsExceptCurrent`, `revokeSession` et le lien d'urgence, l'estampiller dans le payload de `AuthService.generateToken` et le comparer à la fois dans `createRegisteredUserContext` (middleware/auth.ts, avant le cache `auth:user:`) et dans `/refresh`. Dans le même mouvement, borner la tolérance d'expiration (`jwt.verify(..., { ignoreExpiration: true })` puis refus explicite si `exp` a plus de N jours — la fenêtre du sliding window, pas l'infini) et poser un `config: { rateLimit: { max, timeWindow, keyGenerator: userId } }` sur la route, comme le fait déjà `revoke-all-sessions.ts:30`.

---

### 19. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /auth/login/2fa n'a aucun preHandler ni rate limiter, et ni AuthService.completeAuthWith2FA ni TwoFactorService ne comptent les tentatives — même constat sur /auth/2fa/verify et /auth/2fa/backup-codes ; TOTP et codes de secours sont donc bruteforçables au rythme du seau global (partagé et inerte).

**Preuve (extrait)** — PART VRAIE — la route de connexion 2FA est nue :
- `services/gateway/src/routes/auth/login.ts:195-232` — `fastify.post<{ Body: TwoFactorRequestBody }>('/login/2fa', { schema: {...}, security: [] }, async (request, reply) => {...})`. Aucune clé `preHandler`, `preValidation` ni `config.rateLimit` dans l'objet d'options. À comparer avec `/login` juste au-dessus, `login.ts:98` : `preHandler: [loginRateLimiter.middleware(), authGlobalRateLimiter.middleware()]`.
- Montage : `route-registration.ts:190` `server.register(authRoutes, { prefix: `${API_PREFIX}/auth` })` ⇒ URL réelle `/api/v1/auth/login/2fa`. Confirmé par la garde d'auth elle-même, `__tests__/security/route-auth-coverage.test.ts:365` qui la classe en PUBLIC_ROUTES (« aucune session au moment de cet appel »).
- Aucun compteur, aucun verrou, aucune invalidation du jeton après échec — `services/AuthService.ts:411-414` :
  `if (!isValid) { logger.warn(...); return { success: false, error: 'Code 2FA invalide' }; }`
  Le jeton reste servi par `AuthService.ts:331-336` (`phoneVerificationCode: tokenHash, phoneVerificationExpiry: { gt: …


*Sites :* `AuthService.ts:226`, `AuthService.ts:331`, `AuthService.ts:390`, `__tests__/security/route-auth-coverage.test.ts:365`, `docker-compose.prod.yml:327`, `login.ts:98`, `middleware/rate-limiter.ts:63`, `route-registration.ts:190`

**Impact réel** — Atteignable par un vrai appel HTTP, mais seulement pour un attaquant qui détient DÉJÀ le mot de passe de la victime. Il fait `POST /api/v1/auth/login` (dont le limiteur 5/15min est inerte, cf. ci-dessus), récupère un `twoFactorToken` valide 5 min, puis martèle `POST /api/v1/auth/login/2fa` : aucune authentification, aucun compteur, aucune invalidation du jeton après échec, aucun verrouillage de compte, et le jeton se renouvelle à volonté. Le seul plafond est le seau global de 300 req/min — partagé par TOUTE la plateforme, donc l'attaquant à plein régime met le service en 429 pour tout le monde (bruyant, mais c'est un plafond réel, pas l'absence de plafond que le constat décrit).

Chiffré honnêtement :
- TOTP : espace 10^6, `window: 1` (`AuthService.ts:386`) ⇒ 3 codes acceptés par essai. Espérance ≈ 333 000 essais ⇒ ≈ 19 h à 300 req/min soutenues. Le second facteur est donc réellement défait en un à deux jours, sans qu'aucun échec ne soit compté ni alerté (un `logger.warn` par essai, sans seuil).
- Codes de secours : la partie « surtout les codes de SECOURS sont bruteforçables » est FAUSSE. `TwoFactorService.ts:80` — alphabet de 32 caractères, `BACKUP_CODE_LENGTH = 8` ⇒ 32^8 ≈ 1,1×10^12, avec 10 codes vivants ⇒ ≈ 1,1×10^11 essais espérés, soit des centaines de milliers d'années à 300 req/min. Ils ne sont pas la voie d'entrée.
- `/auth/2fa/verify` et `/auth/2fa/backup-codes` : hors du chemin de connexion. Il faut déjà un JWT de la victime. Le manque de compteur y reste un défaut (un attaquant tenant une session volée peut deviner le TOTP pour régénérer les codes de secours et se donner de la persistance, `two-factor.ts:341`), mais ce n'est pas un contournement du second facteur et le classer « même constat » gonfle la trouvaille.

**Correctif** — Poser sur `/login/2fa` (routes/auth/login.ts:195) un limiteur clé sur le `twoFactorToken` ET sur l'identifiant du compte, pas sur `request.ip` — et surtout compter les échecs DANS `AuthService.completeAuthWith2FA` : invalider le `twoFactorToken` (mise à `null` de `phoneVerificationCode`/`phoneVerificationExpiry`) après N échecs (5 suffit), ce qui force un nouveau `/login` et rend le brute-force impossible quel que soit le débit réseau. Corriger en même temps les deux défauts d'infrastructure qui rendent tout limiteur IP illusoire : activer `trustProxy` sur l'instance Fastify (`server.ts:196` et `:215`) pour que `request.ip` soit l'IP cliente, ce qui désinerte `isLocalIp` (`utils/rate-limiter.ts:223`) et désolidarise le seau global partagé. Ajouter un compteur d'échecs 2FA persisté sur `User` pour permettre une alerte, et appliquer la même garde à `/auth/2fa/verify` et `/auth/2fa/backup-codes` (défaut moindre, post-authentification).

---

### 20. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /conversations/join/:linkId ne teste que isActive et expiresAt : maxUses, maxConcurrentUsers, maxUniqueSessions, allowedCountries, allowedLanguages, allowedIpRanges sont écrits à la création et ignorés à la jointure (currentUses incrémenté sans jamais être comparé à maxUses). Sur POST /anonymous/join/:linkId, les deux restrictions évaluées sont décoratives : extractCountryFromIP() est une simulation qui devine le pays au premier octet et retombe sur 'FR', et allowedIpRanges est comparé à l'IP du proxy.

**Preuve (extrait)** — PARTIE VRAIE — la porte AUTHENTIFIÉE. `services/gateway/src/routes/conversations/sharing.ts:417` monte `fastify.post('/conversations/join/:linkId')` (chaîne de montage vérifiée : `routes/conversations/index.ts:42` → `route-registration.ts:34/206`, préfixe `/api/v1` — donc `POST /api/v1/conversations/join/:linkId`). Les SEULES gardes du handler sont :
  `sharing.ts:474  if (!shareLink.isActive) { return sendError(reply, 410, ...) }`
  `sharing.ts:478  if (shareLink.expiresAt && shareLink.expiresAt < new Date()) { ... }`
puis `resolveConversationEntry` (closed / banned / already-member). Un `grep` non-test sur `maxUses|maxConcurrentUsers|maxUniqueSessions|allowedCountries|allowedLanguages|allowedIpRanges` ne rend AUCUNE occurrence dans `sharing.ts` en dehors de la CRÉATION (`sharing.ts:243`, `:251-253`) et de la sérialisation. Le compteur part quand même :
  `sharing.ts:573-576  await prisma.conversationShareLink.update({ where: { id: shareLink.id }, data: { currentUses: { increment: 1 } } })`
et le test `conversation-sharing.test.ts:706` (« joins successfully and increments usage …


*Sites :* `__tests__/unit/routes/anonymous.test.ts:123`, `anonymous.ts:232`, `anonymous.ts:276`, `anonymous.ts:280`, `anonymous.ts:288`, `anonymous.ts:303`, `anonymous.ts:310`, `anonymous.ts:428`

**Impact réel** — Atteignable par un simple appel HTTP, aujourd'hui, en production.

1. Contournement de maxUses sur la porte authentifiée. `POST /api/v1/conversations/join/:linkId` avec un `Authorization: Bearer` valide, sur un lien créé avec `maxUses: 1` et `currentUses` déjà à 5 000 → 200, ligne `Participant` active, room socket rejointe, message système d'arrivée. Le « lien à usage unique » proposé par le formulaire web (`link-edit-modal.tsx:150`, `LinkSettingsSection.tsx:106`) n'a aucune contrepartie serveur pour un compte. Nuance de portée : `already-member` rend 200 sans incrémenter, donc UN compte ne gonfle pas le compteur — il faut des comptes DISTINCTS (l'inscription est ouverte), ce qui est exactement la population que la restriction vise. Même chose pour `maxConcurrentUsers`, `allowedLanguages` (un lien réservé aux francophones est joignable par n'importe quel compte) et `allowedCountries` (aucun géo-filtrage pour un compte).

2. maxUniqueSessions n'est appliqué sur AUCUNE des deux portes — il est écrit, incrémenté, affiché (`link-summary-modal.tsx:177`) et jamais comparé.

3. Géo/IP côté anonyme : le contrôle n'est pas seulement contournable, il est ARBITRAIRE dans les deux sens. Derrière Traefik, `request.ip` vaut `172.x` pour tout le monde ⇒ `extractCountryFromIP` rend `'DE'` pour tous (172 ∈ [151,200]). Un lien restreint à `['FR']` REFUSE tous les visiteurs légitimes (403 « Accès non autorise depuis votre region ») ; un lien restreint à `['DE']` les admet TOUS, quel que soit leur pays réel. Idem pour `allowedIpRanges` : la plage bureau du créateur refuse tout le monde, une plage couvrant `172.16/12` admet tout le monde. Aucun de ces réglages ne dépend de l'IP réelle du visiteur.

4. Nuance sur « la promesse faite dans l'UI ». Elle est exacte pour `maxUses` (présent dans les formulaires de création ET d'édition). Elle est plus indirecte pour la géo/IP : `allowedCountries` / `allowedIpRanges` ne sont réglables par AUCUN formulaire client (uniquement via `POST /links` — `routes/links/creation.ts:322-324` — et `PATCH` — `links/management.ts`) ; le web et iOS se contentent de les AFFICHER comme si elles étaient appliquées (`conversation-links-section.tsx:291-295`, …

**Correctif** — Extraire un prédicat UNIQUE `evaluateShareLinkAdmission({ shareLink, clientIp, country, language })` appelé par les DEUX portes (`sharing.ts:417` et `anonymous.ts:122`), couvrant `maxUses`, `maxConcurrentUsers`, `maxUniqueSessions`, `allowedCountries`, `allowedLanguages`, `allowedIpRanges` — la porte authentifiée n'en applique aujourd'hui aucun, et `maxUniqueSessions` n'est appliqué nulle part ; rendre l'incrément atomique (`updateMany({ where: { id, OR: [{ maxUses: null }, { currentUses: { lt: maxUses } }] }, data: { currentUses: { increment: 1 } } })` et refuser si `count === 0`) pour fermer la course read-then-write. Pour la géo/IP : activer `trustProxy` sur les deux instanciations de `server.ts` (avec la liste des proxys de confiance) afin que `request.ip` soit l'IP réelle, et remplacer la simulation `extractCountryFromIP` par un vrai résolveur (MaxMind/IP2Location) — tant que ce n'est pas fait, RETIRER `allowedCountries`/`allowedIpRanges` de l'API et de l'affichage plutôt que de les montrer comme appliqués, un contrôle décoratif étant pire qu'un contrôle absent.

---

### 21. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — POST /api/v1/conversations/:id/new-link est la porte la plus large du système et la SEULE sans rang : n'importe quel membre actif crée un lien public avec allowAnonymousMessages / allowAnonymousImages / allowViewHistory à TRUE par défaut, alors que toutes ses voisines (invite, add, ban, rights, remove) exigent MODERATOR ou ADMIN — et alors que la porte concurrente POST /links, celle que les trois clients utilisent réellement, est mieux gardée.

**Preuve (extrait)** — VRAI — l'absence de rang et les défauts ouverts :
services/gateway/src/routes/conversations/sharing.ts:213-217 — « Pour tous les autres types de conversations (group, public, etc.), n'importe qui ayant accès à la conversation peut créer des liens / L'utilisateur doit juste être membre de la conversation (déjà vérifié plus haut) ». Seuls `direct` (203) et `global` (208, BIGBOSS) sont gardés ; aucun `actorHasMinimumRole` sur le chemin `group`.
sharing.ts:245-250 — `allowAnonymousMessages: body.allowAnonymousMessages ?? true` · `allowAnonymousImages: … ?? true` · `allowViewHistory: body.allowViewHistory ?? true`.
La chaîne jusqu'au secret : anonymous.ts:400 `canViewHistory: shareLink.allowViewHistory` (le participant anonyme est créé sans aucun contrôle du TYPE de conversation), puis services/historyFloor.ts:141 `if (!link || link.allowViewHistory) return null;` — pas de plancher ⇒ historique INTÉGRAL.
Voisines, toutes gardées : sharing.ts:770-776 invite → `MemberRole.ADMIN` ; participants.ts:1142 add → MODERATOR ; 1457 remove → MODERATOR ; 1711 rôle → ADMIN ; ban.ts:239.
Asymétrie la …


*Sites :* `MeeshySDK/Services/ShareLinkService.swift:87`, `__tests__/unit/routes/conversation-sharing.test.ts:269`, `anonymous.ts:400`, `apps/web/services/conversations/links.service.ts:56`, `ban.ts:239`, `conversations/index.ts:41`, `creation.ts:314`, `links/creation.ts:329`

**Impact réel** — Atteignable en pratique par un simple appel HTTP : tout utilisateur authentifié, membre ordinaire (`role: 'member'`, plateforme `USER`) d'un groupe PRIVÉ, fait `POST /api/v1/conversations/<id>/new-link` avec un corps vide et obtient une URL `/chat/mshy_…`. Quiconque possède cette URL rejoint sans compte (`POST /anonymous/join`) et lit l'HISTORIQUE COMPLET du groupe (aucun plancher, historyFloor.ts:141), peut écrire et poster des images. Aucune notification n'est émise ; la seule découverte possible est qu'un modérateur aille lister `GET /conversations/:id/links` — donc « personne ne l'apprend » est vrai au sens du signal poussé, faux au sens « indécouvrable ».

Ce que le constat rate, et qui change le correctif : fermer new-link ne protégerait RIEN. Le même membre obtient exactement le même lien, avec exactement les mêmes défauts, par `POST /api/v1/links {"conversationId": "<id>"}` — porte utilisée, elle, par iOS. Il n'y a pas « une porte orpheline mal gardée à côté d'une porte gardée » : il y a UNE politique (membre actif suffit) écrite DEUX fois. Nuance de portée, aussi : « la porte la plus large du système » est faux au sens comparatif — /links est aussi large et, sur `global`, plus large. Et « orpheline » est à moitié vrai : `createInviteLink` n'a aucun appelant d'UI (seulement des tests), mais le point de terminaison reste servi et joignable.

**Correctif** — Poser la règle UNE fois — un prédicat partagé (p. ex. `mayMintShareLink(actor, conversation)` à côté de `actorHasMinimumRole`) exigeant `MemberRole.MODERATOR` pour tout type non `public`, et l'appeler depuis les DEUX sites (sharing.ts:213 et links/creation.ts:179) : corriger new-link seul laisse la fuite entière derrière `/links`. Basculer `allowViewHistory` à `?? false` aux deux endroits, pour l'aligner sur le `canViewHistory: false` que reçoit déjà un membre inscrit invité par un ADMIN (sharing.ts:840) — un anonyme ne doit pas naître plus privilégié qu'un invité. Enfin faire émettre à new-link la même notification aux admins/créateur que links/creation.ts:329, et ajouter un témoin NÉGATIF (membre simple sur un `group` ⇒ 403) aux deux suites, faute de quoi le test actuel de conversation-sharing.test.ts continuera de graver la politique ouverte.

---

### 22. 🟠 Élevé — nuancé

**Constat soumis à réfutation** — GET /api/v1/conversations/:id/analysis sert à tout membre ordinaire les profils psychométriques nominatifs des autres participants (traits notés, personaSummary, sentimentScore, relationshipMap, 90 j d'instantanés), sans gate de rang, sans opt-out, avec `locked` servi mais non appliqué, trois requêtes Prisma sans `select` et aucun schéma 200.

**Preuve (extrait)** — Le cœur du constat est CONFIRMÉ, ligne à ligne :

- `services/gateway/src/routes/conversations/core.ts:2136` — `fastify.get('/conversations/:id/analysis', …)`, monté par `routes/conversations/index.ts:37` (`registerCoreRoutes`) sous `prefix: API_PREFIX` (`route-registration.ts:204-207`, `API_PREFIX = /api/v1` l.91) ⇒ l'URL publique `/api/v1/conversations/:id/analysis` est exacte.
- `core.ts:2155` : `preValidation: [requiredAuth]` — l'UNIQUE garde. `requiredAuth` = `createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false })` (`index.ts:31-34`). Aucun `addHook` global n'ajoute d'autorisation (les seuls hooks du serveur sont clientMutationId, request-id, device-locale/country, conditionalGet — `server.ts:326,521,528,538,567`).
- `core.ts:2167` : `canAccessConversation(...)` — sa seule règle est l'appartenance ACTIVE : `prisma.participant.findFirst({ where: { conversationId, userId, isActive: true } })` (`utils/access-control.ts:74-160`). Zéro lecture de `participant.role`, zéro lecture de `registeredUser.role`. Un membre ORDINAIRE passe.
- `core.ts:2199-2213` : …


*Sites :* `agent.ts:660`, `core.ts:2148`, `core.ts:2155`, `core.ts:2167`, `core.ts:2172`, `core.ts:2199`, `core.ts:2224`, `cron/daily-snapshot.ts:31`

**Impact réel** — Atteignable en pratique par un simple appel HTTP, pas seulement en théorie : `curl -H 'Authorization: Bearer <JWT d'un membre quelconque>' https://gate.meeshy.me/api/v1/conversations/<id>/analysis`. Le retour donne, pour CHAQUE autre participant de la conversation, nommé (`username`, `displayName`, `avatar`) : un résumé de personnalité en clair (`personaSummary`), jusqu'à 27 traits notés dont assertivité, agréabilité, stabilité émotionnelle, sensibilité, réponse au stress, style de conflit, niveau de confiance ; les émotions dominantes ; un `sentimentScore` ; et la `relationshipMap` — un champ JSON généré par LLM qui dit ce que A pense de B (`{ attitude, score, detail }`, `observer.ts:211-219`), donc du texte libre sur les relations entre tiers, servi entier faute de schéma. Plus 90 jours d'instantanés quotidiens (`history[]`) donnant la SÉRIE TEMPORELLE nominative sentiment/positivité/assertivité de chacun. Ces trois clients l'affichent déjà à tout membre inscrit (iOS `ConversationDashboardView.swift:67`, mode « Résumé » ouvert à toute identité enregistrée — `ReadingModeOrchestrator.swift:389` ; Android `ParticipantProfileProjection.kt:138` `analysis.participantProfiles.map(::profile)`, aucun filtre sur le lecteur). Rayon de tir maximal sur la conversation globale « meeshy », dont `canAccessConversation` autorise tout membre (`access-control.ts:81-97`). Le sujet profilé n'a aucun moyen de le savoir ni de le refuser. Ce n'est pas une fuite accidentelle de sérialisation : c'est la charge que le handler compose délibérément — l'absence de schéma 200 la laisse simplement passer sans aucune gouvernance et rend invisible aux cliquets tout champ psychométrique ajouté demain.

**Correctif** — Restreindre `participantProfiles` au lecteur lui-même (`where: { conversationId, userId: caller }`) et n'ouvrir la vue complète qu'au rang qui la garde déjà côté admin (`requireAgentAdmin`, BIGBOSS/ADMIN) ou, si le produit veut la maintenir aux membres, à l'ADMIN de la conversation via `resolveCallerParticipant().role`, avec un consentement explicite par utilisateur (champ `agentProfilingConsentAt`, à côté des consentements GDPR déjà présents) — même filtre à appliquer à `history[].participantSnapshots`, qui porte les mêmes scores nominatifs. Déclarer ensuite un schéma `200` complet (les Json `relationshipMap` / `participantSnapshots` en `additionalProperties` explicites) et poser une garde de source interdisant qu'une route de conversation serve `trait*` / `sentimentScore` / `relationshipMap` d'un tiers, puisque le balayage existant est aveugle à un 200 absent. Ajouter les `select` aux trois requêtes est utile (coût, dérive future) mais n'est pas le correctif de sécurité ; ne pas passer par `locked`, qui ne signifie pas ce que le constat suppose.

---

### 23. 🟡 Moyen — **confirmé**

**Constat soumis à réfutation** — PUT/PATCH /api/v1/me/préférences/application écrit les cinq horodatages de consentement dans le blob de préférences, et ConsentValidationService les relit avec PRIORITÉ sur les colonnes User.*ConsentAt — le consentement en cours de validation satisfait sa propre exigence dans la même requête.

**Preuve (extrait)** — 1) Le schéma AUTORISE explicitement l'écriture — packages/shared/types/préférences/application.ts:49-57 : `dataProcessingConsentAt: z.iso.datetime({offset:true}).nullable().optional()` (+ voiceData, voiceProfile, voiceCloningConsentAt, voiceCloningEnabledAt), avec le commentaire « Écrits par les clients via la MÊME API préférences […] Sans ces clés, Zod (mode strip) les supprimait silencieusement ». Ce n'est donc pas un oubli de strip : c'est une décision.
2) Le chemin d'écriture est nu — préférence-router-factory.ts:~305 `submittedKeysOnly(schema.partial().parse(request.body), request.body)` puis `merged = {...resolveComplete(userId), ...validated}` puis `userPreferences.upsert({ update: { [category]: merged } })`. Le body Fastify est déclaré `body: { type: 'object' }` (pas d'`additionalProperties:false`), et l'ajv du serveur (server.ts:204/219) n'ajoute que `strict:'log'` — rien ne filtre. Montage reconstitué : route-registration.ts:269 `${API_PREFIX}/me` → me/index.ts:21 `/preferences` → préférences/index.ts `prefix:'/application'` = PATCH /api/v1/me/préférences/application.
3) …


*Sites :* `ConsentValidationService.ts:92`, `MessageTranslationService.ts:2439`, `__tests__/ConsentValidationService.test.ts:305`, `me/index.ts:21`, `packages/shared/types/preferences/application.ts:49`, `route-registration.ts:269`, `routes/attachments/translation.ts:176`, `server.ts:204`

**Impact réel** — Atteignable en pratique par UN appel HTTP authentifié : `PATCH /api/v1/me/preferences/application` avec les cinq clés datées à volonté (y compris antidatées) → le blob est persisté verbatim, et toute décision de ConsentValidationService bascule à « accordé » pour ce compte, colonnes User restant nulles.

Ce que l'utilisateur obtient RÉELLEMENT, et ce qu'il n'obtient pas — le « POURQUOI ON LE CROIT GRAVE » surestime sur un point qu'il faut dire avant publication :
- Il n'obtient AUCUNE capacité nouvelle. `POST /api/v1/voice-profile/consent {voiceRecordingConsent:true, voiceCloningConsent:true}` est une route self-service authentifiée sans autre garde (voice-profile.ts:51) qui accorde déjà toute la chaîne, avec horodatage SERVEUR. Le consentement est le sien : il n'y a ici ni escalade inter-utilisateur ni accès aux données d'autrui. Le clonage effectif exige en outre que la cible possède déjà un `UserVoiceModel` (AttachmentTranslateService._getVoiceProfile:572 rend null sinon).
- Le délit réel est d'INTÉGRITÉ et de RÉVOCATION, et il est entier : (a) l'horodatage légalement opposable est choisi par le client, donc sans valeur probante ; (b) une révocation via `POST /voice-profile/consent {voiceCloningConsent:false}` ou `DELETE /voice-profile` (qui « reset les consent flags à null ») laisse le blob intact et le pipeline continue de répondre `canUseVoiceCloning: true` — le consentement est ÉPINGLÉ à « accordé » de façon invisible ; (c) l'écran de consentement (GET /voice-profile/consent, qui lit les colonnes) affiche « non consenti » pendant que la passerelle obéit à l'inverse — exactement le motif « une garde ANNONCE une restriction qu'elle n'applique pas ».
- Nuance sur la ligne :365 spécifiquement visée : elle est vraie et documentée comme intentionnelle, mais elle n'est PAS porteuse. Sans elle, un corps `{telemetryEnabled:false, dataProcessingConsentAt:"…"}` passe pareil (aucun autre champ de `validateApplicationPreferences` ne regarde les consentements). L'auto-satisfaction dans la même requête est un symptôme ; la faille est que le blob soit un site d'ÉCRITURE client pour un consentement, et qu'il PRIME.

**Correctif** — Rendre les colonnes `User.*ConsentAt` seule source de vérité : retirer les cinq clés de `ApplicationPreferenceSchema` (packages/shared/types/préférences/application.ts:49-57) — Zod en mode strip les écartera de nouveau — et supprimer les fallbacks `applicationPrefs.* ||` de ConsentValidationService.ts:92-95, :129, :365, l'unique écrivain restant étant `VoiceProfileService.updateConsent` avec l'horloge serveur. Prévoir la migration one-shot des blobs existants vers les colonnes (max(colonne, blob) puis purge des clés), plus une garde de source qui rougisse si une clé `*ConsentAt` réapparaît dans un schéma de préférences.

---

### 24. 🟡 Moyen — nuancé

**Constat soumis à réfutation** — GET /api/v1/admin/anonymous-users expose `sessionTokenHash` — « la valeur même que createAnonymousUserContext compare pour authentifier » — et `anonymousSession: true` charge la relation entière ; GET /admin/share-links sert `linkId`, secret d'accès anonyme, à tout MODERATOR.

**Preuve (extrait)** — La FUITE est réelle et non gardée. `services/gateway/src/routes/admin/anonymous-users.ts:74-75` : `anonymousSession: true, sessionTokenHash: true` dans le `select`, la valeur partant telle quelle dans `sendSuccess` — la route n'a AUCUN `schema` de réponse (ligne 31-33 : seulement `onRequest` + `preHandler`), donc aucun sérialiseur ne filtre, et aucun hook global ne nettoie (`server.ts:326` = `conditionalGetOnSend`, ETag/304, rien d'autre). Montage confirmé : `route-registration.ts:49-50` `register(anonymousUsersAdminRoutes, { prefix: \`${API_PREFIX}/admin\` })` avec `API_PREFIX = /api/${API_VERSION}` (ligne 91). Public : `requireAdmin` (ligne 19) = `['BIGBOSS','ADMIN','MODERATOR','AUDIT']`.

Mais la QUALIFICATION du champ est fausse. `services/gateway/src/utils/session-token.ts:3` : `hashSessionToken = crypto.createHash('sha256').update(token).digest('hex')`, et `generateSessionToken` produit `anon_<ts>_<randomBytes(16).hex>_<8hex>` — 128 bits de CSPRNG. `middleware/auth.ts:396-400` : `const tokenHash = hashSessionToken(sessionToken); findFirst({ where: { sessionTokenHash: …


*Sites :* `auth.ts:342`, `middleware/auth.ts:396`, `packages/shared/prisma/schema.prisma:612`, `route-registration.ts:49`, `routes/admin/content.ts:604`, `routes/anonymous.ts:239`, `routes/anonymous.ts:580`, `schema.prisma:92`

**Impact réel** — Ce qu'un porteur de compte MODERATOR/AUDIT obtient en UN appel HTTP (`GET /api/v1/admin/anonymous-users`), en pratique, pas en théorie : pour CHAQUE participant anonyme de la plateforme, `anonymousSession.session.ipAddress`, `.country`, `.deviceFingerprint`, `.connectedAt` et `anonymousSession.profile.firstName/lastName/username/email/birthday`. C'est la DÉSANONYMISATION complète de gens dont le produit promet l'anonymat — IP + e-mail + date de naissance + empreinte d'appareil. C'est le vrai défaut, et le constat le sous-pondère.

Ce qu'il n'obtient PAS : un moyen d'authentification. `sessionTokenHash` est un SHA-256 de 128 bits d'aléa CSPRNG ; le rejouer en `X-Session-Token` échoue (il serait re-haché). Aucune usurpation de participant anonyme n'en découle. Sa nuisance réelle est plus faible et d'une autre nature : c'est un corrélateur STABLE (même jeton ⇒ même hash dans toutes les conversations rejointes, donc chaînage cross-conversation d'un « anonyme ») et un oracle de confirmation pour un jeton deviné. Dire « un secret d'authentification part dans la charge » est faux, et c'est la phrase qui portait la gravité du constat.

Share-links : vrai pour MODERATOR, faux pour AUDIT (`canManageConversations: false`). Le gain est une ESCALADE EN ÉCRITURE, pas en lecture : MODERATOR lit déjà le contenu de tous les messages via `GET /admin/messages` (même liste `['BIGBOSS','ADMIN','MODERATOR','AUDIT']`, `messages.ts:16`, avec `content` dans le schéma de rangée). Ce que `linkId` ajoute, c'est de pouvoir `POST /api/v1/anonymous/join/:linkId` et écrire dans n'importe quelle conversation à lien actif SOUS UNE IDENTITÉ ANONYME, hors de tout journal d'action d'admin.

Contexte qui aggrave le classement : le dépôt traite déjà `sessionTokenHash` et `anonymousSession` comme non-servables sur les chemins voisins — gardes NÉGATIVES existantes dans `conversation-detail-include.test.ts:56` et `communities-presence-gate.test.ts:719-726/928/941`, et `SerializableParticipantRow` (`packages/shared/utils/participant-helpers.ts:93-99`) les exclut nommément. La route admin est le seul site sans cette garde ; `admin-anonymous-users.test.ts` ne contient aucune assertion sur ces deux champs …

**Correctif** — Dans `anonymous-users.ts`, remplacer `anonymousSession: true` par un `select` imbriqué limité à ce que le tableau de bord rend (`shareLinkId`, `session: { connectedAt: true }`, `profile: { username: true }`) et supprimer `sessionTokenHash: true` ; réserver `ipAddress`/`deviceFingerprint`/`email`/`birthday` à ADMIN/BIGBOSS via le même seuil que `canViewPresence` déjà présent ligne 40. Poser un `schema` de réponse sur la route (aujourd'hui absent, donc rien ne filtre) et une garde NÉGATIVE calquée sur `communities-presence-gate.test.ts:719` : `expect(res.payload).not.toContain('sessionTokenHash')` et `not.toContain('ipAddress')`. Pour `content.ts:679-680`, trancher si MODERATOR a besoin des handles de jointure ; sinon retirer `linkId`/`identifier` de sa projection et ne les servir qu'à ADMIN/BIGBOSS.

---

### 25. 🟡 Moyen — nuancé

**Constat soumis à réfutation** — DELETE /users/register-device-token n'a aucun appelant de production côté iOS : logout() n'appelle que resetSession() (purge locale) et logoutThrowing(token:) ne transporte aucun device token — donc, après un logout, la passerelle continue de pousser les notifications du compte sortant sur un appareil désormais connecté à un AUTRE compte.

**Preuve (extrait)** — VRAI — aucun appelant de production. `unregisterDeviceToken()` n'apparaît que 3 fois dans le dépôt iOS : sa définition (packages/MeeshySDK/Sources/MeeshySDK/Notifications/PushNotificationManager.swift:185), le doc-comment de resetSession (même fichier:227) et la note de test (packages/MeeshySDK/Tests/MeeshySDKTests/Notifications/PushNotificationManagerTests.swift:360 « intentionally NOT covered »). `AuthManager.logout()` (Auth/AuthManager.swift:438) appelle `PushNotificationManager.shared.resetSession()` (ligne 502), qui ne fait que du local (PushNotificationManager.swift:229-236 : pendingNotificationPayload=nil, deviceToken=nil, keychainStore.delete ×2, userDefaults.removeObject) ; `performServerLogoutWithRetries` (AuthManager.swift:568) appelle `authService.logoutThrowing(token:)` (Auth/AuthService.swift:302-310) qui POST `/auth/logout` avec `body: nil`.

VRAI — le doc-comment ment deux fois. PushNotificationManager.swift:226-228 : « Le binding user↔token côté gateway est désinscrit via `unregisterDeviceToken()` (POST /auth/logout) ». (a) `unregisterDeviceToken()` est un DELETE …


*Sites :* `Auth/AuthManager.swift:438`, `Auth/AuthService.swift:302`, `AuthManager.swift:568`, `MeeshyApp.swift:865`, `PushNotificationManager.swift:155`, `PushNotificationManager.swift:226`, `PushNotificationManager.swift:229`, `PushNotificationManager.swift:290`

**Impact réel** — Ce qu'un attaquant N'obtient PAS : le scénario annoncé (le compte B reçoit/voit les pushes du compte A sur le même téléphone) est fermé par la réassignation `{ token, userId: { not: userId } }` dès la première connexion de B avec les notifications autorisées. C'est ce qui rendait le constat crédible : côté iOS le code de désinscription est bien mort et son doc-comment affirme le contraire — mais la garde existe, à l'autre bout, dans le POST d'enregistrement.

Ce qui RESTE vrai, et qui est le vrai défaut : la fenêtre APPAREIL DÉCONNECTÉ. Entre le logout et une prochaine connexion (qui peut ne jamais venir — téléphone rendu, revendu, prêté, cybercafé, appareil de test), la ligne `pushToken` du compte sortant reste `isActive: true` et liée au jeton APNs de cet appareil. La passerelle continue donc d'y pousser les notifications de A, corps de message compris (le corps est composé SERVEUR, cf. § Prisme des bannières), et l'extension apps/ios/MeeshyNotificationExtension/NotificationService.swift n'a aucune garde de session : elle rend `bestAttemptContent` (lignes 43-52, 209-211) sans jamais consulter le SessionSnapshot que le logout vient d'effacer. Résultat concret et atteignable sans aucun appel HTTP : les messages de A s'affichent sur l'écran verrouillé d'un appareil où plus personne n'est connecté, jusqu'à ce que quelqu'un s'y reconnecte, désinstalle l'app, ou qu'APNs invalide le jeton. Cas voisin, plus rare : le compte suivant REFUSE la permission notifications ⇒ `registerForRemoteNotifications()` n'est jamais appelé (MeeshyApp.swift:867-870), la ligne de A n'est jamais désactivée — mais iOS n'affiche alors plus de bannière, donc la fuite visible reste nulle. Aucune escalade : la lecture de contenu se limite aux aperçus que la passerelle compose déjà pour A.

**Correctif** — Deux gestes, indépendants. (1) Câbler la désinscription : dans `AuthManager.logout()`, capturer le deviceToken AVANT `resetSession()` et l'envoyer avec le token sortant — `await PushNotificationManager.shared.unregisterDeviceToken()` en best-effort borné, au même endroit et selon le même patron que `performServerLogoutWithRetries` (le DELETE exige un `Authorization` valide, donc il doit partir avant `APIClient.shared.authToken = nil`, AuthManager.swift:522). Le plus robuste reste (2) : supprimer les jetons push côté serveur dans le handler `POST /logout` (services/gateway/src/routes/auth/login.ts:337-352), qui ne dépend d'aucun aller-retour client et couvre web et Android — désactiver (`isActive: false`) les lignes du couple (userId, deviceId/token) plutôt que les supprimer, pour préserver l'historique d'échecs. Dans les deux cas, corriger le doc-comment mensonger de `resetSession()` (PushNotificationManager.swift:226-228) et remplacer la note « intentionally NOT covered » par un test sur un `APIClientProviding` injecté.

---

### 26. 🟡 Moyen — nuancé

**Constat soumis à réfutation** — Côté web, plusieurs gestes de sécurité partent vers des routes inexistantes et annoncent quand même un succès : révocation du consentement de clonage vocal affichant « Voice cloning disabled », POST /api/push/unsubscribe échouant en silence, et push-token.service.ts qui rate /v1 + le nom de route, n'envoie aucun Authorization, mais persiste localStorage.fcm_token_registered.

**Preuve (extrait)** — VRAI — les URLs sont fausses :
· apps/web/hooks/use-voice-profile-management.ts:111 et :126 → `apiService.post('/voice/voice-cloning-consent', …)`. `buildApiUrl` (apps/web/lib/config.ts:379) préfixe `/api/v1` → `POST /api/v1/voice/voice-cloning-consent`. Aucune route de ce nom dans le gateway (`grep -rn "voice-cloning-consent" services/gateway/src` → 0). La vraie est `fastify.post('/consent')` (services/gateway/src/routes/voice-profile.ts:51) montée `prefix: ${API_PREFIX}/voice/profile` (services/gateway/src/route-registration.ts:333) = `POST /api/v1/voice/profile/consent`, et elle accepte déjà `{voiceRecordingConsent, voiceCloningConsent}`.
· Le constat SOUS-ESTIME : `grantConsent` (use-voice-profile-management.ts:81) appelle `/voice/consent` → `/api/v1/voice/consent`, 404 lui aussi. Seuls `/voice/profile` (GET:612, DELETE:774) tombent juste. Trois gestes cassés, pas un.
· apps/web/services/push-token.service.ts:76 `axios.post(`${this.baseURL}/api/users/push-token`)` et :130 `axios.delete(…)`. Vraies routes : `fastify.post('/users/register-device-token')` …


*Sites :* `/layout.tsx:14`, `ProfileSettings.example.tsx:9`, `app/settings/page.tsx:31`, `apps/web/components/conversations/ConversationLayout.tsx:250`, `apps/web/hooks/use-voice-profile-management.ts:111`, `apps/web/lib/config.ts:379`, `apps/web/services/push-token.service.ts:76`, `route-registration.ts:272`

**Impact réel** — Ce qu'un utilisateur obtient réellement :

1) Consentement de clonage vocal (Réglages → Média → Audio → VoiceProfileSettings, monté via media-settings.tsx:163 → audio-settings.tsx:153, lui-même chargé par app/settings/page.tsx) : basculer l'interrupteur — dans les DEUX sens — produit un 404, un `toast.error('Failed to disable voice cloning')` et l'interrupteur qui REVIENT/RESTE en place. L'utilisateur ne peut ni accorder ni RÉVOQUER son consentement au clonage depuis le web. C'est un trou fonctionnel RGPD réel, mais l'utilisateur n'est pas trompé : il voit l'échec. La phrase « pire que l'absence de bouton — l'utilisateur croit avoir retiré son consentement » est FAUSSE ; c'est exactement l'inverse d'une fausse assurance.

2) Enregistrement push web : atteignable par simple navigation (layout connecté). Le POST part vers `https://gate.…/api/users/push-token` → 404 sans jamais porter de `Authorization`. Le gateway n'enregistre aucun token FCM web ⇒ AUCUNE notification push web ne peut jamais partir. Et là, oui, l'UI ment : `requestPermission()` rend `true` et pose `token` dans l'état après avoir jeté le `false` de `sync()` (use-fcm-notifications.ts:136/192). Mais le masque n'est PAS le localStorage — c'est le booléen ignoré.

3) `/api/push/unsubscribe` : théoriquement atteignable (le `await fetch` sans `response.ok` loguerait « Unsubscribed successfully » sur un 404), pratiquement INATTEIGNABLE — aucun composant ne monte `usePushNotifications`. Sans consommateur, aucun utilisateur ne rencontre ce chemin.

4) ProfileSettings.tsx / `/auth/check-username` (:184), `/auth/change-password` (:307), `/auth/me/email/request` (:111) : ces routes n'existent effectivement pas au gateway (`grep -rn "check-username\|change-password" services/gateway/src` → 0), mais le composant n'est monté nulle part. Impact utilisateur : nul. Dette de code mort, pas un défaut de sécurité.

Aucun de ces points n'offre quoi que ce soit à un ATTAQUANT : ce sont des appels client vers des 404, pas des gardes contournées.

**Correctif** — Pointer le web sur les vraies routes : dans use-voice-profile-management.ts, remplacer `/voice/voice-cloning-consent` (:111, :126) et `/voice/consent` (:81) par `/voice/profile/consent`, et faire rougir un test qui vérifie le chemin contre la liste réelle des routes plutôt qu'un `apiService.post` mocké (apps/web/__tests__/hooks/use-voice-profile-management.test.ts:293/336 verrouille aujourd'hui la MAUVAISE URL). Dans push-token.service.ts, abandonner l'axios brut et le `${NEXT_PUBLIC_BACKEND_URL}` construit à la main au profit d'`apiService.post('/users/register-device-token', …)` / `.delete(...)`, qui porte `Authorization` et `/api/v1` par construction, puis faire remonter l'échec : `useFCMNotifications` doit propager le `false` de `sync()` dans `state.error` au lieu de rendre `true`. Supprimer le code mort (`usePushNotifications` + ses deux fetch `/api/push/*`, `components/settings/ProfileSettings.tsx` et son `.example.tsx`) ou lui donner un consommateur ET des routes existantes — le laisser en place fait passer un futur audit à côté du vrai défaut.

---
