# Architecture transport / services du gateway — Plan d'implémentation

> **Pour les agents exécutants :** utiliser superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent la syntaxe `- [ ]`. Chaque tâche est autonome : elle répète les signatures dont elle a besoin (bloc « Interfaces ») et n'exige la lecture d'aucune autre tâche.

**Objectif :** une seule implémentation métier par opération du gateway, quel que soit le transport (REST, Socket.IO, interne), avec un `CallContext` propagé de bout en bout et un dispatcher d'événements de domaine unique.

**Spécification source :** `docs/superpowers/specs/2026-07-29-architecture-transport-services.md` (commit `7998fca9d`). Ce plan a été écrit en contre-vérifiant chaque affirmation dans le code (HEAD `d30a7912b`, 2026-07-29 au soir) ; les écarts constatés sont en §C et le plan suit **le code réel**, pas la spec, là où ils divergent. Les décisions produit sont arbitrées (§B) : aucune tâche n'est bloquée.

**Périmètre :** `services/gateway/` (Fastify + Socket.IO + Prisma/MongoDB, exécuté sous Bun) et `packages/shared/types/` pour le type partagé. Les adaptations clients (Tâche 17) sont **inventoriées** ici mais exécutées hors de ce plan.

**Hors périmètre (déjà traité ailleurs — ne pas re-planifier, ne pas toucher) :**
- L'IDOR de `POST /translate-blocking` : corrigé et commité (`2c0f0fcca` — authentification obligatoire, garde d'appartenance inconditionnelle, `GET /test` inclus).
- La restitution de la position à la lecture des messages : câblée (`4b6ee5a2a`, `5252fab89`, `34c1ac179`).
- Le contournement d'authentification par en-tête `x-user-id` dans `src/routes/voice/` : traité en urgence par une autre session. **Aucune tâche de ce plan ne modifie `src/routes/voice/`.**

## A. Contraintes globales (à respecter par CHAQUE tâche)

1. **Deux portes séparées**, depuis `services/gateway/` : `bun run test -- <fichier>` (Jest via `jest --config=jest.config.json`, exécuté sous Bun — c'est ce harnais qui fournit le stub Prisma par `moduleNameMapper` ; le runner natif `bun test` ne l'a pas) **et** `bunx tsc --noEmit`. Des tests verts ne valent pas un typecheck vert, et inversement. Attention : `tsconfig.json` **exclut les tests** ; pour type-checker un fichier de test, utiliser `bunx tsc --noEmit -p tsconfig.test.json`. Les chemins `@meeshy/shared/*` résolvent vers `packages/shared/dist` : si le typecheck échoue sur un type partagé nouveau, lancer d'abord `pnpm --filter @meeshy/shared build`.
2. **Tout champ Prisma lu doit figurer dans le `select`** de la requête qui l'a chargé. Un champ absent du `select` vaut `undefined` silencieux en production.
3. **Trois vérifications pour tout champ ajouté à une réponse REST** : le `select` Prisma, le hoist éventuel, **et le schéma de réponse Fastify**. `fast-json-stringify` **tronque silencieusement** tout champ non déclaré quand le schéma de réponse n'a pas `additionalProperties: true` — un correctif de hoist sans schéma est un no-op invisible (constaté deux fois sur les lots position).
4. **Messages de commit en français**, aucun trailer `Co-Authored-By`, aucune mention d'outil.
5. **Le worktree est partagé entre plusieurs sessions actives.** Interdits absolus : `git add -A`, `git add <répertoire>`, `git stash`, `git commit --amend`, `git checkout HEAD -- <fichier>`. Toujours `git add` avec la liste explicite des fichiers de LA tâche. Si `git commit` échoue sur `.git/index.lock`, attendre deux secondes et réessayer.
6. **Les numéros de ligne de ce plan datent du 2026-07-29 au soir (HEAD `d30a7912b`).** Le dépôt bouge : toujours re-localiser par l'ancre textuelle citée (nom de fonction, littéral), jamais par le numéro seul. Si l'ancre a disparu, s'arrêter et le signaler — ne pas improviser.
7. **Éditions chirurgicales** : ne jamais reformater un fichier entier, ne jamais retirer un commentaire ou un effet existant qui n'est pas l'objet de la tâche.
8. Les imports internes de `packages/shared` gardent leur extension `.js` (ESM ; un import sans extension crash en prod).
9. Les tests suivent la convention du dépôt : `import { describe, it, expect, jest } from '@jest/globals'` (jamais `bun:test`), mocks de modules hoistés **avant** les imports du module testé, faux Prisma = objet de `jest.fn()` par modèle (voir `src/__tests__/unit/routes/message-send-block.test.ts` comme référence).

## B. Décisions produit — arbitrées, à appliquer telles quelles

Les trois décisions structurantes ont été arbitrées par le propriétaire du produit. Elles sont **acquises** : les tâches les appliquent sans re-questionner. Les décisions secondaires (B.4 à B.8) sont prises par ce plan sur le critère « aucune régression pour un appelant existant » ; chacune est documentée avec ses conséquences.

### B.1 — Suppression de message : auteur + administrateurs de la conversation + modération globale **(arbitré)**

Politique unique, dans `MessagingService.deleteMessage` :

```
autorisé ⟺ acteur = auteur du message
          ∨ participant.role ∈ { admin, moderator }        (rôle DANS la conversation)
          ∨ user.role ∈ { MODERATOR, ADMIN, BIGBOSS }      (rôle global — enum UserRole)
```

Point vérifié dans le schéma : l'enum `UserRole` (`packages/shared/prisma/schema.prisma:18-26`) contient bien un rôle de modération globale (`MODERATOR`, commentaire « Modérateur global »). Elle ne contient **pas** `CREATOR` : la branche `role === 'CREATOR'` de `routes/messages.ts:431` compare `User.role` (typé `UserRole`) à une valeur impossible — c'est du code mort, la politique unifiée ne la reprend pas.

**Cette unification ACCORDE des pouvoirs — ce n'est pas un refactor neutre.** Matrice des gains, établie depuis le code réel :

| Porte (appelant réel) | Politique actuelle | Ce que l'unification accorde |
|---|---|---|
| D1 socket `message:delete` (aucun client) | auteur ∨ admin/modo conv. ∨ rôle global (`MessageHandler.ts:766-779`) | rien (déjà la politique cible) |
| D2 `DELETE /api/v1/messages/:messageId` (Android, outbox) | idem + branche `CREATOR` morte (`routes/messages.ts:421-431`) | rien (la branche morte disparaît, sans effet) |
| D3 `DELETE /api/v1/conversations/:id/messages/:messageId` (iOS + web) | auteur ∨ rôle global SEULEMENT (`messages-advanced.ts:587-608`) | **les admins et modérateurs DE CONVERSATION gagnent la suppression** sur la porte qu'utilisent iOS et web |

