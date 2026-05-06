import XCTest
@testable import MeeshySDK

final class StoryModelsExtensionsTests: XCTestCase {
    // MARK: - StoryEasing

    func test_storyEasing_linear_returnsInputUnchanged() {
        XCTAssertEqual(StoryEasing.linear.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.25), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(0.75), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.linear.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeIn_isQuadratic() {
        XCTAssertEqual(StoryEasing.easeIn.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(0.5), 0.25, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeIn.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeOut_invertsEaseIn() {
        XCTAssertEqual(StoryEasing.easeOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(0.5), 0.75, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_easeInOut_isSCurve() {
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.0), 0.0, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(0.5), 0.5, accuracy: 0.0001)
        XCTAssertEqual(StoryEasing.easeInOut.apply(1.0), 1.0, accuracy: 0.0001)
    }

    func test_storyEasing_allEasings_areMonotonicOnUnitInterval() {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            var previous: Float = -.infinity
            for step in stride(from: Float(0), through: Float(1), by: 0.05) {
                let current = easing.apply(step)
                XCTAssertGreaterThanOrEqual(current, previous,
                    "\(easing) is not monotonic at t=\(step)")
                previous = current
            }
        }
    }

    func test_storyEasing_codableRoundTrip_allCases() throws {
        for easing in [StoryEasing.linear, .easeIn, .easeOut, .easeInOut] {
            let data = try JSONEncoder().encode(easing)
            let decoded = try JSONDecoder().decode(StoryEasing.self, from: data)
            XCTAssertEqual(decoded, easing)
        }
    }
}
