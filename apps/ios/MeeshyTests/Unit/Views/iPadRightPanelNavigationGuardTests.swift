import XCTest
import MeeshySDK
@testable import Meeshy

/// Gardes de source sur le panneau droit iPad.
///
/// Deux régressions vécues (2026-07-29, audit navigation iPad) :
///   1. `rightPanelContent` posé SANS `NavigationStack` → tout `NavigationLink`
///      d'un écran du panneau (lignes de TrackingLinksView / ShareLinksView /
///      CommunityLinksView vers leur détail) était inerte au tap.
///   2. `ConnectionBanner()` construit sans `onItemTap` → taper une entrée de la
///      pastille de synchronisation n'ouvrait ni la conversation ni le post,
///      alors que l'iPhone route via `handleSyncPillTap`.
///
/// Les deux échouent en silence à l'exécution : rien ne se passe, aucun log,
/// aucun crash. D'où ces gardes.
final class iPadRightPanelNavigationGuardTests: XCTestCase {

    // MARK: - Helpers

    /// Retire commentaires de ligne ET de bloc — y compris un bloc ouvert et
    /// refermé sur la même ligne (`} catch { /* … */ }`, présent dans FeedView) :
    /// une première version ligne-à-ligne prenait ce cas pour un bloc ouvert et
    /// avalait tout le reste du fichier, rendant la garde verte à tort.
    /// Sans ce nettoyage, un commentaire citant le motif recherché suffirait
    /// à faire passer (ou échouer) la garde.
    private func strippingComments(_ source: String) -> String {
        var result = ""
        var index = source.startIndex
        var inBlock = false
        var inLine = false

        while index < source.endIndex {
            let remainder = source[index...]
            if inBlock {
                if remainder.hasPrefix("*/") {
                    inBlock = false
                    index = source.index(index, offsetBy: 2)
                    continue
                }
                if source[index] == "\n" { result.append("\n") }
                index = source.index(after: index)
                continue
            }
            if inLine {
                if source[index] == "\n" {
                    inLine = false
                    result.append("\n")
                }
                index = source.index(after: index)
                continue
            }
            if remainder.hasPrefix("/*") {
                inBlock = true
                index = source.index(index, offsetBy: 2)
                continue
            }
            if remainder.hasPrefix("//") {
                inLine = true
                index = source.index(index, offsetBy: 2)
                continue
            }
            result.append(source[index])
            index = source.index(after: index)
        }
        return result
    }

    private func occurrences(of needle: String, in source: String) -> Int {
        source.components(separatedBy: needle).count - 1
    }

    private func source(of fileName: String, file: StaticString = #filePath, line: UInt = #line) throws -> String {
        // #filePath → .../apps/ios/MeeshyTests/Unit/Views/<ce fichier>
        let appRoot = URL(fileURLWithPath: "\(#filePath)")
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
            .appendingPathComponent(fileName)
        let raw = try String(contentsOf: appRoot, encoding: .utf8)
        return strippingComments(raw)
    }

    // MARK: - Guards

    func test_iPadRootView_rightPanel_isWrappedInNavigationStack() throws {
        // Depuis #5837 la colonne droite monte `iPadRightPanel` (vue nominale,
        // iPadRootView+Panels.swift), qui porte le NavigationStack et rend
        // `iPadPanelDestination` — sortis du type de `iPadRootView.body`.
        let root = try source(of: "iPadRootView.swift")
        XCTAssertTrue(
            root.contains("iPadRightPanel("),
            "La colonne droite doit monter iPadRightPanel pour toute route hors conversation."
        )
        let panel = try source(of: "iPadRootView+Panels.swift")
        XCTAssertTrue(
            panel.contains("NavigationStack {") || panel.contains("NavigationStack(path:"),
            "Le panneau droit iPad doit héberger un NavigationStack, sinon les NavigationLink de ses écrans sont inertes."
        )
        XCTAssertTrue(
            panel.contains("iPadPanelDestination("),
            "Le contenu du panneau doit rester rendu par iPadPanelDestination."
        )
    }

