import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « Imager » un message (#8692, ex « Exporter en image »)

extension ConversationView {

    /// Ouvre l'atelier « Imagine » sur le message tel que le lecteur le lit —
    /// la traduction servie par le Prisme, ou l'original, et ses médias — plus
    /// ceux du message cité quand il est en mémoire (#8901).
    /// `quick` applique le format par défaut et enregistre dès que la carte
    /// est peinte.
    func beginMessageExport(_ message: Message, quick: Bool) {
        let translations = Dictionary(
            (viewModel.messageTranslations[message.id] ?? []).map { ($0.targetLanguage.lowercased(), $0.translatedContent) },
            uniquingKeysWith: { first, _ in first }
        )
        let served = viewModel.preferredTranslation(for: message.id)?.translatedContent
        let user = AuthManager.shared.currentUser
        let viewer = MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName, username: user?.username)
        let quotedMessage = message.replyTo.flatMap { reference in viewModel.messages.first { $0.id == reference.messageId } }
        let quotedAt = quotedMessage?.createdAt
        guard let subject = MessageCardSubject.of(
            message: message, servedText: served, translations: translations, viewer: viewer,
            quotedAt: quotedAt, quotedMessage: quotedMessage, now: Date()
        ) else {
            FeedbackToastManager.shared.showError(
                String(localized: "export.announce.failed", defaultValue: "Impossible de créer l’image", bundle: .main)
            )
            return
        }
        MessageCardExportPresenter.present(MessageCardExportRequest(
            subject: subject,
            languages: MessageCardSubject.languages(of: message, translations: translations),
            subjectIn: { language in
                MessageCardSubject.of(
                    message: message, servedText: served, translations: translations,
                    viewer: viewer, language: language, quotedAt: quotedAt, quotedMessage: quotedMessage, now: Date()
                )
            },
            handle: user?.username,
            conversationTitle: conversation?.title,
            accentColor: accentColor,
            quick: quick
        ))
    }
}
