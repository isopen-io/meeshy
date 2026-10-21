import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les feuilles d'un message : « Plus… », détail d'appel, réaction, partage, fil
//
// Extrait de `ConversationView.swift` (cohésion). Cinq feuilles, une seule
// source de présentation (`ConversationOverlayState`) et un seul message visé :
// elles se lisent d'un tenant. Ce que la feuille « Plus… » DÉCLENCHE hors de
// son périmètre (citer, éditer, supprimer, exporter, armer la sélection) reste
// à l'hôte et lui est remis par `ConversationMessageActions` — la
// citation en particulier se compose chez lui (`triggerReply`), une seconde
// écriture divergerait de la bannière du composer.

/// Les gestes que les menus d'un message (feuilles et overlay d'appui long)
/// rendent à la conversation.
struct ConversationMessageActions {
    let reply: (Message) -> Void
    let beginSelection: (String) -> Void
    let deleteMedia: (Message) -> Void
    let requestDelete: (String) -> Void
    let edit: (Message) -> Void
    let export: (Message, Bool) -> Void
    let compose: (Message) -> Void
}

struct ConversationMessageSheets: ViewModifier {
    @ObservedObject var viewModel: ConversationViewModel
    @Binding var overlayState: ConversationOverlayState
    let conversation: Conversation?
    let accentColor: String
    let isDark: Bool
    let authority: ConversationMenuAuthority
    let mediaSaveCoordinator: MediaSaveCoordinator
    let actions: ConversationMessageActions

    @EnvironmentObject private var statusViewModel: StatusViewModel

    func body(content: Content) -> some View {
        content
            .sheet(item: $overlayState.detailSheetMessage) { msg in
                // #11214 — la fabrique unique : les verdicts de la loi partagée, jamais une règle locale.
                let ctx = MessageMenuContext.make(message: msg, viewModel: viewModel, authority: authority)
                MessageMoreSheet(
                    message: msg,
                    contactColor: conversation?.accentColor ?? MeeshyColors.brandPrimaryHex,
                    conversationId: viewModel.conversationId,
                    sections: MessageActionResolver.moreSections(ctx),
                    initialItem: overlayState.moreSheetInitialItem,
                    textTranslations: viewModel.messageTranslations[msg.id] ?? [],
                    transcription: viewModel.messageTranscriptions[msg.id],
                    translatedAudios: viewModel.messageTranslatedAudios[msg.id] ?? [],
                    editRevisions: viewModel.editRevisions(for: msg.id),
                    onReply: { actions.reply(msg) },
                    // #4021 — transférer ARME la sélection multiple au lieu
                    // d'ouvrir directement le picker pour ce seul message :
                    // l'utilisateur peut revenir cocher d'autres messages, ou
                    // transférer juste celui-ci via le bouton de la barre de
                    // sélection (qui, lui, ouvre réellement le picker).
                    onForward: { actions.beginSelection(msg.id) },
                    onThread: {
                        overlayState.replyThreadParentId = msg.id
                        overlayState.showReplyThread = true
                    },
                    onSaveMedia: { if MessageExitTransport.save(msg, through: mediaSaveCoordinator) { HapticFeedback.light() } },
                    onDeleteMedia: { actions.deleteMedia(msg) },
                    onPin: { Task { await viewModel.togglePin(messageId: msg.id) }; HapticFeedback.medium() },
                    onToggleStar: {
                        _ = viewModel.toggleStar(messageId: msg.id, conversationName: conversation?.name, conversationAccentColor: accentColor)
                    },
                    onToggleStickerFavorite: {
                        MessageStickerFavorite.toggle(for: msg.sticker)
                        HapticFeedback.light()
                    },
                    onDeleteMessage: { actions.requestDelete(msg.id) },
                    onEdit: { actions.edit(msg) },
                    onCopy: {
                        guard MessageExitTransport.copyDisplayed(msg, in: viewModel) else { return }
                        HapticFeedback.success()
                    },
                    onShare: { if MessageExitTransport.mayShare(msg) { overlayState.shareMessage = msg } }, onImagine: { actions.export(msg, false) },
                    onReact: { emoji in viewModel.toggleReaction(messageId: msg.id, emoji: emoji) },
                    onSelectTranslation: { translation in
                        viewModel.setActiveTranslation(for: msg.id, translation: translation)
                    },
                    onSelectAudioLanguage: { langCode in
                        viewModel.setActiveAudioLanguage(for: msg.id, language: langCode)
                    },
                    onReport: { type, reason in
                        Task {
                            let success = await viewModel.reportMessage(messageId: msg.id, reportType: type, reason: reason)
                            if success { HapticFeedback.success() }
                            else { HapticFeedback.error() }
                        }
                    },
                    translatingTextLanguages: viewModel.translatingTextLanguages[msg.id] ?? [],
                    translatingAudioLanguages: viewModel.translatingAudioLanguages[msg.id] ?? [],
                    translationRequestFailedPublisher: viewModel.translationRequestFailed.eraseToAnyPublisher(),
                    onRequestTextTranslation: { targetLang, sourceLang in
                        Task {
                            await viewModel.requestTextTranslation(
                                messageId: msg.id, content: msg.content,
                                sourceLanguage: sourceLang, targetLanguage: targetLang,
                                conversationEncryptionMode: authority.conversation.encryptionMode
                            )
                        }
                    },
                    onRequestAudioTranslation: { targetLang, attachmentId in
                        Task {
                            await viewModel.requestAudioTranslation(
                                messageId: msg.id, attachmentId: attachmentId,
                                sourceLanguage: msg.originalLanguage, targetLanguage: targetLang,
                                conversationEncryptionMode: authority.conversation.encryptionMode
                            )
                        }
                    },
                    serverFeaturesAbsent: ctx.serverFeaturesAbsent
                )
            }
            .sheet(item: $overlayState.callDetailMessage) { msg in
                if let summary = msg.callSummary {
                    CallSummaryDetailSheet(
                        summary: summary,
                        isOutgoing: summary.initiatorId == viewModel.currentUserIdForView,
                        accentHex: accentColor,
                        timestamp: msg.createdAt,
                        onCallBack: { s in viewModel.callBack(for: s) }
                    )
                }
            }
            .sheet(item: $overlayState.fullReactionPickerMessage) { msg in
                // Picker CATÉGORISÉ (Reactions/Visages/Gestes/Cœurs/Animaux/Objets),
                // titre « Reactions », SANS Close ni recherche, chrome Liquid Glass —
                // le « + » de la barre de réactions ouvre ce picker, pas le clavier
                // emoji standard.
                CategorizedEmojiPickerSheet(
                    style: isDark ? .dark : .light,
                    onReact: { emoji in
                        viewModel.toggleReaction(messageId: msg.id, emoji: emoji)
                        overlayState.fullReactionPickerMessage = nil
                    }
                )
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
            }
            .sheet(item: $overlayState.shareMessage) { msg in
                ShareSheet(activityItems: [viewModel.preferredTranslation(for: msg.id)?.translatedContent ?? msg.content])
                    .presentationDetents([.medium, .large])
            }
            .sheet(isPresented: $overlayState.showReplyThread) {
                if let parentId = overlayState.replyThreadParentId,
                   let parent = viewModel.messages.first(where: { $0.id == parentId }) {
                    ThreadView(parentMessage: parent, conversationId: viewModel.conversationId)
                        .environmentObject(statusViewModel)
                }
            }
    }
}
