import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #13415 — un post accepté par la FILE n'efface pas son brouillon : il passe
/// dans le tiroir de sa publication, d'où « Rouvrir en brouillon » le rend au
/// meuble, et qui ne part qu'avec la ligne.
@MainActor
final class ComposerAutosaveParkingTests: XCTestCase {

    private func makeStore() -> ComposerAutosaveStore {
        let racine = FileManager.default.temporaryDirectory
            .appendingPathComponent("autosave-parking-\(UUID().uuidString)", isDirectory: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: racine) }
        return ComposerAutosaveStore(root: racine.appendingPathComponent("drafts"),
                                     sessionRoot: racine.appendingPathComponent("session"))
    }

    private let account = ComposerAutosaveAccount(userId: "u1", serverOrigin: "https://staging.meeshy.me")!

    private func makeState(text: String) -> ComposerAutosaveState {
        var slide = StorySlide(id: "s1")
        slide.content = text
        return ComposerAutosaveState(
            format: .post, text: text, background: nil,
            visibility: PostVisibility.public.rawValue, visibilityUserIds: [],
            language: "fr", location: nil, references: [],
            editingPostId: nil, slides: [slide], currentSlideIndex: 0, porters: .empty,
            images: [:], slideImages: [:], videos: [:], audios: [:], stickerAnimations: [:])
    }

    func test_park_movesTheCreationIntoThePublicationsDrawer_andNothingWritesAfter() throws {
        let store = makeStore()
        let controller = ComposerAutosaveController(store: store, debounceNanoseconds: 10_000_000)
        _ = controller.bind(account: account, opening: .restores)
        controller.flushNow { self.makeState(text: "Mon post") }

        controller.park(publicationId: "cmid_1")
        controller.flushNow { self.makeState(text: "écriture tardive") }
        store.waitForPendingWrites()

        XCTAssertFalse(store.hasDraft(account: account, slot: .creation))
        let gardé = try XCTUnwrap(store.load(account: account, slot: .publication("cmid_1")))
        XCTAssertEqual(ComposerAutosaveCodec.state(from: gardé)?.text, "Mon post")
        XCTAssertEqual(store.publicationSlots(account: account).compactMap(\.publicationId), ["cmid_1"])
    }

    func test_reopen_givesTheKeptDraftBackToTheCreation() throws {
        let store = makeStore()
        store.save(ComposerAutosaveCodec.write(from: makeState(text: "Repris")), account: account,
                   slot: .publication("cmid_2"))
        let drafts = ComposerUnsentPublicationDrafts(store: store, account: { self.account })

        XCTAssertTrue(drafts.canReopen())
        drafts.reopen("cmid_2")

        let repris = try XCTUnwrap(store.load(account: account, slot: .creation))
        XCTAssertEqual(ComposerAutosaveCodec.state(from: repris)?.text, "Repris")
        XCTAssertTrue(drafts.parkedPublicationIds().isEmpty)
        XCTAssertFalse(drafts.canReopen(), "la création porte désormais ce brouillon")
    }

    func test_handoff_isTakenOnce() {
        ComposerPublicationHandoff.record("cmid_3")
        XCTAssertEqual(ComposerPublicationHandoff.take(), "cmid_3")
        XCTAssertNil(ComposerPublicationHandoff.take())
    }
}
