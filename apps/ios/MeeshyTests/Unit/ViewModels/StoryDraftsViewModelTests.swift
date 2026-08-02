import XCTest
@testable import Meeshy
import MeeshySDK

// MARK: - StoryDraftsViewModelTests
//
// Inventaire des brouillons pour l'onglet « Brouillons » : chargement
// explicite (jamais dans un `body`), relecture au retour en avant-plan,
// suppression optimiste suivie d'une relecture du store.
//
// Chaque test travaille sur un `StoryDraftStore` TEMPORAIRE
// (`init(dbPath:mediaDirectory:)`) — jamais le singleton, dont la base vit
// dans le conteneur réel de l'app.
@MainActor
final class StoryDraftsViewModelTests: XCTestCase {

    private var tempRoot: URL!

    override func setUp() async throws {
        try await super.setUp()
        tempRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftsViewModelTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    }

    override func tearDown() async throws {
        if let tempRoot { try? FileManager.default.removeItem(at: tempRoot) }
        tempRoot = nil
        try await super.tearDown()
    }

    // MARK: - Factories

    private func makeStore() -> StoryDraftStore {
        StoryDraftStore(
            dbPath: tempRoot.appendingPathComponent("drafts.db").path,
            mediaDirectory: tempRoot.appendingPathComponent("media")
        )
    }

    @discardableResult
    private func seedDraft(in store: StoryDraftStore, id: String = UUID().uuidString) -> String {
        store.save(
            draftId: id,
            slides: [StorySlide(content: "brouillon")],
            visibility: "PUBLIC"
        )
        return id
    }

    // MARK: - reload

    func test_reload_readsDraftsFromStore() {
        let store = makeStore()
        let draftId = seedDraft(in: store)
        let sut = StoryDraftsViewModel(store: store, observeForeground: false)

        XCTAssertTrue(sut.drafts.isEmpty, "Pas de lecture disque implicite à l'init")
        sut.reload()

        XCTAssertEqual(sut.drafts.map(\.id), [draftId])
    }

    // MARK: - Retour en avant-plan

    func test_foregroundNotification_reloadsDrafts() {
        let store = makeStore()
        let sut = StoryDraftsViewModel(store: store, observeForeground: true)
        sut.reload()
        XCTAssertTrue(sut.drafts.isEmpty)

        // Un brouillon apparaît pendant que l'app était en arrière-plan
        // (autosave d'une extension, autre scène iPad…).
        let draftId = seedDraft(in: store)
        NotificationCenter.default.post(name: UIApplication.willEnterForegroundNotification, object: nil)

        XCTAssertEqual(sut.drafts.map(\.id), [draftId], "Le retour en avant-plan doit relire le store")
    }

    func test_foregroundNotification_withoutObservation_doesNotReload() {
        let store = makeStore()
        let sut = StoryDraftsViewModel(store: store, observeForeground: false)
        seedDraft(in: store)

        NotificationCenter.default.post(name: UIApplication.willEnterForegroundNotification, object: nil)

        XCTAssertTrue(sut.drafts.isEmpty, "observeForeground: false ne doit poser AUCUN abonnement")
    }

    // MARK: - Suppression

    func test_delete_removesFromListAndFromStore() {
        let store = makeStore()
        let keptId = seedDraft(in: store)
        let deletedId = seedDraft(in: store)
        let sut = StoryDraftsViewModel(store: store, observeForeground: false)
        sut.reload()
        XCTAssertEqual(Set(sut.drafts.map(\.id)), [keptId, deletedId])

        sut.delete(deletedId)

        XCTAssertEqual(sut.drafts.map(\.id), [keptId], "La ligne disparaît de la liste")
        XCTAssertEqual(store.listDrafts().map(\.id), [keptId], "Le store ne relit plus le brouillon supprimé")
    }

    func test_delete_unknownId_keepsExistingDrafts() {
        let store = makeStore()
        let keptId = seedDraft(in: store)
        let sut = StoryDraftsViewModel(store: store, observeForeground: false)
        sut.reload()

        sut.delete("unknown-id")

        XCTAssertEqual(sut.drafts.map(\.id), [keptId])
    }
}
