import SwiftUI
import MeeshySDK

// **Ce que l'APP branche sur l'écran de partage unique** (#10947). Ce fichier
// n'est compilé QUE dans l'app : l'extension de partage fournit ses propres
// sources, son propre envoi et son propre pont (`MeeshyShareExtension/`).

extension ShareSheetViewModel {
    /// L'écran monté par l'app : ses caches nommés, ses services, sa présence.
    convenience init(subject: ShareSubject) {
        self.init(
            subject: subject,
            directory: LiveShareRecipientDirectory(),
            dispatcher: LiveShareDispatcher(),
            currentUserId: { AuthManager.shared.currentUser?.id ?? "" },
            presence: { PresenceManager.shared.presenceState(for: $0) },
            composableAttachment: { ComposableAttachment.target(in: $0) }
        )
    }
}

extension ShareSheetView {
    init(
        subject: ShareSubject,
        accentColor: String = "6366F1",
        actions: ShareSheetHostActions = ShareSheetHostActions(),
        onDismiss: @escaping () -> Void
    ) {
        self.init(model: ShareSheetViewModel(subject: subject), accentColor: accentColor, actions: actions, onDismiss: onDismiss)
    }
}

/// Le retour d'un geste de l'écran, dans l'app : le toast LOCAL de feedback
/// (`FeedbackToastManager`, jamais celui des alertes réseau).
enum ShareSheetHostBridge {
    @MainActor
    static func announce(_ title: String, open: (() -> Void)?) {
        if let open {
            FeedbackToastManager.shared.show(title, type: .success, tapAction: open)
        } else {
            FeedbackToastManager.shared.showSuccess(title)
        }
    }

    static var imagerLabel: String { MessageCardDiscussion.menuLabel }
    static var imagerSymbol: String { MessageCardExportMenu.imageSymbol }
}
