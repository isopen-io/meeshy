// Extrait de BubbleStandardLayout.swift (#10678) : citation, pièces jointes, réactions, fond et média autonome.
// Découpe par responsabilité, sans changement de comportement.

import SwiftUI
import MeeshySDK
import MeeshyUI

extension BubbleStandardLayout {

    // MARK: - Quoted reply

    /// **Vue `3h` (#4098)** — la citation qui QUITTE la bulle, ou `nil`.
    ///
    /// Site UNIQUE de la décision : le `body` s'en sert pour monter la carte,
    /// `bubbleInnerContentBody` pour ne PAS monter la citation plate. Deux
    /// prédicats jumeaux auraient fini par diverger, et la divergence rendrait
    /// la citation deux fois — une fois en scène, une fois aplatie.
    ///
    /// Quatre refus, chacun pour sa raison :
    /// - pas une story ⇒ une citation de message garde sa carte dans la bulle ;
    /// - une **humeur** (`moodEmoji != nil`) ⇒ elle n'a pas de scène, et son
    ///   rendu dédié (emoji + contenu + date) vit dans `BubbleQuotedReply` ;
    /// - `visualHostsReply` / `audioHostsReply` ⇒ la citation est DÉJÀ logée
    ///   dans le conteneur unifié média ou dans le lecteur audio. La sortir de
    ///   là est une autre chirurgie ; la faire ici la rendrait EN DOUBLE.
    /// #5059 — la règle a QUITTÉ ce fichier pour `BubbleContent`, d'où les
    /// trois peaux peuvent l'atteindre. Elle était déclarée « site unique » ici
    /// et l'était : mais à portée `private`, donc unique dans son fichier
    /// seulement. La rangée plate et la rivière retombaient sur l'aperçu plat.
    var detachedStoryCitation: ReplyReference? { content.detachedStoryCitation }

    /// Le geste de la carte, ou `nil` — sans identifiant il n'y a rien à
    /// ouvrir, et un tap qui n'ouvre rien est une cible morte (loi 4). La
    /// carte, elle, se rend quand même : c'est la citation qui « subsiste ».
    ///
    /// L'ÉCHEC d'ouverture n'est pas jugé ici : seul l'hôte peut constater
    /// qu'il ne retrouve pas la story, et c'est lui qui le dit.
    var storyCitationOpenTap: (() -> Void)? {
        guard let citation = detachedStoryCitation,
              citation.opensQuotedTarget,
              let onStoryReplyTap else { return nil }
        return { onStoryReplyTap(citation.messageId) }
    }

    /// La présence SERVIE de l'auteur cité (#10956) — par son COMPTE (`authorUserId`,
    /// jamais l'identifiant de participation), et aucune pour soi.
    func quotedAuthorPresence(_ reply: ReplyReference) -> PresenceState? {
        guard !reply.isMe, let userId = reply.authorUserId else { return nil }
        return PresenceManager.shared.presenceState(for: userId)
    }

    func quotedReplyView(_ reply: ReplyReference) -> some View {
        BubbleQuotedReply(
            reply: reply,
            parentIsMe: content.isMe,
            accentHex: contactColor,
            isDark: isDark,
            mentionDisplayNames: mentionDisplayNames,
            authorPresence: quotedAuthorPresence(reply),
            onQuotedAuthorTap: onQuotedAuthorTap,
            onQuotedMediaTap: onQuotedMediaTap
        )
        .equatable()
    }

    // MARK: - Attachment view (file, location, etc.)

    @ViewBuilder
    func attachmentView(_ attachment: MessageAttachment) -> some View {
        BubbleAttachmentView(
            attachment: attachment,
            isMe: content.isMe,
            isDark: isDark,
            accentHex: contactColor,
            transcription: transcription,
            translatedAudios: translatedAudios,
            onShareFile: { url in
                shareURL = url
                showShareSheet = true
            },
            onTapLocation: { att in
                fullscreenLocationAttachment = att
            },
            onPlayAudio: onPlayAudio
        )
    }

    // MARK: - Reactions overlay