    func test_iPadRootView_exposesPanelDismissToItsScreens() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertTrue(
            code.contains("meeshyPanelDismiss"),
            "Sans meeshyPanelDismiss, le bouton retour des écrans racine du panneau n'a aucun effet."
        )
    }

    /// Le SyncPill iPad a migré vers un point de montage unique
    /// (`iPadRootView+Sheets.swift`, `.overlay` chaîné avant
    /// `.modifier(CallPresentationLayer())`) au lieu d'un montage par
    /// panneau — cf. docs/superpowers/specs/2026-08-11-global-chrome-banner-stacking-design.md.
    /// Cette garde vérifie que le tap route toujours vers `handleSyncPillTap`
    /// AU NOUVEL EMPLACEMENT, et que l'ancien montage par panneau n'est pas
    /// revenu par erreur.
    func test_iPadPanels_noLongerMountsConnectionBannerPerPanel() throws {
        let code = try source(of: "iPadRootView+Panels.swift")
        XCTAssertFalse(code.contains("ConnectionBanner("), "Le SyncPill ne doit plus être monté par panneau — un seul point de montage, iPadCoversAndChromeLayer (RootLayers/iPadRootViewLayers.swift)")
    }

    func test_iPadRootView_mountsConnectionBannerOnce_routingTapsToHandleSyncPillTap() throws {
        let layer = try source(of: "RootLayers/iPadRootViewLayers.swift")
        XCTAssertEqual(
            occurrences(of: "ConnectionBanner(", in: layer), 1,
            "RootLayers/iPadRootViewLayers.swift doit monter le SyncPill EXACTEMENT une fois — le point de montage est unique."
        )
        XCTAssertTrue(
            layer.contains("onItemTap: onSyncPillTap"),
            "Le point de montage unique route le tap vers la fermeture que la racine lui remet."
        )
        let root = try source(of: "iPadRootView.swift")
        XCTAssertTrue(
            root.contains("onSyncPillTap: handleSyncPillTap"),
            "La racine iPad doit remettre handleSyncPillTap à la couche, comme RootView (iPhone)."
        )
    }

    /// Parité iPhone (audit iPad 2026-10-14) : la couverture iPad du lecteur de réels montre l'échec d'un réel
    /// introuvable, le lecteur de story reçoit le commentaire visé, et un réel de profil s'ouvre en lecteur.
    func test_iPadCovers_matchTheiPhoneForReelsStoriesAndProfileReels() throws {
        let layer = try source(of: "RootLayers/iPadRootViewLayers.swift")
        XCTAssertTrue(layer.contains("ReelOpenFailureView("), "un réel introuvable montre son échec, pas d'autres réels")
        // Le lecteur de story se monte par le couvercle UNIQUE (#11197) : l'iPad le pose, et c'est
        // lui qui descend une notification de réponse jusqu'à SON commentaire, pour toutes les racines.
        XCTAssertTrue(layer.contains(".modifier(StoryReaderCover("), "l'iPad monte le lecteur par le couvercle unique")
        let cover = try source(of: "StoryViewerContainer.swift")
        XCTAssertTrue(cover.contains("targetCommentId: presented.targetCommentId"))
        XCTAssertTrue(cover.contains("targetParentCommentId: presented.targetParentCommentId"))
        XCTAssertTrue(layer.contains("onOpenReel: { reel, reels in"), "un réel de profil s'ouvre dans le lecteur")
    }

    /// Parité iPhone : un seul hôte de toasts (MeeshyApp), les bandeaux d'attente montés, le titre de la fenêtre
    /// suivi par la racine iPad.
    func test_iPadRoot_toastsBannersAndWindowTitle_matchTheiPhone() throws {
        let overlays = try source(of: "iPadRootView+Overlays.swift")
        XCTAssertFalse(overlays.contains("FeedbackToastView("), "les toasts ont un hôte unique, au niveau de MeeshyApp")
        XCTAssertTrue(overlays.contains("RootPendingBanners()"), "les bandeaux « en attente » existent aussi sur iPad")
        let layer = try source(of: "RootLayers/iPadRootViewLayers.swift")
        XCTAssertTrue(layer.contains("DeviceLayout.activeWindowScene?.title"), "la fenêtre iPad porte le titre de ce qu'elle montre")
    }

    /// La fenêtre DÉTACHÉE (conversation ou réels à côté de la principale) :
    /// - sans portée de surfaces, ses feuilles s'inscrivaient avec une portée
    ///   `nil` — « joignable de toute fenêtre » : ouvrir une conversation dans la
    ///   fenêtre principale refermait sa galerie ou sa story, et un composer qui
    ///   retient y bloquait l'ouverture dans la principale ;
    /// - sans barrière de mise à jour ni d'âge, elle restait utilisable après un
    ///   426 ou un blocage d'âge que la principale, elle, imposait ;
    /// - sans « réduire les animations » de l'app, elle l'ignorait.
    func test_detachedWindow_carriesTheSameScopeAndGatesAsTheMainWindow() throws {
        let detached = try source(of: "AdaptiveRootView.swift")
        let start = try XCTUnwrap(detached.range(of: "struct DetachedWindowView"))
        let body = String(detached[start.lowerBound...])
        XCTAssertTrue(body.contains(".environment(\\.presentedSurfaceScope, router.surfaceScope)"))
        XCTAssertTrue(body.contains("UpgradeGateController()"))
        XCTAssertTrue(body.contains("UpgradeGateView(requirement:"))

        let appRoot = URL(fileURLWithPath: "\(#filePath)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/MeeshyApp.swift")
        let app = try String(contentsOf: appRoot, encoding: .utf8)
        let group = try XCTUnwrap(app.range(of: "DetachedWindowView(content: content)"))
        let scene = String(app[group.upperBound...].prefix(700))
        XCTAssertTrue(scene.contains(".ageGateOverlay()"))
        XCTAssertTrue(scene.contains("meeshyForceReduceMotion"))
    }

    /// Un lien (post, tag, communauté, profil, boutique…) reçu pendant qu'une
    /// story, un réel ou une feuille est présenté s'ouvrait DESSOUS : seules
    /// les conversations refermaient les surfaces. Les deux racines referment
    /// d'abord, comme pour un tap de notification (#10543).
    func test_deepLinks_closePresentedSurfacesFirst_onBothRoots() throws {
        for file in ["RootView.swift", "iPadRootView+Navigation.swift"] {
            let code = try source(of: file)
            let start = try XCTUnwrap(code.range(of: "func handleDeepLink(_ deepLink: DeepLink?) {"), file)
            let body = String(code[start.upperBound...].prefix(500))
            XCTAssertTrue(body.contains("router.clearPresentedSurfaces { _ in showDeepLink(deepLink) }"), file)
        }
    }

    /// Lien à froid vers une conversation en cache : le rafraîchissement de
    /// fond réécrivait la liste depuis l'instantané lu AVANT l'aller-retour,
    /// écrasant la liste plus récente que la synchro avait posée entre-temps.
    func test_coldConversationLink_mergesIntoTheCurrentList() throws {
        let code = try source(of: "RootView.swift") + "\n" + source(of: "RootConversationOpener.swift")
        XCTAssertFalse(code.contains("conversations.save(merged, for: \"list\")"))
        XCTAssertTrue(code.contains("conversations.mergeUpdate(for: \"list\")"))
    }

    /// Volet gauche iPad étroit (~200 pt) : la carte d'appui long (340 pt fixes)
    /// et la rangée d'actions de l'en-tête débordaient de la colonne.
    func test_narrowLeftColumn_cardAndHeaderFitTheColumn() throws {
        let overlays = try source(of: "ConversationListView+Overlays.swift")
        // L'en-tête a son fichier (`+HeaderOverlay`) : le négatif balaie les deux.
        let header = try source(of: "ConversationListView+HeaderOverlay.swift")
        let movedOut = try ["ConversationListView+BottomBar.swift", "ConversationListView+ChipDrag.swift",
                            "ConversationListView+MoveToSectionMenuItems.swift"]
            .map { try source(of: $0) }.joined(separator: "\n")
        XCTAssertFalse((overlays + header + movedOut).contains(".frame(width: 340)"))
        XCTAssertTrue(overlays.contains(".frame(maxWidth: .infinity).frame(maxWidth: ConversationPreviewWidthLaw.maximum)"))
        XCTAssertTrue(header.contains("ViewThatFits(in: .horizontal) {"))
        XCTAssertTrue(header.contains("headerActions(spacing: MeeshySpacing.xs)"))
    }

    func test_storyNotificationScreens_closeThePanelOnIPad() throws {
        let stories = URL(fileURLWithPath: "\(#filePath)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Stories/Notifications")
        for file in ["StoryNotificationTargetScreen.swift", "StoryExpiredContent.swift",
                     "StoryNotificationOfflineContent.swift"] {
            let code = strippingComments(try String(contentsOf: stories.appendingPathComponent(file), encoding: .utf8))
            XCTAssertTrue(code.contains("PanelBackAction("), "\(file) : le retour doit opérer dans le panneau iPad")
            XCTAssertFalse(code.contains(" dismiss()"), "\(file) : `dismiss()` seul ne fait rien à la racine du panneau")
        }
    }

    /// Les présentations déclenchées par les CARTES du feed (partage, citation,
    /// édition, commentaires de réel) ne doivent jamais être portées par
    /// `composerOverlay` : cette vue n'existe que composer ouvert, et un item
    /// armé sans vue hôte bloque ensuite toutes les présentations du feed.
    func test_feedView_postActionPresentations_areNotOwnedByComposerOverlay() throws {
        let code = try source(of: "FeedView.swift")
        // **L'ABSENCE de l'overlay SATISFAIT l'invariant** (réparé le
        // 2026-09-06). `composerOverlay` a été retiré de `FeedView` par
        // `4a50000317` — « 346 lignes qu'aucun appelant ne montait ». Le risque
        // que cette garde surveille — une présentation portée par une vue qui
        // n'existe que composer ouvert — devient alors structurellement
        // impossible : il n'y a plus de vue pour la porter.
        //
        // > **Une garde dont le sujet disparaît n'est pas fausse, elle est
        // > VACANTE.** La faire échouer punit le retrait qu'elle aurait dû
        // > applaudir ; la supprimer perdrait l'invariant le jour où un overlay
        // > revient. Elle constate donc l'absence et se rendort — prête à
        // > reprendre son office si le motif renaît.
        guard let overlayStart = code.range(of: "private var composerOverlay: some View") else {
            XCTAssertFalse(
                code.contains("composerOverlay"),
                "`composerOverlay` n'est plus déclaré mais reste RÉFÉRENCÉ : " +
                "une présentation pourrait encore lui être adossée sans hôte.")
            return
        }
        // Borne la portée à la déclaration suivante : sinon la garde lit tout le
        // reste du fichier — y compris les présentations correctement remontées
        // au body — et échoue alors même que le correctif est en place.
        let afterOverlay = code[overlayStart.upperBound...]
        let overlayEnd = afterOverlay.range(of: "\n    private ")?.lowerBound
            ?? afterOverlay.range(of: "\n    // MARK:")?.lowerBound
            ?? afterOverlay.endIndex
        let overlayScope = afterOverlay[..<overlayEnd]
        for item in ["$shareableLink", "$quoteTargetPost", "$editingPost", "$reelCommentsPost"] {
            XCTAssertFalse(
                overlayScope.contains(".sheet(item: \(item)") || overlayScope.contains(".fullScreenCover(item: \(item)"),
                "\(item) doit être présenté depuis le body de FeedView, pas depuis composerOverlay (monté sous `if showComposer`)."
            )
        }
        XCTAssertTrue(
            code.contains("postActionPresentations("),
            "Les présentations d'action de post doivent passer par postActionPresentations(_:) ancré au body."
        )
    }
}

