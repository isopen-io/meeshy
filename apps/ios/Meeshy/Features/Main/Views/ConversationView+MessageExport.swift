import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Imager » un message (#8692, ex « Exporter en image »)

extension ConversationView {

    /// Ouvre l'atelier « Imagine » sur le message tel que le lecteur le lit —
    /// la traduction servie par le Prisme, ou l'original, et ses médias — plus
    /// ceux du message cité quand il est en mémoire (#8901). Un vocal part dans
    /// la piste que la bulle fait entendre (#8979).
    /// `quick` applique le format par défaut et enregistre dès que la carte
    /// est peinte.
    func beginMessageExport(_ message: Message, quick: Bool) {
        let user = AuthManager.shared.currentUser
        guard let request = MessageCardExportMenu.request(
            message: message,
            translations: viewModel.messageTranslations[message.id] ?? [],
            servedText: viewModel.preferredTranslation(for: message.id)?.translatedContent,
            viewer: MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName, username: user?.username),
            handle: user?.username,
            quotedMessage: message.replyTo.flatMap { reference in viewModel.messages.first { $0.id == reference.messageId } },
            conversationTitle: conversation?.title,
            accentColor: accentColor,
            quick: quick,
            audioPrism: viewModel.preferredLanguages,
            audioOverride: viewModel.bubbleLanguageSelections[message.id]?.activeDisplayLangCode,
            quotedAudioOverride: message.replyTo.flatMap { viewModel.bubbleLanguageSelections[$0.messageId]?.activeDisplayLangCode }
        ) else {
            FeedbackToastManager.shared.showError(
                String(localized: "export.announce.failed", defaultValue: "Impossible de créer l’image", bundle: .main)
            )
            return
        }
        MessageCardExportPresenter.present(request)
    }
}
