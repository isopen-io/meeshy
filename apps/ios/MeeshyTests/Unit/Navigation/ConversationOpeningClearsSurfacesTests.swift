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
            try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8))
    }

    func test_everySurfaceFamily_declaresItselfAtItsMountPoint() throws {
        let mounts: [(String, String)] = [
            ("Features/Main/Views/StoryViewerContainer.swift", ".closesForConversationOpening(.storyViewer)"),
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
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            if source.contains(".clearForConversation(") || source.contains(".clearForConversation {") {
                askers.append(url.lastPathComponent)
            }
        }
        XCTAssertEqual(askers.sorted(), ["PresentedSurfaceRegistry.swift", "Router.swift"])
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
            let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            XCTAssertFalse(source.contains("closesForConversationOpening"), "\(url.lastPathComponent) : un appel ne se referme pas")
        }
        XCTAssertGreaterThan(callFiles, 3)
    }
}
