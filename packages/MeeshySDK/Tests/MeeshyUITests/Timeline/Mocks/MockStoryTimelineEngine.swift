import Foundation
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Test double that conforms to TimelineEngineProviding.
/// Records every call so tests can assert orchestration without spinning up
/// AVFoundation. Does not retain mediaURLs/images beyond capture.
@MainActor
final class MockStoryTimelineEngine: TimelineEngineProviding {

    var currentTime: Float = 0
    var isPlaying: Bool = false
    var isMuted: Bool = false
    var masterVolume: Float = 1.0

    var onTimeUpdate: ((Float) -> Void)?
    var onPlaybackEnd: (() -> Void)?
    var onElementBecameActive: ((String) -> Void)?
    var onError: ((Error) -> Void)?
    var mode: TimelineEngineMode = .preview

    // Call counts
    private(set) var configureCallCount = 0
    private(set) var playCallCount = 0
    private(set) var pauseCallCount = 0
    private(set) var seekCallCount = 0
    private(set) var stopCallCount = 0
    private(set) var setModeCallCount = 0

    // Last params
    private(set) var lastConfiguredProject: TimelineProject?
    private(set) var lastSeekTime: Float?
    private(set) var lastSetMode: TimelineEngineMode?

    func configure(project: TimelineProject, mediaURLs: [String: URL], images: [String: UIImage]) async {
        configureCallCount += 1
        lastConfiguredProject = project
    }

    func play() { playCallCount += 1; isPlaying = true }
    func pause() { pauseCallCount += 1; isPlaying = false }
    func seek(to time: Float, precise: Bool) { seekCallCount += 1; lastSeekTime = time; currentTime = time }
    func stop() { stopCallCount += 1; isPlaying = false; currentTime = 0 }
    func toggle() { isPlaying ? pause() : play() }
    func setMode(_ newMode: TimelineEngineMode) {
        setModeCallCount += 1
        lastSetMode = newMode
        mode = newMode
    }

    func reset() {
        configureCallCount = 0; playCallCount = 0; pauseCallCount = 0
        seekCallCount = 0; stopCallCount = 0; setModeCallCount = 0
        lastConfiguredProject = nil; lastSeekTime = nil; lastSetMode = nil
        currentTime = 0; isPlaying = false
        mode = .preview
    }
}
