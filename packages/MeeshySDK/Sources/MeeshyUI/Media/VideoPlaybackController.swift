import Foundation
import Combine

/// Internal playback state machine for `MeeshyVideoPlayer`.
///
/// Replaces ad-hoc booleans (`isPlaying`, `isBuffering`, `isLoaded`) scattered
/// across the legacy `InlineVideoPlayerView` / `VideoPlayerView` /
/// `VideoFullscreenPlayerView`. Single source of truth, one `@Published`
/// state, equatable transitions.
@MainActor
final class VideoPlaybackController: ObservableObject {

    enum State: Equatable {
        case idle
        case buffering
        case playing
        case paused
        case ended
        case error(NSError)

        static func == (lhs: State, rhs: State) -> Bool {
            switch (lhs, rhs) {
            case (.idle, .idle), (.buffering, .buffering),
                 (.playing, .playing), (.paused, .paused), (.ended, .ended):
                return true
            case (.error(let a), .error(let b)):
                return a.domain == b.domain && a.code == b.code
            default:
                return false
            }
        }
    }

    @Published private(set) var state: State = .idle

    var isPlaying: Bool {
        if case .playing = state { return true }
        return false
    }

    func startBuffering() { state = .buffering }
    func markPlaying() { state = .playing }
    func pause() { state = .paused }
    func markEnded() { state = .ended }
    func markError(_ error: Error) {
        state = .error(error as NSError)
    }
    func reset() { state = .idle }
}