/// La colonne droite de l'iPad et le relais de navigation entre les deux racines.
///
/// Deux défauts vécus à la lecture du code (2026-10-14) :
///   1. fil ouvert, toute route posée dans le panneau restait INVISIBLE — la colonne montrait le fil d'abord — et
///      le premier « retour » se dépensait à la retirer ;
///   2. une fenêtre d'iPad passée en largeur compacte démontait `iPadRootView` pour `RootView` : le fil ouvert
///      était perdu, dans les deux sens.
@MainActor
final class iPadRightColumnAndHandoffTests: XCTestCase {

    private func makeConversation(_ id: String) -> Conversation {
        MeeshyConversation(id: id, identifier: "ident-\(id)", type: .group, title: "Titre")
    }

    // MARK: - Colonne droite

    func test_rightColumn_panelRoute_coversOpenConversation() {
        let conversation = makeConversation("c1")
        XCTAssertEqual(
            iPadRightColumn.resolve(conversation: conversation, panelRoute: .settings),
            .panel(.settings))
    }

    func test_rightColumn_conversationAlone_showsConversation() {
        let conversation = makeConversation("c1")
        XCTAssertEqual(
            iPadRightColumn.resolve(conversation: conversation, panelRoute: nil),
            .conversation(conversation))
    }

