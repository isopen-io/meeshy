import XCTest
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// **#6580 — le lecteur sait entrer EN COURS de piste.**
///
/// Le playhead unifié de la scène et la vidéo partagent déjà une horloge ; le
/// mixer du LECTEUR, lui, ne savait entrer dans un fichier qu'au début de sa
/// fenêtre de rognage — `grep "func seek"` sur `ReaderAudioMixer` rendait ZÉRO.
/// Ouvrir le détail d'un post à `t = 3 s` rejouait donc le fond sonore depuis
/// zéro sous une vidéo déjà à 3 s. La jumelle composition
/// (`AudioMixer.scheduleNodeFromTimelineTime`) portait déjà la branche
/// « already past startTime — schedule immediate playback from a file offset » :
/// deux moteurs, une loi, un seul l'appliquait.
///
/// Les témoins portent sur `elapsedInClip > 0`. **Au cas `0` la règle juste et
/// la règle d'avant rendent le MÊME verdict** — un témoin écrit sur `0` ne peut
/// pas tomber, donc il ne mesure rien. `ReaderAudioMixerTrimWindowTests` tient
/// séparément l'autre moitié : à `elapsedInClip: 0`, le résultat est celui
/// d'aujourd'hui, bit à bit.
///
/// Pur : seuls des `Double` / `AVAudioFramePosition` traversent la fonction —
/// ni `AVAudioEngine`, ni fichier réel, ni simulateur.
@MainActor
final class ReaderAudioMixerMidClipEntryTests: XCTestCase {

    private let sampleRate: Double = 48_000
    /// 12 s à 48 kHz.
    private let twelveSecondFile: AVAudioFramePosition = 576_000

    // MARK: - Le cas nominal du porteur : ouvrir le détail à t > 0

    func test_segment_openingMidClip_startsAtTheElapsedOffsetInsideTheWindow() {
        // Fichier de 12 s, clip rogné sur [2 s, 10 s], ouverture 3 s APRÈS le
        // début du clip. La lecture doit commencer à 2 + 3 = 5 s DANS LA SOURCE
        // et courir jusqu'à la fin de la fenêtre (10 s), soit 5 s.
        let bounds = MediaTrimBounds(start: 2, end: 10)
        let result = ReaderAudioMixer.segment(forBounds: bounds,
                                              elapsedInClip: 3,
                                              sampleRate: sampleRate,
                                              fileLength: twelveSecondFile)
        XCTAssertEqual(result?.startingFrame, 48_000 * 5,
                       "L'origine est bounds.start + elapsedInClip = 5 s — jamais bounds.start seul")
        XCTAssertEqual(result?.frameCount, 48_000 * 5,
                       "Il reste 5 s de fenêtre (10 − 5) — jamais la fenêtre entière")
    }

    // MARK: - Sans rognage déclaré, l'écoulé seul suffit à fenêtrer

    func test_segment_openingMidClipWithoutBounds_startsAtTheElapsedOffset() {
        // Le fond sonore legacy n'a pas de fenêtre : il joue le fichier entier.
        // Ouvrir à 4 s doit entrer à 4 s dans le fichier, pas le rejouer depuis 0.
        let result = ReaderAudioMixer.segment(forBounds: nil,
                                              elapsedInClip: 4,
                                              sampleRate: sampleRate,
                                              fileLength: twelveSecondFile)
        XCTAssertEqual(result?.startingFrame, 48_000 * 4)
        XCTAssertEqual(result?.frameCount, 48_000 * 8,
                       "La fin est celle du FICHIER (12 s) quand aucune borne n'est déclarée")
    }

    // MARK: - L'origine passée la fin ⇒ rien, surtout pas un départ à zéro

