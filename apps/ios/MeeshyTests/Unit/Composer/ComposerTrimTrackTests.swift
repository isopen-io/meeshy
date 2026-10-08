import XCTest
import AVFoundation
@testable import Meeshy

/// **La piste de découpe** (#9353, spec § 3.3) : la plage choisie est celle que
/// la boucle joue, et celle qui part dans le rendu livré.
@MainActor
final class ComposerTrimTrackTests: XCTestCase {

    // MARK: - La loupe

    func test_precisionWindow_drawsOnlyWhatTheTrackShows() {
        let fenetre = ComposerTrimRule.precisionWindow(anchor: 3, width: 300, pointsPerSecond: 37.5 * ComposerTrimRule.preciseZoom)
        XCTAssertEqual(fenetre.lowerBound, 3 - 150 / (37.5 * ComposerTrimRule.preciseZoom), accuracy: 0.0001)
        XCTAssertEqual(fenetre.upperBound, 3 + 150 / (37.5 * ComposerTrimRule.preciseZoom), accuracy: 0.0001)
        XCTAssertLessThan(fenetre.upperBound - fenetre.lowerBound, 0.25,
                          "la loupe ne couvre qu'une fraction de seconde : rien n'est peint 40 fois plus large")
        XCTAssertEqual(ComposerTrimRule.precisionWindow(anchor: 3, width: 0, pointsPerSecond: 1500), 3...3)
    }

    /// Sur une longue prise, dilater 40 fois ne suffit plus : un point d'écran
    /// vaudrait encore plusieurs millisecondes. L'échelle a un plancher.
    func test_precisePointsPerSecond_neverLetsAPointWeighMoreThanTwoMilliseconds() {
        XCTAssertEqual(ComposerTrimRule.precisePointsPerSecond(100), 100 * ComposerTrimRule.preciseZoom)
        XCTAssertEqual(ComposerTrimRule.precisePointsPerSecond(5), 500, "une minute dans 300 points")
    }

    // MARK: - La plage, et la boucle qui la joue

    func test_setTrim_whileDragging_movesTheRange_onlyTheEndRebuildsTheLoop() async {
        let lecteur = MockComposerLoopPlayer(duration: 6)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.setTrim(1...5, committed: false)
        XCTAssertEqual(session.trim, 1...5)
        XCTAssertTrue(lecteur.ranges.isEmpty, "pendant le geste, la boucle ne se reconstruit pas")
        session.setTrim(1...4.5, committed: true)
        XCTAssertEqual(lecteur.ranges.last, 1...4.5, "le geste fini, la boucle joue la plage choisie")
    }

    func test_setTrim_committedTwiceOnTheSameRange_rebuildsTheLoopOnce() async {
        let lecteur = MockComposerLoopPlayer(duration: 6)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.setTrim(1...4, committed: true)
        session.setTrim(1...4, committed: true)
        XCTAssertEqual(lecteur.ranges, [1...4], "une boucle déjà sur sa plage ne repart pas de zéro")
    }

    func test_setTrim_outsideVideoEditing_changesNothing() {
        let session = ComposerCaptureSession(stage: .armed)
        session.setTrim(1...2, committed: true)
        XCTAssertNil(session.trim, "sans vidéo en retouche, aucune plage")
    }

    func test_setTrim_whileTheRenderRuns_leavesTheRangeUntouched() async {
        let lecteur = MockComposerLoopPlayer(duration: 6)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.isRenderingLook = true
        session.setTrim(1...2, committed: true)
        session.seekPlayhead(to: 3)
        XCTAssertEqual(session.trim, 0...6, "ce qui part est ce qu'on voyait en validant")
        XCTAssertTrue(lecteur.ranges.isEmpty)
        XCTAssertTrue(lecteur.seeks.isEmpty)
    }

