import Foundation
import MeeshySDK

/// Les mots du sélecteur de pièces jointes d'un INVITÉ (#10006, planche
/// « Attach ») : ce qu'il peut partager, et pourquoi le reste ne passe pas.
enum GuestAttachmentCopy {

    static func title(_ conversationTitle: String) -> String {
        String(format: String(localized: "guestAttach.title", defaultValue: "Partager dans %@", bundle: .main), conversationTitle)
    }

    /// Le libellé d'une tuile.
    static func tileLabel(_ kind: GuestAttachmentKind) -> String {
        switch kind {
        case .text: return String(localized: "guestAttach.kind.text", defaultValue: "Fichier texte (.txt)", bundle: .main)
        case .audio: return String(localized: "guestAttach.kind.audio", defaultValue: "Audio", bundle: .main)
        case .image: return String(localized: "guestAttach.kind.image", defaultValue: "Image", bundle: .main)
        case .pdf: return String(localized: "guestAttach.kind.pdf", defaultValue: "PDF", bundle: .main)
        }
    }

    /// Le nom d'une famille DANS une phrase (« des fichiers texte (.txt) et audio »).
    static func inlineLabel(_ kind: GuestAttachmentKind) -> String {
        switch kind {
        case .text: return String(localized: "guestAttach.inline.text", defaultValue: "fichiers texte (.txt)", bundle: .main)
        case .audio: return String(localized: "guestAttach.inline.audio", defaultValue: "audio", bundle: .main)
        case .image: return String(localized: "guestAttach.inline.image", defaultValue: "images", bundle: .main)
        case .pdf: return String(localized: "guestAttach.inline.pdf", defaultValue: "PDF", bundle: .main)
        }
    }

    /// Les familles ouvertes, jointes par la conjonction de la langue.
    static func allowedList(_ kinds: [GuestAttachmentKind]) -> String {
        ListFormatter.localizedString(byJoining: kinds.map(inlineLabel))
    }

    static func note(conversationTitle: String, kinds: [GuestAttachmentKind]) -> String {
        String(
            format: String(localized: "guestAttach.note", defaultValue: "Sans compte, %1$@ accepte vos messages, vos vocaux, des %2$@.", bundle: .main),
            conversationTitle, allowedList(kinds)
        )
    }

    static var createAccount: String {
        String(localized: "guestAttach.createAccount", defaultValue: "Créez un compte pour partager le reste.", bundle: .main)
    }

    static var cancel: String {
        String(localized: "guestAttach.cancel", defaultValue: "Annuler", bundle: .main)
    }

    static var maxSize: String {
        MediaFormat.bytes(GuestAttachmentAllowance.maxBytes)
    }

    /// Le refus d'un fichier CHOISI, nommé.
    static func refusal(fileName: String, reason: GuestAttachmentRefusal.Reason, kinds: [GuestAttachmentKind]) -> String {
        switch reason {
        case .kindNotAllowed:
            return String(
                format: String(localized: "guestAttach.refused.kind", defaultValue: "%1$@ n'est pas accepté ici : seuls les %2$@ passent.", bundle: .main),
                fileName, allowedList(kinds)
            )
        case .tooLarge:
            return String(
                format: String(localized: "guestAttach.refused.size", defaultValue: "%1$@ est trop lourd : %2$@ au plus.", bundle: .main),
                fileName, maxSize
            )
        }
    }

    /// Le refus rendu par le SERVEUR à l'envoi (tus, REST) — le fichier n'y est
    /// plus nommé, la raison l'est.
    static func serverRefusal(_ refusal: GuestAttachmentRefusal, kinds: [GuestAttachmentKind]?) -> String {
        switch refusal.reason {
        case .kindNotAllowed:
            guard let kinds, !kinds.isEmpty else {
                return refusal.serverMessage ?? String(localized: "guestAttach.server.kindClosed", defaultValue: "Ce fichier n'est pas accepté ici.", bundle: .main)
            }
            return String(
                format: String(localized: "guestAttach.server.kind", defaultValue: "Ce fichier n'est pas accepté ici : seuls les %@ passent.", bundle: .main),
                allowedList(kinds)
            )
        case .tooLarge:
            return String(
                format: String(localized: "guestAttach.server.size", defaultValue: "Ce fichier est trop lourd ici : %@ au plus.", bundle: .main),
                maxSize
            )
        }
    }
}
