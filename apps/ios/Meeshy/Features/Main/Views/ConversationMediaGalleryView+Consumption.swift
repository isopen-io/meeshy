import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - #7362 — l'ouverture d'une image DEPUIS LA GALERIE remonte sa consommation
//
// `ImageViewerView` (MeeshyUI) sait déjà reporter "viewed" à l'apparition /
// disparition d'un plein écran — mais ce chemin est MORT en pratique : une
// image de message réel route par `visualAttachments` (BubbleStandardLayout),
// jamais par `BubbleAttachmentView.case .image` qui monte `ImageViewerView`.
// Le chemin RÉEL est `ConversationMediaGalleryView`, qui ne reportait rien.
//
// Les galeries POST / COMMENTAIRE (`SocialMediaGalleryPresentation`,
// `CommentMediaView`) réemploient la vue, mais leurs pièces ne vivent PAS dans
// `MessageAttachment` côté serveur : `POST /attachments/:id/status`
// (`services/gateway/src/routes/messages-writes.ts:588`) ne connaît que
// `prisma.messageAttachment` et y rendrait un 404. Elles passent
// `reportsAttachmentConsumption: false`.

nonisolated enum GalleryImageOpenReport {

    /// Même seuil que le chemin mort qu'elle remplace
    /// (`ImageViewerView.reportImageViewed`, 500 ms) — un feuilletage rapide
    /// ne doit pas compter chaque vignette croisée comme une ouverture.
    static let minimumViewMs = 500

    struct Report: Equatable {
        let attachmentId: String
        let durationMs: Int

        /// `viewed` : l'action que `markImageAsViewed` compte (`viewCount`,
        /// `viewedAt`), lue par l'onglet « Ouvert » (`MessageViewsConsumption`).
        var body: AttachmentStatusBody {
            AttachmentStatusBody(action: "viewed", playPositionMs: 0, durationMs: durationMs, complete: true)
        }
    }

    /// - Parameters:
    ///   - isMine: `nil` quand la propriété est inconnue (carte absente) — on
    ///     ne reporte alors RIEN, par prudence, jamais par défaut.
    ///   - viewStart: l'instant où cette page est devenue active. `nil` ⇒
    ///     jamais armée, rien à reporter.
    static func report(
        for attachment: MessageAttachment?,
        isMine: Bool?,
        viewStart: Date?,
        now: Date
    ) -> Report? {
        guard let attachment, attachment.type == .image else { return nil }
        guard isMine == false else { return nil }
        guard let viewStart else { return nil }
        let ms = Int(now.timeIntervalSince(viewStart) * 1000)
        guard ms >= minimumViewMs else { return nil }
        return Report(attachmentId: attachment.id, durationMs: ms)
    }
}

/// Le visionnage de la galerie comme une suite de PASSAGES de page : ouvrir
/// (`leaving: nil`), glisser (`leaving: A, entering: B`), fermer
/// (`entering: nil`). Chaque passage rend le rapport de la page QUITTÉE — le
/// seul moment où son temps de visionnage est connu en entier — et arme la
/// suivante. Valeur pure : la vue la tient en `@State`, le témoin la rejoue.
nonisolated struct GalleryImageViewSession: Equatable {
    private(set) var armedAt: Date?

    mutating func move(
        leaving: MessageAttachment?,
        leavingIsMine: Bool?,
        entering: MessageAttachment?,
        reportsConsumption: Bool,
        now: Date
    ) -> GalleryImageOpenReport.Report? {
        guard reportsConsumption else {
            armedAt = nil
            return nil
        }
        let report = GalleryImageOpenReport.report(for: leaving, isMine: leavingIsMine, viewStart: armedAt, now: now)
        armedAt = entering?.type == .image ? now : nil
        return report
    }
}

extension ConversationMediaGalleryView {

    /// Appelé à l'apparition, à chaque changement de page et à la fermeture.
    func trackImageOpen(leaving oldID: String?, entering newID: String?) {
        let leaving = oldID.flatMap { indexByID[$0] }.map { allAttachments[$0] }
        let entering = newID.flatMap { indexByID[$0] }.map { allAttachments[$0] }
        guard let report = imageViewSession.move(
            leaving: leaving,
            leavingIsMine: leaving.flatMap { senderInfoMap[$0.id]?.isMe },
            entering: entering,
            reportsConsumption: reportsAttachmentConsumption,
            now: Date()
        ) else { return }
        AttachmentStatusReporter.report(attachmentId: report.attachmentId, body: report.body)
    }
}
