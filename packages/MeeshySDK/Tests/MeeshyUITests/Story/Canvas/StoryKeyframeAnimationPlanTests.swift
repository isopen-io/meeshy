import XCTest
import QuartzCore
import AVFoundation
import MeeshySDK
@testable import MeeshyUI

/// **#9865 — les keyframes d'une story décrites UNE fois, pour Core Animation.**
///
/// Le canevas réévalue aujourd'hui chaque keyframe à chaque image
/// (`StoryRenderer.applyKeyframes`, appelé depuis `rebuildLayers`). La
/// description ci-dessous est ce que Core Animation jouera seul : une piste par
/// canal, des instants clés, des valeurs et une courbe par segment. Le témoin
/// central est la PARITÉ : à tout instant t, la description rend exactement ce
/// que rend l'évaluateur d'aujourd'hui — sinon le passage à Core Animation
/// changerait l'image.
@MainActor
final class StoryKeyframeAnimationPlanTests: XCTestCase {

    // MARK: - Parité avec l'évaluateur image par image

    func test_parity_withTheFrameByFrameEvaluator_onEveryEasing() throws {
        for easing in StoryEasing.allCases {
            let keyframes = [
                StoryKeyframe(time: 0.5, x: 0.2, y: 0.3, scale: 1, opacity: 1, easing: easing),
                StoryKeyframe(time: 2.0, x: 0.7, y: 0.6, scale: 1.8, opacity: 0.4, easing: easing),
                StoryKeyframe(time: 3.5, x: 0.4, y: 0.9, scale: 0.6, opacity: 0.9, easing: .linear),
            ]
            let plan = try XCTUnwrap(StoryKeyframeAnimationPlan.make(keyframes: keyframes, startTime: 1.25),
                                     "\(easing) s'exprime exactement en Core Animation")
            try Self.assertParity(plan, keyframes: keyframes, startTime: 1.25, label: easing.rawValue)
        }
    }

    func test_parity_channelsStartingAtDifferentTimes() throws {
        let keyframes = [
            StoryKeyframe(time: 0, opacity: 0, easing: .easeOut),
            StoryKeyframe(time: 1, scale: 1, easing: .easeIn),
            StoryKeyframe(time: 1.5, opacity: 1),
            StoryKeyframe(time: 3, scale: 2.5),
        ]
        let plan = try XCTUnwrap(StoryKeyframeAnimationPlan.make(keyframes: keyframes, startTime: 0))
        try Self.assertParity(plan, keyframes: keyframes, startTime: 0, label: "canaux décalés")
    }

    func test_beforeAChannelsFirstKeyframe_theLayerKeepsItsBase() throws {
        let keyframes = [StoryKeyframe(time: 2, scale: 1.5), StoryKeyframe(time: 4, scale: 3)]
        let plan = try XCTUnwrap(StoryKeyframeAnimationPlan.make(keyframes: keyframes, startTime: 1))

        XCTAssertNil(plan.value(of: .scale, at: 2.9), "avant la première clé (1 + 2 s), rien ne s'applique")
        XCTAssertEqual(plan.value(of: .scale, at: 3), .scalar(1.5))
        XCTAssertEqual(plan.value(of: .scale, at: 9), .scalar(3), "après la dernière clé, la valeur est tenue")
    }

    func test_aSingleKeyframe_holdsItsValueFromItsTime() throws {
        let plan = try XCTUnwrap(StoryKeyframeAnimationPlan.make(
            keyframes: [StoryKeyframe(time: 1, opacity: 0.3)], startTime: 0))

        XCTAssertNil(plan.value(of: .opacity, at: 0.5))
        XCTAssertEqual(plan.value(of: .opacity, at: 1), .scalar(0.3))
        XCTAssertEqual(plan.value(of: .opacity, at: 12), .scalar(0.3))
    }

    // MARK: - Ce que Core Animation ne jouerait pas à l'identique : le canevas garde la main

