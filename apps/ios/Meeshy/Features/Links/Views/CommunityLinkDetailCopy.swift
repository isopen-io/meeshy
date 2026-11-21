import Foundation

/// Les mots de la fiche d'un lien de communauté (planche `Lien-Communaute`, #18871), localisés dans les sept langues.
enum CommunityLinkDetailCopy {
    static var pageTitle: String { String(localized: "communityLink.sheet.pageTitle", defaultValue: "Lien de communauté", bundle: .main) }
    static var detailsFailed: String { String(localized: "communityLink.sheet.readFailed", defaultValue: "La communauté n'a pas pu être lue", bundle: .main) }
    static var openCommunityHint: String { String(localized: "communityLink.sheet.openCommunity.a11y", defaultValue: "Ouvre la communauté", bundle: .main) }
    static var animates: String { String(localized: "communityLink.sheet.animates", defaultValue: "Tu l'animes", bundle: .main) }
    static var moderates: String { String(localized: "communityLink.sheet.moderates", defaultValue: "Tu la modères", bundle: .main) }
    static var copyIdentifier: String { String(localized: "communityLink.sheet.copyIdentifier", defaultValue: "Copier l'identifiant", bundle: .main) }
    static var identifierCopied: String { String(localized: "communityLink.sheet.identifierCopied", defaultValue: "Identifiant copié", bundle: .main) }

    static func members(_ count: Int) -> String {
        String(localized: "communityLink.sheet.members", defaultValue: "\(count) membres", bundle: .main)
    }

    static var membersUnit: String { String(localized: "communityLink.sheet.figure.members", defaultValue: "membres", bundle: .main) }
    static var weekUnit: String { String(localized: "communityLink.sheet.figure.week", defaultValue: "cette semaine", bundle: .main) }
    static var monthUnit: String { String(localized: "communityLink.sheet.figure.month", defaultValue: "sur 30 jours", bundle: .main) }
    static var linkEntriesUnit: String { String(localized: "communityLink.sheet.figure.byLink", defaultValue: "entrées par ce lien", bundle: .main) }

    static var chartTitle: String { String(localized: "communityLink.sheet.chart.title", defaultValue: "Entrées sur 30 jours", bundle: .main) }
    static var chartEmpty: String { String(localized: "communityLink.sheet.chart.empty", defaultValue: "Aucune entrée sur la période", bundle: .main) }

    static func perDay(_ average: String) -> String {
        String(localized: "communityLink.sheet.chart.perDay", defaultValue: "≈ \(average) par jour", bundle: .main)
    }

    static func chartSummary(_ total: Int) -> String {
        String(localized: "communityLink.sheet.chart.summary", defaultValue: "\(total) entrées sur 30 jours", bundle: .main)
    }

    static func dayEntries(_ day: String, _ count: Int) -> String {
        String(localized: "communityLink.sheet.chart.day", defaultValue: "\(day), \(count) entrées", bundle: .main)
    }

    static func entriesCount(_ count: Int) -> String {
        String(localized: "communityLink.sheet.chart.count", defaultValue: "\(count) entrées", bundle: .main)
    }

    static var rulesTitle: String { String(localized: "communityLink.sheet.rules.title", defaultValue: "Règles d'entrée", bundle: .main) }
    static var ruleOpen: String { String(localized: "communityLink.sheet.rules.open", defaultValue: "Entrée libre", bundle: .main) }
    static var ruleInvitation: String { String(localized: "communityLink.sheet.rules.invitation", defaultValue: "Sur invitation", bundle: .main) }
    static var ruleRole: String { String(localized: "communityLink.sheet.rules.role", defaultValue: "Rôle : Membre", bundle: .main) }
    static var ruleCountries: String { String(localized: "communityLink.sheet.rules.countries", defaultValue: "Tous pays", bundle: .main) }
    static var ruleNoExpiry: String { String(localized: "communityLink.sheet.rules.noExpiry", defaultValue: "Sans expiration", bundle: .main) }

    static var recentTitle: String { String(localized: "communityLink.sheet.recent.title", defaultValue: "Entrées récentes", bundle: .main) }
    static var recentEmpty: String { String(localized: "communityLink.sheet.recent.empty", defaultValue: "Personne n'est encore entré par ce lien", bundle: .main) }
    static var recentFailed: String { String(localized: "communityLink.sheet.recent.failed", defaultValue: "Les entrées n'ont pas pu être chargées", bundle: .main) }

    static func joined(_ relative: String) -> String {
        String(localized: "communityLink.sheet.recent.joined", defaultValue: "a rejoint \(relative)", bundle: .main)
    }

    static var pending: String { String(localized: "communityLink.sheet.recent.pending", defaultValue: "En attente de validation", bundle: .main) }

    static var inviteTitle: String { String(localized: "communityLink.sheet.invite.title", defaultValue: "Envoyer l'invitation", bundle: .main) }
    static var inviteRailLabel: String { String(localized: "communityLink.sheet.invite.rail", defaultValue: "Amis à inviter", bundle: .main) }
    static var inviteHint: String { String(localized: "communityLink.sheet.invite.hint", defaultValue: "Choisis d'abord les personnes à inviter", bundle: .main) }
    static var inviteFailed: String { String(localized: "communityLink.sheet.invite.failed", defaultValue: "Certaines invitations ne sont pas parties. Réessaie.", bundle: .main) }

    static func chosen(_ count: Int) -> String {
        count == 1
            ? String(localized: "communityLink.sheet.invite.chosen.one", defaultValue: "1 choisi", bundle: .main)
            : String(localized: "communityLink.sheet.invite.chosen.other", defaultValue: "\(count) choisis", bundle: .main)
    }

    static func inviteAction(_ count: Int) -> String {
        switch count {
        case 0: return String(localized: "communityLink.sheet.invite.action", defaultValue: "Inviter", bundle: .main)
        case 1: return String(localized: "communityLink.sheet.invite.action.one", defaultValue: "Inviter 1 personne", bundle: .main)
        default: return String(localized: "communityLink.sheet.invite.action.other", defaultValue: "Inviter \(count) personnes", bundle: .main)
        }
    }

    static func invited(_ count: Int) -> String {
        count == 1
            ? String(localized: "communityLink.sheet.invite.sent.one", defaultValue: "Invitation envoyée", bundle: .main)
            : String(localized: "communityLink.sheet.invite.sent.other", defaultValue: "\(count) invitations envoyées", bundle: .main)
    }

    static var closeEntries: String { String(localized: "communityLink.sheet.close", defaultValue: "Fermer les entrées", bundle: .main) }
    static var reopenEntries: String { String(localized: "communityLink.sheet.reopen", defaultValue: "Rouvrir les entrées", bundle: .main) }
    static var closedHint: String { String(localized: "communityLink.sheet.closedState", defaultValue: "Seuls les invités peuvent entrer", bundle: .main) }
}
