import Foundation
import CoreGraphics
import UIKit
import SwiftUI
import MeeshySDK

// MARK: - StoryExportPresence

/// **La présence de l'auteur, telle que le serveur l'a SERVIE, ramenée à ce que l'export peint**
/// (#13997). Un type opaque pour le SDK : l'app projette `UserPresence` / `PresenceState` ;
/// `nil` (donc « hors ligne » ou « non servie ») ne peint AUCUN point. Le client ne décide
/// jamais d'une présence : il projette celle qu'il a reçue.
public nonisolated enum StoryExportPresence: Equatable, Sendable {
    case online
    case away
    case idle

    /// `.offline` ne rend rien — comme sur tous les avatars de l'app.
    public init?(_ state: PresenceState) {
        switch state {
        case .online: self = .online
        case .away: self = .away
        case .idle: self = .idle
        case .offline: return nil
        }
    }

    /// Le mapping couleur CENTRAL (`PresenceState.dotColor`) : jamais redéclaré ici.
    var presenceState: PresenceState {
        switch self {
        case .online: return .online
        case .away: return .away
        case .idle: return .idle
        }
    }
}

// MARK: - StoryExportIdentityBadges

/// Les deux marques d'affinité de la carte d'identité d'un export : le POINT de présence
/// posé sur le bord bas-droit de l'avatar, et le LOGO du cercle à droite du nom.
enum StoryExportIdentityBadges {

    /// Part du diamètre de l'avatar, et épaisseur du liseré sombre en part du diamètre du point.
    static let dotFraction: CGFloat = 0.22
    static let rimFraction: CGFloat = 0.14

    /// Le point est centré sur le bord bas-droit (45°) du disque d'avatar inscrit dans `avatarBox`.
    static func presenceDotRect(avatarBox: CGRect) -> CGRect {
        let diameter = avatarBox.width * dotFraction
        let radius = avatarBox.width / 2
        let offset = radius * CGFloat(2).squareRoot() / 2
        return CGRect(x: avatarBox.midX + offset - diameter / 2,
                      y: avatarBox.midY + offset - diameter / 2,
                      width: diameter,
                      height: diameter)
    }

    /// Un liseré sombre, puis le point : lisible sur n'importe quel avatar.
    static func drawPresenceDot(_ presence: StoryExportPresence, avatarBox: CGRect, in cg: CGContext) {
        let dot = presenceDotRect(avatarBox: avatarBox)
        let rim = dot.width * rimFraction
        cg.saveGState()
        cg.setFillColor(UIColor.black.withAlphaComponent(0.6).cgColor)
        cg.fillEllipse(in: dot.insetBy(dx: -rim, dy: -rim))
        cg.setFillColor(UIColor(presence.presenceState.dotColor).cgColor)
        cg.fillEllipse(in: dot)
        cg.restoreGState()
    }

    /// La ligne du nom : le nom, puis le logo du cercle à sa droite, même ligne et même police.
    /// Sans logo, la ligne est exactement le nom.
    static func nameLine(displayName: String, logo: String?) -> String {
        guard let logo, !logo.isEmpty else { return displayName }
        return "\(displayName) \(logo)"
    }
}
