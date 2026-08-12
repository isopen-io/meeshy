import XCTest
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// L'export doit rendre AUDIBLE la même automation que la lecture. Les rampes
/// sont la seule façon d'exprimer une courbe dans un `AVAudioMix`.
final class StoryExporterVolumeRampTests: XCTestCase {

    func test_noKeyframes_yieldsSingleConstantRamp() {
        let ramps = StoryExporter.volumeRamps(base: 0.6, keyframes: nil, duration: 5)
        XCTAssertEqual(ramps.count, 1)
        XCTAssertEqual(ramps[0].1, 0.6, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, 0.6, accuracy: 0.001)
        XCTAssertEqual(ramps[0].0.duration.seconds, 5, accuracy: 0.001)
    }

    func test_twoPoints_yieldOneRampBetweenThem() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 4, volume: 0.2, easing: .linear)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 4)

        XCTAssertEqual(ramps.count, 1)
        XCTAssertEqual(ramps[0].1, 1.0, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, 0.2, accuracy: 0.001)
        XCTAssertEqual(ramps[0].0.start.seconds, 0, accuracy: 0.001)
        XCTAssertEqual(ramps[0].0.duration.seconds, 4, accuracy: 0.001)
    }

    func test_threePoints_yieldTwoConsecutiveRamps() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 2, volume: 0.2, easing: .linear),
                      StoryKeyframe(time: 6, volume: 1.0, easing: .linear)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 6)

        XCTAssertEqual(ramps.count, 2)
        XCTAssertEqual(ramps[1].1, 0.2, accuracy: 0.001)
        XCTAssertEqual(ramps[1].2, 1.0, accuracy: 0.001)
    }

    /// Un gain supérieur à 1 doit survivre jusqu'à l'export : c'est là qu'il
    /// est réellement applicable, `AVAudioMix` n'étant pas borné à 1.
    func test_gainAboveOneReachesTheRamp() {
        let ramps = StoryExporter.volumeRamps(base: 1.8, keyframes: nil, duration: 3)
        XCTAssertEqual(ramps[0].1, 1.8, accuracy: 0.001)
    }

    func test_pointsAboveCeilingAreClamped() {
        let frames = [StoryKeyframe(time: 0, volume: 9.0),
                      StoryKeyframe(time: 2, volume: 0.5)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 2)
        XCTAssertEqual(ramps[0].1, StoryVolume.maxGain, accuracy: 0.001)
    }

    /// Les points non triés doivent produire des rampes chronologiques.
    func test_unsortedPointsProduceOrderedRamps() {
        let frames = [StoryKeyframe(time: 4, volume: 0.2),
                      StoryKeyframe(time: 0, volume: 1.0)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 4)
        XCTAssertEqual(ramps[0].0.start.seconds, 0, accuracy: 0.001)
        XCTAssertEqual(ramps[0].1, 1.0, accuracy: 0.001)
    }

    /// Un seul point se comporte comme un niveau constant.
    func test_singlePointBehavesAsConstant() {
        let frames = [StoryKeyframe(time: 1, volume: 0.35)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames, duration: 5)
        XCTAssertEqual(ramps.count, 1)
        XCTAssertEqual(ramps[0].1, 0.35, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, 0.35, accuracy: 0.001)
    }

    // MARK: - Atténuation

    /// L'export ignorait le ducking : la musique passait sous la vidéo dans le
    /// fichier produit alors qu'elle était dégagée dans la preview.
    func test_duckingAttenuatesTheConstantRamp() {
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: nil,
                                              duration: 5, isDucking: true)
        XCTAssertEqual(ramps[0].1, StoryVolume.duckingFactor, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, StoryVolume.duckingFactor, accuracy: 0.001)
    }

    /// L'atténuation multiplie l'automation, elle ne la remplace pas : la
    /// courbe garde sa forme, un cran plus bas.
    func test_duckingScalesEveryPointOfTheCurve() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 4, volume: 0.4, easing: .linear)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames,
                                              duration: 4, isDucking: true)

        XCTAssertEqual(ramps[0].1, 1.0 * StoryVolume.duckingFactor, accuracy: 0.001)
        XCTAssertEqual(ramps[0].2, 0.4 * StoryVolume.duckingFactor, accuracy: 0.001)
    }

    /// L'atténuation s'applique APRÈS le plafond, pas avant : sans cet ordre,
    /// un point à 900 % ressortirait au niveau nominal au lieu du quart.
    func test_duckingAppliesAfterTheCeiling() {
        let frames = [StoryKeyframe(time: 0, volume: 9.0)]
        let ramps = StoryExporter.volumeRamps(base: 1.0, keyframes: frames,
                                              duration: 2, isDucking: true)
        XCTAssertEqual(ramps[0].1,
                       StoryVolume.maxGain * StoryVolume.duckingFactor, accuracy: 0.001)
    }

    func test_withoutDucking_levelsAreUntouched() {
        let ramps = StoryExporter.volumeRamps(base: 0.8, keyframes: nil,
                                              duration: 3, isDucking: false)
        XCTAssertEqual(ramps[0].1, 0.8, accuracy: 0.001)
    }

    // MARK: - Périmètre de l'atténuation à l'export

    private func slide(withBackgroundAudio: Bool,
                       foregroundAudio: Bool = false) -> StorySlide {
        var effects = StoryEffects()
        if withBackgroundAudio {
            effects.audioPlayerObjects = [
                StoryAudioPlayerObject(id: "a1", postMediaId: "m1", isBackground: true)
            ]
        } else if foregroundAudio {
            effects.audioPlayerObjects = [
                StoryAudioPlayerObject(id: "a1", postMediaId: "m1", isBackground: false)
            ]
        }
        return StorySlide(id: "s1", content: "", effects: effects)
    }

    func test_backgroundAudioLaneTriggersTheDucking() {
        XCTAssertTrue(StoryExporter.exportCarriesBackgroundAudio(
            slide: slide(withBackgroundAudio: true)))
    }

    func test_foregroundAudioDoesNotTriggerTheDucking() {
        XCTAssertFalse(StoryExporter.exportCarriesBackgroundAudio(
            slide: slide(withBackgroundAudio: false, foregroundAudio: true)))
    }

    /// L'audio de fond LEGACY (`backgroundAudioId`) n'est pas exporté par
    /// `composeAudioLanes` : atténuer pour lui rendrait l'export plus sourd que
    /// la preview, sans rien dégager.
    func test_legacyBackgroundAudioDoesNotTriggerTheDucking() {
        var effects = StoryEffects()
        effects.backgroundAudioId = "legacy-media"
        let legacy = StorySlide(id: "s1", content: "", effects: effects)

        XCTAssertNotNil(legacy.effects.resolvedBackgroundAudio)
        XCTAssertFalse(StoryExporter.exportCarriesBackgroundAudio(slide: legacy))
    }
}
