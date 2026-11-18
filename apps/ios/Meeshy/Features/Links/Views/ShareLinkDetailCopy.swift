import Foundation
import MeeshySDK
import MeeshyUI

/// Les textes de la fiche d'un lien (#7797), réunis parce que la carte
/// « Configuration » et le formulaire d'édition nomment les MÊMES réglages :
/// deux libellés pour un même champ se contrediraient à la première retouche.
enum ShareLinkDetailCopy {

    // MARK: - Hero

    static var active: String { String(localized: "common.active", defaultValue: "Actif", bundle: .main) }
    static var inactive: String { String(localized: "common.inactive", defaultValue: "Inactif", bundle: .main) }
    static var share: String { String(localized: "common.share", defaultValue: "Partager", bundle: .main) }
    static var copied: String { String(localized: "shareLink.a11y.copied", defaultValue: "Lien copié", bundle: .main) }

    // MARK: - La fiche faite du kit (planche `Lien-Partage`, #18871)

    static var pageTitle: String { String(localized: "shareLink.sheet.pageTitle", defaultValue: "Lien de partage", bundle: .main) }
    static var more: String { String(localized: "common.more", defaultValue: "Plus", bundle: .main) }
    static var inactiveHint: String { String(localized: "shareLink.sheet.inactiveState", defaultValue: "Personne ne peut plus entrer par ce lien", bundle: .main) }
    static var disableLink: String { String(localized: "shareLink.sheet.disableLink", defaultValue: "Désactiver le lien", bundle: .main) }
    static var resetUses: String { String(localized: "shareLink.sheet.resetUses", defaultValue: "Remettre le compteur à zéro", bundle: .main) }
    static var resetUsesMessage: String { String(localized: "shareLink.sheet.resetUses.message", defaultValue: "Les personnes déjà entrées restent. Seul le compteur repart de zéro.", bundle: .main) }
    static var resetUsesDone: String { String(localized: "shareLink.sheet.resetUses.done", defaultValue: "Compteur remis à zéro", bundle: .main) }
    static var enableLink: String { String(localized: "shareLink.sheet.enableLink", defaultValue: "Réactiver le lien", bundle: .main) }

    static func leadsTo(_ name: String) -> String {
        String(localized: "shareLink.sheet.leadsTo", defaultValue: "Mène à \(name)", bundle: .main)
    }

    static var entries: String { String(localized: "shareLink.sheet.entries", defaultValue: "Entrées", bundle: .main) }

    static func entriesUnit(limit: Int?) -> String {
        guard let limit else { return String(localized: "shareLink.sheet.entries.unit", defaultValue: "entrées, sans limite", bundle: .main) }
        return String(localized: "shareLink.sheet.entries.unitOf", defaultValue: "entrées sur \(limit)", bundle: .main)
    }

    static func entriesSpoken(_ used: Int, _ limit: Int) -> String {
        String(localized: "shareLink.sheet.entries.spoken", defaultValue: "\(used) sur \(limit)", bundle: .main)
    }

    static func quotaShare(_ fraction: Double) -> String {
        let percent = fraction.formatted(.percent.precision(.fractionLength(0)))
        return String(localized: "shareLink.sheet.quota.share", defaultValue: "\(percent) du quota", bundle: .main)
    }

    static func placesLeft(_ count: Int) -> String {
        String(localized: "shareLink.sheet.quota.left", defaultValue: "Places restantes : \(count)", bundle: .main)
    }

    static var quotaFull: String { String(localized: "shareLink.sheet.quota.full", defaultValue: "Complet", bundle: .main) }

    static func expiresIn(_ expiry: ShareLinkExpiry) -> String {
        switch expiry {
        case .inDays(let days) where days > 1:
            return String(localized: "shareLink.sheet.expiresInDays", defaultValue: "Expire dans \(days) jours", bundle: .main)
        case .inDays:
            return String(localized: "shareLink.sheet.expiresTomorrow", defaultValue: "Expire demain", bundle: .main)
        case .today:
            return String(localized: "shareLink.sheet.expiresToday", defaultValue: "Expire aujourd'hui", bundle: .main)
        case .expired:
            return linkExpired
        case .never:
            return ""
        }
    }

    static var whoCanEnter: String { String(localized: "shareLink.sheet.whoCanEnter", defaultValue: "Qui peut entrer", bundle: .main) }
    static var guestsWithoutAccount: String { String(localized: "shareLink.sheet.rule.guests", defaultValue: "Invités sans compte", bundle: .main) }
    static var historyVisible: String { String(localized: "shareLink.sheet.rule.history", defaultValue: "Historique visible", bundle: .main) }

    static func askedRule(_ fields: String) -> String {
        String(localized: "shareLink.sheet.rule.asked", defaultValue: "Demandé : \(fields)", bundle: .main)
    }

    static func concurrentRule(_ count: Int) -> String {
        String(localized: "shareLink.sheet.rule.concurrent", defaultValue: "Jusqu'à \(count) en même temps", bundle: .main)
    }

    static var seeAll: String { String(localized: "shareLink.sheet.seeAll", defaultValue: "Tout voir", bundle: .main) }
    static var guest: String { String(localized: "shareLink.sheet.guest", defaultValue: "Invité", bundle: .main) }
    static var removeArrival: String { String(localized: "shareLink.sheet.removeArrival", defaultValue: "Retirer", bundle: .main) }

    static func removeArrivalTitle(_ name: String) -> String {
        String(localized: "shareLink.sheet.removeArrivalTitle", defaultValue: "Retirer \(name) de la conversation ?", bundle: .main)
    }

    static var byCountry: String { String(localized: "shareLink.sheet.byCountry", defaultValue: "Arrivées par pays", bundle: .main) }

    // MARK: - Arrivals

