import Foundation

/// Les quatre familles de liens créés (#18871, planche `Moi-Liens`) : l'ordre des cas est celui des filtres.
public enum LinksFaceFamily: String, CaseIterable, Sendable, Hashable {
    case share
    case tracking
    case community
    case referral
}

/// Le chiffre qu'un billet porte, et ce qu'il compte : la face Liens le dit dans la langue du lecteur.
public enum LinksFaceFigure: Sendable, Equatable {
    /// Des arrivées dans une conversation, avec le plafond quand il y en a un.
    case arrivals(Int, cap: Int?)
    case clicks(Int)
    case members(Int)
    case referrals(Int)

    public var value: Int {
        switch self {
        case .arrivals(let count, _), .clicks(let count), .members(let count), .referrals(let count): return count
        }
    }

    /// La part remplie d'un lien plafonné, entre 0 et 1 ; `nil` sans plafond.
    public var fill: Double? {
        guard case .arrivals(let count, let cap?) = self, cap > 0 else { return nil }
        return min(1, max(0, Double(count) / Double(cap)))
    }
}

/// Ce qui empêche un lien créé de servir (planche `Etat-Erreur` vue 4) : mis en pause par moi, arrivé à échéance, ou
/// plein. L'ordre des cas est celui où ils se disent — une pause l'emporte, puis l'échéance, puis le plafond.
public enum LinksFaceStoppage: Sendable, Equatable {
    case paused
    case expired
    case full
}

/// Un billet de la face Liens : ce que c'est, son adresse en chasse fixe, ce qu'on copie, et son chiffre.
public struct LinksFaceTicket: Sendable, Equatable, Identifiable {
    public let id: String
    public let family: LinksFaceFamily
    public let title: String
    public let code: String
    public let copyValue: String
    public let figure: LinksFaceFigure
    public let isActive: Bool
    public let expiresAt: Date?

    public init(id: String, family: LinksFaceFamily, title: String, code: String, copyValue: String,
                figure: LinksFaceFigure, isActive: Bool, expiresAt: Date? = nil) {
        self.id = id
        self.family = family
        self.title = title
        self.code = code
        self.copyValue = copyValue
        self.figure = figure
        self.isActive = isActive
        self.expiresAt = expiresAt
    }

    /// Ce qui empêche ce lien de servir à `now`, ou `nil` s'il sert.
    public func stoppage(now: Date = Date()) -> LinksFaceStoppage? {
        if !isActive { return .paused }
        if let expiresAt, expiresAt <= now { return .expired }
        return figure.fill == 1 ? .full : nil
    }

    /// Ce qu'un lien en pause a compté et garde (planche `Etat-Erreur` vue 4, « Ses 412 clics sont gardés ») : le
    /// chiffre du billet quand le lien est en pause et a compté quelque chose, sinon `nil`.
    public func keptFigure(now: Date = Date()) -> LinksFaceFigure? {
        guard stoppage(now: now) == .paused, figure.value > 0 else { return nil }
        return figure
    }
}

/// Le filtre de « Liens créés » : tous, ou une famille.
public enum LinksFaceFilter: Hashable, Sendable {
    case all
    case family(LinksFaceFamily)

    public func admits(_ ticket: LinksFaceTicket) -> Bool {
        switch self {
        case .all: return true
        case .family(let family): return ticket.family == family
        }
    }
}

/// « Liens créés » de la face Liens (#18871) : les quatre familles en billets, dans l'ordre des filtres. Une famille
/// pas encore lue (`nil`) ne compte ni ne s'affiche ; une famille lue vide compte zéro.
public struct LinksFaceSummary: Sendable, Equatable {
    public let tickets: [LinksFaceTicket]
    public let loadedFamilies: Set<LinksFaceFamily>

    public init(share: [MyShareLink]? = nil, tracking: [TrackingLink]? = nil, community: [CommunityLink]? = nil,
                referral: [AffiliateToken]? = nil) {
        let families: [(LinksFaceFamily, [LinksFaceTicket]?)] = [
            (.share, share.map { $0.map(Self.ticket(share:)) }),
            (.tracking, tracking.map { $0.map(Self.ticket(tracking:)) }),
            (.community, community.map { $0.map(Self.ticket(community:)) }),
            (.referral, referral.map { $0.map(Self.ticket(referral:)) }),
        ]
        tickets = families.flatMap { $0.1 ?? [] }
        loadedFamilies = Set(families.compactMap { $0.1 == nil ? nil : $0.0 })
    }

    public static let empty = LinksFaceSummary()

    /// Le compte « N actifs » de l'en-tête : un lien qui sert encore — ni en pause, ni expiré, ni plein.
    public func activeCount(now: Date = Date()) -> Int {
        serving(tickets, now: now).count
    }

    /// Les billets qui servent encore, dans leur ordre.
    public func serving(_ tickets: [LinksFaceTicket], now: Date = Date()) -> [LinksFaceTicket] {
        tickets.filter { $0.stoppage(now: now) == nil }
    }

    /// « À l'arrêt » : les billets qui ne servent plus, rangés sous les autres, dans leur ordre.
    public func stopped(_ tickets: [LinksFaceTicket], now: Date = Date()) -> [LinksFaceTicket] {
        tickets.filter { $0.stoppage(now: now) != nil }
    }

    public func tickets(for filter: LinksFaceFilter) -> [LinksFaceTicket] {
        tickets.filter(filter.admits)
    }

    public func count(of family: LinksFaceFamily) -> Int {
        tickets.filter { $0.family == family }.count
    }

    /// Les filtres offerts : « Tous », puis chaque famille qui a au moins un billet.
    public var filters: [LinksFaceFilter] {
        [.all] + LinksFaceFamily.allCases.filter { count(of: $0) > 0 }.map { .family($0) }
    }

    static func withoutScheme(_ url: String) -> String {
        guard let range = url.range(of: "://") else { return url }
        return String(url[range.upperBound...])
    }

    static func ticket(share link: MyShareLink) -> LinksFaceTicket {
        LinksFaceTicket(id: "share:\(link.id)", family: .share, title: link.displayName,
                        code: link.address.displayString, copyValue: link.address.absoluteString,
                        figure: .arrivals(link.currentUses, cap: link.maxUses), isActive: link.isActive,
                        expiresAt: link.expiresAt)
    }

    static func ticket(tracking link: TrackingLink) -> LinksFaceTicket {
        LinksFaceTicket(id: "tracking:\(link.id)", family: .tracking, title: link.displayName,
                        code: withoutScheme(link.shortUrl), copyValue: link.shortUrl,
                        figure: .clicks(link.totalClicks), isActive: link.isActive, expiresAt: link.expiresAt)
    }

    static func ticket(community link: CommunityLink) -> LinksFaceTicket {
        LinksFaceTicket(id: "community:\(link.id)", family: .community, title: link.name,
                        code: withoutScheme(link.joinUrl), copyValue: link.joinUrl,
                        figure: .members(link.memberCount), isActive: link.isActive)
    }

    static func ticket(referral token: AffiliateToken) -> LinksFaceTicket {
        let link = token.affiliateLink ?? token.token
        return LinksFaceTicket(id: "referral:\(token.id)", family: .referral, title: token.name,
                               code: token.affiliateLink.map(withoutScheme) ?? token.token, copyValue: link,
                               figure: .referrals(token.referralCount), isActive: token.isActive)
    }
}
