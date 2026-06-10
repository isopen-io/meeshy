# Conversation perf + fluidité — plan (branche _pr405)

Cause racine (3 investigations convergentes) : boucle SwiftUI create/destroy auto-entretenue
à l'ouverture d'une conversation → centaines de `POST /notifications/.../read` + `GET unread-count`
→ 429 en cascade → réseau saturé → app lente partout. + thundering herd au démarrage. + vue bulles
qui reconstruit tout l'arbre SwiftUI à chaque reconfigure (`.equatable()` jamais câblé).

Décisions user : **simplification forte** des bulles + **portée complète** (tempête + vue + démarrage).

## TIER 1 — Tuer la tempête à l'ouverture (correctness + perf) ★ priorité 1
- [x] 1.1 Gate idempotent dans `NotificationToastManager.onConversationOpened` (early-return si déjà active) — casse la boucle à la source
- [x] 1.2 Coalescer/limiter `refreshUnreadCount` (1 GET au lieu de ~11 au démarrage)
- [x] 1.3 Garder le fix `[weak self]`/`didActivate` existant de `_pr405` (conservé)

## TIER 3 — Vue liste messages : simplifiée + ULTRA fluide ★ priorité 2
- [~] 3.1 ABANDONNÉ — `.equatable()` sur `ThemedMessageBubble` = footgun @State documenté (mémoire, prouvé sur cette vue) : casse le tap drapeau/sheets. ET n'aide pas le scroll-into-view. Levier réel = passes offscreen ci-dessous.
- [x] 3.2 Retirer l'ombre portée par bulle (`BubbleStandardLayout` shadow)
- [x] 3.3 Aplatir `BubbleBackground` (dégradés → couleur unie) — simplification forte
- [x] 3.4 Monter `BubbleReactionsOverlay` seulement si réactions (gate `hasOverflowingOverlay` réutilisé)
- [~] 3.5 ABANDONNÉ — `ConversationView` détient `@StateObject viewModel` (ObservableObject à invalidation grossière) : toute mutation `@Published` re-évalue déjà le body quoi qu'on lise. Découpler la ligne 891 = no-op ; vrai fix = split du VM (hors scope). La liste est déjà découplée (MessageStore).
- [x] 3.6 Précalcul `firstLinkURL` dans `BubbleContent` (NSDataDetector hors body, ×2 sites). `UIScreen.main.bounds` NON touché (bon marché + risque de drift hauteur cellules self-sizing)

## TIER 2 — Thundering herd au démarrage (perf) ★ priorité 3
- [x] 2.1 `loadConversations` : guard in-flight pleine fonction (coalesce les appels concurrents) — `performLoadConversations` + Task partagée
- [x] 2.2 `register-device-token` : guard in-flight avant le réseau (`inFlightTokenRegistration`)
- [x] 2.3 `prefetchRecentStories` : cache-first (skip si stories cache `.fresh`/`.stale`)

## Vérif
- [x] `./apps/ios/meeshy.sh build` vert (16s)
- [x] 3 nouveaux tests verts (firstLinkURL ×2, coalescing ×1)
- [x] 163 tests app verts (ConversationListViewModelTests + BubbleContentMatrixTests) — 0 régression
- [x] 14 tests SDK PushNotificationManagerTests verts — 0 régression
- [ ] Device-test user : ouvrir conversation = plus de storm 429, scroll fluide, bulles plates

