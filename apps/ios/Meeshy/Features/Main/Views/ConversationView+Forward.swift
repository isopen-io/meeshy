import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Transférer » : la feuille et ses portes (extrait de ConversationView, #9039)

extension ConversationView {

    /// La feuille de transfert, montée par `.sheet(item: $composerState.forwardMessage)`.
    func forwardPicker(for msgToForward: Message) -> some View {
        ForwardPickerSheet(
            message: msgToForward,
            additionalMessages: composerState.forwardAdditionalMessages,
            sourceConversationId: conversation?.id ?? "",
            accentColor: accentColor,
            onOpenConversation: { router.navigateToConversation($0) },
            // Loi 6 — SECOND point d'entrée du MÊME chemin, jamais une
            // dixième porte : la feuille se referme et rend la main,
            // l'hôte pose le même état que l'appui long. Elle ne monte
            // pas le meuble, ce qui en ferait un second contrat d'envoi.
            onCompose: { composerState.pendingComposeTarget = ComposerSeedTarget(message: msgToForward) },
            onImageDiscussion: { beginDiscussionExport(endingAt: msgToForward) },
            onDismiss: { composerState.forwardMessage = nil }
        )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            // ForwardPickerSheet reads `@EnvironmentObject StatusViewModel`
            // internally — .sheet does not reliably inherit the parent's
            // environment across this boundary (documented crash pattern,
            // see docs/lessons on @EnvironmentObject-across-sheet).
            .environmentObject(statusViewModel)
    }

    /// **« Imager la discussion »** (#9039) : la discussion chargée jusqu'au
    /// message choisi, dans les mots que le lecteur lit, ouvre l'atelier
    /// « Imagine » — qui la partage en IMAGE (#9038).
    func beginDiscussionExport(endingAt message: Message) {
        let user = AuthManager.shared.currentUser
        guard let request = MessageCardDiscussion.request(
            messages: viewModel.messages,
            endingAt: message.id,
            servedText: { viewModel.preferredTranslation(for: $0.id)?.translatedContent },
            viewer: MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName, username: user?.username),
            handle: user?.username,
            conversationTitle: conversation?.title,
            accentColor: accentColor
        ) else {
            FeedbackToastManager.shared.showError(
                String(localized: "export.announce.failed", defaultValue: "Impossible de créer l’image", bundle: .main)
            )
            return
        }
        MessageCardExportPresenter.present(request)
    }
}