    func test_aPositionWithoutItsPair_isNotExpressible() {
        XCTAssertNil(StoryKeyframeAnimationPlan.make(
            keyframes: [StoryKeyframe(time: 0, x: 0.2), StoryKeyframe(time: 1, x: 0.4, y: 0.5)], startTime: 0),
            "x et y n'ont pas les mêmes instants : la position ne se décrit pas en une piste")
    }

    func test_twoKeyframesAtTheSameInstant_onAChannel_areNotExpressible() {
        XCTAssertNil(StoryKeyframeAnimationPlan.make(
            keyframes: [StoryKeyframe(time: 1, opacity: 0), StoryKeyframe(time: 1, opacity: 1)], startTime: 0))
    }

    func test_noKeyframe_noPlan() {
        XCTAssertEqual(StoryKeyframeAnimationPlan.make(keyframes: [], startTime: 0)?.tracks, [])
    }

    // MARK: - Les courbes : des Bézier EXACTES, pas des approximations

    func test_everyTiming_isExactlyTheCubicBezierItDeclares() {
        for timing in StoryKeyframeTiming.allCases {
            let (c1x, c1y, c2x, c2y) = timing.controlPoints
            for step in 0...20 {
                let s = Double(step) / 20
                let x = Self.bezier(s, 0, Double(c1x), Double(c2x), 1)
                let y = Self.bezier(s, 0, Double(c1y), Double(c2y), 1)
                XCTAssertEqual(x, s, accuracy: 1e-9, "\(timing) : le temps avance linéairement le long de la courbe")
                XCTAssertEqual(y, timing.progress(s), accuracy: 1e-9, "\(timing) à \(s)")
            }
        }
    }

    // MARK: - L'horloge : pause, seek, parcours au doigt

    func test_clock_running_followsTheParentTime_fromThePlayhead() {
        let state = StoryAnimationClock.state(playhead: 4, isRunning: true, parentNow: 100)

        XCTAssertEqual(StoryAnimationClock.localTime(of: state, atParentTime: 100), 4, accuracy: 1e-9)
        XCTAssertEqual(StoryAnimationClock.localTime(of: state, atParentTime: 100.5), 4.5, accuracy: 1e-9)
    }

    func test_clock_paused_freezesOnThePlayhead_andASeekLandsExactly() {
        let paused = StoryAnimationClock.state(playhead: 7.25, isRunning: false, parentNow: 100)
        XCTAssertEqual(StoryAnimationClock.localTime(of: paused, atParentTime: 100), 7.25, accuracy: 1e-9)
        XCTAssertEqual(StoryAnimationClock.localTime(of: paused, atParentTime: 160), 7.25, accuracy: 1e-9,
                       "en pause, le temps de l'horloge ne bouge plus")

        let scrubbed = StoryAnimationClock.state(playhead: 2.5, isRunning: false, parentNow: 161)
        XCTAssertEqual(StoryAnimationClock.localTime(of: scrubbed, atParentTime: 161), 2.5, accuracy: 1e-9,
                       "le parcours au doigt pose l'instant exact")
    }

    func test_clock_resumes_whereItPaused() {
        let paused = StoryAnimationClock.state(playhead: 3, isRunning: false, parentNow: 50)
        let resumed = StoryAnimationClock.state(
            playhead: StoryAnimationClock.localTime(of: paused, atParentTime: 80), isRunning: true, parentNow: 80)

        XCTAssertEqual(StoryAnimationClock.localTime(of: resumed, atParentTime: 81), 4, accuracy: 1e-9)
    }

    // MARK: - Les animations construites

