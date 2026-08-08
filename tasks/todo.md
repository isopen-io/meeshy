# Sémantique like / impression / vue — POST, REEL, MOOD (2026-07-31)

## Demande
1. Le like d'un réel depuis feed-posts / feed-réels / détail semble incrémenter
   « des données différentes au lieu de la même donnée ».
2. Chaque impression de REEL, POST, MOOD depuis **n'importe quelle** vue doit
   incrémenter `impressionCount`. Arbitrage retenu : **une impression par
   apparition à l'écran** (déduplication de session retirée).
3. Ouvrir un réel en détail doit aussi incrémenter `viewCount`, avec un champ de
   vues **uniques par utilisateur** — à réutiliser s'il existe.

## Constats (Phase 1 — investigation)

### Ce qui est SAIN (le soupçon ne se vérifie pas côté serveur)
- **Un seul écrivain du like.** `PostReactionService.updatePostReactionSummary`
  recalcule depuis la table `PostReaction` (`groupBy`) et écrit `reactionSummary`,
  `reactionCount` ET `likeCount` au **même total**. REST `/posts/:id/like` et le
  socket `reaction:add` y convergent tous les deux (`PostService.likePost` →
  `addReaction`). Vérifié en prod : 20/20 posts avec `likeCount == reactionCount`,
  `reactionSummary` cohérent.
- **Les vues uniques existent déjà.** `PostView` porte `@@unique([postId, userId])` ;
  `PostService.recordView` ne crée la ligne qu'à la première vue et n'incrémente
  `viewCount` qu'alors (auteur exclu, visibilité vérifiée). `viewCount` EST donc
  le compteur de vues uniques demandé — rien à créer.
- Le détail appelle bien `viewPost` (`PostDetailView:747`, `:1194`).

### D1 — Le batch d'impressions ignore les occurrences répétées
`POST /posts/impressions/batch` : `createMany` insère **N** lignes `PostImpression`
mais `updateMany({ where: { id: { in: capped } } })` incrémente chaque post
**une seule fois**. Envoyer `["A","A","A"]` crée 3 lignes et ne monte le compteur
que de 1 → table et compteur dénormalisé divergent. Bloquant pour la sémantique
« une par apparition ».
Fichier : `services/gateway/src/routes/posts/interactions.ts:400`.

### D2 — Le détail n'écoute pas le like du post
`PostDetailViewModel` s'abonne à `commentAdded`, `commentDeleted`,
`commentReaction*`, `postTranslationUpdated` — **pas** à `postLiked`/`postUnliked`.
Un like venu d'une autre surface ou d'un autre utilisateur n'atteint jamais le
détail ouvert.
Fichier : `apps/ios/Meeshy/Features/Main/ViewModels/PostDetailViewModel.swift:824`.

### D3 — Le like n'est écrit dans AUCUN cache partagé
Le même post vit sous plusieurs clés du store `feed` : `main-feed`, `<postId>`
(détail), la clé reels, `bookmarks`. Or :
- `PostDetailViewModel.likePost` mute `post` en mémoire, **jamais** `feed.save`
- `ReelsViewModel.toggleLike` n'a qu'un `likeDelta` mémoire — son protocole
  `ReelFeedCacheReading` est en **lecture seule**
- `FeedViewModel` ne persiste que `main-feed`
→ Le compteur affiché dépend de la clé de cache lue. C'est le « données
différentes au lieu de la même donnée » rapporté.

### D4 — MOOD/STATUS ne compte ni impression ni vue
`StatusViewModel` et les vues de statut n'appellent ni `recordImpression` ni
`viewPost`. Aucune source `status` dans l'enum d'impression.

### D5 — Déduplication de session sur toutes les surfaces sauf story
`recordedImpressionIds` (FeedView, ProfileUserPostsList), `impressionRecordedIds`
(ReelsViewModel) : un post revu ne recompte jamais. Contraire à l'arbitrage retenu.
Le rate limit `impression` (10/min) est trop bas pour la nouvelle sémantique.

## Plan

- [x] T1 gateway — batch : incrémenter par occurrence (+ 3 tests)
- [x] T2 gateway — source `status` dans l'enum d'impression (+ test)
- [x] T3 gateway — rate limit impression 10 → 30/min (+ test)
- [x] T4 iOS — retirer la dédup de session (FeedView, ProfileUserPostsList, ReelsViewModel)
- [x] T5 iOS — MOOD : impression à l'apparition, vue à l'ouverture (+ 3 tests)
- [x] T6 iOS — `PostDetailViewModel` s'abonne à `postLiked`/`postUnliked` (+ 4 tests)
- [x] T7 SDK — `GRDBCacheStore.patchEverywhere` + write-through du like dans
      `CacheCoordinator` (+ 5 + 4 tests)