    func test_rightColumn_nothingOpen_showsConversationList() {
        XCTAssertEqual(iPadRightColumn.resolve(conversation: nil, panelRoute: nil), .conversationList)
    }

    func test_visibleConversationId_isNilWhileARouteCoversTheConversation() {
        let conversation = makeConversation("c1")
        XCTAssertEqual(iPadRightColumn.visibleConversationId(conversation: conversation, panelRoute: nil), "c1")
        XCTAssertNil(iPadRightColumn.visibleConversationId(conversation: conversation, panelRoute: .notifications))
        XCTAssertNil(iPadRightColumn.visibleConversationId(conversation: nil, panelRoute: nil))
    }

    // MARK: - Relais

    func test_stack_putsThePanelRouteAboveTheConversation() {
        let conversation = makeConversation("c1")
        XCTAssertEqual(
            RootNavigationHandoff.stack(conversation: conversation, panelRoute: .settings),
            [.conversation(conversation), .settings])
        XCTAssertEqual(RootNavigationHandoff.stack(conversation: nil, panelRoute: .profile), [.profile])
        XCTAssertEqual(RootNavigationHandoff.stack(conversation: nil, panelRoute: nil), [])
    }

    func test_tabletPlacement_keepsTheLastConversationAndWhatCoversIt() {
        let first = makeConversation("c1")
        let second = makeConversation("c2")
        let placement = RootNavigationHandoff.tabletPlacement(
            of: [.settings, .conversation(first), .profile, .conversation(second), .progression, .userStats])
        XCTAssertEqual(placement.conversation, second)
        XCTAssertEqual(placement.panelRoutes, [.progression, .userStats])
    }

