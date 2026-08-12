import XCTest
@testable import MeeshySDK

/// Cycle brouillon/publication (directive user 2026-08-02) : une story ne
/// quitte le brouillon QUE publiée avec confirmation serveur. Le store porte
/// donc trois métadonnées de cycle de vie par brouillon :
///   - `pendingPublishAt` : publication en cours (brouillon gelé, exclu des
///     reprises tant que la file travaille) ;
///   - `lastPublishError` : l'échec PERMANENT ramène la story en brouillon,
///     avec son erreur affichable ;
///   - `editingPostId` : un brouillon né d'une session d'ÉDITION sait quelle
///     story publiée il modifie (réouverture → mode édition, pas création).
final class StoryDraftStorePublishLifecycleTests: XCTestCase {

    private var tempRoot: URL!

    override func setUpWithError() throws {
        try super.setUpWithError()
        tempRoot = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftStorePublishLifecycleTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let tempRoot { try? FileManager.default.removeItem(at: tempRoot) }
        tempRoot = nil
        try super.tearDownWithError()
    }

    private func makeStore() -> StoryDraftStore {
        StoryDraftStore(
            dbPath: tempRoot.appendingPathComponent("drafts.db").path,
            mediaDirectory: tempRoot.appendingPathComponent("media")
        )
    }

    private func contentSlide(_ text: String = "du contenu") -> StorySlide {
        var slide = StorySlide()
        slide.content = text
        return slide
    }

    // MARK: - pendingPublishAt

    func test_markPendingPublish_stampsTheDraft_visibleInListAndLoad() throws {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")
        let stamp = Date(timeIntervalSince1970: 1_760_000_000)

        XCTAssertTrue(store.markPendingPublish(draftId: "d1", at: stamp))

        let summary = try XCTUnwrap(store.listDrafts().first { $0.id == "d1" })
        XCTAssertEqual(summary.pendingPublishAt, stamp,
                       "La liste doit savoir que ce brouillon est en cours de publication")
        let stored = try XCTUnwrap(store.load(draftId: "d1"))
        XCTAssertEqual(stored.pendingPublishAt, stamp)
    }

    func test_markPendingPublish_supersedesThePreviousPublishError() throws {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")
        store.recordPublishFailure(draftId: "d1", message: "Serveur injoignable")

        store.markPendingPublish(draftId: "d1")

        let stored = try XCTUnwrap(store.load(draftId: "d1"))
        XCTAssertNil(stored.lastPublishError,
                     "Une nouvelle tentative de publication rend l'ancienne erreur caduque")
        XCTAssertNotNil(stored.pendingPublishAt)
    }

    // MARK: - lastPublishError

    func test_recordPublishFailure_liftsPendingAndExposesTheError() throws {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")
        store.markPendingPublish(draftId: "d1")

        XCTAssertTrue(store.recordPublishFailure(draftId: "d1", message: "Rejet serveur (validation)"))

        let summary = try XCTUnwrap(store.listDrafts().first { $0.id == "d1" })
        XCTAssertNil(summary.pendingPublishAt,
                     "Un échec permanent REND le brouillon : il n'est plus « en publication »")
        XCTAssertEqual(summary.lastPublishError, "Rejet serveur (validation)")
        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "d1")).lastPublishError,
                       "Rejet serveur (validation)")
    }

    func test_clearPendingPublish_liftsThePendingMarkerWithoutFabricatingAnError() throws {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")
        store.markPendingPublish(draftId: "d1")

        // Annulation utilisateur : le brouillon redevient éditable, sans
        // erreur fabriquée (il n'y a pas eu d'échec).
        XCTAssertTrue(store.clearPendingPublish(draftId: "d1"))

        let stored = try XCTUnwrap(store.load(draftId: "d1"))
        XCTAssertNil(stored.pendingPublishAt)
        XCTAssertNil(stored.lastPublishError)
    }

    // MARK: - Les autosaves ne piétinent pas le cycle de vie

    func test_save_preservesPendingAndErrorMetadata() throws {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")
        store.markPendingPublish(draftId: "d1")

        store.save(draftId: "d1", slides: [contentSlide("édité")], visibility: "FRIENDS")

        let afterPending = try XCTUnwrap(store.load(draftId: "d1"))
        XCTAssertNotNil(afterPending.pendingPublishAt,
                        "Un save (autosave, gel de hand-off) ne lève JAMAIS le marqueur de publication")

        store.recordPublishFailure(draftId: "d1", message: "Réseau")
        store.save(draftId: "d1", slides: [contentSlide("amélioré")], visibility: "FRIENDS")

        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "d1")).lastPublishError, "Réseau",
                       "L'erreur reste affichée tant qu'une republication ne la supplante pas")
    }

    // MARK: - editingPostId

    func test_save_withEditingPostId_roundTripsThroughLoadListAndAccessor() throws {
        let store = makeStore()
        store.save(draftId: "edit-1", slides: [contentSlide()], visibility: "PUBLIC",
                   editingPostId: "post-42")

        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "edit-1")).editingPostId, "post-42")
        XCTAssertEqual(try XCTUnwrap(store.listDrafts().first { $0.id == "edit-1" }).editingPostId,
                       "post-42")
        XCTAssertEqual(store.draftEditingPostId("edit-1"), "post-42",
                       "L'accesseur léger sert au routage de réouverture sans charger les slides")
    }

    func test_save_withoutEditingPostId_clearsTheStaleKey() throws {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC",
                   editingPostId: "post-42")

        // Même patron que `visibilityUserIds`/`originalLanguage` : une valeur
        // absente EFFACE la clé — un brouillon détaché de sa story éditée
        // (story supprimée, session redevenue création) ne garde pas le lien.
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")

        XCTAssertNil(try XCTUnwrap(store.load(draftId: "d1")).editingPostId)
        XCTAssertNil(store.draftEditingPostId("d1"))
    }

    // MARK: - delete emporte le cycle de vie

    func test_delete_removesLifecycleMetadataWithTheDraft() {
        let store = makeStore()
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC",
                   editingPostId: "post-42")
        store.markPendingPublish(draftId: "d1")

        store.delete(draftId: "d1")

        // Ré-écrire sous le même id ne doit pas ressusciter l'ancien cycle.
        store.save(draftId: "d1", slides: [contentSlide()], visibility: "PUBLIC")
        XCTAssertNil(store.load(draftId: "d1")?.pendingPublishAt)
        XCTAssertNil(store.load(draftId: "d1")?.editingPostId)
    }
}
