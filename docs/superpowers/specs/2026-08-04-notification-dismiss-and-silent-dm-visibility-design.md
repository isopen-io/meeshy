# Fermeture du plein écran depuis une notification + DM vide silencieux

**Date** : 2026-08-04
**Statut** : design validé, prêt pour plan d'implémentation
**Périmètre** : `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (+ `ReelsPresenter`, `StoryViewerCoordinator`, `CallManager` — lecture seule sur ces trois, aucun changement de leur API publique) côté iOS ; `services/gateway/src/routes/conversations/core.ts`, `services/gateway/src/services/messaging/MessagingService.ts` (+ le ou les call sites qui émettent `MESSAGE_NEW`), `packages/shared/prisma/schema.prisma` côté gateway. Deux problèmes indépendants, un seul spec car ils partagent la même origine (notification → état visible incohérent) et sont rapportés ensemble.

## Problème 1 — Le contenu plein écran ne se ferme pas quand une notification navigue ailleurs

### Constat de départ (état actuel du code)

`navigateFromNotification` (`RootView.swift:1367`) route par `switch ctx.type` vers une conversation (`navigateToConversationById` → `router.path = [.conversation(...)]`, une simple mutation `@Published` du `NavigationStack`), un réel (`openReelFromNotification` → `reelsPresenter.present(...)`), ou une story (`router.push(.storyNotificationTarget(...))` → `storyViewerCoordinator.present(...)`).

Aucun `dismiss()` n'est appelé en tête de cette fonction. Trois surfaces plein écran vivent chacune dans un `ObservableObject` indépendant, non coordonné avec `router.path` :

- **Réels** — `ReelsPresenter.shared.launch` (`ReelsPlayerView.swift:13-48`), rendu dans un `ZStack` overlay `zIndex(60)` (`RootView.swift:436-471`), **pas** un `fullScreenCover`. Fermeture normale : `closeReels()` (`RootView.swift:1709`) → `reelsPresenter.dismiss()`.
- **Stories** — `StoryViewerCoordinator.pendingRequest` (`StoryViewerCoordinator.swift:20-36`), rendu via un vrai `.fullScreenCover(item:)` (`RootView.swift:682`). Fermeture normale : binding `set: { if !$0 { storyViewerCoordinator.dismiss() } }` (`RootView.swift:688`).
- **Appel** — `CallManager.shared.displayMode` (`CallDisplayMode` : `.fullScreen`/`.pip`/`.bubble`, `WebRTCTypes.swift:926-930`), rendu via `.fullScreenCover` dans `CallPresentationLayer` (`RootView.swift:65-90`). Le binding `set: { if !$0 { callManager.displayMode = .pip } }` (`RootView.swift:80`) est déjà commenté dans le code : *« Le `set: false` est un "minimize" (→ PiP), PAS un "end call" : swiper le cover vers le bas ne raccroche pas. »* — c'est le même mécanisme que le chevron de minimisation et le swipe-down déjà utilisés partout ailleurs dans l'app (`CallView.swift:190-207`, `:640`).

Résultat rapporté : taper une notification de message pendant qu'un réel est ouvert change bien `router.path` en dessous, mais `reelsPresenter.launch` reste non-nil — le réel (zIndex 60) reste affiché par-dessus, l'utilisateur ne voit rien changer. Le même trou existe structurellement pour Stories et pour un appel plein écran (confirmé en lecture de code, pas encore rapporté par un utilisateur).

### Approche retenue

Appels ciblés directs, en tête de `navigateFromNotification`, avant le `switch ctx.type` — pas de coordinateur central : seulement trois systèmes concernés aujourd'hui, chacun avec sa propre primitive de fermeture déjà existante et testée.

```swift
private func navigateFromNotification(_ ctx: NotificationNavContext) {
    dismissActiveFullScreenSurfaces(unlessTarget: ctx)
    switch ctx.type { ... }
}
```

Règles :
- Si la cible de la notification **n'est pas** un réel et que `reelsPresenter.launch != nil` → `closeReels()`.
- Si la cible **n'est pas** une story et que `storyViewerCoordinator.pendingRequest != nil` → `storyViewerCoordinator.dismiss()`.
- Si un appel est actuellement en plein écran (`CallState.shouldPresentFullScreenCover(callState:displayMode:)` vrai) → `callManager.displayMode = .pip`. **Jamais** `callManager.endCall()` : l'appel WebRTC reste actif, minimisé en PiP/bulle, comme lorsque l'utilisateur minimise lui-même via le chevron.

Quand la cible EST un réel ou une story, aucun dismiss n'est nécessaire : `present(...)` remplace déjà l'état existant en place (comportement actuel inchangé, pas de flicker de fermeture/réouverture).

**Comportement voulu, pas un oubli** : un appel en cours se minimise même pour une notification mineure (ex: une réaction) — décision produit explicite (validée en clarification), l'appel reste joignable en PiP pendant que la navigation a lieu.

## Problème 2 — DM vide : silence côté destinataire jusqu'au premier message

### Constat de départ (état actuel du code)

`POST /conversations` (`services/gateway/src/routes/conversations/core.ts:840`, handler ~856-1180) crée la conversation et, pour une conversation `direct` sans aucun message initial :

- émet **immédiatement** l'event socket `CONVERSATION_NEW` (`conversation:new`) à **tous** les participants y compris le destinataire B (`core.ts:1102-1139`) ;
- appelle `notificationService.createConversationInviteNotification(...)` (`NotificationService.ts:3089-3138`) pour chaque participant invité — type émis `new_conversation_direct` — qui persiste une `Notification`, émet `notification:new`, et déclenche une push (`core.ts:1141-1170`).

`GET /conversations` (`core.ts:248`, `whereClause` `core.ts:316-328`) ne filtre que sur l'appartenance active du participant — **aucun filtre sur la présence de messages**. Une conversation direct vide apparaît donc identiquement dans la liste de A (créateur) et de B (destinataire) dès sa création, et B reçoit une notification pour une conversation où rien ne s'est encore passé.

Le schema Prisma `Conversation` (`packages/shared/prisma/schema.prisma:313-353`) n'a ni `createdBy`, ni aucun champ permettant de distinguer « créateur » de « destinataire », ni de champ permettant de savoir si un premier message a été envoyé (`lastMessageAt` est initialisé à `now()` **à la création**, donc indistinguable d'un vrai message récent).

### Modèle de données

Deux champs nullables ajoutés à `Conversation`, aux côtés de `closedAt`/`closedBy` (`schema.prisma:328-329`, même style de paire déjà en usage dans ce modèle) :

```prisma
createdBy     String?   @db.ObjectId  // id du créateur ; null pour les conversations existantes avant migration
firstMessageAt DateTime?              // null tant qu'aucun message n'a été envoyé ; source de vérité unique
```

Pas de booléen dupliqué (`isEmpty`/`hasMessages`) à côté de `firstMessageAt`, conformément à la convention du projet (`services/gateway/CLAUDE.md` : « No redundant boolean + timestamp pairs »).

**Migration** : les conversations existantes reçoivent `createdBy = null`, `firstMessageAt = null`. Une conversation `direct` déjà vide en base (aucun message jamais envoyé) redeviendrait donc invisible pour ses deux participants après migration — cas marginal à vérifier en base avant merge (le produit est en usage actif, ce cas est probablement quasi inexistant, mais doit être confirmé par une requête de comptage plutôt que supposé).

### Flux de création (direct uniquement — groupes inchangés)

- `prisma.conversation.create` persiste `createdBy: userId`, `firstMessageAt: null` pour **toute** conversation (utile au-delà de ce cas d'usage). Le filtre d'exclusion décrit ci-dessous ne s'applique en revanche que lorsque `type === 'direct'` — un groupe créé sans message reste visible immédiatement pour tous ses membres, comportement inchangé.
- `CONVERSATION_NEW` (`core.ts:1128-1133`) n'est émis **qu'au créateur A** pour un direct sans message — pas à B.
- `createConversationInviteNotification` **n'est pas appelée** pour une conversation `direct` fraîchement créée. Les conversations `group`/`broadcast`/etc. gardent le comportement actuel sans changement : `new_conversation_group`, `added_to_conversation` continuent d'être notifiées immédiatement à la création, cette catégorie de notification garde son sens (rejoindre un groupe est un événement complet en soi, contrairement à un DM vide).

### Flux `GET /conversations`

Ajout d'une clause d'exclusion dans `whereClause` (`core.ts:316-328`) : une conversation `direct` avec `firstMessageAt = null` n'apparaît dans les résultats que si `createdBy === userId` (l'appelant courant). Aucun changement pour les conversations avec au moins un message, ni pour les types non-direct.

### Flux premier message envoyé

Point d'intégration : `MessagingService.updateConversation(conversationId)` (`MessagingService.ts:360-365`), seul point qui bump déjà `lastMessageAt` pour **tout** nouveau message, appelé depuis `runPostSaveSideEffects` (`:330-355`) lui-même appelé depuis `handleMessage` (`:294`) — le point d'entrée unique partagé par les chemins REST et Socket.IO (« Both the Socket.IO and the REST entry points funnel through `handleMessage` », commentaire `MessagingService.ts:255`).

Comportement à ajouter :
- La mise à jour de `lastMessageAt` devient conditionnelle sur `firstMessageAt` : si `firstMessageAt` est actuellement `null`, la même écriture pose aussi `firstMessageAt = <maintenant>` (via un `updateMany` gardé sur `firstMessageAt: null`, pour ne flip qu'une seule fois même en cas de course entre deux messages quasi simultanés).
- Quand cette écriture flip effectivement `firstMessageAt` (0 → 1 ligne affectée signifie « c'était le premier message »), émettre `CONVERSATION_NEW` vers les participants qui ne l'avaient pas reçu à la création (B) — pas une notification distincte, un event de synchro pour que le cache/la liste de B se peuple. La notification que B perçoit reste **uniquement** celle du nouveau message lui-même (pipeline `message:new` + notification standard, déjà existante, inchangée) — pas de `new_conversation_direct` a posteriori.

**Point ouvert pour la phase de plan** : `MessagingService` n'a aujourd'hui aucune référence à `io`/`socketManager` (constructeur : `prisma`, `translationService`, `notificationService?` — `MessagingService.ts:42-46`) ; l'émission de `MESSAGE_NEW` elle-même se fait dans l'appelant (`MessageHandler.ts` côté socket, `routes/conversations/messages.ts` côté REST), qui lui a accès à `io`. Le point exact où câbler l'émission conditionnelle de `CONVERSATION_NEW` (threader `io` dans `MessagingService`, vs. dupliquer un petit helper partagé dans les deux call sites REST/Socket) est à trancher en phase de plan — les deux options sont viables, aucune ne change ce design.

### Approches écartées

- **Cacher aussi côté créateur** (aucun champ `createdBy`, un DM n'apparaît pour personne avant le premier message) : plus simple, aucune migration — mais contredit l'exigence explicite que A voie sa conversation vide.
- **Détecter le « premier message » par une requête `COUNT` par envoi** plutôt que lire `firstMessageAt` : évite d'ajouter un champ, mais ajoute une requête sur **chaque** message envoyé, pour toujours, contre une simple lecture de champ déjà en mémoire au moment du handler — moins bon compromis pour une opération qui a lieu à très haute fréquence (le produit vise 100k+ messages/s).

## Tests (TDD)

**Problème 1 (iOS)** :
- Tests source-inspection (même style que `CallBubbleViewMiniMenuWiringTests.swift`) vérifiant que `navigateFromNotification` appelle bien `closeReels()`/`storyViewerCoordinator.dismiss()`/`callManager.displayMode = .pip` quand la cible diffère, et **ne les appelle pas** quand la cible est le même réel/la même story.
- Tests de non-régression : router vers un réel pendant qu'un réel différent est déjà ouvert ne doit produire aucun flicker de dismiss/re-present (le chemin `present(...)` existant reste seul responsable du remplacement).

**Problème 2 (gateway)** :
- `POST /conversations` (direct, 0 message) : `CONVERSATION_NEW` non émis à B, `createConversationInviteNotification` non appelée pour B ; toujours émis/appelée pour A. Comportement `group`/`broadcast` inchangé (test de non-régression explicite).
- `GET /conversations` : un DM vide n'apparaît que pour `createdBy`, pas pour l'autre participant ; un DM avec au moins un message apparaît pour les deux, quel que soit `createdBy`.
- Envoi du premier message dans un DM créé silencieusement : `firstMessageAt` passe de `null` à non-null exactement une fois (test de concurrence : deux envois quasi simultanés ne doivent flip qu'une fois) ; `CONVERSATION_NEW` émis à B à ce moment ; B ne reçoit **pas** de notification `new_conversation_direct`, seulement la notification de message standard.
- Migration Prisma : conversations pré-existantes avec `createdBy = null` — vérifier le comportement documenté (invisibles pour tous si `firstMessageAt = null`, comportement normal sinon).

## Hors périmètre

- Groupes/broadcasts : comportement de notification à la création **inchangé** — seul le cas `direct` sans message est concerné.
- Tout mécanisme de coordinateur central de présentation plein écran (évalué et écarté en clarification — seulement 3 systèmes aujourd'hui, appels ciblés suffisants).
- Backfill actif de `firstMessageAt` pour les conversations existantes déjà porteuses de messages : `lastMessageAt` reste la source de vérité pour l'ordre/aperçu, `firstMessageAt` ne sert qu'au gate de visibilité des DM vides — un DM déjà non-vide n'a pas besoin d'un `firstMessageAt` rétroactivement exact.
- Cas d'une conversation `direct` qui redevient « vide » après suppression de son seul message (`deletedAt` soft-delete) : hors périmètre, `firstMessageAt` n'est jamais réinitialisé à `null` a posteriori — une conversation qui a eu un message reste visible pour les deux participants même si ce message est ensuite supprimé.
