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

// MARK: - Queue data models

public struct QueuedAudio: Equatable, Identifiable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let fileUrl: String
    public let durationMs: Int
    public let senderName: String
    public let senderAvatarURL: String?
    public let receivedAt: Date
    public var id: String { attachmentId }

    public init(attachmentId: String, messageId: String, conversationId: String,
                fileUrl: String, durationMs: Int, senderName: String,
                senderAvatarURL: String?, receivedAt: Date) {
        self.attachmentId = attachmentId
        self.messageId = messageId
        self.conversationId = conversationId
        self.fileUrl = fileUrl
        self.durationMs = durationMs
        self.senderName = senderName
        self.senderAvatarURL = senderAvatarURL
        self.receivedAt = receivedAt
    }
}

public struct ActiveAudioContext: Equatable, Sendable {
    public let attachmentId: String
    public let messageId: String
    public let conversationId: String
    public let conversationName: String
    public let conversationArtworkURL: String?
    public let senderName: String
    public let senderAvatarURL: String?
    public let durationMs: Int

    public init(from queued: QueuedAudio,
                conversationName: String,
                conversationArtworkURL: String?) {
        self.attachmentId = queued.attachmentId
        self.messageId = queued.messageId
        self.conversationId = queued.conversationId
        self.conversationName = conversationName
        self.conversationArtworkURL = conversationArtworkURL
        self.senderName = queued.senderName
        self.senderAvatarURL = queued.senderAvatarURL
        self.durationMs = queued.durationMs
    }

    public init(attachmentId: String, messageId: String, conversationId: String,
                conversationName: String, conversationArtworkURL: String?,
                senderName: String, senderAvatarURL: String?, durationMs: Int) {
        self.attachmentId = attachmentId
        self.messageId = messageId
        self.conversationId = conversationId
        self.conversationName = conversationName
        self.conversationArtworkURL = conversationArtworkURL
        self.senderName = senderName
        self.senderAvatarURL = senderAvatarURL
        self.durationMs = durationMs
    }
}
