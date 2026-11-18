import Foundation
import MeeshySDK

/// Les mots de « Voir comme » et des trois faces (#18869). Les cercles se nomment par `CircleLevelNames` ; ici vivent
/// leur glyphe, le nom des rangées gardées et la phrase de chaque feature de l'échelle.
nonisolated enum VitrineSeenAsCopy {

    /// Le glyphe d'un cercle, sur l'échelle et les rangées verrouillées (planche `Sys-Icones`).
    static func glyph(of level: RelationLevel) -> String {
        switch level {
        case .public: return "globe"
        case .community: return "person.3"
        case .acquaintance: return "hand.wave"
        case .friend: return "person.2"
        case .close: return "flame"
        case .blood: return "drop"
        }
    }

    static var title: String {
        String(localized: "profile.seenAs.title", defaultValue: "Aperçu de ma vitrine", bundle: .main)
    }

    static var close: String {
        String(localized: "profile.seenAs.close", defaultValue: "Fermer l'aperçu", bundle: .main)
    }

    static var pickerLabel: String {
        String(localized: "profile.seenAs.picker", defaultValue: "Voir ma vitrine comme", bundle: .main)
    }

    /// « Vue par : Moi » sur ma Vitrine, la porte de l'aperçu.
    static var viewedByMe: String {
        String(localized: "profile.seenAs.viewedByMe", defaultValue: "Vue par : Moi", bundle: .main)
    }

    /// « Ce que voit un Ami » : le cercle courant, dit au-dessus de la Vitrine rendue.
    static func whatSees(_ level: RelationLevel) -> String {
        let format = String(localized: "profile.seenAs.whatSees", defaultValue: "Ce que voit le cercle %@", bundle: .main)
        return String(format: format, CircleLevelNames.title(of: level))
    }

    static var write: String {
        String(localized: "profile.seenAs.contact.write", defaultValue: "Écrire", bundle: .main)
    }

    static var requestToWrite: String {
        String(localized: "profile.seenAs.contact.request", defaultValue: "Demander à écrire", bundle: .main)
    }

    static var previewOnly: String {
        String(localized: "profile.seenAs.contact.previewOnly", defaultValue: "Dans l'aperçu, ce bouton ne part pas", bundle: .main)
    }

    static var online: String {
        String(localized: "profile.seenAs.online", defaultValue: "En ligne", bundle: .main)
    }

    static var maskedTitle: String {
        String(localized: "profile.seenAs.masked.title", defaultValue: "Masqué à ce niveau", bundle: .main)
    }

    static var nothingMasked: String {
        String(localized: "profile.seenAs.masked.none", defaultValue: "Rien n'est masqué à ce niveau.", bundle: .main)
    }

    /// « dès Ami » : le cercle qui ouvre une rangée verrouillée.
    static func opensAt(_ level: RelationLevel) -> String {
        let format = String(localized: "profile.seenAs.opensAt", defaultValue: "dès %@", bundle: .main)
        return String(format: format, CircleLevelNames.title(of: level))
    }

    static func rowTitle(_ row: VitrineSeenAs.Row) -> String {
        switch row {
        case .presence: return String(localized: "profile.seenAs.row.presence", defaultValue: "Présence", bundle: .main)
        case .game: return String(localized: "profile.seenAs.row.game", defaultValue: "Niveau et rang", bundle: .main)
        case .sparks: return String(localized: "profile.seenAs.row.sparks", defaultValue: "Étincelles", bundle: .main)
        case .device: return String(localized: "profile.seenAs.row.device", defaultValue: "Batterie, téléphone injoignable", bundle: .main)
        case .liveLocation: return String(localized: "profile.seenAs.row.liveLocation", defaultValue: "Position continue", bundle: .main)
        }
    }

    static func rowGlyph(_ row: VitrineSeenAs.Row) -> String {
        switch row {
        case .presence: return "circle.fill"
        case .game: return "trophy"
        case .sparks: return "sparkles"
        case .device: return "battery.75"
        case .liveLocation: return "location"
        }
    }

    static var cransTitle: String {
        String(localized: "profile.seenAs.crans.title", defaultValue: "Trois crans", bundle: .main)
    }

    /// L'annonce VoiceOver d'un cran : le cercle, puis ce qu'il ouvre — arguments positionnels, ordre et ponctuation
    /// tenus par la langue.
    static func cranSpoken(circle: String, opens: String) -> String {
        let format = String(localized: "profile.seenAs.cran.a11y", defaultValue: "%1$@ : %2$@", bundle: .main)
        return String(format: format, circle, opens)
    }

    /// La même annonce, suivie du geste de contact que ce cercle reçoit.
    static func cranSpoken(circle: String, opens: String, contact: String) -> String {
        let format = String(localized: "profile.seenAs.cran.a11y.contact", defaultValue: "%1$@ : %2$@. %3$@", bundle: .main)
        return String(format: format, circle, opens, contact)
    }

    /// « 9 publiques » sous « Publications » : ce que CE cercle voit de mes publications.
    static func publicationsCount(_ count: Int) -> String {
        let format = String(localized: "profile.seenAs.publications.count", defaultValue: "%lld visibles", bundle: .main)
        return String.localizedStringWithFormat(format, count)
    }

    static var cranNothing: String {
        String(localized: "profile.seenAs.crans.nothing", defaultValue: "Rien de gardé", bundle: .main)
    }

    static var ladderTitle: String {
        String(localized: "profile.seenAs.ladder.title", defaultValue: "Ce que chaque cercle ajoute", bundle: .main)
    }

    static var youAreHere: String {
        String(localized: "profile.seenAs.ladder.here", defaultValue: "Tu es ici", bundle: .main)
    }

    static var publicBase: String {
        String(localized: "profile.seenAs.ladder.publicBase", defaultValue: "Bannière, nom, bio, voix et publications publiques.", bundle: .main)
    }

    /// La phrase d'un cran : ce que la loi y ouvre, en une liste dite dans la langue de l'interface.
    static func ladderSentence(_ step: VitrineLadder.Step, locale: Locale) -> String {
        let phrases = step.features.map { featurePhrase($0) }
        let joined = capitalizingFirst(ListFormatter.localizedString(byJoining: phrases), locale: locale)
        let sentence = joined.isEmpty ? "" : joined + "."
        guard step.level == .public else { return sentence }
        return sentence.isEmpty ? publicBase : publicBase + " " + sentence
    }

    static func featurePhrase(_ feature: RelationFeature) -> String {
        switch feature {
        case .dmRequest: return String(localized: "profile.seenAs.feature.dmRequest", defaultValue: "on peut te demander à écrire", bundle: .main)
        case .viewsIdentity: return String(localized: "profile.seenAs.feature.viewsIdentity", defaultValue: "ton nom dans « qui a vu »", bundle: .main)
        case .dmDirect: return String(localized: "profile.seenAs.feature.dmDirect", defaultValue: "message direct", bundle: .main)
        case .dmReadReceipts: return String(localized: "profile.seenAs.feature.dmReadReceipts", defaultValue: "accusés de lecture", bundle: .main)
        case .dmTyping: return String(localized: "profile.seenAs.feature.dmTyping", defaultValue: "frappe", bundle: .main)
        case .audienceAcquaintances: return String(localized: "profile.seenAs.feature.audienceAcquaintances", defaultValue: "stories « Connaissances »", bundle: .main)
        case .presenceOnline: return String(localized: "profile.seenAs.feature.presenceOnline", defaultValue: "« en ligne » ou rien", bundle: .main)
        case .gameBasic: return String(localized: "profile.seenAs.feature.gameBasic", defaultValue: "niveau et rang", bundle: .main)
        case .bring: return String(localized: "profile.seenAs.feature.bring", defaultValue: "Bring", bundle: .main)
        case .locationTemporary: return String(localized: "profile.seenAs.feature.locationTemporary", defaultValue: "position temporaire", bundle: .main)
        case .presenceDetailed: return String(localized: "profile.seenAs.feature.presenceFull", defaultValue: "présence détaillée", bundle: .main)
        case .gameSparksGlory: return String(localized: "profile.seenAs.feature.gameSparksGlory", defaultValue: "étincelles", bundle: .main)
        case .listeningCategory: return String(localized: "profile.seenAs.feature.listeningCategory", defaultValue: "ce que tu écoutes", bundle: .main)
        case .talkie: return String(localized: "profile.seenAs.feature.talkie", defaultValue: "Talkie", bundle: .main)
        case .together: return String(localized: "profile.seenAs.feature.together", defaultValue: "Ensemble", bundle: .main)
        case .deviceBattery: return String(localized: "profile.seenAs.feature.deviceBattery", defaultValue: "batterie", bundle: .main)
        case .deviceUnreachable: return String(localized: "profile.seenAs.feature.deviceUnreachable", defaultValue: "téléphone injoignable", bundle: .main)
        case .listeningTitle: return String(localized: "profile.seenAs.feature.listeningTitle", defaultValue: "le titre écouté", bundle: .main)
        case .locationLive: return String(localized: "profile.seenAs.feature.locationLive", defaultValue: "position continue", bundle: .main)
        case .locationHistory: return String(localized: "profile.seenAs.feature.locationHistory", defaultValue: "historique de position", bundle: .main)
        case .locationProximity: return String(localized: "profile.seenAs.feature.locationProximity", defaultValue: "proximité", bundle: .main)
        case .acquaintanceAuto, .relayCommentersOnMyPosts, .relayMyCommentsElsewhere, .notifyNewContent,
             .presenceDnd, .audienceClose, .audienceBlood, .deviceBatteryPull, .callRing:
            return ""
        }
    }

    static var copyLink: String {
        String(localized: "profile.seenAs.copyLink", defaultValue: "Copier le lien de cette page", bundle: .main)
    }

    static var linkCopied: String {
        String(localized: "profile.seenAs.linkCopied", defaultValue: "Lien copié", bundle: .main)
    }

    private static func capitalizingFirst(_ text: String, locale: Locale) -> String {
        guard let first = text.first else { return text }
        return String(first).uppercased(with: locale) + text.dropFirst()
    }
}