    func test_tabletPlacement_withoutConversation_keepsEveryRoute() {
        let placement = RootNavigationHandoff.tabletPlacement(of: [.settings, .links])
        XCTAssertNil(placement.conversation)
        XCTAssertEqual(placement.panelRoutes, [.settings, .links])
    }

    func test_tabletPlacement_ofAnEmptyStack_isEmpty() {
        XCTAssertEqual(
            RootNavigationHandoff.tabletPlacement(of: []),
            RootNavigationHandoff.TabletPlacement(conversation: nil, panelRoutes: []))
    }

    func test_stackThenPlacement_roundTrips() {
        let conversation = makeConversation("c1")
        let placement = RootNavigationHandoff.tabletPlacement(
            of: RootNavigationHandoff.stack(conversation: conversation, panelRoute: .notifications))
        XCTAssertEqual(placement.conversation, conversation)
        XCTAssertEqual(placement.panelRoutes, [.notifications])
    }

    // MARK: - Pile du Jeu dans le relais

    func test_gameTrail_keepsReadableRoutes_andFollowsASwipeBack() {
        var trail = GamePanelTrail()
        trail.push(.progressionConcept(.league), over: .progression)
        trail.push(.gamePage(.league), over: .progression)
        XCTAssertEqual(trail.routes(over: .progression), [.progressionConcept(.league), .gamePage(.league)])
        XCTAssertEqual(trail.routes(over: .settings), [], "la pile ne vaut que pour SA racine")

        // Un retour par glissement : la NavigationStack rend un chemin raccourci.
        var shorter = trail.path(over: .progression)
        shorter.removeLast()
        let swiped = GamePanelTrail(root: .progression, path: shorter, previous: trail)
        XCTAssertEqual(swiped.routes(over: .progression), [.progressionConcept(.league)])
    }

