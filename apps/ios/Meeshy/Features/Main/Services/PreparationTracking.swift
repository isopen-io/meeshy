import SwiftUI
import MeeshySDK
import MeeshyUI

/// Site UNIQUE : suivre une préparation jusqu'à `.ready` et la promouvoir dans
/// les trois dictionnaires que le pipeline de publication lit.
enum PreparationTracking {
    /// `capturedInApp` : la pièce sort de la caméra de l'application (#9775).
    /// La provenance n'est connue qu'ICI, au moment où la prise rejoint le
    /// message ; elle voyage ensuite sur la pièce jusqu'au téléversement.
    static func track(
        _ prep: PreparingAttachment,
        preparing: Binding<[PreparingAttachment]>,
        attachments: Binding<[MessageAttachment]>,
        mediaFiles: Binding<[String: URL]>,
        thumbnails: Binding<[String: UIImage]>,
        capturedInApp: Bool = false
    ) {
        // La place se réserve À LA SÉLECTION (#9776) : ce qui est déjà dans la
        // zone, prêt ou en préparation, précède cette pièce, quel que soit
        // l'ordre dans lequel les préparations finissent.
        let selectedBefore = Set(attachments.wrappedValue.map(\.id) + preparing.wrappedValue.map(\.id))
        preparing.wrappedValue.append(prep)
        Task { @MainActor [prep] in
            switch await prep.awaitCompletion() {
            case .success(let prepared):
                mediaFiles.wrappedValue[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    thumbnails.wrappedValue[prepared.attachment.id] = thumb
                }
                attachments.wrappedValue = placed(promoted(prepared.attachment, capturedInApp: capturedInApp),
                                                  in: attachments.wrappedValue, selectedBefore: selectedBefore)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparing.wrappedValue.removeAll { $0.id == prep.id }
        }
    }

    /// La pièce prête prend la place que sa sélection lui réservait : juste
    /// après la dernière pièce choisie AVANT elle, donc avant toute pièce
    /// choisie après elle et prête plus tôt. Sélection 3,1,5,2,4 ⇒ zone
    /// 3,1,5,2,4, même si 4 finit le premier.
    nonisolated static func placed(_ ready: MessageAttachment, in zone: [MessageAttachment],
                                   selectedBefore: Set<String>) -> [MessageAttachment] {
        let index = zone.lastIndex { selectedBefore.contains($0.id) }.map { $0 + 1 } ?? 0
        var ordered = zone
        ordered.insert(ready, at: index)
        return ordered
    }

    /// La pièce prête telle qu'elle rejoint le message : une capture le DIT,
    /// rien d'autre ne le déclare à sa place.
    nonisolated static func promoted(_ attachment: MessageAttachment, capturedInApp: Bool) -> MessageAttachment {
        guard capturedInApp else { return attachment }
        var declared = attachment
        declared.capturedInApp = true
        return declared
    }
}
