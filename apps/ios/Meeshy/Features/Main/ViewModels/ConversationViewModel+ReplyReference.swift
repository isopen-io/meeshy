import Foundation
import Combine
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Extrait de `ConversationViewModel.swift` (#4942, D-MAINT-01), qui portait
// 4 832 lignes — quatre fois le plafond DUR de 1 200 de la directive
// 2026-09-02, que `FileSizeBudgetGuardTests` mesure et qui interdit d'AJOUTER
// à un fichier hors budget. Un chantier de fluidité qui doit toucher le
// chargement, l'envoi et l'observation du magasin ne pouvait pas commencer
// avant : on extrait d'abord, on ajoute ensuite. Le découpage suit une
// RESPONSABILITÉ, jamais une tranche de lignes.
//
// `private` est de portée FICHIER en Swift : les membres de l'hôte que cette
// extension consomme se sont élargis en interne par la découpe, pas par un
// choix de visibilité. Les propriétés STOCKÉES restent chez l'hôte — une
// extension ne peut pas en déclarer.
//
// Responsabilité tenue ici : composer la CITATION OPTIMISTE — celle que porte
// la bulle avant l'écho serveur (les deux chemins d'envoi, texte seul et avec
// pièces jointes) ET la bannière de réponse du composeur (`triggerReply`,
// `ConversationView+MessageRow`). Fabrique UNIQUE, `optimisticReplyReference
// (quoting:)` : les deux producteurs recopiaient chacun trois champs pauvres
// et divergeaient au premier champ ajouté (#4945). Sans miniature ThumbHash,
// sans dimensions ni durée, en langue d'ORIGINE, la citation naissait plate
// puis « sautait » à l'écho serveur, qui la servait riche.

extension ConversationViewModel {

    // MARK: - Reply Reference (citation de la bulle optimiste)

    /// Construit le `ReplyReference` riche destiné à la bulle optimiste à
    /// partir d'un `replyToId` (message normal) ou d'un `storyReplyReference`
    /// pré-fourni (story reply). Single source of truth pour les deux chemins
    /// d'envoi : texte-seul (sendMessage) et avec attachements
    /// (insertOptimisticMediaMessage).
    ///
    /// L'absence de cette helper laissait `replyToJson` à nil dans le chemin
    /// avec attachements, ce qui faisait que la quoted-reply card n'apparaissait
    /// jamais dans la bulle optimiste pour les replies audio/video/image/galerie.
    ///
    /// `citingAttachmentId` — l'ANCRE que l'envoi porte (#6165). La bulle
    /// optimiste doit citer la MÊME pièce que le corps REST, sans quoi elle
    /// montrerait la première photo du carrousel jusqu'à l'écho serveur, puis
    /// « sauterait » sur la troisième : le saut de citation que #4945 a
    /// justement fermé, rouvert par un autre bout.
    func makeReplyReference(
        storyReplyReference: ReplyReference?,
        replyToId: String?,
        citingAttachmentId: String? = nil
    ) -> ReplyReference? {
        if let storyRef = storyReplyReference {
            return storyRef
        }
        guard let rid = replyToId,
              let quoted = messages.first(where: { $0.id == rid }) else {
            return nil
        }
        let named = citingAttachmentId.flatMap { id in quoted.attachments.first { $0.id == id } }
        return optimisticReplyReference(quoting: quoted, citing: named)
    }

    // MARK: - La fabrique unique

    /// La citation OPTIMISTE d'un message en mémoire : `QuotedReferenceFactory` la compose, ce site lui
    /// fournit le texte que la bulle rend (Prisme du lecteur, bascule manuelle comprise).
    func optimisticReplyReference(quoting quoted: Message,
                                  citing named: MessageAttachment? = nil) -> ReplyReference {
        QuotedReferenceFactory.reference(
            quoting: quoted, citing: named,
            servedText: { self.preferredTranslation(for: quoted.id)?.translatedContent }
        )
    }
}
