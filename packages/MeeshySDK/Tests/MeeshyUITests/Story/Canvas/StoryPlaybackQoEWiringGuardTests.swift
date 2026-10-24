import XCTest

/// #11287 — garde de source : les cinq sites qui branchent la QoE sur la
/// lecture d'une story (le comportement AVFoundation n'est pas observable ici).
final class StoryPlaybackQoEWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Canvas/
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_readiness_beginsTheSession_whenTheBackgroundPlayerIsArmed() throws {
        let src = try source("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+ContentReadiness.swift")
        XCTAssertTrue(src.contains("beginBackgroundPlaybackQoE()"))
    }

    func test_windowDetach_andEditMode_closeTheSession() throws {
        let lifecycle = try source("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Lifecycle.swift")
        XCTAssertTrue(lifecycle.contains("finishBackgroundPlaybackQoE()"))
        let core = try source("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView+Core.swift")
        XCTAssertTrue(core.contains("finishBackgroundPlaybackQoE()"))
    }

    func test_layerReconfigure_andAppBackground_closeTheSession() throws {
        let layer = try source("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift")
        XCTAssertTrue(layer.contains("playbackQoE.finish(reason: .swiped)"))
        let playback = try source("Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer+Playback.swift")
        XCTAssertTrue(playback.contains("playbackQoE.finish(reason: .backgrounded)"))
    }

    func test_reader_declaresTheStoryTarget_onlyForPublishedContent() throws {
        let src = try source("Sources/MeeshyUI/Story/Canvas/StoryReaderRepresentable.swift")
        XCTAssertTrue(src.contains("setPlaybackQoETarget("))
        XCTAssertTrue(src.contains("kind: .story, id: storyItem.id"))
    }

    func test_canvasMainFile_staysOutOfTheBudget() throws {
        let src = try source("Sources/MeeshyUI/Story/Canvas/StoryCanvasUIView.swift")
        XCTAssertLessThanOrEqual(src.split(separator: "\n", omittingEmptySubsequences: false).count, 982)
    }

    func test_observer_attachesItemObserversLate_forALoopedQueuePlayer() throws {
        let src = try source("Sources/MeeshyUI/Media/PlaybackQoEObserver.swift")
        XCTAssertTrue(src.contains("publisher(for: \\.currentItem"))
    }
}
