import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Transférer » : l'écran de partage unique et ses portes (#9039, #10947)

extension ConversationView {

    /// Ce que l'écran de partage reçoit de cette conversation : la pièce choisie
    /// (menu d'une pièce, V2), ou le message et ceux de la sélection multiple
    /// (barre rapide, « Plus… », « Sélectionner », D1).
    func forwardSubject(for message: Message) -> ShareSubject {
        let source = conversation?.id
        let encrypted = conversation?.encryptionMode != nil
        if let pieceId = composerState.forwardPieceId, message.attachments.contains(where: { $0.id == pieceId }) {
            return .piece(message, attachmentId: pieceId, sourceConversationId: source, conversationIsEncrypted: encrypted)
        }
        return .messages([message] + composerState.forwardAdditionalMessages, sourceConversationId: source, conversationIsEncrypted: encrypted)
    }

    /// L'écran de partage, monté par `.sheet(item: $composerState.forwardMessage)`.
    func forwardPicker(for msgToForward: Message) -> some View {
        let pieceId = composerState.forwardPieceId
        return ShareSheetView(
            subject: forwardSubject(for: msgToForward),
            accentColor: accentColor,
            actions: ShareSheetHostActions(
                onOpenConversation: { router.navigateToConversation($0) },
                // Loi 6 — SECOND point d'entrée du MÊME chemin : l'écran se
                // referme et rend la main, l'hôte pose le même état que l'appui long.
                onCompose: ComposableAttachment.offers(message: msgToForward)
                    ? { composerState.pendingComposeTarget = ComposerSeedTarget(message: msgToForward) } : nil,
                // « Imager la discussion » n'est pas rendu quand la discussion n'a
                // rien à peindre — ou cite un contenu protégé (#9573).
                onImageDiscussion: MessageCardDiscussion.offers(messages: viewModel.messages, endingAt: msgToForward.id)
                    ? { beginDiscussionExport(endingAt: msgToForward) } : nil,
                onSave: msgToForward.exitOffer.offers(.save) ? { saveForwarded(msgToForward, piece: pieceId) } : nil
            ),
            onDismiss: {
                composerState.forwardMessage = nil
                composerState.forwardPieceId = nil
            }
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// « Enregistrer » depuis l'écran de partage — la pièce choisie, ou le
    /// message, par la loi de sortie (`MessageExitTransport`).
    private func saveForwarded(_ message: Message, piece pieceId: String?) {
        if MessageExitTransport.save(message, piece: pieceId, through: mediaSaveCoordinator) { HapticFeedback.light() }
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