Une permission accordée par erreur ne se remarque pas : la Tâche 14 pose des **tests négatifs** (membre simple refusé, anonyme refusé, non-participant refusé, modérateur d'une AUTRE conversation refusé) sur les trois portes, avant les tests positifs.

### B.2 — Réactions de commentaire : cumulées **(arbitré)**

Un même utilisateur peut porter **plusieurs emojis distincts** sur un même commentaire. Les deux comportements actuels disparaissent : le remplacement silencieux REST (`PostCommentService.likeComment`, `services/PostCommentService.ts:374-376`, `deleteMany({ emoji: { not: emoji } })`) et le refus socket (`CommentReactionService.ts:111` `MAX_REACTIONS_PER_USER = 1`, erreur nue `:123-124`).

État réel du schéma, vérifié : la contrainte d'unicité porte **déjà** sur le triplet — `@@unique([commentId, userId, emoji], name: "comment_user_reaction_unique")` (`packages/shared/prisma/schema.prisma:1203`). Aucune migration : l'invariant « une réaction max » n'existait qu'en couche applicative. Idem côté posts (`:1222`) — mais les posts ne changent pas de politique dans ce plan.

Compteurs (sémantique unique, Tâche 16) : `reactionSummary = { emoji: nombre }` par `groupBy`, `reactionCount = likeCount = total des réactions` (sémantique actuelle de `syncCommentLikeCounters`, `PostCommentService.ts:401-429`, conservée — chaque paire (utilisateur, emoji) compte 1).

**Inventaire des clients supposant une réaction unique** (travail réel, hors périmètre gateway, listé en Tâche 17) — bonne nouvelle vérifiée : les deux clients modélisent déjà des **tableaux** (`currentUserReactions: [String]` iOS `FeedModels.swift:360`, `currentUserReactions` web) et l'update optimiste web est déjà cumulative (`use-comment-mutations.ts:213-215` ajoute sans retirer). Le reste est détaillé en Tâche 17.

### B.3 — `post.reactions` : cache dénormalisé, écrit systématiquement par un écrivain unique **(arbitré)**

Le champ JSON `post.reactions` est conservé et maintenu à jour **par les deux transports**, avec un seul écrivain : `PostReactionService.updatePostReactionSummary` (`services/PostReactionService.ts:330-365`), qui écrit déjà `reactionSummary`/`reactionCount`/`likeCount` et écrira désormais aussi `reactions`.

- **Qui écrit :** uniquement `updatePostReactionSummary`, appelé après chaque `addReaction`/`removeReaction` du service. `PostService.likePost`/`unlikePost` cessent leurs écritures directes du champ (`PostService.ts:845-850`, `:888-893`) et délèguent intégralement.
- **Quand :** dans le même flux que les autres compteurs, après chaque mutation de la table `PostReaction` — jamais ailleurs.
- **Format (celui que REST écrit aujourd'hui, conservé) :** tableau ordonné par `createdAt` croissant de `{ userId, emoji, createdAt: string ISO }`.
- **Garantie de non-divergence :** (a) garde de source — après la Tâche 18, `data: { reactions:` sur le modèle `post` n'apparaît que dans `PostReactionService.ts` (ajouté à la garde de la Tâche 1) ; (b) **test de cohérence** (Tâche 18) : après une séquence d'ajouts/retraits entrelacés par le chemin REST (`PostService.likePost`) et le chemin socket (`PostReactionService` direct), le JSON relu est exactement la projection de la table `PostReaction`.

### B.4 — Retrait de réaction de post : emoji optionnel (décision du plan)

REST `DELETE /posts/:postId/like` n'a jamais transporté d'emoji (clients vérifiés : iOS `PostService.swift:176` sans body, outbox `OutboxDispatcher.swift:545-551` `body: nil` ; web = code mort) ; le socket fournit toujours l'emoji exact. Signature unifiée : `removeReaction({ postId, userId, emoji? })` — sans emoji, retire **toutes** les réactions de l'utilisateur sur le post (idempotent, déterministe) ; avec emoji, exactement celui-là. Remplace le « première trouvée » actuel (`PostService.ts:873`, `userReactions[0].emoji`). Aucun appelant ne change.

### B.5 — Édition de message : auteur seul, fenêtre de 24 h généralisée (décision du plan, alignée sur la spec §5 étape 3)

- **Auteur seul.** L'édition du message d'autrui par un modérateur global (E3 seul, `messages-advanced.ts:162-183`) est de la réécriture de contenu, pas de la modération ; l'UI web n'expose l'édition que sur ses propres messages. Retirée.
- **Fenêtre 24 h partout** (code d'erreur `EDIT_WINDOW_EXPIRED`, 403). C'est la seule politique délibérée du code (E3) ; la spec la désigne comme règle unique. Conséquence assumée et signalée : iOS (porte E2) et Android (porte E4) qui éditaient sans limite se voient appliquer la fenêtre. L'échappatoire « privilégiés » de E3 était de toute façon morte (compare `Participant.role` à des valeurs `UserRole`, `messages-advanced.ts:154`).
- Règles uniques non optionnelles : garde `deletedAt` atomique (E3/E4 peuvent aujourd'hui ressusciter un message supprimé), invalidation `translations` dans le même write, mentions ré-extraites + notifiées, `trackingLinks` retraités, file offline `edited`, retraduction via l'API publique.

### B.6 — Permissions par défaut d'un `Participant` : figées dans une table unique, à comportement constant (décision du plan)

La Tâche 26 remplace les cinq littéraux divergents par UNE table `PARTICIPANT_PERMISSION_DEFAULTS` indexée par `via`, reproduisant **exactement** les valeurs actuelles (y compris la divergence audio/vidéo du chemin admin-add, commentée comme telle). Aucun changement de comportement ; l'harmonisation éventuelle (audio/vidéo pour tous) devient une modification d'une ligne, testée, à arbitrer plus tard.

### B.7 — Langues cibles de la traduction « nouveau message » via REST : langues de la conversation (décision du plan, exigée par la frontière spec §4)

Pour le cas « nouveau message », la résolution `_extractConversationLanguages` s'applique toujours ; une `target_language` explicite s'y **ajoute** (union) au lieu de la remplacer (`MessageTranslationService.ts:448-455`). La retraduction d'un message existant garde sa cible unique. Les clients reçoivent plus de traductions, jamais moins.

### B.8 — Entrées socket orphelines `message:edit`/`message:delete` : conservées comme adaptateurs (décision du plan)

Aucun client de production ne les émet (vérifié : web chaîne morte `use-socketio-messaging.ts:218-223` sans consommateur ; iOS/Android aucun emit). Elles sont migrées vers le service unique comme les portes REST (coût marginal) ; leur suppression éventuelle est un chantier séparé côté clients.

## C. Écarts constatés entre la spécification et le code réel

La spec (`7998fca9d`) a été contre-vérifiée intégralement au 2026-07-29 au soir (HEAD `d30a7912b`). Le plan suit le code réel. Écarts :

1. **Réfuté — le « bug d'exclusion de l'expéditeur » de `_broadcastNewMessage` (spec §1.2).** `senderId = message.senderId` (`MeeshySocketIOManager.ts:2034`) est bien un `Participant.id`, comme `p.id` : la comparaison `:2064` est homogène. La divergence réelle est plus faible : A tolère les deux espaces d'id (`_isSender`, `MessageHandler.ts:1269-1274`), B non.
2. **Partiellement périmé — le hoist de position dans B.** `_broadcastNewMessage` hisse désormais la position (`MeeshySocketIOManager.ts:1956-1966`, commit `5252fab89`). Restent absents de B : `postReplyTo`, `trackingLinks`, `clientMessageId`, `mentionedUsers` résolus, champs E2EE, sérialisation d'attachments.
3. **Plus grave — E3.** L'échappatoire à la fenêtre 24 h est du code mort : `messages-advanced.ts:154` compare `existingMessage.sender.role` (un `Participant.role` : `admin`/`moderator`/`member`) aux valeurs `UserRole` majuscules — toujours faux. Et E3 invalide `translations` dans une **troisième** écriture séparée (`:436-439`) après le write de contenu (`:222`) : fenêtre où le message édité porte encore ses anciennes traductions.
4. **Plus grave — E4.** Le read se fait sans filtre `deletedAt` (`messages-advanced.ts:746-747`) et le write par id nu (`:792-793`) : E4 peut **ressusciter un message soft-deleted**.
5. **Mort — la branche `CREATOR` de D2.** `routes/messages.ts:431` compare `User.role` (enum `UserRole`, `schema.prisma:18-26`) à `'CREATOR'`, valeur absente de l'enum.
6. **Déjà à moitié corrigé — réactions de post (spec §1.3).** `PostService.likePost` délègue désormais d'abord à `PostReactionService.addReaction` (`PostService.ts:818`) : le REST met à jour `reactionSummary`/`reactionCount`. Divergences restantes réelles : le socket n'écrit jamais `post.reactions` ; sémantique du retrait ; familles d'événements par type ; `canUserViewPost` jamais vérifié à la réaction.
7. **Nouveau — `post.reactions` n'a aucun lecteur client.** Web : zéro lecture ; iOS : la clé n'est pas dans les `CodingKeys` de `APIPost` (`PostModels.swift:205-211`). L'arbitrage B.3 (maintenir le cache) est pris en connaissance de cause.
8. **Mort — `errorHandler` de `custom-errors.ts` (spec §1.8, §2.6).** Il n'est câblé nulle part : le vrai handler est la closure anonyme de `server.ts:691`. 20 des 23 classes d'erreur ne sont instanciées nulle part. La Tâche 9 projette les erreurs vers les acks socket sans supposer ce handler branché.
9. **Incomplet dans la spec — participation.** Il existe un **6ᵉ chemin** de création de `Participant` : `MessagingService.ensureParticipantFromMember` (`services/messaging/MessagingService.ts:527-596`, migration à la volée depuis la collection legacy `ConversationMember`), plus les chemins d'inscription (`AuthService.ts:646-656`) et de seed (`InitService.ts`). Et le join par lien n'est pas totalement silencieux : il fait `joinUserToConversationRoom` (`sharing.ts:622`) et des notifications persistées (`:645`, `:665`) — il n'émet juste ni `CONVERSATION_JOINED` ni `CONVERSATION_NEW`.
10. **Plus grave — le join d'appel REST renvoie un payload malformé.** `routes/calls.ts:605-612` passe le wrapper `{ callSession, iceServers }` retourné par `CallService.joinCall` (`CallService.ts:1150-1153`) directement à `toCallSessionResponse` sans destructurer : la réponse n'a aucun champ de session à la racine (`participants: []`, `participantCount: 0`). Le handler socket destructure correctement (`CallEventsHandler.ts:2121`).
11. **Absent de la spec — Android existe** (`apps/android/`), et chaque plateforme édite/supprime par une porte différente : iOS = E2 + D3, web = E3 + D3, Android = E4 + D2. Les deux entrées socket (E1/D1) n'ont **aucun** appelant de production.
12. **Périmé — traduction.** `POST /translate-blocking` est corrigé et commité (`2c0f0fcca`) ; `POST /translate` non bloquant était déjà authentifié (`translation-non-blocking.ts:268`). Reste ouvert : `GET /status/:messageId/:language` (`translation-non-blocking.ts:406-439`, aucune auth, aucune garde d'appartenance — IDOR de lecture de traduction) et les casts `as any` de retraduction (`routes/messages.ts:315`, `messages-advanced.ts:452`, `:826`). Les routes `voice/*` sont traitées par une autre session (hors périmètre).
13. **Périmé — lignes décalées.** E2 = `routes/messages.ts:216` (spec : 201), D2 = `:374` (spec : 359), permissions création = `core.ts:986-993` (spec : 974-982), `_notifyAgent` = `MeeshySocketIOManager.ts:2607` (spec : 2592), bornes de B = `1852-2128`. Sans incidence de fond.
14. **Déjà partiellement factorisé — flags personnels (spec §1.4).** `PostFeedService` a maintenant un helper privé `enrichWithLikeStatus` (`PostFeedService.ts:993`) appliqué à 5 surfaces. Trous restants vérifiés : `getBookmarks` (`:866`, `currentUserReactions` présent mais ni `isLikedByMe` ni `isBookmarkedByMe`) ; `getStatuses`/`getDiscoverStatuses` (`:396`, `:443`, aucun flag, include réduit à l'auteur) ; `getReels` (pas d'`isRepostedByMe`) ; `getStories` (ni `isBookmarkedByMe` ni `isRepostedByMe`) ; `getUserPosts` viewer anonyme (champs absents). `isViewedByMe` reste exclusif à `getStories`.
15. **Précision — `metadata.source` :** toujours écrit 4 fois, lu 0 fois ; le chemin REST transmet aussi `requestId` dans `metadata` (`messages.ts:1804-1807`) — également lu nulle part. Le `CallContext` les remplace.
16. **Confirmés intégralement :** contournement du funnel par les liens (S4/S5, `routes/links/messages.ts:210`, `:475`, zéro traduction/mention/E2EE/`lastMessageAt` dans le fichier) ; `storyReplyToId` absent du `messageRequest` REST (littéral non typé, `messages.ts:1779-1807`) ; `_notifyAgent` jamais appelé ; `registerMessageRateLimiter` jamais branché ; les 5 jeux de permissions de participant ; l'infrastructure §1.8.

## D. Ordre d'exécution et collisions avec le travail en cours

Des sessions actives travaillent en ce moment sur `services/gateway/src/routes/conversations/`, `src/socketio/`, `src/services/` et `src/routes/voice/`. Règles :

- Les tâches sont ordonnées pour que les premières ne créent **que des fichiers nouveaux** (zéro collision), et que les tâches à collision forte arrivent en dernier dans leur phase.
- Avant toute tâche marquée « COLLISION », exécuter `git status --short -- <fichiers de la tâche>` : si un des fichiers est modifié non commité par une autre session, **suspendre la tâche et le signaler** au lieu d'éditer par-dessus.
- Jamais deux tâches en parallèle sur le même fichier.

| # | Tâche | Fichiers principaux | Collision |
|---|---|---|---|
| 1 | Gardes de source à baseline | `src/__tests__/source-guards/` (nouveau) | aucune |
| 2 | Gel — messages | `src/__tests__/parity/` (nouveau) | aucune |
| 3 | Gel — réactions | `src/__tests__/parity/` (nouveau) | aucune |
| 4 | Gel — participation et appels | `src/__tests__/parity/` (nouveau) | aucune |
| 5 | Type `CallContext` partagé | `packages/shared/types/` (nouveau + 1 ligne d'index) | faible (`packages/shared/types/api-schemas.ts` est en cours de modification ailleurs — ne pas le toucher) |
| 6 | `CallContext` REST | `src/middleware/` | faible |
| 7 | `CallContext` socket + délégation AuthHandler | `src/socketio/handlers/AuthHandler.ts` | **COLLISION** (socketio actif) |
| 8 | Événements de domaine + dispatcher | `src/services/events/`, `src/socketio/events/` (nouveaux) | aucune |
| 9 | Projection des erreurs socket | `src/socketio/utils/` (nouveau) | aucune |
| 10 | Liens → funnel | `src/routes/links/messages.ts` | faible (zone non travaillée) |
| 11 | `storyReplyToId` REST | `src/routes/conversations/messages.ts` (2 lignes) | **COLLISION** (routes/conversations actif) |
| 12 | Broadcast unique `message.created` | `MessageHandler.ts`, `MeeshySocketIOManager.ts`, `MessagingService.ts`, `routes/conversations/messages.ts` | **COLLISION FORTE** — la plus invasive du plan ; à exécuter seule, worktree propre |
| 13 | Édition unifiée | `MessagingService.ts` + 4 adaptateurs | **COLLISION** |
| 14 | Suppression unifiée | `MessagingService.ts` + 3 adaptateurs | **COLLISION** |
| 15 | Garde DM partagée + rate limit REST | `src/services/messaging/`, `server.ts` | moyenne |
| 16 | Réactions de commentaire cumulées (serveur) | `CommentReactionService.ts`, `PostCommentService.ts`, `routes/posts/comments.ts`, `CommentReactionHandler.ts` | moyenne |
| 17 | Réactions cumulées — inventaire clients | document seul | aucune |
| 18 | Réactions de post — écrivain unique | `PostReactionService.ts`, `PostService.ts`, `PostReactionHandler.ts`, `routes/posts/interactions.ts` | moyenne |
| 19 | Réactions de message — périphérie | `routes/reactions.ts`, `ReactionHandler.ts` | moyenne |
| 20 | Réactions de pièce jointe — gardes | `AttachmentReactionService.ts`, `AttachmentReactionHandler.ts` | faible |
| 21 | Enrichisseur viewer unique | `src/services/posts/` (nouveau) + `PostService.ts`, `PostFeedService.ts` | **COLLISION** (services actif) |
| 22 | Audience unique `post:updated` | `StoryTextObjectTranslationService.ts`, `PostAudioService.ts` | moyenne |
| 23 | Traduction — résiduel | `translation-non-blocking.ts`, `MessageTranslationService.ts`, `routes/messages.ts`, `messages-advanced.ts` | **COLLISION** (zone traduction récemment modifiée — re-vérifier l'état avant) |
| 24 | Appels — `call.initiated` | `CallService.ts`, `CallEventsHandler.ts`, dispatcher | **COLLISION** (socketio actif) |
| 25 | Appels — `call.joined` + payload REST | `CallService.ts`, `routes/calls.ts`, dispatcher | moyenne |
| 26 | `ParticipationService.join` | `src/services/` (nouveau) + `core.ts`, `participants.ts`, `sharing.ts`, `anonymous.ts` | **COLLISION FORTE** (`routes/conversations/core.ts` modifié en ce moment même) |
| 27 | `ParticipationService.leave` | `leave.ts`, `participants.ts`, `ConversationHandler.ts` | **COLLISION** |

Dépendances dures : 5 → 6 → 7 ; 8 requis par 12, 13, 14, 16, 18, 19, 24, 25, 26 ; 9 requis par 16 et 19 ; 1 à 4 avant toute tâche de migration (chaque migration retourne ses assertions de gel et retire ses lignes de baseline).

---

# Phase 0 — Geler l'existant

Aucun comportement ne change dans cette phase. Les tests posés ici documentent les divergences actuelles avec des assertions **inversées** : chacune est écrite pour **échouer le jour où la divergence est corrigée**, forçant la tâche correctrice à la retourner dans le même commit. Chaque assertion cite la divergence exacte qu'elle fige et la section de la spec.

## Tâche 1 — Gardes de source à baseline décroissante

**Fichiers :**
- Créer : `services/gateway/src/__tests__/source-guards/helpers.ts`
- Créer : `services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts`
- Test : les deux fichiers ci-dessus (la garde EST le test).

**Interfaces :**
- Produit pour les Tâches 2, 3, 4 : `readSource(relPath: string): string`, `stripComments(src: string): string`, `extractBetween(src: string, startAnchor: string, endAnchor: string): string` — exportées depuis `helpers.ts`. `relPath` est relatif à `services/gateway/src/`.
- Produit pour toutes les tâches de migration : cinq constantes `BASELINE_*` (listes de chemins) qui ne peuvent que **décroître**. Retirer une entrée quand la tâche correspondante nettoie le fichier ; en ajouter une est une régression d'architecture à justifier en revue.

- [ ] **Étape 1 : écrire les helpers**

`services/gateway/src/__tests__/source-guards/helpers.ts` :

```ts
/**
 * Helpers des gardes de source. Analyse le code, pas les commentaires :
 * `stripComments` retire les commentaires AVANT tout grep (règle du dépôt —
 * une garde qui matche un commentaire est un faux positif).
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const SRC_ROOT = join(__dirname, '../..'); // services/gateway/src

export function readSource(relPath: string): string {
  return readFileSync(join(SRC_ROOT, relPath), 'utf-8');
}

/** Retire les commentaires // et les blocs. Naïf mais suffisant : le code du
 *  gateway ne contient pas de littéraux de chaîne contenant eux-mêmes des
 *  séquences de commentaire multi-lignes significatives pour ces gardes. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/([^:'"])\/\/[^\n]*$/gm, '$1');
}

/** Extrait le texte entre deux ancres (première occurrence de chaque, la
 *  seconde cherchée APRÈS la première). Jette si une ancre est absente :
 *  une ancre disparue veut dire que le code a bougé — la garde doit
 *  échouer bruyamment, pas se taire. */
export function extractBetween(src: string, startAnchor: string, endAnchor: string): string {
  const start = src.indexOf(startAnchor);
  if (start === -1) throw new Error(`Ancre de début introuvable : ${startAnchor}`);
  const end = src.indexOf(endAnchor, start + startAnchor.length);
  if (end === -1) throw new Error(`Ancre de fin introuvable : ${endAnchor}`);
  return src.slice(start, end);
}

/** Tous les .ts de production sous un répertoire (récursif, hors __tests__ et .test.ts). */
export function collectSources(relDir: string): Array<{ path: string; content: string }> {
  const out: Array<{ path: string; content: string }> = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(full);
      } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
        out.push({ path: full.slice(SRC_ROOT.length + 1).replace(/\\/g, '/'), content: readFileSync(full, 'utf-8') });
      }
    }
  };
  walk(join(SRC_ROOT, relDir));
  return out;
}
```

- [ ] **Étape 2 : écrire la garde avec des baselines VIDES (pour la voir rouge)**

`services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts` :

```ts
/**
 * Gardes de frontière transport / services.
 * Spec : docs/superpowers/specs/2026-07-29-architecture-transport-services.md §6.2.
 * BASELINE = état au 2026-07-29. Elle ne peut que DÉCROÎTRE : retirer une
 * entrée quand une tâche de migration nettoie le fichier ; en ajouter une est
 * une régression d'architecture (à justifier explicitement en revue).
 */
import { describe, it, expect } from '@jest/globals';
import { collectSources, stripComments } from './helpers';

const PRISMA_WRITE = /\bprisma\s*\.\s*\w+\s*\.\s*(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
const SOCKETIO_IN_SERVICE = /from\s+['"]socket\.io['"]|MeeshySocketIOManager|getIO\(\)/;
const PRIVATE_CAST_CALL = /as any\)\._(?!count|max|min|sum|avg)/;
const IO_EMIT = /\bio\s*\.\s*(emit|to)\s*\(|this\.io\s*\.\s*(emit|to)\s*\(/;
const BARE_THROW = /throw new Error\(/;

const offendersOf = (dirs: string[], re: RegExp): string[] =>
  dirs
    .flatMap((d) => collectSources(d))
    .filter((f) => re.test(stripComments(f.content)))
    .map((f) => f.path)
    .sort();

// À remplir à l'Étape 3 avec la sortie réelle du premier run.
const BASELINE_PRISMA_WRITES_IN_TRANSPORT: string[] = [];
const BASELINE_SOCKETIO_IN_SERVICES: string[] = [];
const BASELINE_PRIVATE_CASTS: string[] = [];
const BASELINE_IO_EMIT_OUTSIDE_SOCKETIO: string[] = [];
const BASELINE_BARE_THROW_IN_SERVICES: string[] = [];

describe('frontière transport / services (spec §2.1, §6.2)', () => {
  it('les couches transport ne contiennent aucune écriture Prisma hors baseline', () => {
    expect(offendersOf(['routes', 'socketio/handlers'], PRISMA_WRITE))
      .toEqual([...BASELINE_PRISMA_WRITES_IN_TRANSPORT].sort());
  });

  it("les services n'importent ni socket.io ni le manager hors baseline", () => {
    expect(offendersOf(['services'], SOCKETIO_IN_SERVICE))
      .toEqual([...BASELINE_SOCKETIO_IN_SERVICES].sort());
  });

  it('aucun appel de méthode privée via cast hors baseline (spec §1.6)', () => {
    expect(offendersOf(['routes', 'socketio'], PRIVATE_CAST_CALL))
      .toEqual([...BASELINE_PRIVATE_CASTS].sort());
  });

  it('aucun io.emit/io.to hors de socketio/ hors baseline (spec §2.3)', () => {
    expect(offendersOf(['services', 'routes'], IO_EMIT))
      .toEqual([...BASELINE_IO_EMIT_OUTSIDE_SOCKETIO].sort());
  });

  it('les services ne lèvent pas de Error nue hors baseline (spec §2.6)', () => {
    expect(offendersOf(['services'], BARE_THROW))
      .toEqual([...BASELINE_BARE_THROW_IN_SERVICES].sort());
  });
});
```

- [ ] **Étape 3 : lancer, constater le rouge, remplir les baselines**

Run : `cd services/gateway && bun run test -- src/__tests__/source-guards/transport-layer-boundaries.test.ts`
Attendu : **5 échecs**, chacun affichant la liste réelle des contrevenants (diff `Expected: []` / `Received: [...]`).

Copier chaque liste reçue dans la constante correspondante. Listes attendues au 2026-07-29 (à recouper — si l'écart dépasse un ou deux fichiers, le dépôt a bougé, prendre la sortie réelle) : `BASELINE_PRISMA_WRITES_IN_TRANSPORT` ≈ 46 fichiers dont `routes/anonymous.ts`, `routes/conversations/{core,leave,messages,messages-advanced,participants,sharing,ban,delete-for-me}.ts`, `routes/links/messages.ts`, `routes/messages.ts`, `socketio/handlers/MessageHandler.ts` ; `BASELINE_SOCKETIO_IN_SERVICES` = `services/CallCleanupService.ts`, `services/StatusService.ts`, `services/message-translation/MessageTranslationService.ts`, `services/notifications/NotificationService.ts`, `services/posts/StoryTextObjectTranslationService.ts` ; `BASELINE_PRIVATE_CASTS` = `routes/messages.ts`, `routes/conversations/messages-advanced.ts` ; `BASELINE_IO_EMIT_OUTSIDE_SOCKETIO` ≈ 14 fichiers ; `BASELINE_BARE_THROW_IN_SERVICES` ≈ 33 fichiers.

- [ ] **Étape 4 : relancer, constater le vert, type-checker**

Run : `bun run test -- src/__tests__/source-guards/transport-layer-boundaries.test.ts` → 5 verts.
Run : `bunx tsc --noEmit -p tsconfig.test.json` → sans nouvelle erreur sur ces deux fichiers.

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/__tests__/source-guards/helpers.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "test(gateway): gardes de frontière transport/services à baseline décroissante"
```

## Tâche 2 — Gel des divergences d'envoi de message

**Fichiers :**
- Créer : `services/gateway/src/__tests__/parity/message-send.baseline.test.ts`
- Lire (référence de harnais) : `services/gateway/src/__tests__/unit/routes/message-send-block.test.ts`
- Consomme : `readSource`, `extractBetween`, `stripComments` de `../source-guards/helpers` (Tâche 1).

**Interfaces :**
- Produit : trois blocs de gel que les Tâches 10, 11 et 12 devront **retourner** (l'assertion inversée devient l'assertion cible) dans leur propre commit. Aucun autre fichier ne dépend de celui-ci.

**Pourquoi ces formes.** Le gel du `messageRequest` REST est comportemental (le harnais de route existe) ; les gels du broadcast B et des routes de lien sont des gardes de source ancrées sur le comportement (instancier `MeeshySocketIOManager` en unitaire est impraticable), conçues pour casser mécaniquement quand la tâche correctrice supprime ou enrichit le code visé.

- [ ] **Étape 1 : écrire le test**

`services/gateway/src/__tests__/parity/message-send.baseline.test.ts` :

```ts
/**
 * GEL — divergences d'envoi de message entre transports.
 * Spec : 2026-07-29-architecture-transport-services.md §1.2.
 * Chaque assertion documente l'état DIVERGENT actuel et DOIT échouer le jour
 * où la divergence est corrigée : la tâche correctrice la retourne alors dans
 * son propre commit (assertion cible), jamais en la supprimant.
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { readSource, stripComments, extractBetween } from '../source-guards/helpers';

jest.mock('../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
  performanceLogger: { withTiming: jest.fn(async (_n: unknown, fn: () => unknown) => fn()) },
}));

const SENDER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd7994390aa';
const PARTICIPANT_ID = '507f1f77bcf86cd7994390bb';
const STORY_ID = '507f1f77bcf86cd7994390cc';
const VALID_CID = 'cid_11111111-1111-4111-8111-111111111111';

const captured: { request?: Record<string, unknown> } = {};
jest.mock('../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({
    handleMessage: async (req: Record<string, unknown>) => {
      captured.request = req;
      return { success: true, data: { id: 'm1', conversationId: CONV_ID } };
    },
  })),
}));

async function buildApp() {
  const prisma = {
    conversation: {
      findUnique: jest.fn(async () => ({ type: 'group', participants: [{ userId: SENDER_ID }] })),
      findFirst: jest.fn(async () => ({ id: CONV_ID })),
    },
    participant: { findFirst: jest.fn(async () => ({ id: PARTICIPANT_ID })) },
    user: { findFirst: jest.fn(async () => null) },
  } as unknown as PrismaClient;
  const app = Fastify({ logger: false });
  app.decorate('notificationService', {} as never);
  app.decorate('socketIOHandler', undefined as never);
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: SENDER_ID, registeredUser: { id: SENDER_ID }, hasFullAccess: true,
    };
  };
  const { registerMessagesRoutes } = await import('../../routes/conversations/messages');
  registerMessagesRoutes(app, prisma, {} as MessageTranslationService, auth, auth);
  await app.ready();
  return app;
}

describe('GEL §1.2 — envoi de message', () => {
  it("le chemin REST PERD storyReplyToId (retourner à la Tâche 11)", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      headers: { authorization: 'Bearer x' },
      payload: { content: 'réponse à ta story', clientMessageId: VALID_CID, storyReplyToId: STORY_ID },
    });
    expect(res.statusCode).toBe(200);
    // DIVERGENCE FIGÉE : le schéma accepte storyReplyToId, le littéral
    // messageRequest ne le transmet pas (routes/conversations/messages.ts,
    // bloc `const messageRequest = {`). Le socket le transmet
    // (MessageHandler.ts, `storyReplyToId: validated.storyReplyToId`).
    expect(captured.request?.storyReplyToId).toBeUndefined();
    await app.close();
  });

  it('le broadcast B (chemin REST/agent) reste appauvri par rapport à A (retourner à la Tâche 12)', () => {
    const manager = stripComments(readSource('socketio/MeeshySocketIOManager.ts'));
    // DIVERGENCE FIGÉE : _broadcastNewMessage existe encore (miroir de ~250
    // lignes de MessageHandler.broadcastNewMessage) et son payload n'a ni
    // postReplyTo, ni trackingLinks, ni clientMessageId, ni champs E2EE.
    const body = extractBetween(manager, 'private async _broadcastNewMessage', '\n  private async ');
    expect(manager).toContain('private async _broadcastNewMessage');
    expect(body).not.toContain('postReplyTo');
    expect(body).not.toContain('trackingLinks');
    expect(body).not.toContain('clientMessageId');
    expect(body).not.toContain('encryptedContent');
  });

  it("les routes de lien contournent le funnel MessagingService (retourner à la Tâche 10)", () => {
    const links = stripComments(readSource('routes/links/messages.ts'));
    // DIVERGENCE FIGÉE : écriture Prisma directe, aucun handleMessage, et
    // donc aucune traduction / mention / E2EE / lastMessageAt pour les
    // conversations par lien (spec §1.2, §1.6).
    expect(links).toContain('prisma.message.create');
    expect(links).not.toContain('handleMessage');
    expect(links).not.toContain('lastMessageAt');
  });

  it("l'agent ZMQ n'est jamais réveillé par un envoi REST (retourner à la Tâche 12)", () => {
    const manager = stripComments(readSource('socketio/MeeshySocketIOManager.ts'));
    // DIVERGENCE FIGÉE : _notifyAgent est défini mais n'a aucun site d'appel.
    const occurrences = manager.split('_notifyAgent').length - 1;
    expect(occurrences).toBe(1);
  });
});
```

- [ ] **Étape 2 : lancer et vérifier que le gel est VERT (il fige l'existant) mais sensible**

Run : `cd services/gateway && bun run test -- src/__tests__/parity/message-send.baseline.test.ts`
Attendu : 4 verts. Vérification de sensibilité (obligatoire) : inverser temporairement `toBeUndefined()` en `toBe(STORY_ID)` sur le premier test, relancer, constater l'échec `Expected: "507f...cc" / Received: undefined`, puis restaurer. C'est la preuve que le test échouera le jour où la Tâche 11 transmettra le champ.

- [ ] **Étape 3 : type-checker puis commiter**

Run : `bunx tsc --noEmit -p tsconfig.test.json`

```
git add services/gateway/src/__tests__/parity/message-send.baseline.test.ts
git commit -m "test(gateway): gel des divergences d'envoi de message entre transports"
```

## Tâche 3 — Gel des divergences de réactions

**Fichiers :**
- Créer : `services/gateway/src/__tests__/parity/reactions.baseline.test.ts`
- Consomme : `readSource`, `stripComments`, `extractBetween` de `../source-guards/helpers` (Tâche 1).

**Interfaces :** produit quatre blocs de gel à retourner par les Tâches 16 (commentaires), 18 (posts) et 19 (messages).

- [ ] **Étape 1 : écrire le test**

`services/gateway/src/__tests__/parity/reactions.baseline.test.ts` :

```ts
/**
 * GEL — divergences des quatre familles de réactions.
 * Spec : 2026-07-29-architecture-transport-services.md §1.3.
 * Assertions inversées : chacune échoue le jour où la divergence est corrigée
 * et doit être RETOURNÉE (pas supprimée) par la tâche correctrice.
 */
import { describe, it, expect } from '@jest/globals';
import { readSource, stripComments, extractBetween } from '../source-guards/helpers';

describe('GEL §1.3 — réactions', () => {
  it("l'invariant commentaire est encore « une réaction max, erreur au-delà » côté socket (retourner à la Tâche 16)", () => {
    const svc = stripComments(readSource('services/CommentReactionService.ts'));
    expect(svc).toContain('MAX_REACTIONS_PER_USER = 1');
    expect(svc).toContain('throw new Error(`Maximum ${MAX_REACTIONS_PER_USER}');
  });

  it('le REST purge encore silencieusement les autres emojis du commentaire (retourner à la Tâche 16)', () => {
    const svc = stripComments(readSource('services/PostCommentService.ts'));
    expect(svc).toContain('emoji: { not: emoji }');
  });

  it("le unlike REST d'un commentaire n'est toujours pas diffusé (retourner à la Tâche 16)", () => {
    const routes = stripComments(readSource('routes/posts/comments.ts'));
    // Corps du handler DELETE …/like : entre l'ancre de la route unlike et la
    // fin de son bloc. Aujourd'hui : unlikeComment puis réponse, zéro
    // broadcast, zéro notification (spec §1.3 « unlike REST jamais diffusé »).
    const body = extractBetween(routes, "unlikeComment(", 'sendSuccess');
    expect(body).not.toContain('socialEvents');
    expect(body).not.toContain('broadcast');
  });

  it('le retrait REST de réaction de post retire encore « la première trouvée » (retourner à la Tâche 18)', () => {
    const svc = stripComments(readSource('services/PostService.ts'));
    expect(svc).toContain('userReactions[0].emoji');
  });

  it('post.reactions (JSON) est encore écrit par PostService, pas par le service de réaction (retourner à la Tâche 18)', () => {
    const post = stripComments(readSource('services/PostService.ts'));
    const reaction = stripComments(readSource('services/PostReactionService.ts'));
    expect(post).toContain('reactions: reactionsJson');
    expect(reaction).not.toContain('reactionsJson');
  });

  it("le socket n'émet jamais story:reacted / status:reacted (retourner à la Tâche 18)", () => {
    const handler = stripComments(readSource('socketio/handlers/PostReactionHandler.ts'));
    expect(handler).not.toContain('STORY_REACTED');
    expect(handler).not.toContain('STATUS_REACTED');
  });

  it('la réaction de message posée par REST ne rejoint jamais la file offline (retourner à la Tâche 19)', () => {
    const routes = stripComments(readSource('routes/reactions.ts'));
    expect(routes).not.toContain('enqueue');
    expect(routes).not.toContain('deliveryQueue');
    expect(routes).not.toContain('rateLimit');
  });
});
```

- [ ] **Étape 2 : lancer (vert), tester la sensibilité, type-checker**

Run : `cd services/gateway && bun run test -- src/__tests__/parity/reactions.baseline.test.ts` → 7 verts.
Sensibilité : remplacer temporairement `MAX_REACTIONS_PER_USER = 1` par `= 2` dans l'assertion (pas dans le code !), relancer, constater l'échec, restaurer.
Run : `bunx tsc --noEmit -p tsconfig.test.json`

- [ ] **Étape 3 : commiter**

```
git add services/gateway/src/__tests__/parity/reactions.baseline.test.ts
git commit -m "test(gateway): gel des divergences de réactions entre transports"
```

## Tâche 4 — Gel participation et appels

**Fichiers :**
- Créer : `services/gateway/src/__tests__/parity/participation-calls.baseline.test.ts`
- Consomme : `readSource`, `stripComments` de `../source-guards/helpers` (Tâche 1).

**Interfaces :** produit les blocs de gel à retourner par les Tâches 24, 25 et 26.

- [ ] **Étape 1 : écrire le test**

`services/gateway/src/__tests__/parity/participation-calls.baseline.test.ts` :

```ts
/**
 * GEL — participation (§1.5) et appels (§1.7).
 * Assertions inversées, à retourner par les Tâches 24, 25, 26.
 */
import { describe, it, expect } from '@jest/globals';
import { readSource, stripComments } from '../source-guards/helpers';

describe('GEL §1.5 — participation', () => {
  it('cinq écritures littérales de permissions divergentes subsistent (retourner à la Tâche 26)', () => {
    const core = stripComments(readSource('routes/conversations/core.ts'));
    const participants = stripComments(readSource('routes/conversations/participants.ts'));
    const sharing = stripComments(readSource('routes/conversations/sharing.ts'));
    const anonymous = stripComments(readSource('routes/anonymous.ts'));
    // DIVERGENCE FIGÉE : seul l'ajout par admin accorde audio/vidéo ; les
    // quatre autres chemins écrivent leurs propres littéraux à false.
    expect(participants).toContain('canSendAudios: true');
    expect(participants).toContain('canSendVideos: true');
    expect(core).toContain('canSendAudios: false');
    expect(sharing).toContain('canSendAudios: false');
    expect(anonymous).toContain('canSendVideos: false');
    // Aucun des cinq ne passe par une table partagée.
    for (const src of [core, participants, sharing, anonymous]) {
      expect(src).not.toContain('PARTICIPANT_PERMISSION_DEFAULTS');
    }
  });

  it("le join anonyme reste silencieux — aucun événement, aucune room, aucune notification (retourner à la Tâche 26)", () => {
    const anonymous = stripComments(readSource('routes/anonymous.ts'));
    expect(anonymous).not.toContain('joinUserToConversationRoom');
    expect(anonymous).not.toContain('CONVERSATION_JOINED');
    expect(anonymous).not.toContain('notificationService');
  });
});

describe('GEL §1.7 — appels', () => {
  it("CallService ne publie encore aucun événement de domaine — l'appel REST ne sonne pas (retourner à la Tâche 24)", () => {
    const svc = stripComments(readSource('services/CallService.ts'));
    expect(svc).not.toContain('DomainEventPublisher');
    expect(svc).not.toContain("publish(");
  });

  it('le join REST renvoie le wrapper { callSession, iceServers } non destructuré (retourner à la Tâche 25)', () => {
    const routes = stripComments(readSource('routes/calls.ts'));
    // DIVERGENCE FIGÉE : joinCall retourne { callSession, iceServers } ; la
    // route le passe tel quel à toCallSessionResponse → payload malformé
    // (participants: [], aucun champ de session à la racine). Le handler
    // socket destructure, lui (CallEventsHandler.ts).
    expect(routes).not.toContain('const { callSession, iceServers }');
  });
});
```

- [ ] **Étape 2 : lancer (vert), sensibilité, type-checker**

Run : `cd services/gateway && bun run test -- src/__tests__/parity/participation-calls.baseline.test.ts` → 4 verts.
Sensibilité : changer temporairement `'canSendAudios: true'` en `'canSendAudios: maybe'` dans l'assertion, relancer, voir l'échec, restaurer.
Run : `bunx tsc --noEmit -p tsconfig.test.json`

- [ ] **Étape 3 : commiter**

```
git add services/gateway/src/__tests__/parity/participation-calls.baseline.test.ts
git commit -m "test(gateway): gel des divergences participation et appels"
```

---

# Phase 1 — Le contexte d'appel

## Tâche 5 — Type `CallContext` partagé et fabrique interne

**Fichiers :**
- Créer : `packages/shared/types/call-context.ts`
- Modifier : `packages/shared/types/index.ts` (une ligne d'export, à la fin du bloc d'exports de types — NE PAS toucher au reste du fichier, il est modifié par d'autres sessions)
- Créer : `services/gateway/src/__tests__/unit/types/call-context.test.ts`

**Interfaces :**
- Produit (consommé par les Tâches 6, 7, 8, 12, 13, 14, 16, 18, 24, 25, 26) :

```ts
// packages/shared/types/call-context.ts
export type Transport = 'rest' | 'socket' | 'grpc' | 'internal';

export type Actor =
  | { readonly kind: 'user'; readonly userId: string; readonly role: string;
      readonly displayName: string; readonly language: string }
  | { readonly kind: 'anonymous'; readonly participantId: string;
      readonly shareLinkId?: string; readonly displayName: string;
      readonly language: string }
  | { readonly kind: 'system'; readonly service: string };

export interface CallContext {
  readonly transport: Transport;
  readonly requestId: string;
  readonly actor: Actor;
  readonly clientMutationId?: string;
  readonly socketId?: string;
  readonly receivedAt: Date;
}

export function internalCallContext(service: string, correlationId?: string): CallContext;
```

- [ ] **Étape 1 : écrire le test qui échoue**

`services/gateway/src/__tests__/unit/types/call-context.test.ts` :

```ts
/**
 * CallContext (spec §3) — le type unique construit une fois à la frontière.
 * L'union `Actor` remplace les booléens isAuthenticated/isAnonymous et rend
 * représentable le troisième cas : l'appelant interne (jobs, agent IA).
 */
import { describe, it, expect } from '@jest/globals';
import { internalCallContext, type CallContext, type Actor } from '@meeshy/shared/types/call-context';

describe('CallContext', () => {
  it('fabrique un contexte interne avec un requestId généré', () => {
    const ctx = internalCallContext('cleanup-job');
    expect(ctx.transport).toBe('internal');
    expect(ctx.actor).toEqual({ kind: 'system', service: 'cleanup-job' });
    expect(ctx.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.receivedAt).toBeInstanceOf(Date);
  });

  it("conserve le requestId d'origine comme corrélation quand il est fourni (spec §3.2)", () => {
    const ctx = internalCallContext('retranslation', 'req-origine-42');
    expect(ctx.requestId).toBe('req-origine-42');
  });

  it("discrimine les acteurs par kind (test de type, vérifié à l'exécution par narrowing)", () => {
    const user: Actor = { kind: 'user', userId: 'u1', role: 'USER', displayName: 'Alice', language: 'fr' };
    const ctx: CallContext = {
      transport: 'rest', requestId: 'r1', actor: user, receivedAt: new Date(),
    };
    if (ctx.actor.kind === 'user') {
      expect(ctx.actor.userId).toBe('u1');
    } else {
      throw new Error('narrowing attendu sur kind=user');
    }
  });
});
```

- [ ] **Étape 2 : lancer et constater l'échec**

Run : `cd services/gateway && bun run test -- src/__tests__/unit/types/call-context.test.ts`
Attendu : échec de résolution de module — `Cannot find module '@meeshy/shared/types/call-context'`.

- [ ] **Étape 3 : implémenter**

`packages/shared/types/call-context.ts` :

```ts
/**
 * Contexte d'appel unifié — spec 2026-07-29-architecture-transport-services §3.
 * Construit UNE fois à la frontière (middleware REST, AuthHandler socket,
 * fabrique interne), passé en premier paramètre de toute méthode de service,
 * embarqué dans tout événement de domaine. Remplace à terme le trio
 * UnifiedAuthContext (identité) / AuthenticationContext (sous-ensemble
 * affaibli) / MessageRequestMetadata.source (étiquette jamais lue).
 *
 * Règle d'usage de `transport` dans un service : traçabilité, idempotence,
 * exclusion d'émetteur — JAMAIS une règle métier (spec §3.3, §4).
 */

export type Transport = 'rest' | 'socket' | 'grpc' | 'internal';

export type Actor =
  | { readonly kind: 'user'; readonly userId: string; readonly role: string;
      readonly displayName: string; readonly language: string }
  | { readonly kind: 'anonymous'; readonly participantId: string;
      readonly shareLinkId?: string; readonly displayName: string;
      readonly language: string }
  | { readonly kind: 'system'; readonly service: string };

export interface CallContext {
  readonly transport: Transport;
  /** X-Request-ID (REST), généré par événement (socket), id de job (interne). */
  readonly requestId: string;
  readonly actor: Actor;
  /** Idempotence : cmid_… (header REST) ou clientMessageId (payload). */
  readonly clientMutationId?: string;
  /** Présent si transport === 'socket' : exclusion de l'émetteur du broadcast. */
  readonly socketId?: string;
  readonly receivedAt: Date;
}

/**
 * Contexte pour un traitement interne (job, agent IA, retraduction différée).
 * `correlationId` : conserver le requestId de la requête d'origine quand le
 * traitement lui survit (spec §3.2, règle de propagation).
 */
export function internalCallContext(service: string, correlationId?: string): CallContext {
  return {
    transport: 'internal',
    requestId: correlationId ?? globalThis.crypto.randomUUID(),
    actor: { kind: 'system', service },
    receivedAt: new Date(),
  };
}
```

Dans `packages/shared/types/index.ts`, ajouter à la fin des exports (une seule ligne, sans toucher au reste) :

```ts
export * from './call-context.js';
```

Puis reconstruire le paquet partagé : `pnpm --filter @meeshy/shared build`

- [ ] **Étape 4 : relancer**

Run : `cd services/gateway && bun run test -- src/__tests__/unit/types/call-context.test.ts` → 3 verts.
Run : `bunx tsc --noEmit` (gateway) et `bunx tsc --noEmit -p tsconfig.test.json`.

- [ ] **Étape 5 : commiter**

```
git add packages/shared/types/call-context.ts packages/shared/types/index.ts services/gateway/src/__tests__/unit/types/call-context.test.ts
git commit -m "feat(shared): type CallContext partage — transport, acteur, correlation"
```

## Tâche 6 — Poser `request.callContext` sur toute requête REST

**Fichiers :**
- Créer : `services/gateway/src/middleware/call-context.ts`
- Modifier : `services/gateway/src/middleware/auth.ts` — dans `createUnifiedAuthMiddleware` (ancre : `export function createUnifiedAuthMiddleware`, vers la ligne 472), après l'affectation de `request.authContext`
- Créer : `services/gateway/src/__tests__/unit/middleware/call-context.test.ts`

**Interfaces :**
- Consomme (Tâche 5) : `CallContext`, `Actor` depuis `@meeshy/shared/types/call-context`.
- Consomme (existant) : `UnifiedAuthContext` (`middleware/auth.ts:46-70` — champs utilisés : `type`, `userId`, `participantId`, `displayName`, `userLanguage`, `registeredUser?.role`) ; `request.id` (posé par `middleware/request-id.ts`, UUID v4) ; `request.clientMutationId` (posé par `middleware/clientMutationId.ts`).
- Produit (consommé par les tâches 12 à 26 côté routes) :

```ts
// services/gateway/src/middleware/call-context.ts
export function buildRestCallContext(request: FastifyRequest, auth: UnifiedAuthContext): CallContext;
// et la déclaration de module Fastify : request.callContext?: CallContext
```

- [ ] **Étape 1 : écrire le test qui échoue**

`services/gateway/src/__tests__/unit/middleware/call-context.test.ts` :

```ts
/**
 * buildRestCallContext — spec §3.2 ligne « REST » : le middleware unifié
 * existant pose request.callContext ; transport 'rest', requestId = request.id,
 * clientMutationId = header déjà décodé, acteur depuis l'authContext.
 */
import { describe, it, expect } from '@jest/globals';
import type { FastifyRequest } from 'fastify';
import { buildRestCallContext } from '../../../middleware/call-context';
import type { UnifiedAuthContext } from '../../../middleware/auth';

const req = (over: Partial<Record<string, unknown>> = {}) =>
  ({ id: 'req-uuid-1', clientMutationId: 'cmid_abc', ...over }) as unknown as FastifyRequest;

describe('buildRestCallContext', () => {
  it('mappe un utilisateur enregistré vers un acteur user', () => {
    const auth = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: 'u1', displayName: 'Alice', userLanguage: 'fr',
      hasFullAccess: true, canSendMessages: true,
      registeredUser: { id: 'u1', role: 'USER' },
    } as unknown as UnifiedAuthContext;
    const ctx = buildRestCallContext(req(), auth);
    expect(ctx.transport).toBe('rest');
    expect(ctx.requestId).toBe('req-uuid-1');
    expect(ctx.clientMutationId).toBe('cmid_abc');
    expect(ctx.socketId).toBeUndefined();
    expect(ctx.actor).toEqual({ kind: 'user', userId: 'u1', role: 'USER', displayName: 'Alice', language: 'fr' });
  });

  it('mappe un participant anonyme vers un acteur anonymous', () => {
    const auth = {
      type: 'anonymous', isAuthenticated: false, isAnonymous: true,
      participantId: 'p1', displayName: 'Anon', userLanguage: 'en',
      hasFullAccess: false, canSendMessages: true,
    } as unknown as UnifiedAuthContext;
    const ctx = buildRestCallContext(req({ clientMutationId: undefined }), auth);
    expect(ctx.actor).toEqual({ kind: 'anonymous', participantId: 'p1', displayName: 'Anon', language: 'en' });
    expect(ctx.clientMutationId).toBeUndefined();
  });
});
```

- [ ] **Étape 2 : lancer et constater l'échec**

Run : `cd services/gateway && bun run test -- src/__tests__/unit/middleware/call-context.test.ts`
Attendu : `Cannot find module '../../../middleware/call-context'`.

- [ ] **Étape 3 : implémenter**

`services/gateway/src/middleware/call-context.ts` :

```ts
/**
 * Construction du CallContext à la frontière REST (spec §3.2).
 * Une fois par requête, jamais reconstruit en profondeur : le contexte
 * DESCEND en paramètre.
 */
import type { FastifyRequest } from 'fastify';
import type { CallContext, Actor } from '@meeshy/shared/types/call-context';
import type { UnifiedAuthContext } from './auth';

declare module 'fastify' {
  interface FastifyRequest {
    callContext?: CallContext;
  }
}

function actorFrom(auth: UnifiedAuthContext): Actor {
  if (auth.isAnonymous && auth.participantId) {
    return {
      kind: 'anonymous',
      participantId: auth.participantId,
      displayName: auth.displayName,
      language: auth.userLanguage,
    };
  }
  return {
    kind: 'user',
    userId: auth.userId ?? '',
    role: (auth.registeredUser as { role?: string } | undefined)?.role ?? 'USER',
    displayName: auth.displayName,
    language: auth.userLanguage,
  };
}

export function buildRestCallContext(request: FastifyRequest, auth: UnifiedAuthContext): CallContext {
  return {
    transport: 'rest',
    requestId: String(request.id),
    actor: actorFrom(auth),
    clientMutationId: (request as unknown as { clientMutationId?: string }).clientMutationId,
    receivedAt: new Date(),
  };
}
```

Dans `services/gateway/src/middleware/auth.ts`, localiser dans `createUnifiedAuthMiddleware` l'endroit où `request.authContext` est affecté (ancre : `request.authContext =`), et ajouter juste après, dans le même bloc :

```ts
      // Spec transport/services §3.2 : le contexte d'appel est construit UNE
      // fois ici, jamais reconstruit en profondeur.
      request.callContext = buildRestCallContext(request, authContext);
```

avec l'import en tête de fichier : `import { buildRestCallContext } from './call-context';`

- [ ] **Étape 4 : relancer les tests et le typecheck**

Run : `bun run test -- src/__tests__/unit/middleware/call-context.test.ts` → 2 verts.
Run : `bun run test -- src/__tests__/unit/middleware/` (non-régression du middleware).
Run : `bunx tsc --noEmit`

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/middleware/call-context.ts services/gateway/src/middleware/auth.ts services/gateway/src/__tests__/unit/middleware/call-context.test.ts
git commit -m "feat(gateway): request.callContext pose par le middleware d'auth unifie"
```

## Tâche 7 — `CallContext` socket : `AuthHandler` délègue au middleware d'authentification

**COLLISION** : `src/socketio/` est en cours de travail par d'autres sessions. Vérifier `git status --short -- services/gateway/src/socketio/handlers/AuthHandler.ts` avant de commencer ; suspendre si modifié.

**Fichiers :**
- Modifier : `services/gateway/src/socketio/handlers/AuthHandler.ts` — méthodes `_authenticateJWTUser` (ancre : `private async _authenticateJWTUser`, vers 148) et `_authenticateAnonymousUser` (ancre : `private async _authenticateAnonymousUser`, vers 235)
- Créer : `services/gateway/src/socketio/utils/socket-call-context.ts`
- Créer : `services/gateway/src/socketio/utils/__tests__/socket-call-context.test.ts`

**Interfaces :**
- Consomme (Tâche 5) : `CallContext`, `Actor` de `@meeshy/shared/types/call-context`.
- Consomme (existant) : `AuthMiddleware.createAuthContext(authorizationHeader?: string, sessionToken?: string): Promise<UnifiedAuthContext>` (`middleware/auth.ts:95-111`) — c'est LA méthode que le socket doit réutiliser au lieu de ré-implémenter `jwt.verify` + lookups (duplication constatée : pas de cache JWT, `select` réduit, aucune tolérance `TokenExpiredError`).
- Produit (consommé par les Tâches 12, 13, 14, 16, 18, 19, 24, 25) :

```ts
// services/gateway/src/socketio/utils/socket-call-context.ts
export type CallContextBase = Omit<CallContext, 'requestId' | 'receivedAt'>;
export function storeCallContextBase(socket: Socket, base: CallContextBase): void;   // → socket.data.callContextBase
export function nextSocketCallContext(socket: Socket): CallContext;                  // nouveau requestId par événement
```

- [ ] **Étape 1 : écrire le test qui échoue**

`services/gateway/src/socketio/utils/__tests__/socket-call-context.test.ts` :

```ts
/**
 * CallContext socket (spec §3.2 ligne « Socket.IO ») : base stockée à
 * l'authentification de la connexion, complétée PAR ÉVÉNEMENT (requestId
 * neuf, receivedAt neuf) — un même socket produit des contextes distincts.
 */
import { describe, it, expect } from '@jest/globals';
import { storeCallContextBase, nextSocketCallContext, type CallContextBase } from '../socket-call-context';

const fakeSocket = () => ({ id: 'sock-1', data: {} as Record<string, unknown> }) as never;

describe('socket-call-context', () => {
  it('stocke la base et fabrique un contexte complet par événement', () => {
    const socket = fakeSocket();
    const base: CallContextBase = {
      transport: 'socket',
      actor: { kind: 'user', userId: 'u1', role: 'USER', displayName: 'Alice', language: 'fr' },
      socketId: 'sock-1',
    };
    storeCallContextBase(socket, base);
    const a = nextSocketCallContext(socket);
    const b = nextSocketCallContext(socket);
    expect(a.transport).toBe('socket');
    expect(a.socketId).toBe('sock-1');
    expect(a.actor).toEqual(base.actor);
    expect(a.requestId).not.toBe(b.requestId);
  });

  it("jette si le socket n'est pas authentifié (pas de base)", () => {
    expect(() => nextSocketCallContext(fakeSocket())).toThrow(/non authentifi/i);
  });
});
```

- [ ] **Étape 2 : lancer et constater l'échec**

Run : `cd services/gateway && bun run test -- src/socketio/utils/__tests__/socket-call-context.test.ts`
Attendu : `Cannot find module '../socket-call-context'`.

- [ ] **Étape 3 : implémenter le helper**

`services/gateway/src/socketio/utils/socket-call-context.ts` :

```ts
/**
 * CallContext côté socket (spec §3.2) : la partie stable (transport, acteur,
 * socketId) est posée une fois à l'authentification de la connexion ; chaque
 * événement reçoit son propre requestId — c'est lui qui suit l'événement
 * jusqu'à la traduction ZMQ et au push qui en résultent.
 */
import { randomUUID } from 'crypto';
import type { Socket } from 'socket.io';
import type { CallContext } from '@meeshy/shared/types/call-context';

export type CallContextBase = Omit<CallContext, 'requestId' | 'receivedAt'>;

export function storeCallContextBase(socket: Socket, base: CallContextBase): void {
  (socket.data as Record<string, unknown>).callContextBase = base;
}

export function nextSocketCallContext(socket: Socket): CallContext {
  const base = (socket.data as Record<string, unknown>).callContextBase as CallContextBase | undefined;
  if (!base) {
    throw new Error(`Socket ${socket.id} non authentifié : pas de callContextBase`);
  }
  return { ...base, requestId: randomUUID(), receivedAt: new Date() };
}
```

- [ ] **Étape 4 : relancer le test du helper** → 2 verts.

- [ ] **Étape 5 : faire déléguer `AuthHandler` et poser la base**

Dans `services/gateway/src/socketio/handlers/AuthHandler.ts` :

1. Ajouter les imports : `AuthMiddleware` (le module `../../middleware/auth` exporte la classe — vérifier le nom exact de l'export dans le fichier ; l'instance est accessible via le constructeur de `AuthHandler`, lui passer l'instance existante du serveur plutôt que d'en créer une), et `storeCallContextBase` depuis `../utils/socket-call-context`.
2. Dans `_authenticateJWTUser` (ancre `private async _authenticateJWTUser`) : remplacer le bloc `jwt.verify` + `prisma.user.findUnique` par un appel à `authMiddleware.createAuthContext('Bearer ' + token)` et dériver l'état existant du handler (userId, langues) depuis le `UnifiedAuthContext` retourné. Conserver STRICTEMENT les effets observables actuels du handler (mêmes champs posés sur le socket, mêmes événements émis en cas d'échec) — cette tâche déduplique l'authentification, elle ne change pas le protocole.
3. Dans `_authenticateAnonymousUser` (ancre `private async _authenticateAnonymousUser`) : même mouvement avec `authMiddleware.createAuthContext(undefined, sessionToken)`.
4. Au succès des deux chemins, poser la base :

```ts
    storeCallContextBase(socket, {
      transport: 'socket',
      socketId: socket.id,
      actor: authContext.isAnonymous && authContext.participantId
        ? { kind: 'anonymous', participantId: authContext.participantId,
            displayName: authContext.displayName, language: authContext.userLanguage }
        : { kind: 'user', userId: authContext.userId ?? '',
            role: (authContext.registeredUser as { role?: string } | undefined)?.role ?? 'USER',
            displayName: authContext.displayName, language: authContext.userLanguage },
    });
```

Si le constructeur d'`AuthHandler` ne reçoit pas encore l'instance d'`AuthMiddleware`, l'ajouter au type de dépendances du handler et la transmettre depuis le point d'instanciation (chercher `new AuthHandler(` dans `src/socketio/` ; le serveur construit déjà une instance du middleware pour REST — la partager, ne pas en créer une seconde).

- [ ] **Étape 6 : relancer la suite socket et le typecheck**

Run : `bun run test -- src/__tests__/unit/handlers/` et `bun run test -- src/socketio/handlers/__tests__/`
Attendu : les tests d'`AuthHandler` existants passent (adapter les mocks qui stubaient `jwt.verify` directement : ils doivent maintenant mocker `createAuthContext`).
Run : `bunx tsc --noEmit`

- [ ] **Étape 7 : commiter**

```
git add services/gateway/src/socketio/handlers/AuthHandler.ts services/gateway/src/socketio/utils/socket-call-context.ts services/gateway/src/socketio/utils/__tests__/socket-call-context.test.ts
git commit -m "feat(gateway): l'auth socket delegue au middleware unifie et pose le CallContext"
```

Retirer ensuite `socketio/handlers/AuthHandler.ts` de la duplication mesurée : si la Tâche 1 a une entrée le concernant dans une baseline, la retirer dans ce même commit.

---

# Phase 2 — Événements de domaine et erreurs

## Tâche 8 — `DomainEvent`, `DomainEventPublisher`, dispatcher

**Fichiers :**
- Créer : `services/gateway/src/services/events/domain-events.ts` (aucune dépendance socket.io — c'est la règle)
- Créer : `services/gateway/src/socketio/events/DomainEventDispatcher.ts`
- Créer : `services/gateway/src/__tests__/unit/events/dispatcher-exhaustive.test.ts`

**Interfaces :**
- Consomme (Tâche 5) : `CallContext` de `@meeshy/shared/types/call-context`.
- Produit (consommé par les Tâches 12, 13, 14, 16, 18, 19, 24, 25, 26) :

```ts
// services/gateway/src/services/events/domain-events.ts
export type ReactionTargetKind = 'message' | 'post' | 'comment' | 'attachment';
export interface ReactionTarget { kind: ReactionTargetKind; id: string; conversationId?: string; postId?: string; postType?: string; }

export type DomainEvent =
  | { type: 'message.created';  ctx: CallContext; conversationId: string; message: unknown }
  | { type: 'message.updated';  ctx: CallContext; conversationId: string; message: unknown }
  | { type: 'message.deleted';  ctx: CallContext; conversationId: string; messageId: string; deletedBy: string }
  | { type: 'reaction.changed'; ctx: CallContext; target: ReactionTarget;
      action: 'added' | 'removed'; emoji: string; userId: string; summary: Record<string, number>; counts: { reactionCount: number; likeCount: number } }
  | { type: 'participant.joined'; ctx: CallContext; conversationId: string; participant: unknown;
      via: 'creation' | 'admin-add' | 'share-link' | 'invitation' | 'anonymous-link' | 'legacy-migration' }
  | { type: 'participant.left'; ctx: CallContext; conversationId: string; participantId: string; removedByAdmin: boolean }
  | { type: 'call.initiated'; ctx: CallContext; call: unknown }
  | { type: 'call.joined'; ctx: CallContext; call: unknown; joinedUserId: string };

export const DOMAIN_EVENT_TYPES: ReadonlyArray<DomainEvent['type']>;

export interface DomainEventPublisher {
  /** Fire-and-forget : ne jette jamais, ne bloque jamais l'appelant. */
  publish(event: DomainEvent): void;
}

/** Publieur inerte pour les tests et les contextes sans socket. */
export const NULL_PUBLISHER: DomainEventPublisher;
```

```ts
// services/gateway/src/socketio/events/DomainEventDispatcher.ts
export class DomainEventDispatcher implements DomainEventPublisher {
  register<T extends DomainEvent['type']>(type: T, handler: (e: Extract<DomainEvent, { type: T }>) => Promise<void>): void;
  handles(type: DomainEvent['type']): boolean;
  publish(event: DomainEvent): void; // route vers le handler, catch + log, jamais de throw
}
```

`message.created` et `reaction.changed` couvrent la spec §2.3 ; `action: 'swapped'` de la spec est retiré : avec les réactions cumulées (décision B.2) un swap n'existe plus, et côté posts le swap est refusé par `ConflictError` — deux événements `removed`+`added` suffisent.

- [ ] **Étape 1 : écrire le test qui échoue**

`services/gateway/src/__tests__/unit/events/dispatcher-exhaustive.test.ts` :

```ts
/**
 * Spec §6.3 — exhaustivité du dispatcher : chaque type de DomainEvent doit
 * avoir un handler enregistré. Ce test échoue dès qu'un type est ajouté à
 * l'union sans son handler — c'est lui qui empêche le retour des « émissions
 * oubliées » (unlike REST silencieux, appel REST muet).
 */
import { describe, it, expect, jest } from '@jest/globals';
import { DOMAIN_EVENT_TYPES, NULL_PUBLISHER, type DomainEvent } from '../../../services/events/domain-events';
import { DomainEventDispatcher } from '../../../socketio/events/DomainEventDispatcher';

describe('DomainEventDispatcher', () => {
  it('expose la liste exhaustive des types (source de vérité unique)', () => {
    expect(DOMAIN_EVENT_TYPES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(DOMAIN_EVENT_TYPES).size).toBe(DOMAIN_EVENT_TYPES.length);
  });

  it('handles() reflète les enregistrements', () => {
    const d = new DomainEventDispatcher();
    expect(d.handles('message.created')).toBe(false);
    d.register('message.created', async () => {});
    expect(d.handles('message.created')).toBe(true);
  });

  it('publish route vers le handler et avale les rejets (fire-and-forget)', async () => {
    const d = new DomainEventDispatcher();
    const seen: DomainEvent[] = [];
    d.register('message.deleted', async (e) => { seen.push(e); throw new Error('boom'); });
    const evt: DomainEvent = {
      type: 'message.deleted',
      ctx: { transport: 'rest', requestId: 'r', actor: { kind: 'system', service: 't' }, receivedAt: new Date() },
      conversationId: 'c1', messageId: 'm1', deletedBy: 'u1',
    };
    expect(() => d.publish(evt)).not.toThrow();
    await new Promise((r) => setImmediate(r));
    expect(seen).toHaveLength(1);
  });

  it('NULL_PUBLISHER est inerte', () => {
    expect(() => NULL_PUBLISHER.publish({} as DomainEvent)).not.toThrow();
  });
});
```

- [ ] **Étape 2 : lancer et constater l'échec**

Run : `cd services/gateway && bun run test -- src/__tests__/unit/events/dispatcher-exhaustive.test.ts`
Attendu : `Cannot find module '../../../services/events/domain-events'`.

- [ ] **Étape 3 : implémenter**

`services/gateway/src/services/events/domain-events.ts` — le contenu EXACT du bloc « Interfaces » ci-dessus, complété ainsi :

```ts
export const DOMAIN_EVENT_TYPES = [
  'message.created', 'message.updated', 'message.deleted',
  'reaction.changed',
  'participant.joined', 'participant.left',
  'call.initiated', 'call.joined',
] as const satisfies ReadonlyArray<DomainEvent['type']>;

export const NULL_PUBLISHER: DomainEventPublisher = { publish: () => undefined };
```

(avec l'import `import type { CallContext } from '@meeshy/shared/types/call-context';` en tête — et RIEN d'autre : ce fichier ne doit jamais importer socket.io, fastify ni prisma).

`services/gateway/src/socketio/events/DomainEventDispatcher.ts` :

```ts
/**
 * Dispatcher unique des événements de domaine (spec §2.3). Seul code autorisé
 * à traduire un fait métier en trames Socket.IO, entrées de file offline et
 * pushes. Vit côté socketio : il a le droit de connaître `io`.
 */
import type { DomainEvent, DomainEventPublisher } from '../../services/events/domain-events';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DomainEventDispatcher');

type Handler<T extends DomainEvent['type']> = (e: Extract<DomainEvent, { type: T }>) => Promise<void>;

export class DomainEventDispatcher implements DomainEventPublisher {
  private handlers = new Map<DomainEvent['type'], Handler<DomainEvent['type']>>();

  register<T extends DomainEvent['type']>(type: T, handler: Handler<T>): void {
    this.handlers.set(type, handler as Handler<DomainEvent['type']>);
  }

  handles(type: DomainEvent['type']): boolean {
    return this.handlers.has(type);
  }

  publish(event: DomainEvent): void {
    const handler = this.handlers.get(event.type);
    if (!handler) {
      logger.warn(`Aucun handler pour l'événement de domaine ${event.type} (requestId=${event.ctx.requestId})`);
      return;
    }
    setImmediate(() => {
      handler(event).catch((err) => {
        logger.error(`Handler ${event.type} en échec (requestId=${event.ctx.requestId})`, err);
      });
    });
  }
}
```

Si `createLogger` n'existe pas sous ce nom dans `src/utils/logger.ts`, utiliser l'export réel du module (l'ouvrir et reprendre le motif des autres fichiers de `src/socketio/`).

- [ ] **Étape 4 : relancer** → 4 verts. Puis `bunx tsc --noEmit`.

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/events/domain-events.ts services/gateway/src/socketio/events/DomainEventDispatcher.ts services/gateway/src/__tests__/unit/events/dispatcher-exhaustive.test.ts
git commit -m "feat(gateway): evenements de domaine et dispatcher unique cote socketio"
```

## Tâche 9 — Projection des erreurs métier vers les acks socket

**Fichiers :**
- Créer : `services/gateway/src/socketio/utils/socket-ack.ts`
- Créer : `services/gateway/src/__tests__/unit/errors/error-projections.test.ts`
- Lire (référence) : `services/gateway/src/errors/custom-errors.ts` (24 classes ; champs `statusCode`, `code`, plus `retryAfter` sur `RateLimitError`, `errors` sur `ValidationError`)

**Interfaces :**
- Produit (consommé par les Tâches 16, 18, 19 côté handlers socket) :

```ts
// services/gateway/src/socketio/utils/socket-ack.ts
export interface SocketAck {
  ok: boolean;
  data?: unknown;
  code?: string;
  message?: string;
  retryAfter?: number;
  errors?: Record<string, string>;
}
export function okAck(data?: unknown): SocketAck;
export function socketAckFor(error: unknown): SocketAck; // BaseAppError → { ok:false, code, ... } ; Error nue → INTERNAL_ERROR
```

**Attention (écart n° 8)** : le `errorHandler` de `custom-errors.ts:239` n'est branché nulle part (le vrai handler HTTP est la closure de `server.ts:691`). Cette tâche ne touche PAS au chemin HTTP : elle fournit la projection socket, adoptée handler par handler dans les tâches suivantes.

- [ ] **Étape 1 : écrire le test qui échoue**

`services/gateway/src/__tests__/unit/errors/error-projections.test.ts` :

```ts
/**
 * Spec §2.6 / §6.3 — chaque BaseAppError a sa projection socket, pilotée par
 * `code`. Ce test échoue dès qu'une classe d'erreur nouvelle arrive sans
 * projection cohérente — c'est lui qui empêche le retour des chaînes libres
 * dans les acks.
 */
import { describe, it, expect } from '@jest/globals';
import * as errors from '../../../errors/custom-errors';
import { socketAckFor, okAck } from '../../../socketio/utils/socket-ack';

const APP_ERROR_CLASSES = Object.values(errors).filter(
  (v): v is new () => errors.BaseAppError =>
    typeof v === 'function' && v.prototype instanceof errors.BaseAppError,
);

describe('projection des erreurs vers les acks socket', () => {
  it('couvre toutes les classes dérivées de BaseAppError', () => {
    expect(APP_ERROR_CLASSES.length).toBeGreaterThanOrEqual(20);
    for (const ErrClass of APP_ERROR_CLASSES) {
      let instance: errors.BaseAppError;
      try { instance = new ErrClass(); } catch { continue; /* ctor à params obligatoires */ }
      const ack = socketAckFor(instance);
      expect(ack.ok).toBe(false);
      expect(ack.code).toBe(instance.code);
      expect(instance.statusCode).toBeGreaterThanOrEqual(400);
    }
  });

  it('projette retryAfter pour RateLimitError', () => {
    const ack = socketAckFor(new errors.RateLimitError('trop vite', 30));
    expect(ack).toMatchObject({ ok: false, code: 'RATE_LIMIT_EXCEEDED', retryAfter: 30 });
  });

  it('ne laisse jamais fuir une Error nue : code INTERNAL_ERROR, message générique', () => {
    const ack = socketAckFor(new Error('détail interne sensible'));
    expect(ack.ok).toBe(false);
    expect(ack.code).toBe('INTERNAL_ERROR');
    expect(ack.message).not.toContain('sensible');
  });

  it('okAck enveloppe les données', () => {
    expect(okAck({ id: 1 })).toEqual({ ok: true, data: { id: 1 } });
  });
});
```

Si le constructeur de `RateLimitError` a une autre signature (vérifier dans `custom-errors.ts`, vers la ligne 159 : `retryAfter` est un champ), adapter l'appel du test à la signature réelle SANS changer l'assertion.

- [ ] **Étape 2 : lancer et constater l'échec**

Run : `cd services/gateway && bun run test -- src/__tests__/unit/errors/error-projections.test.ts`
Attendu : `Cannot find module '../../../socketio/utils/socket-ack'`.

- [ ] **Étape 3 : implémenter**

`services/gateway/src/socketio/utils/socket-ack.ts` :

```ts
/**
 * Enveloppe d'ack socket unique (spec §2.6) : { ok, data?, code?, message?,
 * retryAfter?, errors? }. Le client socket peut enfin distinguer un code
 * métier (REACTION_LIMIT_REACHED, PERMISSION_DENIED…) d'une erreur interne.
 * Une Error nue qui traverse la frontière service→adaptateur est un bug :
 * elle est projetée en INTERNAL_ERROR sans fuite de son message.
 */
import { BaseAppError, RateLimitError, ValidationError } from '../../errors/custom-errors';

export interface SocketAck {
  ok: boolean;
  data?: unknown;
  code?: string;
  message?: string;
  retryAfter?: number;
  errors?: Record<string, string>;
}

export function okAck(data?: unknown): SocketAck {
  return data === undefined ? { ok: true } : { ok: true, data };
}

export function socketAckFor(error: unknown): SocketAck {
  if (error instanceof BaseAppError) {
    const ack: SocketAck = { ok: false, code: error.code, message: error.message };
    if (error instanceof RateLimitError) ack.retryAfter = error.retryAfter;
    if (error instanceof ValidationError && error.errors) ack.errors = error.errors;
    return ack;
  }
  return { ok: false, code: 'INTERNAL_ERROR', message: 'Erreur interne' };
}
```

- [ ] **Étape 4 : relancer** → 4 verts. `bunx tsc --noEmit`.

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/socketio/utils/socket-ack.ts services/gateway/src/__tests__/unit/errors/error-projections.test.ts
git commit -m "feat(gateway): projection unique des erreurs metier vers les acks socket"
```

---

# Phase 3 — Messages

## Tâche 10 — Les routes de lien passent par le funnel

**Fichiers :**
- Modifier : `services/gateway/src/routes/links/messages.ts` (les deux handlers POST — ancres : `prisma.message.create`, deux occurrences, vers 210 et 475)
- Modifier : `services/gateway/src/routes/links/index.ts` et le point d'enregistrement dans `server.ts` (ancre : `registerMessageRoutes` côté links) — pour transmettre le `MessageTranslationService`
- Modifier (mise à jour des mocks) : `services/gateway/src/__tests__/unit/routes/links-messages.test.ts`, `src/__tests__/unit/routes/links/messages.test.ts`, `src/__tests__/unit/routes/links/messages-extended.test.ts`
- Modifier (retourner le gel) : `services/gateway/src/__tests__/parity/message-send.baseline.test.ts`
- Modifier (baseline) : `services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts` — retirer `routes/links/messages.ts` de `BASELINE_PRISMA_WRITES_IN_TRANSPORT`

**Interfaces :**
- Consomme (existant) : `MessagingService.handleMessage(request: MessageRequest, participantId: string): Promise<MessageResponse>` (`services/messaging/MessagingService.ts:58`) — `participantId` est un **Participant.id**, pas un User.id. `MessageRequest` : `packages/shared/types/messaging.ts:100` (champs utiles ici : `conversationId`, `content`, `clientMessageId`, `originalLanguage`, `messageType`, `attachmentIds?`, `metadata?: { source, requestId }`).
- Reproduire le motif d'instanciation de `routes/conversations/messages.ts` (ancre : `new MessagingService(`) — mêmes dépendances, même ordre.
- Produit : les messages de lien traversent `MessageProcessor.saveMessage` — traduction, mentions, notifications, contexte de chiffrement, `lastMessageAt`, dedup P2002 deviennent effectifs pour les conversations par lien sans code supplémentaire.

- [ ] **Étape 1 : retourner le gel (test rouge d'abord)**

Dans `src/__tests__/parity/message-send.baseline.test.ts`, test « les routes de lien contournent le funnel », remplacer les trois assertions par leur cible :

```ts
    expect(links).not.toContain('prisma.message.create');
    expect(links).toContain('handleMessage');
```

(supprimer l'assertion `lastMessageAt` : le bump vit dans le funnel, plus dans ce fichier). Run : `bun run test -- src/__tests__/parity/message-send.baseline.test.ts` → **1 échec** (le fichier contient encore `prisma.message.create`). C'est le rouge attendu.

- [ ] **Étape 2 : brancher le funnel dans la route anonyme**

Dans `routes/links/messages.ts`, handler `POST /links/:identifier/messages` : supprimer le bloc `prisma.message.create` (et le commentaire qui assume le contournement, vers 195-209) ainsi que les appels manuels à `trackingLinkService.processMessageLinks` / `parseSharedPlace` (le funnel les fait). Le remplacer par :

```ts
      const messageRequest = {
        conversationId: shareLink.conversationId,
        content: parsed.content,
        clientMessageId: parsed.clientMessageId,
        originalLanguage: parsed.originalLanguage,
        messageType: parsed.messageType,
        attachmentIds: parsed.attachments?.map((a: { id: string }) => a.id),
        metadata: { source: 'rest' as const, requestId: String(request.id) },
      };
      const result = await messagingService.handleMessage(messageRequest, participant.id);
      if (!result.success || !result.data) {
        return sendBadRequest(reply, result.error ?? 'Envoi impossible');
      }
      const message = result.data;
```

`messagingService` est construit à l'enregistrement des routes, sur le modèle exact de `routes/conversations/messages.ts` (ancre `new MessagingService(`) ; ajouter le paramètre `translationService` à la signature de `registerMessageRoutes` des links et le transmettre depuis le site d'enregistrement (`server.ts` ou `routes/links/index.ts` — suivre la chaîne réelle). Conserver la réponse HTTP actuelle (mêmes champs, mêmes statuts) en la remplissant depuis `message`, et conserver l'émission `LINK_MESSAGE_NEW` **plus** ajouter le broadcast standard, comme le fait la route REST des conversations (ancre dans `routes/conversations/messages.ts` : `socketIOHandler.broadcastMessage`) :

```ts
      const socketIOHandler = (fastify as unknown as { socketIOHandler?: { broadcastMessage: (m: unknown, c: string) => Promise<void> } }).socketIOHandler;
      if (socketIOHandler && !(message as { isDuplicate?: boolean }).isDuplicate) {
        setImmediate(() => {
          socketIOHandler.broadcastMessage(message, shareLink.conversationId).catch(() => undefined);
        });
      }
```

(La Tâche 12 supprimera ces appels explicites au profit de l'événement `message.created` ; ici on donne d'abord aux conversations par lien la livraison temps réel standard.)

- [ ] **Étape 3 : même mouvement dans la route authentifiée** (`POST /links/:identifier/messages/auth`, ancre : second `prisma.message.create`). Le `participantId` est celui du participant membre résolu par la route ; le reste est identique.

- [ ] **Étape 4 : mettre à jour les trois tests de routes links**

Dans chacun des trois fichiers de test : remplacer les mocks de `TrackingLinkService`/`prisma.message.create` par le mock module de `MessagingService` (motif exact de `message-send-block.test.ts`) :

```ts
const handleMessageHolder: { fn: (...args: unknown[]) => Promise<unknown> } = {
  fn: async () => ({ success: true, data: { id: 'm1', conversationId: CONV_ID } }),
};
jest.mock('../../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({
    handleMessage: (...args: unknown[]) => handleMessageHolder.fn(...args),
  })),
}));
```

(ajuster la profondeur des `../` selon le fichier). Les assertions `prisma.message.create` deviennent des assertions sur `handleMessage` (bon `conversationId`, bon `participant.id` en second argument).

- [ ] **Étape 5 : relancer tout, retirer la ligne de baseline**

Run : `bun run test -- src/__tests__/parity/message-send.baseline.test.ts src/__tests__/unit/routes/links-messages.test.ts "src/__tests__/unit/routes/links/"` → verts.
Dans `transport-layer-boundaries.test.ts`, retirer `routes/links/messages.ts` de `BASELINE_PRISMA_WRITES_IN_TRANSPORT` ; relancer la garde → verte.
Run : `bunx tsc --noEmit`

- [ ] **Étape 6 : commiter**

```
git add services/gateway/src/routes/links/messages.ts services/gateway/src/routes/links/index.ts services/gateway/src/server.ts services/gateway/src/__tests__/unit/routes/links-messages.test.ts services/gateway/src/__tests__/unit/routes/links/messages.test.ts services/gateway/src/__tests__/unit/routes/links/messages-extended.test.ts services/gateway/src/__tests__/parity/message-send.baseline.test.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway/links): les messages de lien passent par le funnel MessagingService"
```

(Ne mettre `server.ts` / `index.ts` dans le `git add` que s'ils ont réellement été modifiés.)

## Tâche 11 — Le chemin REST transmet `storyReplyToId` (et se type)

**COLLISION** : `routes/conversations/messages.ts` est dans la zone active. Vérifier `git status --short -- services/gateway/src/routes/conversations/messages.ts` ; suspendre si modifié non commité.

**Fichiers :**
- Modifier : `services/gateway/src/routes/conversations/messages.ts` (ancre : `const messageRequest = {`, vers 1779)
- Modifier (retourner le gel) : `services/gateway/src/__tests__/parity/message-send.baseline.test.ts`

**Interfaces :**
- Consomme : `MessageRequest` de `@meeshy/shared/types` — le champ `storyReplyToId?: string` existe (`messaging.ts:120`) et `MessageProcessor.saveMessage` sait le capturer en snapshot `postReplyTo`. Le socket le transmet déjà (`MessageHandler.ts`, ancre `storyReplyToId: validated.storyReplyToId`).
- Cause racine à corriger en même temps : le littéral n'est **pas typé**, donc TypeScript ne signale aucune omission. Le chemin socket, lui, est typé (`const messageRequest: MessageRequest = {`).

- [ ] **Étape 1 : retourner le gel (rouge d'abord)**

Dans `message-send.baseline.test.ts`, test « le chemin REST PERD storyReplyToId », remplacer :

```ts
    expect(captured.request?.storyReplyToId).toBeUndefined();
```

par :

```ts
    expect(captured.request?.storyReplyToId).toBe(STORY_ID);
```

Run : `bun run test -- src/__tests__/parity/message-send.baseline.test.ts` → **1 échec** (`Received: undefined`).

- [ ] **Étape 2 : implémenter**

Dans `routes/conversations/messages.ts` :
1. Ancre `const messageRequest = {` → la remplacer par `const messageRequest: MessageRequest = {` (import type depuis `@meeshy/shared/types` s'il n'y est pas déjà).
2. Ajouter `storyReplyToId,` dans le littéral, juste après `replyToId,` (la variable est déjà destructurée plus haut, ancre `storyReplyToId,` dans le bloc `const { content, ... } = request.body`).
3. Corriger les erreurs `tsc` éventuelles révélées par le typage SANS retirer de champ transmis (si `encryptedPayload` ou `metadata` frottent contre le type, ajuster la construction, pas le type partagé).

- [ ] **Étape 3 : relancer**

Run : `bun run test -- src/__tests__/parity/message-send.baseline.test.ts` → verts.
Run : `bun run test -- src/__tests__/unit/routes/message-send-block.test.ts` (non-régression du harnais voisin).
Run : `bunx tsc --noEmit`

- [ ] **Étape 4 : commiter**

```
git add services/gateway/src/routes/conversations/messages.ts services/gateway/src/__tests__/parity/message-send.baseline.test.ts
git commit -m "fix(gateway/messages): le chemin REST transmet storyReplyToId et type sa requete"
```

## Tâche 12 — Un seul broadcast `message:new`, publié comme événement de domaine

**COLLISION FORTE** — la tâche la plus invasive du plan : `MessageHandler.ts`, `MeeshySocketIOManager.ts`, `MessagingService.ts`, `routes/conversations/messages.ts`, `routes/links/messages.ts`. Exiger un worktree propre sur ces cinq fichiers avant de commencer (`git status --short`), et ne PAS paralléliser avec d'autres tâches.

**Fichiers :**
- Modifier : `services/gateway/src/socketio/MeeshySocketIOManager.ts` — `broadcastMessage` (ancre : `async broadcastMessage`, vers 2168) et **suppression** de `_broadcastNewMessage` (ancre : `private async _broadcastNewMessage`, bloc 1852-2128)
- Modifier : `services/gateway/src/services/messaging/MessagingService.ts` — publication de `message.created`
- Modifier : `services/gateway/src/socketio/handlers/MessageHandler.ts` — retrait des appels directs à `broadcastNewMessage` après envoi (S1/S2)
- Modifier : `services/gateway/src/routes/conversations/messages.ts` et `routes/links/messages.ts` — retrait des blocs `setImmediate(... broadcastMessage ...)`
- Modifier : point de câblage du dispatcher (là où le manager construit ses handlers, ancre : `new MessageHandler(`)
- Modifier (retourner les gels) : `src/__tests__/parity/message-send.baseline.test.ts`
- Créer : `services/gateway/src/__tests__/unit/events/message-created-dispatch.test.ts`

**Interfaces :**
- Consomme (Tâche 8) : `DomainEventPublisher`, `NULL_PUBLISHER`, `DomainEvent` (`services/events/domain-events.ts`) ; `DomainEventDispatcher` (`socketio/events/DomainEventDispatcher.ts`).
- Consomme (existant) : `MessageHandler.broadcastNewMessage(message: Message, conversationId: string, senderSocket?: Socket): Promise<void>` (`MessageHandler.ts:860`) — **c'est l'implémentation qui survit** (payload complet : `postReplyTo`, `trackingLinks`, `clientMessageId` avec split expéditeur/pairs, champs E2EE, mentions résolues, sérialisation d'attachments, `_isSender` sur les deux espaces d'id).
- Produit : `MessagingService.handleMessage` accepte un 3ᵉ paramètre optionnel `ctx?: CallContext` et publie `{ type: 'message.created', ctx, conversationId, message }` après tout envoi réussi non dupliqué. Signature résultante (consommée par les Tâches 13, 14) :

```ts
async handleMessage(request: MessageRequest, participantId: string, ctx?: CallContext): Promise<MessageResponse>
// constructeur : new MessagingService(...dépendances actuelles..., publisher: DomainEventPublisher = NULL_PUBLISHER)
```

- [ ] **Étape 1 : trancher la forme de `replyTo` (analyse obligatoire avant tout code)**

`_broadcastNewMessage` reconstruit et APLATIT le sender de `replyTo` à la main (`MeeshySocketIOManager.ts:1934-1938` et commentaire `:1922-1930`) ; `_buildMessagePayload` fait un passthrough brut (`MessageHandler.ts:1531-1532`). Vérifier quelle forme les clients consomment :
- iOS : `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:275-281` — `APIMessageReplyTo { id, content?, senderId?, sender? (objet APIMessageSender), attachments? }`.
- Web : `packages/shared/types/message-types.ts:213` — `replyTo?: GatewayMessage` (forme complète).

Conclusion attendue (à re-vérifier sur ces deux ancres, puis à consigner dans le message de commit) : **la forme passthrough de A est la bonne** — les deux clients décodent le `sender` structuré et tolèrent les champs supplémentaires ; la forme aplatie de B prive iOS du `sender` structuré. Si la vérification contredit cette conclusion, STOP : le signaler au lieu de continuer.

- [ ] **Étape 2 : écrire le test du câblage (rouge)**

`services/gateway/src/__tests__/unit/events/message-created-dispatch.test.ts` :

```ts
/**
 * Tâche 12 — le fait métier « message créé » est publié par le service et
 * broadcast par le dispatcher via l'UNIQUE implémentation (celle du
 * MessageHandler). Le miroir _broadcastNewMessage n'existe plus.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { DomainEventDispatcher } from '../../../socketio/events/DomainEventDispatcher';
import { registerMessageCreatedHandler } from '../../../socketio/events/message-created';
import type { DomainEvent } from '../../../services/events/domain-events';

describe('message.created → broadcast unique', () => {
  it('appelle broadcastNewMessage du MessageHandler avec le socket émetteur résolu depuis ctx.socketId', async () => {
    const broadcastNewMessage = jest.fn(async () => {});
    const notifyAgent = jest.fn(async () => {});
    const senderSocket = { id: 'sock-1' };
    const io = { sockets: { sockets: new Map([['sock-1', senderSocket]]) } };
    const d = new DomainEventDispatcher();
    registerMessageCreatedHandler(d, {
      io: io as never,
      messageHandler: { broadcastNewMessage } as never,
      notifyAgent: notifyAgent as never,
    });
    const evt: DomainEvent = {
      type: 'message.created',
      ctx: { transport: 'socket', requestId: 'r1', socketId: 'sock-1',
             actor: { kind: 'user', userId: 'u1', role: 'USER', displayName: 'A', language: 'fr' },
             receivedAt: new Date() },
      conversationId: 'c1',
      message: { id: 'm1' },
    };
    d.publish(evt);
    await new Promise((r) => setImmediate(r));
    expect(broadcastNewMessage).toHaveBeenCalledWith({ id: 'm1' }, 'c1', senderSocket);
    expect(notifyAgent).toHaveBeenCalledWith({ id: 'm1' }, 'c1');
  });

  it("sans socketId (REST/interne), broadcast sans exclusion et réveil de l'agent quand même", async () => {
    const broadcastNewMessage = jest.fn(async () => {});
    const notifyAgent = jest.fn(async () => {});
    const d = new DomainEventDispatcher();
    registerMessageCreatedHandler(d, {
      io: { sockets: { sockets: new Map() } } as never,
      messageHandler: { broadcastNewMessage } as never,
      notifyAgent: notifyAgent as never,
    });
    d.publish({
      type: 'message.created',
      ctx: { transport: 'rest', requestId: 'r2',
             actor: { kind: 'user', userId: 'u1', role: 'USER', displayName: 'A', language: 'fr' },
             receivedAt: new Date() },
      conversationId: 'c1', message: { id: 'm2' },
    } as DomainEvent);
    await new Promise((r) => setImmediate(r));
    expect(broadcastNewMessage).toHaveBeenCalledWith({ id: 'm2' }, 'c1', undefined);
    expect(notifyAgent).toHaveBeenCalled();
  });
});
```

Run : `bun run test -- src/__tests__/unit/events/message-created-dispatch.test.ts` → rouge (`Cannot find module '../../../socketio/events/message-created'`).

- [ ] **Étape 3 : implémenter le handler d'événement**

`services/gateway/src/socketio/events/message-created.ts` :

```ts
/**
 * Handler du fait « message créé » : broadcast via l'implémentation UNIQUE
 * (MessageHandler.broadcastNewMessage — payload complet), exclusion de
 * l'émetteur via ctx.socketId, réveil de l'agent ZMQ quel que soit le
 * transport (avant cette tâche : un message REST ne réveillait jamais
 * l'agent — spec §1.2).
 */
import type { Server, Socket } from 'socket.io';
import type { DomainEvent } from '../../services/events/domain-events';
import type { DomainEventDispatcher } from './DomainEventDispatcher';

interface Deps {
  io: Server;
  messageHandler: { broadcastNewMessage(message: unknown, conversationId: string, senderSocket?: Socket): Promise<void> };
  notifyAgent: (message: unknown, conversationId: string) => Promise<void>;
}

export function registerMessageCreatedHandler(dispatcher: DomainEventDispatcher, deps: Deps): void {
  dispatcher.register('message.created', async (e: Extract<DomainEvent, { type: 'message.created' }>) => {
    const senderSocket = e.ctx.socketId ? deps.io.sockets.sockets.get(e.ctx.socketId) : undefined;
    await deps.messageHandler.broadcastNewMessage(e.message, e.conversationId, senderSocket);
    await deps.notifyAgent(e.message, e.conversationId);
  });
}
```

Relancer le test de l'étape 2 → vert.

- [ ] **Étape 4 : publier depuis `MessagingService`**

Dans `MessagingService.ts` : ajouter le paramètre de constructeur `private publisher: DomainEventPublisher = NULL_PUBLISHER` (dernier, optionnel — aucun site d'appel ne casse) et le 3ᵉ paramètre `ctx?: CallContext` à `handleMessage`. Après le succès de l'envoi (ancre : le point où `handleMessage` construit sa réponse succès ; sauter si `isDuplicate`) :

```ts
    if (!savedMessage.isDuplicate) {
      this.publisher.publish({
        type: 'message.created',
        ctx: ctx ?? internalCallContext('messaging', request.metadata?.requestId),
        conversationId: request.conversationId,
        message: savedMessage,
      });
    }
```

(`internalCallContext` importé de `@meeshy/shared/types/call-context` ; adapter les noms de variables locales à ceux du fichier — l'ancre de succès est le `return` construisant `{ success: true, data: ... }`).

- [ ] **Étape 5 : câbler et débrancher, site par site**

1. **Câblage** : au point où le manager construit ses handlers (ancre `new MessageHandler(`), créer le `DomainEventDispatcher`, appeler `registerMessageCreatedHandler(dispatcher, { io, messageHandler, notifyAgent: (m, c) => this._notifyAgent(m as never, c) })`, le stocker en propriété du manager, et le décorer sur Fastify dans `server.ts` (ancre : `decorate('callService'`) : `this.server.decorate('domainEvents', manager.getDomainEventDispatcher())`.
2. **Injecter le publisher** à chaque `new MessagingService(` (grep : `routes/conversations/messages.ts`, `socketio/handlers/MessageHandler.ts`, `MeeshySocketIOManager.ts` (agent), `routes/links/messages.ts`, routes de traduction) — passer le dispatcher (`fastify.domainEvents` côté routes, la propriété du manager côté socketio). Côté routes, passer aussi `request.callContext` en 3ᵉ argument de `handleMessage` ; côté socket, `nextSocketCallContext(socket)` (Tâche 7).
3. **Débrancher les broadcasts explicites** (ils seraient des doublons) :
   - `MessageHandler.ts` : les appels `this.broadcastNewMessage(...)` après un envoi réussi dans `handleMessageSend` et `handleMessageSendWithAttachments` (ancres : `broadcastNewMessage(` aux environs de 298 et 497) — supprimer l'appel, PAS la méthode ; les appels à l'agent qui les jouxtent (`:319-332`, `:518`) partent aussi (le handler d'événement s'en charge).
   - `routes/conversations/messages.ts` : le bloc `setImmediate(() => { socketIOHandler.broadcastMessage(...) })` (ancre : `broadcastMessage`).
   - `routes/links/messages.ts` : le même bloc ajouté en Tâche 10.
   - `MeeshySocketIOManager.ts` : l'appel broadcast du chemin agent (ancre : vers 2452, après le funnel).
4. **Supprimer le miroir** : `_broadcastNewMessage` (bloc entier 1852-2128) ; faire de `broadcastMessage` (:2168) un alias de compatibilité qui délègue au handler A (il reste des appelants : messages d'appel de `CallService`) :

```ts
  async broadcastMessage(message: Message, conversationId: string): Promise<void> {
    // Compat : l'implémentation unique est MessageHandler.broadcastNewMessage
    // (spec §2.3) ; le miroir _broadcastNewMessage a été supprimé.
    await this.messageHandler.broadcastNewMessage(message, conversationId, undefined);
    await this._notifyAgent(message, conversationId);
  }
```

(vérifier le nom réel de la propriété du manager qui référence le `MessageHandler` — ancre `new MessageHandler(`).

- [ ] **Étape 6 : retourner les gels**

Dans `message-send.baseline.test.ts` :
- test « broadcast B appauvri » → remplacer le corps par :

```ts
    const manager = stripComments(readSource('socketio/MeeshySocketIOManager.ts'));
    // CIBLE ATTEINTE (Tâche 12) : le miroir n'existe plus ; broadcastMessage
    // délègue à l'implémentation unique.
    expect(manager).not.toContain('private async _broadcastNewMessage');
    expect(manager).toContain('broadcastNewMessage');
```

- test « l'agent ZMQ n'est jamais réveillé » → :

```ts
    const occurrences = manager.split('_notifyAgent').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2); // définition + au moins un site d'appel
```

- [ ] **Étape 7 : relancer large**

Run : `bun run test -- src/__tests__/parity/ src/__tests__/unit/events/ src/__tests__/unit/handlers/ src/__tests__/unit/routes/message-send-block.test.ts src/socketio/handlers/__tests__/`
Adapter les tests existants qui mockaient `_broadcastNewMessage` ou vérifiaient les appels directs (notamment `MessageHandler.core.test.ts` : les assertions « broadcastNewMessage appelé après send » deviennent « publisher.publish appelé avec message.created »).
Run : `bunx tsc --noEmit` et `bunx tsc --noEmit -p tsconfig.test.json`

- [ ] **Étape 8 : commiter**

```
git add services/gateway/src/socketio/MeeshySocketIOManager.ts services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/services/messaging/MessagingService.ts services/gateway/src/routes/conversations/messages.ts services/gateway/src/routes/links/messages.ts services/gateway/src/socketio/events/message-created.ts services/gateway/src/server.ts services/gateway/src/__tests__/unit/events/message-created-dispatch.test.ts services/gateway/src/__tests__/parity/message-send.baseline.test.ts
git commit -m "feat(gateway): un seul broadcast message:new — message.created publie par le service, miroir supprime"
```

(ajouter au `git add` les fichiers de test existants adaptés à l'étape 7).

## Tâche 13 — Édition de message : une implémentation, quatre adaptateurs

Applique la décision **B.5** (auteur seul ; fenêtre 24 h généralisée — resserrement assumé pour iOS porte E2 et Android porte E4 ; garde `deletedAt` atomique ; mentions et liens retraités ; retraduction publique ; file offline).

**Fichiers :**
- Modifier : `services/gateway/src/services/messaging/MessagingService.ts` — nouvelle méthode `editMessage`
- Modifier (adaptateurs) : `services/gateway/src/socketio/handlers/MessageHandler.ts` (`handleMessageEdit`, ancre vers 570) ; `services/gateway/src/routes/messages.ts` (PUT, ancre `fastify.put` vers 216) ; `services/gateway/src/routes/conversations/messages-advanced.ts` (PUT vers 57 et PATCH vers 694)
- Modifier : `services/gateway/src/socketio/events/message-created.ts` → renommer le registre en y ajoutant `message.updated` (ou créer `message-updated.ts` sur le même modèle)
- Créer : `services/gateway/src/__tests__/unit/services/messaging-edit.test.ts`
- Modifier (baselines) : retirer de `BASELINE_PRISMA_WRITES_IN_TRANSPORT` les fichiers devenus propres le cas échéant (seulement si PLUS AUCUNE écriture Prisma n'y reste — `routes/messages.ts` garde le DELETE jusqu'à la Tâche 14)

**Interfaces :**
- Consomme : `CallContext` (Tâche 5) ; `DomainEventPublisher` (Tâche 8) ; `MentionService` et `TrackingLinkService` existants (reprendre les appels du bloc E3, `messages-advanced.ts:203-217` et `:280-450`) ; `translationService.retranslateMessageAsync(messageId, payload)` (API publique, `MessageTranslationService.ts:563`).
- Produit (consommé par les 4 adaptateurs) :

```ts
export interface EditMessageCommand { messageId: string; content: string; }
// MessagingService :
async editMessage(ctx: CallContext, cmd: EditMessageCommand): Promise<Message>
// jette : NotFoundError('Message'), PermissionDeniedError (non-auteur),
//         ConflictError('EDIT_WINDOW_EXPIRED') (>24 h),
//         ConflictError('MESSAGE_DELETED') (supprimé concurremment)
// publie : { type: 'message.updated', ctx, conversationId, message }
```

- [ ] **Étape 1 : écrire les tests du service (rouges)**

`services/gateway/src/__tests__/unit/services/messaging-edit.test.ts` :

```ts
/**
 * MessagingService.editMessage — l'union des gardes des 4 portes (spec §1.2,
 * décision B.5). Les tests négatifs d'abord : une permission accordée par
 * erreur ne se remarque pas.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { MessagingService } from '../../../services/messaging/MessagingService';
import { internalCallContext } from '@meeshy/shared/types/call-context';
import type { CallContext } from '@meeshy/shared/types/call-context';

const NOW = new Date('2026-07-29T12:00:00Z');
const userCtx = (userId: string): CallContext => ({
  transport: 'rest', requestId: 'r1', receivedAt: NOW,
  actor: { kind: 'user', userId, role: 'USER', displayName: 'U', language: 'fr' },
});

function makeService(message: Record<string, unknown> | null, updatedCount = 1) {
  const prisma = {
    message: {
      findFirst: jest.fn(async () => message),
      updateMany: jest.fn(async () => ({ count: updatedCount })),
      findUnique: jest.fn(async () => ({ ...message, content: 'après', isEdited: true })),
    },
  };
  const publisher = { publish: jest.fn() };
  const service = Object.create(MessagingService.prototype) as MessagingService;
  Object.assign(service, {
    prisma, publisher,
    mentionService: { extractAndNotifyOnEdit: jest.fn(async () => []) },
    trackingLinkService: { processMessageLinks: jest.fn(async () => ({ processedContent: 'après', trackingLinks: [] })) },
    translationService: { retranslateMessageAsync: jest.fn(() => Promise.resolve()) },
  });
  return { service, prisma, publisher };
}

const baseMessage = {
  id: 'm1', conversationId: 'c1', content: 'avant', deletedAt: null,
  createdAt: new Date(NOW.getTime() - 60_000),
  sender: { userId: 'author-1' },
};

describe('editMessage — refus (tests négatifs)', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(NOW); });

  it("refuse un non-auteur, même modérateur global (décision B.5 : l'édition n'est pas de la modération)", async () => {
    const { service, prisma } = makeService(baseMessage);
    const modCtx: CallContext = { ...userCtx('someone-else'), actor: { kind: 'user', userId: 'someone-else', role: 'MODERATOR', displayName: 'M', language: 'fr' } };
    await expect(service.editMessage(modCtx, { messageId: 'm1', content: 'x' })).rejects.toThrow(/permission|denied/i);
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('refuse un acteur anonyme', async () => {
    const { service } = makeService(baseMessage);
    const anonCtx: CallContext = { ...userCtx(''), actor: { kind: 'anonymous', participantId: 'p1', displayName: 'A', language: 'fr' } };
    await expect(service.editMessage(anonCtx, { messageId: 'm1', content: 'x' })).rejects.toThrow(/permission|denied/i);
  });

  it('refuse après la fenêtre de 24 h (EDIT_WINDOW_EXPIRED)', async () => {
    const old = { ...baseMessage, createdAt: new Date(NOW.getTime() - 25 * 3600_000) };
    const { service } = makeService(old);
    await expect(service.editMessage(userCtx('author-1'), { messageId: 'm1', content: 'x' }))
      .rejects.toMatchObject({ code: 'EDIT_WINDOW_EXPIRED' });
  });

  it('détecte la suppression concurrente : updateMany conditionné sur deletedAt: null', async () => {
    const { service, prisma } = makeService(baseMessage, 0); // 0 ligne touchée = supprimé entre-temps
    await expect(service.editMessage(userCtx('author-1'), { messageId: 'm1', content: 'x' }))
      .rejects.toMatchObject({ code: 'MESSAGE_DELETED' });
    const arg = (prisma.message.updateMany.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown> };
    expect(arg.where).toMatchObject({ id: 'm1', deletedAt: null });
  });
});

describe('editMessage — effets', () => {
  beforeEach(() => { jest.useFakeTimers().setSystemTime(NOW); });

  it("écrit contenu + isEdited + translations: null dans LE MÊME updateMany, puis publie message.updated", async () => {
    const { service, prisma, publisher } = makeService(baseMessage);
    await service.editMessage(userCtx('author-1'), { messageId: 'm1', content: 'après' });
    const arg = (prisma.message.updateMany.mock.calls[0] as unknown[])[0] as { data: Record<string, unknown> };
    expect(arg.data).toMatchObject({ isEdited: true, translations: null });
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'message.updated', conversationId: 'c1' }));
  });

  it('relance la retraduction par l’API publique (fire-and-forget)', async () => {
    const { service } = makeService(baseMessage);
    await service.editMessage(userCtx('author-1'), { messageId: 'm1', content: 'après' });
    expect((service as unknown as { translationService: { retranslateMessageAsync: jest.Mock } })
      .translationService.retranslateMessageAsync).toHaveBeenCalled();
  });
});
```

Note d'implémentation du test : `Object.create(MessagingService.prototype)` évite de reproduire le constructeur complet ; si le service expose ses dépendances sous d'autres noms de propriété, ALIGNER le test sur les noms réels (les lire dans le fichier), pas l'inverse.

Run : `bun run test -- src/__tests__/unit/services/messaging-edit.test.ts` → rouge (`editMessage is not a function`).

- [ ] **Étape 2 : implémenter `editMessage`**

Dans `MessagingService.ts` :

```ts
  /** Union des gardes des quatre portes d'édition (spec §1.2, décision B.5). */
  async editMessage(ctx: CallContext, cmd: { messageId: string; content: string }): Promise<Message> {
    if (ctx.actor.kind !== 'user') {
      throw new PermissionDeniedError('Seul un utilisateur enregistré peut éditer un message');
    }
    const message = await this.prisma.message.findFirst({
      where: { id: cmd.messageId },
      select: { id: true, conversationId: true, content: true, createdAt: true, deletedAt: true,
                sender: { select: { userId: true } } },
    });
    if (!message || message.deletedAt) throw new NotFoundError('Message');
    if (message.sender?.userId !== ctx.actor.userId) {
      throw new PermissionDeniedError("Seul l'auteur peut éditer son message");
    }
    const EDIT_WINDOW_MS = 24 * 3600 * 1000;
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
      throw new ConflictError("Fenêtre d'édition de 24 h dépassée", 'EDIT_WINDOW_EXPIRED');
    }
    const processed = await this.trackingLinkService.processMessageLinks(cmd.content, message.conversationId);
    const { count } = await this.prisma.message.updateMany({
      where: { id: cmd.messageId, deletedAt: null },
      data: { content: processed.processedContent, isEdited: true, editedAt: new Date(), translations: null },
    });
    if (count === 0) throw new ConflictError('Message supprimé pendant l’édition', 'MESSAGE_DELETED');
    const updated = await this.prisma.message.findUnique({ where: { id: cmd.messageId }, /* include du payload complet : reprendre l'include de saveMessage */ });
    // Mentions ré-extraites + notifiées : déplacer ici le bloc de
    // messages-advanced.ts (ancre « ré-extraction des mentions », ~:280-450),
    // en le réduisant aux appels MentionService/notifications.
    this.translationService.retranslateMessageAsync(cmd.messageId, { /* reprendre le payload construit par MessageHandler.ts ancre retranslateMessageAsync */ })
      .catch(() => undefined);
    this.publisher.publish({ type: 'message.updated', ctx, conversationId: message.conversationId, message: updated });
    return updated as Message;
  }
```

Les imports (`PermissionDeniedError`, `NotFoundError`, `ConflictError` depuis `../../errors/custom-errors`) et les deux blocs « reprendre » se copient depuis leurs ancres citées — ce sont des déplacements de code existant, pas de l'écriture nouvelle. Ajouter `'message.updated'` au dispatcher : handler qui reprend l'émission `MESSAGE_EDITED` + enfilage offline du bloc E1 (`MessageHandler.ts`, ancre de l'émission après édition, ~:650-695) — extraire ce bloc en méthode publique `broadcastMessageEdited(message, conversationId, senderSocket?)` du `MessageHandler` et l'appeler depuis le handler d'événement (même motif exact que `message-created.ts`).

- [ ] **Étape 3 : brancher les quatre adaptateurs**

Chaque porte devient : valider la forme → construire/récupérer le ctx → `messagingService.editMessage(ctx, { messageId, content })` → formater. Supprimer dans chacune : le check d'auteur local, la fenêtre locale, l'update Prisma local, l'appel de retraduction local (cast `as any` pour E2/E3/E4 — les retirer fait décroître `BASELINE_PRIVATE_CASTS` : retirer `routes/messages.ts` et `routes/conversations/messages-advanced.ts` de cette baseline **dans ce commit** si plus aucun cast n'y reste — attention, E2 garde son cast jusqu'à ce que ce commit le retire, et `messages-advanced.ts` en a deux). Réponses : conserver la forme actuelle de chaque porte (les clients Android/iOS/web ne doivent voir aucune différence de contrat) ; mapper les erreurs : `EDIT_WINDOW_EXPIRED` → 403 pour E3 (comportement existant), 403 nouveau pour E2/E4 (resserrement B.5, à mentionner dans le message de commit) ; socket E1 → `socketAckFor(err)` (Tâche 9).

- [ ] **Étape 4 : relancer**

Run : `bun run test -- src/__tests__/unit/services/messaging-edit.test.ts src/__tests__/unit/routes/messages.test.ts src/__tests__/unit/routes/conversation-messages-advanced.test.ts src/socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts` — adapter les tests d'adaptateurs existants (ils mockent Prisma en direct ; ils mockeront `MessagingService.editMessage`).
Run : `bunx tsc --noEmit`

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/messaging/MessagingService.ts services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/routes/messages.ts services/gateway/src/routes/conversations/messages-advanced.ts services/gateway/src/socketio/events/message-created.ts services/gateway/src/__tests__/unit/services/messaging-edit.test.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway): edition de message unifiee — auteur seul, fenetre 24h, garde atomique, retraduction publique"
```

(y ajouter les fichiers de test adaptés ; si un nouveau fichier `message-updated.ts` a été créé, l'ajouter aussi).

## Tâche 14 — Suppression de message : une implémentation, trois adaptateurs, tests négatifs d'abord

Applique la décision **B.1** : `auteur ∨ participant.role ∈ {admin, moderator} ∨ user.role ∈ {MODERATOR, ADMIN, BIGBOSS}`. **Cette unification accorde des pouvoirs** : sur la porte D3 (iOS + web), les admins/modérateurs DE CONVERSATION gagnent la suppression. La branche `CREATOR` de D2 était morte (valeur absente de l'enum `UserRole`, `schema.prisma:18-26`) et disparaît sans effet.

**Fichiers :**
- Modifier : `services/gateway/src/services/messaging/MessagingService.ts` — nouvelle méthode `deleteMessage`
- Modifier (adaptateurs) : `MessageHandler.ts` (`handleMessageDelete`, vers 712) ; `routes/messages.ts` (DELETE, vers 374) ; `routes/conversations/messages-advanced.ts` (DELETE, vers 518)
- Créer : `services/gateway/src/__tests__/unit/services/messaging-delete.test.ts`
- Modifier : dispatcher — événement `message.deleted` (extraction du broadcast + file offline de D1, `MessageHandler.ts` ancre du bloc après suppression, ~:800-845, en méthode publique `broadcastMessageDeleted`)
- Modifier (baselines) : retirer `routes/messages.ts` et `routes/conversations/messages-advanced.ts` de `BASELINE_PRISMA_WRITES_IN_TRANSPORT` s'ils deviennent propres (après Tâche 13 + celle-ci, il ne doit plus y rester d'écriture)

**Interfaces :**
- Consomme : `CallContext` (Tâche 5), `DomainEventPublisher` (Tâche 8), `socketAckFor` (Tâche 9).
- Produit :

```ts
export interface DeleteMessageCommand { messageId: string; }
async deleteMessage(ctx: CallContext, cmd: DeleteMessageCommand): Promise<void>
// jette NotFoundError / PermissionDeniedError ; publie { type: 'message.deleted', ctx, conversationId, messageId, deletedBy }
// effets uniques : 1 write atomique { deletedAt, translations: null } gardé sur deletedAt: null ;
//                  recalcul lastMessageAt (motif D1, MessageHandler.ts ~:806-820) ;
//                  broadcast + file offline via l'événement.
```

- [ ] **Étape 1 : écrire les tests négatifs puis positifs (rouges)**

`services/gateway/src/__tests__/unit/services/messaging-delete.test.ts` :

```ts
/**
 * MessagingService.deleteMessage — décision B.1. Les tests NÉGATIFS comptent
 * plus que les positifs : une permission accordée par erreur est invisible.
 * Matrice : auteur ✓ ; admin/modo de conversation ✓ ; modération globale ✓ ;
 * membre simple ✗ ; anonyme ✗ ; non-participant ✗ ; admin d'une AUTRE
 * conversation ✗.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { MessagingService } from '../../../services/messaging/MessagingService';
import type { CallContext } from '@meeshy/shared/types/call-context';

const ctxUser = (userId: string, role = 'USER'): CallContext => ({
  transport: 'rest', requestId: 'r', receivedAt: new Date(),
  actor: { kind: 'user', userId, role, displayName: 'U', language: 'fr' },
});
const ctxAnon: CallContext = {
  transport: 'rest', requestId: 'r', receivedAt: new Date(),
  actor: { kind: 'anonymous', participantId: 'p9', displayName: 'A', language: 'fr' },
};

function makeService(opts: { authorUserId?: string; participantRole?: string | null }) {
  // participantRole: rôle du DEMANDEUR dans la conversation du message ;
  // null = pas participant.
  const message = {
    id: 'm1', conversationId: 'c1', deletedAt: null, createdAt: new Date(),
    sender: { userId: opts.authorUserId ?? 'author-1' },
  };
  const prisma = {
    message: {
      findFirst: jest.fn(async () => message),
      updateMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async () => []),
    },
    participant: {
      findFirst: jest.fn(async (args: { where: { conversationId: string } }) =>
        opts.participantRole === null || args.where.conversationId !== 'c1'
          ? null
          : { id: 'part-1', role: opts.participantRole ?? 'member' }),
    },
    conversation: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const publisher = { publish: jest.fn() };
  const service = Object.create(MessagingService.prototype) as MessagingService;
  Object.assign(service, { prisma, publisher });
  return { service, prisma, publisher };
}

describe('deleteMessage — refus', () => {
  it('refuse un membre simple non-auteur', async () => {
    const { service, prisma } = makeService({ participantRole: 'member' });
    await expect(service.deleteMessage(ctxUser('not-author'), { messageId: 'm1' })).rejects.toThrow(/permission/i);
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
  });
  it('refuse un anonyme', async () => {
    const { service } = makeService({ participantRole: 'member' });
    await expect(service.deleteMessage(ctxAnon, { messageId: 'm1' })).rejects.toThrow(/permission/i);
  });
  it('refuse un non-participant sans rôle global', async () => {
    const { service } = makeService({ participantRole: null });
    await expect(service.deleteMessage(ctxUser('outsider'), { messageId: 'm1' })).rejects.toThrow(/permission/i);
  });
  it("refuse un admin d'une AUTRE conversation (le rôle est local à la conversation)", async () => {
    const { service, prisma } = makeService({ participantRole: null });
    // findFirst participant est filtré par conversationId: 'c1' → null ici.
    await expect(service.deleteMessage(ctxUser('admin-elsewhere'), { messageId: 'm1' })).rejects.toThrow(/permission/i);
    expect(prisma.participant.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ conversationId: 'c1' }),
    }));
  });
  it("refuse le rôle global fantôme CREATOR (absent de l'enum UserRole)", async () => {
    const { service } = makeService({ participantRole: 'member' });
    await expect(service.deleteMessage(ctxUser('x', 'CREATOR'), { messageId: 'm1' })).rejects.toThrow(/permission/i);
  });
});

describe('deleteMessage — autorisations et effets', () => {
  it("autorise l'auteur et publie message.deleted", async () => {
    const { service, publisher } = makeService({ authorUserId: 'me', participantRole: 'member' });
    await service.deleteMessage(ctxUser('me'), { messageId: 'm1' });
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'message.deleted', conversationId: 'c1', messageId: 'm1', deletedBy: 'me',
    }));
  });
  it('autorise un admin de la conversation', async () => {
    const { service, prisma } = makeService({ participantRole: 'admin' });
    await service.deleteMessage(ctxUser('conv-admin'), { messageId: 'm1' });
    const arg = (prisma.message.updateMany.mock.calls[0] as unknown[])[0] as { where: Record<string, unknown>; data: Record<string, unknown> };
    expect(arg.where).toMatchObject({ id: 'm1', deletedAt: null }); // write unique, atomique
    expect(arg.data).toMatchObject({ translations: null });
  });
  it('autorise la modération globale (MODERATOR)', async () => {
    const { service } = makeService({ participantRole: 'member' });
    await expect(service.deleteMessage(ctxUser('mod', 'MODERATOR'), { messageId: 'm1' })).resolves.toBeUndefined();
  });
});
```

Run : `bun run test -- src/__tests__/unit/services/messaging-delete.test.ts` → rouge (`deleteMessage is not a function`).

- [ ] **Étape 2 : implémenter**

```ts
  /** Politique unique de suppression (décision B.1). */
  async deleteMessage(ctx: CallContext, cmd: { messageId: string }): Promise<void> {
    if (ctx.actor.kind !== 'user') throw new PermissionDeniedError('Suppression réservée aux utilisateurs enregistrés');
    const { userId, role } = ctx.actor;
    const message = await this.prisma.message.findFirst({
      where: { id: cmd.messageId },
      select: { id: true, conversationId: true, deletedAt: true, createdAt: true,
                sender: { select: { userId: true } } },
    });
    if (!message || message.deletedAt) throw new NotFoundError('Message');
    const isAuthor = message.sender?.userId === userId;
    let allowed = isAuthor || role === 'MODERATOR' || role === 'ADMIN' || role === 'BIGBOSS';
    if (!allowed) {
      const membership = await this.prisma.participant.findFirst({
        where: { conversationId: message.conversationId, userId, isActive: true },
        select: { id: true, role: true },
      });
      allowed = membership?.role === 'admin' || membership?.role === 'moderator';
    }
    if (!allowed) throw new PermissionDeniedError('Suppression non autorisée');
    const { count } = await this.prisma.message.updateMany({
      where: { id: cmd.messageId, deletedAt: null },
      data: { deletedAt: new Date(), translations: null },
    });
    if (count === 0) throw new NotFoundError('Message');
    await this.recalculateLastMessageAt(message.conversationId, cmd.messageId);
    this.publisher.publish({ type: 'message.deleted', ctx, conversationId: message.conversationId,
                             messageId: cmd.messageId, deletedBy: userId });
  }
```

`recalculateLastMessageAt` : extraire tel quel le bloc gardé de D1 (`MessageHandler.ts`, ancre du recalcul `lastMessageAt` ~:806-820) en méthode privée du service. Dispatcher : enregistrer `message.deleted` → `messageHandler.broadcastMessageDeleted(messageId, conversationId, deletedBy, senderSocket?)`, méthode publique extraite du bloc D1 (émission + file offline avec exclusion du suppresseur, ancre ~:825-845).

- [ ] **Étape 3 : brancher les trois adaptateurs** (même geste qu'en Tâche 13 : forme → ctx → service → réponse conservée ; erreurs via `socketAckFor` côté socket ; supprimer les checks et writes locaux ; retirer les fichiers devenus propres des baselines).

- [ ] **Étape 4 : relancer**

Run : `bun run test -- src/__tests__/unit/services/messaging-delete.test.ts src/__tests__/unit/routes/messages.test.ts src/__tests__/unit/routes/conversation-messages-advanced.test.ts src/socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts src/__tests__/source-guards/`
Run : `bunx tsc --noEmit`

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/messaging/MessagingService.ts services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/routes/messages.ts services/gateway/src/routes/conversations/messages-advanced.ts services/gateway/src/__tests__/unit/services/messaging-delete.test.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway): suppression de message unifiee — auteur, admins de conversation, moderation ; tests negatifs"
```

## Tâche 15 — Garde de blocage DM partagée et rate limit REST des messages

**Fichiers :**
- Créer : `services/gateway/src/services/messaging/dm-block-guard.ts`
- Modifier : `services/gateway/src/socketio/handlers/MessageHandler.ts` (`_isDirectMessageBlocked`, ancre vers 1691 — devient un appel au module partagé)
- Modifier : `services/gateway/src/routes/conversations/messages.ts` (bloc inline `isBlockedBetween`, ancre vers 1737-1763 — remplacé par le module partagé, qui apporte le cache 5 min au REST)
- Modifier : `services/gateway/src/server.ts` — brancher `registerMessageRateLimiter` (défini `middleware/rate-limiter.ts:20`, jamais appelé — spec §1.2)
- Créer : `services/gateway/src/__tests__/unit/services/dm-block-guard.test.ts`

**Interfaces :**
- Consomme (existant) : `isBlockedBetween` et le cache `utils/block-cache.ts` (`BLOCK_CACHE_TTL_SECONDS = 300`, clé symétrique `blockCacheKey`).
- Produit :

```ts
// services/gateway/src/services/messaging/dm-block-guard.ts
export async function isDirectMessageBlocked(
  prisma: PrismaClient,
  redis: RedisLike | undefined,
  conversationId: string,
  senderUserId: string,
): Promise<boolean>;
```

- [ ] **Étape 1 : test rouge** — `dm-block-guard.test.ts` : trois cas : conversation `direct` bloquée → `true` ; conversation `group` avec blocage existant → `false` (jamais appliqué hors direct) ; résultat mis en cache (2ᵉ appel sans nouvelle requête Prisma — asserter sur le compteur d'appels du mock). Écrire les mocks sur le motif de `message-send-block.test.ts` (le comportement attendu est celui, à l'identique, du bloc socket actuel `MessageHandler.ts:1691-1729` — le copier est l'implémentation).

Run : `bun run test -- src/__tests__/unit/services/dm-block-guard.test.ts` → `Cannot find module`.

- [ ] **Étape 2 : implémenter** — déplacer le corps de `_isDirectMessageBlocked` dans le module partagé (généraliser `this.prisma`/`this.redis` en paramètres) ; le handler socket et la route REST l'appellent tous deux. La route REST conserve exactement sa réponse `403 USER_BLOCKED` ; le fichier `message-send-block.test.ts` doit passer sans modification d'assertion.

- [ ] **Étape 3 : brancher le rate limit REST** — dans `server.ts`, à côté de `registerGlobalRateLimiter` (ancre, vers 604) : `registerMessageRateLimiter(this.server);` avec son import. Vérifier dans `middleware/rate-limiter.ts` la portée réelle du limiteur (préfixe d'URL) ; s'il exige un paramétrage, cibler `POST /api/v1/conversations/:id/messages`.

- [ ] **Étape 4 : relancer** — `bun run test -- src/__tests__/unit/services/dm-block-guard.test.ts src/__tests__/unit/routes/message-send-block.test.ts src/__tests__/unit/handlers/` puis `bunx tsc --noEmit`.

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/messaging/dm-block-guard.ts services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/routes/conversations/messages.ts services/gateway/src/server.ts services/gateway/src/__tests__/unit/services/dm-block-guard.test.ts
git commit -m "feat(gateway): garde de blocage DM partagee (cache 5 min pour REST) et rate limit messages branche"
```

---

# Phase 4 — Réactions

## Tâche 16 — Réactions de commentaire cumulées, un seul service, unlike diffusé

Applique la décision **B.2** : un utilisateur peut porter plusieurs emojis distincts sur un commentaire. La contrainte d'unicité en base porte **déjà** sur le triplet (`@@unique([commentId, userId, emoji])`, `schema.prisma:1203`) — aucune migration ; l'invariant « une seule » n'existait qu'en couche applicative, dans deux versions opposées, qui disparaissent toutes deux.

**Fichiers :**
- Modifier : `services/gateway/src/services/CommentReactionService.ts` — retirer l'invariant (`MAX_REACTIONS_PER_USER`, ancre vers 111-124) ; publier `reaction.changed`
- Modifier : `services/gateway/src/services/PostCommentService.ts` — supprimer `likeComment`/`unlikeComment` (ancres vers 359 et 386) et `syncCommentLikeCounters` (vers 401) au profit du service unique
- Modifier : `services/gateway/src/routes/posts/comments.ts` — les handlers `POST|DELETE /posts/:postId/comments/:commentId/like` (ancres vers 329 et 396) deviennent des adaptateurs de `CommentReactionService` ; supprimer l'appel `createCommentLikeNotification` (vers 377)
- Modifier : `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` — extraire l'émission en méthode publique `broadcastCommentReaction(...)` (ancres : émissions `comment:reaction-added` vers 162 et `comment:reaction-removed` vers 261) ; le handler délègue au service et répond via `socketAckFor`
- Modifier : dispatcher — enregistrer `reaction.changed` pour `target.kind === 'comment'`
- Créer : `services/gateway/src/__tests__/unit/services/comment-reactions-cumulative.test.ts`
- Modifier (retourner les gels) : `src/__tests__/parity/reactions.baseline.test.ts` (3 assertions)

**Interfaces :**
- Consomme : `DomainEventPublisher` (Tâche 8), `socketAckFor`/`okAck` (Tâche 9), `nextSocketCallContext` (Tâche 7), `buildRestCallContext` via `request.callContext` (Tâche 6).
- Consomme (existant) : `CommentReactionService.addReaction({ commentId, userId, emoji })` / `removeReaction({ commentId, userId, emoji })` (`CommentReactionService.ts:85`, `:163`) ; `updateCommentReactionSummary` (`:380` — `groupBy` par emoji, `likeCount = reactionCount = total`, sémantique conservée : cumulative par construction) ; `createCommentReactionNotification` (`NotificationService.ts:1561` — devient LA notification unique ; `createCommentLikeNotification` n'a plus d'appelant).
- Produit : le service publie `{ type: 'reaction.changed', ctx, target: { kind: 'comment', id: commentId, postId }, action, emoji, userId, summary, counts }` après chaque mutation ; le dispatcher émet `comment:reaction-added`/`comment:reaction-removed` (famille écoutée par le web `use-post-socket-cache-sync.ts:290/:314` et iOS `SocialSocketManager.swift:1072/:1079`) **plus** `comment:liked` en compatibilité transitoire (écouteurs `use-post-socket-cache-sync.ts:228`, `FeedSocketHandler.swift:94`), et déclenche la notification unique — pour les DEUX transports. Le « unlike REST jamais diffusé » devient inexprimable.

- [ ] **Étape 1 : retourner les gels (rouges d'abord)**

Dans `reactions.baseline.test.ts` :
- « invariant une réaction max côté socket » → `expect(svc).not.toContain('MAX_REACTIONS_PER_USER');` et `expect(svc).not.toContain('throw new Error(');` (le service ne lève plus que des `BaseAppError`) ;
- « le REST purge silencieusement » → `expect(svc).not.toContain('emoji: { not: emoji }');` ;
- « unlike REST non diffusé » → le corps devient :

```ts
    const routes = stripComments(readSource('routes/posts/comments.ts'));
    // CIBLE (Tâche 16) : la route est un adaptateur ; l'émission vit dans le
    // dispatcher, déclenchée par le service pour les deux transports.
    expect(routes).toContain('CommentReactionService');
    expect(routes).not.toContain('createCommentLikeNotification');
```

Run : `bun run test -- src/__tests__/parity/reactions.baseline.test.ts` → 3 échecs (rouge attendu).

- [ ] **Étape 2 : test du comportement cumulé (rouge)**

`services/gateway/src/__tests__/unit/services/comment-reactions-cumulative.test.ts` :

```ts
/**
 * Décision B.2 — réactions de commentaire CUMULÉES. Le même utilisateur pose
 * plusieurs emojis distincts ; un doublon exact est idempotent (unchanged) ;
 * chaque mutation publie reaction.changed.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { CommentReactionService } from '../../../services/CommentReactionService';

function makeService(existing: Array<{ emoji: string }>) {
  const created: Array<Record<string, unknown>> = [];
  const prisma = {
    postComment: { findUnique: jest.fn(async () => ({ id: 'cm1', postId: 'p1', deletedAt: null, authorId: 'author' })) },
    commentReaction: {
      findMany: jest.fn(async () => existing),
      findFirst: jest.fn(async (args: { where: { emoji: string } }) =>
        existing.find((r) => r.emoji === args.where.emoji) ?? null),
      create: jest.fn(async (args: { data: Record<string, unknown> }) => { created.push(args.data); return { id: 'r1', ...args.data, createdAt: new Date() }; }),
      groupBy: jest.fn(async () => [...existing, ...created].reduce((acc: Array<{ emoji: string; _count: { emoji: number } }>, r) => {
        const hit = acc.find((a) => a.emoji === r.emoji);
        if (hit) hit._count.emoji += 1; else acc.push({ emoji: r.emoji as string, _count: { emoji: 1 } });
        return acc;
      }, [])),
    },
  };
  const publisher = { publish: jest.fn() };
  const service = new CommentReactionService(prisma as never);
  (service as unknown as { publisher: unknown }).publisher = publisher;
  return { service, prisma, publisher, created };
}

describe('réactions de commentaire cumulées', () => {
  it("accepte un DEUXIÈME emoji distinct du même utilisateur (l'invariant une-max a disparu)", async () => {
    const { service, created } = makeService([{ emoji: '❤️' }]);
    const result = await service.addReaction({ commentId: 'cm1', userId: 'u1', emoji: '😂' });
    expect(result).not.toBeNull();
    expect(created).toHaveLength(1);
  });

  it('reste idempotent sur le doublon exact (unchanged)', async () => {
    const { service, created } = makeService([{ emoji: '❤️' }]);
    const result = await service.addReaction({ commentId: 'cm1', userId: 'u1', emoji: '❤️' });
    expect(result?.unchanged).toBe(true);
    expect(created).toHaveLength(0);
  });

  it('publie reaction.changed avec le résumé cumulé', async () => {
    const { service, publisher } = makeService([{ emoji: '❤️' }]);
    await service.addReaction({ commentId: 'cm1', userId: 'u1', emoji: '😂' });
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'reaction.changed',
      target: expect.objectContaining({ kind: 'comment', id: 'cm1' }),
      action: 'added', emoji: '😂',
    }));
  });
});
```

Adapter les noms de mocks Prisma aux requêtes réelles du service (les lire : `findUnique` du commentaire vers 98, `findMany` des réactions existantes vers 113, `findFirst` du doublon vers 127) — le test doit piloter les VRAIES requêtes, pas des requêtes imaginées. Si le constructeur du service prend d'autres arguments, les fournir.

Run : rouge (le 2ᵉ emoji lève aujourd'hui `Maximum 1 different reactions…` ; `publisher` n'existe pas).

- [ ] **Étape 3 : implémenter côté service** — dans `CommentReactionService.ts` : supprimer le bloc `MAX_REACTIONS_PER_USER` (les lignes `const MAX_REACTIONS_PER_USER = 1;` jusqu'au `throw` inclus, et le `findMany` qui ne sert qu'à lui SI rien d'autre ne le lit) ; ajouter `private publisher: DomainEventPublisher = NULL_PUBLISHER` au constructeur (dernier paramètre optionnel) et une surcharge de `addReaction`/`removeReaction` acceptant un `ctx?: CallContext` ; après `updateCommentReactionSummary`, publier `reaction.changed` (relire le résumé retourné). Remplacer les `throw new Error('Comment not found')` / `'Comment has been deleted'` par `NotFoundError('Comment')`.

- [ ] **Étape 4 : adaptateurs** — `routes/posts/comments.ts` : les deux handlers like/unlike appellent `commentReactionService.addReaction/removeReaction` (emoji du body, défaut `'❤️'` conservé — le repli REST iOS poste sans body) avec `request.callContext` ; ils ne diffusent plus rien eux-mêmes et ne notifient plus. `PostCommentService` : supprimer `likeComment`, `unlikeComment`, `syncCommentLikeCounters` (vérifier par grep qu'il ne reste aucun appelant). `CommentReactionHandler` : extraire l'émission en `broadcastCommentReaction(action, payload)` publique ; le handler délègue au service (qui publie) et répond `okAck(...)`/`socketAckFor(err)`. Dispatcher : enregistrer un handler `reaction.changed` qui route `target.kind === 'comment'` vers `broadcastCommentReaction` + `createCommentReactionNotification` (motif de câblage identique à `message-created.ts`, Tâche 12). Instancier le service AVEC le publisher aux deux points de construction (grep `new CommentReactionService(` : `MeeshySocketIOManager.ts:373` + le nouveau point côté routes — partager l'instance via une décoration Fastify plutôt que d'en créer deux si le motif existe pour d'autres services).

- [ ] **Étape 5 : relancer large** — `bun run test -- src/__tests__/parity/reactions.baseline.test.ts src/__tests__/unit/services/comment-reactions-cumulative.test.ts "src/routes/posts/__tests__/"` + les tests existants de `CommentReactionHandler` (les adapter : plus d'invariant, ack typé). `bunx tsc --noEmit`.

- [ ] **Étape 6 : commiter**

```
git add services/gateway/src/services/CommentReactionService.ts services/gateway/src/services/PostCommentService.ts services/gateway/src/routes/posts/comments.ts services/gateway/src/socketio/handlers/CommentReactionHandler.ts services/gateway/src/__tests__/unit/services/comment-reactions-cumulative.test.ts services/gateway/src/__tests__/parity/reactions.baseline.test.ts
git commit -m "feat(gateway): reactions de commentaire cumulees — service unique, unlike diffuse, notification unique"
```

(ajouter le fichier de câblage dispatcher modifié et les tests adaptés).

## Tâche 17 — Réactions cumulées : inventaire du travail client induit

**Fichiers :**
- Créer : `docs/superpowers/specs/2026-07-30-reactions-commentaire-cumulees-clients.md`

Tâche documentaire : la décision B.2 change un contrat implicite ; le travail client est réel mais HORS périmètre de ce plan. L'inventaire ci-dessous a été vérifié dans le code au 2026-07-29 — le recopier dans le document, re-vérifier chaque point par grep (les fichiers bougent), compléter si besoin, et ne rien implémenter.

- [ ] **Étape 1 : rédiger le document** avec ce contenu vérifié :

```markdown
# Réactions de commentaire cumulées — travail client induit (hors gateway)

Décision produit : un utilisateur peut porter plusieurs emojis distincts sur un
même commentaire. Le gateway l'applique (plan 2026-07-29, Tâche 16). État des
clients au 2026-07-29 :

## Déjà compatibles (aucun changement)
- Les modèles sont des TABLEAUX partout : iOS `FeedComment.currentUserReactions:
  [String]?` (packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift:360,
  persisté GRDB) ; web `currentUserReactions` (types partagés).
- L'update optimiste web AJOUTE sans retirer les autres emojis
  (apps/web/hooks/queries/use-comment-mutations.ts:213-215) et le retrait filtre
  l'emoji exact (:279) — déjà cumulatif.

## À adapter
1. iOS — repli REST du like : POST sans body → ❤️ forcé côté serveur
   (packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:234). Doit
   transmettre l'emoji réellement choisi, sinon le repli d'un « 😂 » pose un ❤️.
2. iOS — toute UI qui dérive un booléen « liké » de la PRÉSENCE d'une réaction
   doit tolérer n réactions (FeedCommentsSheet.swift, PostDetailViewModel.swift,
   StoryViewerView+Content.swift:2310) : vérifier les toggles — un tap sur un
   emoji déjà posé retire CET emoji, pas « la » réaction.
3. iOS — OutboxDispatcher kind `.toggleLikeComment`
   (apps/ios/.../Services/OutboxDispatcher.swift:636-656) : chemin aujourd'hui
   mort (aucun enqueue) ; s'il est câblé un jour, il doit porter l'emoji.
4. Web — services REST morts (apps/web/services/posts.service.ts:324/:329) : à
   supprimer ou à aligner (emoji dans le body) s'ils sont réactivés.
5. Android — aucun écran de réactions de commentaire trouvé au 2026-07-29 ;
   re-vérifier avant toute UI nouvelle.

## Sémantique serveur à afficher
- `reactionSummary = { emoji: n }`, `likeCount = reactionCount = total des
  réactions` (chaque paire utilisateur×emoji compte 1).
- Événements : `comment:reaction-added` / `comment:reaction-removed` (source de
  vérité) ; `comment:liked` maintenu transitoirement (likeCount seul).
```

- [ ] **Étape 2 : vérifier chaque référence par grep** (chemins et lignes), corriger ce qui a bougé.

- [ ] **Étape 3 : commiter**

```
git add docs/superpowers/specs/2026-07-30-reactions-commentaire-cumulees-clients.md
git commit -m "docs: inventaire du travail client induit par les reactions de commentaire cumulees"
```

## Tâche 18 — Réactions de post : écrivain unique de `post.reactions`, retrait unifié, événements par type

Applique **B.3** (le JSON `post.reactions` est un cache dénormalisé maintenu par UN SEUL écrivain, pour les deux transports) et **B.4** (retrait à emoji optionnel). Ajoute la garde de visibilité manquante (spec §1.3 : on peut aujourd'hui réagir à un post qu'on n'a pas le droit de voir, par les deux transports).

**Fichiers :**
- Modifier : `services/gateway/src/services/PostReactionService.ts` — `updatePostReactionSummary` (ancre vers 330-365) écrit aussi `reactions` ; `removeReaction` accepte `emoji?` ; garde `canUserViewPost` ; publication `reaction.changed`
- Modifier : `services/gateway/src/services/PostService.ts` — `likePost`/`unlikePost` (ancres vers 816 et 859) : suppression de leurs écritures directes `reactions`/`likeCount` (blocs vers 845-850 et 888-893) et du choix « première trouvée » (`userReactions[0].emoji`, vers 873)
- Modifier : `services/gateway/src/routes/posts/interactions.ts` — les handlers ne diffusent plus par type eux-mêmes (bloc vers 76-101) ; le dispatcher s'en charge
- Modifier : `services/gateway/src/socketio/handlers/PostReactionHandler.ts` — `broadcastReactionChange` (ancre vers 93-123) extraite/réutilisée par le dispatcher, enrichie du routage par type ; ack via `socketAckFor`
- Créer : `services/gateway/src/__tests__/unit/services/post-reactions-single-writer.test.ts`
- Modifier (retourner les gels) : `reactions.baseline.test.ts` (3 assertions : « première trouvée », « post.reactions écrit par PostService », « pas de story:reacted socket »)

**Interfaces :**
- Consomme : `DomainEventPublisher` (Tâche 8) ; `canUserViewPost` (déjà importé par `PostReactionHandler.ts:33` — reprendre le même module source) ; `SocialEventsHandler.broadcastStoryReacted`/`broadcastStatusReacted` (motifs appelés par `interactions.ts:77-90`).
- Produit :

```ts
// PostReactionService
async addReaction(options: { postId: string; userId: string; emoji: string }, ctx?: CallContext): Promise<AddPostReactionResult | null>
async removeReaction(options: { postId: string; userId: string; emoji?: string }, ctx?: CallContext): Promise<boolean>
// - emoji absent : retire TOUTES les réactions de l'utilisateur sur le post (B.4)
// - les deux publient reaction.changed { target: { kind: 'post', id: postId, postType }, ... }
// - updatePostReactionSummary écrit reactionSummary, reactionCount, likeCount ET reactions
//   (tableau ordonné createdAt asc de { userId, emoji, createdAt: string ISO })
```

- Le dispatcher route `target.kind === 'post'` par `postType` : `STORY` → `story:reacted`, `STATUS` → `status:reacted`, sinon la famille `post:liked`/`post:reaction-added` actuelle — la logique de `interactions.ts:76-101` déménage dans le handler d'événement et sert AUSSI le socket (aujourd'hui une réaction de story via socket sort en `post:reaction-added` que ni `StoryViewModel` ni `StatusViewModel` n'écoutent).

- [ ] **Étape 1 : retourner les gels** (3 assertions → cibles) :

```ts
    // « première trouvée » :
    expect(svc).not.toContain('userReactions[0].emoji');
    // écrivain unique :
    expect(post).not.toContain('reactions: reactionsJson');
    expect(reaction).toContain('reactionsJson');
    // routage par type côté socket (via dispatcher) :
    const dispatcherSrc = stripComments(readSource('socketio/events/reaction-changed.ts'));
    expect(dispatcherSrc).toContain('STORY_REACTED');
```

(adapter le nom de fichier du handler d'événement à celui réellement créé en Tâche 16 s'il est partagé). Run → rouges.

- [ ] **Étape 2 : test de cohérence du cache (rouge)** — `post-reactions-single-writer.test.ts` :

```ts
/**
 * Décision B.3 — le JSON post.reactions est un cache à écrivain unique.
 * Après une séquence d'ajouts/retraits ENTRELACÉS par les deux chemins
 * (REST : PostService.likePost/unlikePost ; socket : PostReactionService
 * direct), le JSON écrit correspond EXACTEMENT à l'état de la table.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { PostReactionService } from '../../../services/PostReactionService';
import { PostService } from '../../../services/PostService';

// Fake Prisma en mémoire : la table postReaction est la source de vérité ;
// post.update capture ce que l'écrivain unique projette.
function makeWorld() {
  type Row = { userId: string; emoji: string; createdAt: Date };
  const table: Row[] = [];
  let writtenJson: unknown = undefined;
  let clock = 0;
  const prisma = {
    post: {
      findFirst: jest.fn(async () => ({ id: 'p1', type: 'POST', authorId: 'a1', deletedAt: null,
                                        visibility: 'PUBLIC', visibilityUserIds: [] })),
      findUnique: jest.fn(async () => ({ id: 'p1', type: 'POST' })),
      update: jest.fn(async (args: { data: Record<string, unknown> }) => {
        if ('reactions' in args.data) writtenJson = args.data.reactions;
        return { id: 'p1' };
      }),
    },
    postReaction: {
      findFirst: jest.fn(async (args: { where: { emoji?: string; userId: string } }) =>
        table.find((r) => r.userId === args.where.userId && (!args.where.emoji || r.emoji === args.where.emoji)) ?? null),
      findMany: jest.fn(async (args: { where: { userId?: string } }) =>
        table.filter((r) => !args.where.userId || r.userId === args.where.userId)
             .map((r) => ({ ...r }))),
      create: jest.fn(async (args: { data: { userId: string; emoji: string } }) => {
        const row = { ...args.data, createdAt: new Date(2026, 0, 1, 0, 0, clock++) };
        table.push(row);
        return { id: `r${clock}`, ...row };
      }),
      deleteMany: jest.fn(async (args: { where: { userId?: string; emoji?: string } }) => {
        const keep = table.filter((r) =>
          (args.where.userId && r.userId !== args.where.userId) ||
          (args.where.emoji && r.emoji !== args.where.emoji && r.userId === args.where.userId));
        const removed = table.length - keep.length;
        table.length = 0; table.push(...keep);
        return { count: removed };
      }),
      groupBy: jest.fn(async () => {
        const acc = new Map<string, number>();
        for (const r of table) acc.set(r.emoji, (acc.get(r.emoji) ?? 0) + 1);
        return [...acc.entries()].map(([emoji, n]) => ({ emoji, _count: { emoji: n } }));
      }),
    },
  };
  return { prisma, table, written: () => writtenJson };
}

describe('post.reactions — écrivain unique, cohérence sous entrelacement', () => {
  it('le JSON relu est la projection exacte de la table après REST puis socket puis REST', async () => {
    const { prisma, table, written } = makeWorld();
    const reactionService = new PostReactionService(prisma as never);
    const postService = new PostService(prisma as never);
    (postService as unknown as { postReactionService: PostReactionService }).postReactionService = reactionService;

    await postService.likePost('p1', 'alice');                                        // REST ❤️
    await reactionService.addReaction({ postId: 'p1', userId: 'bob', emoji: '😂' }); // socket
    await postService.unlikePost('p1', 'alice');                                      // REST retire
    await reactionService.addReaction({ postId: 'p1', userId: 'carol', emoji: '❤️' });// socket

    const expected = table
      .slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((r) => ({ userId: r.userId, emoji: r.emoji, createdAt: r.createdAt.toISOString() }));
    expect(written()).toEqual(expected);
  });
});
```

Adapter la construction de `PostService`/`PostReactionService` à leurs constructeurs réels (les lire ; si `PostService` reçoit le service de réaction par constructeur, l'y passer au lieu du `Object.assign`). Le fake `deleteMany` ci-dessus doit reproduire la sémantique des requêtes RÉELLES émises par le code — le vérifier en le lisant, l'ajuster si les `where` diffèrent.

Run → rouge aujourd'hui : le chemin socket (`addReaction` direct) n'écrit jamais le JSON (`written()` rendu périmé par les appels socket).

- [ ] **Étape 3 : implémenter** —
1. `PostReactionService.updatePostReactionSummary` : après le calcul du résumé, relire la table et écrire aussi le JSON :

```ts
    const allReactions = await this.prisma.postReaction.findMany({
      where: { postId },
      select: { userId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const reactionsJson = allReactions.map((r) => ({
      userId: r.userId, emoji: r.emoji, createdAt: r.createdAt.toISOString(),
    }));
```

et ajouter `reactions: reactionsJson as Prisma.InputJsonValue` au `data` du `post.update` existant (ancre vers 360-363). C'est désormais LE seul écrivain.
2. `removeReaction({ postId, userId, emoji? })` : sans emoji → `deleteMany({ where: { postId, userId } })` puis résumé ; avec emoji → comportement actuel.
3. Garde de visibilité : au début d'`addReaction`/`removeReaction`, charger le post (le `findFirst` existant vers 98-109 : y ajouter `visibility`, `visibilityUserIds`, `authorId` au `select`) et appeler `canUserViewPost(...)` (même module et même signature que l'import de `PostReactionHandler.ts:33`) ; refus → `PermissionDeniedError`.
4. Publication `reaction.changed` (ctx optionnel, `NULL_PUBLISHER` par défaut — même motif que la Tâche 16).
5. `PostService.likePost` : supprimer le bloc de réécriture JSON (vers 845-850) — la délégation à `postReactionService.addReaction` (déjà en place, vers 818) suffit. `unlikePost` : remplacer le bloc `findMany` + `userReactions[0].emoji` + réécriture JSON (vers 865-893) par `await this.postReactionService.removeReaction({ postId, userId })`.
6. `routes/posts/interactions.ts` : supprimer le bloc de diffusion par type (vers 76-101) et le remplacer par rien (le service publie) ; conserver `withMutationLog` et le rate limit existants. `PostReactionHandler` : supprimer l'émission locale, déléguer au service, ack typé.
7. Dispatcher : dans le handler `reaction.changed` (créé en Tâche 16), brancher la branche `target.kind === 'post'` avec le routage par type déplacé de `interactions.ts:76-101` (y compris `story:reacted`/`status:reacted` — les écouteurs existent : web `use-social-socket.ts:174/:190`, iOS `SocialSocketManager.swift:960/:1011`).

- [ ] **Étape 4 : relancer** — le test de cohérence, les gels, `src/routes/posts/__tests__/`, les tests de `PostReactionHandler`. `bunx tsc --noEmit`.

- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/PostReactionService.ts services/gateway/src/services/PostService.ts services/gateway/src/routes/posts/interactions.ts services/gateway/src/socketio/handlers/PostReactionHandler.ts services/gateway/src/__tests__/unit/services/post-reactions-single-writer.test.ts services/gateway/src/__tests__/parity/reactions.baseline.test.ts
git commit -m "feat(gateway): post.reactions ecrit par un seul ecrivain, retrait unifie, evenements routes par type"
```

## Tâche 19 — Réactions de message : file offline et rate limit pour le REST

Le service est déjà unique (`ReactionService`, spec §1.3 « le modèle à généraliser ») ; seule la périphérie diverge : file offline et rate limit socket-only, notification par un chemin différent pour l'agent.

**Fichiers :**
- Modifier : `services/gateway/src/services/ReactionService.ts` — publication `reaction.changed` (ctx optionnel, publisher optionnel)
- Modifier : `services/gateway/src/socketio/handlers/ReactionHandler.ts` — extraire `_enqueueOfflineReactionEvent` (ancre vers 433-464) en méthode publique `enqueueOfflineReactionEvent` ; le handler cesse de l'appeler directement (le dispatcher le fait)
- Modifier : `services/gateway/src/routes/reactions.ts` — ajout du rate limit (motif de `routes/posts/interactions.ts:34`, `config.rateLimit`), suppression des émissions directes `io.*` (le service publie)
- Modifier : dispatcher — brancher `target.kind === 'message'` : broadcast (réutiliser l'émission actuelle du handler), enqueue offline, notification via `reactionNotify` (`services/notifications/reactionNotify.ts:22-66` — devient LE chemin unique, y compris pour l'agent `MeeshySocketIOManager.ts:2553-2589` qui délègue désormais au service avec un ctx `internal`)
- Modifier (retourner le gel) : `reactions.baseline.test.ts`, assertion « réaction REST jamais en file offline »

**Interfaces :**
- Consomme : `ReactionService.addReaction({ messageId, participantId, emoji })` / `removeReaction(...)` (`ReactionService.ts:64`, `:147`) — signatures inchangées, ctx/publisher ajoutés en option comme aux Tâches 16/18.
- Produit : toute réaction de message — REST (chemin outbox iOS), socket, agent — broadcast, s'enfile pour les pairs hors-ligne et notifie par le même chemin.

- [ ] **Étape 1 : retourner le gel** → `expect(routes).toContain('rateLimit');` et retirer les deux assertions `enqueue`/`deliveryQueue` (l'enqueue ne vit plus dans la route NI dans le handler : asserter à la place `expect(stripComments(readSource('socketio/handlers/ReactionHandler.ts'))).not.toContain('this._enqueueOfflineReactionEvent(');`). Run → rouge.
- [ ] **Étape 2 : implémenter** — publisher dans `ReactionService` (publier après add/remove avec `summary` relu) ; dispatcher branche message : broadcast + `enqueueOfflineReactionEvent` + `reactionNotify` ; retirer du handler socket ses appels directs d'enqueue/notify ; retirer de la route REST ses `io.*` ; `config: { rateLimit: { max: 30, timeWindow: '1 minute' } }` sur `POST` et `DELETE` de `routes/reactions.ts` (miroir des budgets socket `socket-rate-limiter.ts:168-177`) ; chemin agent (`MeeshySocketIOManager.ts:2502-2589`) : remplacer l'émission manuelle par l'appel au service avec `internalCallContext('ai-agent')`.
- [ ] **Étape 3 : relancer** — gels + tests existants de `ReactionHandler` et `routes/reactions` (adapter les assertions d'émission directe). `bunx tsc --noEmit`.
- [ ] **Étape 4 : commiter**

```
git add services/gateway/src/services/ReactionService.ts services/gateway/src/socketio/handlers/ReactionHandler.ts services/gateway/src/routes/reactions.ts services/gateway/src/socketio/MeeshySocketIOManager.ts services/gateway/src/__tests__/parity/reactions.baseline.test.ts
git commit -m "feat(gateway): reactions de message — file offline, notification et rate limit pour tous les transports"
```

(ajouter le fichier du handler d'événement et les tests adaptés).

## Tâche 20 — Réactions de pièce jointe : les gardes du service partagé

**Fichiers :**
- Modifier : `services/gateway/src/services/AttachmentReactionService.ts` (ancre : le corps d'`addReaction`, vers 26-69)
- Modifier : `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts` (validation manuelle vers 67-79 → schéma Zod, motif des autres handlers)
- Créer : `services/gateway/src/__tests__/unit/services/attachment-reaction-guards.test.ts`

**Interfaces :** consomme les gardes de référence de `ReactionService.ts:99-105` (message supprimé, message système) — les reproduire à l'identique côté pièce jointe.

- [ ] **Étape 1 : test rouge** — `attachment-reaction-guards.test.ts` : deux cas : réaction sur une pièce jointe d'un message `deletedAt` non nul → rejet `NotFoundError` ; sur un message `messageType: 'system'` → rejet. Mock Prisma : `attachment.findUnique` renvoyant `{ id, messageId, message: { deletedAt, messageType, conversationId } }` — lire d'abord la requête réelle du service (`resolveConversationId`, vers 106-112) et étendre son `select` plutôt que d'ajouter une requête.
- [ ] **Étape 2 : implémenter** — étendre le `select` (règle : tout champ lu figure dans le `select`), ajouter les deux gardes, remplacer les `throw new Error` du service par des `BaseAppError` (fait décroître `BASELINE_BARE_THROW_IN_SERVICES` : retirer `services/AttachmentReactionService.ts` de la baseline si plus aucun ne reste). Handler : schéma Zod `{ attachmentId: ObjectId, messageId: ObjectId, emoji: string 1-10 }` sur le motif du handler voisin, ack via `socketAckFor`.
- [ ] **Étape 3 : relancer** — le nouveau test + tests existants du handler + gardes de source. `bunx tsc --noEmit`.
- [ ] **Étape 4 : commiter**

```
git add services/gateway/src/services/AttachmentReactionService.ts services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts services/gateway/src/__tests__/unit/services/attachment-reaction-guards.test.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway): reactions de piece jointe — gardes du service partage et validation zod"
```

---

# Phase 5 — Lecture des posts

## Tâche 21 — Un enrichisseur viewer unique pour l'unitaire et les listes

**COLLISION** : `src/services/` est une zone active. Vérifier `git status --short -- services/gateway/src/services/PostService.ts services/gateway/src/services/PostFeedService.ts` avant de commencer.

**Fichiers :**
- Créer : `services/gateway/src/services/posts/PostViewerEnrichmentService.ts`
- Créer : `services/gateway/src/services/posts/derived-fields.ts` (hoist `trackingLinks` partagé)
- Modifier : `services/gateway/src/services/PostService.ts` (`getPostById`, bloc des flags vers 504-539) ; `services/gateway/src/services/PostFeedService.ts` (les 9 surfaces — ancres : `enrichWithLikeStatus`, `getBookmarks`, `getStatuses`, `getDiscoverStatuses`, `getReels`, `getStories`, `getUserPosts`, `getCommunityFeed`, `getFeed`) ; `services/gateway/src/routes/posts/core.ts` (copie locale `hoistTrackingLinks`, vers 23-30) ; `services/gateway/src/routes/posts/comments.ts` (copie vers 21-28) ; `services/gateway/src/socketio/handlers/MessageHandler.ts` (copie vers 942-951)
- Créer : `services/gateway/src/__tests__/unit/services/post-viewer-enrichment.test.ts`

**Interfaces :**
- Produit :

```ts
// services/gateway/src/services/posts/PostViewerEnrichmentService.ts
export interface ViewerFlags {
  isLikedByMe: boolean; isBookmarkedByMe: boolean; isRepostedByMe: boolean;
  currentUserReactions: string[]; isViewedByMe?: boolean;
}
export class PostViewerEnrichmentService {
  constructor(private prisma: PrismaClient) {}
  /** viewerUserId absent → flags explicites à false (jamais de champ manquant). */
  async enrich<T extends { id: string }>(posts: T[], viewerUserId?: string,
    opts?: { withViewed?: boolean }): Promise<Array<T & ViewerFlags>>;
}
// services/gateway/src/services/posts/derived-fields.ts
export function hoistTrackingLinks<T extends Record<string, unknown>>(entity: T): T;
```

- Les requêtes de flags EXISTENT déjà : les déplacer depuis `PostFeedService.getFeed` (bloc `userReactionsMap`/`bookmarkedIds`/`repostedIds`, vers 200-237) et `getStories` (`viewedSet`, vers 350-378) — c'est un déménagement, pas une réécriture. `hoistTrackingLinks` : reprendre le corps de `routes/posts/core.ts:23-30` tel quel.
- Trous fermés (écart n° 14) : `getBookmarks` gagne `isLikedByMe`/`isBookmarkedByMe` ; `getStatuses`/`getDiscoverStatuses` gagnent tous les flags ; `getReels` gagne `isRepostedByMe` ; `getStories` gagne `isBookmarkedByMe`/`isRepostedByMe` ; `getUserPosts` viewer anonyme renvoie des `false` explicites ; `getPostById` gagne `isViewedByMe` pour les stories (`opts.withViewed` quand `type === 'STORY'`).

- [ ] **Étape 1 : test rouge** — `post-viewer-enrichment.test.ts` : quatre cas : (a) viewer absent → tous les flags `false` et `currentUserReactions: []` présents sur chaque post ; (b) viewer avec une réaction → `isLikedByMe: true` + emoji dans `currentUserReactions` ; (c) `withViewed: true` → `isViewedByMe` calculé ; (d) les posts d'entrée ne sont pas mutés (retour = copies). Mock Prisma sur le motif des requêtes réellement déplacées (les lire d'abord dans `PostFeedService.getFeed`). Run → `Cannot find module`.
- [ ] **Étape 2 : implémenter le service et le helper** (déménagement des blocs cités). Relancer → vert.
- [ ] **Étape 3 : brancher les 10 surfaces** — chaque méthode de `PostFeedService` remplace son assemblage local par `this.viewerEnrichment.enrich(items, userId, ...)` ; `getPostById` idem ; supprimer `enrichWithLikeStatus` (vers 993) une fois plus aucun appelant. Remplacer les trois copies de hoist par l'import du helper partagé. **Contrainte n° 3 (obligatoire)** : pour chaque route REST servant ces listes (grep les routes appelant `getBookmarks`, `getStatuses`, `getReels`, `getStories` dans `routes/posts/`), vérifier que le schéma de réponse Fastify laisse passer les nouveaux champs (`additionalProperties: true` ou champs déclarés) — sinon `fast-json-stringify` tronque silencieusement et le correctif est un no-op invisible. Corriger les schémas concernés dans le même commit.
- [ ] **Étape 4 : relancer large** — tests existants de `PostFeedService`/`PostService`/`routes/posts` (adapter ceux qui assertaient l'ABSENCE d'un flag) ; `bunx tsc --noEmit`.
- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/posts/PostViewerEnrichmentService.ts services/gateway/src/services/posts/derived-fields.ts services/gateway/src/services/PostService.ts services/gateway/src/services/PostFeedService.ts services/gateway/src/routes/posts/core.ts services/gateway/src/routes/posts/comments.ts services/gateway/src/socketio/handlers/MessageHandler.ts services/gateway/src/__tests__/unit/services/post-viewer-enrichment.test.ts
git commit -m "feat(gateway): enrichisseur viewer unique — les 8 trous de flags des listes fermes, hoist trackingLinks partage"
```

## Tâche 22 — Une seule résolution d'audience pour `post:updated` et les traductions de story

**Fichiers :**
- Modifier : `services/gateway/src/services/posts/StoryTextObjectTranslationService.ts` — émissions directes `this.io.to(ROOMS.feed(...))` (ancres vers 142 et 157) et miroir d'audience (`:215-253`, commentaire « Mirrors SocialEventsHandler.getVisibilityFilteredRecipients »)
- Modifier : `services/gateway/src/socketio/handlers/SocialEventsHandler.ts` — deux méthodes nouvelles
- Modifier : `services/gateway/src/services/posts/PostAudioService.ts` — hoist avant broadcast (`broadcastPostUpdate`, vers 316-328)
- Modifier (baselines) : retirer `services/posts/StoryTextObjectTranslationService.ts` de `BASELINE_SOCKETIO_IN_SERVICES` et de `BASELINE_IO_EMIT_OUTSIDE_SOCKETIO`

**Interfaces :**
- Produit, dans le service de traduction de story, un **port** (le service ne connaît plus `io`) :

```ts
// défini DANS StoryTextObjectTranslationService.ts (ou fichier voisin) :
export interface StoryTranslationBroadcastPort {
  broadcastStoryTranslationUpdated(post: unknown, authorId: string, eventData: unknown): Promise<void>;
  broadcastPostTranslationUpdated(post: unknown, authorId: string, eventData: unknown): Promise<void>;
}
```

implémenté par deux méthodes ajoutées à `SocialEventsHandler` (motif exact de `broadcastPostUpdated`, `SocialEventsHandler.ts:216-223` : `getVisibilityFilteredRecipients` puis émission — la SEULE résolution d'audience, spec §2.3), câblées au point d'instanciation du service (grep `new StoryTextObjectTranslationService(`).

- [ ] **Étape 1 : test rouge** — dans un nouveau describe du fichier de tests existant du service (le trouver par grep `StoryTextObjectTranslationService` sous `src/__tests__/` ou `src/services/posts/__tests__/`) : injecter un port factice et asserter que l'émission passe par lui (`broadcastStoryTranslationUpdated` appelé) et que le service n'appelle plus `io.to`. Run → rouge.
- [ ] **Étape 2 : implémenter** — remplacer les émissions directes par le port ; supprimer le bloc miroir d'audience (`:215-253`) ; ajouter les deux méthodes à `SocialEventsHandler` (audience = `getVisibilityFilteredRecipients` + room du post, comme `broadcastPostUpdated` — l'écart d'audience actuel « rooms feed seulement, jamais la room du post » disparaît). `PostAudioService.broadcastPostUpdate` : appliquer `hoistLocationDeep` (import existant dans `PostFeedService`) et `hoistTrackingLinks` (Tâche 21) au post avant `broadcastPostUpdated` — parité avec la route PUT (`routes/posts/core.ts`, ancre `hoistLocation(post`).
- [ ] **Étape 3 : baselines + relancer** — retirer les deux entrées de baseline ; relancer les gardes, les tests du service et de `SocialEventsHandler` ; `bunx tsc --noEmit`.
- [ ] **Étape 4 : commiter**

```
git add services/gateway/src/services/posts/StoryTextObjectTranslationService.ts services/gateway/src/socketio/handlers/SocialEventsHandler.ts services/gateway/src/services/posts/PostAudioService.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway): audience unique pour post:updated et traductions de story via SocialEventsHandler"
```

(ajouter les fichiers de test modifiés).

---

# Phase 6 — Traduction (résiduel)

## Tâche 23 — Statut de traduction protégé, garde d'appartenance dans le service, langues cibles complètes

**COLLISION** : la zone traduction vient d'être corrigée par une autre session (`2c0f0fcca`). Vérifier `git log --oneline -3 -- services/gateway/src/routes/translation-non-blocking.ts services/gateway/src/services/message-translation/` et `git status --short` sur ces chemins avant de commencer ; re-vérifier que chaque point ci-dessous est encore ouvert (si un point est déjà corrigé, le sauter et le dire).

**Fichiers :**
- Modifier : `services/gateway/src/routes/translation-non-blocking.ts` — `GET /status/:messageId/:language` (ancre : `fastify.get('/status/:messageId/:language'`, vers 406 : aucune auth, aucune garde — n'importe qui connaissant un `message_id` lit la traduction : IDOR)
- Modifier : `services/gateway/src/services/message-translation/MessageTranslationService.ts` — garde d'appartenance + langues cibles (`_processTranslationsAsync`, ancre `targetLanguages = [targetLanguage];` vers 452)
- Vérifier/Modifier : les casts `(translationService as any)._processRetranslationAsync` (`routes/messages.ts:315`, `messages-advanced.ts:452`, `:826`) — normalement déjà supprimés par la Tâche 13 ; s'il en reste, les remplacer par `retranslateMessageAsync` (API publique, `MessageTranslationService.ts:563`) et retirer les entrées de `BASELINE_PRIVATE_CASTS`
- Créer : `services/gateway/src/__tests__/unit/services/translation-access-guard.test.ts`
- Ne PAS toucher : `src/routes/voice/` (autre session), `POST /translate-blocking` (corrigé, `2c0f0fcca`)

**Interfaces :**
- Produit :

```ts
// MessageTranslationService — nouvelle méthode (la garde vit dans le SERVICE :
// elle s'applique ainsi à tout transport présent et futur, spec §1.6) :
async getTranslationForRequester(requester: { userId?: string; participantId?: string },
  messageId: string, language: string): Promise<TranslationResult | null>
// jette PermissionDeniedError si le demandeur n'est participant actif d'aucune
// conversation contenant ce message ; NotFoundError si message inconnu.
```

- Décision **B.7** : dans `_processTranslationsAsync`, une `targetLanguage` explicite s'AJOUTE aux langues de conversation au lieu de les remplacer :

```ts
      const conversationLanguages = await this._extractConversationLanguages(message.conversationId);
      targetLanguages = targetLanguage
        ? [...new Set([targetLanguage, ...conversationLanguages])]
        : conversationLanguages;
```

- [ ] **Étape 1 : test rouge** — `translation-access-guard.test.ts` : trois cas : non-participant → rejet `PermissionDeniedError` ; participant actif → résultat retourné ; B.7 : appel de `_processTranslationsAsync` avec `targetLanguage: 'es'` sur une conversation fr/en → les jobs couvrent `{es, fr, en}` (étendre le motif des tests existants `src/__tests__/unit/services/MessageTranslationService.branches.test.ts` — reprendre leur construction du service et leurs fakes ZMQ). Run → rouge.
- [ ] **Étape 2 : implémenter** — la méthode gardée (requête : `message.findFirst({ where: { id }, select: { conversationId: true } })` puis `participant.findFirst({ where: { conversationId, isActive, OR: [{ userId }, { id: participantId }] } })`) ; l'union des langues ; la route `/status` : `preHandler` d'authentification (motif exact de `translation-non-blocking.ts:268`) + appel de la méthode gardée avec `request.authContext`.
- [ ] **Étape 3 : relancer** — le nouveau test + `src/__tests__/unit/routes/translation-routes.test.ts` + `MessageTranslationService.branches.test.ts` (adapter : le cas « cible unique » attend désormais l'union) ; `bunx tsc --noEmit`.
- [ ] **Étape 4 : commiter**

```
git add services/gateway/src/routes/translation-non-blocking.ts services/gateway/src/services/message-translation/MessageTranslationService.ts services/gateway/src/__tests__/unit/services/translation-access-guard.test.ts
git commit -m "fix(gateway/translation): statut protege par appartenance cote service, langues cibles completes"
```

---

# Phase 7 — Appels

## Tâche 24 — `call.initiated` : l'appel REST sonne enfin

**COLLISION** (socketio actif). Vérifier `git status --short -- services/gateway/src/socketio/CallEventsHandler.ts services/gateway/src/services/CallService.ts`.

**Fichiers :**
- Modifier : `services/gateway/src/socketio/CallEventsHandler.ts` — extraire en méthode publique `announceInitiatedCall(callSession, opts: { excludeSocketId?: string })` les quatre effets aujourd'hui inline du handler d'initiation : fanout `CALL_EVENTS.INITIATED` avec `iceServers` par utilisateur (ancre vers 1835), message d'appel `postLiveCallMessage` (ancre vers 1788, définition 1449), `scheduleRingingTimeout` (vers 1869), push VoIP (bloc 1875-1947)
- Modifier : `services/gateway/src/services/CallService.ts` — publisher optionnel + publication `call.initiated` en fin d'`initiateCall` (ancre : `async initiateCall`, vers 830)
- Modifier : dispatcher — `call.initiated` → `announceInitiatedCall`
- Modifier (retourner le gel) : `participation-calls.baseline.test.ts`, assertion « CallService ne publie aucun événement »
- Créer : `services/gateway/src/__tests__/unit/events/call-initiated-dispatch.test.ts`

**Interfaces :**
- Consomme : `CallService.initiateCall(data: { conversationId; initiatorId; participantId; type: 'video'|'audio'; settings? }): Promise<CallSessionWithParticipants>` (`CallService.ts:830`) ; `DomainEventPublisher` (Tâche 8).
- Produit : `POST /api/v1/calls` déclenche sonnerie, message d'appel, timeout et push VoIP — sans qu'aucune ligne de `routes/calls.ts` ne change (le service publie, le dispatcher exécute ; spec §1.7 : « un appel initié par REST n'existe que pour son initiateur » devient faux).

- [ ] **Étape 1 : retourner le gel** → `expect(svc).toContain('DomainEventPublisher');`. Run → rouge.
- [ ] **Étape 2 : test du câblage (rouge)** — `call-initiated-dispatch.test.ts` sur le motif exact de `message-created-dispatch.test.ts` (Tâche 12) : publier `{ type: 'call.initiated', ctx (socketId 'sock-1'), call: { id: 'call1' } }` → `announceInitiatedCall` appelé avec `{ excludeSocketId: 'sock-1' }` ; sans `socketId` → appelé avec `{ excludeSocketId: undefined }`.
- [ ] **Étape 3 : implémenter** — (1) extraction d'`announceInitiatedCall` : déplacer les quatre blocs (fanout, message, timeout, push) du handler d'initiation vers la méthode publique, le handler socket l'appelle — **comportement inchangé à cette étape**, relancer la suite `CallEventsHandler` existante ; (2) `CallService` : `private publisher: DomainEventPublisher = NULL_PUBLISHER` en dernier paramètre de constructeur, publication en fin d'`initiateCall` (le `ctx` arrive en paramètre optionnel d'`initiateCall`, même motif que Tâche 12 — les routes passent `request.callContext`, le handler socket `nextSocketCallContext(socket)`) ; (3) dispatcher : enregistrer `call.initiated` → `announceInitiatedCall(e.call, { excludeSocketId: e.ctx.socketId })` ; (4) le handler socket retire son appel direct à `announceInitiatedCall` (l'événement s'en charge — l'ack avec `iceServers` de l'initiateur, lui, reste dans le handler : c'est de la forme de réponse, donc du transport).
- [ ] **Étape 4 : relancer** — les deux tests + la suite `CallEventsHandler` + `calls-routes.test.ts` ; `bunx tsc --noEmit`.
- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/socketio/CallEventsHandler.ts services/gateway/src/services/CallService.ts services/gateway/src/__tests__/unit/events/call-initiated-dispatch.test.ts services/gateway/src/__tests__/parity/participation-calls.baseline.test.ts
git commit -m "feat(gateway/calls): call.initiated publie par le service — l'appel REST sonne, poste, expire et pushe"
```

(ajouter le fichier de câblage du dispatcher).

## Tâche 25 — `call.joined`, payload REST réparé, appels manqués notifiés

**Fichiers :**
- Modifier : `services/gateway/src/routes/calls.ts` — handler `POST /calls/:callId/participants` (ancre : `callService.joinCall`, vers 605-612)
- Modifier : `services/gateway/src/socketio/CallEventsHandler.ts` — extraire le fanout de join en méthode publique `announceJoinedCall(callSession, joinedUserId, opts)` (ancre : `PARTICIPANT_JOINED` + `iceServers` par pair, vers 2153-2156) ; brancher `handleMissedCall` sur le pont de résumé (ancre du déclenchement socket : vers 3259-3264 ; pont REST : `postCallSummaryForTerminatedCall`, câblé `server.ts:1332`)
- Modifier : `services/gateway/src/services/CallService.ts` — publication `call.joined` dans `joinCall` (vers 1150)
- Modifier (retourner le gel) : `participation-calls.baseline.test.ts`, assertion « wrapper non destructuré »

**Interfaces :**
- Consomme : `CallService.joinCall(data): Promise<{ callSession: CallSessionWithParticipants; iceServers: RTCIceServer[] }>` (`CallService.ts:1150-1153`) — retour **wrapper**, cause du bug d'écart n° 10.
- Produit : réponse REST du join corrigée : `{ ...toCallSessionResponse(callSession), iceServers }` ; fanout `call:participant-joined` pour les joins REST ; notification d'appel manqué quel que soit le transport de fin.

- [ ] **Étape 1 : retourner le gel** → `expect(routes).toContain('const { callSession, iceServers }');`. Run → rouge.
- [ ] **Étape 2 : réparer la route** :

```ts
      const { callSession, iceServers } = await callService.joinCall({ callId, userId, participantId: joinParticipantId, settings });
      return sendSuccess(reply, { ...toCallSessionResponse(callSession), iceServers });
```

**Contrainte n° 3** : vérifier le schéma de réponse de cette route (`iceServers` doit être déclaré ou `additionalProperties: true`, sinon tronqué) — le test existant `src/__tests__/unit/routes/call-session-schema-serialization.test.ts` est l'endroit où l'asserter.
- [ ] **Étape 3 : `call.joined` + manqués** — extraction d'`announceJoinedCall` (comportement inchangé côté socket, relancer la suite) ; publication dans `joinCall` ; dispatcher → `announceJoinedCall` ; pour les appels manqués : dans le chemin du pont `postCallSummaryForTerminatedCall` (CallEventsHandler), appeler le même `handleMissedCall` que le chemin socket (ancre 3259-3264) quand l'issue est `missed` — un raccroché/expiré via REST notifie enfin l'appelé.
- [ ] **Étape 4 : relancer** — gels, `calls-routes.test.ts`, `call-session-schema-serialization.test.ts`, suite `CallEventsHandler` ; `bunx tsc --noEmit`.
- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/routes/calls.ts services/gateway/src/socketio/CallEventsHandler.ts services/gateway/src/services/CallService.ts services/gateway/src/__tests__/parity/participation-calls.baseline.test.ts
git commit -m "fix(gateway/calls): join REST — payload repare, fanout participant-joined, appels manques notifies"
```

---

# Phase 8 — Participation

## Tâche 26 — `ParticipationService.join` et la table unique des permissions

**COLLISION FORTE** : `routes/conversations/core.ts` est modifié en ce moment même par une autre session. Vérifier `git status --short -- services/gateway/src/routes/conversations/` ; si `core.ts` est en cours, faire d'abord les quatre autres adaptateurs et revenir sur `core.ts` quand il est propre.

Applique **B.6** : la table reproduit EXACTEMENT les cinq jeux actuels (aucun changement de comportement sur les permissions). Les événements, eux, changent : le join par lien, l'invitation et le join anonyme cessent d'être silencieux (spec §2.5 — c'est le but).

**Fichiers :**
- Créer : `services/gateway/src/services/ParticipationService.ts`
- Modifier (adaptateurs) : `routes/conversations/participants.ts` (admin-add, `participant.create` vers 327) ; `routes/conversations/sharing.ts` (share-link vers 589, invitation vers 810) ; `routes/anonymous.ts` (vers 391) ; `routes/conversations/core.ts` (création, nested create vers 1000-1024 — voir nuance ci-dessous)
- Modifier : dispatcher — `participant.joined` (extraction des effets d'admin-add : `CONVERSATION_JOINED` vers `participants.ts:357`, `joinUserToConversationRoom` vers 365, `CONVERSATION_NEW` vers 383, notifications vers 399/411)
- Créer : `services/gateway/src/__tests__/unit/services/participation-join.test.ts`
- Modifier (retourner les gels + baselines) : `participation-calls.baseline.test.ts` (2 assertions) ; retirer de `BASELINE_PRISMA_WRITES_IN_TRANSPORT` les fichiers devenus propres

**Interfaces :**
- Produit (consommé par la Tâche 27) :

```ts
// services/gateway/src/services/ParticipationService.ts
export type JoinVia = 'creation' | 'admin-add' | 'share-link' | 'invitation' | 'anonymous-link';

/** Décision B.6 — les CINQ jeux actuels, figés. La divergence audio/vidéo
 *  d'admin-add est historique et ASSUMÉE ici ; l'harmoniser = changer ces
 *  deux lignes, sous test. Le jeu 'anonymous-link' est une FONCTION des flags
 *  du lien (comportement actuel de routes/anonymous.ts). */
export const PARTICIPANT_PERMISSION_DEFAULTS: {
  creation: ParticipantPermissionSet;
  'admin-add': ParticipantPermissionSet;      // seul jeu avec canSendAudios/Videos: true
  'share-link': ParticipantPermissionSet;
  invitation: ParticipantPermissionSet;
  'anonymous-link': (link: { allowAnonymousMessages: boolean; allowAnonymousFiles: boolean; allowAnonymousImages: boolean }) => ParticipantPermissionSet;
};

export class ParticipationService {
  constructor(private prisma: PrismaClient, private publisher: DomainEventPublisher = NULL_PUBLISHER) {}
  async join(ctx: CallContext, cmd: {
    conversationId: string; via: JoinVia;
    role?: 'admin' | 'moderator' | 'member';
    targetUserId?: string;            // compte à ajouter (admin-add/share-link/invitation)
    anonymous?: { displayName: string; language: string; sessionTokenHash: string;
                  shareLink: { id: string; allowAnonymousMessages: boolean; allowAnonymousFiles: boolean; allowAnonymousImages: boolean } };
  }): Promise<{ id: string; conversationId: string; role: string }>;
}
// publie { type: 'participant.joined', ctx, conversationId, participant, via }
```

où `ParticipantPermissionSet = { canSendMessages: boolean; canSendFiles: boolean; canSendImages: boolean; canSendAudios: boolean; canSendVideos: boolean; canSendLocations: boolean; canSendLinks: boolean }`. Valeurs (vérifiées, table de B.6) : `admin-add` = messages/files/images/audios/videos `true`, locations/links `false` ; `creation`, `share-link`, `invitation` = messages/files/images `true`, le reste `false` ; `anonymous-link` = les trois flags du lien, le reste `false`.

**Nuance `core.ts`** : la création de conversation écrit ses participants en `create` imbriqué dans `conversation.create` (transaction implicite). Ne pas casser cela : `core.ts` n'appelle pas `join()` mais importe `PARTICIPANT_PERMISSION_DEFAULTS.creation` à la place de son littéral local (`defaultPermissions`, vers 986-993) — la SOURCE est unique, l'écriture reste transactionnelle. Les événements de création restent ceux de la route (inchangés dans cette tâche). Le 6ᵉ chemin (`ensureParticipantFromMember`, migration legacy — écart n° 9) copie les permissions du document legacy : hors table, le documenter d'un commentaire renvoyant à `ParticipationService`.

- [ ] **Étape 1 : test rouge** — `participation-join.test.ts` : (a) `join(via: 'share-link')` crée le participant avec EXACTEMENT le jeu `share-link` de la table (asserter l'objet permissions complet passé à `participant.create`) ; (b) `join(via: 'admin-add')` accorde audio/vidéo ; (c) `join(via: 'anonymous-link')` dérive des flags du lien (`allowAnonymousMessages: false` → `canSendMessages: false`) ; (d) chaque join publie `participant.joined` avec le bon `via` ; (e) refus (`ConflictError`) si un participant actif existe déjà pour ce `targetUserId` dans la conversation. Mock Prisma : `participant.findFirst` (doublon) + `participant.create` (capture). Run → `Cannot find module`.
- [ ] **Étape 2 : implémenter le service** (création + table + doublon + publication ; les champs non-permissions du `participant.create` — `conversationId`, `userId`/`sessionTokenHash`, `role`, `type`, `displayName`, `language`, `joinedAt`, `isActive` — se copient depuis l'écriture actuelle d'admin-add, `participants.ts:327-355`, qui devient la référence). Relancer → vert.
- [ ] **Étape 3 : dispatcher `participant.joined`** — extraire les quatre effets d'admin-add (`CONVERSATION_JOINED`, room, `CONVERSATION_NEW`, notifications — ancres listées plus haut) en méthode publique du handler concerné, enregistrer l'événement (motif Tâche 12). Cas `via: 'anonymous-link'` : mêmes événements (les membres découvrent l'anonyme en temps réel — le gel « join anonyme silencieux » sera retourné à l'étape 5) ; pas de notification push pour l'anonyme lui-même.
- [ ] **Étape 4 : brancher les adaptateurs un par un**, dans cet ordre (collision décroissante) : `anonymous.ts` → `sharing.ts` (deux sites) → `participants.ts` → `core.ts` (import de la table seulement). Chaque adaptateur supprime son littéral de permissions et son `participant.create` (sauf `core.ts`), appelle `join(...)` avec son `via`, et supprime ses émissions devenues redondantes (admin-add : les quatre effets extraits à l'étape 3). Les réponses HTTP restent identiques.
- [ ] **Étape 5 : retourner les gels** — « cinq écritures littérales » → `expect(src).toContain('PARTICIPANT_PERMISSION_DEFAULTS')` pour `core.ts` et `expect(src).toContain('ParticipationService')` pour les trois autres ; « join anonyme silencieux » → `expect(anonymous).toContain('ParticipationService');` (les événements partent du dispatcher, pas de la route). Retirer des baselines Prisma les fichiers devenus propres. Relancer tout (`bun run test -- src/__tests__/parity/ src/__tests__/source-guards/ src/__tests__/unit/routes/anonymous.test.ts src/__tests__/unit/routes/conversation-core.test.ts` + tests de `participants`/`sharing`) ; `bunx tsc --noEmit`.
- [ ] **Étape 6 : commiter**

```
git add services/gateway/src/services/ParticipationService.ts services/gateway/src/routes/conversations/participants.ts services/gateway/src/routes/conversations/sharing.ts services/gateway/src/routes/anonymous.ts services/gateway/src/routes/conversations/core.ts services/gateway/src/__tests__/unit/services/participation-join.test.ts services/gateway/src/__tests__/parity/participation-calls.baseline.test.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway): ParticipationService.join — table unique des permissions, aucun join silencieux"
```

(ajouter le fichier du handler d'événement et les tests adaptés).

## Tâche 27 — `ParticipationService.leave` : départs et retraits symétriques

**Fichiers :**
- Modifier : `services/gateway/src/services/ParticipationService.ts` — méthode `leave`
- Modifier (adaptateurs) : `routes/conversations/leave.ts` (write vers 64-66) ; `routes/conversations/participants.ts` (retrait admin, `updateMany` vers 513)
- Ne PAS toucher : `socketio/handlers/ConversationHandler.ts` `conversation:leave` — c'est un désabonnement de room, une opération de TRANSPORT (spec §2.5, l'exemple canonique de la frontière) ; il reste dans le handler.
- Modifier : dispatcher — `participant.left` (broadcast `CONVERSATION_PARTICIPANT_LEFT` + notifications : reprendre `createRemovedFromConversationNotification`/`createMemberRemovedNotification` du retrait admin, `participants.ts:556-570` ; pour un départ volontaire, notifier creator/admins avec le même mécanisme — c'est l'asymétrie constatée : `leave.ts` n'a aucun appel à `notificationService`)
- Créer : `services/gateway/src/__tests__/unit/services/participation-leave.test.ts`

**Interfaces :**
- Produit :

```ts
async leave(ctx: CallContext, cmd: { conversationId: string; targetParticipantId?: string }): Promise<void>
// sans targetParticipantId : départ volontaire de l'acteur ;
// avec : retrait par un admin (permission vérifiée DANS le service :
//   participant.role ∈ {admin, moderator} de CETTE conversation, ou modération
//   globale — même motif que deleteMessage, Tâche 14).
// écrit { isActive: false, leftAt } ; publie { type: 'participant.left',
//   ctx, conversationId, participantId, removedByAdmin }
```

- [ ] **Étape 1 : test rouge** — trois cas : départ volontaire (write + événement `removedByAdmin: false`) ; retrait par un membre simple → `PermissionDeniedError` (négatif d'abord) ; retrait par un admin de la conversation → événement `removedByAdmin: true`. Run → `leave is not a function`.
- [ ] **Étape 2 : implémenter** — permission (lookup `participant.findFirst` de l'acteur), write `updateMany({ where: { id, isActive: true }, data: { isActive: false, leftAt } })`, publication. Dispatcher : broadcast + éviction des sockets de la room (reprendre le bloc de `leave.ts:75` et suivants) + notifications.
- [ ] **Étape 3 : adaptateurs** — `leave.ts` et le DELETE de `participants.ts` deviennent forme → ctx → service → réponse identique ; supprimer leurs writes et émissions locales ; retirer les fichiers devenus propres des baselines.
- [ ] **Étape 4 : relancer** — nouveau test + `src/__tests__/unit/routes/conversations/leave.test.ts` + tests de `participants` ; gardes de source ; `bunx tsc --noEmit`.
- [ ] **Étape 5 : commiter**

```
git add services/gateway/src/services/ParticipationService.ts services/gateway/src/routes/conversations/leave.ts services/gateway/src/routes/conversations/participants.ts services/gateway/src/__tests__/unit/services/participation-leave.test.ts services/gateway/src/__tests__/source-guards/transport-layer-boundaries.test.ts
git commit -m "feat(gateway): ParticipationService.leave — departs notifies, retraits admin unifies"
```

---

## E. Après la migration — critères de sortie

- Les cinq baselines de la Tâche 1 ont perdu toutes les entrées listées par les tâches de ce plan ; toute entrée restante est documentée (admin, seed, uploads… hors périmètre de la spec).
- Tous les tests de gel des Tâches 2-4 sont retournés en assertions cibles ; aucun n'a été supprimé.
- `grep -rn "miroir de\|Mirrors\|parité avec" services/gateway/src --include="*.ts"` ne renvoie plus de commentaire assumant une duplication de comportement (spec §6.4 : un tel commentaire est une demande de factorisation, pas une documentation).
- Les deux questions de revue de la spec §6.4 s'appliquent à tout diff futur : « la ligne décide-t-elle de CE QUI se passe (→ service) ou de COMMENT ça se dit (→ adaptateur) ? » ; « l'opération a-t-elle un autre transport, et son test de parité est-il dans le même diff ? »
