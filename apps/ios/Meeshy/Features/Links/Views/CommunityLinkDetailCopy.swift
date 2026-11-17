import Foundation

/// Les mots de la fiche d'un lien de communauté (planche `Lien-Communaute`, #18871), localisés dans les sept langues.
enum CommunityLinkDetailCopy {
    static var pageTitle: String { String(localized: "communityLink.detail.pageTitle", defaultValue: "Lien de communauté", bundle: .main) }
    static var animates: String { String(localized: "communityLink.detail.animates", defaultValue: "Tu l'animes", bundle: .main) }
    static var moderates: String { String(localized: "communityLink.detail.moderates", defaultValue: "Tu la modères", bundle: .main) }
    static var copyIdentifier: String { String(localized: "communityLink.detail.copyIdentifier", defaultValue: "Copier l'identifiant", bundle: .main) }
    static var identifierCopied: String { String(localized: "communityLink.detail.identifierCopied", defaultValue: "Identifiant copié", bundle: .main) }

    static func members(_ count: Int) -> String {
        String(localized: "communityLink.detail.members", defaultValue: "\(count) membres", bundle: .main)
    }

    static var membersUnit: String { String(localized: "communityLink.detail.figure.members", defaultValue: "membres", bundle: .main) }
    static var weekUnit: String { String(localized: "communityLink.detail.figure.week", defaultValue: "cette semaine", bundle: .main) }
    static var monthUnit: String { String(localized: "communityLink.detail.figure.month", defaultValue: "sur 30 jours", bundle: .main) }

    static var chartTitle: String { String(localized: "communityLink.detail.chart.title", defaultValue: "Entrées sur 30 jours", bundle: .main) }
    static var chartEmpty: String { String(localized: "communityLink.detail.chart.empty", defaultValue: "Aucune entrée sur la période", bundle: .main) }

    static func perDay(_ average: String) -> String {
        String(localized: "communityLink.detail.chart.perDay", defaultValue: "≈ \(average) par jour", bundle: .main)
    }

    static func chartSummary(_ total: Int) -> String {
        String(localized: "communityLink.detail.chart.summary", defaultValue: "\(total) entrées sur 30 jours", bundle: .main)
    }

    static func dayEntries(_ day: String, _ count: Int) -> String {
        String(localized: "communityLink.detail.chart.day", defaultValue: "\(day), \(count) entrées", bundle: .main)
    }

    static func entriesCount(_ count: Int) -> String {
        String(localized: "communityLink.detail.chart.count", defaultValue: "\(count) entrées", bundle: .main)
    }

    static var rulesTitle: String { String(localized: "communityLink.detail.rules.title", defaultValue: "Règles d'entrée", bundle: .main) }
    static var ruleOpen: String { String(localized: "communityLink.detail.rules.open", defaultValue: "Entrée libre", bundle: .main) }
    static var ruleInvitation: String { String(localized: "communityLink.detail.rules.invitation", defaultValue: "Sur invitation", bundle: .main) }
    static var ruleRole: String { String(localized: "communityLink.detail.rules.role", defaultValue: "Rôle : Membre", bundle: .main) }
    static var ruleCountries: String { String(localized: "communityLink.detail.rules.countries", defaultValue: "Tous pays", bundle: .main) }
    static var ruleNoExpiry: String { String(localized: "communityLink.detail.rules.noExpiry", defaultValue: "Sans expiration", bundle: .main) }

    static var recentTitle: String { String(localized: "communityLink.detail.recent.title", defaultValue: "Entrées récentes", bundle: .main) }
    static var recentEmpty: String { String(localized: "communityLink.detail.recent.empty", defaultValue: "Personne n'est encore entré par ce lien", bundle: .main) }
    static var recentFailed: String { String(localized: "communityLink.detail.recent.failed", defaultValue: "Les entrées n'ont pas pu être chargées", bundle: .main) }

    static func joined(_ relative: String) -> String {
        String(localized: "communityLink.detail.recent.joined", defaultValue: "a rejoint \(relative)", bundle: .main)
    }

    static var closeEntries: String { String(localized: "communityLink.detail.close", defaultValue: "Fermer les entrées", bundle: .main) }
    static var reopenEntries: String { String(localized: "communityLink.detail.reopen", defaultValue: "Rouvrir les entrées", bundle: .main) }
    static var closedHint: String { String(localized: "communityLink.detail.closedHint", defaultValue: "Seuls les invités peuvent entrer", bundle: .main) }
}