    func test_seekPlayhead_isClampedIntoTheKeptRange() async {
        let lecteur = MockComposerLoopPlayer(duration: 6)
        let session = ComposerCaptureSession(stage: .armed, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: Self.clip())
        session.setTrim(2...4, committed: true)
        session.seekPlayhead(to: 0.5)
        XCTAssertEqual(lecteur.seeks.last, 2)
        session.seekPlayhead(to: 3)
        XCTAssertEqual(lecteur.seeks.last, 3, "toucher la piste y place la tête")
    }

    // MARK: - Le montage

    func test_track_sitsAboveTheRailAndTheBand_andCarriesThePrecisionLaw() throws {
        let bas = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        let retouche = try XCTUnwrap(bas.range(of: "private var editTools: some View {"))
        let piste = try XCTUnwrap(bas.range(of: "ComposerTrimTrack(", range: retouche.upperBound..<bas.endIndex),
                                  "la piste se monte avec les outils de la retouche")
        let rail = try XCTUnwrap(bas.range(of: "ComposerLookRail(", range: retouche.upperBound..<bas.endIndex))
        XCTAssertLessThan(piste.lowerBound, rail.lowerBound, "la piste se pose AU-DESSUS du rail, donc de la bande")
        XCTAssertTrue(bas.contains("case .editing(.video(let url)) = session.phase"),
                      "elle n'existe qu'en retouche d'une vidéo")
        let vue = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerTrimTrack.swift")
        XCTAssertTrue(vue.contains("ComposerTrimRule.preciseTime("), "l'appui long amène l'instant sous le trait")
        XCTAssertTrue(vue.contains("ComposerTrimRule.precisionWindow("), "la loupe ne dessine que sa fenêtre")
        XCTAssertTrue(vue.contains("ComposerTrimRule.millisecondText("))
        XCTAssertTrue(vue.contains("ComposerTrimRule.movedStart("))
        XCTAssertTrue(vue.contains("ComposerTrimRule.movedEnd("))
        XCTAssertTrue(vue.contains("WaveformCache.shared.samples("), "forme d'onde en filigrane")
        XCTAssertTrue(vue.contains("session.seekPlayhead(to:"), "toucher la piste y place la tête")
        XCTAssertTrue(vue.contains("accessibilityAdjustableAction"), "VoiceOver règle chaque poignée")
        XCTAssertTrue(vue.contains("coordinateSpace: .global"),
                      "une poignée qui bouge sous le doigt ne mesure pas sa course dans son propre repère")
        XCTAssertTrue(vue.contains(".environment(\\.layoutDirection, .leftToRight)"),
                      "le temps ne se met pas en miroir")
    }