    func test_gameTrail_crossesTheHandoff_andIsReplayedOnTheTablet() {
        let stack = RootNavigationHandoff.stack(conversation: nil, panelRoute: .progression)
            + [.progressionConcept(.league), .gamePage(.league)]
        let placement = RootNavigationHandoff.tabletPlacement(of: stack)
        XCTAssertNil(placement.conversation)
        XCTAssertEqual(placement.panelRoutes, [.progression, .progressionConcept(.league), .gamePage(.league)])
    }

    func test_handoff_recordsTheLatestStack() {
        let handoff = RootNavigationHandoff()
        XCTAssertEqual(handoff.routes, [])
        handoff.record([.settings])
        handoff.record([.profile, .links])
        XCTAssertEqual(handoff.routes, [.profile, .links])
    }
}

/// Le ménage de `tmp` ne touche que les copies connues, et seulement au-delà d'une semaine.
final class TemporaryMediaSweeperTests: XCTestCase {

    func test_onlyKnownPrefixes_olderThanAWeek_areSwept() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let old = now.addingTimeInterval(-8 * 24 * 3600)
        let fresh = now.addingTimeInterval(-3600)
        let swept = TemporaryMediaSweeper.expired([
            (name: "composer_photo_A.jpg", modified: old),
            (name: "composer_photo_B.jpg", modified: fresh),
            (name: "recent_C.mov", modified: old),
            (name: "composer-autosave-sessions", modified: old),
            (name: "media-save-1234", modified: old),
        ], now: now)
        XCTAssertEqual(swept, ["composer_photo_A.jpg", "recent_C.mov"])
    }

    func test_sweep_removesOnlyTheExpiredFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("sweep-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let oldFile = dir.appendingPathComponent("composer_file_old.pdf")
        let keepFile = dir.appendingPathComponent("unrelated.txt")
        try Data("a".utf8).write(to: oldFile)
        try Data("b".utf8).write(to: keepFile)
        TemporaryMediaSweeper.sweep(in: dir, now: Date().addingTimeInterval(8 * 24 * 3600))
        XCTAssertFalse(FileManager.default.fileExists(atPath: oldFile.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: keepFile.path))
    }
}

/// Les fenêtres de Meeshy sur iPad (décision du porteur, 2026-10-14) : UNE fenêtre principale — une seconde copie
/// renvoie vers la première —, et des fenêtres DÉTACHÉES pour une conversation ou pour les réels.
@MainActor
final class DetachedWindowsTests: XCTestCase {

    private func appSource(_ path: String) throws -> String {
        let root = URL(fileURLWithPath: "\(#filePath)")
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        return try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
    }

    func test_detachedContent_survivesSceneRestoration() throws {
        for content in [DetachedWindowContent.conversation(id: "c1"), .reels(startId: "r1"), .reels(startId: nil)] {
            let data = try JSONEncoder().encode(content)
            XCTAssertEqual(try JSONDecoder().decode(DetachedWindowContent.self, from: data), content)
        }
    }

    func test_theAppHasOneGatedMainWindow_andADetachedScene() throws {
        let app = try appSource("MeeshyApp.swift")
        XCTAssertTrue(app.contains("MainWindowGate {"), "la fenêtre principale passe par sa porte d'unicité")
        XCTAssertTrue(app.contains("WindowGroup(id: DetachedWindowOpener.sceneId, for: DetachedWindowContent.self)"))
        let order = try XCTUnwrap(app.range(of: "MainWindowGate {")).lowerBound
            < (try XCTUnwrap(app.range(of: "WindowGroup(id: DetachedWindowOpener.sceneId")).lowerBound)
        XCTAssertTrue(order, "la scène principale vient EN PREMIER : c'est elle qu'iPadOS ouvre par défaut")
    }

