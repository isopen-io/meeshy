# Fermeture du plein écran depuis une notification + DM vide silencieux

**Date** : 2026-08-04
**Statut** : design validé (revue profonde Opus 3 angles appliquée), prêt pour plan d'implémentation
**Périmètre** : `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (+ nouvelle policy pure, `ReelsPresenter`/`StoryViewerCoordinator`/`CallManager` en lecture seule, aucun changement de leur API publique) côté iOS ; `services/gateway/src/routes/conversations/core.ts`, `services/gateway/src/routes/conversations/delete-for-me.ts`, `services/gateway/src/services/messaging/MessagingService.ts`, `packages/shared/prisma/schema.prisma`, `services/gateway/decisions.md` côté gateway. Deux problèmes indépendants, un seul spec car ils partagent la même origine (notification → état visible incohérent) et sont rapportés ensemble.

## Problème 1 — Le contenu plein écran ne se ferme pas quand une notification navigue ailleurs

### Constat de départ (état actuel du code)

`navigateFromNotification` (`RootView.swift:1367`) route par `switch ctx.type` vers une conversation (`navigateToConversationById` → `router.path = [.conversation(...)]`, une simple mutation `@Published` du `NavigationStack`), un réel (`openReelFromNotification` → `reelsPresenter.present(...)`), ou une story (`router.push(.storyNotificationTarget(...))` → `storyViewerCoordinator.present(...)`).

Aucun `dismiss()` n'est appelé en tête de cette fonction. Trois surfaces plein écran vivent chacune dans un `ObservableObject` indépendant, non coordonné avec `router.path` :

- **Réels** — `ReelsPresenter.shared.launch` (`ReelsPlayerView.swift:13-48`), rendu dans un `ZStack` overlay `zIndex(60)` (`RootView.swift:436-471`), **pas** un `fullScreenCover`. Fermeture normale : `closeReels()` (`RootView.swift:1709`) → `reelsPresenter.dismiss()`.
- **Stories** — `StoryViewerCoordinator.pendingRequest` (`StoryViewerCoordinator.swift:20-36`), rendu via un vrai `.fullScreenCover(item:)` (`RootView.swift:682`). Fermeture normale : binding `set: { if !$0 { storyViewerCoordinator.dismiss() } }` (`RootView.swift:688`).
- **Appel** — `CallManager.shared.displayMode` (`CallDisplayMode` : `.fullScreen`/`.pip`/`.bubble`, `WebRTCTypes.swift:926-930`), rendu via `.fullScreenCover` dans `CallPresentationLayer` (`RootView.swift:65-90`). Le binding `set: { if !$0 { callManager.displayMode = .pip } }` (`RootView.swift:80`) est déjà commenté dans le code : *« Le `set: false` est un "minimize" (→ PiP), PAS un "end call" : swiper le cover vers le bas ne raccroche pas. »* — c'est le même mécanisme que le chevron de minimisation et le swipe-down déjà utilisés partout ailleurs dans l'app (`CallView.swift:190-207`, `:640`).

Résultat rapporté : taper une notification de message pendant qu'un réel est ouvert change bien `router.path` en dessous, mais `reelsPresenter.launch` reste non-nil — le réel (zIndex 60) reste affiché par-dessus, l'utilisateur ne voit rien changer. Le même trou existe structurellement pour Stories et pour un appel plein écran (confirmé en lecture de code, pas encore rapporté par un utilisateur).

### Approche retenue

Une **policy pure et stateless**, testable en comportement (pas seulement en câblage) — correction post-revue : la première version de ce spec prévoyait des tests source-inspection seuls, calqués sur `CallBubbleViewMiniMenuWiringTests.swift`, dont le commentaire justifie ce style précisément par « no new behavior to exercise at runtime » (`:4-11`). Ici il y a un vrai comportement conditionnel neuf (quelle surface fermer selon la cible), donc il doit être testé comme tel — `services/gateway/CLAUDE.md`/CLAUDE.md racine, « Test behavior, not implementation ».

```swift
enum FullScreenDismissPolicy {
    struct ActiveSurfaces {
        let reelsActive: Bool
        let storyActive: Bool
        let callFullScreen: Bool
    }
    enum DismissAction: Equatable { case closeReels, dismissStory, minimizeCall }