    func test_segment_openingPastTheWindowEnd_returnsNil() {
        // Fenêtre [2 s, 10 s] et ouverture 9 s après le début du clip : l'origine
        // tombe à 11 s, au-delà de la fin. `nil` dit à `scheduleAudio` de ne RIEN
        // planifier — le repli `scheduleFile` rejouerait le fichier depuis zéro
        // sous une vidéo déjà à t, exactement le défaut que ce lot corrige.
        let bounds = MediaTrimBounds(start: 2, end: 10)
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds,
                                              elapsedInClip: 9,
                                              sampleRate: sampleRate,
                                              fileLength: twelveSecondFile))
    }

    func test_segment_openingPastTheFileEnd_returnsNil() {
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: nil,
                                              elapsedInClip: 13,
                                              sampleRate: sampleRate,
                                              fileLength: twelveSecondFile),
                     "Une ouverture au-delà de la fin du fichier ne planifie rien")
    }

    // MARK: - Garde-fous

    func test_segment_nonFiniteElapsed_returnsNil() {
        let bounds = MediaTrimBounds(start: 2, end: 10)
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds,
                                              elapsedInClip: .nan,
                                              sampleRate: sampleRate,
                                              fileLength: twelveSecondFile))
        XCTAssertNil(ReaderAudioMixer.segment(forBounds: bounds,
                                              elapsedInClip: .infinity,
                                              sampleRate: sampleRate,
                                              fileLength: twelveSecondFile))
    }

    func test_segment_negativeElapsed_behavesLikeZero() {
        // `max(0, elapsedInClip)` : un écoulé négatif (playhead avant le clip)
        // ne recule jamais l'origine sous le début de la fenêtre.
        let bounds = MediaTrimBounds(start: 2, end: 10)
        let negative = ReaderAudioMixer.segment(forBounds: bounds,
                                                elapsedInClip: -5,
                                                sampleRate: sampleRate,
                                                fileLength: twelveSecondFile)
        let zero = ReaderAudioMixer.segment(forBounds: bounds,
                                            elapsedInClip: 0,
                                            sampleRate: sampleRate,
                                            fileLength: twelveSecondFile)
        XCTAssertEqual(negative?.startingFrame, zero?.startingFrame)
        XCTAssertEqual(negative?.frameCount, zero?.frameCount)
    }

    // MARK: - L'horloge du chip ne compte pas la pause comme du temps joué

    func test_originAfterResume_shiftsTheOriginByThePausedSpan() {
        // `slideElapsedSeconds` se mesure contre une origine MURALE. Sans
        // glissement, une pause de 500 ticks faisait avancer de 500 ticks le
        // temps que le chip audio affiche — alors que rien n'a joué.
        let shifted = ReaderAudioMixer.originAfterResume(origin: 1_000,
                                                         pausedAt: 4_000,
                                                         resumedAt: 4_500)
        XCTAssertEqual(shifted, 1_500, "L'origine glisse exactement de la durée de la pause")
    }

    func test_originAfterResume_nonMonotonicClock_leavesTheOriginUntouched() {
        // Jalon périmé / horloge non monotone : un écoulé trop grand est un
        // défaut d'affichage, un écoulé NÉGATIF est un crash de soustraction
        // non signée. On rend l'origine inchangée.
        XCTAssertEqual(ReaderAudioMixer.originAfterResume(origin: 1_000,
                                                          pausedAt: 4_000,
                                                          resumedAt: 3_000), 1_000)
        XCTAssertEqual(ReaderAudioMixer.originAfterResume(origin: 1_000,
                                                          pausedAt: 4_000,
                                                          resumedAt: 4_000), 1_000)
    }

    func test_originAfterResume_overflow_leavesTheOriginUntouched() {
        XCTAssertEqual(ReaderAudioMixer.originAfterResume(origin: .max - 10,
                                                          pausedAt: 0,
                                                          resumedAt: 1_000), .max - 10)
    }

    // MARK: - La MÊME loi sert les deux moteurs

    func test_sharedLaw_isTheOneTheReaderProjects() {
        // `ReaderAudioMixer.segment` n'a plus de règle à elle : elle PROJETTE le
        // site partagé que `AudioMixer.scheduleNodeFromTimelineTime` applique
        // aussi. Si l'une des deux se remet à écrire sa propre boucle, ce témoin
        // le dit — c'est la divergence de `hostTime(forDelaySeconds:)` qui avait
        // laissé le lecteur sans entrée en cours de piste.
        let bounds = MediaTrimBounds(start: 1, end: 6)
        let projected = ReaderAudioMixer.segment(forBounds: bounds,
                                                 elapsedInClip: 2,
                                                 sampleRate: sampleRate,
                                                 fileLength: twelveSecondFile)
        let shared = TimelineAudioWindow.segment(bounds: bounds,
                                                 elapsedInClip: 2,
                                                 sampleRate: sampleRate,
                                                 fileLength: twelveSecondFile)
        XCTAssertEqual(projected?.startingFrame, shared?.startingFrame)
        XCTAssertEqual(projected?.frameCount, shared?.frameCount)
        XCTAssertEqual(shared?.startingFrame, 48_000 * 3)
    }
}
