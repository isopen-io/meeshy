import CoreGraphics
import Foundation

// MARK: - Le passage de réel à réel suit le doigt comme un rail (#10354)

/// **Ce qu'un passage de réel à réel a le droit de faire, selon la phase.**
///
/// Mesuré sur l'iPhone 16 Pro Max (build Release, 2026-10-12) : la page restait
/// figée à mi-chemin 250 à 450 ms pendant les balayages rapides, parce que
/// l'élection À MI-COURSE (`AdaptiveVerticalPager.onMajorityPage`) déclenchait
/// tout le travail du réel entrant SUR le fil du geste — `load()` et `cleanup()`
/// du moteur, contrôleur PiP, session audio, coordinateur de lecture, rapports
/// de visionnage, montage du chrome, démarrage de la scène ou du son.
///
/// La loi sépare deux phases :
/// - **geste** — le doigt tient encore la page, ou la page défile vers sa
///   place : le sortant se met en PAUSE, et le réel vidéo entrant dont le
///   lecteur est DÉJÀ attaché à la surface (pool N±1, #9837) se met à jouer.
///   Rien d'autre : aucun lecteur créé, aucun contrôleur, aucune session ;
/// - **posé** — le défilement s'est arrêté sur la page : le reste s'exécute.
///
/// Rien de fonctionnel ne disparaît : lecture, boucle, son, PiP, statistiques
/// et rapports sont DÉPLACÉS après le geste, jamais retirés.
public nonisolated struct ReelSwitchWork: OptionSet, Sendable, Hashable {
    public let rawValue: Int

    public init(rawValue: Int) { self.rawValue = rawValue }

    /// Mettre en pause le lecteur du réel qu'on quitte (un `pause()` brut).
    public static let pauseOutgoing = ReelSwitchWork(rawValue: 1 << 0)
    /// `play()` du lecteur déjà attaché à la surface entrante.
    public static let playAttachedPlayer = ReelSwitchWork(rawValue: 1 << 1)
    /// `load()` du moteur partagé : adoption ou création d'`AVPlayer`/`AVPlayerItem`,
    /// `cleanup()` du sortant, observateurs, recyclage du sortant au pool.
    public static let loadEngine = ReelSwitchWork(rawValue: 1 << 2)
    /// `setCategory` / `setActive` de la session audio.
    public static let configureSession = ReelSwitchWork(rawValue: 1 << 3)
    /// `PlaybackCoordinator.willStartPlaying` (arrête les autres lecteurs).
    public static let coordinatePlayback = ReelSwitchWork(rawValue: 1 << 4)
    /// Rapports de visionnage, engagement, consommation servie.
    public static let reportWatch = ReelSwitchWork(rawValue: 1 << 5)
    /// Création du contrôleur Picture-in-Picture.
    public static let configurePip = ReelSwitchWork(rawValue: 1 << 6)
    /// Relecture du pool de lecteurs préparés (`poolDidChange`).
    public static let refreshPool = ReelSwitchWork(rawValue: 1 << 7)
    /// Démarrage d'une scène composée (canvas, calques, mixer).
    public static let startScene = ReelSwitchWork(rawValue: 1 << 8)
    /// Démarrage du moteur audio d'un réel audio ou d'un son emprunté.
    public static let startAudio = ReelSwitchWork(rawValue: 1 << 9)
    /// Montage du chrome propre au réel actif (barre de lecture, commande audio).
    public static let mountActiveChrome = ReelSwitchWork(rawValue: 1 << 10)

    /// La phase du passage, vue depuis une page.
    public nonisolated enum Phase: Sendable, Equatable {
        /// Le doigt ou l'inertie déplace encore le pager.
        case gesture
        /// Le défilement s'est arrêté sur la page.
        case settled
    }

    /// Ce que la page entrante porte.
    public nonisolated enum Kind: Sendable, Equatable {
        /// Une vidéo ; `attachedPlayer` = sa surface tient déjà un lecteur prêt.
        case video(attachedPlayer: Bool)
        /// Une scène composée.
        case scene
        /// Un réel audio, ou un réel sans média qui joue un son emprunté.
        case audio
        /// Une ou plusieurs images, sans son.
        case image
    }

    /// **Le travail permis**, pour le réel entrant d'un passage.
    public static func permitted(in phase: Phase, for kind: Kind) -> ReelSwitchWork {
        switch phase {
        case .gesture:
            guard case .video(attachedPlayer: true) = kind else { return .pauseOutgoing }
            return [.pauseOutgoing, .playAttachedPlayer]
        case .settled:
            return settledWork(for: kind)
        }
    }

    private static func settledWork(for kind: Kind) -> ReelSwitchWork {
        let common: ReelSwitchWork = [.pauseOutgoing, .reportWatch, .mountActiveChrome]
        switch kind {
        case .video:
            return common.union([.loadEngine, .configureSession, .coordinatePlayback,
                                 .configurePip, .refreshPool])
        case .scene:
            return common.union([.startScene, .configureSession])
        case .audio:
            return common.union([.startAudio, .configureSession, .coordinatePlayback])
        case .image:
            return common
        }
    }

    /// Pendant le geste, le lecteur attaché à la surface entrante joue s'il
    /// existe, si le fichier est prêt, si la révélation d'ouverture est finie
    /// et si aucun appel ne tient la session. Sinon le poster reste.
    public static func mayPlayAttachedPlayer(
        ready: Bool, revealCompleted: Bool, isCallActive: Bool, hasAttachedPlayer: Bool
    ) -> Bool {
        ready && revealCompleted && !isCallActive && hasAttachedPlayer
    }

    /// La phase d'une page, depuis les deux signaux du lecteur : élue (elle
    /// passe la moitié de l'écran, pendant le geste) et posée (le paging s'est
    /// arrêté sur elle). `nil` : la page ne joue pas.
    public static func phase(isElected: Bool, isSettled: Bool) -> Phase? {
        guard isElected else { return nil }
        return isSettled ? .settled : .gesture
    }

    /// La page ENGAGE son média (scène, son, chrome actif, moteur complet) :
    /// élue ET posée. La perte de l'élection, elle, désengage tout de suite.
    public static func engages(isElected: Bool, isSettled: Bool) -> Bool {
        phase(isElected: isElected, isSettled: isSettled) == .settled
    }
}

// MARK: - La barre de lecture ne vole plus le balayage vertical (#10354)

/// **La barre de lecture d'un réel ne revendique que l'axe HORIZONTAL.**
///
/// Elle posait un `highPriorityGesture(DragGesture(minimumDistance: 0))` : tout
/// balayage vertical qui partait du bas de l'écran — là où le pouce se pose —
/// était avalé par la barre, et le pager ne défilait pas. Le glissement ne
/// commence qu'après `minimumDistance`, et ne parcourt la vidéo que s'il est
/// d'abord horizontal ; une fois parti, il garde la main jusqu'au relâcher.
public nonisolated enum ReelScrubAxis {
    public static let minimumDistance: CGFloat = 6

    public static func claims(translation: CGSize, alreadySeeking: Bool) -> Bool {
        alreadySeeking || abs(translation.width) > abs(translation.height)
    }
}
