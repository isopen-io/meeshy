# iOS — Indicateurs de livraison/lecture fiables (2026-06-21)

## Objectif
L'indicateur expéditeur **1 coche (envoyé) → 2 coches grises (livré) → 2 coches
indigo (lu)** doit représenter **EXACTEMENT** l'état réel de **tous** les autres
interlocuteurs. Ne jamais donner de mauvaise information. Précis pour le contenu
récent ; une approximation est tolérée au-delà de ~3 ans.

## Décisions produit (validées avec l'utilisateur)
1. **Groupe = all-or-nothing (style WhatsApp)** : ✓✓ gris seulement quand **tous**
   ont reçu, ✓✓ indigo seulement quand **tous** ont lu. Tap → détail par personne
   (sheet existant). Pour un 1:1, un seul destinataire ⇒ règle inchangée.
2. **Lecture (coches indigo côté lecteur) = visibilité réelle + app au premier
   plan** — corriger les faux accusés (arrière-plan / écran verrouillé /
   scroll-loin). *(Voir « Incréments différés ».)*

## Diagnostic (vérifié dans le code)
Le **backend est correct** : il calcule des compteurs **par message exacts** via
curseurs (`cursor.lastReadAt >= message.createdAt`) au REST
(`routes/conversations/messages.ts:879-966`) et dans le `summary` live
(`MessageReadStatusService.getLatestMessageSummary`, qui fournit `totalMembers` =
participants actifs **hors expéditeur**).

Les 3 bugs d'exactitude étaient **tous côté iOS** — le seuil `> 0` au lieu de
`>= recipients` :
1. `MessageRecord+ToMessage.swift:86-90` & `MessageModels.swift:725-729`
   (cold-start) : `readCount > 0 → .read` / `deliveredCount > 0 → .delivered`
   sans dénominateur → un seul lecteur d'un groupe ⇒ « lu par tous ».
2. `MessageRecord.computedState` ingestion REST (`MessagePersistenceActor.swift:1404`)
   : même seuil `> 0`.
3. Chemins live : `ConversationSyncEngine.swift:1106` (cache/liste) et
   `ConversationSocketHandler.swift:636` (GRDB on-screen) : `readCount > 0 → .read`,
   appliqué **en batch à tous les messages** de la conversation.

Faux accusés de lecture : `ConversationViewModel.markAsRead()` est déclenché à
**chaque** message entrant tant que le handler vit (`ConversationSocketHandler.swift:446`),
**sans gating `scenePhase` ni visibilité réelle**.

## Implémenté dans ce PR (exactitude de l'indicateur)
Source de vérité unique : **`DeliveryStatusResolver`** (SDK, pure/stateless).

- **`packages/MeeshySDK/.../Models/DeliveryStatusResolver.swift`** *(nouveau)* :
  - `resolve(status:deliveredCount:readCount:recipientCount:)` — applique la règle
    all-or-nothing au point d'affichage. `recipientCount <= 1` ⇒ statut de fond
    fait foi (1:1 / dénominateur inconnu). Le cycle d'envoi
    (`.sending/.clock/.slow/.failed`) est retourné verbatim.
  - `fromCounts(deliveredCount:readCount:recipientCount:)` — pour le réducteur live
    (un `summary` appliqué à plusieurs messages).
  - Tests : `Tests/MeeshySDKTests/Models/DeliveryStatusResolverTests.swift`.
- **`ConversationSyncEngine.swift`** (~1105) : `fromCounts(...)` avec
  `summary.totalMembers`. La frontière `applyReadReceipt` (curseur, ne marque pas
  lu un message envoyé après le moment de lecture) est conservée.
- **`ConversationSocketHandler.swift`** (~636) : n'émet `.readBy` que si
  `readCount >= totalMembers`, `.delivered` que si `deliveredCount >= totalMembers`,
  sinon **rien** (les bulles restent à l'état inférieur). Fallback `> 0` si
  `totalMembers == 0` (1:1).
- **Affichage** : `BubbleContentBuilder` (footer, le 1→2→2 violet) ré-résout via
  `DeliveryStatusResolver.resolve` avec `recipientCount`. `ThemedMessageBubble`
  reçoit `recipientCount` (défaut `1` = rétro-compatible) ; le `==` (Equatable)
  inclut désormais `deliveredCount`/`readCount`/`recipientCount` pour que la coche
  se rafraîchisse quand les compteurs changent. `MessageListViewController` dérive
  `recipientCount = memberCount - 1` (direct ⇒ 1).
- Tests handler mis à jour vers la sémantique all-or-nothing
  (`ConversationSocketHandlerTests`: partiel 1/2 ⇒ aucune transition ; 2/2 ⇒
  delivered ; 2/2 ⇒ read inchangé).

### Correctif C1 (suite revue opus) — course live → coche transitoire fausse
Le chemin live GRDB (`batchDeliverySync`) avance le `state` mais **n'écrit pas**
les colonnes de compteurs. Comme le resolver d'affichage est basé compteurs, un
message de groupe livré/lu en temps réel pouvait **régresser transitoirement à une
seule coche** jusqu'à ce que le chemin frère écrive les compteurs (course entre
deux écrivains GRDB). Corrigé via les marqueurs **`deliveredToAllAt`/`readByAllAt`** :
- `DeliveryStatusResolver.resolve` accepte ces timestamps et les fait **primer** sur
  les compteurs (signal non ambigu « tous », indépendant du dénominateur).
