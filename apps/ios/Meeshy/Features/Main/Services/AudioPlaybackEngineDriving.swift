import Foundation
import Combine
import MeeshyUI
import MeeshySDK

@MainActor
public protocol AudioPlaybackEngineDriving: AnyObject {
    var isPlayingPublisher: Published<Bool>.Publisher { get }
    var currentTimePublisher: Published<TimeInterval>.Publisher { get }
    var durationPublisher: Published<TimeInterval>.Publisher { get }
    var progressPublisher: Published<Double>.Publisher { get }
    var speedPublisher: Published<PlaybackSpeed>.Publisher { get }

    var isPlaying: Bool { get }
    var currentTime: TimeInterval { get }
    var duration: TimeInterval { get }
    var progress: Double { get }
    var speed: PlaybackSpeed { get }
    var currentUrl: String? { get }

    var attachmentId: String? { get set }
    var onPlaybackFinished: (() -> Void)? { get set }

    func play(urlString: String)
    func playLocal(url: URL)
    func togglePlayPause()
    func stop()
    func seek(to fraction: Double)
    func skip(seconds: Double)
    func setSpeed(_ speed: PlaybackSpeed)
    func cycleSpeed()
}

extension AudioPlaybackManager: AudioPlaybackEngineDriving {
    public var isPlayingPublisher: Published<Bool>.Publisher { $isPlaying }
    public var currentTimePublisher: Published<TimeInterval>.Publisher { $currentTime }
    public var durationPublisher: Published<TimeInterval>.Publisher { $duration }
    public var progressPublisher: Published<Double>.Publisher { $progress }
    public var speedPublisher: Published<PlaybackSpeed>.Publisher { $speed }
}