- [x] T9 iOS — favoris : dernière surface de contenu sans impression
- [x] T10 web — même sémantique d'impression + sources `story`/`status` manquantes
- [x] T8 vérification — tsc, tests gateway, tests SDK/iOS/web, build, run iPad

## Revue

### Livré (4 commits)
| Commit | Portée |
|---|---|
| `3e2ac4163` | gateway — incrément par occurrence, source `status`, rate limit 30/min |
| `6d3cdcb84` | SDK — `patchEverywhere` + write-through du like dans `CacheCoordinator` |
| `e00439215` | iOS — dédup de session retirée, MOOD et favoris tracés, détail abonné aux likes |
| `6cdc64306` | web — même sémantique d'impression, enum de sources complété |

### Preuves
- **D1 mesuré en prod** : `POST /posts/impressions/batch` avec `[A,A,A]` répond
  `recorded:3` mais ne monte `impressionCount` que de 1 (29 → 30). La table
  `PostImpression` et le compteur dénormalisé divergeaient.
- **Nouvelle sémantique vérifiée sur iPad** : trois cycles d'apparition du même
  post donnent 32 → 33 → 34 → 35. Avec la déduplication de session, le compteur
  restait figé après la première apparition.
- Tests : 14 951 gateway (2 échecs `magic-link` — flake d'exécution parallèle,
  verts isolément avec ET sans les changements), 2453 SDK, 89 iOS ciblés, 9 web.
  Gateway `tsc` 0 erreur. Builds iOS + iPad verts.

### Piège de test rencontré
Le premier test du batch passait sur le code bogué : je sommais les ids répétés
du `where.id.in`, alors que Prisma **déduplique** un `in`. Corrigé en sommant sur
`Set(in)` — le test est alors devenu rouge (1 au lieu de 2) avant de passer.

### Dépend du déploiement
`source: "status"` répond encore `400` et le batch ne compte encore qu'une
occurrence par post tant que le gateway n'est pas redéployé. Les clients
dégradent proprement (échec avalé, aucune UI bloquée).

---

# Dette brouillons/stories — fidélité de reprise + sélection visible (2026-08-02)

## Demande (dette consignée par la session du 2026-08-02)
1. `resumeFailedItem` ne reporte pas `visibilityUserIds`/`originalLanguage` —
   le store de brouillons ne modélisait que `visibility`.
2. Grille « Mes stories » : mode sélection sans AUCUN indicateur visuel sur
   les cartes.

## Plan
- [x] T1 SDK — `StoryDraftStore.save/load` : meta `visibilityUserIds` (JSON)
      + `originalLanguage`, effacement des clés quand la valeur disparaît
      (+ 3 tests)
- [x] T2 SDK — `restorableVisibility(stored:userIds:)` : « Seulement…/Sauf… »
      survit AVEC sa liste ; `restoreDraft()` restaure audience + langue ;
      les 2 autosaves persistent les nouveaux champs (+ 4 tests)
- [x] T3 app — `resumeFailedItem` reporte `visibilityUserIds`/`originalLanguage`
      (+ 1 test)
- [x] T4 app — `MyStoryCard` : pastille de sélection (vide/cochée) + anneau
      accent, état décidé par `MyStoryCardPresentation.selectionIndicator`
      (+ 2 tests + 1 garde de câblage)
- [x] T5 — vérification : SDK 38/38 verts (StoryDraftStoreTests 23,
      StoryComposerPublishHandoffTests 15), build-for-testing app OK,
      app 26/26 verts (Resume 6, Presentation 17, BulkDeleteGuard 3)

## Revue
Store : clés meta par brouillon, effacées quand la valeur retombe (pas d'état
fantôme entre autosaves). Restauration : un mode à sélection ne survit
qu'accompagné de sa liste — sans elle, repli produit inchangé (Contacts).
La pastille de sélection est décidée par un helper pur
(MyStoryCardPresentation.selectionIndicator), la vue ne fait que rendre.

---

# Rattrapage web après reconnexion — watermark empoisonné, fenêtre exclusive, ACK perdu (2026-08-07)

## Demande (routine amélioration continue temps réel)
Auditer le cœur temps-réel vérifiable sous Linux (shared / gateway / web) et
livrer jusqu'au merge. Cycle précédent : ACK réaction sur écriture + réconciliation
de l'envoi optimiste expiré (PR #2601).

## Constats (Phase 1 — audit du rattrapage `syncNewerMessages`)
Le rattrapage non destructif de `useConversationMessagesRQ` — le seul mécanisme
web qui comble le trou d'une déconnexion — portait trois défauts, tous sur le
chemin exact qu'il est censé couvrir.