    /// Pure : aucune dépendance à ReelsPresenter/StoryViewerCoordinator/CallManager.
    static func actions(for target: NotificationNavContext, active: ActiveSurfaces) -> [DismissAction]
}
```

`navigateFromNotification` devient un wiring mince : il construit `ActiveSurfaces` depuis l'état courant des trois singletons, appelle `FullScreenDismissPolicy.actions(...)`, puis exécute chaque action retournée (`closeReels()`, `storyViewerCoordinator.dismiss()`, `callManager.displayMode = .pip`). **Jamais** `callManager.endCall()` : l'appel WebRTC reste actif, minimisé en PiP/bulle, comme lorsque l'utilisateur minimise lui-même via le chevron.

Quand la cible EST un réel ou une story, la policy ne retourne aucune action pour cette surface : `present(...)` remplace déjà l'état existant en place (comportement actuel inchangé, pas de flicker de fermeture/réouverture).

**Comportement voulu, pas un oubli** : un appel en cours se minimise même pour une notification mineure (ex: une réaction) — décision produit explicite (validée en clarification), l'appel reste joignable en PiP pendant que la navigation a lieu.

## Problème 2 — DM vide : silence côté destinataire jusqu'au premier message

### Constat de départ (état actuel du code)

`POST /conversations` (`services/gateway/src/routes/conversations/core.ts:840`, handler ~856-1180) crée la conversation et, pour une conversation `direct` sans aucun message initial :

- émet **immédiatement** l'event socket `CONVERSATION_NEW` (`conversation:new`) à **tous** les participants y compris le destinataire B (`core.ts:1102-1139`) ;
- appelle `notificationService.createConversationInviteNotification(...)` (`NotificationService.ts:3089-3138`) pour chaque participant invité — type émis `new_conversation_direct`/`new_conversation_group` selon `conversationType` (**correction post-revue** : `added_to_conversation` n'est PAS émis ici, c'est un type distinct produit par `createAddedToConversationNotification`, `NotificationService.ts:3160`, sur le flux d'ajout-de-participant à un groupe existant — sans rapport avec la création) — qui persiste une `Notification`, émet `notification:new`, et déclenche une push (`core.ts:1141-1170`).

`GET /conversations` (`core.ts:248`, `whereClause` `core.ts:316-328`) ne filtre que sur l'appartenance active du participant — **aucun filtre sur la présence de messages**. Une conversation direct vide apparaît donc identiquement dans la liste de A (créateur) et de B (destinataire) dès sa création, et B reçoit une notification pour une conversation où rien ne s'est encore passé.

Le schema Prisma `Conversation` (`packages/shared/prisma/schema.prisma:313-353`) n'a ni `createdBy`, ni aucun champ permettant de distinguer « créateur » de « destinataire », ni de champ permettant de savoir si un premier message a été envoyé (`lastMessageAt` est initialisé à `now()` **à la création**, donc indistinguable d'un vrai message récent).

### Modèle de données

**Correction post-revue (1/2)** : la première version de ce spec proposait un champ `createdBy String?` sur `Conversation`. C'est redondant — `Participant.role` (`schema.prisma:502`, valeurs `admin`/`moderator`/`member`... et `creator`) porte déjà ce rôle, posé à la création (`core.ts:1014`, `role: 'creator'`) et utilisé comme source de vérité du créateur ailleurs dans le codebase (`delete-for-me.ts:48`, `leave.ts:47`, `sharing.ts:327`, `participants.ts:492,669`, `links/creation.ts:170`).

**Attention — le créateur n'est PAS toujours connu.** Deux autres chemins créent des conversations `direct` sans jamais poser `role: 'creator'` sur personne : l'acceptation de demande d'ami (`friends.ts:579-590`, les deux participants reçoivent `role: 'member'`) et `users/devices.ts:450-461`. Ce spec ne touche PAS ces flux (hors périmètre — ils sont mutuels par construction, l'un et l'autre y ont consenti, contrairement au cas rapporté d'une conversation composée unilatéralement). La règle de visibilité ci-dessous doit donc **dégrader proprement vers le comportement actuel (visible pour tous) quand aucun participant n'a `role: 'creator'`**, plutôt que supposer qu'un créateur existe toujours.

Un seul champ nullable ajouté à `Conversation`, aux côtés de `closedAt`/`closedBy` (`schema.prisma:328-329`, même style de paire déjà en usage dans ce modèle) :

```prisma
firstMessageSentAt DateTime?   // null tant qu'aucun message n'a été envoyé ; source de vérité unique
```

Nommé `firstMessageSentAt` et non `firstMessageAt` (**correction post-revue** : `firstMessageAt` est déjà un nom utilisé, avec une sémantique différente — un stat PAR PARTICIPANT dans `ConversationMessageStatsService.ts`/`AgentAnalysisModels.swift` — le réutiliser sur `Conversation` aurait créé une confusion de recherche/lecture, pas une collision de schéma réelle mais un risque de confusion humaine et agent). Pas de booléen dupliqué (`isEmpty`/`hasMessages`) à côté, conformément à la convention du projet (`services/gateway/CLAUDE.md` : « No redundant boolean + timestamp pairs »).

**Piège migration — correction post-revue (2/2), bloquant** : la version précédente de ce spec affirmait que « les conversations existantes reçoivent `firstMessageSentAt = null` ». C'est faux : Prisma/MongoDB ne réécrit jamais les documents existants à l'ajout d'un champ au schema — le champ sera **ABSENT**, pas `null`, sur tout document créé avant le déploiement. Le projet a déjà un incident de production documenté sur exactement ce piège (`CallService.ts:1172-1186`, 211/211 conversations affectées le 2026-07-02 : « `activeCallId: null` matches ONLY documents where the field is explicitly null — NOT documents missing the field »). Une garde `updateMany({ where: { firstMessageSentAt: null }, ... })` ne toucherait donc **jamais** les documents existants (absents ≠ null), et une lecture positive `firstMessageSentAt: null` dans `GET /conversations` exclurait à tort tout document existant qui n'a simplement jamais eu ce champ écrit — y compris des conversations actives avec des dizaines de messages.

**Correction retenue** : formuler toute vérification de visibilité en **négatif** — « absent OU non-null ⇒ visible », seul le cas `null` explicite (posé uniquement par le nouveau code de création, jamais par un document historique) cache. Voir clause Prisma exacte dans Flux `GET /conversations`.

### Flux de création (direct uniquement — groupes et flux hors-périmètre inchangés)

- `prisma.conversation.create` persiste `firstMessageSentAt: null` **uniquement sur le chemin `POST /conversations`** (`core.ts:1000`, celui qui pose aussi `role: 'creator'`). Les autres créateurs de conversations `direct` (`friends.ts`, `devices.ts`) restent intouchés — leurs documents n'auront jamais ce champ posé (absent), donc automatiquement dans la branche « visible pour tous » de la clause ci-dessous, sans code spécial.
- `CONVERSATION_NEW` (`core.ts:1128-1133`) n'est émis **qu'au créateur A** pour un direct sans message — pas à B. Le créateur est déjà connu sans requête supplémentaire : c'est `userId`, la variable qui reçoit `role: 'creator'` quelques lignes plus haut (`core.ts:1014`). **L'auto-join à `ROOMS.conversation(id)` (`core.ts:1106-1112`) reste inchangé pour TOUS les participants, y compris B** — seul l'`emit` se restreint, pas l'appartenance à la room, sinon B ne recevrait même pas le `message:new` du premier message (régression bloquante, à garder comme invariant explicite en phase de plan).
- `createConversationInviteNotification` **n'est pas appelée** pour une conversation `direct` fraîchement créée. Les conversations `group`/`broadcast`/etc. gardent le comportement actuel sans changement.
- Toute émission ajoutée ou modifiée dans ce flux reste dans le `try { ... } catch (broadcastError) { logger.error(...) }` déjà en place (`core.ts:1101`/`:1134-1138`) — règle CLAUDE.md racine « Async EventEmitter Hazard », déjà respectée par le code existant, à ne pas relâcher.

**Idempotence DM — cas non couvert par la version précédente de ce spec, MAJEUR** : `POST /conversations` dédoublonne déjà les DM directs (`core.ts:943-976`, commentaire : incident prod 2026-07-03, 2 DM identiques observées) — si une conversation `direct` existe déjà entre les deux utilisateurs, le handler renvoie l'existante en **200** au lieu d'en créer une nouvelle, **sans passer par l'émission `CONVERSATION_NEW` ni par la logique de notification décrites ci-dessus**. Scénario concret : A crée un DM silencieux avec B (A `creator`, `firstMessageSentAt: null`) ; B, qui ne voit rien, fait lui-même « Nouvelle conversation → A » ; le gateway lui renvoie l'existante en 200 — le DM que B vient d'essayer de créer resterait invisible dans sa PROPRE liste au prochain refresh, alors que son geste exprime une intention de communiquer aussi claire qu'un message.

**Correction retenue** : sur ce chemin de dédoublonnage (`core.ts:943-976`), si l'appelant n'a **pas** `role: 'creator'` sur la conversation trouvée et que `firstMessageSentAt` est encore non-posé, traiter la requête comme une intention mutuelle explicite — poser `firstMessageSentAt = now()` immédiatement (avant de répondre) et émettre `CONVERSATION_NEW` au créateur A (B recevra directement l'objet dans la réponse 200 de son propre appel, pas besoin de le lui émettre à lui-même). Aucun message n'a été échangé, mais un geste actif et non-ambigu des deux côtés a eu lieu — différent du silence unilatéral que ce spec vise à corriger.

### Flux `GET /conversations`

Clause Prisma ajoutée à la racine du `whereClause` (`core.ts:316-328`) — **pas** nichée dans `participants.some` (`type` et `firstMessageSentAt` sont des champs de `Conversation`, pas de `Participant`, impossible à exprimer dans cette sous-clause) :

```ts
whereClause.OR = [
  { type: { not: 'direct' } },
  { NOT: { firstMessageSentAt: null } }, // absent (legacy) OU déjà posé ⇒ visible ; seul `null` explicite cache
  { participants: { some: { userId, role: 'creator' } } },
  { participants: { none: { role: 'creator' } } } // aucun créateur identifiable (friends.ts/devices.ts) ⇒ comportement actuel
];
```

**Placement critique — bug confirmé sur la version précédente** : le bloc `withUserId` (`core.ts:335-350`, utilisé par `GET /conversations?withUserId=`, la requête « ai-je déjà un DM avec cette personne » consommée par le web `apps/web/services/conversations/crud.service.ts:41`) fait `delete whereClause.participants` et reconstruit `whereClause.AND` à partir de zéro. Une clause posée « à l'intérieur du `participants.some` initial » comme le proposait la version précédente serait donc **silencieusement supprimée** sur cette branche, fuitant le DM caché à B exactement sur le chemin où B chercherait à savoir s'il a déjà une conversation avec A. Le `whereClause.OR` ci-dessus doit être ajouté **après** le bloc `withUserId` (`core.ts:350`), pas fusionné dedans — un `OR` à la racine du `whereClause` se combine par ET implicite avec `whereClause.AND`/`whereClause.participants` quel que soit leur contenu, donc résiste à cette réécriture.

**Interaction avec le transfert de propriété existant, corrigée** (`delete-for-me.ts:47-74`, `leave.ts`) : si A quitte/supprime pour lui-même un DM encore vide avant tout message, le code actuel transfère inconditionnellement `role: 'creator'` à B — B verrait alors surgir dans sa liste une conversation **vide qu'il n'a jamais demandée**, exactement ce que ce spec cherche à éviter côté création. **Correction ajoutée au périmètre** : dans `delete-for-me.ts`, quand la conversation est `type: 'direct'` ET `firstMessageSentAt` non posé (vide, jamais eu de message), sauter le transfert de propriété et fermer/désactiver la conversation directement (comme le fait déjà le code pour le cas « aucun successeur », `delete-for-me.ts:89-95` — étendre cette même branche à « DM vide », pas seulement « pas de successeur actif »). Une conversation sans aucun contenu n'a rien à préserver pour un successeur qui ne l'a pas demandée.

### Flux premier message envoyé

**Simplification post-revue, majeure** : la version précédente prévoyait de ré-émettre `CONVERSATION_NEW` à B au moment du premier message, et laissait ouvert le câblage d'un accès `io`/`socketManager` dans `MessagingService` pour cela. La revue a montré que **c'est inutile** — trois mécanismes déjà existants et déjà idempotents matérialisent une conversation inconnue chez le destinataire dès le premier `message:new`, sans dépendre de `CONVERSATION_NEW` :
1. iOS `ConversationSyncEngine.swift:963-982` — fetch et matérialise depuis un `message:new` pour un `conversationId` absent du cache.
2. Web `apps/web/hooks/queries/use-socket-cache-sync.ts:365-388` — même mécanisme.
3. Le gateway fan-out déjà `CONVERSATION_UPDATED` à tous les participants sur **chaque** message (`MessageHandler.ts:1140-1167`), déjà consommé côté iOS (`ConversationListViewModel.swift:721-728`).

Cela tient à condition que l'auto-join à `ROOMS.conversation(id)` reste universel pour B dès la création (voir Flux de création ci-dessus) — sans quoi B ne recevrait tout simplement jamais le `message:new` qui déclenche ces mécanismes. Ce spec ne change donc **rien** à l'émission socket au premier message : seule la persistance de `firstMessageSentAt` doit être ajoutée, pour que `GET /conversations` renvoie ensuite la conversation à B lors d'un prochain rafraîchissement complet (relance, pull-to-refresh), pas seulement via le cache déjà chaud matérialisé par `message:new`.

Point d'intégration : partout où `lastMessageAt` est déjà bumpé à l'envoi d'un message. Le point principal est `MessagingService.updateConversation(conversationId)` (`MessagingService.ts:360-365`), appelé depuis `runPostSaveSideEffects` (`:330-355`) lui-même appelé depuis `handleMessage` (`:294`, point d'entrée partagé REST/Socket.IO). **Correction post-revue** : ce n'est pas l'unique chemin de création de message — `MessageTranslationService.ts:309-335` en crée aussi hors `handleMessage` ; à auditer et couvrir en phase de plan.

Comportement à ajouter, en **deux écritures distinctes**, pas une seule (**correction post-revue, bloquant** : fusionner les deux dans un unique `updateMany` gardé sur `firstMessageSentAt: null` casserait le bump de `lastMessageAt` pour tous les messages suivants — cette écriture doit rester inconditionnelle, elle pilote l'ordre de la liste, le curseur `before`, et le delta sync) :

```ts
await prisma.conversation.update({ where: { id }, data: { lastMessageAt: new Date() } }); // inchangé, inconditionnel
await prisma.conversation.updateMany({ // nouveau, additionnel, gardé — ne flip qu'une fois même en cas de course
  where: { id, firstMessageSentAt: null },
  data: { firstMessageSentAt: new Date() }
});
```

Aucune émission socket supplémentaire liée à ce flip — voir simplification ci-dessus. La notification que B perçoit reste **uniquement** celle du nouveau message lui-même (pipeline `message:new` + notification standard, déjà existante, inchangée) — pas de `new_conversation_direct` a posteriori.

### Approches écartées

- **Cacher aussi côté créateur** (un DM n'apparaît pour personne avant le premier message) : plus simple, aucune notion de créateur à consulter — mais contredit l'exigence explicite que A voie sa conversation vide.
- **Ajouter un champ `createdBy` dédié sur `Conversation`** : première version de ce spec, écartée en revue — redondant avec `Participant.role === 'creator'` déjà existant et déjà source de vérité ailleurs dans le codebase, avec un risque réel de désynchronisation silencieuse au transfert de propriété.
- **Détecter le « premier message » par une requête `COUNT` par envoi** plutôt que lire `firstMessageSentAt` : évite d'ajouter un champ, mais ajoute une requête sur **chaque** message envoyé, pour toujours, contre une simple lecture/écriture de champ déjà en mémoire au moment du handler — moins bon compromis pour une opération qui a lieu à très haute fréquence (le produit vise 100k+ messages/s).
- **Ne rien créer côté serveur avant le premier envoi** (brouillon 100% local, à la WhatsApp/iMessage/Telegram — SOTA du domaine) : approche la plus proche de l'état de l'art, mais `NewConversationViewModel.swift:216-240` montre qu'iOS a aujourd'hui besoin d'un `conversationId` serveur synchrone dès l'ouverture de l'écran de composition (pas de mode brouillon local) — adopter cette approche demanderait une refonte du flux de composition côté client, hors périmètre d'un correctif de ce calibre.
- **Signal explicite de « rattrapage »** sur le payload `CONVERSATION_NEW` pour distinguer une conversation neuve d'une conversation récupérée tardivement : jugé inutile en revue — les handlers `conversation:new` sont déjà idempotents des deux côtés (iOS : garde `convIndex == nil` ; web : dédoublonnage), et le flip de `firstMessageSentAt` ne déclenche de toute façon plus aucune ré-émission (voir Flux premier message).

## Tests (TDD)

**Problème 1 (iOS)** :
- Tests de comportement (pas seulement source-inspection) sur `FullScreenDismissPolicy.actions(for:active:)` : toutes les combinaisons pertinentes de surfaces actives × types de cible, y compris cible = même réel/même story (aucune action retournée).
- Test source-inspection léger sur `navigateFromNotification` : vérifie qu'il consulte la policy et exécute chaque action retournée sur le bon objet (`closeReels`/`storyViewerCoordinator.dismiss`/`callManager.displayMode = .pip`), sans dupliquer la logique de décision déjà couverte par les tests de policy.
- Test de non-régression : router vers un réel pendant qu'un réel différent est déjà ouvert ne doit produire aucun flicker de dismiss/re-present (le chemin `present(...)` existant reste seul responsable du remplacement).

**Problème 2 (gateway)** :
- `POST /conversations` (direct, 0 message, pas de dédoublonnage) : `CONVERSATION_NEW` non émis à B, `createConversationInviteNotification` non appelée pour B ; toujours émis/appelée pour A ; auto-join room toujours effectué pour B. Comportement `group`/`broadcast` inchangé (non-régression explicite). **Tests existants à mettre à jour** : `services/gateway/src/__tests__/unit/routes/conversation-core.test.ts:1209` et `:2046` assertent aujourd'hui que `createConversationInviteNotification` est appelée pour un `direct` fraîchement créé — à corriger pour refléter le nouveau comportement.
- `POST /conversations` (dédoublonnage, appelant non-créateur, DM encore vide) : `firstMessageSentAt` posé immédiatement, `CONVERSATION_NEW` émis au créateur A.
- `GET /conversations` : un DM vide n'apparaît que pour le participant `role === 'creator'` ; un DM sans créateur identifiable (participants créés via `friends.ts`/`devices.ts`) reste visible pour tous, comme aujourd'hui ; un DM avec au moins un message apparaît pour tous quel que soit leur rôle. Couvrir explicitement la requête avec `withUserId` (branche qui reconstruit `whereClause`).
- Transfert de propriété sur un DM vide : `delete-for-me` par le créateur ferme la conversation au lieu de transférer le rôle (nouvelle branche à `delete-for-me.ts`) ; sur un DM déjà non-vide, le transfert existant est inchangé.
- Envoi du premier message dans un DM créé silencieusement : `lastMessageAt` bumpé comme aujourd'hui (inconditionnel) ; `firstMessageSentAt` passe de non-posé à non-null exactement une fois (test de concurrence : deux envois quasi simultanés ne doivent flip qu'une fois) ; aucune émission socket supplémentaire ; B ne reçoit **pas** de notification `new_conversation_direct`, seulement la notification de message standard ; `GET /conversations` renvoie désormais la conversation à B.
- Migration Prisma : conversations pré-existantes où `firstMessageSentAt` est **absent** (pas `null`) — la clause `NOT: { firstMessageSentAt: null }` doit les traiter comme visibles pour tous les participants, y compris celles sans aucun message historique (cas marginal à vérifier en base par une requête de comptage avant merge, mais qui n'exclut plus personne par erreur grâce à la formulation négative).

## Hors périmètre

- Les flux de création de DM direct hors `POST /conversations` (`friends.ts`, `devices.ts`) : aucun `role: 'creator'` n'y est posé, donc automatiquement non affectés par la nouvelle règle de visibilité (branche `participants: { none: { role: 'creator' } }`) — comportement actuel préservé, pas de changement de code sur ces fichiers.
- Groupes/broadcasts : comportement de notification à la création **inchangé** — seul le cas `direct` sans message est concerné.
- Tout mécanisme de coordinateur central de présentation plein écran (évalué et écarté en clarification — seulement 3 systèmes aujourd'hui, appels ciblés suffisants).
- Backfill actif de `firstMessageSentAt` pour les conversations existantes déjà porteuses de messages : `lastMessageAt` reste la source de vérité pour l'ordre/aperçu ; `firstMessageSentAt` ne sert qu'au gate de visibilité des DM vides, et la clause négative rend un backfill inutile pour les conversations déjà actives.
- Cas d'une conversation `direct` qui redevient « vide » après suppression de son seul message (`deletedAt` soft-delete) : hors périmètre, `firstMessageSentAt` n'est jamais réinitialisé à `null` a posteriori — une conversation qui a eu un message reste visible pour les deux participants même si ce message est ensuite supprimé.
- **Fenêtre de cache client sur la migration** : le delta sync iOS (`updatedSince=`) est upsert-only (`ConversationSyncEngine.swift:176-185`) — un DM déjà vide et déjà en cache chaud chez le participant non-créateur ne disparaîtra de son app qu'au prochain full-reconcile (jusqu'à 24h, `fullReconcileInterval`) ou pull-to-refresh manuel, pas immédiatement au déploiement. Comportement accepté (cas marginal déjà signalé comme quasi-inexistant en prod), à ne pas confondre avec une régression du filtre serveur lui-même qui, lui, est immédiat.
- Documentation : ce spec ajoute une décision architecturale notable (visibilité conditionnelle d'une conversation) — un ADR doit être ajouté à `services/gateway/decisions.md`, et le nouveau champ `firstMessageSentAt` documenté dans `packages/shared/CLAUDE.md` (section schema), en phase d'implémentation plutôt que dans ce spec.
