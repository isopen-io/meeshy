import Foundation

/// **Ce qu'un palier a de CÉLÉBRABLE — dérivé de la notification, jamais fabriqué.**
///
/// Toucher une notification de palier ouvrait DIRECTEMENT le tableau de bord
/// (#5809) : le succès qu'on venait d'obtenir n'était jamais montré, il fallait
/// le retrouver soi-même dans une grille de badges. Ce type est ce que la
/// célébration a besoin de savoir, et rien de plus.
///
/// **`nil` plutôt qu'un repli.** `from(type:metadata:)` rend `nil` dès que la
/// charge ne dit pas QUOI célébrer — et l'appelant ouvre alors le tableau de
/// bord comme avant. Fabriquer un palier par défaut (« premier contenu », le
/// niveau 1) donnerait une célébration COHÉRENTE et FAUSSE : badge bien dessiné,
/// titre plausible, et le mauvais palier. C'est le repli MENTEUR de la grappe
/// des contrôles — le plus cher, parce qu'il ne se voit qu'à la lecture.
public enum EngagementReveal: Equatable, Sendable {
    case achievement(EngagementAchievementKey)
    case streak(days: Int)
    case level(Int)

    /// Les types de notification qui annoncent un palier. Les deux clés de
    /// succès (moderne et LEGACY majuscule) comptent pour une seule : le fil
    /// porte encore les deux pour les clients déployés.
    public static let announcingTypes: Set<MeeshyNotificationType> = [
        .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned,
    ]

    /// Dérive le palier d'une notification, ou rend `nil` s'il n'est pas là.
    ///
    /// L'ordre des branches suit la SPÉCIFICITÉ, pas l'ordre du catalogue : un
    /// `level_up` porte `threshold` ET `level`, et c'est le RANG qui se
    /// célèbre. Lire `threshold` d'abord en ferait une série de 400 jours.
    public static func from(type: MeeshyNotificationType, metadata: NotificationMetadata?) -> EngagementReveal? {
        from(type: type, achievementKey: metadata?.achievementKey,
             threshold: metadata?.threshold, level: metadata?.level)
    }

    /// Porte du chemin SOCKET. `SocketNotificationMetadata` est un type
    /// DISTINCT de `NotificationMetadata` — deux décodeurs pour un même objet
    /// sur le fil. La règle, elle, n'existe qu'une fois : ces deux surcharges
    /// ne font que la nourrir. Les laisser diverger ferait célébrer un palier
    /// reçu par la liste des notifications et pas le même reçu en direct.
    public static func from(type: MeeshyNotificationType, metadata: SocketNotificationMetadata?) -> EngagementReveal? {
        from(type: type, achievementKey: metadata?.achievementKey,
             threshold: metadata?.threshold, level: metadata?.level)
    }

    /// **La règle, à son site unique.**
    public static func from(
        type: MeeshyNotificationType, achievementKey: String?, threshold: Int?, level: Int?
    ) -> EngagementReveal? {
        switch type {
        case .achievementUnlocked, .legacyAchievementUnlocked, .badgeEarned:
            guard let brut = achievementKey,
                  let clé = EngagementAchievementKey(rawValue: brut) else { return nil }
            return .achievement(clé)

        case .levelUp:
            guard let rang = level, rang > 0 else { return nil }
            return .level(rang)

        case .streakMilestone:
            guard let jours = threshold, jours > 0 else { return nil }
            return .streak(days: jours)

        default:
            return nil
        }
    }

    /// Le symbole du badge — celui que le tableau de bord emploie déjà pour la
    /// même famille, afin que la célébration et la grille se reconnaissent.
    public var symbolName: String {
        switch self {
        case .achievement: return "rosette"
        case .streak: return "flame.fill"
        case .level: return "star.circle.fill"
        }
    }
}
