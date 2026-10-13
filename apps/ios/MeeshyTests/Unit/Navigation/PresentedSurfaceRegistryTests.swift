import XCTest
@testable import Meeshy

/// Le registre des surfaces présentées (#10539) : ce qui se referme devant une
/// conversation, ce qui retient, et dans quel ordre.
@MainActor
final class PresentedSurfaceRegistryTests: XCTestCase {

    private final class Journal {
        var closed: [PresentedSurfaceKind] = []
        var openings: [Bool] = []
    }

    private func declare(_ kind: PresentedSurfaceKind,
                         in registry: PresentedSurfaceRegistry,
                         journal: Journal,
                         answer: PresentedSurfaceYield = .closes) -> PresentedSurfaceToken {
        registry.declare(kind, answer: { answer }) { journal.closed.append(kind) }
    }

    func test_clearForConversation_nothingDeclared_opensWithoutClosing() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()

        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.openings, [false])
    }

    func test_clearForConversation_everyClosingFamily_closesThenOpens() {
        for kind in PresentedSurfaceKind.allCases {
            let registry = PresentedSurfaceRegistry()
            let journal = Journal()
            _ = declare(kind, in: registry, journal: journal)

            registry.clearForConversation { journal.openings.append($0) }

            XCTAssertEqual(journal.closed, [kind], "\(kind) ne s'est pas refermée")
            XCTAssertEqual(journal.openings, [true], "\(kind) : la conversation ne s'est pas ouverte")
            XCTAssertTrue(registry.declaredKinds.isEmpty)
        }
    }

    func test_clearForConversation_stackedSurfaces_closesFromTheBottomUp() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        _ = declare(.reels, in: registry, journal: journal)
        _ = declare(.storyViewer, in: registry, journal: journal)
        _ = declare(.mediaGallery, in: registry, journal: journal)

        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.closed, [.reels, .storyViewer, .mediaGallery])
        XCTAssertEqual(journal.openings, [true])
    }

    func test_clearForConversation_closedSurface_isNotClosedTwice() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        _ = declare(.storyViewer, in: registry, journal: journal)

        registry.clearForConversation { _ in }
        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.closed, [.storyViewer])
        XCTAssertEqual(journal.openings, [false])
    }

    func test_clearForConversation_closeRetiresItsOwnToken_opensOnce() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        var token: PresentedSurfaceToken?
        token = registry.declare(.reels, answer: { .closes }) {
            journal.closed.append(.reels)
            if let token { registry.retire(token) }
        }

        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.closed, [.reels])
        XCTAssertEqual(journal.openings, [true])
        XCTAssertNotNil(token)
    }

    func test_retire_surfaceGone_isNoLongerClosed() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        let token = declare(.storyViewer, in: registry, journal: journal)

        registry.retire(token)
        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertTrue(journal.closed.isEmpty)
        XCTAssertEqual(journal.openings, [false])
    }

    // MARK: - Ce qui retient

    func test_clearForConversation_retainingComposer_staysAndDefersTheOpening() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        _ = declare(.composer, in: registry, journal: journal, answer: .retains)

        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertTrue(journal.closed.isEmpty)
        XCTAssertTrue(journal.openings.isEmpty)
        XCTAssertEqual(registry.declaredKinds, [.composer])
    }

    func test_clearForConversation_retainerAboveASurface_keepsWhatIsBeneathIt() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        _ = declare(.storyViewer, in: registry, journal: journal)
        _ = declare(.composer, in: registry, journal: journal, answer: .retains)
        _ = declare(.mediaGallery, in: registry, journal: journal)

        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.closed, [.mediaGallery])
        XCTAssertEqual(registry.declaredKinds, [.storyViewer, .composer])
        XCTAssertTrue(journal.openings.isEmpty)
    }

    func test_retire_retainerLeaves_closesTheRestAndOpens() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        _ = declare(.storyViewer, in: registry, journal: journal)
        let composer = declare(.composer, in: registry, journal: journal, answer: .retains)
        registry.clearForConversation { journal.openings.append($0) }

        registry.retire(composer)

        XCTAssertEqual(journal.closed, [.storyViewer])
        XCTAssertEqual(journal.openings, [true])
    }

    func test_retire_retainerLeavesTooLate_forgetsTheOpening() {
        var clock = Date(timeIntervalSince1970: 1_000)
        let registry = PresentedSurfaceRegistry(now: { clock }, awaitingValidity: 120)
        let journal = Journal()
        let composer = declare(.composer, in: registry, journal: journal, answer: .retains)
        registry.clearForConversation { journal.openings.append($0) }

        clock = clock.addingTimeInterval(121)
        registry.retire(composer)

        XCTAssertTrue(journal.openings.isEmpty)
    }

    func test_clearForConversation_secondRequestWhileRetained_onlyTheLatestOpens() {
        let registry = PresentedSurfaceRegistry()
        var opened: [String] = []
        let composer = registry.declare(.composer, answer: { .retains }) {}
        registry.clearForConversation { _ in opened.append("première") }
        registry.clearForConversation { _ in opened.append("seconde") }

        registry.retire(composer)

        XCTAssertEqual(opened, ["seconde"])
    }

    func test_clearForConversation_yieldIsReadAtRequestTime() {
        let registry = PresentedSurfaceRegistry()
        let journal = Journal()
        var stance = PresentedSurfaceYield.retains
        _ = registry.declare(.composer, answer: { stance }) { journal.closed.append(.composer) }

        stance = .closes
        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.closed, [.composer])
        XCTAssertEqual(journal.openings, [true])
    }

    // MARK: - Le composer

    func test_composerYield_blankDoor_closes() {
        XCTAssertEqual(ComposerConversationYield.decide(.restores), .closes)
    }

    func test_composerYield_seededOrAtelierDoor_retains() {
        XCTAssertEqual(ComposerConversationYield.decide(.preservesStoredDraft), .retains)
        XCTAssertEqual(ComposerConversationYield.decide(.disabled), .retains)
    }
}
