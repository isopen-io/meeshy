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
    /// Un succès de la GRAMMAIRE (#5758) — `achievement.cercles.conversation.join.size:1000`.
    /// Il porte sa famille et son palier plutôt que sa chaîne : ce qui l'affiche
    /// a besoin des deux pour composer le libellé, et les redériver à chaque
    /// lecture ferait deux analyses de la même clé.
    case composedAchievement(family: AchievementFamily, tier: Int)
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
            guard let brut = achievementKey else { return nil }
            // Les CINQ legacy d'abord : leur clé n'a pas la forme composée, donc
            // les deux lectures ne peuvent pas se disputer une même chaîne.
            if let clé = EngagementAchievementKey(rawValue: brut) { return .achievement(clé) }
            guard let lu = AchievementCatalog.parse(key: brut) else { return nil }
            return .composedAchievement(family: lu.family, tier: lu.tier)

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
        case .achievement, .composedAchievement: return "rosette"
        case .streak: return "flame.fill"
        case .level: return "star.circle.fill"
        }
    }

    /// **Ce qui se célèbre TOUT SEUL, sans que l'utilisateur ait rien touché.**
    ///
    /// Directive porteur (2026-09-09) : *« la vue d'achievement s'affiche
    /// lorsqu'on a réalisé une opération qui déclenche un succès, le reste ce
    /// sont des notifications rien de plus »*. Un SUCCÈS nomme un fait rare et
    /// non répétable — il mérite qu'on interrompe. Un badge, une série, un
    /// niveau tombent au fil de l'usage : les célébrer tous ferait de la
    /// célébration un bruit, et le premier bruit qu'on apprend à ignorer est
    /// celui qui devait faire plaisir.
    ///
    /// Le TAP, lui, reste servi pour les trois formes : quelqu'un qui touche
    /// une notification de série a demandé à la voir.
    public var celebratesUnprompted: Bool {
        switch self {
        case .achievement, .composedAchievement: return true
        case .streak, .level: return false
        }
    }
}