### D1 — Le watermark était calculé sur l'horloge LOCALE
`newestCreatedAtMs(cached.pages.flatMap(p => p.messages))` inclut les messages
**optimistes**, dont `createOptimisticMessage` pose le `createdAt` avec l'horloge
de l'appareil. Or le seul moment où un optimiste séjourne dans le cache est celui
où le rattrapage sert : composition hors-ligne, ou ACK perdu. Le client demandait
donc `createdAt > maintenant-sur-cet-appareil` à un gateway qui compare en temps
**serveur** → rien ne revenait, et tout ce que les pairs avaient envoyé pendant la
coupure restait invisible jusqu'à un rechargement à froid.
**iOS ne souffrait pas du défaut** : `SyncWatermark.newest` exclut explicitement
les optimistes (`packages/MeeshySDK/Sources/MeeshySDK/Models/SyncWatermark.swift`).
Le web était la seule surface divergente.

### D2 — Fenêtre `after` exclusive à la milliseconde
`buildAfterWatermarkClause` applique `createdAt > after` (STRICT). Ancrer sur
l'instant exact du plus récent message connu rend un jumeau créé dans la même
milliseconde définitivement inatteignable. iOS reculait déjà d'une milliseconde
(`ConversationViewModel.syncMissedMessages`) ; le web non.

### D3 — Pas de réconciliation par `clientMessageId`
Le rattrapage ne dédupliquait que par `id`. La copie serveur d'un envoi confirmé
pendant la coupure porte un `id` MongoDB ≠ `_tempId` (`cid_<uuid>`) mais bien le
`clientMessageId` (exposé par la route REST) : la bulle optimiste restait à côté
de sa propre copie serveur → message affiché deux fois.

## Plan
- [x] T1 — RED : 4 tests (`use-conversation-messages-rq.test.tsx`)
- [x] T2 — watermark sur messages confirmés serveur uniquement (`!isOptimisticMessage`)
- [x] T3 — repli relecture complète quand le cache n'a AUCUN message serveur
      (non destructive : `mergePendingLocalMessages` préserve les envois en attente)
- [x] T4 — `WATERMARK_INCLUSIVE_MARGIN_MS = 1` : fenêtre inclusive
- [x] T5 — réconciliation par `clientMessageId` : la copie serveur REMPLACE l'optimiste
- [x] T6 — vérification : suite web complète, `tsc` sur le fichier touché
- [x] T7 — CHANGELOG

## Revue
Le correctif aligne le web sur un contrat déjà écrit, testé et documenté côté iOS
— ce n'était pas un arbitrage de design mais un **trou de parité**. Les
assertions existantes sur la valeur exacte de `after` ont été mises à jour
(la fenêtre devient volontairement inclusive) ; les 4 nouveaux tests ont été vus
ROUGES avant correctif.

