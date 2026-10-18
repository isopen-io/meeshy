import Foundation
import MeeshySDK

/// **Les mots de l'écran de partage** — le vocabulaire commun de la planche
/// (fr de référence), les mêmes sur iOS, dans l'extension, sur le web et dans la
/// coque Android, dans les sept langues du catalogue.
enum ShareSheetCopy {

    static func title(_ title: ShareTitle) -> String {
        switch title {
        case .send: return String(localized: "share.sheet.title.send", defaultValue: "Envoyer", bundle: .main)
        case .forward: return String(localized: "forward.title", defaultValue: "Transférer", bundle: .main)
        }
    }

    static var cancel: String { String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main) }
    static var close: String { String(localized: "common.close", defaultValue: "Fermer", bundle: .main) }

    // MARK: Ce qui part

    static var contentZone: String { String(localized: "share.sheet.content", defaultValue: "Ce qui part", bundle: .main) }
    static func messagesKept(_ kept: Int, of total: Int) -> String {
        String(format: String(localized: "share.sheet.content.messages-kept", defaultValue: "Ce qui part · %1$d messages sur %2$d", bundle: .main), kept, total)
    }
    static func pieceOf(_ index: Int, _ count: Int) -> String {
        String(format: String(localized: "share.sheet.content.piece-of", defaultValue: "Pièce %1$d sur %2$d", bundle: .main), index, count)
    }
    static var wholeMessage: String { String(localized: "share.sheet.content.whole-message", defaultValue: "Tout le message", bundle: .main) }
    static var remove: String { String(localized: "share.sheet.content.remove", defaultValue: "Retirer", bundle: .main) }

    static func withdrawn(_ reason: ShareWithdrawReason) -> String {
        switch reason {
        case .viewOnce: return String(localized: "share.sheet.withdrawn.view-once", defaultValue: "Un message à vue unique reste dans cette conversation.", bundle: .main)
        case .afterRead: return String(localized: "share.sheet.withdrawn.after-read", defaultValue: "Un message qui disparaît après lecture reste dans cette conversation.", bundle: .main)
        case .unavailable: return String(localized: "share.sheet.withdrawn.unavailable", defaultValue: "Un message qui n’est plus disponible ne part pas.", bundle: .main)
        }
    }

    static func othersLeave(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.withdrawn.others-leave", defaultValue: "Les %d autres messages partent.", bundle: .main), count)
    }

    static var blockedTitle: String { String(localized: "share.sheet.blocked.title", defaultValue: "Ce message ne sort pas de Meeshy", bundle: .main) }
    static func blockedBody(_ reason: ShareWithdrawReason) -> String {
        switch reason {
        case .viewOnce:
            return String(localized: "share.sheet.blocked.view-once", defaultValue: "Il est à vue unique : il ne se transfère, ne s’enregistre et ne se partage pas. Il reste dans la conversation, le temps d’être vu.", bundle: .main)
        case .afterRead:
            return String(localized: "share.sheet.blocked.after-read", defaultValue: "Il disparaît après lecture : il ne se transfère, ne s’enregistre et ne se partage pas.", bundle: .main)
        case .unavailable:
            return String(localized: "share.sheet.blocked.unavailable", defaultValue: "Ce contenu n’est plus disponible.", bundle: .main)
        }
    }
    static var understood: String { String(localized: "share.sheet.blocked.understood", defaultValue: "Compris", bundle: .main) }

    static var flameTitle: String { String(localized: "forward.duration.title", defaultValue: "Disparaît après", bundle: .main) }

    // MARK: Ce qu'on peut en faire

    static var publishZone: String { String(localized: "forward.publish-section", defaultValue: "Publier", bundle: .main) }
    static func publication(_ target: PublicationTarget) -> String {
        switch target {
        case .story: return String(localized: "forward.publish-story", defaultValue: "Ma story", bundle: .main)
        case .post: return String(localized: "share.sheet.publish.feed", defaultValue: "Mon fil", bundle: .main)
        case .reel: return String(localized: "share.sheet.publish.reel", defaultValue: "Réel", bundle: .main)
        }
    }
    static var studio: String { String(localized: "share.sheet.studio", defaultValue: "Modifier dans le studio", bundle: .main) }
    static var save: String { String(localized: "share.sheet.action.save", defaultValue: "Enregistrer", bundle: .main) }
    static var copyLink: String { String(localized: "share.sheet.action.copy-link", defaultValue: "Copier le lien", bundle: .main) }
    static var copyText: String { String(localized: "share.sheet.action.copy-text", defaultValue: "Copier le texte", bundle: .main) }
    static var shareOut: String { String(localized: "share.sheet.action.share-out", defaultValue: "Partager hors de Meeshy", bundle: .main) }
    static var copied: String { String(localized: "share.sheet.copied", defaultValue: "Copié", bundle: .main) }
    static var captureWarning: String {
        String(localized: "forward.publish-capture-warning", defaultValue: "Ce média vient d'être capturé par l'application. Le publier le rendra visible au-delà de cette conversation.", bundle: .main)
    }

    static func withheld(_ reason: ShareWithheldReason) -> String {
        switch reason {
        case .singlePhotoNotAReel: return String(localized: "share.sheet.withheld.single-photo", defaultValue: "Une photo seule ne fait pas un réel.", bundle: .main)
        case .notAReel: return String(localized: "share.sheet.withheld.not-a-reel", defaultValue: "Ce contenu ne fait pas un réel.", bundle: .main)
        case .tooManyForPublication: return String(localized: "share.sheet.withheld.too-many", defaultValue: "Une publication porte au plus 10 médias.", bundle: .main)
        case .flame: return String(localized: "share.sheet.withheld.flame", defaultValue: "Une flamme ne se publie pas, ne s’enregistre pas et ne se copie pas. Sa copie disparaît aussi et ne se retransfère pas.", bundle: .main)
        case .blurred: return String(localized: "share.sheet.withheld.blurred", defaultValue: "Un message flouté se transfère flouté ; rien d’autre ne sort.", bundle: .main)
        case .encrypted: return String(localized: "share.sheet.withheld.encrypted", defaultValue: "Un message chiffré ne se publie pas. Il se transfère, se copie et s’enregistre sur cet appareil.", bundle: .main)
        case .citesProtected: return String(localized: "share.sheet.withheld.cites-protected", defaultValue: "Un message qui cite un contenu protégé ne s’image pas.", bundle: .main)
        }
    }

    // MARK: À qui

    static var searchPrompt: String { String(localized: "share.sheet.search", defaultValue: "Rechercher une personne, un groupe", bundle: .main) }
    static var conversations: String { String(localized: "share.sheet.section.conversations", defaultValue: "Conversations", bundle: .main) }
    static var people: String { String(localized: "share.sheet.section.people", defaultValue: "Personnes", bundle: .main) }
    static var communities: String { String(localized: "share.sheet.section.communities", defaultValue: "Communautés", bundle: .main) }
    static var emptyTitle: String { String(localized: "share.sheet.empty.title", defaultValue: "Personne ici pour l’instant", bundle: .main) }
    static var emptyBody: String { String(localized: "share.sheet.empty.body", defaultValue: "Cherchez une personne par son nom, son pseudo ou son numéro.", bundle: .main) }
    static var loading: String { String(localized: "share.loading", defaultValue: "Chargement des conversations…", bundle: .main) }

    static func detail(_ detail: ShareRecipient.Detail, encrypted: Bool) -> String {
        let base: String
        switch detail {
        case .direct: base = String(localized: "share.sheet.detail.direct", defaultValue: "Conversation", bundle: .main)
        case .group(let members): base = String(format: String(localized: "share.sheet.detail.group", defaultValue: "Groupe · %d membres", bundle: .main), members)
        case .friendWithoutConversation: base = String(localized: "share.sheet.detail.friend", defaultValue: "Ami · pas encore de conversation", bundle: .main)
        case .contact(let handle): base = handle.map { String(format: String(localized: "share.sheet.detail.contact-handle", defaultValue: "Dans vos contacts · %@", bundle: .main), $0) }
            ?? String(localized: "share.sheet.detail.contact", defaultValue: "Dans vos contacts", bundle: .main)
        case .handle(let handle): base = "@\(handle)"
        case .channel(let community): base = String(format: String(localized: "share.sheet.detail.channel", defaultValue: "Canal de %@", bundle: .main), community)
        }
        return encrypted ? "\(base) · \(String(localized: "share.sheet.detail.encrypted", defaultValue: "Chiffrée", bundle: .main))" : base
    }

    static var channelsHint: String { String(localized: "share.sheet.community.channels", defaultValue: "Les canaux où vous pouvez écrire", bundle: .main) }
    static var noChannel: String { String(localized: "share.sheet.community.no-channel", defaultValue: "Aucun canal où vous pouvez écrire", bundle: .main) }
    static func createGroup(_ names: String) -> String {
        String(format: String(localized: "share.sheet.group.create", defaultValue: "Créer un groupe avec %@", bundle: .main), names)
    }

    // MARK: Envoyer

    static var captionPlaceholder: String { String(localized: "share.sheet.caption", defaultValue: "Ajouter un message…", bundle: .main) }
    static var together: String { String(localized: "share.sheet.grouping.together", defaultValue: "Ensemble", bundle: .main) }
    static var separately: String { String(localized: "share.sheet.grouping.separately", defaultValue: "Séparément", bundle: .main) }
    static func sendButton(_ title: ShareTitle, count: Int) -> String {
        String(format: title == .forward ? String(localized: "share.sheet.button.forward", defaultValue: "Transférer · %d", bundle: .main) : String(localized: "share.sheet.button.send", defaultValue: "Envoyer · %d", bundle: .main), count)
    }
    static func sendAccessibility(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.button.a11y", defaultValue: "Envoyer à %d destinataires", bundle: .main), count)
    }
    static func encryptionWarning(_ names: String) -> String {
        String(format: String(localized: "share.sheet.encryption.warning", defaultValue: "« %@ » n’est pas chiffrée : ce message y sortira du chiffrement de bout en bout.", bundle: .main), names)
    }
    static func tooHeavy(files: Int, megabytes: Int) -> String {
        String(format: String(localized: "share.sheet.limits.too-heavy", defaultValue: "%1$d fichiers, %2$d Mo. Un partage emporte au plus 20 fichiers et 500 Mo.", bundle: .main), files, megabytes)
    }
    static func trimLast(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.limits.trim", defaultValue: "Retirez %d fichiers pour envoyer", bundle: .main), count)
    }
    static var tooManyRecipients: String { String(localized: "share.sheet.limits.recipients", defaultValue: "Au plus 10 destinataires par envoi", bundle: .main) }

    // MARK: Envoi

    static var sending: String { String(localized: "share.sending", defaultValue: "Envoi en cours…", bundle: .main) }
    static var sent: String { String(localized: "share.sent", defaultValue: "Envoyé", bundle: .main) }
    static var queued: String { String(localized: "share.sheet.status.queued", defaultValue: "En file", bundle: .main) }
    static var retry: String { String(localized: "share.sheet.status.retry", defaultValue: "Réessayer", bundle: .main) }
    static var retryAll: String { String(localized: "share.sheet.status.retry-all", defaultValue: "Tout réessayer", bundle: .main) }
    static var offline: String {
        String(localized: "share.sheet.offline", defaultValue: "Hors ligne. Ce qui n’est pas parti partira au retour du réseau, même si vous fermez Meeshy.", bundle: .main)
    }
    static func sentTo(_ name: String) -> String {
        String(format: String(localized: "share.sheet.toast.sent-to", defaultValue: "Envoyé à %@", bundle: .main), name)
    }
    static var published: String { String(localized: "forward.published", defaultValue: "Publié", bundle: .main) }
    static var selected: String { String(localized: "share.sheet.a11y.selected", defaultValue: "sélectionné", bundle: .main) }
}
