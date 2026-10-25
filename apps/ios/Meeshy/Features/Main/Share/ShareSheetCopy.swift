import Foundation
import MeeshySDK

/// **Les mots de l'écran de partage** — le vocabulaire commun de la planche
/// (fr de référence), les mêmes sur iOS, dans l'extension, sur le web et dans la
/// coque Android, dans les sept langues du catalogue.
enum ShareSheetCopy {

    static func title(_ title: ShareTitle) -> String {
        switch title {
        case .send: return String(localized: "share.sheet.title.send", defaultValue: "Envoyer", bundle: .meeshyShare)
        case .forward: return String(localized: "forward.title", defaultValue: "Transférer", bundle: .meeshyShare)
        }
    }

    static var cancel: String { String(localized: "common.cancel", defaultValue: "Annuler", bundle: .meeshyShare) }
    static var close: String { String(localized: "common.close", defaultValue: "Fermer", bundle: .meeshyShare) }

    // MARK: Ce qui part

    static var contentZone: String { String(localized: "share.sheet.content", defaultValue: "Ce qui part", bundle: .meeshyShare) }
    static func messagesKept(_ kept: Int, of total: Int) -> String {
        String(format: String(localized: "share.sheet.content.messages-kept", defaultValue: "Ce qui part · %1$d messages sur %2$d", bundle: .meeshyShare), kept, total)
    }
    static func pieceOf(_ index: Int, _ count: Int) -> String {
        String(format: String(localized: "share.sheet.content.piece-of", defaultValue: "Pièce %1$d sur %2$d", bundle: .meeshyShare), index, count)
    }
    static var wholeMessage: String { String(localized: "share.sheet.content.whole-message", defaultValue: "Tout le message", bundle: .meeshyShare) }
    static func removeLast(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.content.remove-last", defaultValue: "Retirer les %d derniers", bundle: .meeshyShare), count)
    }
    static func pieceNumber(_ index: Int) -> String {
        String(format: String(localized: "share.sheet.content.piece-number", defaultValue: "Pièce %d", bundle: .meeshyShare), index)
    }
    static var moveForward: String { String(localized: "share.sheet.content.move-forward", defaultValue: "Avancer", bundle: .meeshyShare) }
    static var moveBackward: String { String(localized: "share.sheet.content.move-backward", defaultValue: "Reculer", bundle: .meeshyShare) }
    static var unprepared: String {
        String(localized: "share.sheet.content.unprepared", defaultValue: "Des fichiers n’ont pas pu être préparés. Téléchargez-les d’abord, puis réessayez.", bundle: .meeshyShare)
    }
    static func shortfall(_ shortfall: ShareShortfall) -> String {
        switch shortfall {
        case .unprepared: return unprepared
        case .overBudget(let uncopied):
            return String(format: String(localized: "share.sheet.content.over-budget", defaultValue: "Fichiers non copiés : %1$d. Un partage emporte au plus %2$d fichiers et %3$@.", bundle: .meeshyShare), uncopied, ShareLimits.maxFiles, limitSize(ShareLimits.maxTotalBytes))
        case .refusedSource:
            return String(localized: "share.sheet.content.refused-source", defaultValue: "Cette app n’a remis qu’un chemin de fichier, que Meeshy n’ouvre pas. Partagez le fichier lui-même, ou enregistrez-le d’abord dans Photos ou Fichiers.", bundle: .meeshyShare)
        }
    }
    static var overLimit: String { String(localized: "share.sheet.content.over-limit", defaultValue: "dépasse la limite", bundle: .meeshyShare) }
    static var remove: String { String(localized: "share.sheet.content.remove", defaultValue: "Retirer", bundle: .meeshyShare) }

    static func withdrawn(_ reason: ShareWithdrawReason) -> String {
        switch reason {
        case .viewOnce: return String(localized: "share.sheet.withdrawn.view-once", defaultValue: "Un message à vue unique reste dans cette conversation.", bundle: .meeshyShare)
        case .afterRead: return String(localized: "share.sheet.withdrawn.after-read", defaultValue: "Un message qui disparaît après lecture reste dans cette conversation.", bundle: .meeshyShare)
        case .unavailable: return String(localized: "share.sheet.withdrawn.unavailable", defaultValue: "Un message qui n’est plus disponible ne part pas.", bundle: .meeshyShare)
        }
    }

