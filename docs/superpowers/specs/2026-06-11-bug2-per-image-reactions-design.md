# Design — BUG 2 / A' : réactions par-image (modèle 1-message / N-pièces-jointes)

> Date : 2026-06-11 · Branche : `main` · Statut : approuvé (design A'), spec en relecture

## 1. Contexte & objectif

BUG 2 du plan : « 1 pièce jointe = identité propre ». Après brainstorming + 4 investigations + revue Opus, l'interprétation retenue est **A'** : **garder le modèle actuel 1-message / N-PJ + la grille groupée** (déjà livrée) et **ajouter une identité par-image** — concrètement : **réagir à UNE image** dans un message multi-images.

Le démantèlement (interprétation B : N messages DB) a été **rejeté par la revue Opus** (refonte transversale, régressions A3/A4, problème rate-limit, nouvelle bulle-cluster ~plusieurs centaines de lignes, refonte identité snapshot). A' délivre le **même bénéfice visible** (identité par-image) sans aucune de ces régressions.

**État vérifié** : `AttachmentReaction` (`schema.prisma:1038-1057`) est **schéma seul** — zéro plumbing gateway/socket/SDK/iOS (`grep .attachmentReaction services/gateway/src` → 0 ; `grep AttachmentReaction apps/ios packages/MeeshySDK` → 0). Donc A' construit une **slice verticale complète**, mais **dérisquée** par un patron prouvé 2× (`CommentReactionService.ts:4` « Mirrors ReactionService exactly », `PostReactionService`). **Taille honnête : MEDIUM.**

## 2. Scope (décidé)

| Décision | Choix |
|---|---|
| Cible | **Réactions par-image** uniquement |
| Surface | **Grilles multi-images** (`solo == false`) ; image solo → garde la réaction message-level |
| Coexistence | Réaction message-level (bulle, inchangée) **+** réaction par-image (cellule) — tables distinctes (`Reaction` vs `AttachmentReaction`), additif |
| Images protégées/view-once | Pas de réaction avant révélation (le long-press blur possède déjà le geste) |
| Limite | 1 emoji / user / PJ (déjà garanti par `unique([attachmentId, participantId, emoji])`) |
| View-once / statut par-PJ | **Différé** (follow-up cheap : `AttachmentStatusEntry` déjà plumbé via `MessageReadStatusService.ts`) |

**Hors scope explicite** : N messages DB (B) ; view-once/statut par-PJ ; réactions par-image sur image solo ; onglet detail-sheet par-PJ ; parité offline-queue des réactions par-image (Phase ultérieure si besoin).

## 3. Modèle de données (existant, non modifié)

`AttachmentReaction` (`schema.prisma:1038-1057`) : `id`, `attachmentId`, `messageId`, `participantId`, `emoji`, `createdAt` ; `@@unique([attachmentId, participantId, emoji])` + index sur `attachmentId`/`messageId`/`participantId`/`emoji`. Le client Prisma a déjà le delegate `prisma.attachmentReaction`. **Aucune migration** (MongoDB dynamique). Type TS `AttachmentReaction` déjà déclaré (`packages/shared/types/conversation.ts`).

## 4. Architecture (slice verticale, miroir des réactions message-level)

### 4.1 Gateway — `AttachmentReactionService` (nouveau, clone de `ReactionService`)
Fichier `services/gateway/src/services/AttachmentReactionService.ts`. Miroir de `ReactionService.ts` (template prouvé par `CommentReactionService`/`PostReactionService`) :
- `addAttachmentReaction({ attachmentId, messageId, participantId, emoji })` : valide l'emoji, résout la conversation via `message.conversationId` (membership = participant de la conversation, comme `ReactionService.ts:73-76`), upsert `prisma.attachmentReaction` (l'unique garantit l'idempotence). Cap 1 emoji/user/PJ (miroir `ReactionService.ts:78-92`).
- `removeAttachmentReaction(...)` : `deleteMany`.
- `getAttachmentReactions(attachmentId)` : agrégation `{ emoji → count, currentUserReacted }` (miroir `getMessageReactions`).
- `createUpdateEvent(...)` → `{ attachmentId, messageId, conversationId, participantId, emoji, action, aggregation, timestamp }` (miroir `ReactionService.ts:306-328`).

### 4.2 Gateway — `AttachmentReactionHandler` (nouveau, clone de `ReactionHandler`)
Fichier `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts` (ou 3 méthodes ajoutées au handler existant). Miroir de `ReactionHandler.ts:49-222` : validation, résolution `participantId`, appel service, broadcast `io.to(ROOMS.conversation(id)).emit(...)`. La résolution conversation est **identique** (le payload porte `messageId`).

### 4.3 Shared — événements socket
`packages/shared/types/socketio-events.ts` (convention `entity:action-word`, hyphens) :
- **Client → Server** : `attachment:reaction-add`, `attachment:reaction-remove`, `attachment:reaction-request-sync`.
- **Server → Client** : `attachment:reaction-added`, `attachment:reaction-removed`, `attachment:reaction-sync`.
- Types payload `AttachmentReactionAddData` etc. portant `attachmentId` + `messageId` + `emoji` (+ `participantId`/`aggregation` côté serveur).

> Alternative évaluée : faire transiter les réactions via `message:attachment-updated` (`socketio-events.ts:190`, delta attachment existant). **Rejeté** : les réactions ont leur propre flux optimiste (toggle + animation comet) ; des events dédiés miroir des réactions message-level sont plus clairs et réutilisent le pattern prouvé. À reconsidérer si la surface d'events devient un souci.

### 4.4 Gateway — sérialisation des réactions sur l'attachment
`serializeAttachmentForSocket` (chemin `message:new`) **et** la query liste REST `GET /messages` doivent **inclure les réactions agrégées par attachment** (`reactions: [{emoji, count, ...}]`) pour l'hydratation cold-load. C'est du **NOUVEAU** câblage (l'attachment ne porte pas de réactions aujourd'hui). Suivre la règle « Fastify response schema strips undeclared fields » : déclarer le champ dans le schéma de réponse + le `.map()` si présent.

### 4.5 SDK iOS — model + socket
- `MeeshyMessageAttachment` (`CoreModels.swift:929`, `Codable`) gagne `reactions: [AttachmentReactionSummary]?` (+ CodingKey + `decodeIfPresent`). **Modèle SDK → dans `packages/MeeshySDK/`** (règle critique SDK). Nouveau type léger `AttachmentReactionSummary { emoji, count, reactedByMe }`.
- ⚠️ **Pas de migration GRDB** (avantage clé vs B) : les attachments sont sérialisés dans la colonne `attachmentsJson` de `MessageRecord` (blob JSON), pas en colonnes. Ajouter un champ optionnel `reactions` au struct = nouvelle clé JSON `decodeIfPresent`, **rétro-compatible**, aucune colonne/migration. (Contraste B qui exigeait une colonne `MessageRecord.groupId` + migration.)
- `MessageSocketManager` : listeners `attachment:reaction-added/removed` (miroir `:2065`) + méthode `addAttachmentReaction(attachmentId:messageId:emoji:)` / `removeAttachmentReaction(...)`.

### 4.6 App iOS — ViewModel + UI grille
- `ConversationViewModel.toggleAttachmentReaction(attachmentId:messageId:emoji:)` : miroir de `toggleReaction` (`:2729-2791`) — optimiste + outbox + flush. **Persistance optimiste** : la réaction se pose sur l'attachment **dans** le message porteur (muter le `reactions` de l'attachment ciblé au sein de `attachmentsJson`, ré-encodé), miroir de la façon dont une réaction message-level mute `reactionsJson` — pas un store parallèle. Un delta socket `attachment:reaction-added/removed` applique le même chemin par `(messageId, attachmentId)`. Réutiliser `ReactionAnimationGate` (clé `attachmentId+emoji`).
- `BubbleGridCell` (`BubbleStandardLayout+Media.swift:246`) : ajouter (a) une **pill de réaction en coin** (miroir `viewCountBadge` `:370`, overlay ZStack), (b) un **long-press → `EmojiReactionPicker`** (MeeshyUI) **ancré par cellule**. Le geste est **libre** (la cellule n'a que `onTapGesture` `:299` ; le long-press blur `:594` n'existe que pour images protégées non révélées → règle nette : pas de réaction avant révélation). Threader **1 callback** (`onReactToAttachment`) via `makeGridCell` (`:113`).

