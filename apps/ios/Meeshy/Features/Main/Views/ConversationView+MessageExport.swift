import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Exporter un message en image

extension ConversationView {

    /// Ouvre la carte d'export du message tel que le lecteur le lit — la
    /// traduction servie par le Prisme, ou l'original. `quick` applique le
    /// format par défaut et enregistre dès que la carte est peinte.
    func beginMessageExport(_ message: Message, quick: Bool) {
        let translations = Dictionary(
            (viewModel.messageTranslations[message.id] ?? []).map { ($0.targetLanguage.lowercased(), $0.translatedContent) },
            uniquingKeysWith: { first, _ in first }
        )
        let served = viewModel.preferredTranslation(for: message.id)?.translatedContent
        let user = AuthManager.shared.currentUser
        let viewer = MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName)
        guard let subject = MessageCardSubject.of(
            message: message, servedText: served, translations: translations, viewer: viewer, now: Date()
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
                    viewer: viewer, language: language, now: Date()
                )
            },
            handle: user?.username,
            conversationTitle: conversation?.title,
            accentHex: accentColor,
            quick: quick
        ))
    }
}
