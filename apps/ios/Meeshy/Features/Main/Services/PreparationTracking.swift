import SwiftUI
import MeeshySDK
import MeeshyUI

/// Site UNIQUE : suivre une préparation jusqu'à `.ready` et la promouvoir dans
/// les trois dictionnaires que le pipeline de publication lit.
enum PreparationTracking {
    static func track(
        _ prep: PreparingAttachment,
        preparing: Binding<[PreparingAttachment]>,
        attachments: Binding<[MessageAttachment]>,
        mediaFiles: Binding<[String: URL]>,
        thumbnails: Binding<[String: UIImage]>
    ) {
        preparing.wrappedValue.append(prep)
        Task { @MainActor [prep] in
            switch await prep.awaitCompletion() {
            case .success(let prepared):
                mediaFiles.wrappedValue[prepared.attachment.id] = prepared.fileURL
                if let thumb = prep.thumbnail {
                    thumbnails.wrappedValue[prepared.attachment.id] = thumb
                }
                attachments.wrappedValue.append(prepared.attachment)
                HapticFeedback.success()
            case .failure(.preparationFailed(let message)):
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(message)
            }
            preparing.wrappedValue.removeAll { $0.id == prep.id }
        }
    }
}
