import Foundation
import Combine
import UIKit
import GRDB
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes, et ne change AUCUN
// comportement — les corps sont déplacés à l'identique.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : composer la CITATION que porte la bulle optimiste,
// pour les deux chemins d'envoi (texte seul et avec pièces jointes). Site
// unique : sans lui, `replyToJson` restait nil sur le chemin média et la carte
// de citation n'apparaissait jamais avant l'écho serveur. La protection du
// média cité y est reportée depuis la mémoire (`attachmentIsProtected`) — une
// réponse à un média à vue unique ne montre pas sa vignette en attendant.

extension ConversationViewModel {

    // MARK: - Reply Reference (citation de la bulle optimiste)

    /// Construit le `ReplyReference` riche destine a la bulle optimiste a
    /// partir d'un `replyToId` (message normal) ou d'un `storyReplyReference`
    /// pre-fourni (story reply). Single source of truth pour les deux chemins
    /// d'envoi : texte-seul (sendMessage) et avec attachements
    /// (insertOptimisticMediaMessage).
    ///
    /// L'absence de cette helper laissait `replyToJson` a nil dans le chemin
    /// avec attachements, ce qui faisait que la quoted-reply card n'apparaissait
    /// jamais dans la bulle optimiste pour les replies audio/video/image/galerie.
    func makeReplyReference(
        storyReplyReference: ReplyReference?,
        replyToId: String?
    ) -> ReplyReference? {
        if let storyRef = storyReplyReference {
            return storyRef
        }
        guard let rid = replyToId,
              let quoted = messages.first(where: { $0.id == rid }) else {
            return nil
        }
        // Média REPRÉSENTATIF (premier hors localisation) — la MÊME règle que
        // l'ouverture `openQuotedMedia`, pour que l'icône optimiste désigne la
        // pièce jointe que le plein écran ouvrira, et que l'étiquette d'aperçu
        // décrive ce média plutôt qu'une localisation qui le précéderait
        // (2026-08-27).
        let representative = quoted.attachments.quotedRepresentative
        let previewText: String = {
            if !quoted.content.isEmpty { return quoted.content }
            if let first = representative {
                return MediaKindLabel.summary(MediaKindLabel.kind(for: first.type))
            }
            return ""
        }()
        return ReplyReference(
            messageId: rid,
            authorName: quoted.senderName ?? String(localized: "common.unknown_user", defaultValue: "Utilisateur", bundle: .main),
            previewText: previewText,
            isMe: quoted.isMe,
            authorColor: quoted.senderColor,
            // Bulle OPTIMISTE : le message cite est deja en memoire, son avatar
            // avec. Sans ce report, la citation optimiste s'affichait en
            // initiales puis « sautait » a la photo au premier refresh serveur.
            authorAvatarUrl: quoted.senderAvatarURL,
            attachmentType: representative?.type.rawValue,
            attachmentThumbnailUrl: representative?.thumbnailUrl,
            // Le message cite est en memoire : sa protection est CONNUE, pas
            // declaree par le fil. Sans ce report, la bulle optimiste d'une
            // reponse a un media a vue unique en montrait la vignette le temps
            // que le serveur accuse.
            attachmentIsProtected: representative.map { $0.isViewOnce || $0.isBlurred }
        )
    }
}
