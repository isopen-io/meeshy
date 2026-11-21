import Foundation

/// Les mots de la page Parrainage (planche `Parrainage`, #19507), localisés dans les sept langues.
enum ReferralCopy {
    static let yourCode = String(localized: "referral.hero.title", defaultValue: "Ton code", bundle: .main)
    static let byEmail = String(localized: "referral.hero.byEmail", defaultValue: "Par e-mail", bundle: .main)
    static let linkCopied = String(localized: "referral.hero.copied", defaultValue: "Lien de parrainage copié", bundle: .main)
    static let noCode = String(localized: "referral.hero.empty", defaultValue: "Crée un lien de parrainage pour avoir ton code.", bundle: .main)

    static func heroLabel(code: String, link: String) -> String {
        String(localized: "referral.hero.a11y", defaultValue: "Ton code, \(code), \(link)", bundle: .main)
    }

    // MARK: - Les chiffres (K34)

    static let referralsUnit = String(localized: "referral.figure.referrals", defaultValue: "filleuls", bundle: .main)
    static let visitsUnit = String(localized: "referral.figure.visits", defaultValue: "visites", bundle: .main)
    static let thisMonthUnit = String(localized: "referral.figure.thisMonth", defaultValue: "inscrits ce mois", bundle: .main)

    // MARK: - Du lien au filleul (K50)

    static let funnelTitle = String(localized: "referral.funnel.title", defaultValue: "Du lien au filleul", bundle: .main)

    static func visitsStage(_ count: Int) -> String {
        String(localized: "referral.funnel.visits", defaultValue: "Visites \(count)", bundle: .main)
    }

    static func registrationsStage(_ count: Int) -> String {
        String(localized: "referral.funnel.registrations", defaultValue: "Inscriptions \(count)", bundle: .main)
    }

    static func activeStage(_ count: Int) -> String {
        String(localized: "referral.funnel.active", defaultValue: "Actifs \(count)", bundle: .main)
    }

    static func signupHop(_ percent: Int) -> String {
        String(localized: "referral.funnel.signupRate", defaultValue: "\(percent) % s'inscrivent", bundle: .main)
    }

    static func retentionHop(_ percent: Int) -> String {
        String(localized: "referral.funnel.retentionRate", defaultValue: "\(percent) % restent actifs", bundle: .main)
    }

    static func funnelSummary(visits: Int, registrations: Int) -> String {
        String(localized: "referral.funnel.summary", defaultValue: "Du lien au filleul : \(visits) visites, \(registrations) inscriptions", bundle: .main)
    }

    // MARK: - Ce que ça te rapporte

    static let rewardTitle = String(localized: "referral.reward.title", defaultValue: "Ce que ça te rapporte", bundle: .main)

    static func perActive(_ sparks: Int) -> String {
        String(localized: "referral.reward.perActive", defaultValue: "+\(sparks) étincelles par filleul actif", bundle: .main)
    }

    static func earned(_ sparks: Int) -> String {
        String(localized: "referral.reward.earned", defaultValue: "\(sparks) étincelles gagnées jusqu'ici", bundle: .main)
    }

    static let nextTier = String(localized: "referral.tier.title", defaultValue: "Prochain palier", bundle: .main)

    static func tierValue(_ reached: Int, _ target: Int) -> String {
        String(localized: "referral.tier.value", defaultValue: "\(reached) / \(target)", bundle: .main)
    }

    static func tierCaption(_ target: Int) -> String {
        String(localized: "referral.tier.caption", defaultValue: "\(target) filleuls", bundle: .main)
    }

    static func tierSpoken(_ reached: Int, _ target: Int) -> String {
        String(localized: "referral.tier.a11y", defaultValue: "\(reached) filleuls sur \(target)", bundle: .main)
    }

    // MARK: - Tes filleuls (K39 + K41)

    static let referralsTitle = String(localized: "referral.referrals.title", defaultValue: "Tes filleuls", bundle: .main)
    static let seeAll = String(localized: "referral.referrals.seeAll", defaultValue: "Tout voir", bundle: .main)
    static let seeLess = String(localized: "referral.referrals.seeLess", defaultValue: "Réduire", bundle: .main)
    static let noReferrals = String(localized: "referral.referrals.empty", defaultValue: "Aucun filleul pour l'instant", bundle: .main)
    static let sayHello = String(localized: "referral.referrals.sayHello", defaultValue: "Dire bonjour", bundle: .main)
    static let statusActive = String(localized: "referral.status.active", defaultValue: "Actif", bundle: .main)
    static let statusInactive = String(localized: "referral.status.inactive", defaultValue: "Inactif", bundle: .main)
    static let statusJoined = String(localized: "referral.status.joined", defaultValue: "Inscrit", bundle: .main)
    static let statusPending = String(localized: "referral.status.pending", defaultValue: "En attente", bundle: .main)
    static let statusExpired = String(localized: "referral.status.expired", defaultValue: "Expiré", bundle: .main)

    static func joined(_ relative: String) -> String {
        String(localized: "referral.referrals.joined", defaultValue: "a rejoint \(relative)", bundle: .main)
    }

    static func sayHelloTo(_ name: String) -> String {
        String(localized: "referral.referrals.sayHello.a11y", defaultValue: "Dire bonjour à \(name)", bundle: .main)
    }

    // MARK: - Invitations envoyées

    static let invitationsTitle = String(localized: "referral.invitations.title", defaultValue: "Invitations envoyées", bundle: .main)
    static let resend = String(localized: "referral.invitations.resend", defaultValue: "Relancer", bundle: .main)
    static let resent = String(localized: "referral.invitations.resent", defaultValue: "Invitation relancée", bundle: .main)
    static let resendFailed = String(localized: "referral.invitations.resendFailed", defaultValue: "Relance impossible pour le moment", bundle: .main)
    static let notOpened = String(localized: "referral.invitations.notOpened", defaultValue: "non ouverte", bundle: .main)
    static let openedNotJoined = String(localized: "referral.invitations.opened", defaultValue: "ouverte, pas inscrit", bundle: .main)
    static let joinedMeeshy = String(localized: "referral.invitations.joined", defaultValue: "a rejoint Meeshy", bundle: .main)

    static func sentLine(_ relative: String, _ state: String) -> String {
        String(localized: "referral.invitations.line", defaultValue: "Envoyée \(relative) · \(state)", bundle: .main)
    }

    // MARK: - Inviter quelqu'un

    static let invite = String(localized: "referral.invite.action", defaultValue: "Inviter quelqu'un", bundle: .main)
    static let inviteTitle = String(localized: "referral.invite.title", defaultValue: "Inviter par e-mail", bundle: .main)
    static let emailField = String(localized: "referral.invite.field", defaultValue: "Adresse e-mail", bundle: .main)
    static let emailPrompt = String(localized: "referral.invite.prompt", defaultValue: "nom@exemple.com", bundle: .main)
    static let inviteHint = String(localized: "referral.invite.hint", defaultValue: "L'invitation porte ton lien de parrainage.", bundle: .main)
    static let send = String(localized: "referral.invite.send", defaultValue: "Envoyer l'invitation", bundle: .main)
    static let sent = String(localized: "referral.invite.sent", defaultValue: "Invitation envoyée", bundle: .main)
    static let sendFailed = String(localized: "contacts.discover.invite.error", defaultValue: "Impossible d'envoyer l'invitation", bundle: .main)

    // MARK: - Mes liens

    static let myLinks = String(localized: "referral.links.title", defaultValue: "Tes liens de parrainage", bundle: .main)
}
