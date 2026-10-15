import SwiftUI
import MeeshySDK
import MeeshyUI

/// Vertical list for a message carrying MORE THAN ONE audio track (directive
/// porteur 2026-10-14, #10654) : each voice sits on its own row, one under the
/// other, each with its FULL player (waveform, speed/progress chips, karaoke).
/// No pager, no "i/N" indicator.
///
/// Every track is an attachment of the SAME `Message`, so timestamp, delivery
/// and sender are CONSTANT : ONE shared `BubbleFooter` closes the stack. Its
/// language flags are the UNION of every visible track's languages (a
/// heterogeneous message can carry one language per voice).
///
/// The pager used to say the rank of a track with its dots ; each row now says
/// it to VoiceOver (« Vocal 2 sur 3 »), as an accessibility container that keeps
/// the player's own controls reachable.
///
/// Each row reuses `AudioMediaView` → `AudioBubbleRouter` → `AudioPlayerView`
/// with `footerModel: nil`. Tapping play on a row routes through
/// `onPlayAudio(track.id)` → the `ConversationAudioCoordinator` queue, which
/// chains the tracks top to bottom.
///
/// Language (#10678) : a row's own language pills choose THAT track only (the
/// player's `externalLanguage`, per row) ; the MESSAGE channel is written by
/// the shared footer's flags (`footerActions.onFlagTap`). `AudioMediaView`'s
/// `onSelectAudioLanguage` is read only by its in-widget footer, which the
/// rows never render (`footerModel: nil`) — passing it here would be inert.
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
    /// Tenue du player de CHAQUE ligne : `.card` en bulle, la tenue plate de
    /// Focal (`FocalAudioBlock.flatChrome`) sous la rangée plate — la même que
    /// le vocal seul (#10678).
    var chrome: AudioPlayerChrome = .card
    /// Ouvreur du plein écran de la CONVERSATION (celui du vocal seul, qui sait
    /// réagir, répondre et créer). Reçoit la piste TOUCHÉE : la page ouverte est
    /// celle de la ligne, jamais la première (#10678).
    var onOpenFullscreen: ((MessageAttachment) -> Void)? = nil

    /// L'ouvreur de plein écran d'UNE ligne : lié à SA piste.
    static func fullscreenOpener(
        for attachment: MessageAttachment,
        via open: ((MessageAttachment) -> Void)?
    ) -> (() -> Void)? {
        open.map { open in { open(attachment) } }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, attachment in
                row(attachment)
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel(Text(Self.rowAccessibilityLabel(index: index, count: items.count)))
            }

            BubbleFooter(
                model: Self.sharedFooterModel(
                    base: footerModel,
                    trackIDs: items.map(\.id),
                    transcriptions: transcriptions,
                    translatedAudios: translatedAudios,
                    activeAudioLanguage: activeAudioLanguage
                ),
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

    // MARK: - Shared footer

    /// The message-level footer with the language flags of EVERY track : each
    /// track's original (transcription) language, then its translated-audio
    /// targets, deduplicated in reading order. The active flag follows
    /// `activeAudioLanguage`. When no track carries per-track language data yet
    /// (transcription not arrived), the message-level model is kept whole so
    /// its flags are never blanked out.
    static func sharedFooterModel(
        base: BubbleFooterModel,
        trackIDs: [String],
        transcriptions: [String: MessageTranscription],
        translatedAudios: [String: [MessageTranslatedAudio]],
        activeAudioLanguage: String?
    ) -> BubbleFooterModel {
        let codes: [String] = trackIDs.flatMap { id -> [String] in
            let original: [String] = transcriptions[id].map { [$0.language] } ?? []
            return original + (translatedAudios[id] ?? []).map(\.targetLanguage)
        }
        let ordered = codes.reduce(into: [String]()) { seen, code in
            if !seen.contains(code) { seen.append(code) }
        }
        guard !ordered.isEmpty else { return base }
        var model = base
        model.flags = ordered.map { FooterFlag(code: $0, isActive: $0 == activeAudioLanguage) }
        return model
    }

    /// « Vocal 2 sur 3 » — the rank the pager's dots used to show, spoken.
    static func rowAccessibilityLabel(index: Int, count: Int) -> String {
        let position = index + 1
        return String(localized: "bubble.audio.stack.position",
                      defaultValue: "Vocal \(position) sur \(count)",
                      bundle: .main)
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
            chrome: chrome,
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
            audioQueueTailProvider: audioQueueTailProvider,
            onOpenFullscreen: Self.fullscreenOpener(for: attachment, via: onOpenFullscreen)
        )
        .equatable()
        .padding(.trailing, MeeshySpacing.xs)
    }
}
