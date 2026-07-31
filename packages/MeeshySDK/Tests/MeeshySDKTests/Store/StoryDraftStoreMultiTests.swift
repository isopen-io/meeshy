import XCTest
import GRDB
@testable import MeeshySDK

/// `StoryDraftStore` devient multi-brouillon (spec 2026-08-01).
///
/// Il était mono par construction : `save` ouvrait par un
/// `DELETE FROM story_draft_slide`, `saveMedia` vidait la table ET le
/// répertoire, et aucune table ne portait d'identifiant de brouillon.
/// Commencer une deuxième story écrasait silencieusement la première — c'est
/// le défaut que cette suite verrouille.
final class StoryDraftStoreMultiTests: XCTestCase {

    private var tempDir: URL!
    private var dbPath: String!
    private var mediaDir: URL!
    private var store: StoryDraftStore!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftStoreMultiTests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        dbPath = tempDir.appendingPathComponent("test.db").path
        mediaDir = tempDir.appendingPathComponent("media")
        store = StoryDraftStore(dbPath: dbPath, mediaDirectory: mediaDir)
    }

    override func tearDown() {
        store = nil
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - Le défaut corrigé

    func test_twoDrafts_coexist_eachKeepingItsOwnSlides() throws {
        store.save(draftId: "A", slides: [slide("a1"), slide("a2")], visibility: "PUBLIC")
        store.save(draftId: "B", slides: [slide("b1")], visibility: "FRIENDS")

        let a = try XCTUnwrap(store.load(draftId: "A"))
        let b = try XCTUnwrap(store.load(draftId: "B"))

        XCTAssertEqual(a.slides.map(\.id), ["a1", "a2"],
                       "Écrire le brouillon B ne doit pas effacer les slides de A")
        XCTAssertEqual(a.visibility, "PUBLIC")
        XCTAssertEqual(b.slides.map(\.id), ["b1"])
        XCTAssertEqual(b.visibility, "FRIENDS")
    }

    func test_savingOneDraft_doesNotTouchAnotherDraftMedia() throws {
        store.saveMedia(draftId: "A", images: ["e1": red()], videoURLs: [:], audioURLs: [:])
        store.saveMedia(draftId: "B", images: ["e2": red()], videoURLs: [:], audioURLs: [:])

        XCTAssertNotNil(store.loadMedia(draftId: "A").images["e1"],
                        "Enregistrer les médias de B ne doit pas vider le répertoire de A")
        XCTAssertNotNil(store.loadMedia(draftId: "B").images["e2"])
    }

    /// Deux brouillons peuvent porter le MÊME `element_id` — c'est le cas dès
    /// qu'on duplique un brouillon ou qu'on reprend un échec de publication.
    /// Sans partition par brouillon, l'`INSERT OR REPLACE` déplaçait la ligne
    /// d'un brouillon à l'autre.
    func test_sameElementIdInTwoDrafts_staysInBothDrafts() {
        store.saveMedia(draftId: "A", images: ["shared": red()], videoURLs: [:], audioURLs: [:])
        store.saveMedia(draftId: "B", images: ["shared": red()], videoURLs: [:], audioURLs: [:])

        XCTAssertNotNil(store.loadMedia(draftId: "A").images["shared"])
        XCTAssertNotNil(store.loadMedia(draftId: "B").images["shared"])
    }

    func test_sameSlideIdInTwoDrafts_staysInBothDrafts() throws {
        store.save(draftId: "A", slides: [slide("shared")], visibility: "PUBLIC")
        store.save(draftId: "B", slides: [slide("shared")], visibility: "PUBLIC")

        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "A")).slides.count, 1)
        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "B")).slides.count, 1)
    }

    func test_commandHistoryBlob_isPerDraft() {
        store.saveCommandHistoryBlob(Data([1, 2, 3]), draftId: "A")
        store.saveCommandHistoryBlob(Data([9]), draftId: "B")

        XCTAssertEqual(store.loadCommandHistoryBlob(draftId: "A"), Data([1, 2, 3]))
        XCTAssertEqual(store.loadCommandHistoryBlob(draftId: "B"), Data([9]))
    }

    // MARK: - Inventaire

    func test_listDrafts_isEmptyOnAFreshStore() {
        XCTAssertTrue(store.listDrafts().isEmpty)
        XCTAssertTrue(store.isEmpty())
    }

    func test_listDrafts_countsSlidesAndSortsByMostRecentlyUpdated() {
        store.save(draftId: "old", slides: [slide("s1")], visibility: "PUBLIC")
        store.save(draftId: "recent", slides: [slide("s2"), slide("s3")], visibility: "PUBLIC")

        let drafts = store.listDrafts()

        XCTAssertEqual(drafts.map(\.id), ["recent", "old"],
                       "Le plus récemment modifié vient en tête")
        XCTAssertEqual(drafts.first?.slideCount, 2)
        XCTAssertEqual(drafts.last?.slideCount, 1)
    }

    func test_resavingADraft_movesItBackToTheTop() {
        store.save(draftId: "A", slides: [slide("a")], visibility: "PUBLIC")
        store.save(draftId: "B", slides: [slide("b")], visibility: "PUBLIC")
        store.save(draftId: "A", slides: [slide("a"), slide("a2")], visibility: "PUBLIC")

        XCTAssertEqual(store.listDrafts().map(\.id), ["A", "B"])
    }

    func test_listDrafts_derivesTitleFromTheFirstTextObject() {
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t", text: "Bonjour le monde")]
        store.save(draftId: "A",
                   slides: [StorySlide(id: "s", effects: effects, duration: 5)],
                   visibility: "PUBLIC")

        XCTAssertEqual(store.listDrafts().first?.title, "Bonjour le monde")
    }

    func test_listDrafts_hasNoTitleWithoutAnyText() {
        store.save(draftId: "A", slides: [slide("s")], visibility: "PUBLIC")
        XCTAssertNil(store.listDrafts().first?.title)
    }

    // MARK: - Suppression

    func test_delete_removesOnlyItsOwnDraftAndMedia() throws {
        store.save(draftId: "A", slides: [slide("a")], visibility: "PUBLIC")
        store.save(draftId: "B", slides: [slide("b")], visibility: "PUBLIC")
        store.saveMedia(draftId: "A", images: ["e1": red()], videoURLs: [:], audioURLs: [:])
        store.saveMedia(draftId: "B", images: ["e2": red()], videoURLs: [:], audioURLs: [:])
        store.saveCommandHistoryBlob(Data([7]), draftId: "A")

        store.delete(draftId: "A")

        XCTAssertNil(store.load(draftId: "A"))
        XCTAssertTrue(store.loadMedia(draftId: "A").isEmpty)
        XCTAssertNil(store.loadCommandHistoryBlob(draftId: "A"))
        XCTAssertEqual(store.listDrafts().map(\.id), ["B"])
        XCTAssertNotNil(store.loadMedia(draftId: "B").images["e2"],
                        "Supprimer A ne doit pas emporter les médias de B")
    }

    func test_clear_removesEveryDraft() {
        store.save(draftId: "A", slides: [slide("a")], visibility: "PUBLIC")
        store.save(draftId: "B", slides: [slide("b")], visibility: "PUBLIC")

        store.clear()

        XCTAssertTrue(store.listDrafts().isEmpty)
        XCTAssertTrue(store.isEmpty())
    }

    // MARK: - Migration depuis le schéma mono

    /// Une base au schéma d'origine, peuplée, doit être relue comme un
    /// brouillon unique — médias compris. Perdre le brouillon en cours à la
    /// mise à jour serait exactement le grief qu'on traite.
    func test_legacySingleDraftDatabase_isMigratedToOneDraft() throws {
        let legacyDir = tempDir.appendingPathComponent("legacy")
        let legacyDB = legacyDir.appendingPathComponent("legacy.db").path
        let legacyMedia = legacyDir.appendingPathComponent("media")
        try FileManager.default.createDirectory(at: legacyMedia, withIntermediateDirectories: true)
        try seedLegacyDatabase(at: legacyDB, mediaDir: legacyMedia)

        let migrated = StoryDraftStore(dbPath: legacyDB, mediaDirectory: legacyMedia)
        let drafts = migrated.listDrafts()

        XCTAssertEqual(drafts.count, 1, "Le brouillon en cours survit à la migration")
        let id = try XCTUnwrap(drafts.first?.id)
        let loaded = try XCTUnwrap(migrated.load(draftId: id))
        XCTAssertEqual(loaded.slides.map(\.id), ["legacy-slide"])
        XCTAssertEqual(loaded.visibility, "FRIENDS")
        XCTAssertNotNil(migrated.loadMedia(draftId: id).images["legacy-element"],
                        "Les fichiers médias suivent le brouillon dans son sous-répertoire")
    }

    func test_migration_isIdempotent() throws {
        let legacyDir = tempDir.appendingPathComponent("legacy2")
        let legacyDB = legacyDir.appendingPathComponent("legacy.db").path
        let legacyMedia = legacyDir.appendingPathComponent("media")
        try FileManager.default.createDirectory(at: legacyMedia, withIntermediateDirectories: true)
        try seedLegacyDatabase(at: legacyDB, mediaDir: legacyMedia)

        _ = StoryDraftStore(dbPath: legacyDB, mediaDirectory: legacyMedia)
        let second = StoryDraftStore(dbPath: legacyDB, mediaDirectory: legacyMedia)

        XCTAssertEqual(second.listDrafts().count, 1,
                       "Rouvrir la base ne doit pas re-migrer ni dupliquer le brouillon")
    }

    // MARK: - Harnais

    private func slide(_ id: String) -> StorySlide {
        StorySlide(id: id, effects: StoryEffects(), duration: 5)
    }

    private func red() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { ctx in
            UIColor.red.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    /// Reproduit le schéma MONO d'origine, tel qu'il existe sur les appareils
    /// déjà installés, et y pose un brouillon complet.
    private func seedLegacyDatabase(at path: String, mediaDir: URL) throws {
        let queue = try DatabaseQueue(path: path)
        try queue.write { db in
            try db.execute(sql: """
                CREATE TABLE story_draft_slide (
                  id TEXT PRIMARY KEY, order_index INTEGER NOT NULL, content TEXT,
                  effects_json TEXT NOT NULL, media_url TEXT,
                  duration DOUBLE NOT NULL, updated_at DOUBLE NOT NULL)
                """)
            try db.execute(sql: "CREATE TABLE story_draft_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
            try db.execute(sql: """
                CREATE TABLE story_draft_media (
                  element_id TEXT PRIMARY KEY, media_type TEXT NOT NULL, file_name TEXT NOT NULL)
                """)

            let effects = try JSONEncoder().encode(StoryEffects())
            try db.execute(
                sql: """
                INSERT INTO story_draft_slide (id, order_index, content, effects_json, media_url, duration, updated_at)
                VALUES (?, 0, NULL, ?, NULL, 5, ?)
                """,
                arguments: ["legacy-slide",
                            String(data: effects, encoding: .utf8)!,
                            Date().timeIntervalSince1970])
            try db.execute(sql: "INSERT INTO story_draft_meta (key, value) VALUES ('visibility', 'FRIENDS')")
            try db.execute(
                sql: "INSERT INTO story_draft_media (element_id, media_type, file_name) VALUES (?, 'image', ?)",
                arguments: ["legacy-element", "legacy-element.jpg"])
        }
        let data = try XCTUnwrap(red().jpegData(compressionQuality: 0.85))
        try data.write(to: mediaDir.appendingPathComponent("legacy-element.jpg"))
    }
}
