import Foundation
import Combine
import AVFoundation

// MARK: - Audio Codec (upload bandwidth — sprint « Poids des Payloads » E4)

/// Codec a recorded voice message is encoded with before upload.
///
/// `.aac` is the historical default (AAC in an M4A container) — every existing
/// call site keeps producing byte-identical files. `.opus` (libopus in a CAF
/// container on iOS) is the bandwidth win: ~24 kbps mono speech is a fraction
/// of AAC's 64–96 kbps, shrinking the upload (and the stored original) by
/// roughly 60–75 % for voice.
///
/// ⚠️ Activation is a *versioned, breaking* change: the uploaded original is
/// also played back by web + other iOS clients, so flipping a recorder to
/// `.opus` requires (1) on-device validation that `AVAudioRecorder` actually
/// produces the chosen container at the chosen sample rate, and (2) confirming
/// every consumer can play it (CAF-Opus is not web-playable — the gateway may
/// need to remux to Ogg/WebM for browsers). Until then the default stays
/// `.aac`; this type is the building block that makes the flip a focused
/// follow-up rather than a from-scratch effort.
public enum AudioCodec: String, Sendable, Codable {
    case aac
    case opus

    /// CoreAudio format id for `AVAudioRecorder`'s `AVFormatIDKey`.
    public var avFormatID: AudioFormatID {
        switch self {
        case .aac:  return kAudioFormatMPEG4AAC
        case .opus: return kAudioFormatOpus
        }
    }

    /// Container file extension for the recorded file.
    public var fileExtension: String {
        switch self {
        case .aac:  return "m4a"
        case .opus: return "caf"
        }
    }

    /// MIME type to label the uploaded attachment with.
    public var mimeType: String {
        switch self {
        case .aac:  return "audio/mp4"
        case .opus: return "audio/opus"
        }
    }
}

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

    func configure(with settings: AudioRecordingSettings)
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
    public let codec: AudioCodec

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

    /// Opus voice preset (E4) — mono, 48 kHz (Opus does NOT support 44.1 kHz),
    /// 24 kbps. ~60–75 % smaller than the AAC presets for speech. Dormant until
    /// a call site opts in and the cross-client playback path is validated
    /// (see ``AudioCodec``).
    public static let opusVoiceMessage = AudioRecordingSettings(
        maxDuration: nil,
        minimumDuration: 0.5,
        sampleRate: 48000,
        numberOfChannels: 1,
        bitRate: 24000,
        codec: .opus
    )

    public init(maxDuration: TimeInterval?, minimumDuration: TimeInterval,
                sampleRate: Double = 44100, numberOfChannels: Int = 1,
                bitRate: Int = 64000, codec: AudioCodec = .aac) {
        self.maxDuration = maxDuration
        self.minimumDuration = minimumDuration
        self.sampleRate = sampleRate
        self.numberOfChannels = numberOfChannels
        self.bitRate = bitRate
        self.codec = codec
    }

    /// `AVAudioRecorder` settings dictionary for these settings. Centralises
    /// what `DefaultSDKAudioRecorder` (and the app's `AudioRecorderManager`)
    /// build by hand. `.aac` reproduces the historical dictionary exactly;
    /// `.opus` drops the AAC-only `AVEncoderAudioQualityKey`.
    public var avRecorderSettings: [String: Any] {
        var dict: [String: Any] = [
            AVFormatIDKey: Int(codec.avFormatID),
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: numberOfChannels,
            AVEncoderBitRateKey: bitRate,
        ]
        if codec == .aac {
            dict[AVEncoderAudioQualityKey] = AVAudioQuality.medium.rawValue
        }
        return dict
    }
}