    static var visits: String { String(localized: "shareLink.detail.visits", defaultValue: "Visites", bundle: .main) }
    static var arrivals: String { String(localized: "shareLink.detail.arrivals", defaultValue: "Arrivées", bundle: .main) }
    static var withoutAccount: String { String(localized: "shareLink.detail.withoutAccount", defaultValue: "Sans compte", bundle: .main) }
    static var arrivalLanguages: String { String(localized: "shareLink.detail.arrivalLanguages", defaultValue: "Langues des arrivants", bundle: .main) }
    static var noArrivals: String { String(localized: "shareLink.detail.noArrivals", defaultValue: "Personne n'est encore arrivé par ce lien.", bundle: .main) }
    static var statsUnavailable: String { String(localized: "shareLink.detail.statsUnavailable", defaultValue: "Les statistiques de ce lien ne sont pas encore disponibles.", bundle: .main) }

    // MARK: - All arrivals (#7813)

    static func seeAllArrivals(_ count: Int) -> String {
        String(localized: "shareLink.arrivals.seeAll", defaultValue: "Voir les \(count) arrivées", bundle: .main)
    }

    static func arrivalsTotal(_ count: Int) -> String {
        String(localized: "shareLink.arrivals.total", defaultValue: "\(count) arrivées au total", bundle: .main)
    }

    static var arrivalsLoading: String { String(localized: "shareLink.arrivals.loading", defaultValue: "Chargement des arrivées", bundle: .main) }
    static var arrivalsLoadFailed: String { String(localized: "shareLink.arrivals.loadFailed", defaultValue: "Les arrivées n'ont pas pu être chargées.", bundle: .main) }
    static var arrivalsMoreFailed: String { String(localized: "shareLink.arrivals.moreFailed", defaultValue: "La suite n'a pas pu être chargée.", bundle: .main) }
    static var retry: String { String(localized: "common.retry", defaultValue: "Réessayer", bundle: .main) }

    // MARK: - Configuration

    static var edit: String { String(localized: "shareLink.detail.edit", defaultValue: "Modifier", bundle: .main) }
    static var guestRights: String { String(localized: "shareLink.detail.guestRights", defaultValue: "Droits des invités sans compte", bundle: .main) }
    static var entryConditions: String { String(localized: "shareLink.detail.entryConditions", defaultValue: "Conditions d'entrée", bundle: .main) }
    static var limits: String { String(localized: "shareLink.detail.limits", defaultValue: "Limites", bundle: .main) }
    static var allowedLanguages: String { String(localized: "shareLink.detail.allowedLanguages", defaultValue: "Langues autorisées", bundle: .main) }
    static var allLanguages: String { String(localized: "shareLink.detail.allLanguages", defaultValue: "Toutes les langues", bundle: .main) }
    static var meeshyAccount: String { String(localized: "shareLink.detail.meeshyAccount", defaultValue: "Compte Meeshy", bundle: .main) }
    static var expires: String { String(localized: "shareLink.detail.expires", defaultValue: "Expire", bundle: .main) }
    static var unlimited: String { String(localized: "shareLink.detail.unlimited", defaultValue: "Illimité", bundle: .main) }
    static var historyRight: String { String(localized: "shareLink.detail.historyRight", defaultValue: "Voir l'historique", bundle: .main) }

    static var expiresOn: String { String(localized: "participantProfile.linkExpires", defaultValue: "Expire le", bundle: .main) }
    static var linkExpired: String { String(localized: "conversationCard.expired", defaultValue: "Lien expiré", bundle: .main) }

    /// #10381 — la ligne de « Mes liens › Liens de partage » dit l'échéance
    /// choisie à la création ; un lien sans échéance n'ajoute rien à sa ligne.
    static func rowExpiry(_ date: Date?, now: Date = Date()) -> String? {
        guard let date else { return nil }
        guard date > now else { return linkExpired }
        return "\(expiresOn) \(ShareLinkDateFormat.day(date))"
    }

    static func languages(_ codes: [String]) -> String {
        codes.isEmpty ? allLanguages : ListFormatter.localizedString(byJoining: codes.map(LanguageData.autonym(for:)))
    }

    /// « Prénom, nom et pseudo » : une seule phrase, liée à la façon de la
    /// locale, majuscule au premier mot seulement. Les noms de champ vivent au
    /// catalogue dans la casse de leur langue (minuscule en français, nom
    /// commun capitalisé en allemand) — jamais abaissés par le code.
    static func askedFields(_ settings: ShareLinkSettings, locale: Locale = .current) -> String {
        let fields = ShareLinkInvitationTerms.requestedFields(
            requireNickname: settings.requireNickname,
            requireEmail: settings.requireEmail,
            requireBirthday: settings.requireBirthday
        )
        return sentence(fields.flatMap(fieldNames), locale: locale)
    }

    static func sentence(_ items: [String], locale: Locale) -> String {
        let joined = items.formatted(.list(type: .and).locale(locale))
        guard let first = joined.first else { return joined }
        return String(first).uppercased(with: locale) + joined.dropFirst()
    }

    static func fieldNames(_ field: InviteRequestedField) -> [String] {
        switch field {
        case .name:
            return [
                String(localized: "shareLink.detail.fieldFirstName", defaultValue: "prénom", bundle: .main),
                String(localized: "shareLink.detail.fieldLastName", defaultValue: "nom", bundle: .main),
            ]
        case .nickname: return [String(localized: "shareLink.detail.fieldNickname", defaultValue: "pseudo", bundle: .main)]
        case .email: return [String(localized: "shareLink.detail.fieldEmail", defaultValue: "e-mail", bundle: .main)]
        case .birthday: return [String(localized: "shareLink.detail.fieldBirthday", defaultValue: "date de naissance", bundle: .main)]
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
