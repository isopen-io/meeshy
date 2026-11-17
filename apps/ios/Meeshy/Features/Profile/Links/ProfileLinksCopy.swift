import Foundation
import MeeshySDK

/// Les mots de la face Liens (#18871) : mon lien de profil, sa carte, le partage sans contact, mes adresses et mes
/// liens créés. Les cercles se nomment par `CircleLevelNames`.
nonisolated enum ProfileLinksCopy {

    // MARK: - En-tête et lien de profil

    static var title: String { String(localized: "links.hub.title", defaultValue: "Mes liens", bundle: .main) }
    static var scan: String { String(localized: "profile.links.scan", defaultValue: "Scanner un QR", bundle: .main) }
    static var profileLinkTitle: String {
        String(localized: "profile.links.profileLink", defaultValue: "Mon lien de profil", bundle: .main)
    }
    static var enlargeQR: String {
        String(localized: "profile.links.enlargeQR", defaultValue: "Agrandir mon QR de profil", bundle: .main)
    }
    static var copy: String { String(localized: "profile.links.copy", defaultValue: "Copier", bundle: .main) }
    static var qr: String { String(localized: "profile.links.qr", defaultValue: "QR", bundle: .main) }
    static var send: String { String(localized: "profile.links.send", defaultValue: "Envoyer", bundle: .main) }
    static var contactless: String {
        String(localized: "profile.links.contactless", defaultValue: "Sans contact", bundle: .main)
    }
    static var copied: String { String(localized: "profile.links.copied", defaultValue: "Lien copié", bundle: .main) }
    static var sendHint: String {
        String(localized: "profile.links.send.hint", defaultValue: "Envoie ta vitrine dans une conversation", bundle: .main)
    }

    // MARK: - Mes adresses

    static var addressesTitle: String {
        String(localized: "profile.links.addresses", defaultValue: "Mes adresses", bundle: .main)
    }
    static var addAddress: String { String(localized: "profile.links.addresses.add", defaultValue: "Ajouter", bundle: .main) }
    static var manageAddresses: String {
        String(localized: "profile.links.addresses.manage", defaultValue: "Gérer mes adresses", bundle: .main)
    }
    static var addressesEmpty: String {
        String(localized: "profile.links.addresses.empty", defaultValue: "Ton site, ta musique, ta boutique : ajoute-les à ta vitrine.", bundle: .main)
    }
    static var addressesUnavailable: String {
        String(localized: "profile.links.addresses.unavailable", defaultValue: "Mes adresses ne se chargent pas", bundle: .main)
    }
    static var retry: String { String(localized: "profile.links.retry", defaultValue: "Réessayer", bundle: .main) }
    static var addressRefused: String {
        String(localized: "profile.links.addresses.refused", defaultValue: "Le changement n'a pas pu s'enregistrer", bundle: .main)
    }

    /// « Musique, soundcloud.com/aissa, Ami » : le cercle n'est lu que par le propriétaire.
    static func addressLabel(_ address: ProfileAddress) -> String {
        [address.title, address.displayURL, address.circle.map(CircleLevelNames.title(of:))]
            .compactMap { $0 }
            .joined(separator: ", ")
    }

    static func glyph(of glyph: ProfileAddressGlyph) -> String {
        switch glyph {
        case .site: return "globe.europe.africa"
        case .music: return "music.note"
        case .photos: return "camera"
        case .videos: return "film"
        case .shop: return "storefront"
        case .contact: return "envelope"
        case .agenda: return "calendar"
        case .favorite: return "heart"
        }
    }

    static func glyphName(_ glyph: ProfileAddressGlyph) -> String {
        switch glyph {
        case .site: return String(localized: "profile.address.glyph.site", defaultValue: "Site", bundle: .main)
        case .music: return String(localized: "profile.address.glyph.music", defaultValue: "Musique", bundle: .main)
        case .photos: return String(localized: "profile.address.glyph.photos", defaultValue: "Photos", bundle: .main)
        case .videos: return String(localized: "profile.address.glyph.videos", defaultValue: "Vidéos", bundle: .main)
        case .shop: return String(localized: "profile.address.glyph.shop", defaultValue: "Boutique", bundle: .main)
        case .contact: return String(localized: "profile.address.glyph.contact", defaultValue: "Contact", bundle: .main)
        case .agenda: return String(localized: "profile.address.glyph.agenda", defaultValue: "Agenda", bundle: .main)
        case .favorite: return String(localized: "profile.address.glyph.favorite", defaultValue: "Favori", bundle: .main)
        }
    }

    // MARK: - Liens créés

    static var createdTitle: String {
        String(localized: "profile.links.created", defaultValue: "Liens créés", bundle: .main)
    }
    static func activeCount(_ count: Int) -> String {
        let format = String(localized: "profile.links.created.active", defaultValue: "Actifs : %@", bundle: .main)
        return String(format: format, count.formatted())
    }
    static var filterLabel: String {
        String(localized: "profile.links.filter", defaultValue: "Filtrer par famille", bundle: .main)
    }
    static var filterAll: String { String(localized: "profile.links.filter.all", defaultValue: "Tous", bundle: .main) }
    static func familyName(_ family: LinksFaceFamily) -> String {
        switch family {
        case .share: return String(localized: "profile.links.family.share", defaultValue: "Partage", bundle: .main)
        case .tracking: return String(localized: "profile.links.family.tracking", defaultValue: "Suivi", bundle: .main)
        case .community: return String(localized: "profile.links.family.community", defaultValue: "Communauté", bundle: .main)
        case .referral: return String(localized: "profile.links.family.referral", defaultValue: "Parrainage", bundle: .main)
        }
    }

    static func familyGlyph(_ family: LinksFaceFamily) -> String {
        switch family {
        case .share: return "bubble.left.and.bubble.right"
        case .tracking: return "cursorarrow.click"
        case .community: return "person.3"
        case .referral: return "gift"
        }
    }

    /// Ce que le chiffre d'un billet compte, posé à côté de lui.
    static func figureCaption(_ figure: LinksFaceFigure) -> String {
        switch figure {
        case .arrivals(_, let cap?):
            let format = String(localized: "profile.links.figure.arrivalsOf", defaultValue: "/ %@ arrivées", bundle: .main)
            return String(format: format, cap.formatted())
        case .arrivals:
            return String(localized: "profile.links.figure.arrivals", defaultValue: "arrivées", bundle: .main)
        case .clicks:
            return String(localized: "profile.links.figure.clicks", defaultValue: "clics", bundle: .main)
        case .members:
            return String(localized: "profile.links.figure.members", defaultValue: "membres", bundle: .main)
        case .referrals:
            return String(localized: "profile.links.figure.referrals", defaultValue: "filleuls", bundle: .main)
        }
    }

    static func copyLink(_ title: String) -> String {
        let format = String(localized: "profile.links.copyLink", defaultValue: "Copier le lien %@", bundle: .main)
        return String(format: format, title)
    }
    static var paused: String { String(localized: "profile.links.paused", defaultValue: "En pause", bundle: .main) }
    static var expired: String { String(localized: "profile.links.expired", defaultValue: "Expiré", bundle: .main) }
    static func expires(_ relative: String) -> String {
        let format = String(localized: "profile.links.expires", defaultValue: "Expire %@", bundle: .main)
        return String(format: format, relative)
    }
    static var createdEmpty: String {
        String(localized: "profile.links.created.empty", defaultValue: "Aucun lien créé", bundle: .main)
    }
    static var createdUnavailable: String {
        String(localized: "profile.links.created.unavailable", defaultValue: "Mes liens ne se chargent pas", bundle: .main)
    }
    static var createLink: String {
        String(localized: "profile.links.create", defaultValue: "Créer un lien", bundle: .main)
    }

    // MARK: - Ma carte et le sans contact

    static var cardTitle: String { String(localized: "profile.card.title", defaultValue: "Ma carte", bundle: .main) }
    static var close: String { String(localized: "profile.card.close", defaultValue: "Fermer", bundle: .main) }
    static var tiltHint: String {
        String(localized: "profile.card.tilt", defaultValue: "Incline ton téléphone : la carte suit", bundle: .main)
    }
    static var cardModes: String { String(localized: "profile.card.modes", defaultValue: "Façon de partager", bundle: .main) }
    static var copyAddress: String {
        String(localized: "profile.card.copy", defaultValue: "Copier le lien", bundle: .main)
    }
    static var sendInConversation: String {
        String(localized: "profile.card.send", defaultValue: "Envoyer dans une conversation", bundle: .main)
    }
    static var saveImage: String {
        String(localized: "profile.card.save", defaultValue: "Enregistrer l'image", bundle: .main)
    }
    static var imageSaved: String {
        String(localized: "profile.card.saved", defaultValue: "Image enregistrée", bundle: .main)
    }
    static var more: String { String(localized: "profile.card.more", defaultValue: "Plus", bundle: .main) }
    static var qrShows: String {
        String(localized: "profile.card.qrShows", defaultValue: "Ce QR montre ma vitrine publique", bundle: .main)
    }
    static var qrLabel: String { String(localized: "profile.card.qrLabel", defaultValue: "QR de mon profil", bundle: .main) }
    static var showThisQR: String {
        String(localized: "profile.contactless.show", defaultValue: "Montre ce QR", bundle: .main)
    }
    static var orScan: String {
        String(localized: "profile.contactless.orScan", defaultValue: "Ou scanne le sien", bundle: .main)
    }
    static var orScanDetail: String {
        String(localized: "profile.contactless.orScan.detail", defaultValue: "Vise son QR, sa fiche s'ouvre.", bundle: .main)
    }
    static var noChip: String {
        String(localized: "profile.contactless.noChip", defaultValue: "Sur iPhone, deux téléphones ne s'échangent pas un profil par la puce : le QR fait le même geste.", bundle: .main)
    }

    // MARK: - Le lecteur de QR

    static var scannerHint: String {
        String(localized: "profile.scanner.hint", defaultValue: "Vise un QR Meeshy : la fiche ou le lien s'ouvre", bundle: .main)
    }
    static var scannerForeign: String {
        String(localized: "profile.scanner.foreign", defaultValue: "Ce QR ne mène pas à Meeshy", bundle: .main)
    }
}
