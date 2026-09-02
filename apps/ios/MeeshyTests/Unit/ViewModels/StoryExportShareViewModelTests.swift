import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - StoryExportShareViewModelTests
//
// Covers the author-only "Export to share" flow. The VM never touches the
// publish path — every test asserts the bake output exists locally and
// nothing else.

@MainActor
final class StoryExportShareViewModelTests: XCTestCase {

    // MARK: - Factories

    private func makeSUT(
        behavior: MockShareExporter.Behavior = .success
    ) -> (sut: StoryExportShareViewModel, exporter: MockShareExporter) {
        let exporter = MockShareExporter(behavior: behavior)
        let sut = StoryExportShareViewModel(exporter: exporter)
        return (sut, exporter)
    }

    /// Builds a story whose `effects` set an opening transition — this
    /// trips `needsVideoExport` (see `StorySlide+ExportTrigger`).
    private func makeAnimatedStory(translations: [StoryTranslation]? = nil) -> StoryItem {
        let effects = StoryEffects(opening: .fade,
                                   textObjects: [StoryTextObject(text: "Hello")])
        return StoryItem(id: "story-\(UUID().uuidString)",
                         content: "Hello",
                         storyEffects: effects,
                         translations: translations)
    }

    /// Builds a story whose `effects` are empty — text-only static. The
    /// universal export contract means this case must still bake an MP4
    /// just like the animated path (the compositor synthesises a
    /// transparent video track for the static substrate).
    private func makeStaticStory() -> StoryItem {
        StoryItem(id: "story-\(UUID().uuidString)",
                  content: "Hello",
                  storyEffects: StoryEffects())
    }

    // MARK: - prepare

    func test_prepare_seedsAvailableLanguagesFromTranslations() {
        let (sut, _) = makeSUT()
        let story = makeAnimatedStory(translations: [
            StoryTranslation(language: "fr", content: "Bonjour"),
            StoryTranslation(language: "en", content: "Hello"),
            StoryTranslation(language: "es", content: "Hola"),
        ])

        sut.prepare(story: story)

        XCTAssertEqual(sut.availableLanguages, ["fr", "en", "es"])
    }

    func test_prepare_emptyTranslations_leavesLanguagesEmpty() {
        let (sut, _) = makeSUT()
        sut.prepare(story: makeAnimatedStory())
        XCTAssertEqual(sut.availableLanguages, [])
        XCTAssertNil(sut.selectedLanguage)
    }

    // MARK: - startExport

    func test_startExport_animatedStory_callsExporterAndStoresURL() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeAnimatedStory(translations: [StoryTranslation(language: "fr", content: "Bonjour")])
        sut.prepare(story: story)
        sut.selectedLanguage = "fr"

        await sut.startExport(story: story)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertEqual(exporter.lastLanguages, ["fr"])
        XCTAssertNotNil(sut.sharedURL)
        XCTAssertEqual(sut.phase, .ready)