Divergence assumée avec iOS sur le cas « aucun message serveur » : iOS no-op
(le chargement complet a lieu à l'ouverture), le web relit complètement — un
onglet peut rester ouvert des heures en arrière-plan sans jamais repasser par un
montage, et la relecture y est non destructive.

---

# File de renvoi hors-ligne web — l'échec traité comme un succès (2026-08-07)

## Demande (routine amélioration continue temps réel)
Cycle N+1. Précédent : rattrapage `syncNewerMessages` (watermark local, fenêtre
exclusive, réconciliation `clientMessageId`) — mergé via PR #2604.
Périmètre vérifiable sous Linux : shared / gateway / web.

## Constats (Phase 3 & 4 — pipeline de renvoi `useAutoRetryFailedMessages`)
Le seul mécanisme web qui rejoue automatiquement un message dont l'envoi a
échoué. Trois défauts, tous sur le chemin qu'il est censé couvrir.

### D1 — `{ success: false }` est traité comme un succès (perte de message)
`meeshySocketIOService.sendMessage` ne **rejette jamais** : tous ses chemins
d'échec — socket absent, ACK expiré (`timedOut`), file orchestrateur pleine ou
expirée, échec de chiffrement, erreur serveur — retournent `{ success: false }`
(`services/socketio/messaging.service.ts`, `orchestrator.service.ts`). Le hook
ignore la valeur retournée et appelle `store.removeFailedMessage(msg.id)`
inconditionnellement dans le `try`. Conséquences :
- au **1er essai raté**, l'entrée est supprimée de la file → message
  définitivement perdu, sans trace UI (la file pilote l'affichage « échec ») ;
- `MAX_RETRY_COUNT = 3` est décoratif : il n'y a jamais de 2e essai ;
- le `catch` (seul endroit qui conserve l'entrée et pose `Max retries exceeded`)
  est **du code mort**.
Le chemin de renvoi MANUEL lit correctement `result?.success ?? false`
(`ConversationLayout.handleRetryFailedMessage`) — c'est un trou de parité, pas
un arbitrage de design.

### D2 — Le flush ne se déclenche jamais sur reconnexion socket
L'effet ne dépend que de `isOnline` (`navigator.onLine`), alors que la garde
réelle est `getConnectionDiagnostics().isConnected`, lue **impérativement** donc
non réactive. Au retour du réseau, l'événement `online` précède de plusieurs
secondes le handshake Socket.IO → early return, et plus rien ne relance l'effet.
Même trou au boot : `isOnline` vaut déjà `true` au montage, le socket n'est pas
encore connecté → la file persistée en localStorage n'est **jamais** rejouée de
toute la session. `useConnectionStatus().isReady` (`isOnline && isSocketConnected`)
est déjà la source unique de vérité déclarée pour cet état.

### D3 — Boucles de renvoi concurrentes
Le cleanup remet `isRetrying.current = false` alors que `retrySequential` peut
être en vol (le `setTimeout` a déjà firé — le `clearTimeout` n'annule rien). Un
re-run de l'effet repasse alors la garde et démarre une 2e boucle sur les mêmes
messages : double incrément de `retryCount`, doubles envois. Le fix D2 multiplie
les re-runs, donc rend D3 probable.

### D4 (racine) — La suite de tests validait un contrat imaginaire
`mockSendMessage.mockRejectedValue(...)` simulait l'échec par une **rejection**,
que le vrai service n'émet sur aucun chemin ; le succès était mocké
`mockResolvedValue(undefined)`, sans `success`. Les tests d'échec passaient donc
sur du code mort. Récidive de la leçon 2026-08-03 #2 (un test qui valide une
coïncidence, pas le contrat).

## Plan
- [x] T1 — RED : tests réécrits sur le VRAI contrat `MessageAckResponse`
- [x] T2 — D1 : livraison lue sur `ack.success`, rejection = échec (pas d'abandon de file)
- [x] T3 — D2 : déclencheur `useConnectionStatus().isReady`, garde impérative supprimée
- [x] T4 — D3 : jeton de possession libéré par la boucle, ref de disponibilité, ré-armement
- [x] T5 — vérification : 505/505 suites web, 11 646 tests ; tsc propre sur les fichiers touchés
- [x] T6 — CHANGELOG

## Revue
Les trois défauts partagent une racine unique (D4) : la suite de tests validait un
contrat imaginaire. `mockRejectedValue` simulait l'échec par une rejection que le
service n'émet nulle part, et le succès était mocké `resolvedValue(undefined)`,
sans `success` — si bien que les deux tests d'échec passaient **sur du code mort**
tandis que le seul comportement réel (`{ success: false }`) n'était couvert par
aucun test. Récidive de la leçon 2026-08-03 #2.

Vérification par mutation, chaque correctif retiré isolément (leçon 2026-07-31 #5
— un test de régression non vu rouge est décoratif) :
- D1 remis (`removeFailedMessage` inconditionnel) → 4 rouges
- D2 remis (déclencheur `isOnline` seul) → 2 rouges
- D3 remis (cleanup libère le jeton) → 1 rouge

Le premier jet du correctif D3 était **incomplet** et l'a montré : le cleanup
libérait encore le jeton, si bien qu'un run neuf démarrait sur un instantané où le
message envoyé n'avait pas encore été retiré → doublon. Trouvé par le test, pas à
la relecture. La possession appartient désormais à la boucle seule ; comme un run
interrompu détient l'unique référence à son reliquat, il ré-arme l'effet en
sortant (un run drainé ne ré-arme jamais, donc pas de boucle infinie).

Non traité (hors périmètre vérifiable sous Linux) : le miroir iOS de cette file,
`OfflineQueue`, n'a pas été audité — pas de Xcode dans cet environnement.

# Suivi de lecture exact web — l'observateur ne voyait aucune bulle montée après coup (2026-08-07)

## Demande (routine amélioration continue temps réel)
Audit continu de la pile de messagerie temps réel (PHASE 1-3 : synchronisation,
livraison, accusés). Périmètre retenu ce cycle : le chemin des accusés de lecture
côté web (`useSeenMessages` → `messagesService.markAsRead` → gateway).

## Constats (Phase 1 — audit du chemin de lecture exacte)

### D1 (racine) — `MutationObserver` rapporte la RACINE de la mutation, pas la bulle
`useSeenMessages` observe au montage via `container.querySelectorAll('[id^="message-"]')`
(qui descend dans le sous-arbre), puis délègue tout le reste — virtualisation,
messages temps réel — à un `MutationObserver` dont `attach`/`detach` ne testaient
que le **nœud rapporté lui-même**. Or `messages-display.tsx` enveloppe chaque
`BubbleMessage` dans un `<div key={message.id}>` **sans `id`** (branche virtualisée
comme branche simple) : le nœud inséré est ce wrapper, la bulle porteuse de
`id="message-<id>"` n'est qu'un descendant. La condition ne matchait donc jamais
en production.

### D2 (conséquence 1) — aucun accusé pour les messages arrivés après le montage
Seul le lot initial était observé. Un `message:new`, un replay de la
delivery-queue au reconnect ou une rangée virtualisée entrant à l'écran n'était
jamais rapporté : ✓✓ bleu bloqué côté expéditeur, badge non-lus figé côté lecteur.
À froid — messages rendus APRÈS le premier effet, dépendances toutes stables —
**aucune** bulle n'était observée de toute la session.

### D3 (conséquence 2, opposée) — des messages jamais vus déclarés lus
Une bulle démontée ne recevait jamais son `disappeared` : elle restait « visible »
pour `SeenMessageAccumulator` et franchissait le seuil de présence **hors écran**.
Le hook réintroduisait ainsi côté client le défaut par fenêtre temporelle que le
suivi exact corrige côté serveur.

### D4 (pourquoi le défaut a survécu) — les tests encodaient une forme DOM irréelle
`use-seen-messages.test.tsx` insérait les bulles en **nœud direct**
(`addedNodes: [bubble]`), forme que la production ne produit jamais. Le test
« observes a bubble mounted later by the virtualizer » passait donc sur un
scénario qui n'existe pas. Récidive de la leçon 2026-08-03 #2 (un test qui valide
une coïncidence, pas le contrat).

## Plan
- [x] T1 — RED : 4 tests sur la VRAIE forme DOM (bulle dans son wrapper de rangée)
- [x] T2 — D1 : `forEachBubble(node, visit)` applique le traitement au nœud ET à ses descendants
- [x] T3 — vérification : `__tests__/hooks` 106 suites / 2105 tests ; suite web complète ; tsc propre sur les fichiers touchés
- [x] T4 — CHANGELOG

## Revue
Un seul défaut racine (D1), deux symptômes opposés (D2 lecture jamais signalée,
D3 lecture inventée) — c'est la signature d'un observateur branché au mauvais
niveau du DOM, pas de deux bugs indépendants. Le correctif tient en une fonction
pure (`forEachBubble`) réutilisée par les deux callbacks, plutôt qu'en un `ref`
par bulle qui aurait touché `BubbleMessageNormalView` (dont le `ref` sert déjà au
scroll-to-message).

Vérification par mutation (leçon 2026-07-31 #5 — un test de régression non vu
rouge est décoratif) : les 4 tests ajoutés ont été vus ROUGES avant le correctif,
dont le cas comportemental D3 (`markAsRead` appelé avec l'id d'un message sorti du
DOM avant le seuil).

Non traité (hors périmètre vérifiable sous Linux) : le miroir iOS
(`SeenMessageAccumulator.swift`) n'est pas concerné — SwiftUI signale
l'apparition/disparition par `onAppear`/`onDisappear`, sans observateur DOM.

# Débannissement — la transition inverse du ban n'était appliquée qu'à moitié (2026-08-07)

## Demande (routine amélioration continue temps réel)
Audit continu de la pile de messagerie temps réel (PHASE 1-4 : synchronisation,
livraison, offline). Périmètre retenu ce cycle : les transitions d'appartenance à
une conversation (join / leave / kick / ban / unban) et leur effet sur les rooms
Socket.IO — le seul canal par lequel `message:new` atteint un destinataire.

## Constats (Phase 1 — audit des 4 transitions d'appartenance)

### D1 (racine) — l'unban est le seul site à ne pas restaurer l'appartenance à la room
Sur les 4 transitions, 3 sont symétriques et complètes : `leave.ts`, la suppression
de participant (`participants.ts`) et `ban.ts` évincent tous explicitement les
sockets de la cible de `conversation:<id>`. À l'inverse, les 8 sites d'octroi
d'appartenance appellent tous `MeeshySocketIOManager.joinUserToConversationRoom`.
L'unban (`ban.ts`, route `/unban`) n'appelait NI l'un NI l'autre : il remettait la
ligne `Participant` à `isActive: true` et diffusait, sans jamais remettre les
sockets dans la room. Divergence d'un site face à N frères identiques (leçon 82 #2).

### D2 (conséquence 1) — messages PERDUS, pas différés
`connectedUsers` rapporte l'utilisateur en ligne, donc les deux chemins d'envoi
(`MessageHandler.broadcastNewMessage`, `MeeshySocketIOManager._broadcastNewMessage`)
le sautent à l'enqueue de la file de livraison hors ligne. Ni émission live (plus
dans la room) ni replay au reconnect (jamais mis en file) : tout ce qui transite
par la room entre l'unban et la reconnexion suivante est perdu. C'est exactement le
risque que `AuthHandler._joinUserConversations` documente pour un join échoué.

### D3 (conséquence 2) — le débanni n'apprend pas son propre débannissement
`conversation:participant-unbanned` n'est diffusé qu'à la room — celle dont le ban
l'avait évincé. Le ban, lui, émet AVANT d'évincer : le banni reçoit bien le sien.
L'ordre est donc porteur du contrat, dans les deux sens.

### D4 (pourquoi le défaut a survécu) — le mock socket n'exprimait aucun ordre
Le test « ban — success with socket events » n'assertait que `statusCode === 200`
avec un mock `mockReturnThis()` incapable de distinguer une émission d'une
éviction, et le test « unban — success » n'installait même pas de socket. Récidive
de la leçon 2026-08-03 #2 (un test qui valide une coïncidence, pas le contrat).

### D5 (miroir web) — `memberCount` dérive à chaque cycle ban/unban
`use-socket-cache-sync.ts` décrémente sur `participant-banned` sans jamais
ré-incrémenter sur `participant-unbanned`. Avec `staleTime: Infinity`, l'écart
persiste. iOS applique déjà `memberCount += 1` : c'est le web qui divergeait.

## Plan
- [x] T1 — RED : mock socket enregistrant l'ORDRE (join / emit / leave), 3 tests unban + 1 test ban symétrique
- [x] T2 — D1/D2/D3 : `joinUserToConversationRoom` awaité AVANT la diffusion, échec journalisé non fatal
- [x] T3 — RED : aller-retour ban→unban sur `memberCount` (web)
- [x] T4 — D5 : `+1` symétrique, même idiome que `handleConversationJoined`
- [x] T5 — vérification : suites gateway + web complètes ; tsc propre sur les fichiers touchés
- [x] T6 — CHANGELOG

## Revue
Une seule racine (D1 : une transition inverse appliquée à moitié), trois symptômes
dont deux invisibles à la relecture du diff — la perte de messages (D2) n'apparaît
qu'en croisant la route d'unban avec la garde d'enqueue de la file de livraison,
deux fichiers qui ne se citent pas. Le correctif tient en un appel au SSOT déjà
utilisé par les 8 autres sites d'octroi ; ce qui demandait de la précision, c'est
l'ORDRE : awaiter le join AVANT la diffusion est ce qui rend D3 caduc sans ajouter
la moindre émission dédiée.

Vérification par mutation (leçon 2026-07-31 #5 — un test de régression non vu rouge
est décoratif) : les 2 tests unban structurants ont été vus ROUGES avant le
correctif (`Number of calls: 0`, puis ordre `[emit]` au lieu de `[join, emit]`) ;
le test web a été vu ROUGE (`Received: 2` au lieu de `3`). Le test « diffusion
préservée quand le re-join échoue » passait avant le correctif (aucun join tenté) —
il ne prouve rien seul, il verrouille le chemin `catch` ajouté (log observé).

Non traité (hors périmètre vérifiable sous Linux) : le miroir iOS n'a pas de dette
ici — `ConversationListViewModel` applique déjà l'incrément symétrique, et
l'appartenance aux rooms est gérée côté serveur. Non retenu : invalider les caches
participants à l'unban (`invalidateParticipantLookup`, `invalidateParticipantCache`)
— le ban le fait, mais aucun chemin d'envoi ne peut semer d'entrée périmée pendant
un ban pour un utilisateur enregistré (les deux sites filtrent `isActive: true`
en amont), donc l'ajouter aurait été du culte du cargo sans test capable de virer
au rouge.

# La garantie de rejeu hors ligne des éditions/suppressions s'arrêtait à la frontière REST (2026-08-07 (3))

## Demande (routine amélioration continue temps réel)
Audit continu de la pile temps réel (PHASES 1–4). Périmètre retenu ce cycle :
la parité de transport des mutations de message (édition / suppression) et leur
rejeu aux participants HORS LIGNE.

## Constats (Phase 1 — audit des 6 sites de mutation de message)

### D1 (racine) — 5 des 6 sites de mutation n'alimentent jamais la file de livraison
`MessageHandler.handleMessageEdit` / `handleMessageDelete` (transport socket)
appellent `_enqueueOfflineEventForParticipants` — le helper dont le commentaire
dit explicitement : « Without this, an edit or delete made while a recipient is
offline is lost for them ». Les CINQ routes REST qui muteront le même message
(`routes/messages.ts` PUT + DELETE `/messages/:messageId`,
`routes/conversations/messages-advanced.ts` PUT `/conversations/:id/messages/:messageId`,
DELETE idem, PATCH `/messages/:messageId`) diffusent bien `message:edited` /
`message:deleted` à la room ET rafraîchissent l'aperçu de liste, mais
n'enfilent RIEN. Un participant hors ligne à cet instant ne l'apprend JAMAIS.

### D2 (portée réelle) — c'est le chemin PRIMAIRE d'iOS
`MessageService.swift` édite via `PUT /messages/:messageId` et supprime via
`DELETE /conversations/:id/messages/:messageId` : les deux sont REST. Toute
édition/suppression faite depuis l'app iOS est donc perdue pour les pairs hors
ligne, alors que la même action faite en socket depuis le web converge. Deux
chemins pour la même intention qui divergent en silence (leçon 2026-08-07 #4).

### D3 (empreinte de l'oubli) — l'API REST-side existait déjà, sans appelant
`MeeshySocketIOManager.enqueueOfflineMessageMutation` est le point d'entrée
prévu pour les routes REST (utilisé par pin/unpin) et son union `eventType`
accepte déjà `'edited'` — un appelant prévu, jamais écrit. `'deleted'` manque
de l'union : la signature elle-même porte la trace de l'omission.

### D4 (pourquoi ça a survécu) — la duplication cachait l'asymétrie
Les 5 blocs REST dupliquent chacun « emit + fanout aperçu » ; aucun ne référence
les autres. Le commentaire de `emitConversationPreviewUpdate` affirme couvrir
« les trois transports (WS + les deux routes REST) » : il y en a cinq côté REST.

## Plan
- [x] T1 — RED : tests de rejeu hors ligne sur les 5 sites REST
- [x] T2 — D1/D3 : helper unique `broadcastMessageMutation` (emit + aperçu + enfilage), `'deleted'` ajouté à l'union
- [x] T3 — D4 : les 5 sites REST passent par le helper (déduplication)
- [x] T4 — vérification : suite gateway complète (588/588, 15403 tests) + tsc propre
- [x] T5 — CHANGELOG

## Revue
Une seule racine (D1 : une garantie implémentée sur un seul des deux transports),
mais le symptôme n'est visible qu'en croisant TROIS fichiers qui ne se citent
pas : le commentaire de `_enqueueOfflineEventForParticipants` (qui énonce la
garantie), les routes REST (qui ne l'appliquent pas) et `MessageService.swift`
(qui prouve que c'est le chemin d'iOS). Aucune relecture d'un diff isolé
n'aurait pu le voir.

Le correctif ne consiste PAS à recopier une troisième ligne dans cinq blocs :
la duplication est ce qui a rendu l'asymétrie invisible (cinq blocs
« emit + aperçu » identiques, aucun ne référençant les autres, et le commentaire
de `emitConversationPreviewUpdate` affirmant couvrir « les trois transports »
alors qu'il y en a cinq côté REST). `broadcastMessageMutation` nomme les TROIS
audiences d'une mutation (room, écrans de liste, hors ligne) en un seul endroit ;
un sixième site ne peut plus en oublier une.

Vérification par mutation (leçon 2026-07-31 #5 — un test de régression non vu
rouge est décoratif) : les 5 tests de route ont été vus ROUGES avant le
correctif, tous avec `Number of calls: 0`. Le passage par le helper a par
ailleurs fait virer au rouge un test EXISTANT (`socketIOHandler` null à
l'enregistrement) : `getManager()` était appelé hors du try/catch qu'il
remplaçait — corrigé par `socketIOHandler?.getManager()`, la nullabilité étant
réelle et déjà couverte. Le nouveau module est à 100 % (stmts/branches/funcs/lines).

Non retenu : faire passer les routes pin/unpin par le même helper. Elles
enfilent déjà correctement, ne diffusent PAS d'aperçu de liste (un épinglage ne
change pas le dernier message) et leur `eventType` n'est pas dans le couple
edit/delete — les y forcer aurait été une uniformisation de façade qui change
leur comportement observable sans test capable de le justifier.

# Les trois écrivains de préférences hors `conversation-preferences.ts` ne synchronisaient rien (2026-08-08)

## Demande
Routine messaging autonome — cycle d'audit du cœur temps-réel. Env Linux, pas
de Xcode : périmètre TS (gateway / shared / web).

## Constats

### D1 (racine) — un contrat à deux moitiés, appliqué par 2 écrivains sur 5
`UserConversationPreferences` est une ligne **par utilisateur**. Toute écriture
doit incrémenter `version` (schema : « Monotonic version […] clients drop
incoming payloads whose `version` is <= their local snapshot ») **et** diffuser
l'instantané sur `user:<id>`. Les deux ne valent que conjointes : une diffusion
non versionnée est jetée par tous, un incrément non diffusé ne change rien.

Cinq écrivains existent ; seuls `PUT` et `DELETE /user-preferences/conversations/:id`
honoraient le contrat. `routes/user-deletions.ts` en porte trois qui
n'honoraient **ni l'une ni l'autre** : `delete-for-me`, `restore-for-me`,
`clear-history` — `upsert`/`update` bruts, aucun `version`, aucun `broadcastToUser`.

### D2 (portée réelle) — les deux clients étaient déjà câblés, seul le serveur se taisait
`ConversationPreferencesPayload` déclare `deletedForUserAt` et `clearHistoryBefore` ;
`ConversationStoreSocketBridge.mapPreferences` (iOS) les mappe sur `userState` et
`ConversationUserState.isVisible` en dépend ; le web écoute `USER_PREFERENCES_UPDATED`
(`preferences-sync.service.ts`). Une conversation supprimée sur l'iPhone restait
donc dans la liste de l'iPad, un historique vidé restait affiché ailleurs.

### D3 (empreinte de l'oubli) — le commentaire de type nomme 2 écrivains sur 5
`UserPreferencesConversationUpdatedEventData` est documenté « émis par
`PUT/DELETE /user-preferences/conversations/:id` ». L'affirmation est vraie et
incomplète — même signal que « les trois transports » pour cinq sites REST
(leçon 2026-08-07 (3) #2).

### D4 (pourquoi ça ne se rattrape pas) — le ricochet n'arrive jamais
Une autre préférence changée sur la même conversation (épingler, sourdine)
transporte l'état par ricochet, le payload étant un instantané complet. Mais on
n'épingle pas une conversation qu'on vient de supprimer : pour le cas nominal,
la divergence est permanente, pas différée.

## Plan
- [x] T1 — RED : 7 tests de diffusion multi-appareils sur les 3 routes (5 rouges)
- [x] T2 — D1/D3 : écrivain unique `writeConversationPreferences` portant persister + incrémenter + diffuser ; `version` retiré du type d'écriture
- [x] T3 — les 4 sites de mise à jour y passent (déduplication de `toPreferencesPayload`)
- [x] T4 — vérification par mutation (retrait du seul incrément → 2 rouges) + suite gateway complète + tsc propre
- [x] T5 — changeset + CHANGELOG + lessons

## Revue
Une seule racine (un contrat à deux moitiés appliqué par une minorité de ses
écrivains), invisible dans tout diff isolé : il faut croiser le schema Prisma
(qui énonce la monotonie), le type d'événement partagé (qui déclare les deux
champs), le bridge socket iOS (qui prouve que le client les attend) et
`user-deletions.ts` (qui les écrit sans rien émettre).

Le correctif n'est pas de recopier « incrémente + diffuse » dans trois blocs de
plus : c'est ce fractionnement qui a permis à trois écrivains de n'en appliquer
aucune moitié sans que rien ne le signale. `writeConversationPreferences` nomme
les trois obligations en un seul endroit, et exclut `version` de son type
d'entrée — le compteur appartient au module, pas aux appelants.

Vérification par mutation (leçon 2026-07-31 #5) : les 5 tests de diffusion ont
été vus ROUGES avant le correctif, tous sur « aucune émission ». Le retrait du
seul `version: { increment: 1 }` fait retomber 2 tests — les deux moitiés sont
couvertes indépendamment. Le passage de `restore-for-me` de `update` à l'`upsert`
du helper a fait virer au rouge un test EXISTANT (« 500 on database error during
update ») dont le levier de mock désignait `update` : le levier a été recentré
sur le chemin réellement emprunté et le knob devenu mort supprimé.

Non retenu : faire passer le reset (`DELETE`) par le même helper. Il diffuse
`reset: true` / `preferences: null` et restaure les colonnes aux défauts — une
sémantique différente que le helper aurait dû accueillir par un drapeau, au
prix d'une fonction qui fait deux choses. Il honore déjà les deux moitiés du
contrat, ce qui est l'invariant qui importe.

Hors périmètre, constaté : `ConversationStore.dispatchPreferencesUpdate` (iOS)
traite `.setClearHistoryBefore` comme un succès local sans appeler la route
(« until the server endpoint is wired ») alors que `POST /clear-history` existe
depuis longtemps — dette iOS, non vérifiable sans Xcode dans cet environnement.
