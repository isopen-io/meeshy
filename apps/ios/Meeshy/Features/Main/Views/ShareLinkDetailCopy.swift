import Foundation
import MeeshySDK
import MeeshyUI

/// Les textes de la fiche d'un lien (#7797), réunis parce que la carte
/// « Configuration » et le formulaire d'édition nomment les MÊMES réglages :
/// deux libellés pour un même champ se contrediraient à la première retouche.
enum ShareLinkDetailCopy {

    // MARK: - Hero

    static func createdOn(_ date: Date) -> String {
        let formatted = date.formatted(date: .abbreviated, time: .omitted)
        return String(localized: "shareLink.detail.createdOn", defaultValue: "Lien créé le \(formatted)", bundle: .main)
    }

    static var active: String { String(localized: "common.active", defaultValue: "Actif", bundle: .main) }
    static var inactive: String { String(localized: "common.inactive", defaultValue: "Inactif", bundle: .main) }
    static var share: String { String(localized: "common.share", defaultValue: "Partager", bundle: .main) }
    static var copyLink: String { String(localized: "share.links.copy.a11y", defaultValue: "Copier le lien", bundle: .main) }
    static var copied: String { String(localized: "shareLink.a11y.copied", defaultValue: "Lien copié", bundle: .main) }

    // MARK: - Arrivals

    static var visits: String { String(localized: "shareLink.detail.visits", defaultValue: "Visites", bundle: .main) }
    static var arrivals: String { String(localized: "shareLink.detail.arrivals", defaultValue: "Arrivées", bundle: .main) }
    static var withoutAccount: String { String(localized: "shareLink.detail.withoutAccount", defaultValue: "Sans compte", bundle: .main) }
    static var arrivalLanguages: String { String(localized: "shareLink.detail.arrivalLanguages", defaultValue: "Langues des arrivants", bundle: .main) }
    static var recentArrivals: String { String(localized: "shareLink.detail.recentArrivals", defaultValue: "Arrivés récemment", bundle: .main) }
    static var noAccountBadge: String { String(localized: "shareLink.detail.noAccountBadge", defaultValue: "sans compte", bundle: .main) }
    static var noArrivals: String { String(localized: "shareLink.detail.noArrivals", defaultValue: "Personne n'est encore arrivé par ce lien.", bundle: .main) }
    static var statsUnavailable: String { String(localized: "shareLink.detail.statsUnavailable", defaultValue: "Les statistiques de ce lien ne sont pas encore disponibles.", bundle: .main) }

    // MARK: - Configuration

    static var configuration: String { String(localized: "shareLink.detail.configuration", defaultValue: "Configuration", bundle: .main) }
    static var edit: String { String(localized: "shareLink.detail.edit", defaultValue: "Modifier", bundle: .main) }
    static var guestRights: String { String(localized: "shareLink.detail.guestRights", defaultValue: "Droits des invités sans compte", bundle: .main) }
    static var entryConditions: String { String(localized: "shareLink.detail.entryConditions", defaultValue: "Conditions d'entrée", bundle: .main) }
    static var limits: String { String(localized: "shareLink.detail.limits", defaultValue: "Limites", bundle: .main) }
    static var allowedLanguages: String { String(localized: "shareLink.detail.allowedLanguages", defaultValue: "Langues autorisées", bundle: .main) }
    static var allLanguages: String { String(localized: "shareLink.detail.allLanguages", defaultValue: "Toutes les langues", bundle: .main) }
    static var meeshyAccount: String { String(localized: "shareLink.detail.meeshyAccount", defaultValue: "Compte Meeshy", bundle: .main) }
    static var required: String { String(localized: "shareLink.detail.required", defaultValue: "Obligatoire", bundle: .main) }
    static var optional: String { String(localized: "shareLink.detail.optional", defaultValue: "Facultatif", bundle: .main) }
    static var askedOnArrival: String { String(localized: "shareLink.detail.askedOnArrival", defaultValue: "Demandé à l'arrivée", bundle: .main) }
    static var uses: String { String(localized: "shareLink.detail.uses", defaultValue: "Utilisations", bundle: .main) }
    static var concurrent: String { String(localized: "shareLink.detail.concurrent", defaultValue: "En même temps", bundle: .main) }
    static var expires: String { String(localized: "shareLink.detail.expires", defaultValue: "Expire", bundle: .main) }
    static var never: String { String(localized: "shareLink.detail.never", defaultValue: "Jamais", bundle: .main) }
    static var unlimited: String { String(localized: "shareLink.detail.unlimited", defaultValue: "Illimité", bundle: .main) }
    static var historyRight: String { String(localized: "shareLink.detail.historyRight", defaultValue: "Voir l'historique", bundle: .main) }

