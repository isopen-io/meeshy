import XCTest
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// La courbe est en lecture seule : on teste la géométrie qu'elle produit,
/// sans monter la vue.
final class VolumeCurveOverlayTests: XCTestCase {

    private let size = CGSize(width: 100, height: 20)

    func test_noVolumeKeyframes_yieldsNoPoints() {
        let frames = [StoryKeyframe(time: 0, x: 0.2)]
        let points = VolumeCurveOverlay.points(keyframes: frames, duration: 5, size: size)
        XCTAssertTrue(points.isEmpty)
    }

    func test_pointsMapTimeToXAndVolumeToInvertedY() {
        let frames = [StoryKeyframe(time: 0, volume: 1.0),
                      StoryKeyframe(time: 5, volume: 0.0)]
        let points = VolumeCurveOverlay.points(keyframes: frames, duration: 5, size: size)

        XCTAssertEqual(points.count, 2)
        XCTAssertEqual(points[0].x, 0, accuracy: 0.01)
        XCTAssertEqual(points[0].y, 0, accuracy: 0.01, "volume 1 → haut de la piste")
        XCTAssertEqual(points[1].x, 100, accuracy: 0.01)
        XCTAssertEqual(points[1].y, 20, accuracy: 0.01, "volume 0 → bas de la piste")
    }

    func test_gainAboveOneIsClampedToTheTop() {
        let frames = [StoryKeyframe(time: 0, volume: 2.0)]
        let points = VolumeCurveOverlay.points(keyframes: frames, duration: 4, size: size)
        XCTAssertEqual(points[0].y, 0, accuracy: 0.01)
    }

    func test_pointsAreSortedByTime() {
        let frames = [StoryKeyframe(time: 4, volume: 0.2),
                      StoryKeyframe(time: 1, volume: 0.9)]
        let points = VolumeCurveOverlay.points(keyframes: frames, duration: 5, size: size)
        XCTAssertLessThan(points[0].x, points[1].x)
    }

    func test_zeroDuration_yieldsNoPoints() {
        let frames = [StoryKeyframe(time: 1, volume: 0.5)]
        XCTAssertTrue(VolumeCurveOverlay.points(keyframes: frames,
                                                duration: 0, size: size).isEmpty)
    }

    /// Un point au-delà de la durée reste dans le cadre plutôt que de sortir
    /// de la piste.
    func test_pointBeyondDurationStaysInsideTheTrack() {
        let frames = [StoryKeyframe(time: 99, volume: 0.5)]
        let points = VolumeCurveOverlay.points(keyframes: frames, duration: 5, size: size)
        XCTAssertEqual(points[0].x, size.width, accuracy: 0.01)
    }

    func test_midVolumeSitsHalfway() {
        let frames = [StoryKeyframe(time: 0, volume: 0.5),
                      StoryKeyframe(time: 5, volume: 0.5)]
        let points = VolumeCurveOverlay.points(keyframes: frames, duration: 5, size: size)
        XCTAssertEqual(points[0].y, 10, accuracy: 0.01)
    }
}
