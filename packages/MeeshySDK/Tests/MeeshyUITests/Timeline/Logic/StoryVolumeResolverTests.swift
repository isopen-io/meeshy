import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// Le resolver est la SEULE source de vérité du volume pour la lecture,
/// l'export et la preview. Toute divergence entre ces surfaces viendrait
/// d'un appelant qui l'a court-circuité.
final class StoryVolumeResolverTests: XCTestCase {

    func test_noKeyframes_returnsBaseVolume() {
        let v = StoryVolumeResolver.effectiveVolume(base: 0.8, keyframes: nil, at: 3)
        XCTAssertEqual(v, 0.8, accuracy: 0.0001)
    }

    func test_keyframesWithoutVolumeChannel_returnsBaseVolume() {
        let frames = [StoryKeyframe(time: 0, x: 0.1), StoryKeyframe(time: 5, x: 0.9)]
        let v = StoryVolumeResolver.effectiveVolume(base: 0.6, keyframes: frames, at: 2)
        XCTAssertEqual(v, 0.6, accuracy: 0.0001)
    }

    /// Avant le premier point, on garde le volume de base : sans ce gardien,
    /// l'ouverture d'une story sauterait brutalement à la valeur du 1ᵉʳ point.
    func test_beforeFirstPoint_returnsBaseVolume() {
        let frames = [StoryKeyframe(time: 4, volume: 0.2)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 1)
        XCTAssertEqual(v, 1.0, accuracy: 0.0001)
    }

    func test_singlePoint_holdsItsValueAfterwards() {
        let frames = [StoryKeyframe(time: 2, volume: 0.3)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 7)
        XCTAssertEqual(v, 0.3, accuracy: 0.0001)
    }

    func test_twoPoints_interpolatesLinearlyAtMidpoint() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                      StoryKeyframe(time: 4, volume: 0.0, easing: .linear)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 2)
        XCTAssertEqual(v, 0.5, accuracy: 0.01)
    }

    /// Les points arrivant du réseau ne sont pas garantis triés.
    func test_unsortedPoints_areOrderedBeforeInterpolation() {
        let frames = [StoryKeyframe(time: 4, volume: 0.0, easing: .linear),
                      StoryKeyframe(time: 0, volume: 1.0, easing: .linear)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 2)
        XCTAssertEqual(v, 0.5, accuracy: 0.01)
    }

    func test_valuesAreClampedToMaxGain() {
        let frames = [StoryKeyframe(time: 0, volume: 9.0)]
        let v = StoryVolumeResolver.effectiveVolume(base: 1.0, keyframes: frames, at: 1)
        XCTAssertEqual(v, StoryVolume.maxGain, accuracy: 0.0001)
    }

    func test_negativeBaseIsClampedToZero() {
        let v = StoryVolumeResolver.effectiveVolume(base: -3, keyframes: nil, at: 0)
        XCTAssertEqual(v, 0, accuracy: 0.0001)
    }

    func test_gainAboveOneIsPreserved() {
        let v = StoryVolumeResolver.effectiveVolume(base: 1.8, keyframes: nil, at: 0)
        XCTAssertEqual(v, 1.8, accuracy: 0.0001)
    }

    // MARK: - Ducking

    func test_ducking_appliesFactor() {
        let v = StoryVolumeResolver.ducked(1.0, isDucking: true)
        XCTAssertEqual(v, StoryVolume.duckingFactor, accuracy: 0.0001)
    }

    func test_ducking_disabledLeavesVolumeUntouched() {
        let v = StoryVolumeResolver.ducked(0.9, isDucking: false)
        XCTAssertEqual(v, 0.9, accuracy: 0.0001)
    }

    /// Le ducking s'applique APRÈS l'automation : un clip poussé à 200 %
    /// atténué reste audible, il ne repart pas du niveau nominal.
    func test_ducking_composesWithGain() {
        let v = StoryVolumeResolver.ducked(2.0, isDucking: true)
        XCTAssertEqual(v, 2.0 * StoryVolume.duckingFactor, accuracy: 0.0001)
    }

    // MARK: - Bascule par clip

    /// Le contexte de la slide ne décide plus seul : l'auteur peut couper
    /// l'atténuation clip par clip.
    func test_duckingGate_clipCanOptOut() {
        XCTAssertFalse(StoryVolumeResolver.isDucking(slideDucks: true,
                                                     isDuckingDisabled: true))
    }

    func test_duckingGate_appliesWhenNotDisabled() {
        XCTAssertTrue(StoryVolumeResolver.isDucking(slideDucks: true,
                                                    isDuckingDisabled: false))
    }

    /// L'absence du champ vaut « atténuation active » : le lire comme une
    /// désactivation annulerait le bénéfice rétroactif du ducking sur les
    /// stories déjà publiées.
    func test_duckingGate_nilMeansEnabled() {
        XCTAssertTrue(StoryVolumeResolver.isDucking(slideDucks: true,
                                                    isDuckingDisabled: nil))
    }

    /// Couper l'atténuation d'un clip ne la crée pas là où elle n'existait pas.
    func test_duckingGate_slideContextStillWins() {
        XCTAssertFalse(StoryVolumeResolver.isDucking(slideDucks: false,
                                                     isDuckingDisabled: false))
    }
}
