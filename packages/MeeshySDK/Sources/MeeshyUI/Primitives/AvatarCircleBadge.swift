import SwiftUI
import MeeshySDK

// MARK: - La pastille de cercle d'un avatar (#20178)
//
// Une personne de mes cercles porte, en bas à gauche de son avatar, l'icône de son cercle — celle même que le sélecteur
// d'audience montre à la publication. La présence garde le bas à droite. Le SDK ne sait pas qui est dans quel cercle :
// l'app lui remet les niveaux servis par l'environnement, et l'avatar ne lit que celui de SA personne.

/// Les niveaux de cercle servis, par identifiant de personne. Hors de la table, ou au niveau Public : aucune pastille.
public struct AvatarCircleLevels: Equatable, Sendable {
    private let levels: [String: RelationLevel]

    public init(_ levels: [String: RelationLevel]) {
        self.levels = levels
    }

    public static let none = AvatarCircleLevels([:])

    public func level(for userId: String?) -> RelationLevel? {
        guard let userId, !userId.isEmpty else { return nil }
        return AvatarCircleBadge.shownLevel(levels[userId])
    }
}

/// La loi de la pastille : quel cercle se montre, avec quelle icône, où et à partir de quelle taille d'avatar.
public enum AvatarCircleBadge {
    /// Sous ce diamètre, l'icône ne se lit plus : la pastille ne se peint pas.
    public static let minimumAvatarSize: CGFloat = 28
    static let ratio: CGFloat = 0.32
    static let minimumDiameter: CGFloat = 14
    /// Une pastille, jamais un médaillon : sur le grand avatar d'une fiche, elle s'arrête là.
    static let maximumDiameter: CGFloat = 30

    /// Le cercle à montrer : aucun hors cercle (Public ou rien de servi).
    public static func shownLevel(_ level: RelationLevel?) -> RelationLevel? {
        guard let level, level > .public else { return nil }
        return level
    }

    /// L'icône du cercle, la même que celle de l'audience qui le vise (`PostVisibility.icon`).
    public static func glyph(_ level: RelationLevel) -> String {
        switch level {
        case .public: return PostVisibility.public.icon
        case .community: return PostVisibility.community.icon
        case .acquaintance: return PostVisibility.acquaintances.icon
        case .friend: return PostVisibility.friends.icon
        case .close: return PostVisibility.close.icon
        case .blood: return PostVisibility.blood.icon
        }
    }

    /// Ce que VoiceOver ajoute au nom : « cercle Proche ».
    public static func spoken(_ level: RelationLevel) -> String {
        let name = ProfileInCommonCopy.circle(level)
        return String(localized: "avatar.a11y.circle", defaultValue: "cercle \(name)", bundle: .module)
    }

    public static func isDrawn(avatarSize: CGFloat) -> Bool {
        avatarSize >= minimumAvatarSize
    }

    public static func diameter(avatarSize: CGFloat) -> CGFloat {
        min(maximumDiameter, max(minimumDiameter, avatarSize * ratio))
    }

    /// Le miroir du point de présence : posé sur le contour, à 45° en bas à GAUCHE.
    public static func centerOffset(avatarSize: CGFloat, frameSize: CGFloat, diameter: CGFloat) -> CGSize {
        let presence = AvatarPresenceDot.centerOffset(avatarSize: avatarSize, frameSize: frameSize, dotDiameter: diameter)
        return CGSize(width: -presence.width, height: presence.height)
    }
}

/// La pastille elle-même : un rond de la couleur de marque, cerné du fond, l'icône du cercle en blanc. Décorative pour
/// VoiceOver — l'avatar dit le cercle dans son libellé.
struct AvatarCircleBadgeView: View, Equatable {
    let level: RelationLevel
    let diameter: CGFloat
    let ringColor: Color

    var body: some View {
        Image(systemName: AvatarCircleBadge.glyph(level))
            .resizable()
            .scaledToFit()
            .fontWeight(.bold)
            .foregroundStyle(Color.white)
            .frame(width: diameter * 0.52, height: diameter * 0.52)
            .frame(width: diameter, height: diameter)
            .background(Circle().fill(MeeshyColors.brandPrimary))
            .overlay(Circle().stroke(ringColor, lineWidth: MeeshyBorder.strong))
            .accessibilityHidden(true)
    }
}

private struct AvatarCircleLevelsKey: EnvironmentKey {
    static let defaultValue = AvatarCircleLevels.none
}

public extension EnvironmentValues {
    /// Les cercles servis des personnes affichées ; vide par défaut : aucune pastille.
    var avatarCircleLevels: AvatarCircleLevels {
        get { self[AvatarCircleLevelsKey.self] }
        set { self[AvatarCircleLevelsKey.self] = newValue }
    }
}
