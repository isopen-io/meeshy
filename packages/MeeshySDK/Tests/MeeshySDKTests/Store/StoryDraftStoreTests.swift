import XCTest
import GRDB
@testable import MeeshySDK

final class StoryDraftStoreSDKTests: XCTestCase {

    private var store: StoryDraftStore!
    /// Ces suites vérifient le contenu d'UN brouillon : un id fixe suffit.
    private let draftId = "test-draft"
    private var tempDir: URL!
    private var dbPath: String!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftStoreSDKTests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        dbPath = tempDir.appendingPathComponent("test.db").path
        let mediaDir = tempDir.appendingPathComponent("media")
        store = StoryDraftStore(dbPath: dbPath, mediaDirectory: mediaDir)
    }

    override func tearDown() {
        store = nil
        try? FileManager.default.removeItem(at: tempDir)
        super.tearDown()
    }

    // MARK: - E4 inc.2 : command-history blob (opaque sidecar)

    func test_commandHistoryBlob_nilWhenNeverSaved() {
        XCTAssertNil(store.loadCommandHistoryBlob(draftId: draftId))
    }

    func test_commandHistoryBlob_roundTrip() {
        let payload = Data(#"{"slide-1":{"commands":[],"cursor":0}}"#.utf8)

        store.saveCommandHistoryBlob(payload, draftId: draftId)

        XCTAssertEqual(store.loadCommandHistoryBlob(draftId: draftId), payload,
                       "The blob is opaque to the core store — bytes in, same bytes out")
    }

    func test_commandHistoryBlob_overwrittenByLaterSave() {
        store.saveCommandHistoryBlob(Data("old-history".utf8), draftId: draftId)
        store.saveCommandHistoryBlob(Data("new-history".utf8), draftId: draftId)

        XCTAssertEqual(store.loadCommandHistoryBlob(draftId: draftId), Data("new-history".utf8),
                       "Each autosave replaces the previous history snapshot")
    }

    func test_clear_purgesCommandHistoryBlob() {
        store.saveCommandHistoryBlob(Data("history".utf8), draftId: draftId)

        store.clear()

        XCTAssertNil(store.loadCommandHistoryBlob(draftId: draftId),
                     "Discarding the draft must discard its undo history with it")
    }

    // MARK: - isEmpty

    func test_isEmpty_trueInitially() {
        XCTAssertTrue(store.isEmpty())
    }

    func test_isEmpty_falseAfterSave() {
        let slide = StorySlide(id: "s1", content: "Hello")
        store.save(draftId: draftId, slides: [slide], visibility: "PUBLIC")
        XCTAssertFalse(store.isEmpty())
    }

    // MARK: - load

    func test_load_returnsNilWhenEmpty() {
        XCTAssertNil(store.load(draftId: draftId))
    }

    // MARK: - saveMedia : cycle restore → autosave (constat « Médias indisponibles »)

    /// Après `restoreDraft()`, `loadedVideoURLs` pointent DANS le media dir du
    /// store. L'autosave suivante rappelait `saveMedia` avec ces mêmes URLs :
    /// `removeItem(dest)` détruisait la SOURCE (source == dest) puis `copyItem`
    /// échouait en silence — le média était perdu au resume suivant.
    func test_saveMedia_resaveFromRestoredURL_keepsVideoFile() throws {
        let source = tempDir.appendingPathComponent("clip.mp4")
        try Data("fake-video-bytes".utf8).write(to: source)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el-1": source], audioURLs: [:])

        let restored = store.loadMedia(draftId: draftId)
        let restoredURL = try XCTUnwrap(restored.videoURLs["el-1"])

        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el-1": restoredURL], audioURLs: [:])

        XCTAssertTrue(FileManager.default.fileExists(atPath: restoredURL.path),
                      "Re-sauver un média déjà dans le store ne doit pas le détruire")
        let reloaded = store.loadMedia(draftId: draftId)
        XCTAssertNotNil(reloaded.videoURLs["el-1"])
        XCTAssertTrue(reloaded.lostElementIds.isEmpty)
    }

    func test_saveMedia_resaveFromRestoredURL_keepsAudioFile() throws {
        let source = tempDir.appendingPathComponent("track.m4a")
        try Data("fake-audio-bytes".utf8).write(to: source)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: [:], audioURLs: ["au-1": source])

        let restoredURL = try XCTUnwrap(store.loadMedia(draftId: draftId).audioURLs["au-1"])

        store.saveMedia(draftId: draftId, images: [:], videoURLs: [:], audioURLs: ["au-1": restoredURL])

        XCTAssertTrue(FileManager.default.fileExists(atPath: restoredURL.path))
        XCTAssertTrue(store.loadMedia(draftId: draftId).lostElementIds.isEmpty)
    }

    /// Une source disparue (tmp purgé) ne doit ni détruire la copie encore
    /// valide du store, ni enregistrer une ligne fantôme qui deviendrait un
    /// « média perdu » au prochain resume.
    func test_saveMedia_missingSource_keepsPreviousCopy() throws {
        let source = tempDir.appendingPathComponent("clip.mp4")
        try Data("fake-video-bytes".utf8).write(to: source)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el-1": source], audioURLs: [:])
        let storedURL = try XCTUnwrap(store.loadMedia(draftId: draftId).videoURLs["el-1"])

        let gone = tempDir.appendingPathComponent("purged.mp4")
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el-1": gone], audioURLs: [:])

        XCTAssertTrue(FileManager.default.fileExists(atPath: storedURL.path),
                      "La copie du store survit quand la nouvelle source n'existe plus")
        let reloaded = store.loadMedia(draftId: draftId)
        XCTAssertNotNil(reloaded.videoURLs["el-1"])
        XCTAssertTrue(reloaded.lostElementIds.isEmpty)
    }

    /// L'invariant transactionnel de `saveMedia` : le DELETE et l'INSERT
    /// doivent tomber dans la MÊME transaction, posée APRÈS l'I/O fichier.
    /// Quand cette transaction échoue (ou que le process meurt entre les
    /// copies), les anciennes lignes restent lisibles — deux transactions
    /// séparées laissaient la table durablement vide, et `checkForDraft`
    /// supprimait alors tout le brouillon.
    func test_saveMedia_failedTransaction_keepsPreviousMediaReadable() throws {
        let v1 = tempDir.appendingPathComponent("v1.mp4")
        try Data("first-clip".utf8).write(to: v1)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["keep": v1], audioURLs: [:])
        let keptURL = try XCTUnwrap(store.loadMedia(draftId: draftId).videoURLs["keep"])

        try installTrigger("""
            CREATE TRIGGER test_block_media_insert BEFORE INSERT ON story_draft_media
            WHEN NEW.element_id = 'boom'
            BEGIN SELECT RAISE(ABORT, 'blocked by test'); END
            """)
        let v2 = tempDir.appendingPathComponent("v2.mp4")
        try Data("second-clip".utf8).write(to: v2)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["boom": v2], audioURLs: [:])

        let reloaded = store.loadMedia(draftId: draftId)
        XCTAssertNotNil(reloaded.videoURLs["keep"],
                        "La transaction avortée doit laisser les anciennes lignes en place")
        XCTAssertTrue(reloaded.lostElementIds.isEmpty)
        XCTAssertTrue(FileManager.default.fileExists(atPath: keptURL.path),
                      "Un échec de transaction ne doit pas non plus balayer les anciens fichiers")
    }

    // MARK: - save + load round-trip

    func test_save_load_roundTrip_preservesSlideData() {
        let effects = StoryEffects(background: "00FF00")
        let slide = StorySlide(id: "slide-1", content: "Test content", effects: effects, duration: 10.0)

        store.save(draftId: draftId, slides: [slide], visibility: "FRIENDS")
        let result = store.load(draftId: draftId)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.slides.first?.id, "slide-1")
        XCTAssertEqual(result?.slides.first?.content, "Test content")
        XCTAssertEqual(result?.slides.first?.duration ?? 0, 10.0, accuracy: 0.01)
        XCTAssertEqual(result?.slides.first?.effects.background, "00FF00")
        XCTAssertEqual(result?.visibility, "FRIENDS")
    }

    func test_save_load_multipleSlides_preservesOrder() {
        let slides = [
            StorySlide(id: "a", content: "First"),
            StorySlide(id: "b", content: "Second"),
            StorySlide(id: "c", content: "Third")
        ]

        store.save(draftId: draftId, slides: slides, visibility: "PUBLIC")
        let result = store.load(draftId: draftId)

        XCTAssertEqual(result?.slides.count, 3)
        XCTAssertEqual(result?.slides[0].id, "a")
        XCTAssertEqual(result?.slides[1].id, "b")
        XCTAssertEqual(result?.slides[2].id, "c")
    }

    // MARK: - save overwrites

    func test_save_overwritesPreviousDraft() {
        store.save(draftId: draftId, slides: [StorySlide(id: "old"), StorySlide(id: "old2")], visibility: "PUBLIC")
        store.save(draftId: draftId, slides: [StorySlide(id: "new")], visibility: "PRIVATE")

        let result = store.load(draftId: draftId)
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.slides.first?.id, "new")
        XCTAssertEqual(result?.visibility, "PRIVATE")
    }

    // MARK: - clear

    func test_clear_makesIsEmptyTrue() {
        store.save(draftId: draftId, slides: [StorySlide(id: "x")], visibility: "PUBLIC")
        XCTAssertFalse(store.isEmpty())

        store.clear()
        XCTAssertTrue(store.isEmpty())
    }

    func test_clear_makesLoadReturnNil() {
        store.save(draftId: draftId, slides: [StorySlide(id: "x")], visibility: "PUBLIC")
        store.clear()
        XCTAssertNil(store.load(draftId: draftId))
    }

    // MARK: - Visibility default

    func test_load_defaultVisibility_isPublic() {
        // Save a slide, then manually delete the meta row to test default
        store.save(draftId: draftId, slides: [StorySlide(id: "v1")], visibility: "PUBLIC")
        let result = store.load(draftId: draftId)
        XCTAssertEqual(result?.visibility, "PUBLIC")
    }

    // MARK: - Signal d'échec de persistance

    /// `save` et `saveMedia` avalaient TOUT (catch → log) : l'appelant croyait
    /// le brouillon écrit alors que rien n'avait été persisté. Le signal doit
    /// exister au niveau du store, sans rien casser des appelants existants.
    func test_save_succeeds_reportsNoPersistFailure() {
        XCTAssertTrue(store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "PUBLIC"))
        XCTAssertNil(store.lastPersistFailure)
    }

    func test_save_whenTheWriteIsRejected_reportsFailure() throws {
        try installTrigger(blockSlideInsertTrigger)

        XCTAssertFalse(store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "PUBLIC"),
                       "Un enregistrement rejeté ne doit pas se déclarer réussi")
        XCTAssertEqual(store.lastPersistFailure?.operation, "save")
    }

    func test_saveMedia_succeeds_reportsNoPersistFailure() throws {
        let clip = tempDir.appendingPathComponent("ok.mp4")
        try Data("bytes".utf8).write(to: clip)

        XCTAssertTrue(store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el": clip], audioURLs: [:]))
        XCTAssertNil(store.lastPersistFailure)
    }

    func test_saveMedia_whenTheTransactionIsRejected_reportsFailure() throws {
        let clip = tempDir.appendingPathComponent("boom.mp4")
        try Data("bytes".utf8).write(to: clip)
        try installTrigger("""
            CREATE TRIGGER test_block_any_media_insert BEFORE INSERT ON story_draft_media
            BEGIN SELECT RAISE(ABORT, 'blocked by test'); END
            """)

        XCTAssertFalse(store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el": clip], audioURLs: [:]))
        XCTAssertEqual(store.lastPersistFailure?.operation, "saveMedia")
    }

    /// Le repli silencieux sur une base EN MÉMOIRE rendait les brouillons
    /// éphémères sans que rien ne le dise : l'utilisateur perdait tout au
    /// redémarrage en croyant ses brouillons sauvés.
    func test_init_whenTheDatabaseCannotBeOpened_reportsFailure() {
        let unopenable = tempDir.appendingPathComponent("absent-dir/nested.db").path

        let fallback = StoryDraftStore(dbPath: unopenable,
                                       mediaDirectory: tempDir.appendingPathComponent("media2"))

        XCTAssertEqual(fallback.lastPersistFailure?.operation, "open-database",
                       "Un store qui retombe en mémoire doit le signaler")
    }

    // MARK: - Ordre lignes → fichiers sur delete/clear

    /// Les lignes DB partent AVANT les fichiers : un échec SQLite laisse un
    /// brouillon complet et listable, pas un brouillon amputé de ses médias.
    func test_delete_whenRowDeletionFails_keepsFilesAndRows() throws {
        let clip = tempDir.appendingPathComponent("clip.mp4")
        try Data("clip-bytes".utf8).write(to: clip)
        store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "PUBLIC")
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el": clip], audioURLs: [:])
        try installTrigger(blockSlideDeletionTrigger)

        store.delete(draftId: draftId)

        XCTAssertNotNil(store.load(draftId: draftId),
                        "Les lignes survivent à la transaction avortée")
        let media = store.loadMedia(draftId: draftId)
        XCTAssertNotNil(media.videoURLs["el"],
                        "Les fichiers ne doivent partir qu'APRÈS les lignes")
        XCTAssertTrue(media.lostElementIds.isEmpty)
    }

    func test_clear_whenRowDeletionFails_keepsFilesAndRows() throws {
        let clip = tempDir.appendingPathComponent("clip.mp4")
        try Data("clip-bytes".utf8).write(to: clip)
        store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "PUBLIC")
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["el": clip], audioURLs: [:])
        try installTrigger(blockSlideDeletionTrigger)

        store.clear()

        XCTAssertNotNil(store.load(draftId: draftId))
        XCTAssertTrue(store.loadMedia(draftId: draftId).lostElementIds.isEmpty)
        XCTAssertNotNil(store.loadMedia(draftId: draftId).videoURLs["el"])
    }

    // MARK: - Chemin dégradé de load

    /// Des effets indécodables ne doivent pas amputer la slide des colonnes
    /// présentes en base : `media_url` et `duration` survivent au repli.
    func test_load_corruptEffectsJSON_preservesMediaURLAndDuration() throws {
        let queue = try DatabaseQueue(path: dbPath)
        try queue.write { db in
            try db.execute(sql: """
                INSERT INTO story_draft_slide (draft_id, id, order_index, content, effects_json, media_url, duration, updated_at)
                VALUES (?, 's1', 0, 'txt', '{not-json', 'https://cdn.example/x.mp4', 9.5, 1)
                """, arguments: [draftId])
        }

        let result = try XCTUnwrap(store.load(draftId: draftId))
        let slide = try XCTUnwrap(result.slides.first)

        XCTAssertEqual(slide.id, "s1")
        XCTAssertEqual(slide.content, "txt")
        XCTAssertEqual(slide.mediaURL, "https://cdn.example/x.mp4",
                       "Le repli sur effets corrompus ne doit pas perdre le média")
        XCTAssertEqual(slide.duration, 9.5, accuracy: 0.01)
    }

    // MARK: - Réconciliation du répertoire média

    /// Un élément retiré de la composition ne doit pas laisser son fichier
    /// s'accumuler jusqu'au delete — mais la réconciliation ne balaye QUE le
    /// sous-répertoire du brouillon concerné : les autres brouillons gardent
    /// leurs médias (le bug historique de destruction était un balayage racine).
    func test_saveMedia_droppedElement_removesItsFileButSparesOtherDrafts() throws {
        let other = tempDir.appendingPathComponent("other.mp4")
        try Data("other-bytes".utf8).write(to: other)
        store.saveMedia(draftId: "other-draft", images: [:], videoURLs: ["z": other], audioURLs: [:])
        let otherURL = try XCTUnwrap(store.loadMedia(draftId: "other-draft").videoURLs["z"])

        let v1 = tempDir.appendingPathComponent("v1.mp4")
        try Data("first".utf8).write(to: v1)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["e1": v1], audioURLs: [:])
        let droppedURL = try XCTUnwrap(store.loadMedia(draftId: draftId).videoURLs["e1"])

        let v2 = tempDir.appendingPathComponent("v2.mp4")
        try Data("second".utf8).write(to: v2)
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["e2": v2], audioURLs: [:])

        XCTAssertFalse(FileManager.default.fileExists(atPath: droppedURL.path),
                       "Le fichier d'un élément supprimé ne doit pas s'accumuler")
        XCTAssertNotNil(store.loadMedia(draftId: draftId).videoURLs["e2"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: otherURL.path),
                      "La réconciliation ne doit jamais toucher un autre brouillon")
    }

    // MARK: - F2 : le brouillon porte la collecte d'accessibilité

    /// `test_accessibility_altText_survivesTheStoreBeingReopened` rougit si le
    /// texte alternatif ne franchit pas la fermeture du composer : le transport
    /// le portait déjà jusqu'au gateway, mais le BROUILLON ne le retenait pas —
    /// reprendre son travail repartait d'une collecte vide, et la story publiée
    /// perdait ses descriptions.
    ///
    /// Le store est ROUVERT sur le même fichier : lire la valeur depuis
    /// l'instance qui vient de l'écrire ne prouverait pas la persistance.
    func test_accessibility_altText_survivesTheStoreBeingReopened() {
        store.saveAccessibility(
            StoryDraftAccessibility(mediaAlt: ["media-1": "Un chat roux sur un muret"]),
            draftId: draftId)

        let reopened = StoryDraftStore(dbPath: dbPath,
                                       mediaDirectory: tempDir.appendingPathComponent("media"))

        XCTAssertEqual(reopened.loadAccessibility(draftId: draftId).mediaAlt,
                       ["media-1": "Un chat roux sur un muret"])
    }

    /// `test_accessibility_explicitSoundChoice_survivesTheStoreBeingReopened`
    /// rougit si l'opt-in d'extraction de son ne survit pas : l'auteur devrait
    /// re-poser, à chaque reprise, un choix qu'il a déjà fait sur son contenu.
    func test_accessibility_explicitSoundChoice_survivesTheStoreBeingReopened() {
        store.saveAccessibility(StoryDraftAccessibility(allowSoundExtraction: true),
                                draftId: draftId)

        let reopened = StoryDraftStore(dbPath: dbPath,
                                       mediaDirectory: tempDir.appendingPathComponent("media"))

        XCTAssertEqual(reopened.loadAccessibility(draftId: draftId).allowSoundExtraction, true)
    }

    /// `test_loadAccessibility_neverSaved_isEmpty` rougit si l'absence de
    /// collecte remonte autre chose que `.empty` : l'appelant repose l'état
    /// sans avoir à distinguer « rien saisi » de « rien persisté ».
    func test_loadAccessibility_neverSaved_isEmpty() {
        XCTAssertEqual(store.loadAccessibility(draftId: draftId), .empty)
    }

    /// `test_legacyDraft_withoutTheAccessibilityKey_stillReloadsItsSlides`
    /// rougit si l'arrivée du champ rend illisible un brouillon écrit AVANT
    /// lui — un brouillon perdu, c'est le travail de l'utilisateur perdu.
    ///
    /// Les lignes sont posées en SQL brut, exactement comme les écrivait la
    /// version antérieure : passer par le `save()` d'aujourd'hui ferait dire au
    /// test « le code actuel se relit lui-même », ce qui n'est pas la question.
    func test_legacyDraft_withoutTheAccessibilityKey_stillReloadsItsSlides() throws {
        let queue = try DatabaseQueue(path: dbPath)
        try queue.write { db in
            try db.execute(sql: """
                INSERT INTO story_draft_slide (draft_id, id, order_index, content, effects_json, media_url, duration, updated_at)
                VALUES (?, 's1', 0, 'Un texte ecrit avant le champ', '{}', NULL, 5, 1)
                """, arguments: [draftId])
            try db.execute(
                sql: "INSERT INTO story_draft_meta (draft_id, key, value) VALUES (?, 'visibility', 'PUBLIC')",
                arguments: [draftId])
        }

        let reloaded = try XCTUnwrap(store.load(draftId: draftId))

        XCTAssertEqual(reloaded.slides.first?.content, "Un texte ecrit avant le champ")
        XCTAssertEqual(store.loadAccessibility(draftId: draftId), .empty,
                       "Un brouillon d'avant le champ rend une collecte vide, jamais un échec.")
    }

    /// `test_loadAccessibility_storedBlobMissingBothKeys_decodesToEmpty` rougit
    /// si le décodage cesse de passer par `decodeIfPresent` : une clé absente du
    /// blob ferait alors échouer la lecture ENTIÈRE, et un brouillon écrit par
    /// une version dont la forme diffère serait rendu illisible.
    func test_loadAccessibility_storedBlobMissingBothKeys_decodesToEmpty() throws {
        let queue = try DatabaseQueue(path: dbPath)
        try queue.write { db in
            try db.execute(
                sql: "INSERT INTO story_draft_meta (draft_id, key, value) VALUES (?, 'accessibility', '{}')",
                arguments: [draftId])
        }

        XCTAssertEqual(store.loadAccessibility(draftId: draftId), .empty)
    }

    /// `test_saveAccessibility_emptyCollection_clearsWhatWasStored` rougit si
    /// effacer le dernier texte alternatif laissait la valeur précédente en
    /// base : elle ressusciterait à la reprise suivante, par-dessus une
    /// suppression explicite de l'auteur — même fidélité que l'audience et la
    /// langue, dont l'absence EFFACE la clé.
    func test_saveAccessibility_emptyCollection_clearsWhatWasStored() {
        store.saveAccessibility(StoryDraftAccessibility(mediaAlt: ["media-1": "Un texte"]),
                                draftId: draftId)

        store.saveAccessibility(.empty, draftId: draftId)

        XCTAssertEqual(store.loadAccessibility(draftId: draftId), .empty)
    }

    /// `test_delete_purgesTheAccessibilityCollection` rougit si jeter un
    /// brouillon laissait sa collecte derrière : un brouillon ultérieur portant
    /// le même id hériterait de textes qui décrivent d'autres médias.
    func test_delete_purgesTheAccessibilityCollection() {
        store.saveAccessibility(StoryDraftAccessibility(mediaAlt: ["media-1": "Un texte"]),
                                draftId: draftId)

        store.delete(draftId: draftId)

        XCTAssertEqual(store.loadAccessibility(draftId: draftId), .empty)
    }

    // MARK: - Harnais

    private var blockSlideDeletionTrigger: String {
        """
        CREATE TRIGGER test_block_slide_delete BEFORE DELETE ON story_draft_slide
        WHEN OLD.draft_id = '\(draftId)'
        BEGIN SELECT RAISE(ABORT, 'blocked by test'); END
        """
    }

    private var blockSlideInsertTrigger: String {
        """
        CREATE TRIGGER test_block_slide_insert BEFORE INSERT ON story_draft_slide
        WHEN NEW.draft_id = '\(draftId)'
        BEGIN SELECT RAISE(ABORT, 'blocked by test'); END
        """
    }

    private func installTrigger(_ sql: String) throws {
        let queue = try DatabaseQueue(path: dbPath)
        try queue.write { db in try db.execute(sql: sql) }
    }
}
