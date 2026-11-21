import Foundation
import MeeshySDK

/// CE QUE MONTRE LA PAGE PARRAINAGE (planche `Parrainage`, #19507), composé une fois depuis ce que l'appareil sait :
/// les jetons (cache d'abord), les statistiques servies et les invitations envoyées.
///
/// **Rien n'est inventé** : un bloc dont la passerelle ne sert pas la donnée (entonnoir, inscrits ce mois,
/// invitations — #19207 ; récompenses, palier — #19508) est ABSENT, jamais rempli d'un zéro. Une passerelle plus
/// ancienne laisse donc une page utile : le code, les filleuls et les liens.
nonisolated struct ReferralPage: Equatable, Sendable {

    /// « Ton code » : le premier jeton utilisable (la règle du lien partagé, `ReferralLinkRule`).
    nonisolated struct Hero: Equatable, Sendable {
        let code: String
        let link: String
        let url: URL?

        /// L'adresse telle qu'on la lit sur le billet, sans le schéma.
        var displayLink: String {
            ["https://", "http://"].reduce(link) { shown, scheme in
                shown.hasPrefix(scheme) ? String(shown.dropFirst(scheme.count)) : shown
            }
        }
    }

    nonisolated enum FigureKind: Equatable, Sendable {
        case referrals
        case visits
        case thisMonth
    }

    nonisolated struct Figure: Equatable, Sendable {
        let kind: FigureKind
        let value: Int
    }

    /// « Du lien au filleul » : visites → inscriptions → actifs, avec les taux entre deux étages.
    nonisolated struct Funnel: Equatable, Sendable {
        let visits: Int
        let registrations: Int
        let active: Int?

        /// La part des visites qui s'inscrivent, en pour cent ; `nil` sans visite ou si le taux ne voudrait rien dire.
        var signupRate: Int? { ReferralPage.rate(registrations, of: visits) }

        /// La part des inscrits qui restent actifs ; `nil` tant que l'activité n'est pas mesurée.
        var retentionRate: Int? { active.flatMap { ReferralPage.rate($0, of: registrations) } }
    }

    /// « Ce que ça te rapporte » : le gain par filleul actif et le total, chacun facultatif.
    nonisolated struct Reward: Equatable, Sendable {
        let perActiveReferral: Int?
        let earned: Int?
    }

    /// « Prochain palier » : la jauge, de 0 à 1.
    nonisolated struct Tier: Equatable, Sendable {
        let reached: Int
        let target: Int
        let reward: String?

        var fraction: Double { min(max(Double(reached) / Double(target), 0), 1) }
    }

    nonisolated enum ReferralStatus: Equatable, Sendable {
        case active
        case inactive
        case joined
        case pending
        case expired
    }

    nonisolated struct Referral: Identifiable, Equatable, Sendable {
        let id: String
        let name: String
        let userId: String?
        let avatar: String?
        let status: ReferralStatus
        let joinedAt: Date?

        /// « Dire bonjour » n'a de sens que vers un compte qui existe.
        var canSayHello: Bool { userId != nil }
    }

    let hero: Hero?
    let figures: [Figure]
    let funnel: Funnel?
    let reward: Reward?
    let tier: Tier?
    let referrals: [Referral]
    let invitations: [SentEmailInvitation]

    /// Combien de filleuls la page montre avant « Tout voir ».
    static let shownReferrals = 5

    static func compose(tokens: [AffiliateToken], stats: AffiliateStats?, cachedReferrals: [AffiliateReferral],
                        invitations: [SentEmailInvitation], now: Date) -> ReferralPage {
        let served = stats?.referrals ?? cachedReferrals
        return ReferralPage(
            hero: hero(tokens, now: now),
            figures: figures(tokens: tokens, stats: stats, referralCount: served.count),
            funnel: funnel(stats),
            reward: reward(stats?.rewards),
            tier: tier(stats?.rewards?.nextTier),
            referrals: served.map(referral),
            invitations: invitations
        )
    }

    static func hero(_ tokens: [AffiliateToken], now: Date) -> Hero? {
        guard let token = tokens.first(where: { ReferralLinkRule.isUsable($0, now: now) }),
              let link = token.affiliateLink else { return nil }
        return Hero(code: token.token, link: link, url: URL(string: link))
    }

    /// Les filleuls (servis, sinon ceux qu'on connaît), les visites (servies, sinon la somme des clics des jetons),
    /// et « inscrits ce mois » seulement si la passerelle le sert.
    static func figures(tokens: [AffiliateToken], stats: AffiliateStats?, referralCount: Int) -> [Figure] {
        let referrals = Figure(kind: .referrals, value: stats?.totalReferrals ?? referralCount)
        let clicks = tokens.isEmpty ? nil : tokens.reduce(0) { $0 + $1.clickCount }
        let visits = (stats?.visits ?? clicks).map { Figure(kind: .visits, value: $0) }
        let thisMonth = stats?.registrationsThisMonth.map { Figure(kind: .thisMonth, value: $0) }
        return [referrals] + [visits, thisMonth].compactMap { $0 }
    }

    static func funnel(_ stats: AffiliateStats?) -> Funnel? {
        guard let visits = stats?.visits, let registrations = stats?.registrations else { return nil }
        return Funnel(visits: visits, registrations: registrations, active: stats?.active)
    }

    static func reward(_ rewards: AffiliateRewards?) -> Reward? {
        guard let rewards, rewards.perActiveReferral != nil || rewards.earned != nil else { return nil }
        return Reward(perActiveReferral: rewards.perActiveReferral, earned: rewards.earned)
    }

    static func tier(_ tier: AffiliateRewardTier?) -> Tier? {
        guard let tier, tier.target > 0 else { return nil }
        return Tier(reached: max(tier.reached, 0), target: tier.target, reward: tier.reward)
    }

    static func referral(_ referral: AffiliateReferral) -> Referral {
        Referral(id: referral.id, name: referral.resolvedName, userId: referral.referredUser?.id,
                 avatar: referral.referredUser?.avatar, status: status(referral),
                 joinedAt: referral.completedAt ?? referral.createdAt)
    }

    /// En attente et expiré se lisent sur le statut ; un inscrit dit son activité quand la passerelle la mesure,
    /// sinon seulement qu'il est inscrit.
    static func status(_ referral: AffiliateReferral) -> ReferralStatus {
        switch referral.status {
        case "pending": return .pending
        case "expired": return .expired
        default:
            switch referral.activity {
            case "active": return .active
            case "inactive": return .inactive
            default: return .joined
            }
        }
    }

    /// Un taux en pour cent, arrondi ; `nil` sans dénominateur ou au-delà de 100 % (un taux qui ne veut rien dire).
    static func rate(_ part: Int, of whole: Int) -> Int? {
        guard whole > 0, part >= 0, part <= whole else { return nil }
        return Int((Double(part) * 100 / Double(whole)).rounded())
    }

    /// La même page, une invitation remplacée (relance optimiste, puis l'invitation servie).
    func replacing(_ invitation: SentEmailInvitation) -> ReferralPage {
        ReferralPage(hero: hero, figures: figures, funnel: funnel, reward: reward, tier: tier, referrals: referrals,
                     invitations: invitations.map { $0.id == invitation.id ? invitation : $0 })
    }
}
