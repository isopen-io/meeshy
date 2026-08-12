import XCTest
import SwiftUI
@testable import MeeshyUI
@testable import MeeshySDK

/// Les barres de piste sont montées avec `.equatable()` : SwiftUI saute le
/// corps quand `==` répond vrai. Une courbe de volume qui ne fait pas partie
/// de la comparaison ne se redessinerait donc JAMAIS après l'ajout d'un point.
@MainActor
final class ClipBarVolumeCurveTests: XCTestCase {

    private let geo = TimelineGeometry(zoomScale: 1.0)
    private let noop: () -> Void = {}
    private let noopc: (CGFloat) -> Void = { _ in }

    private func makeVideo(keyframes: [StoryKeyframe]) -> VideoClipBar {
        VideoClipBar(
            clipId: "v1", title: "Clip", startTime: 0, duration: 4,
            fadeIn: 0, fadeOut: 0, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 52, frames: [],
            keyframes: keyframes,
            onTap: noop, onDoubleTap: noop,
            onTrimStartDelta: noopc, onTrimEndDelta: noopc, onMoveDelta: noopc
        )
    }

    private func makeAudio(keyframes: [StoryKeyframe]) -> AudioClipBar {
        AudioClipBar(
            clipId: "a1", title: "Audio", startTime: 0, duration: 8,
            volume: 1.0, isMuted: false, isSelected: false, isLocked: false,
            isDark: false, geometry: geo, laneHeight: 52, waveformSamples: [],
            keyframes: keyframes,
            onTap: noop, onDoubleTap: noop, onMoveDelta: noopc
        )
    }

    // MARK: - Signature des points de volume

    func test_signature_ignoresKeyframesWithoutVolume() {
        let frames = [StoryKeyframe(time: 1, x: 0.5), StoryKeyframe(time: 2, opacity: 0.3)]
        XCTAssertTrue(VolumeCurveOverlay.volumeSignature(frames).isEmpty)
    }

    func test_signature_changesWhenALevelChanges() {
        let a = VolumeCurveOverlay.volumeSignature([StoryKeyframe(time: 1, volume: 0.8)])
        let b = VolumeCurveOverlay.volumeSignature([StoryKeyframe(time: 1, volume: 0.3)])
        XCTAssertNotEqual(a, b)
    }

    func test_signature_changesWhenAPointMoves() {
        let a = VolumeCurveOverlay.volumeSignature([StoryKeyframe(time: 1, volume: 0.8)])
        let b = VolumeCurveOverlay.volumeSignature([StoryKeyframe(time: 3, volume: 0.8)])
        XCTAssertNotEqual(a, b)
    }

    /// L'identité du point n'entre pas dans la signature : deux points au même
    /// instant et au même niveau dessinent la même courbe, et redessiner sur un
    /// simple changement d'`id` serait du travail perdu à chaque image.
    func test_signature_ignoresIdentity() {
        let a = VolumeCurveOverlay.volumeSignature([StoryKeyframe(id: "k1", time: 1, volume: 0.8)])
        let b = VolumeCurveOverlay.volumeSignature([StoryKeyframe(id: "k2", time: 1, volume: 0.8)])
        XCTAssertEqual(a, b)
    }

    // MARK: - Propagation dans les barres

    func test_videoClipBar_notEqual_whenAVolumePointIsAdded() {
        let before = makeVideo(keyframes: [])
        let after = makeVideo(keyframes: [StoryKeyframe(time: 2, volume: 0.4)])
        XCTAssertNotEqual(before, after,
                          "Sans ça, la courbe ne réapparaîtrait qu'au prochain changement d'une autre prop")
    }

    func test_audioClipBar_notEqual_whenAVolumePointIsAdded() {
        let before = makeAudio(keyframes: [])
        let after = makeAudio(keyframes: [StoryKeyframe(time: 2, volume: 0.4)])
        XCTAssertNotEqual(before, after)
    }

    /// À l'inverse, un point de POSITION ne touche pas la courbe de volume :
    /// invalider la barre pour lui serait un redessin inutile.
    func test_videoClipBar_stillEqual_whenANonVolumePointIsAdded() {
        let before = makeVideo(keyframes: [])
        let after = makeVideo(keyframes: [StoryKeyframe(time: 2, x: 0.5)])
        XCTAssertEqual(before, after)
    }

    // MARK: - Priorité des sources de forme d'onde (AudioClipBar)

    /// Inversion de priorité : le calcul local est en haute résolution et à
    /// l'amplitude réelle, les 80 valeurs publiées sont normalisées au pic.
    /// C'est le local qui doit gagner dès qu'il a abouti.
    func test_localSamplesWinOverPublishedOnes() {
        let resolved = AudioClipBar.resolveSamples(local: [0.4, 0.5], published: [0.9, 0.9, 0.9])
        XCTAssertEqual(resolved, [0.4, 0.5])
    }

    /// Repli indispensable : un repost ou un brouillon restauré n'a pas de
    /// fichier local, seules les valeurs publiées existent.
    func test_publishedSamplesRemainTheFallback() {
        let resolved = AudioClipBar.resolveSamples(local: [], published: [0.9, 0.2])
        XCTAssertEqual(resolved, [0.9, 0.2])
    }

    func test_noSourceAtAll_yieldsNothing() {
        XCTAssertTrue(AudioClipBar.resolveSamples(local: [], published: []).isEmpty)
    }
}
