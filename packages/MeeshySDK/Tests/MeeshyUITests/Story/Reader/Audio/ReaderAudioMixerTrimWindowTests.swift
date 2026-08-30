import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// `ReaderAudioMixer.segment(forBounds:sampleRate:fileLength:)` — la conversion
/// PURE secondes → frames que `scheduleAudio` (site unique de `scheduleEntry`,
/// `rescheduleLoopedEntry` ET `scheduleBackgroundFile`) consulte pour décider
/// entre `AVAudioPlayerNode.scheduleSegment` (clip rogné) et `scheduleFile`
/// (repli, comportement d'aujourd'hui). Éprouvable sans `AVAudioEngine` ni
/// fichier réel : seuls des `Double` / `AVAudioFramePosition` traversent la
/// fonction — même famille que `AudioMixer.scheduleNodeFromTimelineTime`, dont
/// elle copie la conversion (secondes × `sampleRate`, comparée à `file.length`).
///
/// Issue #4082 — `MediaTrimBounds` / `StoryAudioPlayerObject.trimBounds(sourceDuration:)`
/// existaient déjà côté modèle (`MediaTrimRule.swift`) mais n'étaient consommés
/// par aucun lecteur audio ; ce fichier verrouille le comportement du lecteur.
@MainActor
final class ReaderAudioMixerTrimWindowTests: XCTestCase {

    private let sampleRate: Double = 48_000

    // MARK: - Fenêtre nominale

    func test_segment_nominalWindow_returnsExpectedFrames() {
        let bounds = MediaTrimBounds(start: 2, end: 5)
        let result = ReaderAudioMixer.segment(forBounds: bounds, sampleRate: sampleRate, fileLength: 480_000)
        XCTAssertEqual(result?.startingFrame, 96_000, "2s × 48kHz = 96 000 frames")
        XCTAssertEqual(result?.frameCount, 144_000, "3s de fenêtre (5-2) × 48kHz = 144 000 frames")
    }

    // MARK: - nil/nil ⇒ pas de segment (donc scheduleFile)

    func test_segment_noBoundsDeclared_returnsNil() {
        let result = ReaderAudioMixer.segment(forBounds: nil, sampleRate: sampleRate, fileLength: 480_000)
        XCTAssertNil(result, "Aucune fenêtre déclarée doit retomber sur scheduleFile — jamais scheduleSegment")
    }

    // MARK: - Bornes inversées

    func test_segment_invertedBounds_returnsNil() {
        let inverted = MediaTrimBounds(start: 5, end: 2)
        let result = ReaderAudioMixer.segment(forBounds: inverted, sampleRate: sampleRate, fileLength: 480_000)
        XCTAssertNil(result, "end <= start est aberrant — repli source entière, jamais un clip inversé")
    }

    func test_segment_zeroDurationBounds_returnsNil() {
        let empty = MediaTrimBounds(start: 3, end: 3)
        let result = ReaderAudioMixer.segment(forBounds: empty, sampleRate: sampleRate, fileLength: 480_000)
        XCTAssertNil(result, "Une fenêtre de durée nulle ne peut produire aucun frameCount jouable")
    }

    // MARK: - Borne au-delà de la durée du fichier

    func test_segment_startBeyondFileLength_returnsNil() {
        // Fichier de 1s (48 000 frames) mais fenêtre commençant à 10s — bornes
        // vieillies (source remplacée par un fichier plus court après le
        // rognage). Une donnée vieillie ne doit JAMAIS produire un silence :
        // le repli est `nil` ⇒ l'appelant rejoue la source ENTIÈRE via
        // scheduleFile, jamais un `scheduleSegment` hors bornes.
        let aged = MediaTrimBounds(start: 10, end: 12)
        let result = ReaderAudioMixer.segment(forBounds: aged, sampleRate: sampleRate, fileLength: 48_000)
        XCTAssertNil(result, "Une donnée vieillie ne doit JAMAIS produire un silence — repli scheduleFile")
    }

    func test_segment_endBeyondFileLength_clampsToFileEnd() {
        // `start` valide, `end` au-delà de la fin réelle : on clippe à la fin
        // du fichier plutôt que de rejeter toute la fenêtre.
        let bounds = MediaTrimBounds(start: 1, end: 100)
        let result = ReaderAudioMixer.segment(forBounds: bounds, sampleRate: sampleRate, fileLength: 96_000) // fichier de 2s
        XCTAssertEqual(result?.startingFrame, 48_000)
        XCTAssertEqual(result?.frameCount, 48_000,
                       "La fenêtre doit être clippée à la fin réelle du fichier (2s), pas la fin demandée (100s)")
    }

    // MARK: - Fichier de longueur 0

    func test_segment_zeroLengthFile_returnsNil() {
        let bounds = MediaTrimBounds(start: 0, end: 1)
        let result = ReaderAudioMixer.segment(forBounds: bounds, sampleRate: sampleRate, fileLength: 0)
        XCTAssertNil(result, "Un fichier de longueur 0 ne peut produire aucun segment jouable")
    }

    // MARK: - Garde-fous additionnels

    func test_segment_invalidSampleRate_returnsNil() {
        let bounds = MediaTrimBounds(start: 0, end: 1)
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds, sampleRate: 0, fileLength: 48_000))
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds, sampleRate: -48_000, fileLength: 48_000))
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds, sampleRate: .nan, fileLength: 48_000))
    }

    func test_segment_negativeStart_returnsNil() {
        let bounds = MediaTrimBounds(start: -1, end: 5)
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds, sampleRate: sampleRate, fileLength: 480_000),
                     "Une borne de départ négative est aberrante — jamais un scheduleSegment mal formé")
    }
}
