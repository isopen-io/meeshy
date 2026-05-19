import Foundation
import CoreGraphics

/// Non-destructive video editing model.
///
/// A `VideoEditDocument` describes *what* edits to apply to a single source
/// video — it never mutates the source file. The rendering layer
/// (`VideoCompositionBuilder`) turns a document into an `AVComposition`, and
/// `VideoExportPipeline` flattens it to a new file only when the user is done.
///
/// All types here are value types so they are trivially `Sendable`, `Codable`
/// (autosave / crash recovery) and `Equatable` (change detection / undo).

// MARK: - Limits

public enum VideoEditLimits {
    public static let minSegmentDuration: Double = 0.25
    public static let minSpeed: Double = 0.25
    public static let maxSpeed: Double = 4.0
    public static let minVolume: Double = 0.0
    public static let maxVolume: Double = 2.0
    public static let maxFade: Double = 5.0
    public static let historyDepth: Int = 60
}

// MARK: - Normalized Rect

/// A rectangle expressed in 0...1 coordinates relative to the source frame,
/// origin top-left. Used for cropping independently of pixel dimensions.
public struct NormalizedRect: Codable, Sendable, Equatable {
    public var x: Double
    public var y: Double
    public var width: Double
    public var height: Double

    public init(x: Double, y: Double, width: Double, height: Double) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }

    public static let full = NormalizedRect(x: 0, y: 0, width: 1, height: 1)

    public var isFull: Bool {
        abs(x) < 0.0001 && abs(y) < 0.0001
            && abs(width - 1) < 0.0001 && abs(height - 1) < 0.0001
    }

    /// Clamps the rect so it always stays inside the unit square with a
    /// non-degenerate size.
    public var sanitized: NormalizedRect {
        let w = min(1, max(0.05, width))
        let h = min(1, max(0.05, height))
        let cx = min(1 - w, max(0, x))
        let cy = min(1 - h, max(0, y))
        return NormalizedRect(x: cx, y: cy, width: w, height: h)
    }
}

// MARK: - Filter Preset

public enum VideoFilterPreset: String, Codable, Sendable, CaseIterable {
    case none
    case vivid
    case warm
    case cool
    case mono
    case noir
    case vintage
    case fade

    public var displayName: String {
        switch self {
        case .none:    return "Original"
        case .vivid:   return "Vivid"
        case .warm:    return "Warm"
        case .cool:    return "Cool"
        case .mono:    return "Mono"
        case .noir:    return "Noir"
        case .vintage: return "Vintage"
        case .fade:    return "Fade"
        }
    }

    public var iconName: String {
        switch self {
        case .none:    return "circle.slash"
        case .vivid:   return "sparkles"
        case .warm:    return "sun.max"
        case .cool:    return "snowflake"
        case .mono:    return "circle.lefthalf.filled"
        case .noir:    return "moon.stars"
        case .vintage: return "camera.filters"
        case .fade:    return "drop"
        }
    }
}

// MARK: - Color Adjustment

public struct VideoColorAdjustment: Codable, Sendable, Equatable {
    /// CoreImage `inputBrightness`, -1...1, neutral 0.
    public var brightness: Double
    /// CoreImage `inputContrast`, 0.25...2, neutral 1.
    public var contrast: Double
    /// CoreImage `inputSaturation`, 0...2, neutral 1.
    public var saturation: Double

    public init(brightness: Double, contrast: Double, saturation: Double) {
        self.brightness = brightness
        self.contrast = contrast
        self.saturation = saturation
    }

    public static let identity = VideoColorAdjustment(brightness: 0, contrast: 1, saturation: 1)

    public var isIdentity: Bool {
        abs(brightness) < 0.001
            && abs(contrast - 1) < 0.001
            && abs(saturation - 1) < 0.001
    }

    public var sanitized: VideoColorAdjustment {
        VideoColorAdjustment(
            brightness: min(1, max(-1, brightness)),
            contrast: min(2, max(0.25, contrast)),
            saturation: min(2, max(0, saturation))
        )
    }
}

// MARK: - Audio Settings

public struct VideoAudioSettings: Codable, Sendable, Equatable {
    public var volume: Double
    public var isMuted: Bool
    public var fadeIn: Double
    public var fadeOut: Double

    public init(volume: Double, isMuted: Bool, fadeIn: Double, fadeOut: Double) {
        self.volume = volume
        self.isMuted = isMuted
        self.fadeIn = fadeIn
        self.fadeOut = fadeOut
    }

    public static let `default` = VideoAudioSettings(volume: 1, isMuted: false, fadeIn: 0, fadeOut: 0)

    public var isDefault: Bool {
        !isMuted
            && abs(volume - 1) < 0.001
            && fadeIn < 0.001
            && fadeOut < 0.001
    }

    public var effectiveVolume: Double { isMuted ? 0 : volume }

    public var sanitized: VideoAudioSettings {
        VideoAudioSettings(
            volume: min(VideoEditLimits.maxVolume, max(VideoEditLimits.minVolume, volume)),
            isMuted: isMuted,
            fadeIn: min(VideoEditLimits.maxFade, max(0, fadeIn)),
            fadeOut: min(VideoEditLimits.maxFade, max(0, fadeOut))
        )
    }
}

// MARK: - Segment

/// A contiguous slice of the source video. The timeline is the ordered
/// concatenation of its segments; a `split` inserts a divider, a `trim`
/// resizes the boundary segments.
public struct VideoSegment: Codable, Sendable, Equatable, Identifiable {
    public var id: UUID
    /// Inclusive start in *source* seconds.
    public var start: Double
    /// Exclusive end in *source* seconds.
    public var end: Double
    /// Playback rate; >1 faster, <1 slower.
    public var speed: Double