        // Clean up: simulate share completion so the file isn't left behind.
        sut.finishSharing(success: true)
    }

    /// #4852 — un sticker IMAGE ne porte que le `postMediaId` de son média ;
    /// c'est le VM, seul à tenir la slide ET `story.media`, qui apparie les
    /// deux et remet l'index au bake. Sans lui, l'export peignait 🖼️.
    func test_startExport_pairsStickerImagesWithStoryMedia_andThreadsThemToExporter() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let sticker = StorySticker(emoji: "", postMediaId: "pm-sticker")
        let effects = StoryEffects(stickerObjects: [sticker, StorySticker(emoji: "🔥")])
        let story = StoryItem(id: "story-\(UUID().uuidString)",
                              content: "Hello",
                              media: [FeedMedia(id: "pm-sticker", type: .image,
                                                url: "https://cdn.meeshy.test/sticker.png")],
                              storyEffects: effects)

        await sut.startExport(story: story)

        XCTAssertEqual(exporter.lastStickerImageSources,
                       ["pm-sticker": "https://cdn.meeshy.test/sticker.png"])
        sut.finishSharing(success: true)
    }

    func test_startExport_staticStory_callsExporterAndStoresURL() async {
        // Universal export contract : static stories (texte/sticker/image
        // sans animation) doivent aussi être bakables. Le compositor
        // synthétise un substrat vidéo transparent pour le rendu (voir
        // StoryExporterStaticOnlyTests dans MeeshyUI). Le bouton "Exporter"
        // s'affiche donc pour TOUTES les stories de l'auteur, et le VM
        // route systématiquement vers le service.
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeStaticStory()

        await sut.startExport(story: story)

        XCTAssertEqual(exporter.prepareCallCount, 1)
        XCTAssertNotNil(sut.sharedURL)
        XCTAssertEqual(sut.phase, .ready)
        XCTAssertNil(sut.errorMessage)

        // Clean up so the temp file isn't left behind.
        sut.finishSharing(success: true)
    }

    func test_startExport_failure_setsErrorMessage_andPhaseFailed() async {
        let (sut, _) = makeSUT(behavior: .failure)
        let story = makeAnimatedStory()

        await sut.startExport(story: story)

        XCTAssertNotNil(sut.errorMessage)
        if case .failed = sut.phase {
            // ok
        } else {
            XCTFail("Expected phase .failed when exporter returns nil")
        }
    }

    // MARK: - finishSharing

    func test_finishSharing_cleansUpTempFile() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeAnimatedStory()
        await sut.startExport(story: story)
        XCTAssertEqual(exporter.cleanupCallCount, 0)

        let bakedURL = sut.sharedURL
        sut.finishSharing(success: true)

        XCTAssertEqual(exporter.cleanupCallCount, 1)
        XCTAssertEqual(exporter.lastCleanupURL, bakedURL)
        XCTAssertNil(sut.sharedURL)
    }

    func test_finishSharing_cancelled_stillCleansUpTempFile() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        let story = makeAnimatedStory()
        await sut.startExport(story: story)

        sut.finishSharing(success: false)

        XCTAssertEqual(exporter.cleanupCallCount, 1,
                       "Cancel must still clean up the temp MP4.")
        XCTAssertNil(sut.sharedURL)
    }

    // MARK: - cancel

    func test_cancel_priorToExport_isNoop_doesNotCallCleanup() {
        let (sut, exporter) = makeSUT()
        sut.cancel()
        XCTAssertEqual(exporter.cleanupCallCount, 0)
        XCTAssertEqual(sut.phase, .idle)
    }

    func test_cancel_afterReady_cleansUpAndResets() async {
        let (sut, exporter) = makeSUT(behavior: .success)
        await sut.startExport(story: makeAnimatedStory())
        XCTAssertEqual(sut.phase, .ready)

        sut.cancel()

        XCTAssertEqual(exporter.cleanupCallCount, 1)
        XCTAssertNil(sut.sharedURL)
        XCTAssertEqual(sut.phase, .idle)
    }
}

// MARK: - MockShareExporter

@MainActor
final class MockShareExporter: StoryVideoExportServiceProviding {

    enum Behavior {
        case success
        case failure
    }

    private(set) var prepareCallCount = 0
    private(set) var cleanupCallCount = 0
    private(set) var lastLanguages: [String] = []
    /// Identité transmise au préambule de marque — `nil` = export sans intro.
    private(set) var lastIntro: StoryExportIntroContent?
    /// Index `postMediaId → adresse` des stickers image reçu par le bake (#4852).
    private(set) var lastStickerImageSources: [String: String] = [:]
    private(set) var lastCleanupURL: URL? = nil
    private(set) var lastBakedURL: URL? = nil
    let behavior: Behavior

    init(behavior: Behavior) { self.behavior = behavior }

    func prepareExport(
        slide: StorySlide,
        languages: [String],
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        stickerImageSources: [String: String],
        onProgress: ((Double) -> Void)?,
        onPhaseChange: ((StoryExportPhase) -> Void)?
    ) async -> URL? {
        prepareCallCount += 1
        lastLanguages = languages
        lastIntro = intro
        lastStickerImageSources = stickerImageSources

        switch behavior {
        case .success:
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("mock-share-\(UUID().uuidString).mp4")
            try? Data().write(to: url)
            lastBakedURL = url
            return url
        case .failure:
            return nil
        }
    }

    func cleanupExport(at url: URL) {
        cleanupCallCount += 1
        lastCleanupURL = url
        try? FileManager.default.removeItem(at: url)
    }
}

// MARK: - Préambule de marque

/// Chaque MP4 partagé à l'extérieur porte l'interlude d'identité et la
/// signature sonore Meeshy (directive user 2026-07-25) : c'est ce qui rend une
/// story reconnaissable une fois sortie de l'app.
@MainActor
final class StoryExportBrandIntroTests: XCTestCase {

