import XCTest
import MeeshyUI
@testable import Meeshy

/// Le registre des surfaces présentées (#10539) : ce qui se referme devant une
/// conversation, ce qui retient, et dans quel ordre.
@MainActor
final class PresentedSurfaceRegistryTests: XCTestCase {

    private final class Journal {
        var closed: [PresentedSurfaceKind] = []
        var openings: [Bool] = []
    }

    private final class Stance {
        var answer: PresentedSurfaceYield = .retains
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
        let stance = Stance()
        _ = registry.declare(.composer, answer: { stance.answer }) { journal.closed.append(.composer) }

        stance.answer = .closes
        registry.clearForConversation { journal.openings.append($0) }

        XCTAssertEqual(journal.closed, [.composer])
        XCTAssertEqual(journal.openings, [true])
    }

    // MARK: - Le composer

    func test_composerYield_blankDoor_closes() {
        XCTAssertEqual(ComposerConversationYield.decide(.restores), .closes)
    }

    func test_composerYield_seededOrHydratedDoor_retains() {
        XCTAssertEqual(ComposerConversationYield.decide(.preservesStoredDraft), .retains)
        XCTAssertEqual(ComposerConversationYield.decide(.disabled), .retains)
    }

    // MARK: - Le brouillon repris ne retient pas (#10543, #15629)

    /// Le brouillon REPRIS et l'édition d'une story s'écrivent au même
    /// `flushAutosave()` que la porte vierge : le meuble referme sans rien perdre.
    func test_composerYield_storedDraftKept_closes() {
        XCTAssertEqual(ComposerConversationYield.decide(.disabled, keepsStoredDraft: true), .closes)
        XCTAssertEqual(ComposerConversationYield.decide(.preservesStoredDraft, keepsStoredDraft: true), .closes)
    }

    // MARK: - Une fenêtre ne referme que ses surfaces (#10543)

    func test_clearForConversation_surfaceOfAnotherWindow_staysPresented() {
        let registry = PresentedSurfaceRegistry()
        let here = PresentedSurfaceScope()
        let elsewhere = PresentedSurfaceScope()
        var closed: [String] = []
        var openings: [Bool] = []
        _ = registry.declare(.storyViewer, scope: here, answer: { .closes }, close: { closed.append("ici") })
        _ = registry.declare(.sheet, scope: elsewhere, answer: { .closes }, close: { closed.append("ailleurs") })

        registry.clearForConversation(in: here) { openings.append($0) }

        XCTAssertEqual(closed, ["ici"])
        XCTAssertEqual(openings, [true])
        XCTAssertEqual(registry.declaredKinds, [.sheet])
    }

    func test_clearForConversation_surfaceWithoutAWindow_closesForAnyWindow() {
        let registry = PresentedSurfaceRegistry()
        var closed = 0
        _ = registry.declare(.place, scope: nil, answer: { .closes }, close: { closed += 1 })

        registry.clearForConversation(in: PresentedSurfaceScope()) { _ in }

        XCTAssertEqual(closed, 1)
        XCTAssertTrue(registry.declaredKinds.isEmpty)
    }

    func test_clearForConversation_retainerInAnotherWindow_doesNotDeferThisOne() {
        let registry = PresentedSurfaceRegistry()
        let here = PresentedSurfaceScope()
        var openings: [Bool] = []
        _ = registry.declare(.game, scope: PresentedSurfaceScope(), answer: { .retains }, close: {})

        registry.clearForConversation(in: here) { openings.append($0) }

        XCTAssertEqual(openings, [false])
        XCTAssertEqual(registry.declaredKinds, [.game])
    }

    func test_retire_retainerOfAWindow_resumesOnlyThatWindowOpening() {
        let registry = PresentedSurfaceRegistry()
        let here = PresentedSurfaceScope()
        let elsewhere = PresentedSurfaceScope()
        var opened: [String] = []
        let game = registry.declare(.game, scope: here, answer: { .retains }, close: {})
        let composer = registry.declare(.composer, scope: elsewhere, answer: { .retains }, close: {})
        registry.clearForConversation(in: here) { _ in opened.append("ici") }
        registry.clearForConversation(in: elsewhere) { _ in opened.append("ailleurs") }

        registry.retire(game)

        XCTAssertEqual(opened, ["ici"])

        registry.retire(composer)

        XCTAssertEqual(opened, ["ici", "ailleurs"])
    }
}