    public init(id: UUID = UUID(), start: Double, end: Double, speed: Double = 1) {
        self.id = id
        self.start = start
        self.end = end
        self.speed = speed
    }

    /// Duration in the source timeline.
    public var sourceDuration: Double { max(0, end - start) }

    /// Duration once `speed` is applied — the time it occupies on the edited
    /// timeline.
    public var playbackDuration: Double {
        speed > 0 ? sourceDuration / speed : sourceDuration
    }
}

// MARK: - Caption

public struct VideoCaption: Codable, Sendable, Equatable, Identifiable {
    public var id: UUID
    /// Start in *edited-timeline* seconds.
    public var start: Double
    public var end: Double
    public var text: String

    public init(id: UUID = UUID(), start: Double, end: Double, text: String) {
        self.id = id
        self.start = start
        self.end = end
        self.text = text
    }
}

// MARK: - Document

public struct VideoEditDocument: Codable, Sendable, Equatable {
    public var sourceURL: URL
    public var sourceDuration: Double
    public var naturalWidth: Double
    public var naturalHeight: Double
    public var hasAudioTrack: Bool

    public var segments: [VideoSegment]
    /// Clockwise rotation applied on top of the source orientation.
    public var rotationQuarterTurns: Int
    public var crop: NormalizedRect
    public var color: VideoColorAdjustment
    public var filter: VideoFilterPreset
    public var audio: VideoAudioSettings

    public var captions: [VideoCaption]
    public var captionLanguageCode: String?
    public var transcriptionText: String?

    /// Bumps on every mutating operation so the renderer can cheaply detect
    /// staleness without deep-comparing the whole document.
    public var revision: Int

    public init(
        sourceURL: URL,
        sourceDuration: Double,
        naturalWidth: Double,
        naturalHeight: Double,
        hasAudioTrack: Bool
    ) {
        self.sourceURL = sourceURL
        self.sourceDuration = max(0, sourceDuration)
        self.naturalWidth = max(1, naturalWidth)
        self.naturalHeight = max(1, naturalHeight)
        self.hasAudioTrack = hasAudioTrack
        self.segments = [VideoSegment(start: 0, end: max(0, sourceDuration))]
        self.rotationQuarterTurns = 0
        self.crop = .full
        self.color = .identity
        self.filter = .none
        self.audio = .default
        self.captions = []
        self.captionLanguageCode = nil
        self.transcriptionText = nil
        self.revision = 0
    }

    // MARK: Derived

    public var naturalSize: CGSize {
        CGSize(width: naturalWidth, height: naturalHeight)
    }

    /// Duration of the edited result, in seconds.
    public var editedDuration: Double {
        segments.reduce(0) { $0 + $1.playbackDuration }
    }

    /// Whether any edit at all has been applied — drives "export vs reuse
    /// original" and the enabled state of the confirm button.
    public var hasEdits: Bool {
        hasTimelineEdits
            || rotationQuarterTurns % 4 != 0
            || !crop.isFull
            || !color.isIdentity
            || filter != .none
            || !audio.isDefault
    }

    /// Edits that change the timeline itself (trim / split / speed).
    public var hasTimelineEdits: Bool {
        if segments.count != 1 { return true }
        guard let only = segments.first else { return true }
        let trimmed = only.start > 0.05 || only.end < sourceDuration - 0.05
        let resped = abs(only.speed - 1) > 0.001
        return trimmed || resped
    }

    public var firstSegment: VideoSegment? { segments.first }
    public var lastSegment: VideoSegment? { segments.last }

    /// Total trimmed-away lead-in (source seconds before the first kept frame).
    public var inPoint: Double { segments.first?.start ?? 0 }
    /// Source time of the last kept frame.
    public var outPoint: Double { segments.last?.end ?? sourceDuration }
}

// MARK: - Result

/// Hand-off payload returned to the caller once editing finishes.
public struct VideoEditResult: Sendable {
    public let url: URL
    public let didEdit: Bool
    public let duration: Double
    public let transcriptionText: String?
    public let captions: [VideoCaption]
    public let captionLanguageCode: String?

    public init(
        url: URL,
        didEdit: Bool,
        duration: Double,
        transcriptionText: String?,
        captions: [VideoCaption],
        captionLanguageCode: String?
    ) {
        self.url = url
        self.didEdit = didEdit
        self.duration = duration
        self.transcriptionText = transcriptionText
        self.captions = captions
        self.captionLanguageCode = captionLanguageCode
    }
}

// MARK: - Errors

public enum VideoEditError: LocalizedError, Equatable, Sendable {
    case sourceUnreadable
    case noVideoTrack
    case emptyTimeline
    case compositionFailed(String)
    case exportSetupFailed
    case exportFailed(String)
    case exportCancelled
    case exportTimedOut
    case unsupportedCodec

    public var errorDescription: String? {
        switch self {
        case .sourceUnreadable:        return "The video file could not be opened."
        case .noVideoTrack:            return "The file does not contain a video track."
        case .emptyTimeline:           return "The timeline is empty — nothing to export."
        case .compositionFailed(let m): return "Could not assemble the edit: \(m)"
        case .exportSetupFailed:       return "The export could not be configured."
        case .exportFailed(let m):     return "Export failed: \(m)"
        case .exportCancelled:         return "Export was cancelled."
        case .exportTimedOut:          return "Export timed out."
        case .unsupportedCodec:        return "This video uses an unsupported codec."
        }
    }

    public var isCancellation: Bool {
        self == .exportCancelled
    }
}
