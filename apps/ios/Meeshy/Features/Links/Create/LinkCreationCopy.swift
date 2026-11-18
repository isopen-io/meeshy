import Foundation

/// Les mots de la création d'un lien (planches `Lien-Creer` et `Lien-Suivi-Creer`), en un seul endroit.
nonisolated enum LinkCreationCopy {
    // MARK: Lien de suivi

    static var trackingKind: String { String(localized: "links.create.tracking.kind", defaultValue: "Lien de suivi", bundle: .main) }
    static var whatToTrack: String { String(localized: "links.create.tracking.step1", defaultValue: "Que veux-tu suivre ?", bundle: .main) }
    static var ruleTheLink: String { String(localized: "links.create.tracking.step2", defaultValue: "Règle ton lien", bundle: .main) }
    static var nameLabel: String { String(localized: "links.create.tracking.name", defaultValue: "Nom", bundle: .main) }
    static var addressLabel: String { String(localized: "links.create.address", defaultValue: "Adresse", bundle: .main) }
    static var addressCaption: String {
        String(localized: "links.create.address.caption", defaultValue: "Laisse vide pour une adresse tirée au hasard", bundle: .main)
    }
    static var addressInvalid: String {
        String(localized: "links.create.address.invalid", defaultValue: "De 5 à 50 lettres, chiffres ou tirets", bundle: .main)
    }
    static var externalLabel: String { String(localized: "links.create.tracking.external.label", defaultValue: "Adresse à suivre", bundle: .main) }
    static var externalInvalid: String {
        String(localized: "links.create.tracking.external.invalid", defaultValue: "Cette adresse ne s'ouvre pas sur le web", bundle: .main)
    }
    static var externalDetail: String {
        String(localized: "links.create.tracking.external.detail", defaultValue: "Site, boutique, billetterie", bundle: .main)
    }
    static var expires: String { String(localized: "links.create.expires", defaultValue: "Expire", bundle: .main) }
    static var countUnique: String {
        String(localized: "links.create.tracking.unique", defaultValue: "Compter les visiteurs uniques", bundle: .main)
    }
    static var countUniqueDetail: String {
        String(localized: "links.create.tracking.unique.detail", defaultValue: "Un retour ne compte qu'une fois", bundle: .main)
    }
    static var utmTitle: String { String(localized: "links.create.tracking.utm", defaultValue: "Mesure (UTM)", bundle: .main) }
    static var utmDetail: String {
        String(localized: "links.create.tracking.utm.detail", defaultValue: "Pour savoir d'où viennent tes clics", bundle: .main)
    }
    static var utmSource: String { String(localized: "links.create.tracking.utm.source", defaultValue: "Source", bundle: .main) }
    static var utmMedium: String { String(localized: "links.create.tracking.utm.medium", defaultValue: "Support", bundle: .main) }
    static var utmCampaign: String { String(localized: "links.create.tracking.utm.campaign", defaultValue: "Campagne", bundle: .main) }
    static var fullAddress: String { String(localized: "links.create.tracking.utm.full", defaultValue: "Adresse complète", bundle: .main) }
    static var createAndCopy: String { String(localized: "links.create.tracking.create", defaultValue: "Créer et copier", bundle: .main) }
    static var nothingToTrack: String {
        String(localized: "links.create.tracking.empty", defaultValue: "Rien à suivre ici pour l'instant", bundle: .main)
    }
    static var publicStoriesOnly: String {
        String(localized: "links.create.tracking.stories.public", defaultValue: "Seules tes stories publiques peuvent être suivies", bundle: .main)
    }
    static var contentRowWords: String { String(localized: "links.create.tracking.content.choose", defaultValue: "Choisir", bundle: .main) }

    // MARK: Lien de partage

    static var shareKind: String { String(localized: "links.create.share.kind", defaultValue: "Lien de partage", bundle: .main) }
    static var entries: String { String(localized: "links.create.share.entries", defaultValue: "Nombre d'entrées", bundle: .main) }
    static var entriesDetail: String {
        String(localized: "links.create.share.entries.detail", defaultValue: "Ensuite, le lien se ferme", bundle: .main)
    }
    static var lessEntries: String { String(localized: "links.create.share.entries.less", defaultValue: "Moins d'entrées", bundle: .main) }
    static var moreEntries: String { String(localized: "links.create.share.entries.more", defaultValue: "Plus d'entrées", bundle: .main) }
    static var languages: String { String(localized: "links.create.share.languages", defaultValue: "Langues autorisées", bundle: .main) }
    static var allLanguages: String { String(localized: "links.create.share.languages.all", defaultValue: "Toutes", bundle: .main) }

    // MARK: Billet d'aperçu

    static var preview: String { String(localized: "links.create.preview", defaultValue: "Aperçu de ton billet", bundle: .main) }
    static var copied: String { String(localized: "links.create.copied", defaultValue: "Lien créé et copié", bundle: .main) }
    static var clickUnit: String { String(localized: "links.create.figure.clicks", defaultValue: "clic", bundle: .main) }
    static var entriesUnit: String { String(localized: "links.create.figure.entries", defaultValue: "entrées", bundle: .main) }
    static var uniqueFigure: LinkTicketFigure {
        LinkTicketFigure(value: String(localized: "links.create.figure.unique", defaultValue: "Uniques", bundle: .main),
                         unit: String(localized: "links.create.figure.unique.unit", defaultValue: "comptés", bundle: .main))
    }

    static func guestsFigure(_ acceptsGuests: Bool) -> LinkTicketFigure {
        acceptsGuests
            ? LinkTicketFigure(value: String(localized: "links.create.figure.open", defaultValue: "Ouvert", bundle: .main),
                               unit: String(localized: "links.create.figure.open.unit", defaultValue: "sans compte", bundle: .main))
            : LinkTicketFigure(value: String(localized: "links.create.figure.account", defaultValue: "Compte", bundle: .main),
                               unit: String(localized: "links.create.figure.account.unit", defaultValue: "requis", bundle: .main))
    }

    static func expiryFigure(_ notch: LinkExpiryNotch) -> LinkTicketFigure {
        notch == .never
            ? LinkTicketFigure(value: notchTitle(.never),
                               unit: String(localized: "links.create.figure.never.unit", defaultValue: "n'expire", bundle: .main))
            : LinkTicketFigure(value: notchTitle(notch),
                               unit: String(localized: "links.create.figure.remaining.unit", defaultValue: "avant la fin", bundle: .main))
    }

    static func notchTitle(_ notch: LinkExpiryNotch) -> String {
        switch notch {
        case .hours24: return String(localized: "links.create.expiry.h24", defaultValue: "24 h", bundle: .main)
        case .days7: return String(localized: "links.create.expiry.d7", defaultValue: "7 j", bundle: .main)
        case .days30: return String(localized: "links.create.expiry.d30", defaultValue: "30 j", bundle: .main)
        case .never: return String(localized: "links.create.expiry.never", defaultValue: "Jamais", bundle: .main)
        }
    }

    // MARK: Cibles

    static func targetTitle(_ target: TrackingLinkTarget) -> String {
        switch target {
        case .publication: return String(localized: "links.create.target.publication", defaultValue: "Une publication", bundle: .main)
        case .reel: return String(localized: "links.create.target.reel", defaultValue: "Un réel", bundle: .main)
        case .story: return String(localized: "links.create.target.story", defaultValue: "Une story", bundle: .main)
        case .status: return String(localized: "links.create.target.status", defaultValue: "Un statut", bundle: .main)
        case .conversation: return String(localized: "links.create.target.conversation", defaultValue: "Une conversation", bundle: .main)
        case .profile: return String(localized: "profile.links.create.profile", defaultValue: "Mon profil", bundle: .main)
        case .external: return String(localized: "links.create.target.external", defaultValue: "Une adresse externe", bundle: .main)
        }
    }

    static func noun(of target: TrackingLinkTarget) -> String {
        switch target {
        case .publication: return String(localized: "links.create.noun.publication", defaultValue: "Publication", bundle: .main)
        case .reel: return String(localized: "links.create.noun.reel", defaultValue: "Réel", bundle: .main)
        case .story: return String(localized: "links.create.noun.story", defaultValue: "Story", bundle: .main)
        case .status: return String(localized: "links.create.noun.status", defaultValue: "Statut", bundle: .main)
        case .conversation: return String(localized: "links.create.noun.conversation", defaultValue: "Conversation", bundle: .main)
        case .profile: return String(localized: "links.create.noun.profile", defaultValue: "Vitrine", bundle: .main)
        case .external: return String(localized: "links.create.noun.external", defaultValue: "Adresse externe", bundle: .main)
        }
    }

    /// « Réel Dakar la nuit » : le nom de la cible puis celui du contenu.
    static func ticketTitle(of target: TrackingLinkTarget, content: String) -> String {
        String(format: String(localized: "links.create.ticket.title", defaultValue: "%1$@ %2$@", bundle: .main), noun(of: target), content)
    }

    /// « Quel réel ? », « Quelle story ? »…
    static func whichContent(_ target: TrackingLinkTarget) -> String {
        switch target {
        case .publication: return String(localized: "links.create.which.publication", defaultValue: "Quelle publication ?", bundle: .main)
        case .reel: return String(localized: "links.create.which.reel", defaultValue: "Quel réel ?", bundle: .main)
        case .story: return String(localized: "links.create.which.story", defaultValue: "Quelle story ?", bundle: .main)
        case .status: return String(localized: "links.create.which.status", defaultValue: "Quel statut ?", bundle: .main)
        case .conversation: return String(localized: "links.create.which.conversation", defaultValue: "Quelle conversation ?", bundle: .main)
        case .profile, .external: return targetTitle(target)
        }
    }

    static func targetGlyph(_ target: TrackingLinkTarget) -> String {
        switch target {
        case .publication: return "photo"
        case .reel: return "film"
        case .story: return "circle.dashed"
        case .status: return "face.smiling"
        case .conversation: return "bubble.left.and.bubble.right"
        case .profile: return "person.crop.square"
        case .external: return "globe.europe.africa"
        }
    }
}
