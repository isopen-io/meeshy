import Foundation

/// Une personne montrée sur un billet ou un en-tête de lien (planche `Moi-Liens`, `Lien-Partage`, `Lien-Communaute`) :
/// de quoi poser son avatar, rien d'autre — ni présence, ni rôle, ni pseudo.
public struct LinksFaceMember: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let avatar: String?

    public init(id: String, name: String, avatar: String? = nil) {
        self.id = id
        self.name = name
        self.avatar = avatar
    }

    /// Une arrivée par un lien de partage, telle que l'en-tête de son détail la montre.
    public init(arrival: ShareLinkArrivalStats.Arrival) {
        self.init(id: arrival.participantId, name: arrival.displayName, avatar: arrival.avatar)
    }

    /// Combien de visages une pile montre : trois, comme la planche.
    public static let stackLimit = 3

    /// La pile d'un billet ou d'un en-tête : les premiers visages, chacun une fois, au plus `stackLimit`.
    public static func stack(_ members: [LinksFaceMember]) -> [LinksFaceMember] {
        members.reduce(into: [LinksFaceMember]()) { kept, member in
            guard kept.count < stackLimit, !kept.contains(where: { $0.id == member.id }) else { return }
            kept.append(member)
        }
    }
}

/// À qui appartient la face Liens : son pseudo et les hôtes Meeshy, pour reconnaître « ma vitrine ».
public struct LinksFaceOwner: Sendable, Equatable {
    public let username: String?
    public let hosts: Set<String>

    public static let canonicalHost = "meeshy.me"

    public init(username: String?, webOrigin: String?) {
        self.username = username?.lowercased()
        let origin = webOrigin.flatMap { URLComponents(string: $0)?.host }.map(Self.bare)
        self.hosts = Set([Self.canonicalHost] + [origin].compactMap { $0 })
    }

    public static let unknown = LinksFaceOwner(username: nil, webOrigin: nil)

    static func bare(_ host: String) -> String {
        let lowered = host.lowercased()
        return lowered.hasPrefix("www.") ? String(lowered.dropFirst(4)) : lowered
    }

    func ownsHost(_ host: String) -> Bool {
        hosts.contains(host) || hosts.contains { host.hasSuffix(".\($0)") }
    }
}

/// Où mène un lien de suivi, dit en mots sur son billet (planche `Moi-Liens`, « Vers ma vitrine »).
public enum LinksFaceDestination: Sendable, Equatable {
    case showcase
    case conversation
    case site(String)

    private static let profileSegments: Set<String> = ["u", "users"]

    /// La destination de `url` lue pour `owner` : ma vitrine (`/u/<moi>`) ou une conversation (`/chat/…`) sur une
    /// adresse Meeshy, sinon le site par son hôte. `nil` quand l'URL n'a pas d'hôte.
    public static func of(_ url: String, owner: LinksFaceOwner) -> LinksFaceDestination? {
        guard let components = URLComponents(string: url), let rawHost = components.host, !rawHost.isEmpty else {
            return nil
        }
        let host = LinksFaceOwner.bare(rawHost)
        guard owner.ownsHost(host) else { return .site(host) }
        let segments = components.path.split(separator: "/").map { $0.lowercased() }
        if segments.count >= 2, profileSegments.contains(segments[0]), let username = owner.username,
           segments[1] == username {
            return .showcase
        }
        return segments.first == "chat" ? .conversation : .site(host)
    }
}

/// Le deuxième chiffre d'un billet, ou ce qu'il dit à côté du premier (planche `Moi-Liens`) : la portée d'un lien de
/// suivi (« 7 j », « 31 pays »), sa destination, les visages d'une communauté, le QR d'un code de parrainage.
public enum LinksFaceAside: Sendable, Equatable {
    /// Les clics jour par jour, le plus ancien d'abord (vide quand seuls les pays sont servis), et le nombre de pays.
    case reach(days: [Int], countries: Int?)
    case destination(LinksFaceDestination)
    case members([LinksFaceMember])
    case codeQR(String)

    /// Une courbe se trace à partir de deux jours.
    public static let minimumDays = 2

    /// La portée servie d'un lien de suivi, ou `nil` quand le serveur n'en dit rien (champs absents).
    static func reach(days: [Int]?, countries: Int?) -> LinksFaceAside? {
        let curve = (days?.count ?? 0) >= minimumDays ? days ?? [] : []
        let countryCount = (countries ?? 0) > 0 ? countries : nil
        guard !curve.isEmpty || countryCount != nil else { return nil }
        return .reach(days: curve, countries: countryCount)
    }

    /// Un lien vers ma vitrine le dit d'abord ; sinon sa portée quand elle est servie ; sinon sa destination.
    static func of(tracking link: TrackingLink, owner: LinksFaceOwner) -> LinksFaceAside? {
        let destination = LinksFaceDestination.of(link.originalUrl, owner: owner)
        if destination == .showcase { return .destination(.showcase) }
        return reach(days: link.dailyClicks, countries: link.countryCount) ?? destination.map(LinksFaceAside.destination)
    }

    static func of(community link: CommunityLink) -> LinksFaceAside? {
        let stack = LinksFaceMember.stack(link.memberPreviews ?? [])
        return stack.isEmpty ? nil : .members(stack)
    }
}