    /// L'identité est INJECTÉE et non lue dans `AuthManager.shared` : sinon le
    /// test juge la session résiduelle du simulateur — vert sur une machine de
    /// dev connectée, rouge sur un simulateur CI vierge.
    private func makeAuthor() -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "Ada Lovelace",
                                username: "ada",
                                accentColorHex: "#6366F1")
    }

    func test_startExport_alwaysRequestsTheBrandIntro() async {
        let mock = MockShareExporter(behavior: .success)
        let author = makeAuthor()
        let sut = StoryExportShareViewModel(exporter: mock, brandIntro: { author })

        await sut.startExport(story: makeStoryItem())

        XCTAssertEqual(mock.prepareCallCount, 1)
        XCTAssertNotNil(mock.lastIntro,
                        "l'export doit toujours demander le préambule de marque")
    }

    /// Le pendant du test précédent : sans identité d'auteur résolue, le MP4
    /// partait SANS interlude, en silence. Ce test fige le fait que ce chemin
    /// est bien celui du « pas d'intro » — pour qu'une régression qui rendrait
    /// l'identité indisponible se voie ici, et non chez l'utilisateur.
    func test_startExport_withoutAuthorIdentity_shipsWithoutIntro() async {
        let mock = MockShareExporter(behavior: .success)
        let sut = StoryExportShareViewModel(exporter: mock, brandIntro: { nil })

        await sut.startExport(story: makeStoryItem())

        XCTAssertEqual(mock.prepareCallCount, 1)
        XCTAssertNil(mock.lastIntro)
    }

    /// L'export est réservé à l'auteur : l'identité du préambule est donc celle
    /// de l'utilisateur courant, jamais une chaine vide.
    func test_brandIntro_carriesANonEmptyIdentity() async {
        let mock = MockShareExporter(behavior: .success)
        let author = makeAuthor()
        let sut = StoryExportShareViewModel(exporter: mock, brandIntro: { author })

        await sut.startExport(story: makeStoryItem())

        guard let intro = mock.lastIntro else {
            return XCTFail("aucun préambule transmis")
        }
        XCTAssertEqual(intro.displayName, "Ada Lovelace")
        XCTAssertEqual(intro.username, "ada")
        XCTAssertFalse(intro.accentColorHex.isEmpty)
    }

    // MARK: - La résolution d'identité est BORNÉE (revue finale, item 4)

    /// « Partager » était le SEUL des trois chemins d'export à attendre
    /// `brandIntro()` sans borne — et il le faisait avant même que `exportTask`
    /// existe, donc « Annuler » n'avait aucune prise. Premier partage après
    /// installation + réseau lent : barre à 0 % pendant jusqu'à ~60 s (timeout
    /// `URLSession` par défaut).
    ///
    /// Mêmes constantes que
    /// `StoryPhotoSaveServiceTests.test_save_introSlowerThanTimeout_bakesWithoutIntroWithoutBlocking`
    /// et que la garde équivalente côté timeline (borne 0,1 s / opération lente
    /// 3 s / seuil 1,5 s), déjà calibrées pour ce host bruyant.
    func test_startExport_introSlowerThanTimeout_bakesWithoutIntroWithoutBlocking() async {
        let mock = MockShareExporter(behavior: .success)
        let sut = StoryExportShareViewModel(
            exporter: mock,
            introTimeout: .milliseconds(100),
            brandIntro: {
                try? await Task.sleep(for: .seconds(3))
                return StoryExportIntroContent(displayName: "Late", username: "late",
                                               accentColorHex: "FFFFFF")
            }
        )
        let start = Date()

        await sut.startExport(story: makeStoryItem())

        let elapsed = Date().timeIntervalSince(start)
        // Preuve primaire, déterministe : avec une borne (0,1 s) très
        // inférieure au sommeil de l'intro (3 s), la SEULE façon d'observer
        // `lastIntro == nil` est que la course ait été coupée par la borne —
        // l'intro, livrée à elle-même, ne renvoie jamais nil. `elapsed` n'est
        // qu'un signal de soutien, volontairement peu discriminant.
        XCTAssertNil(mock.lastIntro, "passé le délai, le bake démarre sans interlude de marque")
        XCTAssertEqual(mock.prepareCallCount, 1, "le bake doit démarrer, pas être abandonné")
        XCTAssertLessThan(elapsed, 1.5,
                          "doit démarrer près de la borne de 0,1 s, jamais attendre les 3 s de l'intro")
    }

    /// La borne ne doit jamais faire perdre une identité qui arrive à temps.
    func test_startExport_introFasterThanTimeout_isUsed() async {
        let mock = MockShareExporter(behavior: .success)
        let author = makeAuthor()
        let sut = StoryExportShareViewModel(
            exporter: mock,
            introTimeout: .seconds(2),
            brandIntro: { author }
        )

        await sut.startExport(story: makeStoryItem())

        XCTAssertEqual(mock.lastIntro?.username, "ada")
    }

    private func makeStoryItem() -> StoryItem {
        StoryItem(id: "s1", content: "Bonjour",
                  storyEffects: StoryEffects(textObjects: [
                      StoryTextObject(id: "t1", text: "Bonjour")
                  ]),
                  createdAt: Date(), expiresAt: Date().addingTimeInterval(3600))
    }
}
