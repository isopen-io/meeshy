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

    public nonisolated struct ControlSet: OptionSet, Sendable {
        public let rawValue: Int
        public init(rawValue: Int) { self.rawValue = rawValue }

        // `nonisolated` sur tous les membres : ControlSet est une valeur pure
        // (OptionSet + Sendable). Sous MeeshyUI defaultIsolation MainActor,
        // sans cette annotation les statiques deviennent isolées et les tests
        // nonisolated (cf. feedback_meeshyui_default_isolation) ne peuvent y
        // accéder. Voir aussi feedback_meeshyui_default_isolation.
        public nonisolated static let playPause   = ControlSet(rawValue: 1 << 0)
        public nonisolated static let scrubber    = ControlSet(rawValue: 1 << 1)
        public nonisolated static let duration    = ControlSet(rawValue: 1 << 2)
        public nonisolated static let expand      = ControlSet(rawValue: 1 << 3)
        public nonisolated static let download    = ControlSet(rawValue: 1 << 4)
        public nonisolated static let save        = ControlSet(rawValue: 1 << 5)
        public nonisolated static let share       = ControlSet(rawValue: 1 << 6)
        public nonisolated static let mute        = ControlSet(rawValue: 1 << 7)
        public nonisolated static let speed       = ControlSet(rawValue: 1 << 8)
        public nonisolated static let close       = ControlSet(rawValue: 1 << 9)
        public nonisolated static let author      = ControlSet(rawValue: 1 << 10)
        public nonisolated static let airplay     = ControlSet(rawValue: 1 << 11)
        public nonisolated static let pip         = ControlSet(rawValue: 1 << 12)
        public nonisolated static let loop        = ControlSet(rawValue: 1 << 13)

        public nonisolated static let none: ControlSet              = []
        public nonisolated static let inlineDefault: ControlSet     = [.playPause, .scrubber, .duration, .expand, .speed]
        public nonisolated static let fullscreenDefault: ControlSet = [
            .playPause, .scrubber, .duration, .save, .share, .close,
            .speed, .author, .mute, .airplay, .pip, .loop
        ]
        public nonisolated static let miniDefault: ControlSet       = [.duration]
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

        // `maxAspectRatio = nil` → la hauteur suit purement le ratio source
        // (width = largeur disponible, height = width / videoAspectRatio).
        // Bubble/card respectent intégralement le format de la vidéo, jusqu'à
        // un 9:16 portrait qui occupera ~60% d'un écran iPhone. C'est voulu.
        public static let bubble = Frame(maxAspectRatio: nil, maxHeight: nil,  cornerRadius: 0,  border: nil)
        public static let card   = Frame(maxAspectRatio: nil, maxHeight: nil,  cornerRadius: 12, border: nil)
        // Mini reste plafonné à 1:1 + 120pt (preview chip, pas de raison de
        // déborder en hauteur pour un thumbnail).
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
    /// WS3.7 — opaque opt-in for the `.inline` path: when `true`, the inline
    /// renderer starts playback (and unmutes the shared engine) on `.onAppear`
    /// instead of waiting for a tap, provided the asset is ready and no call
    /// owns the audio session. Default `false` keeps every existing call site
    /// (feed, bubbles, carousels) tap-to-play & muted. The SDK only exposes the
    /// flag; the decision to autoplay in a focused detail view is app-side.
    public let autoplayOnAppear: Bool
    /// F5 — opaque mute intent for the autoplay-on-appear path. When the inline
    /// renderer autoplays (see `autoplayOnAppear`) it sets the shared engine's
    /// mute to this value. Default `false` keeps the historical behavior
    /// (autoplay unmutes). The product decision "detail = sound on, feed = muted"
    /// lives app-side; the SDK only forwards the flag (SDK purity).
    public let autoplayMuted: Bool
    /// Diamètre du bouton play/download central du renderer `.inline`.
    /// Paramètre opaque : l'app le réduit pour les petites cellules (grille
    /// multi-média) et garde le défaut 64pt pour les surfaces pleine largeur.
    public let playButtonDiameter: CGFloat
    public let author: VideoAuthor?
    public let caption: String?
    public let fileName: String?
    public let mentionDisplayNames: [String: String]?
    public let onDownload: (() -> Void)?
    public let onExpand: (() -> Void)?
    public let onShare: (() -> Void)?
    public let onClose: (() -> Void)?
    public let onSaveSuccess: (() -> Void)?
    /// Hook paramétrique « Enregistrer » — délègue au composant unifié de
    /// l'app quand fourni ; nil = save Photos direct legacy.
    public let onSaveRequested: (() -> Void)?

    public init(
        attachment: MeeshyMessageAttachment,
        style: Style,
        controls: ControlSet,
        accentColor: String,
        frame: Frame = .bubble,
        availability: VideoAvailability = .ready,
        performance: PerformanceOptions? = nil,
        autoplayOnAppear: Bool = false,
        autoplayMuted: Bool = false,
        playButtonDiameter: CGFloat = 64,
        author: VideoAuthor? = nil,
        caption: String? = nil,
        fileName: String? = nil,
        mentionDisplayNames: [String: String]? = nil,
        onDownload: (() -> Void)? = nil,
        onExpand: (() -> Void)? = nil,
        onShare: (() -> Void)? = nil,
        onClose: (() -> Void)? = nil,
        onSaveSuccess: (() -> Void)? = nil,
        onSaveRequested: (() -> Void)? = nil
    ) {
        self.attachment = attachment
        self.style = style
        self.controls = controls
        self.accentColor = accentColor
        self.frame = frame
        self.availability = availability
        self.performance = performance ?? Self.inferPerformance(for: style)
        self.autoplayOnAppear = autoplayOnAppear
        self.autoplayMuted = autoplayMuted
        self.playButtonDiameter = playButtonDiameter
        self.author = author
        self.caption = caption
        self.fileName = fileName
        self.mentionDisplayNames = mentionDisplayNames
        self.onDownload = onDownload
        self.onExpand = onExpand
        self.onShare = onShare
        self.onClose = onClose
        self.onSaveSuccess = onSaveSuccess
        self.onSaveRequested = onSaveRequested
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