## 5. Décisions de design (rappel)
1. **Coexistence** message-level + par-image (tables distinctes, additif, zéro régression).
2. **Image solo** → réaction message-level (par-image seulement `solo == false`).
3. **Protégées** → révélation d'abord.
4. **Limite** 1 emoji/user/PJ (unique).
5. **View-once/statut par-PJ** différé.

## 6. Build phasé
- **Phase 0 (gateway + SDK, sans UI)** : `AttachmentReactionService` + handler + 6 events + sérialisation réactions sur l'attachment + `MeeshyMessageAttachment.reactions` decode + `MessageSocketManager` send/listen. *Critère : réagir à un `attachmentId` via socket → persisté + broadcast + reçu/décodé côté iOS (REST cold-load + socket live).*
- **Phase 1 (UI iOS)** : `toggleAttachmentReaction` optimiste + store ; pill par cellule + long-press→picker ancré + animation comet par-image. *Critère : long-press image dans une grille → picker → réaction affichée par-image, optimiste puis confirmée, multi-device.*

## 7. Plan de test (TDD)
- **Gateway** (Jest) : `AttachmentReactionService` add/remove/get (idempotence via unique, cap 1/user/PJ, agrégation), résolution conversation via messageId, broadcast event shape.
- **SDK** (Swift Testing/XCTest) : decode `MeeshyMessageAttachment.reactions` ; `AttachmentReactionSummary` decode ; `MessageSocketManager` emit/parse des events `attachment:reaction-*`.
- **App** (XCTest) : `toggleAttachmentReaction` optimiste (ajout local immédiat + outbox enqueue) ; application d'un delta socket ; image solo n'expose pas le par-image.
- **Build** : `meeshy.sh build` + `meeshy.sh test` (iOS) ; `npx jest` (gateway) ; `tsc --noEmit`.

