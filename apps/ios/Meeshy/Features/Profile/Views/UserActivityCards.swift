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
/// Loi pure, sans singleton : la bande de chiffres du kit (K34) la rend telle quelle, sur ma fiche comme sur l'écran,
/// et l'ordre des cartes ne se recopie nulle part. Le nombre est à l'encre du texte, jamais à la teinte d'une carte.
nonisolated enum UserActivityCards {

    struct Card: Identifiable, Equatable, Sendable {
        enum Kind: String, Sendable {
            case messages, conversations, translations
        }

        let kind: Kind
        let value: Int
        let label: String

        /// L'identité suit le compteur, jamais sa valeur : une réponse du serveur met la carte à jour sans la recréer.
        var id: Kind { kind }
    }

    /// Avant la réponse du serveur, chaque carte dit zéro : elle ne garde ni n'estime rien.
    static func make(stats: UserStats?) -> [Card] {
        [
            Card(kind: .messages, value: stats?.totalMessages ?? 0,
                 label: String(localized: "user.stats.messages", defaultValue: "Messages", bundle: .main)),
            Card(kind: .conversations, value: stats?.totalConversations ?? 0,
                 label: String(localized: "user.stats.conversations", defaultValue: "Conversations", bundle: .main)),
            Card(kind: .translations, value: stats?.totalTranslations ?? 0,
                 label: String(localized: "user.stats.translations", defaultValue: "Traductions", bundle: .main)),
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

/// Ce que l'écran « Mon activité » peint pendant le chargement et après un échec (#19635, loi 8) : un squelette
/// seulement là où ni le cache ni le serveur n'ont rien servi, et un échec qui garde ce qu'il trouve affiché.
nonisolated enum UserActivityScreenPlan {

    /// Un échec à dire, avec « Réessayer » : hors ligne ou non, et s'il se pose au-dessus d'un contenu qui reste.
    struct Failure: Equatable, Sendable {
        let isOffline: Bool
        let keepsContent: Bool
    }

    /// La frise : son squelette, sa série, sa phrase du vide, ou rien quand l'échec dit déjà qu'elle manque.
    enum Timeline: Equatable, Sendable {
        case skeleton, series, empty, hidden
    }

    static func failure(failed: Bool, isOffline: Bool, hasContent: Bool) -> Failure? {
        failed ? Failure(isOffline: isOffline, keepsContent: hasContent) : nil
    }

    /// Les chiffres se dessinent en squelette tant qu'aucune valeur n'est servie et que le chargement court.
    static func figuresAreLoading(hasStats: Bool, hasSettled: Bool) -> Bool {
        !hasStats && !hasSettled
    }

    static func timeline(pointCount: Int, hasSettled: Bool, failed: Bool) -> Timeline {
        if pointCount > 0 { return .series }
        if !hasSettled { return .skeleton }
        return failed ? .hidden : .empty
    }
}
