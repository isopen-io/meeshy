import SwiftUI
import MeeshySDK
import MeeshyUI

/// Vertical list for a message carrying MORE THAN ONE audio track (directive
/// porteur 2026-10-14, #10654) : each voice sits on its own row, one under the
/// other, each with its FULL player (waveform, speed/progress chips, karaoke).
/// No pager, no "i/N" indicator.
///
/// Every track is an attachment of the SAME `Message`, so the message-level
/// footer is CONSTANT : ONE shared `BubbleFooter` closes the stack.
///
/// Each row reuses `AudioMediaView` → `AudioBubbleRouter` → `AudioPlayerView`
/// with `footerModel: nil`. Tapping play on a row routes through
/// `onPlayAudio(track.id)` → the `ConversationAudioCoordinator` queue, which
/// chains the tracks top to bottom.
struct AudioStackView: View {
    /// The audio attachments of THIS message (count > 1, all same message).
    let items: [MessageAttachment]
    let message: Message
    let contactColor: String
    let isDark: Bool
    let accentColor: String
    /// Per-attachment transcription, keyed by attachment id.
    let transcriptions: [String: MessageTranscription]
    /// Per-attachment translated audios, keyed by attachment id.
    let translatedAudios: [String: [MessageTranslatedAudio]]
    let textTranslations: [MessageTranslation]
    let allAudioItems: [ConversationViewModel.AudioItem]
    let mentionDisplayNames: [String: String]
    /// Message-level footer — constant across same-message tracks.
    let footerModel: BubbleFooterModel
    let footerActions: BubbleFooterActions
    let activeAudioLanguage: String?
    let onScrollToMessage: ((String) -> Void)?
    let onShareFile: ((URL) -> Void)?
    let onShowTranslationDetail: ((String) -> Void)?
    let onRequestTranslation: ((String, String) -> Void)?
    let onPlayAudio: ((String) -> Void)?
    /// Cold-open (F1) : forwardés à chaque page (`AudioMediaView`) — voir
    /// `BubbleStandardLayout.conversationName` / `.audioQueueTailProvider`.
    var conversationName: String? = nil
    var audioQueueTailProvider: ((String) -> [QueuedAudio])? = nil
    var parentIsMe: Bool = false
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            ForEach(items) { attachment in
                row(attachment)
            }

            BubbleFooter(
                model: footerModel,
                actions: footerActions,
                style: .overlay,
                isDark: isDark
            )
            .equatable()

            if AudioMediaView.shouldShowConsentNotice(isMe: parentIsMe, voiceConsentMissing: voiceConsentMissing) {
                AudioConsentNotice(
                    message: NSLocalizedString("audio.consent.notice.message", bundle: .main, comment: ""),
                    actionTitle: NSLocalizedString("audio.consent.notice.action", bundle: .main, comment: ""),
                    accentHex: accentColor,
                    onTap: { onTapConsentNotice?() }
                )
                .padding(.top, MeeshySpacing.xsPlus)
            }
        }
    }

    @ViewBuilder
    private func row(_ attachment: MessageAttachment) -> some View {
        // Reuse the existing single-audio render. `footerModel: nil` suppresses
        // the per-page footer (the stack renders ONE shared footer below).
        // `AudioMediaView` routes through `AudioBubbleRouter`, which gives the
        // shared coordinator engine to this page ONLY when it is the active
        // attachment — idle pages keep a local engine.
        AudioMediaView(
            attachment: attachment,
            message: message,
            contactColor: contactColor,
            visualAttachments: [],
            isDark: isDark,
            accentColor: accentColor,
            transcription: transcriptions[attachment.id],
            translatedAudios: translatedAudios[attachment.id] ?? [],
            textTranslations: textTranslations,
            allAudioItems: allAudioItems,
            mentionDisplayNames: mentionDisplayNames,
            onScrollToMessage: onScrollToMessage,
            onShareFile: onShareFile,
            onShowTranslationDetail: onShowTranslationDetail,
            onRequestTranslation: onRequestTranslation,
            activeAudioLanguageOverride: activeAudioLanguage,
            footerModel: nil,
            footerActions: .none,
            onPlayAudio: onPlayAudio,
            conversationName: conversationName,
            audioQueueTailProvider: audioQueueTailProvider
        )
        .equatable()
        .padding(.trailing, MeeshySpacing.xs)
    }
}
