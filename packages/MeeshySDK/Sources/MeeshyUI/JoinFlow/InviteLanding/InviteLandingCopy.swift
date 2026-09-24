import Foundation
import MeeshySDK

/// Les textes de la page d'invitation (#7795), réunis : plusieurs sections
/// les partagent (le type du groupe, les droits, la validité) et la fiche du
/// propriétaire (#7797) relit les mêmes formulations.
public enum InviteLandingCopy {

    // MARK: - Header & inviter

    static var headerTitle: String {
        String(localized: "inviteLanding.header.title", defaultValue: "Invitation", bundle: .module)
    }

    static var close: String {
        String(localized: "joinFlow.close.accessibilityLabel", defaultValue: "Fermer", bundle: .module)
    }

    static func invites(_ firstName: String) -> String {
        String(localized: "inviteLanding.inviter.invites", defaultValue: "\(firstName) t'invite", bundle: .module)
    }

    // MARK: - Group card

    static func createdOn(_ date: Date) -> String {
        let formatted = date.formatted(date: .long, time: .omitted)
        return String(localized: "inviteLanding.group.createdOn", defaultValue: "créé le \(formatted)", bundle: .module)
    }

    static var copy: String {
        String(localized: "inviteLanding.group.copy", defaultValue: "Copier", bundle: .module)
    }

    static var copied: String {
        String(localized: "inviteLanding.group.copied", defaultValue: "Copié", bundle: .module)
    }

    static var reshare: String {
        String(localized: "inviteLanding.group.reshare", defaultValue: "Repartager", bundle: .module)
    }

    static var linkCopiedAnnouncement: String {
        String(localized: "inviteLanding.group.copiedAnnouncement", defaultValue: "Lien copié", bundle: .module)
    }

    static func linkLabel(_ address: String) -> String {
        String(localized: "inviteLanding.group.linkLabel", defaultValue: "Lien de la conversation : \(address)", bundle: .module)
    }

    public static func conversationType(_ raw: String) -> String {
        switch raw.lowercased() {
        case "direct": return String(localized: "joinFlow.preview.typeDirect", defaultValue: "Conversation privee", bundle: .module)
        case "group": return String(localized: "joinFlow.preview.typeGroup", defaultValue: "Groupe", bundle: .module)
        case "public": return String(localized: "joinFlow.preview.typePublic", defaultValue: "Public", bundle: .module)
        case "global": return String(localized: "joinFlow.preview.typeGlobal", defaultValue: "Global", bundle: .module)
        case "community": return String(localized: "joinFlow.preview.typeCommunity", defaultValue: "Communaute", bundle: .module)
        case "channel": return String(localized: "joinFlow.preview.typeChannel", defaultValue: "Canal", bundle: .module)
        default: return String(localized: "joinFlow.preview.defaultTitle", defaultValue: "Conversation", bundle: .module)
        }
    }

    // MARK: - Facts