    static func usesValue(current: Int, max: Int?) -> String {
        guard let max else {
            return String(localized: "shareLink.detail.usesUnlimited", defaultValue: "\(current) / illimité", bundle: .main)
        }
        return "\(current.formatted()) / \(max.formatted())"
    }

    static func concurrentValue(_ max: Int?) -> String {
        guard let max else { return unlimited }
        return String(localized: "shareLink.detail.concurrentMax", defaultValue: "\(max) max", bundle: .main)
    }

    static func expiryValue(_ date: Date?) -> String {
        date.map { $0.formatted(date: .abbreviated, time: .shortened) } ?? never
    }

    static func languages(_ codes: [String]) -> String {
        codes.isEmpty ? allLanguages : ListFormatter.localizedString(byJoining: codes.map(LanguageData.autonym(for:)))
    }

    static func askedFields(_ settings: ShareLinkSettings) -> String {
        let fields = ShareLinkInvitationTerms.requestedFields(
            requireNickname: settings.requireNickname,
            requireEmail: settings.requireEmail,
            requireBirthday: settings.requireBirthday
        )
        return ListFormatter.localizedString(byJoining: fields.map(fieldName))
    }

    static func fieldName(_ field: InviteRequestedField) -> String {
        switch field {
        case .name: return String(localized: "shareLink.detail.fieldName", defaultValue: "Prénom et nom", bundle: .main)
        case .nickname: return String(localized: "shareLink.detail.fieldNickname", defaultValue: "Pseudo", bundle: .main)
        case .email: return String(localized: "shareLink.detail.fieldEmail", defaultValue: "E-mail", bundle: .main)
        case .birthday: return String(localized: "shareLink.detail.fieldBirthday", defaultValue: "Date de naissance", bundle: .main)
        }
    }

    // MARK: - Edit form

    static var editTitle: String { String(localized: "shareLink.detail.editTitle", defaultValue: "Modifier le lien", bundle: .main) }
    static var nameField: String { String(localized: "shareLink.detail.nameField", defaultValue: "Nom du lien (visible par toi seul)", bundle: .main) }
    static var messageField: String { String(localized: "shareLink.detail.messageField", defaultValue: "Message d'invitation (affiché aux invités)", bundle: .main) }
    static var expiration: String { String(localized: "shareLink.detail.expiration", defaultValue: "Expiration", bundle: .main) }
    static var maxUsesField: String { String(localized: "shareLink.detail.maxUsesField", defaultValue: "Utilisations max", bundle: .main) }
    static var maxConcurrentField: String { String(localized: "shareLink.detail.maxConcurrentField", defaultValue: "Personnes en même temps", bundle: .main) }
    static var requireAccount: String { String(localized: "shareLink.detail.requireAccount", defaultValue: "Compte Meeshy obligatoire", bundle: .main) }
    static var requireNickname: String { String(localized: "shareLink.detail.requireNickname", defaultValue: "Demander un pseudo", bundle: .main) }
    static var requireEmail: String { String(localized: "shareLink.detail.requireEmail", defaultValue: "Demander un e-mail", bundle: .main) }
    static var requireBirthday: String { String(localized: "shareLink.detail.requireBirthday", defaultValue: "Demander la date de naissance", bundle: .main) }
    static var invalidLimits: String { String(localized: "shareLink.detail.invalidLimits", defaultValue: "Une limite vaut au moins 1.", bundle: .main) }
    static var save: String { String(localized: "shareLink.detail.save", defaultValue: "Enregistrer", bundle: .main) }
    static var saved: String { String(localized: "shareLink.detail.saved", defaultValue: "Lien enregistré", bundle: .main) }
    static var saveFailed: String { String(localized: "shareLink.detail.saveFailed", defaultValue: "Le lien n'a pas pu être enregistré. Réessaie.", bundle: .main) }
    static var actionFailed: String { String(localized: "shareLink.detail.actionFailed", defaultValue: "L'action n'a pas abouti. Réessaie.", bundle: .main) }

    static var disable: String { String(localized: "shareLink.disable", defaultValue: "Désactiver", bundle: .main) }
    static var activate: String { String(localized: "shareLink.activate", defaultValue: "Activer", bundle: .main) }
    static var delete: String { String(localized: "shareLink.delete", defaultValue: "Supprimer", bundle: .main) }
    static var deleteTitle: String { String(localized: "shareLink.deleteTitle", defaultValue: "Supprimer ce lien ?", bundle: .main) }
    static var deleteConfirmation: String { String(localized: "shareLink.deleteConfirmation", defaultValue: "Cette action est irréversible. Le lien ne sera plus accessible.", bundle: .main) }
    static var cancel: String { String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main) }
}