    static func othersLeave(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.withdrawn.others-leave", defaultValue: "Les %d autres messages partent.", bundle: .meeshyShare), count)
    }

    static var blockedTitle: String { String(localized: "share.sheet.blocked.title", defaultValue: "Ce message ne sort pas de Meeshy", bundle: .meeshyShare) }
    static func blockedBody(_ reason: ShareWithdrawReason) -> String {
        switch reason {
        case .viewOnce:
            return String(localized: "share.sheet.blocked.view-once", defaultValue: "Il est à vue unique : il ne se transfère, ne s’enregistre et ne se partage pas. Il reste dans la conversation, le temps d’être vu.", bundle: .meeshyShare)
        case .afterRead:
            return String(localized: "share.sheet.blocked.after-read", defaultValue: "Il disparaît après lecture : il ne se transfère, ne s’enregistre et ne se partage pas.", bundle: .meeshyShare)
        case .unavailable:
            return String(localized: "share.sheet.blocked.unavailable", defaultValue: "Ce contenu n’est plus disponible.", bundle: .meeshyShare)
        }
    }
    static var understood: String { String(localized: "share.sheet.blocked.understood", defaultValue: "Compris", bundle: .meeshyShare) }

    static var flameTitle: String { String(localized: "forward.duration.title", defaultValue: "Disparaît après", bundle: .meeshyShare) }

    // MARK: Ce qu'on peut en faire

    static var publishZone: String { String(localized: "forward.publish-section", defaultValue: "Publier", bundle: .meeshyShare) }
    static func publication(_ target: PublicationTarget) -> String {
        switch target {
        case .story: return String(localized: "forward.publish-story", defaultValue: "Ma story", bundle: .meeshyShare)
        case .post: return String(localized: "share.sheet.publish.feed", defaultValue: "Mon fil", bundle: .meeshyShare)
        case .reel: return String(localized: "share.sheet.publish.reel", defaultValue: "Réel", bundle: .meeshyShare)
        }
    }
    static var studioShort: String { String(localized: "share.sheet.studio.short", defaultValue: "Studio", bundle: .meeshyShare) }
    static var sendWithMeeshy: String { String(localized: "share.sheet.title.extension", defaultValue: "Envoyer avec Meeshy", bundle: .meeshyShare) }
    static var signInTitle: String { String(localized: "share.sheet.sign-in.title", defaultValue: "Connectez-vous pour envoyer", bundle: .meeshyShare) }
    static var signInBody: String {
        String(localized: "share.sheet.sign-in.body", defaultValue: "Votre partage est gardé. Il vous attend dans Meeshy, ou dans le studio si vous voulez le publier.", bundle: .meeshyShare)
    }
    static var openMeeshy: String { String(localized: "share.sheet.sign-in.open", defaultValue: "Ouvrir Meeshy", bundle: .meeshyShare) }
    static var studio: String { String(localized: "share.sheet.studio", defaultValue: "Modifier dans le studio", bundle: .meeshyShare) }
    static var save: String { String(localized: "share.sheet.action.save", defaultValue: "Enregistrer", bundle: .meeshyShare) }
    static var copyLink: String { String(localized: "share.sheet.action.copy-link", defaultValue: "Copier le lien", bundle: .meeshyShare) }
    static var copyText: String { String(localized: "share.sheet.action.copy-text", defaultValue: "Copier le texte", bundle: .meeshyShare) }
    static var shareOut: String { String(localized: "share.sheet.action.share-out", defaultValue: "Partager hors de Meeshy", bundle: .meeshyShare) }
    static var copied: String { String(localized: "share.sheet.copied", defaultValue: "Copié", bundle: .meeshyShare) }
    static var captureWarning: String {
        String(localized: "forward.publish-capture-warning", defaultValue: "Ce média vient d'être capturé par l'application. Le publier le rendra visible au-delà de cette conversation.", bundle: .meeshyShare)
    }