    static func peopleLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "inviteLanding.facts.person", defaultValue: "personne", bundle: .module)
            : String(localized: "inviteLanding.facts.people", defaultValue: "personnes", bundle: .module)
    }

    static func languagesLabel(_ count: Int) -> String {
        count == 1
            ? String(localized: "inviteLanding.facts.language", defaultValue: "langue parlée", bundle: .module)
            : String(localized: "inviteLanding.facts.languages", defaultValue: "langues parlées", bundle: .module)
    }

    static var spokenTitle: String {
        String(localized: "inviteLanding.languages.title", defaultValue: "On y parle", bundle: .module)
    }

    // MARK: - Guest terms

    static var termsTitle: String {
        String(localized: "inviteLanding.terms.title", defaultValue: "En anonyme, tu pourras", bundle: .module)
    }

    public static var rightMessages: String {
        String(localized: "inviteLanding.terms.messages", defaultValue: "Écrire des messages", bundle: .module)
    }

    public static var rightImages: String {
        String(localized: "inviteLanding.terms.images", defaultValue: "Envoyer des images", bundle: .module)
    }

    public static var rightHistory: String {
        String(localized: "inviteLanding.terms.history", defaultValue: "Voir les messages d'avant ton arrivée", bundle: .module)
    }

    public static var rightFiles: String {
        String(localized: "inviteLanding.terms.files", defaultValue: "Envoyer des fichiers", bundle: .module)
    }

    public static func allowed(_ right: String) -> String {
        String(localized: "inviteLanding.terms.allowed", defaultValue: "Autorisé : \(right)", bundle: .module)
    }

    public static func denied(_ right: String) -> String {
        String(localized: "inviteLanding.terms.denied", defaultValue: "Non autorisé : \(right)", bundle: .module)
    }

    static var askedLabel: String {
        String(localized: "inviteLanding.terms.askedLabel", defaultValue: "On te demandera :", bundle: .module)
    }

    static func field(_ field: InviteRequestedField) -> String {
        switch field {
        case .name: return String(localized: "inviteLanding.terms.fieldName", defaultValue: "ton prénom et ton nom", bundle: .module)
        case .nickname: return String(localized: "inviteLanding.terms.fieldNickname", defaultValue: "un pseudo", bundle: .module)
        case .email: return String(localized: "inviteLanding.terms.fieldEmail", defaultValue: "un e-mail", bundle: .module)
        case .birthday: return String(localized: "inviteLanding.terms.fieldBirthday", defaultValue: "ta date de naissance", bundle: .module)
        }
    }

    static var languagesAcceptedLabel: String {
        String(localized: "inviteLanding.terms.languagesLabel", defaultValue: "Langues acceptées :", bundle: .module)
    }

    public static var allLanguages: String {
        String(localized: "inviteLanding.terms.allLanguages", defaultValue: "toutes", bundle: .module)
    }

    static var validityLabel: String {
        String(localized: "inviteLanding.terms.validityLabel", defaultValue: "Lien valable", bundle: .module)
    }

    /// `nil` = sans échéance, `0` = expiré.
    public static func validity(daysLeft: Int?) -> String {
        guard let daysLeft else {
            return String(localized: "inviteLanding.terms.noExpiry", defaultValue: "sans limite de durée", bundle: .module)
        }
        guard daysLeft > 0 else {
            return String(localized: "inviteLanding.terms.expired", defaultValue: "expiré", bundle: .module)
        }
        return daysLeft == 1
            ? String(localized: "inviteLanding.terms.oneDayLeft", defaultValue: "encore 1 jour", bundle: .module)
            : String(localized: "inviteLanding.terms.daysLeft", defaultValue: "encore \(daysLeft) jours", bundle: .module)
    }

    /// `nil` = places illimitées.
    public static func places(remaining: Int?, of maxUses: Int?) -> String {
        guard let remaining, let maxUses else {
            return String(localized: "inviteLanding.terms.unlimitedPlaces", defaultValue: "places illimitées", bundle: .module)
        }
        return String(localized: "inviteLanding.terms.places", defaultValue: "places restantes : \(remaining) sur \(maxUses)", bundle: .module)
    }

    /// « English, Français et 한국어 » — chaque langue dans SA langue, liée à
    /// la façon de la locale de l'interface.
    public static func languageList(_ codes: [String]) -> String {
        guard !codes.isEmpty else { return allLanguages }
        return ListFormatter.localizedString(byJoining: codes.map(LanguageData.autonym(for:)))
    }

    static func fieldList(_ fields: [InviteRequestedField]) -> String {
        ListFormatter.localizedString(byJoining: fields.map(field))
    }

    // MARK: - Choices

    static func title(for choice: InviteLandingChoice, isSignedIn: Bool, resumesGuestSession: Bool) -> String {
        switch choice {
        case .joinWithAccount:
            return String(localized: "inviteLanding.choice.joinWithAccount", defaultValue: "Rejoindre avec mon compte", bundle: .module)
        case .joinAnonymously where resumesGuestSession:
            return String(localized: "inviteLanding.choice.resumeAnonymously", defaultValue: "Reprendre en anonyme", bundle: .module)
        case .joinAnonymously where isSignedIn:
            return String(localized: "inviteLanding.choice.joinAnonymously", defaultValue: "Rejoindre en anonyme", bundle: .module)
        case .joinAnonymously:
            return String(localized: "inviteLanding.choice.continueAnonymously", defaultValue: "Continuer en anonyme", bundle: .module)
        case .signIn:
            return String(localized: "inviteLanding.choice.signIn", defaultValue: "Se connecter", bundle: .module)
        case .signUp:
            return String(localized: "inviteLanding.choice.signUp", defaultValue: "Créer un compte", bundle: .module)
        }
    }

    static var anonymousCaptionSignedOut: String {
        String(localized: "inviteLanding.choice.captionSignedOut", defaultValue: "Tu choisis juste un nom. Aucun compte à créer.", bundle: .module)
    }

    static var anonymousCaptionSignedIn: String {
        String(localized: "inviteLanding.choice.captionSignedIn", defaultValue: "En anonyme, tu choisis un nom pour ce groupe seulement.", bundle: .module)
    }

    static var accountRequired: String {
        String(localized: "joinFlow.preview.accountRequiredMessage", defaultValue: "Un compte Meeshy est requis pour rejoindre cette conversation", bundle: .module)
    }

    static var closed: String {
        String(localized: "inviteLanding.choice.closed", defaultValue: "Ce lien n'accepte plus de nouvelles personnes.", bundle: .module)
    }
}