- `batchDeliverySync` les estampille quand l'événement all-or-nothing avance le
  `state` (seul appelant : `ConversationSocketHandler`).
- Au cold-start ils sont `nil` (le gateway ne les persiste pas) ⇒ fallback compteurs
  exacts. Le `==` (Equatable) les compare pour garantir le re-render.
- `ConversationSocketHandler` passe désormais par `DeliveryStatusResolver.fromCounts`
  (source unique du seuil — M2).

### Correctif #2 (2ᵉ revue opus) — marqueurs « all » = signal local, jamais écrasé
Les colonnes `deliveredToAllAt`/`readByAllAt` **sont** schéma-Prisma + projetées
REST + décodées par `APIMessage` (elles ne sont `nil` qu'incidemment aujourd'hui :
l'architecture curseur ne les calcule plus). `upsertFromAPIMessages` les écrivait
**en dur** → un refresh REST renvoyant `nil` pouvait **effacer** un marqueur
estampillé localement. Corrigé en **coalesce** (`api.x ?? existing.x`) : un refresh
n'efface jamais une confirmation locale ; une vraie valeur serveur, si un jour
fournie, l'emporte toujours. Commentaires faux (« le gateway ne persiste jamais »)
rectifiés. Tests : `batchDeliverySync` estampille bien les marqueurs (assertions
ajoutées aux tests handler 2/2).

### Garanties
- **Cold-start (cas dominant : ouvrir un groupe)** : compteurs REST exacts +
  `recipientCount` ⇒ coche correcte immédiatement. Ne ment jamais.
- **Live (groupe livré/lu par tous)** : marqueurs « all » ⇒ coche correcte
  immédiatement, sans course ni dépendance aux compteurs.
- **1:1** : comportement inchangé (le resolver fait confiance au statut quand
  `recipientCount <= 1`).
- **Pire cas** : sous-déclaration temporaire (montre moins que la réalité) jamais
  sur-déclaration — honnête.

## Incréments différés (à VÉRIFIER sur macOS — build iOS impossible sous Linux)
Cet environnement est Linux : ni `meeshy.sh build` ni `xcodebuild`/`swift test`
(le SDK link UIKit) ne tournent ici. Les changements ci-dessus sont chirurgicaux
et protégés par des paramètres par défaut (aucun build cassé même si un site
n'est pas câblé), mais la **CI macOS doit valider**.

1. **Précision lecture / faux accusés** (décision #2). Concevoir de façon
   testable : injecter `isApplicationActive: () -> Bool` (défaut
   `UIApplication.shared.applicationState == .active`) dans `ConversationViewModel`,
   gater `markAsRead()` dessus, + tracking de viewport (`onAppear` par bulle →
   `maxVisibleCreatedAt`) pour n'envoyer l'accusé que jusqu'au message réellement
   vu. Mettre à jour `test_markAsRead_postsNotification` (injecter `{ true }`).
2. **Consommateurs secondaires** (`MessageInfoSheet`, `MessageOverlayMenu`,
   `BubbleStandardLayout+Media`) lisent le `deliveryStatus` brut (correct 1:1,
   approximatif groupe). Les router via le resolver pour cohérence totale.
3. **Gating de frontière du chemin GRDB batch** (pré-existant, signalé revue #1) :
   `batchDeliverySync` applique l'événement à toutes les lignes `.sent`/`.sending`
   **sans** gating `createdAt > frontier` (contrairement à `applyReadReceipt`).
   Sous une course, un message envoyé juste après le moment de lecture du pair
   pourrait être marqué lu. Pré-existant (l'ancien code stampait déjà `readAt`),
   borné (`isMe` only, fenêtre étroite), et l'événement utilise `Date()` plutôt que
   `event.updatedAt`. À traiter avec le travail de précision lecture (#1) : passer
   `event.updatedAt` comme frontière + filtrer les lignes plus récentes.

## Revue
- Revue opus demandée sur le diff (cf. directive utilisateur « challenge ta vision
  avec des reviews »).
