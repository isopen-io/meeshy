import SwiftUI
import Combine
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
/// ### Re-render isolation (Zero Unnecessary Re-render)
/// The router used to keep the coordinator as `@ObservedObject`, which meant
/// every tick of `coordinator.currentTime` (20Hz) invalidated the body of
/// every audio bubble on screen — even for inactive bubbles whose UX is fully
/// independent from the active engine state. For N audio bubbles, that's
/// `O(N × 20Hz)` body evaluations per second.
///
/// The router now subscribes to a derived publisher
/// (`coordinator.$activeContext.map { $0?.attachmentId == attachmentId }
/// .removeDuplicates()`) via `.onReceive`, writes the boolean into local
/// `@State`, and forwards primitive `let` inputs to `AudioBubbleContent`.
/// Body re-eval only happens when the active attachment actually flips —
/// `currentTime`/`isPlaying`/`progress` ticks no longer reach the router.
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
    let initialTranscriptionLanguage: String?
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

    /// Local boolean that flips only when the coordinator's
    /// `activeContext.attachmentId` matches this bubble. Driven by the
    /// `.onReceive` modifier on the derived publisher below.
    @State private var isActive: Bool = false
    /// External engine handed off to `AudioPlayerView` while this bubble is
    /// active. `nil` when inactive — the player falls back to its own local
    /// `AudioPlaybackManager`.
    @State private var externalEngine: AudioPlaybackManager?

    private let coordinator: ConversationAudioCoordinator
    /// Pre-computed publisher kept as a stored property so SwiftUI's diff of
    /// `.onReceive(coordinator.$activeContext...)` doesn't create a new
    /// publisher on every body call (which would re-fire the initial value
    /// and force an extra render). `Just`-style behavior: emits whenever
    /// `activeContext` changes AND the derived bool flips.
    private let activeForThisBubblePublisher: AnyPublisher<Bool, Never>

    init(
        attachmentId: String,
        attachment: MessageAttachment,
        accentColorHex: String,
        transcription: MessageTranscription? = nil,
        translatedAudios: [MessageTranslatedAudio] = [],
        initialTranscriptionLanguage: String? = nil,
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
        self.initialTranscriptionLanguage = initialTranscriptionLanguage
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
        let coord = coordinatorForTesting ?? .shared
        self.coordinator = coord
        // `removeDuplicates` is the keystone: it strips every tick that
        // didn't flip the derived bool (currentTime/progress/isPlaying
        // ticks all re-emit `activeContext` unchanged, so the mapped
        // boolean stays the same and is filtered out).
        self.activeForThisBubblePublisher = coord.$activeContext
            .map { $0?.attachmentId == attachmentId }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    /// Internal so MeeshyTests can assert the routing decision without
    /// going through a snapshot/UI test. Reads the coordinator directly
    /// rather than the `@State` mirror because tests don't drive the
    /// SwiftUI render lifecycle — `.onReceive` only fires once `body` is
    /// evaluated, but `isActiveForTesting` must reflect the up-to-date
    /// routing decision even before any render. The derivation is the
    /// same one that feeds `.onReceive`, just inlined for tests.
    var isActiveForTesting: Bool {
        coordinator.activeContext?.attachmentId == attachmentId
    }

    var body: some View {
        AudioBubbleContent(
            attachment: attachment,
            accentColorHex: accentColorHex,
            transcription: transcription,
            translatedAudios: translatedAudios,
            initialTranscriptionLanguage: initialTranscriptionLanguage,
            onFullscreen: onFullscreen,
            onRequestTranscription: onRequestTranscription,
            onRetranscribe: onRetranscribe,
            onPlayingChange: onPlayingChange,
            externalLanguage: externalLanguage,
            availability: availability,
            onDownload: onDownload,
            topContent: topContent,
            bottomContent: bottomContent,
            externalPlayer: externalEngine,
            onPlayRequest: onPlayRequest
        )
        .onReceive(activeForThisBubblePublisher) { newIsActive in
            isActive = newIsActive
            externalEngine = newIsActive ? coordinator.engineForBubble : nil
        }
    }
}

/// Child view that owns the actual `AudioPlayerView` instantiation logic.
/// Receives every input as a `let` primitive / value type, so SwiftUI's
/// structural diff skips body re-eval whenever the parent re-evaluates with
/// identical inputs. The 4-branch dispatch on `topContent`/`bottomContent`
/// is preserved verbatim from the previous monolithic router.
///
/// ⚠ Intentionally NOT `Equatable`: the AnyView slots make a sound `==`
/// implementation impossible, and the CLAUDE.md "SwiftUI Equatable +
/// @State footgun" warns against manual Equatable conformance on a View
/// with `@State`. Keep the diff structural.
private struct AudioBubbleContent: View {
    let attachment: MessageAttachment
    let accentColorHex: String
    let transcription: MessageTranscription?
    let translatedAudios: [MessageTranslatedAudio]
    let initialTranscriptionLanguage: String?
    let onFullscreen: (() -> Void)?
    let onRequestTranscription: (() -> Void)?
    let onRetranscribe: (() -> Void)?
    let onPlayingChange: ((Bool) -> Void)?
    let externalLanguage: Binding<String?>?
    let availability: AudioAvailability
    let onDownload: (() -> Void)?
    let topContent: AnyView?
    let bottomContent: AnyView?
    let externalPlayer: AudioPlaybackManager?
    let onPlayRequest: () -> Void

    var body: some View {
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
                initialTranscriptionLanguage: initialTranscriptionLanguage,
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
                initialTranscriptionLanguage: initialTranscriptionLanguage,
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
                initialTranscriptionLanguage: initialTranscriptionLanguage,
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
                initialTranscriptionLanguage: initialTranscriptionLanguage,
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
