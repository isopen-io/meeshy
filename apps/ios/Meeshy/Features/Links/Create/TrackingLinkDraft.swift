import Foundation
import MeeshySDK

/// Un chiffre du billet d'aperçu : la valeur et ce qu'elle compte.
nonisolated struct LinkTicketFigure: Equatable, Sendable {
    let value: String
    let unit: String
}

/// Ce que le billet d'aperçu (K30) montre pendant la saisie : son titre, son adresse, ses chiffres.
nonisolated struct LinkTicketPreview: Equatable, Sendable {
    let kindLabel: String
    let title: String
    let code: String
    let figures: [LinkTicketFigure]
}

/// Le brouillon d'un lien de suivi (planche `Lien-Suivi-Creer`) : la cible, le contenu choisi, le nom, l'adresse,
/// l'expiration, le compte des visiteurs uniques et la mesure UTM. Pur : la vue le tient, il dit ce qui part et ce que
/// le billet montre.
nonisolated struct TrackingLinkDraft: Equatable, Sendable {
    static let nameMaxLength = 32
    static let utmMaxLength = 100

    var target: TrackingLinkTarget = .external
    var content: TrackingLinkContent?
    var externalAddress = ""
    var name = ""
    var slug = ""
    var expiry: LinkExpiryNotch = .never
    var countsUniqueVisitors = true
    var source = ""
    var medium = ""
    var campaign = ""

    /// Changer de cible oublie le contenu choisi sous l'autre.
    mutating func choose(_ next: TrackingLinkTarget) {
        guard next != target else { return }
        target = next
        content = nil
    }

    /// L'adresse que la passerelle garde comme destination ; `nil` tant que la cible n'est pas complète.
    func destination(owner: TrackingLinkOwner?) -> String? {
        switch target {
        case .external:
            return ProfileAddressRules.normalizedURL(externalAddress)
        case .profile:
            guard let owner, !owner.username.isEmpty else { return nil }
            return target.destination(contentId: owner.username)
        default:
            return content.map { target.destination(contentId: $0.id) }
        }
    }

    func targetId(owner: TrackingLinkOwner?) -> String? {
        switch target {
        case .external: return nil
        case .profile: return owner?.userId
        default: return content?.id
        }
    }

    var slugIsAcceptable: Bool { LinkSlugRules.isAcceptable(slug) }

    var showsAddressError: Bool {
        target == .external && !externalAddress.trimmingCharacters(in: .whitespaces).isEmpty
            && ProfileAddressRules.normalizedURL(externalAddress) == nil
    }

    func canCreate(owner: TrackingLinkOwner?) -> Bool {
        destination(owner: owner) != nil && slugIsAcceptable
    }

    /// `meeshy.me/l/<adresse>` tel que le billet l'écrit ; « … » tant que l'adresse sera tirée au hasard.
    var shortAddress: String { "meeshy.me/l/\(slug.isEmpty ? "…" : slug)" }

    private var utmItems: [URLQueryItem] {
        [("utm_source", source), ("utm_medium", medium), ("utm_campaign", campaign)].compactMap { key, value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : URLQueryItem(name: key, value: trimmed)
        }
    }

    /// « Adresse complète » : l'adresse courte et sa mesure ; `nil` sans aucun paramètre UTM.
    var fullAddress: String? {
        let items = utmItems
        guard !items.isEmpty else { return nil }
        var components = URLComponents()
        components.queryItems = items
        return "\(shortAddress)?\(components.percentEncodedQuery ?? "")"
    }

    private func trimmed(_ value: String, max: Int) -> String? {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : String(clean.prefix(max))
    }

    /// Ce qui part vers `POST /tracking-links` ; `nil` tant que le lien ne peut pas être créé.
    func request(owner: TrackingLinkOwner?, now: Date) -> CreateTrackingLinkRequest? {
        guard canCreate(owner: owner), let destination = destination(owner: owner) else { return nil }
        return CreateTrackingLinkRequest(
            name: trimmed(name, max: Self.nameMaxLength),
            originalUrl: destination,
            campaign: trimmed(campaign, max: Self.utmMaxLength),
            source: trimmed(source, max: Self.utmMaxLength),
            medium: trimmed(medium, max: Self.utmMaxLength),
            token: slug.isEmpty ? nil : slug,
            expiresAt: expiry.wireDeadline(from: now),
            targetType: target.wireType,
            targetId: targetId(owner: owner),
            countsUniqueVisitors: countsUniqueVisitors
        )
    }

    /// Le billet d'aperçu : le nom saisi, sinon « Réel Dakar la nuit », sinon le nom de la cible.
    var ticket: LinkTicketPreview {
        let typed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let title: String = {
            if !typed.isEmpty { return typed }
            if let content { return LinkCreationCopy.ticketTitle(of: target, content: content.title) }
            return LinkCreationCopy.noun(of: target)
        }()
        var figures = [LinkTicketFigure(value: "0", unit: LinkCreationCopy.clickUnit),
                       LinkCreationCopy.expiryFigure(expiry)]
        if countsUniqueVisitors { figures.append(LinkCreationCopy.uniqueFigure) }
        return LinkTicketPreview(kindLabel: LinkCreationCopy.trackingKind, title: title, code: shortAddress, figures: figures)
    }
}
