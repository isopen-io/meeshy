import XCTest
import UIKit
import SwiftUI
import CoreMedia
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// **#6580 / D3 — la position voyage de la carte au détail.**
///
/// `onPlaybackTime` existait, était câblé jusqu'à `StoryCanvasUIView`, et
/// n'avait ZÉRO site d'appel (`grep "\.onPlaybackTime("` ⇒ exit 1) : une loi
/// qui calcule une valeur que personne ne lit. Ouvrir le détail d'un post en
/// lecture repartait donc de zéro — vidéo comme fond sonore.
///
/// La position sème `StoryCanvasUIView.currentTime`, la SEULE horloge que la
/// vidéo suit déjà (`alignToTimelineThenPlay` lit `slidePlayheadSeconds`,
/// poussé depuis elle) et que `captureSlideTimelineAnchor()` remet au mixer.
/// Aucune quatrième horloge n'est créée.
///
/// **D3 est inutile sans D1** : semer `currentTime` à `t > 0` sans que l'audio
/// sache entrer à `t` rejouerait le son depuis zéro pendant que la vidéo est à
/// `t`. C'est pourquoi le témoin central ici est celui de la JONCTION —
/// l'ancre remise au mixer porte bien l'écoulé.
@MainActor
final class ReaderStartAtPositionTests: XCTestCase {

    private func slide(duration: TimeInterval = 10) -> StorySlide {
        var effects = StoryEffects()
        effects.background = "#112233"
        return StorySlide(id: "slide-start-at", effects: effects, duration: duration)
    }

    private func canvas(duration: TimeInterval = 10) -> StoryCanvasUIView {
        StoryCanvasUIView(slide: slide(duration: duration), mode: .play)
    }

    // MARK: - La position sème le playhead unifié

    func test_seedPlayhead_movesTheOneClockTheVideoFollows() {
        let view = canvas()
        view.seedPlayhead(3)
        XCTAssertEqual(view.currentTime.seconds, 3, accuracy: 0.0001,
                       "Le playhead unifié — pas une horloge de plus")
    }

    func test_seedPlayhead_reachesTheAudioAnchor() {
        // LA JONCTION avec D1 : ce que le canvas remet au mixer doit porter
        // l'écoulé, sinon chaque clip repart du début de sa fenêtre sous une
        // vidéo déjà à `t`.
        let view = canvas()
        view.seedPlayhead(3)
        XCTAssertEqual(view.captureSlideTimelineAnchor().slideElapsed, 3, accuracy: 0.0001,
                       "L'ancre audio porte l'écoulé de la slide, pas seulement une origine back-datée")
    }

    func test_seedPlayhead_clampsToTheSlideDuration() {
        let view = canvas(duration: 4)
        view.seedPlayhead(99)
        XCTAssertLessThanOrEqual(view.currentTime.seconds, view.effectiveSlideTotalDuration)
    }

    // MARK: - Le défaut, c'est zéro : toute surface existante est inchangée

    func test_seedPlayhead_zeroNegativeOrNonFinite_isANoOp() {
        for seeded in [0, -3, Double.nan, .infinity] {
            let view = canvas()
            view.seedPlayhead(seeded)
            XCTAssertEqual(view.currentTime.seconds, 0, accuracy: 0.0001,
                           "Semer \(seeded) ne doit rien changer — le défaut reste l'ouverture à zéro")
            XCTAssertEqual(view.captureSlideTimelineAnchor().slideElapsed, 0, accuracy: 0.0001)
        }
    }

    // MARK: - La valeur voyage jusqu'à l'hôte du canvas

    func test_startAt_travelsFromTheScenePlayerToItsCanvasHost() {
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: []),
                                       mode: .reader,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(true),
                                       accentColorHex: "#7C3AED",
                                       startAt: 4.5)
        XCTAssertEqual(player.host.startAt, 4.5,
                       "Le player ne garde pas la position pour lui — elle descend au canvas")
    }

    func test_startAt_defaultsToZeroOnEverySurface() {
        let player = MeeshyScenePlayer(document: CanvasV3(scenes: []),
                                       mode: .card,
                                       sceneIndex: .constant(0),
                                       isPlaying: .constant(false),
                                       accentColorHex: "#7C3AED")
        XCTAssertEqual(player.host.startAt, 0)
        XCTAssertEqual(StoryReaderRepresentable(story: StoryItem(id: "s"), mute: true).startAt, 0)
    }
}