    func test_finishEditingVideo_passesTheKeptRangeToTheExporter() throws {
        let edition = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(edition.contains("ComposerLookVideoExporter.export(url, look: regard, framing: cadrage, timeRange: plage"))
        let export = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("session.timeRange"), "la découpe part dans le rendu")
        XCTAssertTrue(export.contains("session.metadata"), "la vidéo rendue garde les métadonnées de la prise")
    }

    func test_copy_readsFromTheCatalog() {
        XCTAssertFalse(ComposerCaptureCopy.trimPrecisionHint.isEmpty)
        XCTAssertFalse(ComposerCaptureCopy.playhead.isEmpty)
        XCTAssertFalse(ComposerCaptureCopy.trimStart.isEmpty)
        XCTAssertFalse(ComposerCaptureCopy.trimEnd.isEmpty)
    }

    // MARK: - La découpe part dans le rendu

    #if DEBUG
    func test_export_withATrim_keepsOnlyTheRange() async throws {
        let modele = await ComposerCaptureFixture.movie()
        let film = try XCTUnwrap(modele)
        let plage = try XCTUnwrap(ComposerTrimRule.timeRange(0.5...1.5, duration: 3))
        let sortie = await ComposerLookVideoExporter.export(
            film, look: ComposerPhotoLook(filter: .warm), timeRange: plage,
            person: CallFramePerson(id: "u1", name: "Ada", handle: nil, isSelf: true),
            date: Date(timeIntervalSince1970: 1_790_000_000))
        let rendue = try XCTUnwrap(sortie)
        addTeardownBlock { try? FileManager.default.removeItem(at: rendue) }
        let duree = try await AVURLAsset(url: rendue).load(.duration).seconds
        XCTAssertEqual(duree, 1, accuracy: 0.1, "seule la plage gardée part")
    }

    /// Sans effet ni cadrage, une découpe suffit à produire un rendu : ce qui
    /// part n'est plus le brut, mais la seule plage gardée — en galerie aussi.
    func test_finishEditingVideo_withOnlyATrim_deliversTheKeptRange_andSavesIt() async throws {
        let film = await ComposerCaptureFixture.movie()
        let modele = try XCTUnwrap(film)
        let url = Self.clip()
        try FileManager.default.copyItem(at: modele, to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie,
                                             savePolicy: { CaptureSavePolicy(savesOriginal: false, renderedMode: .automatic) },
                                             loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: url)
        session.setTrim(1...2.5, committed: false)
        session.setTrim(1...2, committed: true)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        XCTAssertTrue(session.isRenderingLook, "une découpe se rend : « Terminé » attend")
        await ComposerCaptureTakesTests.waitUntil(timeout: 90) { remis != nil }
        guard case .video(let livree) = remis else { return XCTFail("une vidéo") }
        addTeardownBlock { try? FileManager.default.removeItem(at: livree) }
        XCTAssertNotEqual(livree, url, "le rendu découpé, pas le brut entier")
        let duree = try await AVURLAsset(url: livree).load(.duration).seconds
        XCTAssertEqual(duree, 1, accuracy: 0.1, "la plage choisie en retouche est celle qui part")
        XCTAssertEqual(galerie.saveVideoCount, 1, "en mode automatique, « Terminé » enregistre le rendu découpé en galerie")
        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
        XCTAssertNil(session.trim, "la retouche finie, plus de plage")
    }
    #endif

    // MARK: - Un rendu qui échoue ne remet jamais ce que l'auteur a coupé

    /// Le brut porte ce que la découpe ou le cadrage ont RETIRÉ : le remettre à
    /// la place d'un rendu raté enverrait à l'hôte un passage coupé. La retouche
    /// reste ouverte, comme pour une photo dont le cadre ne se peint pas.
    func test_finishEditingVideo_whenTheRenderFails_deliversNothing_andKeepsTheEdit() async throws {
        let url = Self.clip()
        try Data("pas un film".utf8).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let galerie = MockComposerGallery()
        let lecteur = MockComposerLoopPlayer(duration: 3)
        let session = ComposerCaptureSession(stage: .armed, gallery: galerie, loopPlayerFactory: { _ in lecteur })
        await session.beginEditing(video: url)
        session.setTrim(1...2, committed: true)
        var remis: CameraResult?
        session.onDeliver = { remis = $0 }
        session.finishEditing()
        await ComposerCaptureTakesTests.waitUntil(timeout: 30) { !session.isRenderingLook }
        XCTAssertNil(remis, "le brut entier ne part pas à la place de la plage gardée")
        XCTAssertTrue(session.phase.isEditing, "la retouche reste ouverte : on réessaie ou on ferme")
        XCTAssertEqual(session.trim, 1...2, "la plage choisie n'est pas perdue")
        XCTAssertEqual(galerie.saveVideoCount, 0)
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "la prise n'est pas détruite")
    }

    func test_finishEditingVideo_aFailedRender_neverFallsBackToTheRawClip() throws {
        let edition = try ComposerCaptureTakesTests.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertFalse(edition.contains("neuve ?? url"), "le brut ne remplace jamais un rendu raté")
        XCTAssertTrue(edition.contains("guard let rendue else {"), "un rendu raté s'arrête avant toute remise")
    }

    private static func clip() -> URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("trim_\(UUID().uuidString).mov")
    }
}
