import Foundation

// MARK: - Le DÉTAIL d'un message notifié (#8856, #8858)

/// Ce qu'un message sans texte « lisible » transporte, tel que la passerelle le
/// pose dans la charge d'une notification : une position, une carte de
/// visite, une invitation à une conversation, un lien.
///
/// Un seul lecteur pour les trois surfaces qui en ont besoin — l'extension de
/// notification (charge APNs `data`), la bannière in-app (événement socket
/// `notification:new`) et les actions de notification — parce que les trois
/// lisent les MÊMES noms de clés (contrat #8856). Deux lecteurs auraient
/// divergé au premier champ ajouté à l'un d'eux.
///
/// **Aucune garde de protection ici** : ce type ne sait pas lire les drapeaux
/// d'un message protégé. Le serveur retient déjà ces clés pour un message
/// éphémère, à vue unique, flouté ou chiffré, et chaque hôte pose son SECOND
/// verrou avant de l'appeler (`NotificationDetailPolicy` pour la NSE et les
/// actions, `notificationLocKey` pour la bannière in-app).
public enum NotificationMessageDetail: Equatable, Sendable {
    case location(NotificationLocationDetail)
    case contact(NotificationContactCard)
    case invite(NotificationInviteDetail)
    case link(NotificationLinkDetail)

    /// Les clés du contrat, dans l'ordre où la charge les porte.
    public static let wireKeys: [String] = [
        "locationLat", "locationLon", "locationName", "locationAddress",
        "contactName", "contactPhone", "contactEmail",
        "inviteUrl", "inviteConversationTitle", "inviteMemberCount",
        "linkUrl", "linkDomain", "linkTitle", "linkImageUrl",
        "thumbnailUrl", "storyReply",
    ]

    /// Lit le détail depuis une charge `data` APNs (`userInfo`).
    public init?(userInfo: [AnyHashable: Any]) {
        self.init(lookup: { userInfo[$0] })
    }

    /// Lit le détail depuis n'importe quelle table clé → valeur. Les nombres
    /// voyagent en CHAÎNES sur le fil APNs (la passerelle sérialise `data`),
    /// en nombres dans une charge de test : les deux se lisent.
    ///
    /// Priorité : position, contact, invitation, lien — de la forme la plus
    /// spécifique à la plus générique. Une invitation EST un lien ; la lire
    /// comme lien perdrait l'action « Rejoindre ».
    public init?(lookup: (String) -> Any?) {
        let text: (String) -> String? = { Self.nonBlank(lookup($0)) }

        if let lat = Self.number(lookup("locationLat")),
           let lon = Self.number(lookup("locationLon")),
           (-90.0...90.0).contains(lat), (-180.0...180.0).contains(lon) {
            self = .location(NotificationLocationDetail(
                latitude: lat, longitude: lon,
                name: text("locationName"), address: text("locationAddress")
            ))
            return
        }
        if let name = text("contactName") {
            self = .contact(NotificationContactCard(
                name: name, phone: text("contactPhone"), email: text("contactEmail")
            ))
            return
        }
        if let raw = text("inviteUrl"), let url = Self.url(raw, schemes: ["https", "http", "meeshy"]) {
            self = .invite(NotificationInviteDetail(
                url: url,
                conversationTitle: text("inviteConversationTitle"),
                memberCount: Self.number(lookup("inviteMemberCount")).map { Int($0) }
            ))
            return
        }
        if let raw = text("linkUrl"), let url = Self.url(raw, schemes: ["https", "http"]) {
            self = .link(NotificationLinkDetail(
                url: url,
                domain: text("linkDomain") ?? url.host ?? raw,
                title: text("linkTitle"),
                imageURL: text("linkImageUrl")
            ))
            return
        }
        return nil
    }

    // MARK: Catégorie d'actions

    /// La catégorie `UNNotificationCategory` que ce détail appelle. Le lien
    /// n'en a pas : l'ouvrir, c'est ouvrir la conversation.
    public var categoryIdentifier: String? {
        switch self {
        case .location: return "MEESHY_LOCATION"
        case .contact: return "MEESHY_CONTACT"
        case .invite: return "MEESHY_INVITE"
        case .link: return nil
        }
    }

    // MARK: Pictogramme

    /// SF Symbol de la case typée de la bannière in-app.
    public var symbolName: String {
        switch self {
        case .location: return "mappin.and.ellipse"
        case .contact: return "person.crop.circle.fill"
        case .invite: return "envelope.open.fill"
        case .link: return "link"
        }
    }

    // MARK: Corps