    @ViewBuilder
    var reactionsOverlay: some View {
        // Use the SAME accent as the bubble background under the pill so
        // (a) the add-reaction button reads as "attached" to the bubble it
        // belongs to and (b) reactions the connected user has placed get a
        // border that matches the host bubble's accent — own messages get
        // the brand indigo (matches the bubble fill), received messages
        // get the blended `otherBubbleColor`. Passing `contactColor` (the
        // raw conversation color) made every bubble's pills look like
        // they belonged to the same generic surface.
        let bubbleAccent = skin.accentHex(isMe: content.isMe, received: otherBubbleColor)

        BubbleReactionsOverlay(
            messageId: content.messageId,
            summaries: reactionSummaries,
            isMe: content.isMe,
            isDark: isDark,
            isLastReceivedMessage: isLastReceivedMessage,
            accentHex: bubbleAccent,
            onAddReaction: onAddReaction,
            onToggleReaction: onToggleReaction,
            onOpenReactPicker: onOpenReactPicker,
            onShowReactions: onShowReactions
        )
    }

    // MARK: - Bubble background

    var bubbleBackground: some View {
        BubbleBackground(
            isMe: content.isMe,
            accentHex: otherBubbleColor,
            isDark: isDark
        )
    }

    // MARK: - Audio standalone

    @ViewBuilder
    func mediaStandaloneView(
        _ attachment: MessageAttachment,
        injectFooter: Bool = false,
        replyReference: ReplyReference? = nil,
        replyIsStory: Bool = false,
        embedsCaption: Bool = false
    ) -> some View {
        let isMe = content.isMe
        // Audio-only messages host the bubble footer inside the audio widget;
        // `AudioMediaView` folds the audio-language flags into this model.
        // When `replyReference` is non-nil, the citation is also hosted inside
        // the audio widget (topSlot) — no chat bubble around the player.
        // `includesTranslationControls: true` because audio IS translatable
        // (transcription + audio translation): without it an inbound audio-only
        // bubble would lose its translate globe and flags (Prisme Linguistique).
        let footer = injectFooter ? resolvedFooter(includesTranslationControls: true) : nil
        switch attachment.type {
        case .audio:
            AudioMediaView(
                attachment: attachment,
                message: message,
                contactColor: skin.accentHex(isMe: isMe, received: otherBubbleColor),
                visualAttachments: visualAttachments,
                isDark: isDark,
                accentColor: skin.accentHex(isMe: isMe, received: otherBubbleColor),
                transcription: transcription,
                translatedAudios: translatedAudios.filter { $0.attachmentId == attachment.id },
                textTranslations: textTranslations,
                allAudioItems: allAudioItems,
                mentionDisplayNames: mentionDisplayNames,
                onScrollToMessage: onScrollToMessage,
                onShareFile: { url in
                    shareURL = url
                    showShareSheet = true
                },
                onShowTranslationDetail: onShowTranslationDetail,
                onRequestTranslation: onRequestTranslation,
                activeAudioLanguageOverride: activeAudioLanguage,
                // La bande interne écrit le CANAL DU MESSAGE (binding routé
                // vers le VM par ThemedMessageBubble) — la piste jouée, le
                // texte et le drapeau de rangée suivent le même tap.
                onSelectAudioLanguage: { code in
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        activeDisplayLangCode = code
                    }
                },
                footerModel: footer?.0,
                footerActions: footer?.1 ?? .none,
                replyReference: replyReference,
                replyIsStory: replyIsStory,
                parentIsMe: isMe,
                onReplyTap: onReplyTap,
                onStoryReplyTap: onStoryReplyTap,
                onQuotedAuthorTap: onQuotedAuthorTap,
                onQuotedMediaTap: onQuotedMediaTap,
                onPlayAudio: onPlayAudio,
                conversationName: conversationName,
                audioQueueTailProvider: audioQueueTailProvider,
                embedsCaptionInWidget: embedsCaption,
                voiceConsentMissing: voiceConsentMissing,
                onTapConsentNotice: onTapConsentNotice,
                onOpenFullscreen: onMediaTap.map { open in { open(attachment) } }
            )
            .equatable()

        default:
            EmptyView()
        }
    }
}
