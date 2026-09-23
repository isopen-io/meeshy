import Foundation

/// **Ce que l'extension de notification a le DROIT d'attacher.**
///
/// ## Le défaut qui la fait naître (2026-09-18, #7003)
///
/// La NSE téléchargeait le média du message par `URLSession.dataTask` — tout le
/// corps en mémoire, sans plafond ni lecture de `Content-Length` — pendant que
/// le gateway posait `firstAttachmentUrl` pour **tout type** de pièce jointe,
/// `video/*` compris (`messageNotificationFanOut.ts`, `fileHints` acceptant
/// `video/mp4`). Une extension de notification dispose d'environ **24 Mo**
/// d'enveloppe mémoire : un message vidéo de 40 Mo la faisait dépasser, et iOS
/// la tuait par jetsam.
///
/// > **Ce défaut est INVISIBLE en production.** Un jetsam n'est pas un crash :
/// > il ne produit aucun rapport, aucune trace, aucune alerte. L'utilisateur
/// > voit seulement une bannière sans enrichissement — exactement ce qu'il
/// > verrait si le réseau avait été lent. Rien ne le distingue d'un
/// > fonctionnement normal, et c'est ce qui l'a laissé vivre.
///
/// Quatre à cinq téléchargements concurrents s'additionnent en plus dans la
/// même enveloppe (`NSEDataSync`), donc le plafond ne se raisonne pas par
/// fichier : il se raisonne par **ce qu'on accepte de faire entrer**.
///
/// ## Deux étages, et c'est voulu
///
/// | étage | ce qu'il regarde | ce qu'il évite |
/// |---|---|---|
/// | PRÉ-VOL | le mime et la taille DÉCLARÉS sur le fil | la requête réseau elle-même |
/// | APRÈS-VOL | la taille MESURÉE du fichier téléchargé | l'attachement d'un fichier plus gros qu'annoncé |
///
/// Le pré-vol seul ne suffirait pas : une taille peut manquer sur le fil (un
/// gateway plus ancien que l'app, un média servi par un chemin qui ne la
/// connaît pas), et un serveur n'est jamais tenu par ce qu'il annonce. Le
/// second étage est sûr parce que le téléchargement écrit **sur disque**
/// (`downloadTask`), jamais en mémoire : mesurer un fichier de 40 Mo ne coûte
/// rien, le refuser non plus.
///
/// ## Pourquoi images et audio SEULEMENT
///
/// Ce sont les deux familles dont iOS rend quelque chose d'utile sur l'écran
/// verrouillé — l'aperçu et la forme d'onde avec bouton de lecture. Une vidéo
/// n'y gagne qu'une vignette, pour laquelle il faudrait faire descendre le
/// fichier ENTIER ; un document n'y gagne rien du tout. Le message vidéo
/// arrive donc avec sa bannière texte, sans vignette et sans jetsam — c'est le
/// bon compromis, pas une dégradation subie.
///
/// ## Pourquoi une règle PURE
///
/// Une extension de notification ne se teste pas : elle n'a ni hôte de test, ni
/// moyen de recevoir un push en CI. Sortir la décision la rend éprouvable, et
/// le CÂBLAGE se garde à la source (`NSEAttachmentPolicyTests`) — même
/// doctrine que `CameraRecordingReadiness` (#6984) et
/// `AudioTapFormatReadiness` (#7002). Ce fichier n'importe QUE Foundation : il
/// est compilé dans l'extension ET dans l'app, c'est ce qui le met à portée de
/// `MeeshyTests` (cf. `project.yml`).
nonisolated enum NSEAttachmentPolicy {

    /// 8 Mio, soit le tiers de l'enveloppe de 24 Mo — de quoi laisser tenir
    /// côte à côte l'avatar, la pièce jointe et le travail de l'extension
    /// elle-même. Un plafond plus proche de l'enveloppe ne laisserait aucune
    /// marge aux téléchargements CONCURRENTS, qui s'y additionnent.
    static let maxAttachmentBytes = 8 * 1024 * 1024

    /// `fileSize == nil` : la taille n'est pas sur le fil (gateway plus ancien
    /// que l'app, média servi par un chemin qui ne la connaît pas). La famille
    /// suffit alors à décider du PRÉ-VOL — c'est l'étage d'APRÈS-VOL, sur la
    /// taille MESURÉE, qui tient le plafond. Refuser ici priverait de
    /// rich-push toute une flotte pour une information manquante.
    static func mayAttach(mimeType: String, fileSize: Int?) -> Bool {
        guard isRenderableFamily(mimeType) else { return false }
        guard let fileSize else { return true }
        return fileSize > 0 && fileSize <= maxAttachmentBytes
    }

    /// Image ou audio — les deux familles qu'iOS rend nativement sur l'écran
    /// verrouillé. Le paramètre peut porter ses paramètres de type
    /// (`audio/mp4; codecs=mp4a.40.2`) et une casse quelconque : ce qui arrive
    /// ici vient d'une charge réseau, pas d'une constante du dépôt.
    static func isRenderableFamily(_ mimeType: String) -> Bool {
        let tete = mimeType.split(separator: ";", maxSplits: 1,
                                  omittingEmptySubsequences: false).first ?? ""
        let base = String(tete).trimmingCharacters(in: .whitespaces).lowercased()
        return base.hasPrefix("image/") || base.hasPrefix("audio/")
    }

    /// **Ce message DÉCLARE-T-IL une protection de contenu ?** (#7453)
    ///
    /// Le serveur ne pose déjà plus d'URL de média pour un message protégé
    /// (`mediaMayTravel`, cycle 125) : une photo à VUE UNIQUE s'affichait
    /// ENTIÈRE sur l'écran verrouillé sous une bannière qui disait « 👁️ 🖼️ ».
    /// Ce prédicat est le SECOND VERROU, côté client — la leçon 275 du dépôt :
    /// « une protection de contenu se mesure sur tout ce que la charge
    /// TRANSPORTE, jamais sur sa seule chaîne », et un champ de service qui
    /// DÉCLARE une restriction ne la fait pas respecter.
    ///
    /// Deux déclarations, lues ensemble parce qu'aucune n'est garantie :
    /// `effectFlags` porte les bits de cycle de vie (éphémère, flouté, vue
    /// unique) ; `notificationLocKey` est posé par `protectedPreview`, son
    /// unique producteur côté passerelle — sa PRÉSENCE est une déclaration de
    /// protection, jamais un indice.
    static func declaresProtection(userInfo: [AnyHashable: Any]) -> Bool {
        if let key = userInfo["notificationLocKey"] as? String,
           !key.trimmingCharacters(in: .whitespaces).isEmpty {
            return true
        }
        guard let flags = declaredInt(userInfo["effectFlags"]) else { return false }
        return flags & lifecycleFlagsMask != 0
    }

    /// Masque des bits de cycle de vie de `MessageEffectFlags` — éphémère (0),
    /// flouté (1), vue unique (2). Écrit ici plutôt qu'importé : ce fichier ne
    /// dépend que de Foundation, et c'est cette absence de dépendance qui le
    /// met à portée de `MeeshyTests`.
    private static let lifecycleFlagsMask = 0b111

    /// La taille telle qu'elle voyage sur le fil APNs. Le gateway sérialise les
    /// nombres de sa charge `data` en CHAÎNES (cf. `attachmentDurationMs`) ;
    /// une charge de test ou une version future peut porter un nombre. Les deux
    /// formes se lisent ici, à un seul endroit, plutôt que d'être devinées au
    /// site d'appel — une taille mal lue vaut une taille absente, et une taille
    /// absente ouvre le pré-vol.
    static func declaredFileSize(_ raw: Any?) -> Int? { declaredInt(raw) }

    /// Un entier de la charge `data`, qu'il voyage en nombre ou en chaîne.
    /// `declaredFileSize` en est le nom MÉTIER ; `declaresProtection` lit des
    /// drapeaux, pas une taille, et appelle donc celui-ci.
    private static func declaredInt(_ raw: Any?) -> Int? {
        if let number = raw as? NSNumber { return number.intValue }
        guard let text = raw as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return nil }
        return Int(trimmed)
    }
}
