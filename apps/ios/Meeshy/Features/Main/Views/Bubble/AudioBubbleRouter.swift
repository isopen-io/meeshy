import SwiftUI
import MeeshySDK
import MeeshyUI

/// App-side wrapper around `AudioPlayerView` that decides whether the bubble
/// for `attachmentId` should drive the **shared** `ConversationAudioCoordinator`
/// engine (when the coordinator's `activeContext` matches this attachment) or
/// keep its own local engine (when the coordinator is idle or playing a
/// different audio).
///
/// Two states:
///
///   - **Active** (`coordinator.activeContext?.attachmentId == attachmentId`):
///     `AudioPlayerView` receives `externalPlayer = coordinator.engineForBubble`.
///     Every play/pause/seek/speed control routes through the coordinator-owned
///     engine; the 20Hz progress timer renders the same playhead the mini-player
///     shows; the audio survives scroll-off because the engine lifetime is owned
///     by the coordinator, not the SwiftUI view tree.
///
///   - **Inactive**: `AudioPlayerView` renders with its owned local
///     `AudioPlaybackManager` (Phase 0 behavior). The play tap is intercepted
///     via `onPlayRequest` and routed back to the caller (typically
///     `ConversationViewModel.playAudio(attachmentId:)`), which builds the
///     queue and asks the coordinator to start — at which point the next
///     body re-eval flips this view into the Active branch.
///
/// SDK purity: this wrapper encodes a Meeshy-specific UX decision ("which
/// engine should drive this bubble based on the global coordinator state"),
/// so per CLAUDE.md SDK purity rules it lives app-side.
struct AudioBubbleRouter: View {
    let attachmentId: String
    let attachment: MessageAttachment
    let accentColorHex: String
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let onFullscreen: (() -> Void)?
    let onRequestTranscription: (() -> Void)?
    let onRetranscribe: (() -> Void)?
    let onPlayingChange: ((Bool) -> Void)?
    let externalLanguage: Binding<String?>?
    let availability: AudioAvailability
    let onDownload: (() -> Void)?
    let onPlayRequest: () -> Void
    let topContent: AnyView?
    let bottomContent: AnyView?

    @ObservedObject private var coordinator: ConversationAudioCoordinator

    init(
        attachmentId: String,
        attachment: MessageAttachment,
        accentColorHex: String,
        transcription: MessageTranscription? = nil,
        translatedAudios: [MessageTranslatedAudio] = [],
        onFullscreen: (() -> Void)? = nil,
        onRequestTranscription: (() -> Void)? = nil,
        onRetranscribe: (() -> Void)? = nil,
        onPlayingChange: ((Bool) -> Void)? = nil,
        externalLanguage: Binding<String?>? = nil,
        availability: AudioAvailability = .ready,
        onDownload: (() -> Void)? = nil,
        topContent: AnyView? = nil,
        bottomContent: AnyView? = nil,
        onPlayRequest: @escaping () -> Void,
        coordinatorForTesting: ConversationAudioCoordinator? = nil
    ) {
        self.attachmentId = attachmentId
        self.attachment = attachment
        self.accentColorHex = accentColorHex
        self.transcription = transcription
        self.translatedAudios = translatedAudios
        self.onFullscreen = onFullscreen
        self.onRequestTranscription = onRequestTranscription
        self.onRetranscribe = onRetranscribe
        self.onPlayingChange = onPlayingChange
        self.externalLanguage = externalLanguage
        self.availability = availability
        self.onDownload = onDownload
        self.topContent = topContent
        self.bottomContent = bottomContent
        self.onPlayRequest = onPlayRequest
        self._coordinator = ObservedObject(wrappedValue: coordinatorForTesting ?? .shared)
    }

    /// Internal so MeeshyTests can assert the routing decision without
    /// going through a snapshot/UI test. Reading `coordinator.activeContext`
    /// returns the most recent value because `@ObservedObject` keeps us in
    /// sync with the coordinator's `@Published` updates.
    var isActiveForTesting: Bool {
        coordinator.activeContext?.attachmentId == attachmentId
    }

    var body: some View {
        let externalPlayer: AudioPlaybackManager? =
            isActiveForTesting ? coordinator.engineForBubble : nil

        // AudioPlayerView's init takes two @ViewBuilder closures with
        // `EmptyView` defaults (`topContent`, `bottomContent`). We can't pass
        // `nil` — we must select the right overload variant by branching on
        // which AnyView slots are non-nil. This mirrors the existing pattern
        // in `AudioMediaView.audioPlayer` (3 variants for reply present /
        // footer present / nothing).
        if let top = topContent, let bottom = bottomContent {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentColorHex,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: onFullscreen,
                onRequestTranscription: onRequestTranscription,
                onRetranscribe: onRetranscribe,
                onPlayingChange: onPlayingChange,
                externalLanguage: externalLanguage,
                availability: availability,
                onDownload: onDownload,
                externalPlayer: externalPlayer,
                onPlayRequest: onPlayRequest,
                topContent: { top },
                bottomContent: { bottom }
            )
        } else if let bottom = bottomContent {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentColorHex,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: onFullscreen,
                onRequestTranscription: onRequestTranscription,
                onRetranscribe: onRetranscribe,
                onPlayingChange: onPlayingChange,
                externalLanguage: externalLanguage,
                availability: availability,
                onDownload: onDownload,
                externalPlayer: externalPlayer,
                onPlayRequest: onPlayRequest,
                bottomContent: { bottom }
            )
        } else if let top = topContent {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentColorHex,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: onFullscreen,
                onRequestTranscription: onRequestTranscription,
                onRetranscribe: onRetranscribe,
                onPlayingChange: onPlayingChange,
                externalLanguage: externalLanguage,
                availability: availability,
                onDownload: onDownload,
                externalPlayer: externalPlayer,
                onPlayRequest: onPlayRequest,
                topContent: { top }
            )
        } else {
            AudioPlayerView(
                attachment: attachment,
                context: .messageBubble,
                accentColor: accentColorHex,
                transcription: transcription,
                translatedAudios: translatedAudios,
                onFullscreen: onFullscreen,
                onRequestTranscription: onRequestTranscription,
                onRetranscribe: onRetranscribe,
                onPlayingChange: onPlayingChange,
                externalLanguage: externalLanguage,
                availability: availability,
                onDownload: onDownload,
                externalPlayer: externalPlayer,
                onPlayRequest: onPlayRequest
            )
        }
    }
}