    /// Les libellés que la composition ne peut pas inventer : chaque hôte les
    /// résout dans SON catalogue (l'extension et l'app n'en partagent pas).
    public struct Labels: Equatable, Sendable {
        public let sharedLocation: String
        public let invitation: String

        public init(sharedLocation: String, invitation: String) {
            self.sharedLocation = sharedLocation
            self.invitation = invitation
        }
    }

    /// Le corps détaillé, forme du contrat #8856 : `📍 Nom · adresse`,
    /// `👤 Nom`, `✉️ Invitation · Titre`, `🔗 domaine — titre`.
    public func summary(labels: Labels) -> String {
        switch self {
        case .location(let place):
            let parts = [place.name, place.address].compactMap { $0 }
            return "📍 " + (parts.isEmpty ? labels.sharedLocation : parts.joined(separator: " · "))
        case .contact(let card):
            return "👤 " + card.name
        case .invite(let invite):
            return "✉️ " + ([labels.invitation] + [invite.conversationTitle].compactMap { $0 })
                .joined(separator: " · ")
        case .link(let link):
            return "🔗 " + ([link.domain] + [link.title].compactMap { $0 }).joined(separator: " — ")
        }
    }

    /// Le corps servi mérite-t-il d'être remplacé par `summary` ? Oui s'il est
    /// VIDE (une position ou une carte de visite n'ont aucun texte) ou s'il
    /// n'est que l'URL brute de l'invitation / du lien. Un corps que la
    /// passerelle a déjà composé — ou qu'un humain a écrit — est gardé.
    public func shouldReplace(body: String?) -> Bool {
        guard let body = Self.nonBlank(body) else { return true }
        switch self {
        case .invite(let invite): return Self.isBare(body, url: invite.url)
        case .link(let link): return Self.isBare(body, url: link.url)
        case .location, .contact: return false
        }
    }

    /// Le corps à AFFICHER : le corps servi, sauf s'il doit céder au résumé.
    public func resolvedBody(served: String?, labels: Labels) -> String? {
        shouldReplace(body: served) ? summary(labels: labels) : Self.nonBlank(served)
    }

    // MARK: - Lecture tolérante

    static func nonBlank(_ raw: Any?) -> String? {
        let value: String?
        switch raw {
        case let text as String: value = text
        case let number as NSNumber: value = number.stringValue
        default: value = nil
        }
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !trimmed.isEmpty else { return nil }
        return trimmed
    }

    static func number(_ raw: Any?) -> Double? {
        if let number = raw as? NSNumber { return number.doubleValue.isFinite ? number.doubleValue : nil }
        guard let text = nonBlank(raw), let value = Double(text), value.isFinite else { return nil }
        return value
    }

    private static func url(_ raw: String, schemes: Set<String>) -> URL? {
        guard let url = URL(string: raw), let scheme = url.scheme?.lowercased(),
              schemes.contains(scheme) else { return nil }
        return url
    }

    private static func isBare(_ body: String, url: URL) -> Bool {
        let strip: (String) -> String = { $0.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "/ ")) }
        return strip(body) == strip(url.absoluteString)
    }
}

public struct NotificationLocationDetail: Equatable, Sendable {
    public let latitude: Double
    public let longitude: Double
    public let name: String?
    public let address: String?

    public init(latitude: Double, longitude: Double, name: String?, address: String?) {
        self.latitude = latitude
        self.longitude = longitude
        self.name = name
        self.address = address
    }

    /// Plans d'Apple, épinglé sur le lieu. `https://maps.apple.com` ouvre Plans
    /// sur iOS sans schéma privé, et tombe sur le web ailleurs.
    public var mapsURL: URL? {
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "ll", value: "\(latitude),\(longitude)")]
            + [name ?? address].compactMap { $0 }.map { URLQueryItem(name: "q", value: $0) }
        return components?.url
    }
}

public struct NotificationContactCard: Equatable, Sendable {
    public let name: String
    public let phone: String?
    public let email: String?

    public init(name: String, phone: String?, email: String?) {
        self.name = name
        self.phone = phone
        self.email = email
    }
}

public struct NotificationInviteDetail: Equatable, Sendable {
    public let url: URL
    public let conversationTitle: String?
    public let memberCount: Int?

    public init(url: URL, conversationTitle: String?, memberCount: Int?) {
        self.url = url
        self.conversationTitle = conversationTitle
        self.memberCount = memberCount
    }
}

public struct NotificationLinkDetail: Equatable, Sendable {
    public let url: URL
    public let domain: String
    public let title: String?
    public let imageURL: String?

    public init(url: URL, domain: String, title: String?, imageURL: String?) {
        self.url = url
        self.domain = domain
        self.title = title
        self.imageURL = imageURL
    }
}
