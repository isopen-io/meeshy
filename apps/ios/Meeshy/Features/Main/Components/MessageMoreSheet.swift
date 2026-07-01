import SwiftUI
import MeeshySDK
import MeeshyUI

/// Feuille « Plus… » native — NavigationStack + List à sections.
/// Réutilise les vues MessageDetail comme destinations. 100 % design système.
struct MessageMoreSheet: View {
    let message: Message
    let contactColor: String
    let conversationId: String
    let sections: [MoreSection]
    var initialItem: MoreItem? = nil
    var textTranslations: [MessageTranslation] = []
    var transcription: MessageTranscription? = nil
    var translatedAudios: [MessageTranslatedAudio] = []
    var editRevisions: [EditRevision] = []
    var onReply: (() -> Void)? = nil
    var onForward: (() -> Void)? = nil
    var onThread: (() -> Void)? = nil
    var onDeleteMedia: (() -> Void)? = nil
    var onSelectTranslation: ((MessageTranslation?) -> Void)? = nil
    var onSelectAudioLanguage: ((String?) -> Void)? = nil
    var onReport: ((String, String?) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @State private var path: [MoreItem] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                ForEach(Array(sections.enumerated()), id: \.offset) { _, section in
                    sectionView(for: section)
                }
            }
            .navigationTitle(String(localized: "message-more.title", defaultValue: "Options", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: MoreItem.self) { destination(for: $0) }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { if let initialItem { path = [initialItem] } }
    }

    @ViewBuilder
    private func sectionView(for section: MoreSection) -> some View {
        switch section {
        case .actions(let items):
            Section(String(localized: "message-more.section.actions", defaultValue: "Actions", bundle: .main)) {
                ForEach(items, id: \.self) { actionRow($0) }
            }
        case .info(let items):
            Section(String(localized: "message-more.section.info", defaultValue: "Infos & Prisme", bundle: .main)) {
                ForEach(items, id: \.self) { navRow($0) }
            }
        case .moderation(let items):
            Section(String(localized: "message-more.section.moderation", defaultValue: "Modération", bundle: .main)) {
                ForEach(items, id: \.self) { navRow($0) }
            }
        }
    }

    /// Actions immédiates (fire-and-forget) — ferment le sheet.
    private func actionRow(_ item: MoreItem) -> some View {
        Button {
            HapticFeedback.medium()
            switch item {
            case .reply: onReply?()
            case .forward: onForward?()
            case .thread: onThread?()
            case .deleteMedia: onDeleteMedia?()
            default: break
            }
            dismiss()
        } label: {
            Label(labelText(item), systemImage: symbol(item))
        }
    }

    /// Explorations — poussent une destination via NavigationLink de valeur.
    private func navRow(_ item: MoreItem) -> some View {
        NavigationLink(value: item) {
            Label(labelText(item), systemImage: symbol(item))
        }
    }

    @ViewBuilder
    private func destination(for item: MoreItem) -> some View {
        switch item {
        case .language:
            MessageLanguageDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                textTranslations: textTranslations, transcription: transcription, translatedAudios: translatedAudios,
                onSelectTranslation: onSelectTranslation, onSelectAudioLanguage: onSelectAudioLanguage)
                .navigationTitle(labelText(.language))
                .navigationBarTitleDisplayMode(.inline)
        case .views:
            MessageViewsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
                .navigationTitle(labelText(.views))
                .navigationBarTitleDisplayMode(.inline)
        case .reactions:
            MessageReactionsDetailView(message: message, contactColor: contactColor, conversationId: conversationId)
                .navigationTitle(labelText(.reactions))
                .navigationBarTitleDisplayMode(.inline)
        case .transcription:
            MessageTranscriptionDetailView(message: message, contactColor: contactColor, conversationId: conversationId,
                transcription: transcription, translatedAudios: translatedAudios, onSelectAudioLanguage: onSelectAudioLanguage)
                .navigationTitle(labelText(.transcription))
                .navigationBarTitleDisplayMode(.inline)
        case .sentiment:
            MessageDetailSentimentTab(content: message.content, isDark: colorScheme == .dark).equatable()
                .navigationTitle(labelText(.sentiment))
                .navigationBarTitleDisplayMode(.inline)
        case .history:
            MessageEditsDetailView(message: message, editRevisions: editRevisions)
                .navigationTitle(labelText(.history))
                .navigationBarTitleDisplayMode(.inline)
        case .report:
            MessageReportDetailView(message: message, onReport: { onReport?($0, $1); dismiss() }, onDismiss: { dismiss() })
                .navigationTitle(labelText(.report))
                .navigationBarTitleDisplayMode(.inline)
        case .reply, .forward, .thread, .deleteMedia:
            EmptyView()
        }
    }

    private func symbol(_ item: MoreItem) -> String {
        switch item {
        case .reply: return "arrowshape.turn.up.left"
        case .forward: return "arrowshape.turn.up.right"
        case .thread: return "bubble.left.and.bubble.right"
        case .deleteMedia: return "paperclip.badge.ellipsis"
        case .language: return "globe"
        case .views: return "eye"
        case .reactions: return "face.smiling"
        case .transcription: return "waveform"
        case .sentiment: return "brain.head.profile"
        case .history: return "clock.arrow.circlepath"
        case .report: return "exclamationmark.triangle"
        }
    }

    private func labelText(_ item: MoreItem) -> String {
        switch item {
        case .reply: return String(localized: "action.reply", defaultValue: "Répondre", bundle: .main)
        case .forward: return String(localized: "message-detail.tab.forward", defaultValue: "Transférer", bundle: .main)
        case .thread: return String(localized: "action.thread", defaultValue: "Discussion", bundle: .main)
        case .deleteMedia: return String(localized: "action.delete_media", defaultValue: "Supprimer le média", bundle: .main)
        case .language: return String(localized: "message-detail.tab.language", defaultValue: "Langue", bundle: .main)
        case .views: return String(localized: "message-detail.tab.views", defaultValue: "Qui a vu", bundle: .main)
        case .reactions: return String(localized: "message-detail.tab.reactions", defaultValue: "Réactions", bundle: .main)
        case .transcription: return String(localized: "message-detail.tab.transcription", defaultValue: "Transcription", bundle: .main)
        case .sentiment: return String(localized: "message-detail.tab.sentiment", defaultValue: "Sentiment", bundle: .main)
        case .history: return String(localized: "message-detail.tab.history", defaultValue: "Historique", bundle: .main)
        case .report: return String(localized: "message-detail.tab.report", defaultValue: "Signaler", bundle: .main)
        }
    }
}
