import Foundation
import Combine

// MARK: - Audio Recording Protocol

/// Unified protocol for all audio recording across the app.
/// Concrete implementation lives in the app layer (AudioRecorderManager).
/// Views in MeeshyUI depend on this protocol for injection.
@MainActor
public protocol AudioRecordingProviding: AnyObject, ObservableObject {
    var isRecording: Bool { get }
    var duration: TimeInterval { get }
    var audioLevels: [CGFloat] { get }
    var recordedFileURL: URL? { get }

    func startRecording()
    @discardableResult func stopRecording() -> URL?
    func cancelRecording()
}

// MARK: - Recording Result

public struct AudioRecordingResult: Sendable {
    public let url: URL
    public let duration: TimeInterval
    public let data: Data?

    public init(url: URL, duration: TimeInterval, data: Data? = nil) {
        self.url = url
        self.duration = duration
        self.data = data
    }
}

// MARK: - Recording Settings

public struct AudioRecordingSettings: Sendable {
    public let maxDuration: TimeInterval?
    public let minimumDuration: TimeInterval
    public let sampleRate: Double
    public let numberOfChannels: Int
    public let bitRate: Int

    public static let standard = AudioRecordingSettings(
        maxDuration: nil,
        minimumDuration: 0.5,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 64000
    )

    public static let story = AudioRecordingSettings(
        maxDuration: 60,
        minimumDuration: 0.5,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 64000
    )

    public static let voiceSample = AudioRecordingSettings(
        maxDuration: nil,
        minimumDuration: 10,
        sampleRate: 44100,
        numberOfChannels: 1,
        bitRate: 96000
    )

    public init(maxDuration: TimeInterval?, minimumDuration: TimeInterval,
                sampleRate: Double = 44100, numberOfChannels: Int = 1,
                bitRate: Int = 64000) {
        self.maxDuration = maxDuration
        self.minimumDuration = minimumDuration
        self.sampleRate = sampleRate
        self.numberOfChannels = numberOfChannels
        self.bitRate = bitRate
    }
}
