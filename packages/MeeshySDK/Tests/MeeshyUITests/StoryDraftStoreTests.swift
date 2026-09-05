import XCTest
import GRDB
@testable import MeeshySDK

final class StoryDraftStoreTests: XCTestCase {

    private var store: StoryDraftStore!
    /// Ces suites vérifient le contenu d'UN brouillon : un id fixe suffit.
    private let draftId = "test-draft"
    private var tempDir: URL!
    private var dbPath: String!

    override func setUp() {
        super.setUp()
        tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryDraftStoreTests-\(UUID().uuidString)")
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

    // MARK: - Slide Persistence

    func test_save_load_roundtrip() {
        let effects = StoryEffects(background: "FF0000")
        let slide = StorySlide(id: "s1", content: "Hello", effects: effects, duration: 7.5)

        store.save(draftId: draftId, slides: [slide], visibility: "FRIENDS")
        let result = store.load(draftId: draftId)

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.slides.first?.id, "s1")
        XCTAssertEqual(result?.slides.first?.content, "Hello")
        XCTAssertEqual(result?.slides.first?.duration ?? 0, 7.5, accuracy: 0.01)
        XCTAssertEqual(result?.visibility, "FRIENDS")
    }

    func test_save_overwritesPrevious() {
        let s1 = StorySlide(id: "a")
        let s2 = StorySlide(id: "b")

        store.save(draftId: draftId, slides: [s1, s2], visibility: "PUBLIC")
        store.save(draftId: draftId, slides: [s1], visibility: "PRIVATE")

        let result = store.load(draftId: draftId)
        XCTAssertEqual(result?.slides.count, 1)
        XCTAssertEqual(result?.visibility, "PRIVATE")
    }

    // MARK: - Audience & Language Fidelity

    func test_save_load_roundtrip_persistsAudienceAndLanguage() {
        store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "CUSTOM",
                   visibilityUserIds: ["u1", "u2"], originalLanguage: "fr")

        let result = store.load(draftId: draftId)

