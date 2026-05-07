import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

@MainActor
final class StoryTimelineEngineProvidingTests: XCTestCase {

    /// Sanity: the concrete engine must be assignable to a TimelineEngineProviding existential
    /// so TimelineViewModel can take it as a dependency without unboxing.
    func test_concreteEngine_conformsToProtocol() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        XCTAssertTrue(provider is StoryTimelineEngine,
                      "StoryTimelineEngine must conform to TimelineEngineProviding")
        engine.shutdown()
    }

    /// Setting the protocol's TimelineEngineMode must reach the concrete engine's mode.
    func test_setMode_editing_reachesConcreteEngine() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        provider.setMode(.editing)
        XCTAssertEqual(engine.mode, .editing,
                       "Bridged setMode(.editing) must update the concrete engine's mode")
        engine.shutdown()
    }

    func test_setMode_preview_reachesConcreteEngine() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        provider.setMode(.preview)
        XCTAssertEqual(engine.mode, .preview)
        engine.shutdown()
    }

    /// The protocol exposes `mode` as a read-only property. The concrete engine's
    /// `mode` must be readable via the same property name when accessed
    /// through the protocol existential.
    func test_mode_isReadableThroughProtocol() {
        let engine = StoryTimelineEngine()
        let provider: any TimelineEngineProviding = engine
        provider.setMode(.editing)
        XCTAssertEqual(provider.mode, .editing,
                       "Reading provider.mode must reflect the concrete engine state")
        engine.shutdown()
    }
}
