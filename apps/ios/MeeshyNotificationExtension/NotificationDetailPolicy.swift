import Foundation
import MeeshySDK

/// **Ce que l'extension de notification — et les actions de la bannière — ont
/// le droit de tirer du DÉTAIL d'un message** (#8858, sous-lot iOS de #8856).
///
/// Le détail lui-même (position, carte de visite, invitation, lien) se lit par
/// `NotificationMessageDetail`, le lecteur unique du SDK. Ce fichier pose ce
/// que le SDK ne sait pas : le SECOND VERROU de protection
/// (`NSEAttachmentPolicy.declaresProtection`), la catégorie d'actions, la
/// vignette vidéo, le corps détaillé et le délai de l'instantané de carte.
///
/// Compilé dans l'extension ET dans l'app (cf. `project.yml`), comme
/// `NSEAttachmentPolicy` : c'est ce qui met ces règles à portée de
/// `MeeshyTests`, et ce qui fait que l'action « Rejoindre » lit la charge
/// exactement comme l'extension l'a lue pour choisir la catégorie.
nonisolated enum NotificationDetailPolicy {

    /// Le détail, **jamais** pour un message qui déclare une protection. Le
    /// serveur retient déjà ces clés (même branche que `attachmentUrl`) ;
    /// une clé qui aurait voyagé par erreur ne doit rien révéler de plus.
    static func detail(userInfo: [AnyHashable: Any]) -> NotificationMessageDetail? {
        guard !NSEAttachmentPolicy.declaresProtection(userInfo: userInfo) else { return nil }
        return NotificationMessageDetail(userInfo: userInfo)
    }

    /// Les types dont la catégorie « message » peut se spécialiser. Une
    /// RÉACTION porte le `messageId` du message réagi, pas un message qui
    /// arrive : « Ouvrir dans Plans » sous « a réagi 👍 » serait faux.
    private static let refinableTypes: Set<String> = [
        "new_message", "message_reply", "reply", "message_forwarded",
    ]

    /// La catégorie finale : `MEESHY_LOCATION` / `MEESHY_CONTACT` /
    /// `MEESHY_INVITE` quand le message en porte le détail, la catégorie de
    /// base sinon. Dérivée par l'extension elle-même plutôt que lue sur
    /// `aps.category` : un gateway plus ancien ne la pose pas.
    static func refinedCategory(
        _ base: String,
        type: String,
        userInfo: [AnyHashable: Any],
        declared: String? = nil
    ) -> String {
        guard base == "MEESHY_MESSAGE", refinableTypes.contains(type),
              !NSEAttachmentPolicy.declaresProtection(userInfo: userInfo) else { return base }
        if let refined = detail(userInfo: userInfo)?.categoryIdentifier { return refined }
        // Une carte de visite SANS nom ne porte aucune clé `data` (#8857) :
        // seule la catégorie posée par la passerelle (`aps.category`) la dit.
        guard let declared, detailCategories.contains(declared) else { return base }
        return declared
    }

    private static let detailCategories: Set<String> = ["MEESHY_LOCATION", "MEESHY_CONTACT", "MEESHY_INVITE"]

    /// La vignette d'une VIDÉO — jamais le fichier : l'enveloppe mémoire de
    /// l'extension ne le supporte pas (#7003). `nil` pour un message protégé.
    static func videoThumbnailURL(userInfo: [AnyHashable: Any]) -> String? {
        guard !NSEAttachmentPolicy.declaresProtection(userInfo: userInfo) else { return nil }
        let mime = (userInfo["attachmentMimeType"] as? String ?? "").lowercased()
        guard mime.hasPrefix("video/"),
              let thumb = (userInfo["thumbnailUrl"] as? String)?.trimmingCharacters(in: .whitespaces),
              !thumb.isEmpty else { return nil }
        return thumb
    }

    /// Le mime qu'annonce l'extension de la vignette : son URL le dit quand
    /// elle le peut, le JPEG sinon (le format des vignettes du serveur).
    static func thumbnailMimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        default: return "image/jpeg"
        }
    }

    /// Le corps détaillé, **seulement** si la passerelle ne l'a pas déjà
    /// composé : corps vide, ou réduit à l'URL brute de l'invitation / du lien.
    static func detailedBody(
        currentBody: String,
        userInfo: [AnyHashable: Any],
        labels: NotificationMessageDetail.Labels
    ) -> String? {
        guard let detail = detail(userInfo: userInfo), detail.shouldReplace(body: currentBody) else { return nil }
        return detail.summary(labels: labels)
    }

    /// Le délai accordé à l'instantané de carte : jamais plus de 8 s, jamais
    /// au-delà du budget restant de l'extension moins une seconde de marge, et
    /// `nil` quand il ne reste pas de quoi le tenter — la bannière part alors
    /// avec son texte, ce qui vaut mieux qu'une extension tuée.
    static func snapshotTimeout(budgetRemaining: TimeInterval, minimum: TimeInterval) -> TimeInterval? {
        let usable = min(8, budgetRemaining - 1)
        return usable >= minimum ? usable : nil
    }
}
