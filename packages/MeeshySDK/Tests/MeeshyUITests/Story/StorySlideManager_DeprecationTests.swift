import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

// MARK: - Tests covering deprecated API
//
// These tests intentionally exercise the deprecated `StorySlideManager`
// and `StorySlideCarousel` API surface to (1) ensure the deprecation
// annotation is in place and points users at `StoryComposerViewModel`
// and (2) keep behavioural coverage of any remaining call-sites until
// the types are removed in the next minor release.
//
// SSoT: `StoryComposerViewModel` (in this package) is the single source
// of truth for composer slide state. `StorySlideManager` duplicates that
// state and must not be reintroduced into production code paths.

/// Deprecation surface tests for `StorySlideManager` / `StorySlideCarousel`.
///
/// We suppress the deprecation warning inside this file so the test bundle
/// still compiles cleanly — the point of the test is precisely to assert
/// the deprecation contract, not to ban every usage.
@available(*, deprecated, message: "Tests target deprecated API on purpose")
@MainActor
final class StorySlideManager_DeprecationTests: XCTestCase {

    // MARK: - Behavioural smoke (legacy API still works until removal)

    func test_addSlide_appendsAndSelectsNewSlide() {
        let manager = StorySlideManager()
        XCTAssertEqual(manager.slideCount, 1)
        XCTAssertEqual(manager.currentSlideIndex, 0)

        manager.addSlide()

        XCTAssertEqual(manager.slideCount, 2)
        XCTAssertEqual(manager.currentSlideIndex, 1)
    }

    func test_removeSlide_keepsAtLeastOneSlide() {
        let manager = StorySlideManager()
        manager.removeSlide(at: 0)

        XCTAssertEqual(manager.slideCount, 1, "Manager must never drop below one slide")
    }

    // MARK: - Deprecation contract

    /// Documentation contract: the deprecation message MUST point users at
    /// `StoryComposerViewModel`. This is asserted via source inspection so
    /// that accidental changes to the deprecation message (e.g. dropping
    /// the SSoT alternative) fail loudly in CI.
    func test_deprecationMessage_mentionsStoryComposerViewModelAlternative() throws {
        let source = try Self.loadStorySlideManagerSource()

        XCTAssertTrue(
            source.contains("@available(*, deprecated"),
            "StorySlideManager.swift must carry an @available(*, deprecated, ...) annotation"
        )
        XCTAssertTrue(
            source.contains("StoryComposerViewModel"),
            "Deprecation guidance must name StoryComposerViewModel as the SSoT alternative"
        )
        XCTAssertTrue(
            source.contains("single source of truth"),
            "Deprecation message must explain the SSoT rationale"
        )
    }

    /// Both deprecated types (`StorySlideManager` and `StorySlideCarousel`)
    /// must carry the annotation — the carousel is dead with the manager.
    func test_deprecationAnnotation_appliesToBothTypes() throws {
        let source = try Self.loadStorySlideManagerSource()

        // Count occurrences of the deprecation annotation. We expect at
        // least two: one above `class StorySlideManager`, one above
        // `struct StorySlideCarousel`.
        let occurrences = source.components(separatedBy: "@available(*, deprecated").count - 1
        XCTAssertGreaterThanOrEqual(
            occurrences,
            2,
            "Both StorySlideManager and StorySlideCarousel must be marked deprecated"
        )
    }

    /// The follow-up TODO must be present so the removal is tracked.
    func test_followUpTodo_isPresentForNextMinorRelease() throws {
        let source = try Self.loadStorySlideManagerSource()

        XCTAssertTrue(
            source.contains("TODO: Remove in next minor release"),
            "A removal TODO must be present to track cleanup of the deprecated API"
        )
    }

    // MARK: - Helpers

    /// Locates `StorySlideManager.swift` on disk by walking up from this
    /// test file. The package layout is stable
    /// (`packages/MeeshySDK/Sources/MeeshyUI/Story/StorySlideManager.swift`)
    /// so a deterministic relative path from `#filePath` is sufficient and
    /// avoids depending on Bundle.module wiring.
    private static func loadStorySlideManagerSource(file: StaticString = #filePath) throws -> String {
        let testFileURL = URL(fileURLWithPath: "\(file)")
        // Tests/MeeshyUITests/Story/<this file> → up 3 → MeeshySDK package root
        let packageRoot = testFileURL
            .deletingLastPathComponent() // Story/
            .deletingLastPathComponent() // MeeshyUITests/
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // MeeshySDK/
        let sourceURL = packageRoot
            .appendingPathComponent("Sources")
            .appendingPathComponent("MeeshyUI")
            .appendingPathComponent("Story")
            .appendingPathComponent("StorySlideManager.swift")

        return try String(contentsOf: sourceURL, encoding: .utf8)
    }
}
