import SwiftUI
import AVFoundation
import MeeshySDK

/// Unified polymorphic video player. ONE component for inline bubble cells,
/// carousel slides, feed posts, story foreground previews, fullscreen
/// covers, reply chips, and composer attachment previews.
///
/// Behaviour driven by `Style` + `ControlSet`. Layout driven by `Frame`.
/// Performance driven by `PerformanceOptions` (preset inferred from
/// `Style` when not specified).
///
/// Replaces : `InlineVideoPlayerView`, `VideoPlayerView`,
/// `VideoFullscreenPlayerView`, `StoryVideoPlayerView`, the app-side
/// `VideoMediaView` and `GatedVideoFullscreenPlayer` (those become wrappers
/// around `VideoAvailabilityResolver { MeeshyVideoPlayer }`).
public struct MeeshyVideoPlayer: View {

    // MARK: - Style

    public enum Style: Sendable {
        case flat
        case inline
        case mini
        case fullscreen
    }

    // MARK: - ControlSet

    public struct ControlSet: OptionSet, Sendable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }

        public static let playPause   = ControlSet(rawValue: 1 << 0)
        public static let scrubber    = ControlSet(rawValue: 1 << 1)
        public static let duration    = ControlSet(rawValue: 1 << 2)
        public static let expand      = ControlSet(rawValue: 1 << 3)
        public static let download    = ControlSet(rawValue: 1 << 4)
        public static let save        = ControlSet(rawValue: 1 << 5)
        public static let share       = ControlSet(rawValue: 1 << 6)
        public static let mute        = ControlSet(rawValue: 1 << 7)
        public static let speed       = ControlSet(rawValue: 1 << 8)
        public static let close       = ControlSet(rawValue: 1 << 9)
        public static let author      = ControlSet(rawValue: 1 << 10)

        public static let none: ControlSet              = []
        public static let inlineDefault: ControlSet     = [.playPause, .scrubber, .duration, .expand]
        public static let fullscreenDefault: ControlSet = [.playPause, .scrubber, .duration, .save, .share, .close, .speed, .author]
        public static let miniDefault: ControlSet       = [.duration]
    }

    // MARK: - Frame

    public struct Frame: Sendable {
        public var maxAspectRatio: CGFloat?
        public var maxHeight: CGFloat?
        public var cornerRadius: CGFloat
        public var border: BorderStyle?

        public init(maxAspectRatio: CGFloat?, maxHeight: CGFloat?, cornerRadius: CGFloat, border: BorderStyle?) {
            self.maxAspectRatio = maxAspectRatio
            self.maxHeight = maxHeight
            self.cornerRadius = cornerRadius
            self.border = border
        }

        public struct BorderStyle: Sendable {
            public let color: Color
            public let width: CGFloat
            public init(color: Color, width: CGFloat) {
                self.color = color
                self.width = width
            }
        }

        public static let bubble = Frame(maxAspectRatio: 1.6, maxHeight: nil,  cornerRadius: 0,  border: nil)
        public static let card   = Frame(maxAspectRatio: 1.6, maxHeight: nil,  cornerRadius: 12, border: nil)
        public static let mini   = Frame(maxAspectRatio: 1.0, maxHeight: 120,  cornerRadius: 8,  border: nil)
        public static let flat   = Frame(maxAspectRatio: nil, maxHeight: nil,  cornerRadius: 0,  border: nil)
    }

    // MARK: - PerformanceOptions

    public struct PerformanceOptions: Sendable {
        public var sharedPlayer: Bool
        public var preloadOnAppear: Bool
        public var preferredForwardBufferDuration: Double
        public var waitsToMinimizeStalling: Bool
        public var preferredPeakBitRate: Double?

        public init(sharedPlayer: Bool, preloadOnAppear: Bool, preferredForwardBufferDuration: Double, waitsToMinimizeStalling: Bool, preferredPeakBitRate: Double?) {
            self.sharedPlayer = sharedPlayer
            self.preloadOnAppear = preloadOnAppear
            self.preferredForwardBufferDuration = preferredForwardBufferDuration
            self.waitsToMinimizeStalling = waitsToMinimizeStalling
            self.preferredPeakBitRate = preferredPeakBitRate
        }

        public static let inline     = PerformanceOptions(sharedPlayer: true,  preloadOnAppear: false, preferredForwardBufferDuration: 2.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let carousel   = PerformanceOptions(sharedPlayer: false, preloadOnAppear: true,  preferredForwardBufferDuration: 2.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let flat       = PerformanceOptions(sharedPlayer: false, preloadOnAppear: true,  preferredForwardBufferDuration: 1.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let fullscreen = PerformanceOptions(sharedPlayer: false, preloadOnAppear: true,  preferredForwardBufferDuration: 4.0, waitsToMinimizeStalling: false, preferredPeakBitRate: nil)
        public static let mini       = PerformanceOptions(sharedPlayer: false, preloadOnAppear: false, preferredForwardBufferDuration: 0,   waitsToMinimizeStalling: true,  preferredPeakBitRate: nil)
    }

    // MARK: - VideoAuthor

    public struct VideoAuthor: Sendable {
        public let displayName: String
        public let avatarUrl: String?
        public let userId: String
        public let onTap: (@Sendable () -> Void)?
        public init(displayName: String, avatarUrl: String?, userId: String, onTap: (@Sendable () -> Void)? = nil) {
            self.displayName = displayName
            self.avatarUrl = avatarUrl
            self.userId = userId
            self.onTap = onTap
        }
    }

    // MARK: - Properties

    public let attachment: MeeshyMessageAttachment
    public let style: Style
    public let controls: ControlSet
    public let accentColor: String
    public let frame: Frame
    public let availability: VideoAvailability
    public let performance: PerformanceOptions
    public let author: VideoAuthor?
    public let caption: String?
    public let fileName: String?
    public let mentionDisplayNames: [String: String]?
    public let onDownload: (() -> Void)?
    public let onExpand: (() -> Void)?
    public let onShare: (() -> Void)?
    public let onClose: (() -> Void)?
    public let onSaveSuccess: (() -> Void)?

    public init(
        attachment: MeeshyMessageAttachment,
        style: Style,
        controls: ControlSet,
        accentColor: String,
        frame: Frame = .bubble,
        availability: VideoAvailability = .ready,
        performance: PerformanceOptions? = nil,
        author: VideoAuthor? = nil,
        caption: String? = nil,
        fileName: String? = nil,
        mentionDisplayNames: [String: String]? = nil,
        onDownload: (() -> Void)? = nil,
        onExpand: (() -> Void)? = nil,
        onShare: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onSaveSuccess: (() -> Void)? = nil
    ) {
        self.attachment = attachment
        self.style = style
        self.controls = controls
        self.accentColor = accentColor
        self.frame = frame
        self.availability = availability
        self.performance = performance ?? Self.inferPerformance(for: style)
        self.author = author
        self.caption = caption
        self.fileName = fileName
        self.mentionDisplayNames = mentionDisplayNames
        self.onDownload = onDownload
        self.onExpand = onExpand
        self.onShare = onShare
        self.onClose = onClose
        self.onSaveSuccess = onSaveSuccess
    }

    private static func inferPerformance(for style: Style) -> PerformanceOptions {
        switch style {
        case .flat:       return .flat
        case .inline:     return .inline
        case .mini:       return .mini
        case .fullscreen: return .fullscreen
        }
    }

    public var body: some View {
        Group {
            switch style {
            case .flat:       _FlatRenderer(player: self)
            case .inline:     _InlineRenderer(player: self)
            case .mini:       _MiniRenderer(player: self)
            case .fullscreen: _FullscreenRenderer(player: self)
            }
        }
    }
}
