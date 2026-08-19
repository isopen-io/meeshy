# Transfert de médias fiable + grille « Plus… » + provenance de groupe — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fiabiliser le transfert de messages (médias inclus, sans re-upload) sur iOS, le créer sur web, ouvrir « Plus… » sur la grille complète, et afficher le nom du groupe source sur les messages transférés.

**Architecture:** Le serveur sait déjà tout (envoi ordinaire + `forwardedFromId` → copie d'attachments par référence de blob). Le chantier est client : un service de transfert unique app-side iOS, un modèle de picker hybride (sélection + envoi immédiat) partagé en sémantique avec le web, et une policy pure « nom de groupe » jumelle iOS/web appliquée côté client (Local-First).

**Tech Stack:** SwiftUI + MeeshySDK (SPM), Fastify gateway (inchangé sauf besoin du diagnostic), Next.js 15 + zustand côté web.

**Spec:** `docs/superpowers/specs/2026-08-19-media-forward-reliability-and-more-menu-design.md`

## Global Constraints

- TDD strict : test RED avant toute ligne de production, par tâche.
- Commits par CHEMINS EXPLICITES (`git add <fichiers> && git commit -- <fichiers>`) — worktree partagé avec WIP concurrent ; jamais `git add -A` ; pas de backticks dans `-m` ; pas de Co-Authored-By ; messages en français `type(scope): sujet`.
- iOS : modèles/types SDK dans `packages/MeeshySDK/` UNIQUEMENT ; orchestration UX produit dans `apps/ios/` (SDK purity, test du grain).
- iOS build : `./apps/ios/meeshy.sh build` ; tests ciblés : `build-for-testing` + `test-without-building -only-testing:MeeshyTests/<Classe>` sur simu 18.2 (les CLASSES, pas les fichiers) ; suite complète `./apps/ios/meeshy.sh test` UNE fois par lot iOS, pas avant chaque commit.
- Nouvelle chaîne UI iOS = clés localisées dans les 7 langues du catalogue + gardes existantes (catalogue, clés mortes, cliquet accents) ; vues de cellule Equatable à inputs primitifs.
- Ne JAMAIS proposer un transfert qui re-uploade un média : le corps réseau d'un transfert ne porte jamais `attachmentIds` ni de fichier.
- `Conversation.type` (source) : `direct, group, public, global, community, channel, bot, broadcast` — règle badge : nom affiché sauf `direct`/`bot` ; `nil` (cache ancien) = statu quo (affiché si présent).

---

## Lot B — « Plus… » ouvre la grille complète

### Task B1 : Réécrire les gardes de source (RED) puis poser `nil` aux deux sites

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift` (réécriture du contrat ; nom de classe conservé pour éviter le churn pbxproj)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:2360-2364` (closure `onShowMore`) et `:2530-2537` (`case .more:` du menu natif)
- Modify: `docs/superpowers/specs/2026-08-11-message-more-jumps-to-views-design.md` (note d'annulation en tête)

**Interfaces:**
- Consumes: helpers existants du fichier de tests (`source(_:)`, `closureBody(after:in:)`) — conservés tels quels.
- Produces: contrat de source verrouillé : les deux sites « Plus… » posent `overlayState.moreSheetInitialItem = nil` ; `onShowMessageInfo`/`onShowReadStatus` continuent de poser `.views`.

- [ ] **Step 1 : Réécrire les 3 tests (RED).** Remplacer le corps de la classe (helpers conservés) par :

```swift
    // MARK: - Site 1 : overlay appui-long custom (`onShowMore`)

    func test_overlayOnShowMore_opensFullGrid() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onShowMore: {", in: view) else {
            XCTFail("ConversationView must define the onShowMore closure passed to MessageOverlayMenu")
            return
        }
        XCTAssertTrue(
            body.contains("moreSheetInitialItem = nil"),
            "onShowMore must open the FULL grid (initialItem = nil) — the 2026-08-11 jump-to-Vues was reverted by the 2026-08-19 spec."
        )
        XCTAssertFalse(
            body.contains(".views"),
            "onShowMore must no longer route to .views in any form."
        )
    }

    // MARK: - Site 2 : menu contextuel natif iOS 26 (`case .more:` → Button)

    func test_nativeMoreButton_opensFullGrid() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let caseRange = view.range(of: "case .more:") else {
            XCTFail("ConversationView's native menu builder must define a `case .more:` branch")
            return
        }
        let afterCase = String(view[caseRange.upperBound...])
        guard let body = closureBody(after: "Button {", in: afterCase) else {
            XCTFail("The .more case must wrap its action in a Button { } closure")
            return
        }
        XCTAssertTrue(body.contains("moreSheetInitialItem = nil"),
                      "The native .more Button must open the FULL grid (initialItem = nil).")
        XCTAssertFalse(body.contains(".views"),
                       "The native .more Button must no longer route to .views.")
    }

    // MARK: - Accès directs préservés + ancien ternaire banni

    func test_directAccessesStillJumpToViews_andTernaryIsGone() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        for marker in ["onShowMessageInfo: {", "onShowReadStatus: {"] {
            guard let body = closureBody(after: marker, in: view) else {
                XCTFail("ConversationView must keep the \(marker.dropLast(3)) direct-access closure")
                continue
            }
            XCTAssertTrue(
                body.contains("moreSheetInitialItem = .views"),
                "\(marker) must keep jumping straight to Vues — only the two « Plus… » sites revert to the grid."
            )
        }
        XCTAssertEqual(
            view.components(separatedBy: "showReadReceipts ? .views : nil").count - 1, 0,
            "The 2026-08-11 ternary must be fully removed from ConversationView — « Plus… » no longer depends on read receipts."
        )
    }
```
Mettre à jour le doc-comment d'en-tête de la classe : le contrat 2026-08-11 est INVERSÉ par la spec 2026-08-19 (chemin de la nouvelle spec), nom de classe conservé pour l'historique.

- [ ] **Step 2 : Vérifier l'échec.**
Run: `cd apps/ios && xcodebuild build-for-testing -project Meeshy.xcodeproj -scheme Meeshy -destination "generic/platform=iOS Simulator" -derivedDataPath Build` puis `xcodebuild test-without-building -project Meeshy.xcodeproj -scheme Meeshy -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests -derivedDataPath Build`
Expected: FAIL (les deux premiers tests — le code contient encore le ternaire).

- [ ] **Step 3 : Implémentation minimale.** Aux DEUX sites, remplacer :

```swift
overlayState.moreSheetInitialItem =
    UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil
```
par :
```swift
overlayState.moreSheetInitialItem = nil
```

- [ ] **Step 4 : Vérifier le vert.** Même commande test-without-building (recompiler avec build-for-testing d'abord). Expected: PASS (3/3). Lancer aussi `-only-testing:MeeshyTests/MessageActionResolverTests` (inchangé, doit rester vert).

- [ ] **Step 5 : Amender la spec 2026-08-11.** Ajouter sous le titre :

```markdown
> **ANNULÉ le 2026-08-19** — « Plus… » rouvre la grille complète (décision user).
> Les accès directs (coches ✓✓, info message) conservent le saut vers Vues.
> Voir `2026-08-19-media-forward-reliability-and-more-menu-design.md`, Volet B.
```

- [ ] **Step 6 : Commit.**

```bash
git add apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift docs/superpowers/specs/2026-08-11-message-more-jumps-to-views-design.md
git commit -m "feat(ios): Plus… rouvre la grille complète, les accès directs gardent leur saut" -- apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift apps/ios/Meeshy/Features/Main/Views/ConversationView.swift docs/superpowers/specs/2026-08-11-message-more-jumps-to-views-design.md
```

---

## Lot A — Transfert fiable (iOS)

### Task A0 : Diagnostic de l'échec du transfert média (systematic-debugging)

**Files:** aucun a priori — instrumentation temporaire possible dans `ForwardPickerSheet.swift:338-341`.

**Interfaces:**
- Produces: cause racine documentée (commit du correctif ciblé avec son test, dans le lot où il tombe).

- [ ] **Step 1 : Reproduction serveur (curl), stack locale.** Gateway local (tmux « meeshy », port 3000). Login (`POST /api/v1/auth/login`, credentials `apps/ios/fastlane/.env`), lister les conversations, trouver un message AVEC attachment (`GET /conversations/:id/messages`), puis :

```bash
curl -sS -X POST http://localhost:3000/api/v1/conversations/<CIBLE>/messages \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"forwardedFromId":"<ID_MSG_MEDIA>","forwardedFromConversationId":"<ID_CONV_SOURCE>"}'
```
Observer : status, corps, puis `GET /conversations/<CIBLE>/messages?limit=3` — le message copié a-t-il ses attachments ?

- [ ] **Step 2 : Variantes suspectes.** Rejouer avec (a) `"forwardedFromConversationId":""` (chaîne vide — l'app envoie `conversation?.id ?? ""` : Zod l'accepte mais Prisma `@db.ObjectId` peut refuser l'écriture) ; (b) un `forwardedFromId` NON-ObjectId (id local de message optimiste) ; (c) sans `forwardedFromConversationId`. Noter status/corps de chaque variante et les logs gateway.

- [ ] **Step 3 : Reproduction app.** `./apps/ios/meeshy.sh run`, transférer un message média entre deux conversations, lire `./apps/ios/meeshy.sh logs` + le catch du picker (instrumenter temporairement `Logger` si le glyphe apparaît sans trace).

- [ ] **Step 4 : Cause racine → test RED + correctif minimal + commit** (gateway → test bun ; iOS → test XCTest). Si le correctif est serveur, exécuter `cd services/gateway && bun run test:coverage` avant commit. Retirer toute instrumentation temporaire.

### Task A1 : Gate vue-unique sur l'action Transférer

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift` (MessageMenuContext + moreSections)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift:905-917` (ctx sheet), `:1490-1496` (onSwipeForward)
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift:146-171` (menuContext)
- Modify: `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift:114-117` (dialog « Ce média »)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift:322` (rangée quick-reaction)
- Test: `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift`

**Interfaces:**
- Produces: `MessageMenuContext.isViewOnce: Bool = false` ; `moreSections` omet `.forward` quand `isViewOnce` — signature inchangée par ailleurs.

- [ ] **Step 1 : Tests RED** dans `MessageActionResolverTests` (suivre le style factory du fichier) :

```swift
    func test_moreSections_viewOnce_omitsForward() {
        var ctx = MessageMenuContext(
            isMine: false, canEdit: false, canDelete: false, hasText: false,
            hasMedia: true, hasTimebasedMedia: false, isPinned: false,
            isStarred: false, isEdited: false, hasEditRevisions: false
        )
        ctx.isViewOnce = true
        guard case .actions(let items) = MessageActionResolver.moreSections(ctx).first else {
            return XCTFail("first section must be .actions")
        }
        XCTAssertFalse(items.contains(.forward),
                       "A view-once message must not offer Transférer — the server would refuse it anyway.")
        XCTAssertEqual(Array(items.prefix(2)), [.reply, .thread])
    }

    func test_moreSections_default_stillOffersForward() {
        let ctx = MessageMenuContext(
            isMine: false, canEdit: false, canDelete: false, hasText: true,
            hasMedia: false, hasTimebasedMedia: false, isPinned: false,
            isStarred: false, isEdited: false, hasEditRevisions: false
        )
        guard case .actions(let items) = MessageActionResolver.moreSections(ctx).first else {
            return XCTFail("first section must be .actions")
        }
        XCTAssertEqual(Array(items.prefix(3)), [.reply, .forward, .thread])
    }
```
NOTE : si l'init membre-à-membre du struct exige d'autres libellés, copier la construction d'un test existant du fichier (source de vérité).

- [ ] **Step 2 : RED confirmé** (`-only-testing:MeeshyTests/MessageActionResolverTests` — `isViewOnce` n'existe pas → compile error = RED de compile, acceptable pour un champ neuf).

- [ ] **Step 3 : Implémentation.** Dans `MessageMenuContext` (après `showReadReceipts`) :

```swift
    /// Vue unique : le serveur refuse son transfert (`forwardAdmission`,
    /// `view-once-not-forwardable`) — on n'offre pas une action condamnée.
    var isViewOnce: Bool = false
```
Dans `moreSections`, remplacer `var actions: [MoreItem] = [.reply, .forward, .thread]` par :

```swift
        var actions: [MoreItem] = [.reply]
        if !ctx.isViewOnce { actions.append(.forward) }
        actions.append(.thread)
```

- [ ] **Step 4 : Câbler les 4 surfaces.** (a) ctx du sheet `ConversationView:916` → ajouter `isViewOnce: msg.isViewOnce` (avant `showReadReceipts` si l'ordre des membres l'exige) ; (b) `MessageOverlayMenu.menuContext` → `isViewOnce: message.isViewOnce` ; (c) `onSwipeForward` → `guard !msg.isViewOnce else { return }` après la résolution du message ; (d) rangée quick-reaction (`ConversationView+MessageRow.swift:322`) → envelopper le `messageActionButton(icon: "arrowshape.turn.up.forward.fill", …)` d'un `if !(viewModel.messageIndex(for: messageId).map { viewModel.messages[$0].isViewOnce } ?? false)` ; (e) dialog « Ce média » (`MessageMoreSheet:114`) → `if !message.isViewOnce { Button(…Transférer…) }`.

- [ ] **Step 5 : GREEN** sur `MessageActionResolverTests` + build `./apps/ios/meeshy.sh build`.

- [ ] **Step 6 : Commit** (chemins : resolver, ConversationView, ConversationView+MessageRow, MessageOverlayMenu, MessageMoreSheet, tests) — `feat(ios): la vue unique n'offre plus un transfert que le serveur refuse`.

### Task A2 : Service de transfert unique + suppression du doublon

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift`
- Delete: `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageForwardDetailView.swift` (zéro call site vérifié)
- Modify: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift` (délègue au service)
- Test: `apps/ios/MeeshyTests/Unit/Services/MessageForwardServiceTests.swift`

**Interfaces:**
- Consumes: `APIClient.shared.post`, `OfflineQueue.shared.enqueue(OfflineQueueItem)`, `NetworkMonitor.shared.isOnline`, protocole existant utilisé par `FakeOfflineMessageQueue` (reprendre le nom exact du protocole depuis `apps/ios/MeeshyTests/Mocks/FakeOfflineMessageQueue.swift`).
- Produces:

```swift
enum ForwardOutcome: Equatable {
    case sent
    case queuedOffline
    case failed(reason: String)
}

protocol MessageForwardServiceProviding {
    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String) async -> ForwardOutcome
}
```

- [ ] **Step 1 : Tests RED** (`MessageForwardServiceTests`, factory `makeSUT` avec fakes injectés) :
  1. `test_forward_online_postsForwardedFromId_withoutAttachmentIds` — le body encodé contient `forwardedFromId`, PAS de clé `attachmentIds` (décoder le body capturé par le fake en `[String: Any]` via JSONSerialization) ;
  2. `test_forward_emptySourceConversationId_sendsNil` — `sourceConversationId: ""` → clé `forwardedFromConversationId` ABSENTE du body (garde contre le `?? ""` historique) ;
  3. `test_forward_sameTarget_reusesClientMessageId` — deux appels vers la même cible pour le même message → même `clientMessageId` (dédup gateway au retry) ; cible différente → cid différent ;
  4. `test_forward_offline_enqueuesDurably` — offline → `.queuedOffline`, item enfilé avec `forwardedFromId`/`forwardedFromConversationId` et le MÊME cid ;
  5. `test_forward_serverRefusal_surfacesReason` — le fake API throw `APIError.serverError(400, "Un message à vue unique ne peut pas être transféré")` → `.failed(reason:)` contenant ce texte.
  Le fake API : petit protocole local si `APIClient` n'en expose pas (préférer un protocole existant du repo si `MockAPIClient`-équivalent existe côté app ; sinon `protocol ForwardPosting { func post(...) }` conformé par APIClient via extension — choisir la voie la plus proche des précédents du dossier Services).

- [ ] **Step 2 : RED confirmé** (compile error sur types absents).

- [ ] **Step 3 : Implémentation** (protocole au-dessus du concret, même fichier — convention repo) :

```swift
@MainActor
final class MessageForwardService: MessageForwardServiceProviding {
    static let shared = MessageForwardService()
    private var clientMessageIds: [String: String] = [:]   // "msgId→targetId" → cid

    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String) async -> ForwardOutcome {
        let key = "\(message.id)→\(targetConversationId)"
        let cid = clientMessageIds[key] ?? ClientMessageId.generate()
        clientMessageIds[key] = cid
        let sourceId = (sourceConversationId?.isEmpty == false) ? sourceConversationId : nil
        guard network.isOnline else {
            do {
                try await queue.enqueue(OfflineQueueItem(
                    conversationId: targetConversationId,
                    content: message.content,
                    clientMessageId: cid,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceId
                ))
                return .queuedOffline
            } catch { return .failed(reason: error.localizedDescription) }
        }
        do {
            let body = SendMessageRequest(
                content: message.content.isEmpty ? nil : message.content,
                forwardedFromId: message.id,
                forwardedFromConversationId: sourceId,
                clientMessageId: cid
            )
            let _: APIResponse<SendMessageResponseData> = try await api.post(
                endpoint: "/conversations/\(targetConversationId)/messages", body: body)
            return .sent
        } catch let error as APIError {
            return .failed(reason: error.errorDescription ?? String(localized: "forward.error.generic", defaultValue: "Le transfert a échoué", bundle: .main))
        } catch {
            return .failed(reason: error.localizedDescription)
        }
    }
}
```
(init injecté `api`/`queue`/`network` avec défauts `.shared` ; adapter les noms exacts des protocoles découverts au Step 1. Ajuster selon la cause racine A0 si elle touche ce chemin.)

- [ ] **Step 4 : Rebrancher `ForwardPickerSheet.forwardTo`** sur le service (suppression du POST direct et de la branche offline locale — le service porte tout) ; supprimer `MessageForwardDetailView.swift` ; `cd apps/ios && xcodegen generate` (fichier retiré) puis `git checkout -- apps/ios/Meeshy.xcodeproj` UNIQUEMENT si le diff pbxproj dépasse le retrait du fichier (churn interdit ; les lignes de retrait/ajout légitimes se committent).

- [ ] **Step 5 : GREEN** `-only-testing:MeeshyTests/MessageForwardServiceTests` + build.

- [ ] **Step 6 : Commit** — `feat(ios): un seul chemin de transfert, dédup au retry, raison d'échec conservée`.

### Task A3 : Picker hybride multi-sélection (modèle exact user) + aperçu média + toast

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerModel.swift` (machine à états pure)
- Modify: `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`
- Test: `apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift`

**Interfaces:**
- Produces:

```swift
struct ForwardPickerModel: Equatable {
    enum TargetState: Equatable { case idle, selected, sending, sent, failed(String) }
    private(set) var states: [String: TargetState] = [:]

    func state(of id: String) -> TargetState { states[id] ?? .idle }
    var selectedIds: [String] { states.filter { $0.value == .selected }.map(\.key).sorted() }
    var hasSelection: Bool { !selectedIds.isEmpty }

    mutating func tapRow(_ id: String)          // idle→selected, selected→idle ; sent/sending → no-op
    mutating func beginSend(_ id: String)       // idle|selected|failed → sending (retire de la sélection)
    mutating func finishSend(_ id: String, outcome: ForwardOutcome)  // sending → sent | failed(reason)
    mutating func beginBatch() -> [String]      // selectedIds → tous .sending, retourne la liste (jamais un id déjà sent)
}
```

- [ ] **Step 1 : Tests RED** (`ForwardPickerModelTests`, pur, phase 1) — un test par règle user :
  1. `test_tapRow_togglesSelection` ;
  2. `test_tapRow_onSentTarget_isNoop` (« on ne peut pas sélectionner une personne pour qui on a déjà appuyé Envoyer ») ;
  3. `test_beginSend_onSelectedRow_removesItFromSelection` (« si on appuie Envoyer après l'avoir sélectionnée, elle quitte la sélection ») ;
  4. `test_beginBatch_neverContainsSentTargets` (anti-doublon par construction) ;
  5. `test_finishSend_failed_keepsReason_andAllowsRetry` (`failed` → `beginSend` re-permis) ;
  6. `test_finishSend_queuedOffline_countsAsSent` (`.queuedOffline` → `.sent` d'affichage).

- [ ] **Step 2 : RED**, **Step 3 : implémentation minimale du struct**, **Step 4 : GREEN** (`-only-testing:MeeshyTests/ForwardPickerModelTests`).

- [ ] **Step 5 : Brancher la vue.** `ForwardPickerSheet` remplace `sendingToId/sentToIds/failedToIds` par `@State private var model = ForwardPickerModel()` :
  - ligne : `.contentShape(Rectangle()).onTapGesture { model.tapRow(conv.id) }` + fond teinté accent et checkmark de sélection quand `state == .selected` ;
  - bouton par-ligne (paperplane conservé) → `send(conv)` (beginSend + service + finishSend) ; état `.failed(reason)` → glyphe retry + `Text(reason)` (caption, `MeeshyColors.error`, lineLimit 2) sous la ligne ;
  - barre basse (safeAreaInset bottom) visible quand `model.hasSelection` : bouton plein accent « Envoyer (N) » → `for id in model.beginBatch() { … }` en séquence ;
  - aperçu : remplacer « [Media] » par `attachment.kind` localisé + compteur (`"Photo"`, `"Vidéo"`, `"Audio"`, `"Fichier"`, suffixe `" · N"` si `attachments.count > 1`) — clés `forward.preview.image/video/audio/file` ×7 langues ;
  - premier `.sent` du run → `FeedbackToastManager.shared.show(String(localized: "forward.success", …), type: .success, tapAction: { Router → conversation cible })` (une seule fois par ouverture du sheet, cible = premier envoi réussi) ;
  - supprimer `.disabled(sendingToId != nil)` global (les envois par cible sont indépendants).
  Clés neuves ×7 langues : `forward.send-selected` (« Envoyer (%d) »), `forward.success`, `forward.error.generic`, `forward.preview.*`.

- [ ] **Step 6 : Vérification visuelle** `./apps/ios/meeshy.sh run` (flux réel : sélection multiple, envoi immédiat sur ligne sélectionnée, batch, échec affiché).

- [ ] **Step 7 : Commit** — `feat(ios): picker de transfert hybride multi-cibles, aperçu média et raisons d'échec`.

---

## Lot C — Provenance de groupe

### Task C1 : SDK — `ForwardReference.conversationType` + fallback identifier

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift:1582-1604`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:805-822`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MessageModelsTests.swift`

**Interfaces:**
- Produces: `ForwardReference.conversationType: String?` (nouveau, dernier paramètre d'init, défaut `nil` — appels existants intacts) ; mapping `toMessage` : `conversationType: forwardedFromConversation?.type`, `conversationName: forwardedFromConversation?.title ?? forwardedFromConversation?.identifier`.

- [ ] **Step 1 : Tests RED** dans `MessageModelsTests` (suivre le style JSONStub du fichier, cf. tests 204-224) :
  1. `test_toMessage_mapsForwardedConversationType` — APIMessage JSON avec `forwardedFromConversation: {id, title: "Équipe", type: "group"}` → `forwardedFrom?.conversationType == "group"` et `conversationName == "Équipe"` ;
  2. `test_toMessage_forwardedConversationName_fallsBackToIdentifier` — `title` absent, `identifier: "meeshy-public"` → `conversationName == "meeshy-public"` ;
  3. `test_forwardReference_decodesLegacyJSONWithoutType` — décoder un JSON `ForwardReference` SANS clé `conversationType` (cache GRDB ancien) → `nil`, pas d'erreur ;
  4. étendre le roundtrip Codable existant avec `conversationType`.

- [ ] **Step 2 : RED** — `cd apps/ios && xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5' -only-testing:MeeshySDKTests/MessageModelsTests -quiet`

- [ ] **Step 3 : Implémentation.** `ForwardReference` : ajouter `public let conversationType: String?` + paramètre d'init `conversationType: String? = nil` (EN DERNIER). `uiForwardRef` : câbler `conversationType` et le fallback `?? forwardedFromConversation?.identifier`.

- [ ] **Step 4 : GREEN** (même commande) puis suite SDK Models complète en local.

- [ ] **Step 5 : Commit** — `feat(sdk): la référence de transfert porte le type de la conversation source` (chemins : CoreModels.swift, MessageModels.swift, MessageModelsTests.swift).

### Task C2 : App — `ForwardBadgePolicy` + câblage bulle (règle jumelle)

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift:483-491`
- Test: `apps/ios/MeeshyTests/Unit/Views/ForwardBadgePolicyTests.swift`

**Interfaces:**
- Consumes: `ForwardReference` (C1).
- Produces:

```swift
/// Règle produit (spec 2026-08-19, Volet C) : le nom de la conversation source
/// s'affiche pour tout GROUPE, jamais pour un tête-à-tête.
/// RÈGLE JUMELLE : apps/web/lib/forward-badge.ts — toute évolution touche les deux.
enum ForwardBadgePolicy {
    /// Types dont le nom est masqué. `nil` (cache antérieur au type) = statu quo : affiché.
    private static let hiddenTypes: Set<String> = ["direct", "bot"]

    static func conversationName(for ref: ForwardReference?) -> String? {
        guard let ref, let name = ref.conversationName, !name.isEmpty else { return nil }
        if let type = ref.conversationType, hiddenTypes.contains(type) { return nil }
        return name
    }
}
```

- [ ] **Step 1 : Tests RED** (`ForwardBadgePolicyTests`, pur) : 8 cas de type (`group/public/global/community/channel/broadcast` → nom ; `direct/bot` → nil) + `nil` type → nom (statu quo cache) + ref nil / nom vide → nil.
- [ ] **Step 2 : RED**, **Step 3 : implémentation ci-dessus**, **Step 4 : GREEN** (`-only-testing:MeeshyTests/ForwardBadgePolicyTests`).
- [ ] **Step 5 : Câblage.** `BubbleStandardLayout` : remplacer `conversationName: message.forwardedFrom?.conversationName` par `conversationName: ForwardBadgePolicy.conversationName(for: message.forwardedFrom)`. `BubbleForwardedIndicator` INCHANGÉ (le masquage = passer nil → variante « Fwd. from {sender} » existante ; aucune clé localisée neuve).
- [ ] **Step 6 : Commit** — `feat(ios): le badge transféré nomme le groupe source, jamais un tête-à-tête`.

Note spec (amendement acté ici) : la spec C.3 « hydratation locale de la ligne optimiste » est SANS OBJET aujourd'hui — aucun chemin ne crée de ligne optimiste au transfert (A.5) ; le badge de la conversation cible est alimenté par l'enrichissement serveur (GET + broadcast), couvert par C1. Ajouter cette note dans la spec au commit C2.

---

## Lot D — Transfert web complet

État des lieux (exploration 2026-08-19) : le TRANSPORT existe déjà de bout en bout —
`MessageSendOptions.forwardedFromId/forwardedFromConversationId`
(`apps/web/services/socketio/types.ts:166-167`), émission socket `messaging.service.ts:341-342`,
fallback REST `:475-508` → `services/conversations/messages.service.ts:127-138`, optimistic
(`utils/optimistic-message.ts:24-25`, surcharge options object UNIQUEMENT), file offline
orchestrator, et `handleRetryMessage` (`ConversationLayout.tsx:680-733`) passe déjà les champs.
Il ne manque que l'UI. i18n web : système maison `useI18n(namespace)`, **4 langues (en, fr,
es, pt)**, clé badge existante `bubble.forwarded` (namespace `bubbleStream`). BUG LATENT à
corriger : `transformMessageData` (`services/conversations/transformers.service.ts:380-411`)
NE recopie NI `forwardedFromId`, NI `forwardedFromConversationId`, NI `effectFlags` — le badge
« Transféré » disparaît au rechargement REST de l'historique.

### Task D1 : Typage + transformeur — le forward survit au rechargement REST

**Files:**
- Modify: `packages/shared/types/conversation.ts:127-133` (section REPONSE & FORWARDING du type `Message`)
- Modify: `apps/web/services/conversations/transformers.service.ts:380-411` (`transformMessageData`)
- Test: `apps/web/__tests__/services/conversations/transformers.service.test.ts` (créer si absent, sinon étendre)

**Interfaces:**
- Produces (type partagé, consommé par D2) :

```ts
readonly forwardedFromConversation?: {
  readonly id: string;
  readonly title?: string | null;
  readonly identifier?: string | null;
  readonly type?: string | null;
  readonly avatar?: string | null;
};
```

- [ ] **Step 1 : Test RED.** `transformMessageData` sur un raw portant `forwardedFromId`, `forwardedFromConversationId`, `effectFlags: 4`, `forwardedFromConversation: {id, title: "Équipe", type: "group"}` → les 4 champs présents sur le résultat ; raw sans ces champs → absents/undefined (pas de `null` fabriqué).
- [ ] **Step 2 : RED** (`cd apps/web && npx jest __tests__/services/conversations/transformers.service.test.ts`).
- [ ] **Step 3 : Implémentation.** Ajouter le bloc ci-dessus au type `Message` partagé (après `:133`) ; dans `transformMessageData`, recopier `forwardedFromId`, `forwardedFromConversationId`, `effectFlags`, `forwardedFromConversation` (spread conditionnel, même style que le fichier).
- [ ] **Step 4 : GREEN** + `cd packages/shared && bun run build` (le gateway importe le type — vérifier que tsc shared passe).
- [ ] **Step 5 : Commit** — `fix(web,shared): le badge transféré survit au rechargement REST de l'historique`.

### Task D2 : Règle jumelle `forward-badge.ts` + libellé « Transféré depuis {groupe} »

**Files:**
- Create: `apps/web/lib/forward-badge.ts`
- Modify: `apps/web/components/common/bubble-message/MessageContent.tsx:18-33` (props) et `:78-87` (badge)
- Modify: `apps/web/components/conversations/focal/FocalMetaRow.tsx:125-128` + `focal/FocalRow.tsx:347-355` (site focal jumeau)
- Modify: `apps/web/locales/{en,fr,es,pt}/bubbleStream.json` (clé `bubble.forwardedFrom`)
- Test: `apps/web/__tests__/lib/forward-badge.test.ts`

**Interfaces:**
- Consumes: `Message['forwardedFromConversation']` (D1).
- Produces (RÈGLE JUMELLE de `ForwardBadgePolicy.swift` — commentaire croisé dans les DEUX fichiers) :

```ts
const HIDDEN_TYPES = new Set(['direct', 'bot']);

export function forwardBadgeConversationName(
  conv?: { title?: string | null; identifier?: string | null; type?: string | null } | null,
): string | null {
  if (!conv) return null;
  const name = conv.title ?? conv.identifier ?? null;
  if (!name) return null;
  if (conv.type && HIDDEN_TYPES.has(conv.type)) return null;
  return name;
}
```

- [ ] **Step 1 : Tests RED** (`forward-badge.test.ts`) : 6 types de groupe → nom ; `direct`/`bot` → null ; type absent → nom (statu quo cache) ; `title` absent → `identifier` ; conv null/nom vide → null. Miroir exact des cas de `ForwardBadgePolicyTests` iOS.
- [ ] **Step 2 : RED**, **Step 3 : implémentation ci-dessus**, **Step 4 : GREEN**.
- [ ] **Step 5 : Affichage.** `MessageContent` : ajouter `forwardedFromConversation?` au shape des props ; badge :

```tsx
{message.forwardedFromId && (() => {
  const fromName = forwardBadgeConversationName(message.forwardedFromConversation);
  return (
    <div className={...inchangé...}>
      <CornerUpRight className="h-3 w-3 flex-shrink-0" />
      <span>{fromName
        ? t('bubble.forwardedFrom', { name: fromName })
        : t('bubble.forwarded', 'Forwarded')}</span>
    </div>
  );
})()}
```
Clé ×4 : en `"Forwarded from {name}"`, fr `"Transféré depuis {name}"`, es `"Reenviado de {name}"`, pt `"Encaminhado de {name}"`. Câbler le même helper sur le site focal (`FocalRow:355` passe le libellé résolu à `FocalMetaRow`).
- [ ] **Step 6 : Test badge** (étendre le test D1 ou un test MessageContent : forwarded + groupe → texte avec nom ; forwarded + direct → « Forwarded » nu). GREEN.
- [ ] **Step 7 : Commit** — `feat(web): le badge transféré nomme le groupe source, règle jumelle iOS`.

### Task D3 : Action « Transférer » dans le menu message (garde vue-unique)

**Files:**
- Modify: `apps/web/components/common/bubble-message/MessageActionsBar.tsx` (prop `onForward?` + item + import `Forward` de lucide-react)
- Modify (chaîne de câblage, prop `onForwardMessage`) : `apps/web/components/conversations/ConversationLayout.tsx`, `ConversationView.tsx:87/:398`, `messages-display.tsx:36/:463/:547`, `components/common/bubble-message/BubbleMessage.tsx:44/:261/:292`, `BubbleMessageNormalView.tsx:61/:254`, `components/conversations/focal/FocalRow.tsx:76/:305`
- Modify: `apps/web/locales/{en,fr,es,pt}/bubbleStream.json` (`messageActions.forward`)
- Test: `apps/web/__tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx` (describe « Actions »)

**Interfaces:**
- Consumes: rien de neuf — la garde vue-unique est `!message.isViewOnce` (champ fiable, mappé par `transformers.service.ts:392-394`).
- Produces: `onForward?: () => void` sur `MessageActionsBarProps` ; les deux sites d'appel ne la passent QUE si `!message.isViewOnce`.

- [ ] **Step 1 : Tests RED** dans `BubbleMessageNormalView.test.tsx` (copier les mocks/helpers du fichier, describe Actions `:613-699`) : (a) clic item Transférer → `onForwardMessage` appelé avec le message ; (b) `isViewOnce: true` → l'item n'apparaît pas.
- [ ] **Step 2 : RED**, **Step 3 : implémentation** — `DropdownMenuItem` (icône `Forward`, libellé `t('messageActions.forward', 'Transférer')`) entre Copier et Infos ; clé ×4 (en « Forward », fr « Transférer », es « Reenviar », pt « Encaminhar ») ; câblage de la chaîne complète (grep chaque site listé, suivre le motif de `onReplyMessage`).
- [ ] **Step 4 : GREEN** (`npx jest __tests__/components/common/bubble-message/BubbleMessageNormalView.test.tsx`).
- [ ] **Step 5 : Commit** — `feat(web): action Transférer dans le menu des messages, refusée aux vues uniques`.

### Task D4 : Modale picker hybride + envoi multi-cibles

**Files:**
- Create: `apps/web/lib/forward-picker-model.ts` (machine à états JUMELLE de `ForwardPickerModel.swift` — mêmes règles, commentaire croisé)
- Create: `apps/web/components/conversations/forward-message-modal.tsx` (modèle structurel : `invite-user-modal.tsx`)
- Modify: `apps/web/components/conversations/ConversationLayout.tsx` (état `forwardingMessage`, montage de la modale, `handleForwardMessage`)
- Modify: `apps/web/locales/{en,fr,es,pt}/conversations.json` (bloc `forward.*`)
- Test: `apps/web/__tests__/lib/forward-picker-model.test.ts`, `apps/web/__tests__/components/conversations/forward-message-modal.test.tsx`

**Interfaces:**
- Consumes: `useConversationsPaginationRQ` (déjà monté dans ConversationLayout — passer `conversations` en prop à la modale), façade `meeshy-socketio.service.ts:186-210` `sendMessage(conversationOrId, content, language, …, forwardedFromId, forwardedFromConversationId)` (celle que le transport offline/fallback couvre déjà).
- Produces:

```ts
export type TargetState = 'idle' | 'selected' | 'sending' | 'sent' | { failed: string };
export class ForwardPickerModel {
  state(id: string): TargetState;
  selectedIds(): string[];
  tapRow(id: string): void;          // idle↔selected ; sent/sending → no-op
  beginSend(id: string): boolean;    // idle|selected|failed → sending (retire de la sélection) ; sent → false
  finishSend(id: string, ok: boolean, reason?: string): void;
  beginBatch(): string[];            // tous les selected → sending ; jamais un sent
}
```

- [ ] **Step 1 : Tests RED modèle** — les 6 règles user, MIROIR EXACT des tests iOS A3 Step 1 (toggle ; sent non sélectionnable ; envoi immédiat sur ligne sélectionnée = retrait de sélection ; batch sans doublon ; failed → retry ; offline compté envoyé côté affichage).
- [ ] **Step 2 : RED**, **Step 3 : implémentation**, **Step 4 : GREEN**.
- [ ] **Step 5 : Modale.** `Dialog` + `Input` recherche (filtre local sur `conversations`, exclut la conversation source) + `ScrollArea` de lignes : avatar + titre + type ; clic ligne = `tapRow` (fond accent + check) ; bouton fin de ligne (icône `Send`) = envoi immédiat ; `DialogFooter` : bouton « Envoyer (N) » visible si sélection. Envoi = façade socket avec `forwardedFromId: message.id`, `forwardedFromConversationId: sourceConversationId || undefined`, `content: message.content || ''`. Échec → état `failed(reason)` sous la ligne + retry ; premier succès → `toast.success` (sonner). Clés `forward.title`, `forward.search`, `forward.send-selected` (« Envoyer ({count}) »), `forward.sent`, `forward.failed` ×4 langues.
- [ ] **Step 6 : Tests RED puis GREEN modale** (RTL, mocks du fichier invite-user-modal.test.tsx) : rend la liste ; envoi immédiat appelle la façade avec `forwardedFromId` et SANS `attachmentIds` ; cible envoyée non re-sélectionnable ; batch n'appelle la façade que pour les sélectionnées.
- [ ] **Step 7 : Câblage ConversationLayout** (`handleForwardMessage` = setState → modale ; calquer la présence des champs sur `handleRetryMessage:680-733`).
- [ ] **Step 8 : Gates web.** `cd apps/web && npx jest __tests__/lib __tests__/components/conversations/forward-message-modal.test.tsx __tests__/components/common/bubble-message` puis `npm run type-check` (comparer au baseline AVANT le lot — tsc web n'est pas propre).
- [ ] **Step 9 : Commit** — `feat(web): transfert multi-cibles depuis le menu message, sans re-upload`.

---

## Lot E — Backend (conditionnel)

Uniquement si A0 l'exige (correctif de cause racine) — sinon AUCUN changement gateway. Le code d'erreur structuré du refus vue-unique devient inutile côté iOS (gate client A1) ; ne le faire que si le web en a besoin pour son affichage d'erreur (décision en D).

---

## Gates de fin de chantier

- [ ] `./apps/ios/meeshy.sh test` complet (phases 0-3) — UNE fois après lots B+A+C.
- [ ] `cd services/gateway && bun run test:coverage` si un fichier gateway a changé.
- [ ] Tests web + `tsc` (état de référence AVANT/APRÈS — tsc web n'est pas un gate propre, comparer au baseline).
- [ ] Vérification simulateur du flux complet (transfert média multi-cibles, badge groupe).
- [ ] Revue finale multi-dimensions (interface, API, logique, duplication, factorisation, optimisation, simplification) + corrections.
