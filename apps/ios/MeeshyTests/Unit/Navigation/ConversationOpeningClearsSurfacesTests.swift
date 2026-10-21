import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Ouvrir une conversation referme la story, le réel ou le plein écran en
/// cours (#10539) — décidé au routeur, pour tous les chemins d'ouverture.
@MainActor
final class ConversationOpeningClearsSurfacesTests: XCTestCase {

    private func makeConversation(id: String = "000000000000000000000001") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Test", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func openedConversationId(_ router: Router) -> String? {
        guard router.path.count == 1, case .conversation(let conversation) = router.path[0] else { return nil }
        return conversation.id
    }

    // MARK: - Une famille de surface, un témoin

    func test_navigateToConversation_storyViewerPresented_closesItAndOpens() {
        assertClosesAndOpens(.storyViewer)
    }

    func test_navigateToConversation_conversationCoverPresented_closesItAndOpens() {
        assertClosesAndOpens(.conversationCover)
    }

    func test_navigateToConversation_mediaGalleryPresented_closesItAndOpens() {
        assertClosesAndOpens(.mediaGallery)
    }

    func test_navigateToConversation_restorableComposerPresented_closesItAndOpens() {
        assertClosesAndOpens(.composer)
    }

    func test_navigateToConversation_loneSheetPresented_closesItAndOpens() {
        assertClosesAndOpens(.sheet)
    }

    func test_navigateToConversation_placeMapPresented_closesItAndOpens() {
        assertClosesAndOpens(.place)
    }

    func test_navigateToConversation_globalSearchPresented_closesItAndOpens() {
        assertClosesAndOpens(.search)
    }

    func test_navigateToConversation_profilePhotoPresented_closesItAndOpens() {
        assertClosesAndOpens(.profilePhoto)
    }

    func test_navigateToConversation_contactCardPresented_closesItAndOpens() {
        assertClosesAndOpens(.contactCard)
    }

    private func assertClosesAndOpens(_ kind: PresentedSurfaceKind, line: UInt = #line) {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var closed = 0
        _ = registry.declare(kind, answer: { .closes }) { closed += 1 }

        router.navigateToConversation(makeConversation(id: "0000000000000000000000aa"))

        XCTAssertEqual(closed, 1, "\(kind) reste présentée", line: line)
        XCTAssertEqual(openedConversationId(router), "0000000000000000000000aa", line: line)
    }

    func test_navigateToConversation_reelsPlaying_closesTheReaderAndStopsPlayback() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var playbackStops = 0
        let reels = ReelsPresenter(surfaces: registry, stopPlayback: { playbackStops += 1 })
        reels.presentFresh()
        XCTAssertEqual(registry.declaredKinds, [.reels])

        router.navigateToConversation(makeConversation(id: "0000000000000000000000ab"))

        XCTAssertNil(reels.launch)
        XCTAssertEqual(playbackStops, 1)
        XCTAssertTrue(registry.declaredKinds.isEmpty)
        XCTAssertEqual(openedConversationId(router), "0000000000000000000000ab")
    }

    func test_dismiss_reelsClosedByTheUser_retiresTheSurfaceWithoutStoppingTwice() {
        let registry = PresentedSurfaceRegistry()
        var playbackStops = 0
        let reels = ReelsPresenter(surfaces: registry, stopPlayback: { playbackStops += 1 })
        reels.presentFresh()

        reels.dismiss()

        XCTAssertTrue(registry.declaredKinds.isEmpty)
        XCTAssertEqual(playbackStops, 0)
    }

    func test_present_reelsRetryOnAFailure_declaresTheReaderOnce() {
        let registry = PresentedSurfaceRegistry()
        let reels = ReelsPresenter(surfaces: registry, stopPlayback: {})
        reels.presentFailure(.network, postId: "0000000000000000000000b1", commentId: nil, parentCommentId: nil)

        reels.present(posts: [], startId: "0000000000000000000000b1")

        XCTAssertEqual(registry.declaredKinds, [.reels])
    }

    // MARK: - Empilements, fiche de profil, même conversation

    func test_navigateToConversation_storyOverReels_closesBoth() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        let reels = ReelsPresenter(surfaces: registry, stopPlayback: {})
        reels.presentFresh()
        var storyClosed = false
        _ = registry.declare(.storyViewer, answer: { .closes }) { storyClosed = true }

        router.navigateToConversation(makeConversation())

        XCTAssertNil(reels.launch)
        XCTAssertTrue(storyClosed)
        XCTAssertEqual(router.path.count, 1)
    }

    func test_navigateToConversation_profileSheetPresented_closesIt() {
        let router = Router(surfaces: PresentedSurfaceRegistry())
        router.deepLinkProfileUser = ProfileSheetUser(userId: "0000000000000000000000c1", username: "alice")
        router.participantProfileTarget = ParticipantProfileTarget(
            conversationId: "0000000000000000000000c2", participantId: "0000000000000000000000c3")

        router.navigateToConversation(makeConversation())

        XCTAssertNil(router.deepLinkProfileUser)
        XCTAssertNil(router.participantProfileTarget)
        XCTAssertEqual(router.path.count, 1)
    }

    func test_navigateToConversation_sameConversationBeneathTheSurface_onlyCloses() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        let conversation = makeConversation(id: "0000000000000000000000ac")
        router.navigateToConversation(conversation)
        var closed = 0
        _ = registry.declare(.storyViewer, answer: { .closes }) { closed += 1 }

        router.navigateToConversation(conversation)

        XCTAssertEqual(closed, 1)
        XCTAssertEqual(openedConversationId(router), "0000000000000000000000ac")
    }

    func test_navigateToConversation_nothingPresented_opensAtOnce() {
        let router = Router(surfaces: PresentedSurfaceRegistry())

        router.navigateToConversation(makeConversation(id: "0000000000000000000000ad"), highlightMessageId: "0000000000000000000000d1")

        XCTAssertEqual(openedConversationId(router), "0000000000000000000000ad")
        XCTAssertEqual(router.pendingHighlightMessageId, "0000000000000000000000d1")
        XCTAssertEqual(router.pendingHighlightConversationId, "0000000000000000000000ad")
    }

    // MARK: - Ce qui ne se referme pas

    func test_navigateToConversation_composerHoldingWork_waitsForItToLeave() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var closed = 0
        let composer = registry.declare(.composer, answer: { .retains }) { closed += 1 }

        router.navigateToConversation(makeConversation(id: "0000000000000000000000ae"))

        XCTAssertEqual(closed, 0)
        XCTAssertTrue(router.path.isEmpty)

        registry.retire(composer)

        XCTAssertEqual(openedConversationId(router), "0000000000000000000000ae")
    }

    func test_navigateToConversation_gameScreenPresented_waitsForItToLeave() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var closed = 0
        let game = registry.declare(.game, answer: { .retains }) { closed += 1 }

        router.navigateToConversation(makeConversation(id: "0000000000000000000000af"))

        XCTAssertEqual(closed, 0)
        XCTAssertTrue(router.path.isEmpty)

        registry.retire(game)

        XCTAssertEqual(openedConversationId(router), "0000000000000000000000af")
    }

    // MARK: - `push(.conversation)` passe par le site (#10543)

    func test_push_conversationUnderASurface_closesItThenStacks() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        router.push(.profile)
        var closed = 0
        _ = registry.declare(.search, answer: { .closes }) { closed += 1 }

        router.push(.conversation(makeConversation(id: "0000000000000000000000ba")))

        XCTAssertEqual(closed, 1)
        XCTAssertEqual(router.path.count, 2)
        XCTAssertEqual(router.currentConversationId, "0000000000000000000000ba")
    }

    func test_push_conversationWithNothingPresented_stacksAtOnce() {
        let router = Router(surfaces: PresentedSurfaceRegistry())

        router.push(.conversation(makeConversation(id: "0000000000000000000000bb")))

        XCTAssertEqual(openedConversationId(router), "0000000000000000000000bb")
    }

    func test_push_conversationUnderARetainingSurface_waitsForItToLeave() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        let game = registry.declare(.game, answer: { .retains }) {}

        router.push(.conversation(makeConversation(id: "0000000000000000000000bc")))

        XCTAssertTrue(router.path.isEmpty)

        registry.retire(game)

        XCTAssertEqual(openedConversationId(router), "0000000000000000000000bc")
    }

    func test_push_anotherRoute_leavesTheSurfacePresented() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var closed = 0
        _ = registry.declare(.sheet, answer: { .closes }) { closed += 1 }

        router.push(.profile)

        XCTAssertEqual(closed, 0)
        XCTAssertEqual(router.path.count, 1)
    }

    // MARK: - Un post ou une story ouverts par une notification (#10543)

    func test_clearPresentedSurfaces_postOpenedFromANotification_closesTheStoryFirst() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var events: [String] = []
        _ = registry.declare(.storyViewer, answer: { .closes }) { events.append("story refermée") }

        router.clearPresentedSurfaces { _ in
            events.append("post ouvert")
            router.push(.postDetail("0000000000000000000000e1"))
        }

        XCTAssertEqual(events, ["story refermée", "post ouvert"])
        XCTAssertEqual(router.path.count, 1)
    }

    // MARK: - Deux fenêtres, deux routeurs (#10543)

    func test_navigateToConversation_surfaceOfTheOtherWindow_staysPresented() {
        let registry = PresentedSurfaceRegistry()
        let thisWindow = Router(surfaces: registry)
        let otherWindow = Router(surfaces: registry)
        var closedHere = 0
        var closedElsewhere = 0
        _ = registry.declare(.storyViewer, scope: thisWindow.surfaceScope, answer: { .closes }, close: { closedHere += 1 })
        _ = registry.declare(.reels, scope: otherWindow.surfaceScope, answer: { .closes }, close: { closedElsewhere += 1 })

        thisWindow.navigateToConversation(makeConversation(id: "0000000000000000000000ca"))

        XCTAssertEqual(closedHere, 1)
        XCTAssertEqual(closedElsewhere, 0)
        XCTAssertEqual(openedConversationId(thisWindow), "0000000000000000000000ca")
        XCTAssertTrue(otherWindow.path.isEmpty)
    }

    func test_clearPresentedSurfaces_iPadOpening_closesBeforeItsOwnOpening() {
        let registry = PresentedSurfaceRegistry()
        let router = Router(surfaces: registry)
        var events: [String] = []
        _ = registry.declare(.storyViewer, answer: { .closes }) { events.append("story refermée") }

        router.clearPresentedSurfaces { beneath in events.append(beneath ? "ouverte dessous" : "ouverte") }

        XCTAssertEqual(events, ["story refermée", "ouverte dessous"])
    }

    // MARK: - Gardes de source : qui se déclare, qui décide

    private func appSource(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try AppSourceGuard.text(at: root.appendingPathComponent(relativePath)))
    }

    func test_everySurfaceFamily_declaresItselfAtItsMountPoint() throws {
        let mounts: [(String, String)] = [
            ("Features/Main/Views/StoryViewerContainer.swift", ".closesForConversationOpening(.storyViewer"),
            ("Features/Main/Views/ReelsPresenter.swift", "surfaces.declare(.reels"),
            ("Features/Main/Views/SocialMediaGalleryPresentation.swift", ".closesForConversationOpening(.mediaGallery)"),
            ("Features/Main/Composer/MeeshyComposerHost+Autosave.swift", ".closesForConversationOpening(.composer"),
        ]
        for (file, declaration) in mounts {
            XCTAssertTrue(try appSource(file).contains(declaration), "\(file) ne se déclare plus")
        }
        let covers = try appSource("Features/Main/Views/Modifiers/ConversationViewingVisibilityModifier.swift")
        XCTAssertEqual(covers.components(separatedBy: ".closesForConversationOpening(.conversationCover)").count - 1, 2)
    }

    private func occurrences(of needle: String, in relativePath: String) throws -> Int {
        try appSource(relativePath).components(separatedBy: needle).count - 1
    }

    func test_loneSheets_declareThemselvesAtTheirMountPoint() throws {
        let sheet = ".closesForConversationOpening(.sheet"
        XCTAssertEqual(try occurrences(of: sheet, in: "Features/Main/Views/FeedCommentsSheet.swift"), 1)
        XCTAssertEqual(try occurrences(of: sheet, in: "Features/Main/Components/ConversationInfoSheet.swift"), 1)
        // 3a7502ceda : la feuille « nouvelle conversation » est montée par
        // `NewConversationSheetHost` (commande de scène), qui la déclare une fois ;
        // chaque racine monte ce porteur.
        XCTAssertEqual(try occurrences(of: sheet, in: "Features/Main/Navigation/SceneCommandHosts.swift"), 1,
                       "SceneCommandHosts.swift : nouvelle conversation")
        for layers in ["Features/Main/Views/RootLayers/RootViewLayers.swift",
                       "Features/Main/Views/RootLayers/iPadRootViewLayers.swift"] {
            XCTAssertEqual(try occurrences(of: sheet, in: layers), 2,
                           "\(layers) : aperçu d'un toast, sélecteur de partage")
            XCTAssertEqual(try occurrences(of: ".modifier(NewConversationSheetHost(", in: layers), 1,
                           "\(layers) : nouvelle conversation, par son porteur")
        }
        XCTAssertEqual(try occurrences(of: ".closesForConversationOpening(.mediaGallery)",
                                       in: "Features/Main/Components/MediaHub/ConversationMediaHubView.swift"), 1)
    }

    func test_remainingFullScreens_declareThemselvesAtTheirMountPoint() throws {
        let place = ").closesForConversationOpening(.place)"
        let mounts: [(String, String, Int)] = [
            ("Features/Main/Views/Bubble/BubbleStandardLayout.swift", place, 2),
            ("Features/Main/Views/FeedPostCard.swift", place, 1),
            ("Features/Main/Views/PostDetailView.swift", place, 1),
            ("Features/Main/Views/ReelFeedCard.swift", place, 1),
            ("Features/Main/Views/CommentRowView.swift", place, 1),
            ("Features/Main/Views/GlobalSearchView.swift", ".closesForConversationOpening(.search)", 1),
            ("Features/Main/Views/ProfileView.swift", ").closesForConversationOpening(.profilePhoto)", 1),
            ("Features/Main/Components/ContactCardView.swift", ".closesForConversationOpening(.contactCard)", 1),
        ]
        for (file, declaration, count) in mounts {
            XCTAssertEqual(try occurrences(of: declaration, in: file), count, "\(file) ne se déclare plus")
        }
    }

    func test_gameScreens_retainInsteadOfClosing() throws {
        for file in ["Features/Main/Game/Photo/GamePhotoFlowView.swift",
                     "Features/Main/Views/AchievementRevealView.swift"] {
            XCTAssertEqual(try occurrences(of: ".retainsAgainstConversationOpening(.game)", in: file), 1, file)
            XCTAssertEqual(try occurrences(of: "closesForConversationOpening", in: file), 0,
                           "\(file) : une partie en cours ne se referme pas")
        }
    }

    func test_composerClosing_goesThroughTheAtelierExit() throws {
        let host = try appSource("Features/Main/Composer/MeeshyComposerHost+Autosave.swift")
        XCTAssertTrue(host.contains("ComposerConversationYield.close(atelierWritesItsDraft: atelierWritesItsDraft"))
        XCTAssertTrue(host.contains("exitIsArmed: publishTrigger.offersExit"))
    }

    func test_pushOfAConversation_goesThroughTheRouterSite() throws {
        let router = try appSource("Features/Main/Navigation/Router.swift")
        let push = try XCTUnwrap(router.components(separatedBy: "func push(_ route: Route) {").dropFirst().first)
        let body = push.components(separatedBy: "private func place(_ route: Route) {")[0]
        XCTAssertTrue(body.contains("guard case .conversation = route else"))
        XCTAssertTrue(body.contains("clearPresentedSurfaces"))
    }

    func test_notificationOpeningAPostOrAStory_goesThroughTheRouterSite() throws {
        let iPhone = try appSource("Features/Main/Views/RootNotificationNavigator.swift")
        let opening = try XCTUnwrap(iPhone.components(separatedBy: "private func openSocialContent(").dropFirst().first)
        XCTAssertTrue(opening.components(separatedBy: "private func showSocialContent(")[0]
            .contains("router.clearPresentedSurfaces { _ in showSocialContent(ctx, postId: postId) }"))
        XCTAssertEqual(iPhone.components(separatedBy: "switch socialSurface(ctx, postId: postId)").count - 1, 1,
                       "un seul aiguillage social : la branche des notifications passe par openSocialContent")

        let iPad = try appSource("Features/Main/Views/iPadRootView+Navigation.swift")
        let routing = try XCTUnwrap(iPad.components(separatedBy: "func routeSocialNotification(").dropFirst().first)
        XCTAssertTrue(routing.components(separatedBy: "private func showSocialSurface(")[0]
            .contains("router.clearPresentedSurfaces"))
    }

    func test_eachWindow_putsItsRouterScopeAboveItsLayers() throws {
        let scope = ".environment(\\.presentedSurfaceScope, router.surfaceScope)"
        let iPhone = try appSource("Features/Main/Views/RootLayers/RootViewLayers.swift")
        let sheets = try XCTUnwrap(iPhone.components(separatedBy: "struct RootSheetsLayer").dropFirst().first)
        XCTAssertTrue(sheets.contains(scope), "RootSheetsLayer est la dernière couche de RootView")

        let iPad = try appSource("Features/Main/Views/RootLayers/iPadRootViewLayers.swift")
        let covers = try XCTUnwrap(iPad.components(separatedBy: "struct iPadCoversAndChromeLayer").dropFirst().first)
        XCTAssertTrue(covers.contains(scope), "iPadCoversAndChromeLayer est la dernière couche de iPadRootView")
        XCTAssertTrue(try appSource("Features/Main/Navigation/PresentedSurfaceModifier.swift")
            .contains("registry.declare(kind, scope: scope"))
    }

    func test_iPadOpening_goesThroughTheRouterSite() throws {
        let source = try appSource("Features/Main/Views/iPadRootView+Navigation.swift")
        let opening = try XCTUnwrap(source.components(separatedBy: "func openConversation(_ conversation: Conversation) {").dropFirst().first)
        let body = opening.components(separatedBy: "func closePanels()")[0]
        XCTAssertTrue(body.contains("router.clearPresentedSurfaces"))
    }

    func test_onlyTheRouterAsksTheRegistryToClear() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy")
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        var askers: [String] = []
        for case let url as URL in enumerator where url.pathExtension == "swift" {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.text(at: url))
            if source.contains(".clearForConversation(") || source.contains(".clearForConversation {") {
                askers.append(url.lastPathComponent)
            }
        }
        XCTAssertEqual(askers.sorted(), ["Router.swift"])
    }

    func test_callScreen_neverDeclaresItself() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: views, includingPropertiesForKeys: nil))
        var callFiles = 0
        for case let url as URL in enumerator where url.pathExtension == "swift" && url.lastPathComponent.contains("Call") {
            callFiles += 1
            let source = AppSourceGuard.stripComments(try AppSourceGuard.text(at: url))
            XCTAssertFalse(source.contains("closesForConversationOpening"), "\(url.lastPathComponent) : un appel ne se referme pas")
        }
        XCTAssertGreaterThan(callFiles, 3)
    }
}
