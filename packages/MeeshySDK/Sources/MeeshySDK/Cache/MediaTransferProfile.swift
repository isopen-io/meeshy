import Foundation

/// Ce qu'un transfert média attend de la session qui le porte (#11283).
///
/// `immediate` : quelqu'un regarde ou attend l'octet (lecture, décodage,
/// montage). `deferrable` : on prépare pour plus tard (paliers prime / idle de
/// la fenêtre de préchargement) — le système peut le différer.
public enum MediaTransferPriority: Sendable, Equatable, Hashable {
    case immediate
    case deferrable
}

/// Le profil réseau d'un téléchargement média : une `URLSession` ne change pas
/// de configuration après sa création, donc chaque profil a sa propre session.
///
/// Building block opaque : il reçoit la priorité et le réglage de données
/// mobiles en paramètres. La politique « quel palier, quel réglage » reste côté
/// app ; ce type ne décide que comment la configuration se déduit.
public struct MediaTransferProfile: Sendable, Equatable, Hashable {
    public static let standard = MediaTransferProfile(priority: .immediate, allowsExpensiveNetworkAccess: true)

    public let priority: MediaTransferPriority
    public let allowsExpensiveNetworkAccess: Bool

    public init(priority: MediaTransferPriority, allowsExpensiveNetworkAccess: Bool) {
        self.priority = priority
        self.allowsExpensiveNetworkAccess = allowsExpensiveNetworkAccess
    }

    public var isDiscretionary: Bool {
        priority == .deferrable
    }

    /// Une copie de `base` typée vidéo, avec le réglage de données et la
    /// discrétion du profil. `base` n'est jamais muté (la session partagée
    /// de l'app garde sa configuration).
    public func configured(from base: URLSessionConfiguration) -> URLSessionConfiguration {
        guard let copy = base.copy() as? URLSessionConfiguration else { return base }
        copy.networkServiceType = .video
        copy.allowsExpensiveNetworkAccess = allowsExpensiveNetworkAccess
        copy.isDiscretionary = isDiscretionary
        return copy
    }
}

extension MediaTransferPriority {
    public init(reelTier: ReelPreloadWindow.Tier) {
        switch reelTier {
        case .play, .decode, .mount: self = .immediate
        case .prime, .idle: self = .deferrable
        }
    }
}
