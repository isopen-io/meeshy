import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// L'automation n'a de valeur que si le volume SUIT le playhead. Ces tests
/// pilotent le temps à la main plutôt que d'attendre un display-link réel.
@MainActor
final class StoryCanvasVolumeTrackingTests: XCTestCase {

    func test_backgroundVideoVolumeFollowsKeyframes() {
        let canvas = Self.makeCanvas(backgroundVolume: 1.0, keyframes: [
            StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
            StoryKeyframe(time: 4, volume: 0.0, easing: .linear),
        ])

        canvas.applyVolumeAutomation(at: 0)
        XCTAssertEqual(canvas.backgroundLayer.volume, 1.0, accuracy: 0.01)

        canvas.applyVolumeAutomation(at: 2)
        XCTAssertEqual(canvas.backgroundLayer.volume, 0.5, accuracy: 0.05)

        canvas.applyVolumeAutomation(at: 4)
        XCTAssertEqual(canvas.backgroundLayer.volume, 0.0, accuracy: 0.05)
    }

    func test_withoutKeyframes_volumeStaysAtBase() {
        let canvas = Self.makeCanvas(backgroundVolume: 0.7, keyframes: nil)

        canvas.applyVolumeAutomation(at: 0)
        canvas.applyVolumeAutomation(at: 9)
        XCTAssertEqual(canvas.backgroundLayer.volume, 0.7, accuracy: 0.01)
    }

    /// Sans audio de fond, aucune atténuation : il n'y a rien à protéger.
    func test_noDuckingWithoutBackgroundAudio() {
        let canvas = Self.makeCanvas(backgroundVolume: 1.0, keyframes: nil)
        canvas.videoHasAudioTrack["bg-media"] = true

        XCTAssertFalse(canvas.shouldDuckVideoAudio(effects: canvas.slide.effects))
    }

    /// Avec un audio de fond ET une vidéo sonore, l'atténuation s'applique.
    func test_duckingWhenBackgroundAudioMeetsAudibleVideo() {
        let canvas = Self.makeCanvas(backgroundVolume: 1.0,
                                     keyframes: nil,
                                     withBackgroundAudio: true)
        canvas.videoHasAudioTrack["bg-media"] = true

        XCTAssertTrue(canvas.shouldDuckVideoAudio(effects: canvas.slide.effects))

        canvas.applyVolumeAutomation(at: 1)
        XCTAssertEqual(canvas.backgroundLayer.volume,
                       StoryVolume.duckingFactor, accuracy: 0.01)
    }

    /// Une vidéo muette ne déclenche rien — atténuer sur une hypothèse ferait
    /// baisser une musique sans raison.
    func test_noDuckingWhenVideoHasNoAudioTrack() {
        let canvas = Self.makeCanvas(backgroundVolume: 1.0,
                                     keyframes: nil,
                                     withBackgroundAudio: true)
        canvas.videoHasAudioTrack["bg-media"] = false

        XCTAssertFalse(canvas.shouldDuckVideoAudio(effects: canvas.slide.effects))
    }

    /// Une vidéo pas encore sondée est traitée comme muette.
    func test_noDuckingBeforeProbeCompletes() {
        let canvas = Self.makeCanvas(backgroundVolume: 1.0,
                                     keyframes: nil,
                                     withBackgroundAudio: true)

        XCTAssertFalse(canvas.shouldDuckVideoAudio(effects: canvas.slide.effects))
    }

    /// Le clip qui coupe l'atténuation garde son niveau, alors même que la
    /// slide remplit toutes les conditions du ducking. Sans cette garde, la
    /// bascule de la fiche n'aurait aucun effet audible.
    func test_clipOptOut_keepsFullVolumeDespiteBackgroundAudio() {
        let canvas = Self.makeCanvas(backgroundVolume: 1.0,
                                     keyframes: nil,
                                     withBackgroundAudio: true,
                                     duckingDisabled: true)
        canvas.videoHasAudioTrack["bg-media"] = true

        // Le contexte de la slide reste celui d'une atténuation…
        XCTAssertTrue(canvas.shouldDuckVideoAudio(effects: canvas.slide.effects))
        // …mais ce clip-ci s'en exclut.
        canvas.applyVolumeAutomation(at: 1)
        XCTAssertEqual(canvas.backgroundLayer.volume, 1.0, accuracy: 0.01)
    }

    /// Le sondage doit répondre `false` sur un fichier illisible plutôt que
    /// de lever ou de bloquer.
    func test_assetProbe_returnsFalseForUnreadableAsset() async {
        let url = URL(fileURLWithPath: "/dev/null/absent.mp4")
        let hasAudio = await StoryCanvasUIView.assetHasAudioTrack(url: url)
        XCTAssertFalse(hasAudio)
    }

    // MARK: - Helpers

    private static func makeCanvas(backgroundVolume: Float,
                                   keyframes: [StoryKeyframe]?,
                                   withBackgroundAudio: Bool = false,
                                   duckingDisabled: Bool? = nil) -> StoryCanvasUIView {
        var media = StoryMediaObject(id: "bg-media",
                                     postMediaId: "pm-1",
                                     kind: .video,
                                     aspectRatio: 9.0 / 16.0,
                                     isBackground: true)
        media.volume = backgroundVolume
        media.keyframes = keyframes
        media.isDuckingDisabled = duckingDisabled

        var effects = StoryEffects()
        effects.mediaObjects = [media]
        if withBackgroundAudio {
            effects.audioPlayerObjects = [
                StoryAudioPlayerObject(id: "bg-audio", postMediaId: "pm-2", isBackground: true)
            ]
        }
        let slide = StorySlide(id: "s1", content: "", effects: effects)
        return StoryCanvasUIView(slide: slide, mode: .edit)
    }
}
