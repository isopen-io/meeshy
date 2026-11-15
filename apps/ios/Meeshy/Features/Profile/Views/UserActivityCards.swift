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

        /// L'encre du NOMBRE, distincte de la teinte de la carte : la lavande des conversations se lit à 1,8:1 sur sa
        /// carte claire, et l'indigo foncé des traductions à 2,5:1 sur sa carte sombre. La carte garde sa teinte.
        func valueHex(isDark: Bool) -> String {
            switch (kind, isDark) {
            case (.conversations, false): return MeeshyColors.indigo600Hex
            case (.translations, true): return MeeshyColors.indigo400Hex
            default: return colorHex
            }
        }
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

/// Quand « Mon activité » demande quoi au serveur (#18591) : les compteurs et la frise des trente jours ont chacun leur
/// cache. La fiche enregistre les compteurs en passant ; un cache de compteurs frais ne dit donc rien de la frise, qui se
/// charge dès que la SIENNE manque ou vieillit — le cache se peint d'abord, le réseau suit en silence.
nonisolated enum UserActivityRefreshLaw {

    enum Freshness: Equatable, Sendable {
        case fresh, stale, missing
    }

    /// Un cache expiré, vide, ou qui ne porte aucune ligne ne peint rien : il manque.
    static func freshness<Row: Sendable>(of result: CacheResult<[Row]>) -> Freshness {
        switch result {
        case .fresh(let rows, _): return rows.isEmpty ? .missing : .fresh
        case .stale(let rows, _): return rows.isEmpty ? .missing : .stale
        case .expired, .empty: return .missing
        }
    }

    static func needsStatsFetch(stats: Freshness) -> Bool {
        stats != .fresh
    }

    /// Les compteurs relus, la frise se relit avec eux ; frais, ils ne la dispensent de rien.
    static func needsTimelineFetch(stats: Freshness, timeline: Freshness) -> Bool {
        needsStatsFetch(stats: stats) || timeline != .fresh
    }
}