    func test_conversationsAndReels_offerTheirOwnWindow() throws {
        let menu = try appSource("Features/Main/Views/ConversationListView+Overlays.swift")
        XCTAssertTrue(menu.contains("DetachedWindowOpener.shared.open(.conversation(id: conversation.id))"))
        let feed = try appSource("Features/Main/Views/FeedView.swift")
        XCTAssertTrue(feed.contains("DetachedWindowOpener.shared.open(.reels(startId: nil))"))
    }

    func test_aDraggedConversation_carriesItsId_andItsWindowActivity() {
        let provider = ConversationDragItemProvider(conversationId: "c1", title: "Équipe", opensWindow: true)
        let types = provider.registeredTypeIdentifiers
        XCTAssertTrue(types.contains { $0.contains("text") }, "l'id, qu'un en-tête de catégorie reçoit")
        XCTAssertTrue(types.contains { $0.contains("useractivity") || $0.contains("user-activity") || $0.contains("activity") },
                      "l'activité qui en fait une fenêtre au bord de l'écran : \(types)")
        let flat = ConversationDragItemProvider(conversationId: "c1", title: "Équipe", opensWindow: false)
        XCTAssertFalse(flat.registeredTypeIdentifiers.contains { $0.contains("activity") }, "sans fenêtres multiples, l'id seul")
    }

    func test_theEndOfADragSession_isAnnounced() {
        var provider: ConversationDragItemProvider? = ConversationDragItemProvider(conversationId: "c1", title: "x", opensWindow: false)
        let token = provider?.token
        let ended = expectation(forNotification: .conversationDragDidEnd, object: nil) { note in
            (note.object as? NSUUID).map { $0 as UUID } == token
        }
        provider = nil
        wait(for: [ended], timeout: 2)
    }

    func test_draggingAConversation_foldsTheCategories_andRestoresThem() throws {
        let list = try appSource("Features/Main/Views/ConversationListView.swift")
        XCTAssertTrue(list.contains("sectionsBeforeDrag = expandedSections"), "les catégories dépliées sont retenues")
        XCTAssertTrue(list.contains("expandedSections = []"), "toutes se replient pendant le glisser")
        XCTAssertTrue(list.contains("var restored = before.union(expandedSections)"), "elles se redéplient au dépôt ou à l'annulation")
        XCTAssertTrue(list.contains("defer { endConversationDrag(expanding: sectionId) }"), "le dépôt redéplie, et ouvre la catégorie qui reçoit")
        let sectionHeader = try appSource("Features/Main/Views/ConversationListView+SectionHeader.swift")
        XCTAssertTrue(sectionHeader.contains("dragOriginSectionId == section.id"), "la catégorie d'origine se marque")
        XCTAssertTrue(list.contains("publisher(for: .conversationDragDidEnd)"), "l'annulation redéplie")
        XCTAssertTrue(list.contains("if let token, token != pendingDrag?.token { return }"), "la fin d'un AUTRE glisser est ignorée")
        XCTAssertTrue(list.contains("delegate: ConversationListDragWatch(onEnter: collapseForConversationDrag)"),
                      "le repli attend que le doigt bouge : un appui long qui finit en menu ne replie rien")
    }

    func test_callsAlwaysShowInTheMainWindow() throws {
        let presenter = try appSource("Features/Main/Views/RootLayers/CallWindowPresenter.swift")
        XCTAssertTrue(presenter.contains("guard let scene = CallWindowScene.target(activating: true)"),
                      "l'écran d'appel vise la fenêtre principale et la ramène au premier plan")
        XCTAssertTrue(presenter.contains("guard let scene = CallWindowScene.target() else"),
                      "le point de retour vise la fenêtre principale sans voler le focus")
        XCTAssertFalse(presenter.contains("guard let scene = DeviceLayout.activeWindowScene"))
    }