    static func withheld(_ reason: ShareWithheldReason) -> String {
        switch reason {
        case .singlePhotoNotAReel: return String(localized: "share.sheet.withheld.single-photo", defaultValue: "Une photo seule ne fait pas un réel.", bundle: .meeshyShare)
        case .notAReel: return String(localized: "share.sheet.withheld.not-a-reel", defaultValue: "Ce contenu ne fait pas un réel.", bundle: .meeshyShare)
        case .tooManyForPublication: return String(localized: "share.sheet.withheld.too-many", defaultValue: "Une publication porte au plus 10 médias.", bundle: .meeshyShare)
        case .flame: return String(localized: "share.sheet.withheld.flame", defaultValue: "Une flamme ne se publie pas, ne s’enregistre pas et ne se copie pas. Sa copie disparaît aussi et ne se retransfère pas.", bundle: .meeshyShare)
        case .blurred: return String(localized: "share.sheet.withheld.blurred", defaultValue: "Un message flouté se transfère flouté ; rien d’autre ne sort.", bundle: .meeshyShare)
        case .encrypted: return String(localized: "share.sheet.withheld.encrypted", defaultValue: "Un message chiffré ne se publie pas. Il se transfère, se copie et s’enregistre sur cet appareil.", bundle: .meeshyShare)
        case .citesProtected: return String(localized: "share.sheet.withheld.cites-protected", defaultValue: "Un message qui cite un contenu protégé ne s’image pas.", bundle: .meeshyShare)
        }
    }

    // MARK: À qui

    static var searchPrompt: String { String(localized: "share.sheet.search", defaultValue: "Rechercher une personne, un groupe", bundle: .meeshyShare) }
    static var conversations: String { String(localized: "share.sheet.section.conversations", defaultValue: "Conversations", bundle: .meeshyShare) }
    static var people: String { String(localized: "share.sheet.section.people", defaultValue: "Personnes", bundle: .meeshyShare) }
    static var communities: String { String(localized: "share.sheet.section.communities", defaultValue: "Communautés", bundle: .meeshyShare) }
    static var emptyTitle: String { String(localized: "share.sheet.empty.title", defaultValue: "Personne ici pour l’instant", bundle: .meeshyShare) }
    static var emptyBody: String { String(localized: "share.sheet.empty.body", defaultValue: "Cherchez une personne par son nom, son pseudo ou son numéro.", bundle: .meeshyShare) }
    static var loading: String { String(localized: "share.loading", defaultValue: "Chargement des conversations…", bundle: .meeshyShare) }

    static func detail(_ detail: ShareRecipient.Detail, encrypted: Bool) -> String {
        let base: String
        switch detail {
        case .direct: base = String(localized: "share.sheet.detail.direct", defaultValue: "Conversation", bundle: .meeshyShare)
        case .group(let members) where members <= 0: base = String(localized: "share.sheet.detail.group-unsized", defaultValue: "Groupe", bundle: .meeshyShare)
        case .group(let members): base = String(format: String(localized: "share.sheet.detail.group", defaultValue: "Groupe · %d membres", bundle: .meeshyShare), members)
        case .friendWithoutConversation: base = String(localized: "share.sheet.detail.friend", defaultValue: "Ami · pas encore de conversation", bundle: .meeshyShare)
        case .contact(let handle): base = handle.map { String(format: String(localized: "share.sheet.detail.contact-handle", defaultValue: "Dans vos contacts · %@", bundle: .meeshyShare), $0) }
            ?? String(localized: "share.sheet.detail.contact", defaultValue: "Dans vos contacts", bundle: .meeshyShare)
        case .handle(let handle): base = "@\(handle)"
        case .channel(let community): base = String(format: String(localized: "share.sheet.detail.channel", defaultValue: "Canal de %@", bundle: .meeshyShare), community)
        }
        return encrypted ? "\(base) · \(String(localized: "share.sheet.detail.encrypted", defaultValue: "Chiffrée", bundle: .meeshyShare))" : base
    }

    static var channelsHint: String { String(localized: "share.sheet.community.channels", defaultValue: "Les canaux où vous pouvez écrire", bundle: .meeshyShare) }
    static var noChannel: String { String(localized: "share.sheet.community.no-channel", defaultValue: "Aucun canal où vous pouvez écrire", bundle: .meeshyShare) }
    static func createGroup(_ names: String) -> String {
        String(format: String(localized: "share.sheet.group.create", defaultValue: "Créer un groupe avec %@", bundle: .meeshyShare), names)
    }

