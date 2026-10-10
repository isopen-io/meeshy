import XCTest
import SwiftUI
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// #9737 — **chaque surface du SDK qui peint une scène lit la MÊME règle**
/// (`SceneAudioStageRule`) : un son de fond n'y produit aucun pixel, un son de
/// premier plan y paraît en pastille — sinusoïde pour un son propre, crédit
/// défilant pour un son emprunté.
@MainActor
final class SceneAudioStageSurfacesTests: XCTestCase {

    private static let canvas = CGSize(width: 180, height: 320)

    private func slide(_ audios: [StoryAudioPlayerObject]) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.audioPlayerObjects = audios
        return StorySlide(id: "stage-\(UUID().uuidString)", effects: effects, duration: 6, order: 0)
    }

    private func background() -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "bg", x: 0.5, y: 0.5,
                               waveformSamples: Array(repeating: 0.6, count: 80),
                               isBackground: true)
    }

    // MARK: - Export et couverture (StoryAVCompositor, StoryStaticSnapshot)

    func test_export_aBackgroundSound_paintsNoChip_inItsWindowOrOutOfIt() {
        let geometry = CanvasGeometry(renderSize: Self.canvas)
        let scene = slide([background()])

        XCTAssertTrue(StoryAudioChipPainter.placements(for: scene, into: geometry, at: .zero).isEmpty)
        XCTAssertTrue(StoryAudioChipPainter.placements(for: scene, into: geometry, at: .zero,
                                                       respectingWindow: false).isEmpty,
                      "la couverture statique ne peint pas le son de fond non plus")
    }

    func test_export_aForegroundSound_isAChipAtItsPlace_besideASilentBackground() throws {
        let posé = StoryAudioPlayerObject(id: "fg", x: 0.25, y: 0.75)

        let chips = StoryAudioChipPainter.placements(for: slide([background(), posé]),
                                                     into: CanvasGeometry(renderSize: Self.canvas),
                                                     at: .zero, respectingWindow: false)

        XCTAssertEqual(chips.map(\.audioId), ["fg"])
        let chip = try XCTUnwrap(chips.first)
        XCTAssertEqual(chip.center.x, 45, accuracy: 0.5)
        XCTAssertEqual(chip.center.y, 240, accuracy: 0.5)
        XCTAssertEqual(chip.display, .waveform, "un son propre garde la sinusoïde")
    }

    func test_export_aBorrowedForegroundSound_isAChipCarryingItsCredit() throws {
        var emprunté = StoryAudioPlayerObject(id: "lib", x: 0.5, y: 0.5)
        emprunté.soundId = "sound-1"
        emprunté.name = "Titre"
        emprunté.soundAuthorUsername = "auteur"

        let chip = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: slide([emprunté]), into: CanvasGeometry(renderSize: Self.canvas), at: .zero).first)

        XCTAssertEqual(chip.display, .marquee(text: "Titre · @auteur"))
    }

    // MARK: - Lecteur (AudioForegroundReaderOverlay)

    func test_reader_aBackgroundSound_hasNoChip_atAnyTimeOfTheSlide() {
        for elapsed in [0.0, 3.0, 6.0] {
            XCTAssertTrue(AudioForegroundReaderOverlay.visibleAudios(in: [background()],
                                                                     elapsed: elapsed,
                                                                     slideDuration: 6).isEmpty)
        }
    }

    // MARK: - Rotation (pastille et export)

    func test_export_theChipCarriesTheRotationChosenInTheComposer() throws {
        var tourné = StoryAudioPlayerObject(id: "rot", x: 0.5, y: 0.5)
        tourné.rotation = 30

        let chip = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: slide([tourné]), into: CanvasGeometry(renderSize: Self.canvas), at: .zero).first)
        let droit = try XCTUnwrap(StoryAudioChipPainter.placements(
            for: slide([StoryAudioPlayerObject(id: "n")]), into: CanvasGeometry(renderSize: Self.canvas),
            at: .zero).first)

        XCTAssertEqual(chip.rotation, 30)
        XCTAssertEqual(droit.rotation, 0, "sans rotation persistée, la pastille reste droite")
        XCTAssertEqual(StoryAudioChipPainter.radians(180), .pi, accuracy: 0.0001)
    }

    /// Une capsule horizontale tournée d'un quart de tour devient verticale :
    /// elle couvre un point AU-DESSUS de son centre qu'elle ne couvrait pas, et
    /// libère un point à sa GAUCHE qu'elle couvrait.
    func test_export_aQuarterTurnedChip_isPaintedUpright() {
        let côté = CGSize(width: 240, height: 240)
        var tourné = StoryAudioPlayerObject(id: "rot", x: 0.5, y: 0.5)
        tourné.rotation = 90
        let auDessus = CGPoint(x: 120, y: 91)
        let àGauche = CGPoint(x: 94, y: 120)

        let droite = ChipCanvas(size: côté, fill: .white)
            .painting(StoryAudioPlayerObject(id: "n", x: 0.5, y: 0.5), at: 0)
        let verticale = ChipCanvas(size: côté, fill: .white).painting(tourné, at: 0)

        func luma(_ canvas: ChipCanvas, _ point: CGPoint) -> Int {
            let c = canvas.rgb(point)
            return (c.r + c.g + c.b) / 3
        }
        XCTAssertGreaterThan(luma(droite, auDessus), 250, "droite, la pastille ne monte pas jusque-là")
        XCTAssertLessThan(luma(verticale, auDessus), 245, "tournée, la pastille couvre ce point")
        XCTAssertLessThan(luma(droite, àGauche), 245, "droite, la pastille couvre son flanc gauche")
        XCTAssertGreaterThan(luma(verticale, àGauche), 250, "tournée, elle l'a quitté")
    }

    func test_theLiveChip_appliesTheSameRotation() throws {
        XCTAssertTrue(try source("Controls/AudioForegroundChip.swift")
            .contains(".rotationEffect(.degrees(audioObject.rotation ?? 0))"))
    }

    // MARK: - La couche de pastilles d'une surface (SceneSoundChipLayer)

    func test_layer_posesOnlyForegroundSounds_inDocumentOrder() {
        let audios = [StoryAudioPlayerObject(id: "a"), background(), StoryAudioPlayerObject(id: "b")]

        XCTAssertEqual(SceneSoundChipLayer.chips(in: audios, visibleIds: nil).map(\.id), ["a", "b"])
        XCTAssertEqual(SceneSoundChipLayer.chips(in: audios, visibleIds: ["b", "bg"]).map(\.id), ["b"],
                       "même listé visible, un son de fond ne devient jamais une pastille")
        XCTAssertTrue(SceneSoundChipLayer.chips(in: [background()], visibleIds: nil).isEmpty)
    }

    func test_layer_keepsTheChipShareOfTheScene_onASmallerSurface() {
        let canvas = SceneSoundChipLayer.referenceCanvas(for: CGSize(width: 195, height: 346))

        XCTAssertEqual(canvas.unit, 0.5, accuracy: 0.0001)
        XCTAssertEqual(canvas.size.width, StoryAudioChipPainter.referenceCanvasWidth)
        XCTAssertEqual(canvas.size.height, 692, accuracy: 0.001)
        XCTAssertEqual(SceneSoundChipLayer.referenceCanvas(for: .zero).unit, 1)
    }

    func test_clock_publishesMembership_onlyAtWindowBoundaries() {
        var tardif = StoryAudioPlayerObject(id: "late")
        tardif.startTime = 2
        tardif.duration = 1
        let clock = SceneSoundChipClock()
        XCTAssertNil(clock.visibleIds, "sans scène remise, la couche montre toutes les pastilles")

        clock.configure(audios: [StoryAudioPlayerObject(id: "always"), tardif, background()], slideDuration: 6)
        XCTAssertEqual(clock.visibleIds, ["always"])
        clock.tick(2.5)
        XCTAssertEqual(clock.visibleIds, ["always", "late"])
        clock.tick(4)
        XCTAssertEqual(clock.visibleIds, ["always"])
    }

    // MARK: - Le player de scène pose les pastilles (réel, carte, mosaïque, galerie)

    private func document(audioPayload: [String: CanvasJSONValue]) -> CanvasV3 {
        CanvasV3(scenes: [SceneV3(id: "s1", objects: [
            ObjectV3(id: "A1", kind: .audio, anchor: .free(x: 0.3, y: 0.7), plane: .content, z: 1,
                     transform: TransformV3(scale: 1, rotation: 15, opacity: 1), payload: audioPayload),
        ])])
    }

    private func player(_ document: CanvasV3, mode: ScenePlayerMode) -> MeeshyScenePlayer {
        MeeshyScenePlayer(document: document, mode: mode, sceneIndex: .constant(0),
                          isPlaying: .constant(false), accentColorHex: "#7C3AED")
    }

    func test_player_aForegroundSoundOfTheScene_reachesTheChipLayer_withItsPose() throws {
        let audios = player(document(audioPayload: ["mediaURL": .string("/son.m4a")]), mode: .reel).sceneAudios

        let chip = try XCTUnwrap(SceneSoundChipLayer.chips(in: audios, visibleIds: nil).first)
        XCTAssertEqual(SceneAudioStageRule.presence(of: chip),
                       .chip(SceneAudioChipPose(x: 0.3, y: 0.7, scale: 1, rotation: 15)))
    }

    func test_player_aBackgroundSoundOfTheScene_posesNoChip() {
        let audios = player(document(audioPayload: ["mediaURL": .string("/son.m4a"), "isBackground": .bool(true)]),
                            mode: .card).sceneAudios

        XCTAssertEqual(audios.count, 1, "le son est bien lu de la scène")
        XCTAssertTrue(SceneSoundChipLayer.chips(in: audios, visibleIds: nil).isEmpty)
    }

    func test_player_aSceneWithoutSound_convertsNothing() {
        XCTAssertFalse(MeeshyScenePlayer.sceneCarriesSound(in: CanvasV3(scenes: [SceneV3(id: "s", objects: [])]),
                                                           sceneIndex: 0))
        XCTAssertFalse(MeeshyScenePlayer.sceneCarriesSound(in: CanvasV3(scenes: []), sceneIndex: 0))
    }

    func test_player_mountsTheChipLayer_overItsCanvas() throws {
        let code = try source("ScenePlayer/MeeshyScenePlayer.swift")

        XCTAssertTrue(code.contains(".overlay { soundChips }"))
        XCTAssertTrue(code.contains("SceneSoundChipLayer(audios: audios, isInteractive: false, isHostMuted: true)"),
                      "la carte du fil : pastilles muettes, sans toucher")
        XCTAssertTrue(code.contains("ClockedSceneSoundChips("), "le réel et le lecteur : fenêtrées sur leur horloge")
        XCTAssertTrue(code.contains("stagesSoundChips: Bool = true"), "par défaut, toute surface les pose")
    }

    // MARK: - Chaque site consulte la règle

    private func source(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/\(relative)")
        return try String(contentsOf: url, encoding: .utf8)
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let mark = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<mark.lowerBound])
            }
            .joined(separator: "\n")
    }

    /// Les sites du SDK qui posent un son sur une scène : le lecteur, la couche
    /// de pastilles, le player, l'export, les deux vignettes, l'atelier.
    func test_everySceneSurface_readsTheStageRule() throws {
        for site in ["Controls/AudioForegroundChip.swift",
                     "Controls/SceneSoundChipLayer.swift",
                     "ScenePlayer/MeeshyScenePlayer.swift",
                     "Canvas/StoryAudioChipPainter.swift",
                     "SceneThumbnail.swift",
                     "SlideMiniPreview.swift",
                     "StoryComposerView+Canvas.swift"] {
            XCTAssertTrue(try source(site).contains("SceneAudioStageRule."),
                          "\(site) pose un son sur une scène sans lire SceneAudioStageRule : " +
                          "un son de fond pourrait y être peint.")
        }
    }

    /// La vignette de slide peignait une note pour CHAQUE objet audio, fond
    /// compris : le son de fond paraissait sur la scène de la bande.
    func test_theSlideThumbnail_doesNotPaintEveryAudioObject() throws {
        XCTAssertFalse(try source("SlideMiniPreview.swift")
            .contains("let pastilles = effects.audioPlayerObjects ?? []"))
    }
}