    func test_aDetachedWindow_mountsNoRoot() throws {
        let host = try appSource("Features/Main/Views/AdaptiveRootView.swift")
        let start = try XCTUnwrap(host.range(of: "struct DetachedWindowView: View {"))
        let end = try XCTUnwrap(host.range(of: "enum DetachedConversationResolver"))
        let body = host[start.upperBound..<end.lowerBound]
        for root in ["iPadRootView(", "RootView(", "startRootServices", "RootIntentRoutingLayer("] {
            XCTAssertFalse(body.contains(root), "une fenêtre détachée ne monte pas \(root) : la fenêtre principale tient les services")
        }
    }

    // MARK: - Appartenance à un compte

    /// Première ouverture : la fenêtre adopte le compte actif.
    func test_ownership_firstOpen_adoptsTheActiveAccount() {
        XCTAssertEqual(DetachedWindowOwnership.verdict(owner: nil, current: "u-a"), .adopt("u-a"))
        XCTAssertTrue(DetachedWindowOwnership.shows(owner: nil, current: "u-a"))
    }

    /// Le propriétaire revient (relance, retour de la session) : la fenêtre se garde.
    func test_ownership_sameAccount_keepsTheWindow() {
        XCTAssertEqual(DetachedWindowOwnership.verdict(owner: "u-a", current: "u-a"), .keep)
        XCTAssertTrue(DetachedWindowOwnership.shows(owner: "u-a", current: "u-a"))
    }

    /// Changement de compte : rien du compte quitté ne se peint, la fenêtre se ferme.
    func test_ownership_anotherAccount_closesWithoutShowing() {
        XCTAssertEqual(DetachedWindowOwnership.verdict(owner: "u-a", current: "u-b"), .close)
        XCTAssertFalse(DetachedWindowOwnership.shows(owner: "u-a", current: "u-b"),
                       "La conversation du compte A ne doit jamais apparaître sous le compte B.")
    }

    /// Pendant la bascule (session sortie) : on attend, sans adopter ni fermer.
    func test_ownership_signedOut_waits() {
        XCTAssertEqual(DetachedWindowOwnership.verdict(owner: "u-a", current: nil), .waitForSignIn)
        XCTAssertEqual(DetachedWindowOwnership.verdict(owner: "u-a", current: ""), .waitForSignIn)
        XCTAssertFalse(DetachedWindowOwnership.shows(owner: "u-a", current: nil))
    }

    /// La vue lit bien la règle : sans ce câblage, les témoins ci-dessus resteraient verts sur une fenêtre
    /// qui repeint la conversation du compte quitté.
    func test_ownership_isWiredIntoTheDetachedWindow() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/AdaptiveRootView.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("@SceneStorage(\"meeshy.detached.ownerUserId\")"))
        XCTAssertTrue(code.contains("DetachedWindowOwnership.shows(owner: ownerUserId, current: authManager.currentUser?.id)"))
        XCTAssertTrue(code.contains(".task(id: authManager.currentUser?.id)"))
    }
}

/// Les aperçus de liens gardés sont plafonnés : chaque lien distinct s'ajoutait sans fin, et chaque ajout
/// ré-encodait tout le fichier.
@MainActor
final class LinkPreviewStoreBoundTests: XCTestCase {

    private func metadata(_ id: String, age: TimeInterval) -> LinkMetadata {
        LinkMetadata(id: id, title: nil, description: nil, imageURL: nil, siteName: nil,
                     fetchedAt: Date(timeIntervalSince1970: 1_800_000_000 - age))
    }

    func test_bounded_keepsTheMostRecentPreviews() {
        let entries = Dictionary(uniqueKeysWithValues: (0..<10).map { ("u\($0)", metadata("u\($0)", age: TimeInterval($0))) })
        let kept = LinkPreviewStore.bounded(entries, limit: 3)
        XCTAssertEqual(Set(kept.keys), ["u0", "u1", "u2"])
    }

    func test_bounded_leavesASmallCacheUntouched() {
        let entries = ["a": metadata("a", age: 1)]
        XCTAssertEqual(LinkPreviewStore.bounded(entries, limit: 500), entries)
    }
}