## 8. Fichiers touchés

| Fichier | Type |
|---|---|
| `services/gateway/src/services/AttachmentReactionService.ts` | nouveau (clone ReactionService) |
| `services/gateway/src/socketio/handlers/AttachmentReactionHandler.ts` (+ wiring) | nouveau |
| `packages/shared/types/socketio-events.ts` | edit (6 events + payload types) |
| `services/gateway/src/socketio/serializeAttachmentForSocket.ts` + query liste `messages.ts` + `api-schemas.ts` | edit (inclure réactions agrégées) |
| `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` + `MessageModels.swift` | edit (`reactions` + `AttachmentReactionSummary`) |
| `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift` | edit (listeners + send) |
| `apps/ios/.../ViewModels/ConversationViewModel.swift` | edit (`toggleAttachmentReaction` + store + subscriber) |
| `apps/ios/.../Views/Bubble/BubbleStandardLayout+Media.swift` | edit (pill + long-press picker + `makeGridCell` callback) |
| tests gateway + SDK + app | nouveaux/edit |

⚠️ **pbxproj** : nouveaux fichiers SDK = auto-découverts (SPM) ; les edits app sont sur fichiers existants → **pas d'entrée pbxproj** sauf si un nouveau fichier app est créé (à éviter — étendre l'existant). TypeScript gateway strict:false, pas de `any`. Models SDK strictement dans `packages/MeeshySDK/`.
