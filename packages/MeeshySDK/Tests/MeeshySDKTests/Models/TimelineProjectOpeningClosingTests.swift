import XCTest
@testable import MeeshySDK

final class TimelineProjectOpeningClosingTests: XCTestCase {

    func test_initFromSlide_capturesOpeningAndClosingEffects() {
        var effects = StoryEffects()
        effects.opening = .fade
        effects.closing = .zoom
        let slide = StorySlide(id: "s1", effects: effects, duration: 6, order: 0)

        let project = TimelineProject(from: slide)

        XCTAssertEqual(project.openingEffect, .fade)
        XCTAssertEqual(project.closingEffect, .zoom)
    }

    func test_initFromSlide_nilEffects_yieldsNilProperties() {
        let slide = StorySlide(id: "s1", effects: StoryEffects(), duration: 6, order: 0)
        let project = TimelineProject(from: slide)
        XCTAssertNil(project.openingEffect)
        XCTAssertNil(project.closingEffect)
    }
}