    // MARK: Envoyer

    static var captionPlaceholder: String { String(localized: "share.sheet.caption", defaultValue: "Ajouter un message…", bundle: .meeshyShare) }
    static var together: String { String(localized: "share.sheet.grouping.together", defaultValue: "Ensemble", bundle: .meeshyShare) }
    static var separately: String { String(localized: "share.sheet.grouping.separately", defaultValue: "Séparément", bundle: .meeshyShare) }
    static func sendButton(_ title: ShareTitle, count: Int) -> String {
        String(format: title == .forward ? String(localized: "share.sheet.button.forward", defaultValue: "Transférer · %d", bundle: .meeshyShare) : String(localized: "share.sheet.button.send", defaultValue: "Envoyer · %d", bundle: .meeshyShare), count)
    }
    static func sendAccessibility(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.button.a11y", defaultValue: "Envoyer à %d destinataires", bundle: .meeshyShare), count)
    }
    static func encryptionWarning(_ names: String) -> String {
        String(format: String(localized: "share.sheet.encryption.warning", defaultValue: "« %@ » n’est pas chiffrée : ce message y sortira du chiffrement de bout en bout.", bundle: .meeshyShare), names)
    }
    static func tooHeavy(files: Int, bytes: Int) -> String {
        String(format: String(localized: "share.sheet.limits.too-heavy", defaultValue: "%1$d fichiers, %2$@. Un partage emporte au plus %3$d fichiers et %4$@.", bundle: .meeshyShare), files, limitSize(bytes), ShareLimits.maxFiles, limitSize(ShareLimits.maxTotalBytes))
    }

    /// Un poids rapporté aux plafonds du partage (« 5 Go », « 6,2 Go »,
    /// « 500 Mo ») — compté en puissances de 1 024, comme `ShareLimits` et le
    /// `sizeIn` du web, pour que le plafond se lise « 5 Go » et jamais
    /// « 5,37 Go ». Les chiffres viennent de `ShareLimits` : aucune copie des
    /// plafonds ne vit dans le catalogue (#12974).
    static func limitSize(_ bytes: Int, locale: Locale = .shareCatalog()) -> String {
        Int64(max(0, bytes)).formatted(.byteCount(style: .memory).locale(locale))
    }
    static func trimLast(_ count: Int) -> String {
        String(format: String(localized: "share.sheet.limits.trim", defaultValue: "Retirez %d fichiers pour envoyer", bundle: .meeshyShare), count)
    }
    static var unreachable: String {
        String(localized: "forward.error.contact-offline", defaultValue: "Cette personne ne peut pas être jointe hors connexion.", bundle: .meeshyShare)
    }
    static var tooManyRecipients: String { String(localized: "share.sheet.limits.recipients", defaultValue: "Au plus 10 destinataires par envoi", bundle: .meeshyShare) }

    // MARK: Envoi

    static var sending: String { String(localized: "share.sending", defaultValue: "Envoi en cours…", bundle: .meeshyShare) }
    static var sent: String { String(localized: "share.sent", defaultValue: "Envoyé", bundle: .meeshyShare) }
    static var queued: String { String(localized: "share.sheet.status.queued", defaultValue: "En file", bundle: .meeshyShare) }
    static var retry: String { String(localized: "share.sheet.status.retry", defaultValue: "Réessayer", bundle: .meeshyShare) }
    static var retryAll: String { String(localized: "share.sheet.status.retry-all", defaultValue: "Tout réessayer", bundle: .meeshyShare) }
    static var offline: String {
        String(localized: "share.sheet.offline", defaultValue: "Hors ligne. Ce qui n’est pas parti partira au retour du réseau, même si vous fermez Meeshy.", bundle: .meeshyShare)
    }
    static func sentTo(_ name: String) -> String {
        String(format: String(localized: "share.sheet.toast.sent-to", defaultValue: "Envoyé à %@", bundle: .meeshyShare), name)
    }
    static var published: String { String(localized: "forward.published", defaultValue: "Publié", bundle: .meeshyShare) }
    static var selected: String { String(localized: "share.sheet.a11y.selected", defaultValue: "sélectionné", bundle: .meeshyShare) }
}