        XCTAssertEqual(result?.visibilityUserIds, ["u1", "u2"])
        XCTAssertEqual(result?.originalLanguage, "fr")
    }

    func test_save_withoutAudienceFields_loadsEmptyAndNil() {
        store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "PUBLIC")

        let result = store.load(draftId: draftId)

        XCTAssertEqual(result?.visibilityUserIds, [])
        XCTAssertNil(result?.originalLanguage)
    }

    func test_save_overwrite_clearsStaleAudienceFields() {
        store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "CUSTOM",
                   visibilityUserIds: ["u1"], originalLanguage: "en")
        store.save(draftId: draftId, slides: [StorySlide(id: "s1")], visibility: "PUBLIC")

        let result = store.load(draftId: draftId)

        XCTAssertEqual(result?.visibilityUserIds, [])
        XCTAssertNil(result?.originalLanguage)
    }

    func test_isEmpty_trueWhenEmpty() {
        XCTAssertTrue(store.isEmpty())
    }

    func test_isEmpty_falseAfterSave() {
        store.save(draftId: draftId, slides: [StorySlide()], visibility: "PUBLIC")
        XCTAssertFalse(store.isEmpty())
    }

    func test_clear_removesSlides() {
        store.save(draftId: draftId, slides: [StorySlide()], visibility: "PUBLIC")
        store.clear()
        XCTAssertTrue(store.isEmpty())
        XCTAssertNil(store.load(draftId: draftId))
    }

    func test_load_returnsNilWhenEmpty() {
        XCTAssertNil(store.load(draftId: draftId))
    }

    // MARK: - Media Persistence

    func test_saveMedia_image_roundtrip() {
        let image = createTestImage()
        store.saveMedia(draftId: draftId, images: ["img-1": image], videoURLs: [:], audioURLs: [:])

        let media = store.loadMedia(draftId: draftId)

        XCTAssertEqual(media.images.count, 1)
        XCTAssertNotNil(media.images["img-1"])
        XCTAssertTrue(media.videoURLs.isEmpty)
        XCTAssertTrue(media.audioURLs.isEmpty)
    }

    func test_saveMedia_video_roundtrip() {
        let videoURL = createTempFile(name: "test.mp4", content: "fake-video-data")

        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["vid-1": videoURL], audioURLs: [:])

        let media = store.loadMedia(draftId: draftId)

        XCTAssertEqual(media.videoURLs.count, 1)
        XCTAssertNotNil(media.videoURLs["vid-1"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: media.videoURLs["vid-1"]!.path))
    }

    func test_saveMedia_audio_roundtrip() {
        let audioURL = createTempFile(name: "test.m4a", content: "fake-audio-data")

        store.saveMedia(draftId: draftId, images: [:], videoURLs: [:], audioURLs: ["aud-1": audioURL])

        let media = store.loadMedia(draftId: draftId)

        XCTAssertEqual(media.audioURLs.count, 1)
        XCTAssertNotNil(media.audioURLs["aud-1"])
        XCTAssertTrue(FileManager.default.fileExists(atPath: media.audioURLs["aud-1"]!.path))
    }

    func test_saveMedia_mixedTypes_roundtrip() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "clip.mp4", content: "video")
        let audioURL = createTempFile(name: "clip.m4a", content: "audio")

        store.saveMedia(draftId: draftId, 
            images: ["img-1": image],
            videoURLs: ["vid-1": videoURL],
            audioURLs: ["aud-1": audioURL]
        )

        let media = store.loadMedia(draftId: draftId)
        XCTAssertEqual(media.images.count, 1)
        XCTAssertEqual(media.videoURLs.count, 1)
        XCTAssertEqual(media.audioURLs.count, 1)
    }

    func test_saveMedia_overwritesPrevious() {
        let img1 = createTestImage()
        store.saveMedia(draftId: draftId, images: ["a": img1, "b": img1], videoURLs: [:], audioURLs: [:])

        let img2 = createTestImage()
        store.saveMedia(draftId: draftId, images: ["c": img2], videoURLs: [:], audioURLs: [:])

        let media = store.loadMedia(draftId: draftId)
        XCTAssertEqual(media.images.count, 1)
        XCTAssertNotNil(media.images["c"])
        XCTAssertNil(media.images["a"])
    }

    func test_clear_removesMediaFiles() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "test.mp4", content: "data")

        store.saveMedia(draftId: draftId, images: ["img": image], videoURLs: ["vid": videoURL], audioURLs: [:])

        let mediaBefore = store.loadMedia(draftId: draftId)
        XCTAssertEqual(mediaBefore.images.count, 1)

        store.clear()

        let mediaAfter = store.loadMedia(draftId: draftId)
        XCTAssertTrue(mediaAfter.images.isEmpty)
        XCTAssertTrue(mediaAfter.videoURLs.isEmpty)
    }

    func test_loadMedia_emptyWhenNothingSaved() {
        let media = store.loadMedia(draftId: draftId)
        XCTAssertTrue(media.images.isEmpty)
        XCTAssertTrue(media.videoURLs.isEmpty)
        XCTAssertTrue(media.audioURLs.isEmpty)
    }

    func test_saveMedia_preservesFileExtension() {
        let movURL = createTempFile(name: "clip.mov", content: "mov-data")
        store.saveMedia(draftId: draftId, images: [:], videoURLs: ["v1": movURL], audioURLs: [:])

        let media = store.loadMedia(draftId: draftId)
        XCTAssertTrue(media.videoURLs["v1"]?.pathExtension == "mov")
    }

    // MARK: - Media references (chemin de reprise d'un échec de publication)

    func test_loadMediaReferences_returnsAbsolutePathsForStoredMedia() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "ref.mp4", content: "video")
        let audioURL = createTempFile(name: "ref.m4a", content: "audio")
        store.saveMedia(draftId: draftId,
            images: ["img-1": image],
            videoURLs: ["vid-1": videoURL],
            audioURLs: ["aud-1": audioURL]
        )

        let refs = store.loadMediaReferences(draftId: draftId)

        XCTAssertEqual(refs.count, 3)
        let byElement = Dictionary(uniqueKeysWithValues: refs.map { ($0.elementId, $0) })
        XCTAssertEqual(byElement["img-1"]?.mediaType, "image")
        XCTAssertEqual(byElement["vid-1"]?.mediaType, "video")
        XCTAssertEqual(byElement["aud-1"]?.mediaType, "audio")
        for ref in refs {
            XCTAssertTrue(ref.localFilePath.hasPrefix("/"), "Chemin absolu attendu pour la file de publication")
            XCTAssertTrue(FileManager.default.fileExists(atPath: ref.localFilePath),
                          "Chaque référence pointe un fichier encore présent")
        }
    }

    func test_loadMediaReferences_filtersRowsWhoseFileDisappeared() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "gone.mp4", content: "video")
        store.saveMedia(draftId: draftId,
            images: ["img-keep": image],
            videoURLs: ["vid-gone": videoURL],
            audioURLs: [:]
        )
        let mediaDir = tempDir.appendingPathComponent("media").appendingPathComponent(draftId)
        let files = (try? FileManager.default.contentsOfDirectory(at: mediaDir, includingPropertiesForKeys: nil)) ?? []
        for url in files where url.pathExtension == "mp4" {
            try? FileManager.default.removeItem(at: url)
        }

        let refs = store.loadMediaReferences(draftId: draftId)

        XCTAssertEqual(refs.map(\.elementId), ["img-keep"],
                       "Une ligne dont le fichier a disparu ne doit pas produire de référence morte")
    }

    func test_loadMediaReferences_emptyForUnknownDraft() {
        XCTAssertTrue(store.loadMediaReferences(draftId: "never-saved").isEmpty)
    }

    // MARK: - Lost media (Pilier 21 SOTA audit)

    func test_loadMedia_returnsLostElementIds_whenFilesDisappear() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "v.mp4", content: "video-data")
        store.saveMedia(draftId: draftId, 
            images: ["img-keep": image],
            videoURLs: ["vid-disappear": videoURL],
            audioURLs: [:]
        )

        // Sanity check: both are loadable initially
        let before = store.loadMedia(draftId: draftId)
        XCTAssertEqual(before.images.count, 1)
        XCTAssertEqual(before.videoURLs.count, 1)
        XCTAssertTrue(before.lostElementIds.isEmpty)

        // Simulate OS purge / external deletion of the video file
        // Les médias vivent désormais dans le sous-répertoire DU BROUILLON.
        let mediaDir = tempDir.appendingPathComponent("media").appendingPathComponent(draftId)
        let videoFiles = (try? FileManager.default.contentsOfDirectory(at: mediaDir, includingPropertiesForKeys: nil)) ?? []
        for url in videoFiles where url.pathExtension == "mp4" {
            try? FileManager.default.removeItem(at: url)
        }

        let after = store.loadMedia(draftId: draftId)
        XCTAssertEqual(after.images.count, 1, "image survived")
        XCTAssertTrue(after.videoURLs.isEmpty, "video file was removed")
        XCTAssertEqual(after.lostElementIds, ["vid-disappear"], "video element flagged as lost")
    }

    func test_purgeLostMedia_removesOrphanRows() {
        let image = createTestImage()
        let videoURL = createTempFile(name: "v.mp4", content: "data")
        store.saveMedia(draftId: draftId, 
            images: ["img-keep": image],
            videoURLs: ["vid-orphan": videoURL],
            audioURLs: [:]
        )

        // Remove the video file from disk (DB row remains pointing to ghost)
        // Les médias vivent désormais dans le sous-répertoire DU BROUILLON.
        let mediaDir = tempDir.appendingPathComponent("media").appendingPathComponent(draftId)
        let files = (try? FileManager.default.contentsOfDirectory(at: mediaDir, includingPropertiesForKeys: nil)) ?? []
        for url in files where url.pathExtension == "mp4" {
            try? FileManager.default.removeItem(at: url)
        }

        let lost = store.loadMedia(draftId: draftId).lostElementIds
        XCTAssertEqual(lost, ["vid-orphan"])

        store.purgeLostMedia(lost, draftId: draftId)

        // Re-load: the lost row is gone, so lostElementIds is empty.
        let final = store.loadMedia(draftId: draftId)
        XCTAssertTrue(final.lostElementIds.isEmpty)
        XCTAssertEqual(final.images.count, 1)
    }

    func test_purgeLostMedia_emptySetIsNoOp() {
        let image = createTestImage()
        store.saveMedia(draftId: draftId, images: ["img": image], videoURLs: [:], audioURLs: [:])

        store.purgeLostMedia([], draftId: draftId)

        let media = store.loadMedia(draftId: draftId)
        XCTAssertEqual(media.images.count, 1, "valid media untouched by empty purge")
    }

    // MARK: - Migration one-shot v1 → v3 (Task B3)

    /// La ligne EST le blob v1 gelé du lot A — pas une reconstruction Swift,
    /// pour tester exactement ce qu'un vieux brouillon porte sur disque.
    func test_load_migratesV1Blob_contentSurvives() throws {
        try seedRawSlide(id: "s1", effectsJSON: fixtureJSON("v1-legacy-full"))

        let result = try XCTUnwrap(store.load(draftId: draftId))
        let slide = try XCTUnwrap(result.slides.first)

        XCTAssertEqual(slide.effects.textObjects.first?.text, "Salut",
                       "Le contenu du brouillon v1 doit survivre à la migration")
    }

    func test_load_migratesV1Blob_persistsReencodedAsV3() throws {
        try seedRawSlide(id: "s1", effectsJSON: fixtureJSON("v1-legacy-full"))

        _ = store.load(draftId: draftId)

        let persisted = try XCTUnwrap(rawEffectsJSON(id: "s1"))
        let data = try XCTUnwrap(persisted.data(using: .utf8))
        let root = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any],
                                 "JSON persisté illisible : \(persisted.prefix(160))")
        XCTAssertEqual(root["v"] as? Int, 3,
                       "La migration one-shot doit réencoder la ligne en v3 au chargement — persisté : \(persisted.prefix(160))")
        XCTAssertNoThrow(try JSONDecoder().decode(CanvasV3.self, from: data),
                         "La ligne migrée doit rester un document CanvasV3 décodable")
    }

    /// Le titre de la carte (`listDrafts`) passe par le SECOND point de
    /// lecture d'`effects_json` (`firstSlideEffects`) : sans décodeur
    /// partagé, la migration du premier point vide silencieusement celui-ci.
    func test_load_migratesV1Blob_secondReadSiteStillResolvesTitle() throws {
        try seedRawSlide(id: "s1", effectsJSON: fixtureJSON("v1-legacy-full"))
        _ = store.load(draftId: draftId)

        let summaries = store.listDrafts()

        XCTAssertEqual(summaries.first?.title, "Salut",
                       "firstSlideEffects doit rester capable de lire la ligne migrée")
    }

    func test_load_alreadyV3Blob_leavesRowUntouched() throws {
        let v3JSON = try fixtureJSON("v1-legacy-full.v3")
        try seedRawSlide(id: "s1", effectsJSON: v3JSON)

        _ = store.load(draftId: draftId)

        let persisted = try XCTUnwrap(rawEffectsJSON(id: "s1"))
        XCTAssertEqual(persisted, v3JSON, "Un brouillon déjà v3 ne doit jamais être réécrit")
    }

    // MARK: - Brouillon jamais lossy (Task B8d, addendum arbitrage 5)

    /// La ligne EST le blob v1 RICHE (fixture `v1-legacy-rich.json` de B8a),
    /// augmentée d'un `canvasAspectRatio` — le seul champ que cette fixture
    /// partagée ne porte pas : elle documente le contrat WIRE, or
    /// `canvasAspectRatio` s'absorbe délibérément dans le remap des ancres au
    /// fil (addendum, arbitrage 5) et n'a donc aucun logement dans `CanvasV3`.
    ///
    /// Deux lectures : la première décode le v1 brut et déclenche la
    /// migration one-shot (persiste du v3) ; la seconde relit ce v3 déjà
    /// persisté — c'est SEULEMENT là que la perte se manifestait (constats
    /// 4 et 6 de la revue), puisque le premier `load()` décode encore le blob
    /// d'origine.
    func test_load_thenReload_v1RichBlob_losesNoRuntimeField() throws {
        try seedRawSlide(id: "s1", effectsJSON: richFixtureJSON(canvasAspectRatio: 1.5))

        _ = store.load(draftId: draftId)
        let reloaded = try XCTUnwrap(store.load(draftId: draftId))
        let effects = try XCTUnwrap(reloaded.slides.first).effects

        XCTAssertEqual(effects.drawingData, Data(base64Encoded: "AQIDBA=="),
                       "Le dessin legacy (PKDrawing) doit survivre au round-trip v3")
        XCTAssertEqual(effects.drawingStrokes?.first?.id, "stroke-1")
        XCTAssertEqual(effects.drawingStrokes?.first?.colorHex, "FF3B30")
        XCTAssertEqual(effects.drawingStrokes?.first?.points.count, 2)

        let media = try XCTUnwrap(effects.mediaObjects?.first)
        XCTAssertEqual(media.aspectRatio, 1.7777, accuracy: 0.0001,
                       "L'aspectRatio du média doit survivre au round-trip v3")

        let audio = try XCTUnwrap(effects.audioPlayerObjects?.first)
        XCTAssertEqual(audio.soundId, "64b0000000000000000000dd")
        XCTAssertEqual(audio.soundAuthorUsername, "sam")
        XCTAssertEqual(audio.name, "Pluie en forêt")
        XCTAssertEqual(audio.volume, 0.35, accuracy: 0.0001)
        // **La forme d'onde SURVIT désormais** (#4833, 2026-09-02). La ligne
        // attendait `[]`, et son commentaire disait exactement pourquoi : « ni
        // le golden partagé ni `storyEffectsV3.ts` ne le logent encore côté
        // v3 ». C'était un CONSTAT daté, hors périmètre de son lot — pas une
        // décision que la forme d'onde ne doive pas voyager. Les trois sites
        // qu'il nommait la portent maintenant, donc la reconstruction ne
        // retombe plus sur le défaut d'init.
        //
        // Sans elle, `StoryAudioPlayerView` sortait sur son
        // `guard !samples.isEmpty` et ne dessinait RIEN : une bande vide sous
        // la puce d'une note vocale, chez tout lecteur.
        XCTAssertEqual(audio.waveformSamples, [0.1, 0.6, 0.9, 0.4],
                       "Le nom de ce témoin dit qu'il ne doit RIEN perdre — la forme d'onde comprise.")

        XCTAssertEqual(effects.backgroundAudioVariants?.count, 2)
        XCTAssertEqual(effects.backgroundAudioVariants?.first?.language, "fr")
        XCTAssertEqual(effects.backgroundAudioVariants?.first?.postMediaId, "64b0000000000000000000e1")

        XCTAssertEqual(effects.thumbHash, "1QcSHQRnh493V4dIh4eXh0h4kJUI",
                       "L'empreinte de vignette doit survivre au round-trip v3")

        XCTAssertEqual(effects.canvasAspectRatio ?? -1, 1.5, accuracy: 0.0001,
                       "Un composer 16:9 ne doit pas rouvrir en portrait au second chargement")
    }

    /// `canvasAspectRatio` est un état PAR SLIDE (le composer en écrit un par
    /// slide courante, jusqu'à dix par brouillon) — pas une propriété de
    /// brouillon. Un brouillon dont SEULE la deuxième slide est 16:9 doit
    /// restituer ce ratio sur `slides[1]` après la migration one-shot, sans
    /// le prêter à `slides[0]` ni le perdre.
    func test_load_thenReload_v1RichBlob_twoSlides_secondSlideKeepsOwnRatio() throws {
        try seedRawSlide(id: "s1", effectsJSON: fixtureJSON("v1-legacy-rich"), orderIndex: 0)
        try seedRawSlide(id: "s2", effectsJSON: richFixtureJSON(canvasAspectRatio: 1.5), orderIndex: 1)

        _ = store.load(draftId: draftId)
        let reloaded = try XCTUnwrap(store.load(draftId: draftId))
        XCTAssertEqual(reloaded.slides.map(\.id), ["s1", "s2"])

        XCTAssertNil(reloaded.slides[0].effects.canvasAspectRatio,
                    "La première slide ne porte aucun ratio propre : elle ne doit pas hériter celui de la seconde")
        XCTAssertEqual(reloaded.slides[1].effects.canvasAspectRatio ?? -1, 1.5, accuracy: 0.0001,
                       "Un composer 16:9 en DEUXIÈME slide ne doit pas rouvrir en portrait au second chargement")
    }

    // MARK: - Helpers

    private enum FixtureError: Error, CustomStringConvertible {
        case missing(String)

        var description: String {
            switch self {
            case .missing(let path):
                return "Fixture introuvable à \(path) — ajuster deletingLastPathComponent dans fixtureJSON(_:)"
            }
        }
    }

    /// Fixtures gelées du lot A (`packages/shared/fixtures/canvas-v3/`).
    private func fixtureJSON(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // → MeeshyUITests/
            .deletingLastPathComponent() // → Tests/
            .deletingLastPathComponent() // → MeeshySDK/
            .deletingLastPathComponent() // → packages/
            .appendingPathComponent("shared/fixtures/canvas-v3/\(name).json")
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw FixtureError.missing(url.path)
        }
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Fixture `v1-legacy-rich.json` (B8a) augmentée d'un `canvasAspectRatio` —
    /// le seul champ qu'elle ne porte pas, `canvasAspectRatio` étant hors du
    /// contrat WIRE que cette fixture partagée documente (addendum, arbitrage 5).
    private func richFixtureJSON(canvasAspectRatio: Double) throws -> String {
        let raw = try fixtureJSON("v1-legacy-rich")
        var root = try XCTUnwrap(
            try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        root["canvasAspectRatio"] = canvasAspectRatio
        let data = try JSONSerialization.data(withJSONObject: root)
        return try XCTUnwrap(String(data: data, encoding: .utf8))
    }

    /// Insère une ligne de slide brute, en contournant `store.save()` — celui-ci
    /// émet désormais TOUJOURS du v3 (B7, `StoryEffects.encode(to:)` réencode
    /// le runtime courant) : ces suites ont besoin de seeder du LEGACY v1 brut,
    /// que `save()` ne produit plus, pour exercer la migration one-shot au
    /// `load()` (constat 21, B8f — commentaire corrigé, `save()` a changé de
    /// comportement trois commits après avoir été écrit).
    private func seedRawSlide(id: String, effectsJSON: String, orderIndex: Int = 0) throws {
        let queue = try DatabaseQueue(path: dbPath)
        try queue.write { db in
            try db.execute(sql: """
                INSERT OR REPLACE INTO story_draft (id, visibility, created_at, updated_at)
                VALUES (?, 'PUBLIC', 1, 1)
                """, arguments: [draftId])
            try db.execute(sql: """
                INSERT INTO story_draft_slide (draft_id, id, order_index, content, effects_json, media_url, duration, updated_at)
                VALUES (?, ?, ?, NULL, ?, NULL, 5, 1)
                """, arguments: [draftId, id, orderIndex, effectsJSON])
        }
    }

    private func rawEffectsJSON(id: String) throws -> String? {
        let queue = try DatabaseQueue(path: dbPath)
        return try queue.read { db in
            try String.fetchOne(db,
                                sql: "SELECT effects_json FROM story_draft_slide WHERE draft_id = ? AND id = ?",
                                arguments: [draftId, id])
        }
    }

    private func createTestImage() -> UIImage {
        UIGraphicsBeginImageContext(CGSize(width: 10, height: 10))
        UIColor.red.setFill()
        UIRectFill(CGRect(x: 0, y: 0, width: 10, height: 10))
        let image = UIGraphicsGetImageFromCurrentImageContext()!
        UIGraphicsEndImageContext()
        return image
    }

    private func createTempFile(name: String, content: String) -> URL {
        let url = tempDir.appendingPathComponent("source_\(name)")
        try? content.data(using: .utf8)?.write(to: url)
        return url
    }
}
