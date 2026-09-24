import Foundation

/// **Le sceau d'une vue unique** (#7618) — le site UNIQUE où les cinq modes de
/// lecture demandent si un message peut montrer son contenu.
///
/// Une vue unique non ouverte ne laisse rien lire : ni texte, ni légende, ni
/// média, ni libellé accessible qui les contienne. Mesuré en recette staging le
/// 2026-09-23 : la légende d'une photo à vue unique s'affichait en clair sous le
/// voile en Focal, VoiceOver lisait le texte d'une vue unique jamais ouverte
/// dans les trois modes, et le fichier d'un sticker à vue unique se téléchargeait
/// à l'ouverture de la conversation. Un voile posé PAR-DESSUS un contenu monté
/// ne protège que le pixel : le texte reste dans l'arbre d'accessibilité et le
/// média dans la file de téléchargement. Le sceau retire le contenu du rendu.
public extension MeeshyMessage {

    /// Le message porte-t-il une vue unique, au niveau du MESSAGE ou d'une de
    /// ses PIÈCES ? Une photo à vue unique ne pose pas toujours le drapeau du
    /// message : sa légende, elle, est le contenu du message, et se protège
    /// avec la photo.
    var holdsViewOnce: Bool {
        isViewOnce || viewOnceOpenedAt != nil || attachments.contains { $0.isViewOnce }
    }

    /// CE lecteur l'a-t-il déjà ouverte (#7579) ? Permanent, et par personne :
    /// ce que les autres ouvrent n'y change rien.
    var isViewOnceOpened: Bool {
        viewOnceOpenedAt != nil && !isDeleted && messageSource != .system
    }

    /// Le contenu doit-il rester HORS du rendu ? Vrai tant que le lecteur n'a
    /// pas touché le message pour l'ouvrir. Un message supprimé ou un avis
    /// système n'a pas de contenu à sceller.
    var isViewOnceSealed: Bool {
        holdsViewOnce && viewOnceOpenedAt == nil && !isViewOnceRevealed
            && !isDeleted && messageSource != .system
    }

    /// Le média qu'un toucher ouvre en plein écran — une image (sticker
    /// compris) ou une vidéo —, ou `nil` pour une vue unique qui se lit sur
    /// place (texte, lieu, vocal, document).
    var openableViewOnceMedia: MeeshyMessageAttachment? {
        guard holdsViewOnce else { return nil }
        return attachments.first { $0.type == .image || $0.type == .video }
    }

    /// Le message tel qu'un mode de lecture a le DROIT de le voir tant qu'il est
    /// scellé : l'enveloppe (identité, horloge, protection, réactions) sans
    /// rien de ce qu'elle contient. Un message non scellé se rend tel quel.
    ///
    /// Retirer le contenu plutôt que le voiler, c'est ce qui ferme la CLASSE :
    /// un composant qui ne reçoit ni texte, ni pièce, ni sticker, ni lieu ne
    /// peut ni les peindre, ni les dire au lecteur d'écran, ni les télécharger.
    var sealedForDisplay: MeeshyMessage {
        guard isViewOnceSealed || isViewOnceOpened else { return self }
        var sealed = self
        sealed.isViewOnce = true
        sealed.content = ""
        sealed.attachments = []
        sealed.sticker = nil
        sealed.location = nil
        sealed.trackedLinkMap = [:]
        sealed.replyTo = nil
        return sealed
    }

    /// Les drapeaux qui décident du chrome de protection : ceux du message,
    /// complétés par la vue unique d'une pièce.
    var protectionFlags: MessageEffectFlags {
        guard !effects.flags.contains(.viewOnce), attachments.contains(where: { $0.isViewOnce }) else {
            return effects.flags
        }
        return effects.flags.union(.viewOnce)
    }
}
