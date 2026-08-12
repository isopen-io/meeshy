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

    // MARK: - De quoi peindre une carte de brouillon

    /// Le `thumbHash` n'etait compose qu'a la PUBLICATION : un brouillon n'en
    /// avait aucun et sa carte n'avait rien a peindre. Le composer l'estampille
    /// desormais des le premier enregistrement — le resume doit le ressortir.
    func test_listDrafts_exposesTheThumbHashStampedBySave() {
        var effects = StoryEffects()
        effects.thumbHash = "ZmFrZQ=="
        store.save(draftId: "A",
                   slides: [StorySlide(id: "s", effects: effects, duration: 5)],
                   visibility: "PUBLIC")

        XCTAssertEqual(store.listDrafts().first?.thumbHash, "ZmFrZQ==")
    }

    /// Repli des brouillons ecrits AVANT l'estampillage : le fond de slide est
    /// la seule couche que tout brouillon possede.
    func test_listDrafts_withoutThumbHash_stillExposesTheBackground() throws {
        var effects = StoryEffects()
        effects.background = "1A1A2E"
        store.save(draftId: "A",
                   slides: [StorySlide(id: "s", effects: effects, duration: 5)],
                   visibility: "PUBLIC")

        let summary = try XCTUnwrap(store.listDrafts().first)
        XCTAssertNil(summary.thumbHash, "Ce brouillon precede l'estampillage")
        XCTAssertEqual(summary.backgroundHex, "1A1A2E",
                       "Sans hash, la carte doit au moins pouvoir peindre le fond")
    }

    func test_listDrafts_withNeitherHashNorBackground_hasNothingToPaint() throws {
        store.save(draftId: "A", slides: [slide("s")], visibility: "PUBLIC")
        let summary = try XCTUnwrap(store.listDrafts().first)
        XCTAssertNil(summary.thumbHash)
        XCTAssertNil(summary.backgroundHex)
    }

    /// Les trois champs se lisent sur la PREMIERE diapositive, pas sur une
    /// quelconque : c'est elle que la carte represente.
    func test_listDrafts_readsTheFirstSlideNotAnyOther() throws {
        var first = StoryEffects()
        first.background = "111111"
        first.textObjects = [StoryTextObject(id: "t1", text: "Premiere")]
        var second = StoryEffects()
        second.background = "222222"
        second.textObjects = [StoryTextObject(id: "t2", text: "Seconde")]

        store.save(draftId: "A",
                   slides: [StorySlide(id: "s1", effects: first, duration: 5),
                            StorySlide(id: "s2", effects: second, duration: 5)],
                   visibility: "PUBLIC")

        let summary = try XCTUnwrap(store.listDrafts().first)
        XCTAssertEqual(summary.backgroundHex, "111111")
        XCTAssertEqual(summary.title, "Premiere")
        XCTAssertEqual(summary.slideCount, 2)
    }

    // MARK: - Vignette (coverFileURL)

    /// La vignette représente la PREMIÈRE diapositive par position. Les ids
    /// sont choisis pour que l'ordre des slides CONTREDISE l'ordre d'index de
    /// la table média : un `LIMIT 1` sans ORDER BY suit le second et élit la
    /// mauvaise image.
    func test_listDrafts_cover_followsSlideOrder_notInsertionOrder() throws {
        store.save(draftId: "A", slides: [slide("zeta"), slide("alpha")], visibility: "PUBLIC")
        try insertImageRow(draftId: "A", elementId: "zeta", fileName: "zeta.jpg")
        try insertImageRow(draftId: "A", elementId: "alpha", fileName: "alpha.jpg")
        try writeImageFile(draftId: "A", named: "zeta.jpg")
        try writeImageFile(draftId: "A", named: "alpha.jpg")

        let cover = try XCTUnwrap(store.listDrafts().first?.coverFileURL)
        XCTAssertEqual(cover.lastPathComponent, "zeta.jpg",
                       "La vignette suit la position de la slide, pas l'ordre de la table")

        let secondInstance = StoryDraftStore(dbPath: dbPath, mediaDirectory: mediaDir)
        XCTAssertEqual(secondInstance.listDrafts().first?.coverFileURL, cover,
                       "Deux instances du store élisent la même vignette")
    }

    /// Quand le fichier élu manque sur disque, la vignette retombe sur la
    /// prochaine image encore présente — pas sur nil alors qu'une image existe.
    func test_listDrafts_cover_fallsBackToTheNextImage_whenTheElectedFileIsMissing() throws {
        store.save(draftId: "A", slides: [slide("s1"), slide("s2")], visibility: "PUBLIC")
        try insertImageRow(draftId: "A", elementId: "s1", fileName: "s1.jpg")
        try insertImageRow(draftId: "A", elementId: "s2", fileName: "s2.jpg")
        try writeImageFile(draftId: "A", named: "s2.jpg")

        XCTAssertEqual(store.listDrafts().first?.coverFileURL?.lastPathComponent, "s2.jpg",
                       "La perte du fichier élu ne doit pas priver le brouillon de vignette")
    }

    /// Les éléments qui ne correspondent à aucune slide (médias posés DANS une
    /// slide) s'ordonnent de façon stable, pas au gré du rowid.
    func test_listDrafts_cover_unlinkedElements_useAStableOrder() throws {
        store.save(draftId: "A", slides: [slide("s")], visibility: "PUBLIC")
        try insertImageRow(draftId: "A", elementId: "zz", fileName: "zz.jpg")
        try insertImageRow(draftId: "A", elementId: "aa", fileName: "aa.jpg")
        try writeImageFile(draftId: "A", named: "zz.jpg")
        try writeImageFile(draftId: "A", named: "aa.jpg")

        XCTAssertEqual(store.listDrafts().first?.coverFileURL?.lastPathComponent, "aa.jpg")
    }

    // MARK: - Reprendre puis completer un brouillon

    /// Le parcours reel : on ecrit, on ferme, on rouvre, on complete, on
    /// re-enregistre. Rien ne doit se perdre en chemin, et le brouillon ne
    /// doit jamais se dupliquer — c'est ce que garantit `adoptDraft` cote
    /// composer, dont depend cette suite.
    func test_resumingADraft_thenAddingASlide_updatesInPlace() throws {
        store.save(draftId: "A", slides: [slide("s1")], visibility: "FRIENDS")

        let reopened = try XCTUnwrap(store.load(draftId: "A"))
        XCTAssertEqual(reopened.slides.map(\.id), ["s1"])
        XCTAssertEqual(reopened.visibility, "FRIENDS")

        store.save(draftId: "A",
                   slides: reopened.slides + [slide("s2")],
                   visibility: reopened.visibility)

        XCTAssertEqual(store.listDrafts().count, 1, "Reprendre ne cree pas un second brouillon")
        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "A")).slides.map(\.id), ["s1", "s2"])
    }

    /// Reprendre un brouillon ne doit toucher ni les slides ni les medias des
    /// autres — le defaut d'origine du store mono, sous sa forme la plus
    /// couteuse pour l'utilisateur.
    func test_resumingOneDraft_leavesTheOthersIntact() throws {
        store.save(draftId: "A", slides: [slide("a1")], visibility: "PUBLIC")
        store.save(draftId: "B", slides: [slide("b1")], visibility: "PUBLIC")
        store.saveMedia(draftId: "B", images: ["e": red()], videoURLs: [:], audioURLs: [:])

        store.save(draftId: "A", slides: [slide("a1"), slide("a2")], visibility: "PUBLIC")

        XCTAssertEqual(try XCTUnwrap(store.load(draftId: "B")).slides.map(\.id), ["b1"])
        XCTAssertNotNil(store.loadMedia(draftId: "B").images["e"])
    }

    /// Publier consomme le brouillon : il ne doit pas rester dans la liste
    /// apres coup, sinon l'utilisateur republierait le meme contenu.
    func test_deletingAfterPublish_leavesTheOtherDraftsAlone() {
        store.save(draftId: "published", slides: [slide("p")], visibility: "PUBLIC")
        store.save(draftId: "kept", slides: [slide("k")], visibility: "PUBLIC")

        store.delete(draftId: "published")

        XCTAssertEqual(store.listDrafts().map(\.id), ["kept"])
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

    /// La migration copie TOUTES les meta, pas seulement `visibility` : perdre
    /// `command_history` en chemin, c'est perdre l'undo du brouillon repris.
    func test_migration_copiesCommandHistoryWithTheDraft() throws {
        let legacyDir = tempDir.appendingPathComponent("legacy-meta")
        let legacyDB = legacyDir.appendingPathComponent("legacy.db").path
        let legacyMedia = legacyDir.appendingPathComponent("media")
        try FileManager.default.createDirectory(at: legacyMedia, withIntermediateDirectories: true)
        try seedLegacyDatabase(at: legacyDB, mediaDir: legacyMedia)

        let migrated = StoryDraftStore(dbPath: legacyDB, mediaDirectory: legacyMedia)
        let id = try XCTUnwrap(migrated.listDrafts().first?.id)

        XCTAssertEqual(migrated.loadCommandHistoryBlob(draftId: id), legacyCommandHistory,
                       "L'historique undo/redo suit le brouillon migré")
        XCTAssertEqual(migrated.load(draftId: id)?.visibility, "FRIENDS")
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

    private let legacyCommandHistory = Data("legacy-history".utf8)

    /// Pose une ligne média directement en base : c'est le seul moyen de
    /// contrôler l'ordre des rowid, que `saveMedia` (dictionnaires) rendrait
    /// non déterministe — précisément ce que ces tests verrouillent.
    private func insertImageRow(draftId: String, elementId: String, fileName: String) throws {
        let queue = try DatabaseQueue(path: dbPath)
        try queue.write { db in
            try db.execute(
                sql: "INSERT INTO story_draft_media (draft_id, element_id, media_type, file_name) VALUES (?, ?, 'image', ?)",
                arguments: [draftId, elementId, fileName])
        }
    }

    private func writeImageFile(draftId: String, named fileName: String) throws {
        let dir = mediaDir.appendingPathComponent(draftId)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let data = try XCTUnwrap(red().jpegData(compressionQuality: 0.85))
        try data.write(to: dir.appendingPathComponent(fileName))
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
                sql: "INSERT INTO story_draft_meta (key, value) VALUES ('command_history', ?)",
                arguments: [legacyCommandHistory.base64EncodedString()])
            try db.execute(
                sql: "INSERT INTO story_draft_media (element_id, media_type, file_name) VALUES (?, 'image', ?)",
                arguments: ["legacy-element", "legacy-element.jpg"])
        }
        let data = try XCTUnwrap(red().jpegData(compressionQuality: 0.85))
        try data.write(to: mediaDir.appendingPathComponent("legacy-element.jpg"))
    }
}