    func test_coreAnimations_carryTheDescription() throws {
        let keyframes = [
            StoryKeyframe(time: 0, x: 0.1, y: 0.2, opacity: 0, easing: .easeInOut),
            StoryKeyframe(time: 2, x: 0.5, y: 0.6, opacity: 1),
        ]
        let plan = try XCTUnwrap(StoryKeyframeAnimationPlan.make(keyframes: keyframes, startTime: 0))
        let animations = plan.coreAnimations(projectPosition: { CGPoint(x: $0.x * 100, y: $0.y * 200) },
                                             baseTransform: CATransform3DIdentity)

        let position = try XCTUnwrap(animations.first { $0.keyPath == "position" })
        XCTAssertEqual(position.values?.count, 3, "easeInOut se coupe en deux segments exacts")
        XCTAssertEqual((position.values?.last as? NSValue)?.cgPointValue, CGPoint(x: 50, y: 120))
        XCTAssertEqual(position.keyTimes?.map(\.doubleValue), [0, 0.5, 1])
        XCTAssertEqual(position.timingFunctions?.count, 2)
        XCTAssertEqual(position.beginTime, AVCoreAnimationBeginTimeAtZero,
                       "un début à 0 serait lu « maintenant » par Core Animation")
        XCTAssertEqual(position.duration, 2)
        XCTAssertEqual(position.fillMode, .forwards, "avant sa première clé, la couche garde sa base")
        XCTAssertFalse(position.isRemovedOnCompletion)

        let opacity = try XCTUnwrap(animations.first { $0.keyPath == "opacity" })
        XCTAssertEqual((opacity.values?.last as? NSNumber)?.doubleValue ?? -1, 1, accuracy: 1e-6)
    }

    func test_coreAnimations_scaleComposesWithTheBaseTransform() throws {
        let plan = try XCTUnwrap(StoryKeyframeAnimationPlan.make(
            keyframes: [StoryKeyframe(time: 1, scale: 2)], startTime: 0.5))
        let base = CATransform3DMakeRotation(.pi / 4, 0, 0, 1)
        let scale = try XCTUnwrap(plan.coreAnimations(projectPosition: { $0 }, baseTransform: base).first)

        XCTAssertEqual(scale.keyPath, "transform")
        XCTAssertEqual(scale.beginTime, 1.5, accuracy: 1e-9)
        let last = try XCTUnwrap((scale.values?.last as? NSValue)?.caTransform3DValue)
        XCTAssertTrue(CATransform3DEqualToTransform(last, CATransform3DScale(base, 2, 2, 1)),
                      "même composition que applyKeyframeOverrides : la rotation de base est gardée")
    }

    // MARK: - Fixtures

    private static func assertParity(_ plan: StoryKeyframeAnimationPlan, keyframes: [StoryKeyframe],
                                     startTime: Double, label: String) throws {
        for step in 0...240 {
            let t = startTime + Double(step) / 40
            let expected = StoryRenderer.applyKeyframes(keyframes: keyframes, at: t, startTime: startTime)
            switch (expected.position, plan.value(of: .position, at: t)) {
            case (nil, nil): break
            case let (point?, .point(served)?):
                XCTAssertEqual(served.x, point.x, accuracy: 1e-4, "\(label) x à \(t)")
                XCTAssertEqual(served.y, point.y, accuracy: 1e-4, "\(label) y à \(t)")
            case let (expectedPoint, served):
                XCTFail("\(label) position à \(t) : \(String(describing: expectedPoint)) ≠ \(String(describing: served))")
            }
            try assertScalar(expected.scale, plan.value(of: .scale, at: t), "\(label) échelle à \(t)")
            try assertScalar(expected.opacity, plan.value(of: .opacity, at: t), "\(label) opacité à \(t)")
        }
    }

    private static func assertScalar(_ expected: Double?, _ served: StoryKeyframeAnimationPlan.KeyValue?,
                                     _ label: String) throws {
        switch (expected, served) {
        case (nil, nil): return
        case let (value?, .scalar(scalar)?): XCTAssertEqual(Double(scalar), value, accuracy: 1e-4, label)
        default: XCTFail("\(label) : \(String(describing: expected)) ≠ \(String(describing: served))")
        }
    }

    private static func bezier(_ s: Double, _ p0: Double, _ p1: Double, _ p2: Double, _ p3: Double) -> Double {
        let u = 1 - s
        return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3
    }
}
