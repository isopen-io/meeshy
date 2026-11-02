import SwiftUI
import AVFoundation
import MeeshySDK

/// Unified polymorphic video player. ONE component for inline bubble cells,
/// carousel slides, feed posts, story foreground previews, fullscreen
/// covers, reply chips, and composer attachment previews.
///
/// Behaviour driven by `Style` + `ControlSet`. Layout driven by `Frame`.
/// Buffering is the live media policy's (`MediaPolicyMonitor`), never a
/// per-surface preset.
///
/// Replaces : `InlineVideoPlayerView`, `VideoPlayerView`,
/// `VideoFullscreenPlayerView`, the app-side `VideoMediaView`,
/// `GatedVideoFullscreenPlayer` and `VideoFullscreenPlayer` (those become
/// wrappers around `VideoAvailabilityResolver { MeeshyVideoPlayer }`).
public struct MeeshyVideoPlayer: View {

    // MARK: - Style

    public enum Style: Sendable {
        case inline
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
        /// Les sauts ±10 s du renderer `.inline`, jusqu'ici posés sans
        /// condition de part et d'autre de lecture/pause : les rendre
        /// retirables est ce qui permet un jeu à trois contrôles (#8231).
        public nonisolated static let skip        = ControlSet(rawValue: 1 << 14)

        public nonisolated static let none: ControlSet              = []
        /// Sans `.pip` : une vidéo inline ne part jamais en PiP, seul le plein
        /// écran en ouvre un (#11041, décision porteur e).
        public nonisolated static let inlineDefault: ControlSet     = [.playPause, .skip, .scrubber, .duration, .expand, .airplay, .speed]
        /// Son · lecture/pause · plein écran — rien d'autre (#8231, lecture
        /// dans le fil d'une conversation). Ni saut, ni barre, ni temps, ni
        /// vitesse, ni PiP : tout cela vit au plein écran, à un toucher.
        public nonisolated static let inlineMinimal: ControlSet     = [.mute, .playPause, .expand]
        public nonisolated static let fullscreenDefault: ControlSet = [
            .playPause, .scrubber, .duration, .save, .share, .close,
            .speed, .author, .mute, .airplay, .pip, .loop
        ]
        /// Le plein écran d'un média qui n'est pas (encore) un message — la
        /// citation d'une réponse en cours de composition : on le regarde ou on
        /// l'écoute, on n'en fait rien sortir (ni `.save`, ni `.share`), et
        /// aucun auteur ni boucle ne s'y ajoute (#9890).
        public nonisolated static let fullscreenPreview: ControlSet = fullscreenDefault.subtracting([.save, .share, .author, .loop])
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
        public static let card   = Frame(maxAspectRatio: nil, maxHeight: nil,  cornerRadius: MeeshyRadius.smPlus, border: nil)
        public static let flat   = Frame(maxAspectRatio: nil, maxHeight: nil,  cornerRadius: 0,  border: nil)
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

    // MARK: - Poster

    /// Poster NET d'une vidéo, servi AVANT la première frame décodée (et dans
    /// l'overlay de téléchargement). Opaque : l'app le RÉSOUT (fichier local,
    /// poster persisté, extraction) — le SDK ne fait que l'afficher.
    /// `initial` est lu au montage (aucune transition quand il est déjà
    /// résident) ; `resolve` prend le relais quand il manque.
    public struct Poster: Sendable {
        public let initial: UIImage?
        public let resolve: (@Sendable @concurrent () async -> UIImage?)?
        public init(initial: UIImage? = nil, resolve: (@Sendable () async -> UIImage?)? = nil) {
            self.initial = initial
            self.resolve = resolve
        }
    }

    // MARK: - Properties

    public let attachment: MeeshyMessageAttachment
    public let style: Style
    public private(set) var controls: ControlSet
    public let accentColor: String
    public let frame: Frame
    public let availability: VideoAvailability
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
    /// Paramètre opaque du renderer `.inline` : quand `true`, toucher la vidéo
    /// HORS de ses contrôles — le poster avant la lecture, la surface pendant —
    /// appelle `onExpand` au lieu de montrer/masquer les contrôles. Défaut
    /// `false` : toutes les surfaces existantes gardent leur geste.
    public let surfaceTapExpands: Bool
    /// Paramètre opaque : `false` joue la pièce SANS la rapporter — ni
    /// `watched` au serveur, ni consommation, ni position de reprise. Honoré
    /// par les deux renderers. Défaut `true` : chaque surface existante garde
    /// son suivi. L'app décide quand une lecture n'est pas un visionnage
    /// honnête de CETTE pièce (un son joué par le moteur vidéo, #9890).
    public let reportsConsumption: Bool
    public let author: VideoAuthor?
    public let caption: String?
    public let fileName: String?
    public let mentionDisplayNames: [String: String]?
    /// #3897 — honoré UNIQUEMENT par `.fullscreen` (`_FullscreenRenderer`).
    /// Pas un oubli dans l'autre style : `.inline` (`_InlineRenderer`)
    /// résout DÉJÀ son propre poster net via `MeeshyVideoThumbnail` (cascade
    /// équivalente, grade bulle 300px) — passer CE `poster` là-bas serait un
    /// second chemin concurrent pour le même résultat. Un futur appelant
    /// passant `poster:` avec un style autre que `.fullscreen` ne doit pas
    /// s'attendre à un effet.
    public let poster: Poster?
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
        autoplayOnAppear: Bool = false,
        autoplayMuted: Bool = false,
        playButtonDiameter: CGFloat = 64,
        surfaceTapExpands: Bool = false,
        reportsConsumption: Bool = true,
        author: VideoAuthor? = nil,
        caption: String? = nil,
        fileName: String? = nil,
        mentionDisplayNames: [String: String]? = nil,
        poster: Poster? = nil,
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
        self.autoplayOnAppear = autoplayOnAppear
        self.autoplayMuted = autoplayMuted
        self.playButtonDiameter = playButtonDiameter
        self.surfaceTapExpands = surfaceTapExpands
        self.reportsConsumption = reportsConsumption
        self.author = author
        self.caption = caption
        self.fileName = fileName
        self.mentionDisplayNames = mentionDisplayNames
        self.poster = poster
        self.onDownload = onDownload
        self.onExpand = onExpand
        self.onShare = onShare
        self.onClose = onClose
        self.onSaveSuccess = onSaveSuccess
        self.onSaveRequested = onSaveRequested
    }

    /// Sous un bouclier de capture (#9574), la vidéo protégée n'offre ni PiP
    /// ni AirPlay : les renderers reçoivent les contrôles PERMIS, et la surface
    /// ne configure donc aucune fenêtre PiP (`surfaceEnablesPip`).
    @Environment(\.isCaptureShielded) private var isCaptureShielded

    private var permitted: MeeshyVideoPlayer {
        var player = self
        player.controls = ProtectedPlaybackPolicy.of(isCaptureShielded: isCaptureShielded).permitted(controls)
        return player
    }

    public var body: some View {
        let player = permitted
        Group {
            switch style {
            case .inline:     _InlineRenderer(player: player)
            case .fullscreen: _FullscreenRenderer(player: player)
            }
        }
    }
}
