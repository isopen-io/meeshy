import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Le chrono de la puce son boucle avec son son** (#16294, jumelle Android
/// #16293) : la position dans la passe qui sonne, revenue à zéro à chaque tour
/// quand le son boucle — la loi du mixeur (`ReaderAudioLoopPolicy`,
/// `ReaderLoopLaw`), lue sur l'écoulé de la slide.
final class SceneAudioChipClockTests: XCTestCase {

    private func son(startTime: Float? = nil, duration: Float? = nil,
                     sourceStart: Double? = nil, sourceEnd: Double? = nil,
                     loop: Bool? = nil, isBackground: Bool? = nil) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "s", isBackground: isBackground, startTime: startTime, duration: duration,
                               loop: loop, sourceStart: sourceStart, sourceEnd: sourceEnd)
    }

    func test_passSeconds_fenetreDeRognage_estLaPasse() throws {
        let pass = try XCTUnwrap(SceneAudioChipClock.passSeconds(of: son(duration: 20, sourceStart: 2, sourceEnd: 7)))
        XCTAssertEqual(pass, 5, accuracy: 1e-9)
    }

    func test_passSeconds_sansFenetre_estLaDureeOccupee() throws {
        XCTAssertEqual(try XCTUnwrap(SceneAudioChipClock.passSeconds(of: son(duration: 4))), 4, accuracy: 1e-9)
    }

    func test_passSeconds_sansRien_estInconnue() {
        XCTAssertNil(SceneAudioChipClock.passSeconds(of: son()))
    }

    func test_position_sonQuiBoucle_revientAZeroEnFinDePasse() {
        let timing = SceneAudioChipTiming(audio: son(sourceStart: 0, sourceEnd: 5, loop: true))
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 4.5), 4.5, accuracy: 1e-9)
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 5), 0, accuracy: 1e-9)
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 12), 2, accuracy: 1e-9)
    }

    func test_position_compteDepuisLEntreeSurLaScene() {
        let timing = SceneAudioChipTiming(audio: son(startTime: 3, sourceEnd: 5, loop: true))
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 2), 0, accuracy: 1e-9)
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 9), 1, accuracy: 1e-9)
    }

    func test_position_clipJoueUneFois_sArreteEnFinDePasse() {
        let timing = SceneAudioChipTiming(audio: son(sourceEnd: 5, loop: false))
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 8), 5, accuracy: 1e-9)
    }

    func test_position_auCompositeur_chaqueSonBoucle() {
        let timing = SceneAudioChipTiming(audio: son(sourceEnd: 5, loop: false))
        XCTAssertEqual(timing.positionSeconds(slideElapsed: 8, isEditPreview: true), 3, accuracy: 1e-9)
    }

    func test_position_horlogeCassee_litZero() {
        let timing = SceneAudioChipTiming(audio: son(sourceEnd: 5, loop: true))
        XCTAssertEqual(timing.positionSeconds(slideElapsed: .nan), 0)
    }

    func test_label_minutesEtSecondesTronquees() {
        XCTAssertEqual(SceneAudioChipClock.label(0), "0:00")
        XCTAssertEqual(SceneAudioChipClock.label(9.99), "0:09")
        XCTAssertEqual(SceneAudioChipClock.label(75.2), "1:15")
        XCTAssertEqual(SceneAudioChipClock.label(-3), "0:00")
        XCTAssertEqual(SceneAudioChipClock.label(.infinity), "0:00")
    }

    /// Une seule loi de boucle : le chrono reprend celle du mixeur, jamais une
    /// copie qui divergerait au premier ajustement.
    func test_laBoucle_estCelleDuMixeur() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Story/Controls/SceneAudioChipClock.swift")
        let code = try String(contentsOf: url, encoding: .utf8)
        XCTAssertTrue(code.contains("ReaderAudioLoopPolicy.loops("))
        XCTAssertTrue(code.contains("ReaderLoopLaw.elapsedInPass("))
    }

    /// La puce peinte (canvas, export) porte le même chrono que la vue.
    func test_painter_chrono_boucleAvecLeSon() {
        let audio = son(startTime: 2, sourceStart: 0, sourceEnd: 5, loop: true)
        XCTAssertEqual(StoryAudioChipPainter.chrono(of: audio, elapsed: 3), 3, accuracy: 1e-9)
        XCTAssertEqual(StoryAudioChipPainter.chrono(of: audio, elapsed: 6), 1, accuracy: 1e-9)
    }

    func test_placement_reserveLaPlaceDuChrono() {
        let placement = StoryAudioChipPlacement(audioId: "s", center: .zero, unit: 1, display: .waveform,
                                                rotation: 0, muted: false, elapsed: 0, chrono: 4)
        XCTAssertEqual(placement.chronoFrame.minX, placement.contentFrame.maxX + 8, accuracy: 1e-9)
        XCTAssertEqual(placement.chronoFrame.maxX, placement.frame.maxX - 12, accuracy: 1e-9)
    }
}
