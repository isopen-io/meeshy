import Foundation
import MeeshySDK
import MeeshyUI

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

    // MARK: - Visites de mon lien (#19489) — « visites », jamais « clics » : les clics sont aux liens de suivi.

    /// La légende du chiffre du mois, accordée au chiffre (« 1 visite ce mois », « 1 719 visites ce mois »).
    static func visitsThisMonth(_ count: Int) -> String {
        count == 1
            ? String(localized: "profile.links.visits.month.one", defaultValue: "visite ce mois", bundle: .main)
            : String(localized: "profile.links.visits.month.many", defaultValue: "visites ce mois", bundle: .main)
    }

    /// Le chiffre et sa période d'un tenant : ce que VoiceOver lit, et ce que la création « Mon profil » montre.
    static func visitsFigure(_ count: Int) -> String { "\(count.formatted()) \(visitsThisMonth(count))" }

    static var profileLinkExists: String {
        String(localized: "profile.links.create.profile.exists", defaultValue: "Ton lien existe déjà", bundle: .main)
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
    static var addressHidden: String {
        String(localized: "profile.links.addresses.hidden", defaultValue: "Masquée de ma vitrine", bundle: .main)
    }
    static var retry: String { String(localized: "profile.links.retry", defaultValue: "Réessayer", bundle: .main) }
    static var addressRefused: String {
        String(localized: "profile.links.addresses.refused", defaultValue: "Le changement n'a pas pu s'enregistrer", bundle: .main)
    }

    /// « Musique, soundcloud.com/aissa, Ami » : le cercle n'est lu que par le propriétaire ; masquée, elle le dit.
    static func addressLabel(_ address: ProfileAddress) -> String {
        [address.title, address.displayURL, address.circle.map(CircleLevelNames.title(of:)),
         address.isShown ? nil : addressHidden]
            .compactMap { $0 }
            .joined(separator: ", ")
    }

    static func glyph(of glyph: ProfileAddressGlyph) -> String { glyph.systemImage }

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

    /// Ce que le chiffre d'un billet compte, posé à côté de lui, accordé au chiffre (#20013 : « 1 arrivée »).
    static func figureCaption(_ figure: LinksFaceFigure) -> String {
        switch figure {
        case .arrivals(_, let cap?):
            let format = String(localized: "profile.links.figure.arrivalsOf", defaultValue: "/ %@ arrivées", bundle: .main)
            return String(format: format, cap.formatted())
        case .arrivals(let count, _):
            return count == 1
                ? String(localized: "profile.links.figure.arrivals.one", defaultValue: "arrivée", bundle: .main)
                : String(localized: "profile.links.figure.arrivals", defaultValue: "arrivées", bundle: .main)
        case .clicks(let count):
            return count == 1
                ? String(localized: "profile.links.figure.clicks.one", defaultValue: "clic", bundle: .main)
                : String(localized: "profile.links.figure.clicks", defaultValue: "clics", bundle: .main)
        case .members(let count):
            return count == 1
                ? String(localized: "profile.links.figure.members.one", defaultValue: "membre", bundle: .main)
                : String(localized: "profile.links.figure.members", defaultValue: "membres", bundle: .main)
        case .referrals(let count):
            return count == 1
                ? String(localized: "profile.links.figure.referrals.one", defaultValue: "filleul", bundle: .main)
                : String(localized: "profile.links.figure.referrals", defaultValue: "filleuls", bundle: .main)
        }
    }

    static func copyLink(_ title: String) -> String {
        let format = String(localized: "profile.links.copyLink", defaultValue: "Copier le lien %@", bundle: .main)
        return String(format: format, title)
    }
    static var paused: String { String(localized: "profile.links.paused", defaultValue: "En pause", bundle: .main) }
    static var expired: String { String(localized: "profile.links.expired", defaultValue: "Expiré", bundle: .main) }
    static var full: String { String(localized: "profile.links.full", defaultValue: "Complet", bundle: .main) }

    /// Le mot court qui dit pourquoi un lien ne sert plus, posé sur son billet.
    static func stoppage(_ stoppage: LinksFaceStoppage) -> String {
        switch stoppage {
        case .paused: return paused
        case .expired: return expired
        case .full: return full
        }
    }

    /// Ce que l'arrêt veut dire pour qui reçoit le lien (planche `Etat-Erreur` vue 4), sous le billet.
    static func stoppageConsequence(_ stoppage: LinksFaceStoppage) -> String {
        switch stoppage {
        case .full:
            return String(localized: "profile.links.stopped.full", defaultValue: "Plus personne ne peut entrer par ce lien.", bundle: .main)
        case .paused:
            return String(localized: "profile.links.stopped.paused", defaultValue: "Il ne mène plus nulle part. Rallume-le quand tu veux.", bundle: .main)
        case .expired:
            return String(localized: "profile.links.stopped.expired", defaultValue: "Ce lien n'est plus valable.", bundle: .main)
        }
    }

    /// Ce qu'un lien en pause garde (planche `Etat-Erreur` vue 4) : « Ses 412 clics sont gardés. »
    static func kept(_ figure: LinksFaceFigure, locale: Locale) -> String {
        let format: String
        switch figure {
        case .arrivals:
            format = String(localized: "profile.links.kept.arrivals", defaultValue: "Ses %@ arrivées sont gardées.", bundle: .main)
        case .clicks:
            format = String(localized: "profile.links.kept.clicks", defaultValue: "Ses %@ clics sont gardés.", bundle: .main)
        case .members:
            format = String(localized: "profile.links.kept.members", defaultValue: "Ses %@ membres restent.", bundle: .main)
        case .referrals:
            format = String(localized: "profile.links.kept.referrals", defaultValue: "Ses %@ filleuls sont gardés.", bundle: .main)
        }
        return String(format: format, figure.value.formatted(.number.locale(locale)))
    }

    // MARK: - Ce qu'un billet dit à côté de son chiffre (#19496)

    /// « 7 j » : la période que couvre la courbe d'un lien de suivi.
    static func days(_ count: Int, locale: Locale) -> String {
        let format = String(localized: "profile.links.aside.days", defaultValue: "%@ j", bundle: .main)
        return String(format: format, count.formatted(.number.locale(locale)))
    }

    /// Ce que VoiceOver dit de la courbe d'un billet.
    static func curveSummary(_ count: Int, locale: Locale) -> String {
        let format = String(localized: "profile.links.aside.curve", defaultValue: "Clics des %@ derniers jours",
                            bundle: .main)
        return String(format: format, count.formatted(.number.locale(locale)))
    }

    /// « 31 pays », accordé au nombre.
    static func countries(_ count: Int, locale: Locale) -> String {
        let format = count == 1
            ? String(localized: "profile.links.aside.countries.one", defaultValue: "%@ pays", bundle: .main)
            : String(localized: "profile.links.aside.countries.many", defaultValue: "%@ pays", bundle: .main)
        return String(format: format, count.formatted(.number.locale(locale)))
    }

    /// Où mène un lien de suivi, dit en mots : « Vers ma vitrine ».
    static func destination(_ destination: LinksFaceDestination) -> String {
        switch destination {
        case .showcase:
            return String(localized: "profile.links.aside.showcase", defaultValue: "Vers ma vitrine", bundle: .main)
        case .conversation:
            return String(localized: "profile.links.aside.conversation", defaultValue: "Vers une conversation",
                          bundle: .main)
        case .site(let host):
            let format = String(localized: "profile.links.aside.site", defaultValue: "Vers %@", bundle: .main)
            return String(format: format, host)
        }
    }

    static func destinationGlyph(_ destination: LinksFaceDestination) -> String {
        switch destination {
        case .showcase: return "person.crop.square"
        case .conversation: return "bubble.left.and.bubble.right"
        case .site: return "globe"
        }
    }

    /// Ce que VoiceOver dit d'une pile de visages : « Membres : Mina, Tomás et Koffi ».
    static func members(_ names: [String]) -> String {
        let format = String(localized: "profile.links.aside.members", defaultValue: "Membres : %@", bundle: .main)
        return String(format: format, names.formatted(.list(type: .and)))
    }

    /// Ce que VoiceOver dit d'un en-tête à pile : la ligne, puis les visages.
    static func facesLabel(_ line: String, faces: [LinksFaceMember]) -> String {
        "\(line), \(members(faces.map { $0.name }))"
    }

    static var codeQR: String {
        String(localized: "profile.links.aside.codeQR", defaultValue: "QR du code", bundle: .main)
    }

    /// Ce que le billet dit à côté de son chiffre, pour VoiceOver ; le QR du code est un geste, pas une phrase.
    static func spokenAside(_ aside: LinksFaceAside?, locale: Locale) -> String? {
        switch aside {
        case .reach(let days, let countries)?:
            let parts = [days.isEmpty ? nil : curveSummary(days.count, locale: locale),
                         countries.map { Self.countries($0, locale: locale) }]
            return parts.compactMap { $0 }.joined(separator: ", ")
        case .destination(let destination)?:
            return Self.destination(destination)
        case .members(let members)?:
            return Self.members(members.map(\.name))
        case .codeQR?, nil:
            return nil
        }
    }

    static var stoppedTitle: String {
        String(localized: "profile.links.stopped", defaultValue: "À l'arrêt", bundle: .main)
    }
    static var raiseLimit: String {
        String(localized: "profile.links.stopped.raiseLimit", defaultValue: "Augmenter la limite", bundle: .main)
    }
    static var linkActive: String {
        String(localized: "profile.links.stopped.active", defaultValue: "Lien actif", bundle: .main)
    }
    static var switchRefused: String {
        String(localized: "profile.links.stopped.switchRefused", defaultValue: "Le lien n'a pas pu se rallumer", bundle: .main)
    }
    static func expires(_ relative: String) -> String {
        let format = String(localized: "profile.links.expires", defaultValue: "Expire %@", bundle: .main)
        return String(format: format, relative)
    }
    static var firstLinkTitle: String {
        String(localized: "profile.links.created.first", defaultValue: "Ton premier lien t'attend", bundle: .main)
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
    static var putInStory: String {
        String(localized: "profile.card.story", defaultValue: "Mettre en story", bundle: .main)
    }
    static var qrShows: String {
        String(localized: "profile.card.qrShows", defaultValue: "Ce QR montre", bundle: .main)
    }
    static var qrShowsShowcase: String {
        String(localized: "profile.card.qrShows.showcase", defaultValue: "Vitrine publique", bundle: .main)
    }
    static var qrShowsInvitation: String {
        String(localized: "profile.card.qrShows.invitation", defaultValue: "Invitation à me rejoindre", bundle: .main)
    }
    static var qrShowsInvitationNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "profile.card.qrShows.invitation.question", defaultValue: "Que fait le QR d'invitation ?", bundle: .main),
            text: String(localized: "profile.card.qrShows.invitation.note", defaultValue: "Scanner envoie une demande d'amis.", bundle: .main)
        )
    }
    static var invitationPreparing: String {
        String(localized: "profile.card.invitation.preparing", defaultValue: "L'invitation se prépare : le QR montre ta vitrine en attendant", bundle: .main)
    }
    static var invitationUnavailable: String {
        String(localized: "profile.card.invitation.unavailable", defaultValue: "L'invitation n'est pas disponible : le QR montre ta vitrine", bundle: .main)
    }
    static var invitationLive: String {
        String(localized: "profile.card.invitation.live", defaultValue: "Valable quelques minutes, renouvelée tant que la carte reste ouverte", bundle: .main)
    }
    static var qrLabel: String { String(localized: "profile.card.qrLabel", defaultValue: "QR de mon profil", bundle: .main) }
    static var orScan: String {
        String(localized: "profile.contactless.orScan", defaultValue: "Ou scanne le sien", bundle: .main)
    }
    static var contactlessUnavailable: String {
        String(localized: "profile.contactless.unavailable", defaultValue: "Ce téléphone ne sait pas faire ça", bundle: .main)
    }
    static var qrDoesTheSame: String {
        String(localized: "profile.contactless.qrDoesTheSame", defaultValue: "Ton QR fait la même chose.", bundle: .main)
    }
    static var instead: String {
        String(localized: "profile.contactless.instead", defaultValue: "À la place", bundle: .main)
    }
    static var anyCamera: String {
        String(localized: "profile.contactless.anyCamera", defaultValue: "À scanner avec n'importe quel appareil photo.", bundle: .main)
    }
    static var showMyQR: String {
        String(localized: "profile.contactless.showMyQR", defaultValue: "Montrer mon QR", bundle: .main)
    }

    // MARK: - Le lecteur de QR

    static var scannerHint: String {
        String(localized: "profile.scanner.aim", defaultValue: "Vise un QR Meeshy : la fiche ou le lien s'ouvre", bundle: .main)
    }
    static var scannerForeign: String {
        String(localized: "profile.scanner.foreign", defaultValue: "Ce QR ne mène pas à Meeshy", bundle: .main)
    }
    static var invitationSent: String {
        String(localized: "profile.scanner.invitation.sent", defaultValue: "Demande d'ami envoyée", bundle: .main)
    }
    static var invitationExpired: String {
        String(localized: "profile.scanner.invitation.expired", defaultValue: "Cette invitation n'est plus valable : voici sa vitrine", bundle: .main)
    }
}
