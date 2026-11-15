import Foundation
import MeeshySDK
import MeeshyUI

/// Les trois cartes de « Mon activité » (#18591) : ce que j'ai écrit, dans combien de conversations, et ce que Meeshy a
/// traduit pour moi. Ce sont les seuls compteurs qui disent quelque chose de Meeshy.
///
/// Les autres champs de `UserStats` restent servis (Android et le web les lisent) mais ne se comptent plus ici, parce
/// que ma fiche les dit déjà ailleurs : les demandes dans « Mes cercles », l'ancienneté sous mon nom, les langues dans
/// leur section, les badges à Ma Légende. Les recompter sur cet écran répétait la fiche.
///
/// Loi pure, sans singleton : l'écran la rend telle quelle, et l'ordre des cartes ne se recopie nulle part.
nonisolated enum UserActivityCards {

    struct Card: Identifiable, Equatable, Sendable {
        enum Kind: String, Sendable {
            case messages, conversations, translations
        }

        let kind: Kind
        let value: Int
        let label: String
        let icon: String
        let colorHex: String

        /// L'identité suit le compteur, jamais sa valeur : une réponse du serveur met la carte à jour sans la recréer.
        var id: Kind { kind }
    }

    /// Avant la réponse du serveur, chaque carte dit zéro : elle ne garde ni n'estime rien.
    static func make(stats: UserStats?) -> [Card] {
        [
            Card(kind: .messages, value: stats?.totalMessages ?? 0,
                 label: String(localized: "user.stats.messages", defaultValue: "Messages", bundle: .main),
                 icon: "bubble.left.fill", colorHex: MeeshyColors.brandPrimaryHex),
            Card(kind: .conversations, value: stats?.totalConversations ?? 0,
                 label: String(localized: "user.stats.conversations", defaultValue: "Conversations", bundle: .main),
                 icon: "person.2.fill", colorHex: MeeshyColors.indigo300Hex),
            Card(kind: .translations, value: stats?.totalTranslations ?? 0,
                 label: String(localized: "user.stats.translations", defaultValue: "Traductions", bundle: .main),
                 icon: "globe", colorHex: MeeshyColors.indigo600Hex),
        ]
    }
}
