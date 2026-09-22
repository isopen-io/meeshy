import Foundation
import MeeshySDK

// MARK: - #7362 — l'ouverture d'une image DEPUIS LA GALERIE remonte sa consommation
//
// `ImageViewerView` (MeeshyUI) sait déjà reporter "viewed" à l'apparition /
// disparition d'un plein écran — mais ce chemin est MORT en pratique : une
// image de message réel route par `visualAttachments` (BubbleStandardLayout),
// jamais par `BubbleAttachmentView.case .image` qui monte `ImageViewerView`.
// Le chemin RÉEL est `ConversationMediaGalleryView`, qui ne reportait rien.
//
// Règle pure, sans dépendance SwiftUI — même forme que `VideoDismissWatchReport`
// (MeeshyUI/Media/VideoDismissWatchReport.swift) : `ConversationMediaGalleryView`
// lui pose la question en quittant une page (`handlePageChange`) et à sa
// fermeture (`.onDisappear`), jamais l'inverse.
nonisolated enum GalleryImageOpenReport {

    /// Même seuil que le chemin mort qu'elle remplace
    /// (`ImageViewerView.reportImageViewed`, 500 ms) — un feuilletage rapide
    /// ne doit pas compter chaque vignette croisée comme une ouverture.
    static let minimumViewMs = 500

    struct Report: Equatable {
        let attachmentId: String
        let durationMs: Int
    }

    /// - Parameters:
    ///   - attachment: la page qu'on QUITTE (ou la dernière vue, à la
    ///     fermeture). `nil` ⇒ rien à reporter.
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
