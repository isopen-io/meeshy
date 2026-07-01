import Foundation
import CoreGraphics

/// Extensible call media configuration consumed by `WebRTCEngine.configure(...)`
/// and mutated by `MediaPipelineHook.willConfigure(...)`.
///
/// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §1.bis.3
public struct CallMediaConfig: Sendable {
    public var audio: AudioConfig
    public var video: VideoConfig?
    public var dataChannels: [DataChannelConfig]
    public var preferredCodecs: CodecPreferences

    public init(
        audio: AudioConfig = .default,
        video: VideoConfig? = nil,
        dataChannels: [DataChannelConfig] = [],
        preferredCodecs: CodecPreferences = .default
    ) {
        self.audio = audio
        self.video = video
        self.dataChannels = dataChannels
        self.preferredCodecs = preferredCodecs
    }
}

public struct AudioConfig: Sendable {
    public var dtx: Bool
    public var maxBitrateBps: Int
    public var minBitrateBps: Int

    public init(dtx: Bool, maxBitrateBps: Int, minBitrateBps: Int) {
        self.dtx = dtx
        self.maxBitrateBps = maxBitrateBps
        self.minBitrateBps = minBitrateBps
    }

    public static let `default` = AudioConfig(
        dtx: true,
        maxBitrateBps: QualityThresholds.defaultBitrate,
        minBitrateBps: QualityThresholds.audioCodecFloorBitrateBps
    )
}

public struct VideoConfig: Sendable {
    public var maxResolution: CGSize
    public var maxFrameRate: Int
    public var preferHardwareCodec: Bool

    public init(maxResolution: CGSize, maxFrameRate: Int, preferHardwareCodec: Bool) {
        self.maxResolution = maxResolution
        self.maxFrameRate = maxFrameRate
        self.preferHardwareCodec = preferHardwareCodec
    }

    public static let hd720p30 = VideoConfig(
        maxResolution: CGSize(width: 1280, height: 720),
        maxFrameRate: 30,
        preferHardwareCodec: true
    )
}

public struct DataChannelConfig: Sendable {
    public let label: String
    public let isOrdered: Bool
    public let maxRetransmits: Int?
    public let maxPacketLifeTime: TimeInterval?

    public init(
        label: String,
        isOrdered: Bool,
        maxRetransmits: Int? = nil,
        maxPacketLifeTime: TimeInterval? = nil
    ) {
        self.label = label
        self.isOrdered = isOrdered
        self.maxRetransmits = maxRetransmits
        self.maxPacketLifeTime = maxPacketLifeTime
    }
}

public struct CodecPreferences: Sendable {
    public let audioCodecs: [String]
    public let videoCodecs: [String]

    public init(audioCodecs: [String], videoCodecs: [String]) {
        self.audioCodecs = audioCodecs
        self.videoCodecs = videoCodecs
    }

    public static let `default` = CodecPreferences(
        audioCodecs: ["opus", "red"],
        videoCodecs: ["H264", "VP8", "VP9"]
    )
}