## Review
Cause racine de la lenteur = boucle SwiftUI auto-entretenue à l'ouverture (throwaway VM/handler →
`onConversationOpened` → `@Published` → re-render parent → throwaway → …) générant des centaines de
`POST /read` + `GET unread-count` → 429 en cascade → réseau saturé. Tuée à la source par le gate
idempotent (1.1) + coalescing (1.2). Fluidité : suppression des passes offscreen par cellule
(ombre 3.2, double dégradé 3.3) + overlay réactions conditionnel (3.4) + NSDataDetector hors body (3.6).
Démarrage : coalescing loadConversations (2.1) + dédup device-token (2.2) + stories cache-first (2.3).
Abandons motivés : 3.1 (footgun @State prouvé sur cette vue), 3.5 (no-op vu l'invalidation grossière ObservableObject).

---

# Envois concurrents — supprimer le mutex `isSending` (2026-06-09)

## Contexte (diagnostic prouvé)
`ConversationViewModel.sendMessage` se sérialise via `@Published isSending` (guard l.1788, `defer`
l.1795), tenu pendant tout l'`await` du POST REST — **30 s** sur réseau lent. Pendant ce temps, tout
2ᵉ envoi tombe sur `SendFlow BLOCKED guard=isSending` et est déposé silencieusement (champ déjà vidé
par le composer → texte perdu). Trace : `apps/ios/logs/sendflow-pending-lock-2026-06-09.log`.

## Design
Remplacer le mutex global par une **dédup par identité + fenêtre debounce courte** :
- `dedupKey = f(content, replyToId, storyReplyToId, forwardedFromId, attachmentIds triés)`
- `existingTempId == nil` ET même clé < `duplicateSendDebounce` (0,6 s) → rejet (double-tap) ; sinon continue.
- check-and-set AVANT le 1ᵉʳ `await` → atomique via sérialisation @MainActor du préfixe (invariant « pas de double ligne optimiste »).
- `isSending` adossé à `inFlightSendCount` (≥1 en vol), **sans gating**. Retry (`existingTempId != nil`) contourne le debounce.

## Étapes (TDD)
- [ ] RED : réécrire `ConversationViewModelOfflineQueueTests` (distinct→2, duplicate→1, A/B/C→3)
- [ ] GREEN : implémenter dédup + compteur dans `ConversationViewModel.swift`
- [ ] `./apps/ios/meeshy.sh test` (cible offline-queue) vert
- [ ] Build + device-trace : 3 distincts rapides → 3 horloges ; double-tap → 1 + BLOCKED guard=duplicate-debounce
- [ ] Décider sort instrumentation

## Review
(à compléter)

---

# Latence envoi/réception + perf frappe/scroll (2026-06-09, session web)

## Contexte (vérifié avec preuves, fichiers:lignes)
- **Réception** : `ConversationSyncEngine.ensureMessages/handleNewMessage` et
  `NSEPendingMessageConsumer.consumeAll` écrivent UNIQUEMENT dans CacheCoordinator
  (liste) — jamais en GRDB, la source lue par ConversationView/MessageStore. D'où :
  notif reçue + préview à jour, mais message absent à l'ouverture jusqu'au refresh REST.
- **Envoi** : socket fallback 30 s hardcodé (`MessageSocketManager.sendViaSocketFallback`),
  et lignes GRDB `.sending` orphelines (task tuée/app killée) jamais réconciliées —
  `reconcileFailedFromOutbox` ne couvre que les outbox `exhausted`.
- **Frappe** : `persistDraft` à CHAQUE caractère (`ConversationView.swift:822`) =
  encode JSON + UserDefaults + `changed.send()` → re-tri de la liste de conversations.
- **Scroll** : `@EnvironmentObject router` dans la bulle (`ThemedMessageBubble.swift:119`)
  re-rend toutes les bulles à chaque publish Router ; chaque `applySnapshot` reconfigure
  TOUTES les cellules sans barrière Equatable (revert b9a39c2c).

## Plan
### Réception
- [x] SDK `ConversationSyncEngine` : hook `apiMessagePersistor` (handleNewMessage,
      ensureMessages, fetchOlderMessages) ; câblé app-side dans `DependencyContainer`
      → `messagePersistence.bufferIncomingAPIMessages`
- [x] `NSEPendingMessageConsumer` : persister aussi en GRDB
### Envoi
- [x] SDK : timeout socket fallback attachments 30 s → 10 s (le texte était déjà
      à 10 s via `sendAsync`) ; l'outbox reste le filet de sécurité
- [x] SDK `MessagePersistenceActor.reconcileOrphanedSendingRows` (`.sending`/`.queued`
      sans serverId ni outbox vivant, > 2 min → `.failed`) + appel dans `loadMessages`
### Frappe (fix 1 choisi)
- [x] Débouncer `persistDraft` (400 ms) + flush onDisappear
### Scroll (fixes 1+2 choisis)
- [x] Bulle : retirer `@EnvironmentObject router` → callback `onOpenProfile`
- [x] Lever `@State` langue → VM `bubbleLanguageSelections[messageId]` (fallback @State
      local pour call sites non câblés : overlay, onboarding, previews) ; `==` étendu
- [x] Wrapper stateless `EquatableMessageBubble` + `.equatable()` au cell-config —
      le contenu de l'EquatableView ne porte AUCUN @State : le footgun iOS 18+
      (prouvé sur cette vue, cf. TIER 3.1) ne s'applique qu'au contenu stateful
- [x] `MessageListViewController` : observer `$bubbleLanguageSelections` → reconfigure
      ciblé (+ fallback localId dans `reconfigureMessages`)

## Tests ajoutés
- `MessagePersistenceActorTests` : 4 tests `reconcileOrphanedSendingRows`
  (orphelin ancien → failed ; récent → intact ; outbox vivant → intact ;
  outbox exhausted → failed)
- `ConversationSyncEngineTests` : persistor invoqué par `ensureMessages` et
  par le relay `message:new`
- `ThemedMessageBubbleEquatableTests` : invalidation sur les inputs langue +
  délégation du wrapper `EquatableMessageBubble`

## Review
Session exécutée depuis l'environnement web (Linux, AUCUNE toolchain Swift) :
`./apps/ios/meeshy.sh build` et `meeshy.sh test` n'ont PAS pu être lancés ici —
à exécuter sur machine de dev avant merge. Relecture statique complète faite.

---

# Cascade de re-rendu continue (2026-06-09, suite — « la frappe freeze »)

## Cause racine PROUVÉE (fichiers:lignes)
`upsertFromAPIMessages` (branche update) faisait `changeVersion += 1` +
`updatedAt = api.updatedAt ?? Date()` + `update(db)` **inconditionnellement**,
et postait le refresh pour tout le batch via `defer` — même quand RIEN n'avait
changé. Or le même payload passe par cet upsert jusqu'à 3× pour la conversation
ouverte (ConversationSocketHandler + persistor SyncEngine + backfill observeSync)
et 2× par refresh REST (VM + ensureMessages). Chaîne de coût par passage no-op :
1. write GRDB de chaque ligne (bump changeVersion)
2. `messageStoreShouldRefresh` → `MessageStore.refreshFromDB`
3. garde `newRecords != messages` DÉFAIT — `MessageRecord ==` est O(1) sur
   (localId, changeVersion) précisément → publish
4. `_domainCache` (mémoïsation domain keyed sur changeVersion,
   `MessageStore.swift:483`) invalidé → re-décodage JSON attachments/réactions
5. `applySnapshot` → `reconfigureItems(TOUTES les cellules)` → cellConfig ×
   cellules visibles sur le main thread
Le tout répété pour chaque event entrant (message, écho, read-receipt,
delivery) pendant que l'utilisateur tape → frappe qui freeze.

## Fix (au niveau source)
- `upsertFromAPIMessages` : snapshot `before` pré-mutation + comparaison de
  champs explicite `upsertMutatedFieldsEqual` (PAS `MessageRecord ==`, qui est
  O(1) localId+changeVersion et aurait répondu « inchangé » à tout) ; write +
  bump + PendingIdRecord + refresh UNIQUEMENT si changement réel ; refresh
  scopé aux conversations effectivement modifiées (pattern retour-de-closure
  Swift 6, comme deleteExpiredEphemeral).
- `reconcileBatchSync` : skip quand state/content inchangés ; retourne le set
  des conversations modifiées ; worker ne poste que celles-là.
- `batchDeliverySync` : retourne `didChange` ; worker ne poste que si vrai
  (les read-receipts redondants ne déclenchent plus de cascade).

## Gain (structurel, vérifiable via les signposts existants applySnapshot/
## snapshot.apply sur device)
- Avant : N passages × (writes + refresh + re-lecture fenêtre + re-décodage
  JSON + applySnapshot full-reconfigure). Après : 1 seule cascade par
  changement réel ; échos/duplicatas/receipts redondants = ZÉRO travail UI.
- La mémoïsation `_domainCache` redevient effective (elle était invalidée par
  les bumps systématiques).

## Tests ajoutés
- `test_upsertFromAPIMessages_identicalEcho_doesNotDirtyRowNorPostRefresh`
  (inverted expectation + changeVersion/updatedAt stables)
- `test_upsertFromAPIMessages_changedContent_bumpsVersionAndPostsRefresh`

## Restes connus pour la frappe
- ~~`messageText` @State à la racine~~ → FAIT (finalisation ci-dessous).
- `typeWave` squish par frappe (assumé par l'utilisateur).

---

# Finalisation (2026-06-09, séparation SDK/App + zéro résidu)

## Option 3 — composer isolé (le fix frappe)
- [x] `ConversationComposerTextModel` (ObservableObject, app-side,
      ConversationView+Composer.swift) : porte le texte + la persistance
      différée 400 ms (l'ancien `.onChange(of: messageText)` racine ne peut
      plus exister — la racine ne se ré-évalue plus à la frappe).
- [x] `ComposerTextHost` : UNIQUE `@ObservedObject` du modèle — la frappe ne
      re-rend que le sous-arbre composer, plus les ~1500 lignes de la racine
      ni `updateUIViewController` du bridge (19 closures).
- [x] Racine : `@State var composerText = ConversationComposerTextModel()`
      (stockage stable, AUCUNE lecture dans le body → aucune dépendance) ;
      handlers (send, mention, edit, drafts) lisent/écrivent
      `composerText.text` hors body. 23 références migrées (racine,
      +Composer, +AttachmentHandlers). Flush au disappear + willResignActive.
- [x] Tests : `ConversationComposerTextModelTests` (rafale → 1 émission avec
      le dernier texte ; flush immédiat + annulation de la fenêtre ; valeur
      initiale silencieuse) — dans DraftStoreTests.swift (même domaine).

## Zéro résidu
- [x] Code mort supprimé : `TextBubbleCell`, `MediaBubbleCell`,
      `AudioBubbleCell`, `SystemMessageCell`, `DeliveryIndicatorView`
      (0 utilisateur externe chacun, vérifié) + leurs 20 entrées pbxproj.
      Les cellules vivantes (ReplyCell, TextPostCell, MediaPostCell,
      TopLevelCommentCell, LoadMoreRepliesCell) sont intactes.
- [x] `languageMessageId` (doublon de `messageId`) résorbé dans
      MessageListViewController.
- [x] Anciens helpers de débounce racine (scheduleDraftPersist,
      flushPendingDraft, draftPersistTask) supprimés — remplacés par le modèle.

## Séparation SDK / App (auditée, zéro croisement)
| Côté | Changements |
|---|---|
| **SDK** (`packages/MeeshySDK`) | `MessageSocketManager` (timeout transport), `MessagePersistenceActor` (upsert no-op-skip, réconciliation orphelins), `MessageStateMachine` (.failed→serverAck), `ConversationSyncEngine` (hook générique `apiMessagePersistor` — closure opaque, aucune connaissance produit) |
| **App** (`apps/ios`) | Câblage du hook (DependencyContainer), NSE consumer GRDB, VM (`bubbleLanguageSelections`), bulle + gate Equatable, contrôleur de liste, composer isolé, overlay profil |
Aucun type app référencé par le SDK (vérifié — seules des mentions en
commentaires pré-existantes).

## Vérification requise sur machine de dev (toolchain absente ici)
- [ ] `./apps/ios/meeshy.sh build` puis `meeshy.sh test`
- [ ] `xcodebuild test -scheme MeeshySDK-Package` (tests SDK)
- [ ] Device : frappe fluide (Instruments : la racine ne doit plus apparaître
      dans les body evaluations par frappe), signposts applySnapshot ↓

---

# Revue finale (2026-06-09, branche fix/ios-conversation-fluidity-review)

Seconde passe sur les commits non couverts par la revue multi-agents
(cascade, composer isolé, .id notification, politique brouillon).

## Bug trouvé et corrigé
- **Cycle de rétention du composer** : `onPersistNeeded` capture une copie de
  la struct ConversationView ; son wrapper `State<ConversationComposerTextModel>`
  retient (via la box de stockage SwiftUI) le modèle vivant → modèle → closure
  → copie → State box → modèle. Fuite du modèle ET du ConversationViewModel
  (retenu par le wrapper @StateObject de la copie) à chaque teardown.
  Fix : `composerText.onPersistNeeded = nil` dans onDisappear (après le flush) ;
  onAppear réinstalle au retour d'un cover/sheet.

## Vérifié sans correction nécessaire
- 29 champs de `upsertMutatedFieldsEqual` validés contre MessageRecord.
- `onFocusChange` flush : closure retenue par l'arbre de vues, pas de cycle.
- `.id(conv.id)` : type non-optionnel, `.task`/onAppear relancés, replyContext OK.
- Restore du brouillon à l'onAppear : callback installé avant, ré-écriture
  idempotente, pas de clobber (`guard text.isEmpty`).
- Tests immédiateté espace : `persistNow` synchrone dans le sink — timeout
  0.2 s valide.

Autres sources d'optimisation identifiées, NON traitées (collision routine / scope) :
1. `APIClient.swift:427` pose `Accept-Encoding: br, gzip, deflate` manuellement alors
   que le commentaire l.389-397 l'interdit explicitement (« Never add Accept-Encoding
   here ») — contradiction documentaire à arbitrer ; si URLSession ne décompresse pas
   le brotli posé manuellement, certains POST/GET peuvent échouer au decode.
2. POST send REST sous timeout global 60 s (`timeoutIntervalForRequest`) — un envoi
   texte mériterait un timeout dédié ~15 s ; lié au chantier « mutex isSending »
   en cours (section précédente de ce fichier).
3. Self-sizing `.estimated(80)` sans cache de hauteur : `cachedBubbleHeight` (GRDB)
   n'alimente que `TextBubbleCell`/`MediaBubbleCell` — code mort confirmé (auto-
   références uniquement). Câbler un height-cache sur le chemin UIHostingConfiguration
   ou supprimer les cells mortes (suppression = toucher project.pbxproj).
4. Composer non isolé : `messageText` reste un @State à la racine de ConversationView
   (~1500 l.) — chaque frappe ré-évalue l'arbre + `updateUIViewController` (19 closures
   réassignées). C'est l'option 3 (non retenue aujourd'hui).
5. `typeWave` squish par frappe (UniversalComposerBar) — assumé par l'utilisateur.
