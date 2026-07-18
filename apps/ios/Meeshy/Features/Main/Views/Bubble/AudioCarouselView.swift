import SwiftUI
import MeeshySDK
import MeeshyUI

/// Horizontal carousel for a message carrying MORE THAN ONE audio track.
///
/// Every track of a multi-audio message is an attachment of the SAME `Message`,
/// so the message-level footer (timestamp, delivery, language flags) is CONSTANT
/// across pages — the carousel renders ONE shared `BubbleFooter` below the pager
/// instead of one per page.
///
/// ## Reuse (no reinvention)
/// Each page reuses the existing `AudioMediaView`, which itself routes through
/// `AudioBubbleRouter` → `AudioPlayerView`. That stack already renders the
/// waveform + right-side speed/progress chips + synchronized karaoke
/// transcription, resolves availability + auto-download, and — crucially —
/// gates the **shared** `ConversationAudioCoordinator` engine onto a page ONLY
/// when that page's attachment is the coordinator's `activeContext`. Idle pages
/// keep their own local engine, so a non-active track never mirrors the active
/// track's playhead. No extra active-gating logic is needed here: it is
/// inherited from `AudioMediaView`/`AudioBubbleRouter`.
///
/// Each page passes `footerModel: nil` so the per-page footer is suppressed and
/// only the carousel's single shared footer shows.
///
/// ## Playback
/// Swiping to a track (`currentPageID` change) and tapping play inside a page
/// both route through `onPlayAudio(track.id)` → `ConversationViewModel.playAudio`,
/// which builds the `current + tail` queue and asks the coordinator to start the
/// track from 0; auto-advance through the remaining tracks (then the thread) is
/// already handled by the coordinator queue.
///
/// ## Leaf-view discipline
/// All inputs are primitives / value types. The only shared singleton touched is
/// `ConversationAudioCoordinator` (via the reused `AudioMediaView`/`AudioBubbleRouter`),
/// which is the legitimate shared-engine source. No `@ObservedObject` on other globals.
struct AudioCarouselView: View {
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
    var parentIsMe: Bool = false
    var voiceConsentMissing: Bool = false
    var onTapConsentNotice: (() -> Void)? = nil

    @State private var currentPageID: String?
    /// Height of the pager — grows to the tallest audio page so a track with a
    /// longer karaoke transcription is not clipped. Pages without a karaoke
    /// zone (no transcription) are shorter; the pager keeps the max so paging
    /// between them does not jump.
    @State private var pagerHeight: CGFloat = 72
    /// BUG A — pending settle task for swipe-driven playback. A fast fling
    /// across multiple pages emits intermediate `currentPageID` values; each
    /// would otherwise fire `onPlayAudio` → rebuild + restart the coordinator
    /// queue from 0. We debounce: store the latest task, cancel the previous
    /// one on each change, and only fire `onPlayAudio` once the page has
    /// SETTLED on a track for ~220ms.
    @State private var pendingPlayTask: Task<Void, Never>?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ZStack(alignment: .topTrailing) {
                AdaptiveHorizontalPager(
                    items: items,
                    currentPageID: $currentPageID,
                    fillVertical: false,
                    carouselTransition: true
                ) { _, attachment in
                    page(attachment)
                        .background(
                            GeometryReader { proxy in
                                Color.clear.preference(
                                    key: AudioCarouselHeightKey.self,
                                    value: proxy.size.height
                                )
                            }
                        )
                }
                .frame(height: pagerHeight)

                if items.count > 1 {
                    pageIndicator
                        .padding(.trailing, 6)
                        .padding(.top, 2)
                }
            }
            .onPreferenceChange(AudioCarouselHeightKey.self) { newHeight in
                if newHeight > 0 { pagerHeight = newHeight }
            }

            BubbleFooter(
                model: currentPageFooterModel,
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
                .padding(.top, 6)
            }
        }
        .onAppear {
            if currentPageID == nil { currentPageID = items.first?.id }
        }
        // Contrairement au carrousel visuel (état grille ↔ carrousel), le pager
        // multi-audio est TOUJOURS actif : le glissement horizontal lui
        // appartient en permanence. On désengage donc le swipe reply/forward du
        // BubbleSwipeContainer pour toute la vie de la bulle — sinon un swipe
        // de piste franc (~60-100pt) franchit même le seuil `.resistant` (48pt)
        // et déclenche Répondre/Transférer en plein changement de piste.
        // Répondre/Transférer restent accessibles via le menu long-press.
        .preference(key: BubbleInlinePagingPreferenceKey.self, value: items.count > 1)
        // Swipe to a track plays it from 0 (validated UX). Tapping play inside a
        // page routes through the same `onPlayAudio` callback below.
        //
        // The `oldID != nil` guard skips the INITIAL appear-driven assignment
        // (`nil -> items[0].id`, set by `.onAppear` / the iOS17 scrollPosition
        // binding). Without it, a multi-audio bubble would auto-play track 0
        // just by scrolling into view — playback must only start on a real
        // user swipe (or an explicit tap-play inside a page).
        .adaptiveOnChange(of: currentPageID) { oldID, newID in
            guard let newID, oldID != nil else { return }
            HapticFeedback.light()
            // BUG A — skip-if-already-active: a deliberate swipe back onto the
            // track that's currently playing must not rebuild + restart the
            // queue. The coordinator's `activeContext` is the source of truth.
            let coordinator = ConversationAudioCoordinator.shared
            if coordinator.activeContext?.attachmentId == newID && coordinator.isPlaying {
                return
            }
            // BUG A — debounce: cancel any pending settle task and only fire
            // `onPlayAudio` once the page has stayed on `newID` for ~220ms, so
            // a fast fling across pages doesn't start-then-restart each
            // intermediate track.
            pendingPlayTask?.cancel()
            pendingPlayTask = Task {
                try? await Task.sleep(nanoseconds: 220_000_000)
                guard !Task.isCancelled, currentPageID == newID else { return }
                onPlayAudio?(newID)
            }
        }
        .onDisappear { pendingPlayTask?.cancel() }
    }

    // MARK: - Per-visible-track footer (BUG B)

    /// The footer rendered below the pager. Timestamp / delivery / sender are
    /// CONSTANT across same-message tracks, so those come straight from the
    /// message-level `footerModel`. Only the LANGUAGE FLAGS are per-track: a
    /// heterogeneous multi-audio message can carry different languages per
    /// track, so the flags must advertise the CURRENTLY VISIBLE track's
    /// languages — not the message-level (last-track) set.
    private var currentPageFooterModel: BubbleFooterModel {
        guard let pageID = currentPageID else { return footerModel }
        let flags = footerFlags(forTrack: pageID)
        // Preserve the message-level model entirely when the visible track has
        // no per-track language data (e.g. transcription not yet arrived) so we
        // never blank out flags that the message-level model legitimately holds.
        guard !flags.isEmpty else { return footerModel }
        var model = footerModel
        model.flags = flags
        return model
    }

    /// Languages available for a track: its original (transcription) language
    /// plus every translated-audio target language, deduplicated and order-
    /// preserving (original first). The active flag matches `activeAudioLanguage`.
    private func footerFlags(forTrack attachmentId: String) -> [FooterFlag] {
        var codes: [String] = []
        if let original = transcriptions[attachmentId]?.language {
            codes.append(original)
        }
        for audio in translatedAudios[attachmentId] ?? [] {
            codes.append(audio.targetLanguage)
        }
        var seen = Set<String>()
        let ordered = codes.filter { seen.insert($0).inserted }
        return ordered.map { FooterFlag(code: $0, isActive: $0 == activeAudioLanguage) }
    }

    @ViewBuilder
    private func page(_ attachment: MessageAttachment) -> some View {
        // Reuse the existing single-audio render. `footerModel: nil` suppresses
        // the per-page footer (the carousel renders ONE shared footer below).
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
            onPlayAudio: onPlayAudio
        )
        .equatable()
        .padding(.trailing, 4)
    }

    // MARK: - Page Indicator (mirrors BubbleCarouselView)

    @ViewBuilder
    private var pageIndicator: some View {
        let accent = Color(hex: contactColor)
        let currentIndex = items.firstIndex(where: { $0.id == currentPageID }) ?? 0

        Group {
            if items.count <= 7 {
                HStack(spacing: 5) {
                    ForEach(0..<items.count, id: \.self) { i in
                        Circle()
                            .fill(i == currentIndex ? accent : Color.white.opacity(0.45))
                            .frame(
                                width: i == currentIndex ? 7 : 5,
                                height: i == currentIndex ? 7 : 5
                            )
                            .shadow(
                                color: i == currentIndex ? accent.opacity(0.6) : .clear,
                                radius: 4
                            )
                            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentIndex)
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(
                    Capsule()
                        .fill(.ultraThinMaterial.opacity(0.7))
                        .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
                )
            } else {
                Text("\(currentIndex + 1) / \(items.count)")
                    // Dynamic-Type-aware: the counter scales with the reader's
                    // text size (the capsule has flexible padding, no fixed width,
                    // so it grows with the glyphs — no truncation).
                    .font(MeeshyFont.relative(12, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(
                        Capsule()
                            .fill(.ultraThinMaterial.opacity(0.7))
                            .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
                    )
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: currentIndex)
            }
        }
        // The position is conveyed visually by dot fill/size (or the "n / N"
        // counter) — VoiceOver needs it spoken, not left to color alone. One
        // combined element announces "Piste 2 sur 5" for both variants.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(String(localized: "bubble.audio.carousel.position",
                                         defaultValue: "Piste \(currentIndex + 1) sur \(items.count)",
                                         bundle: .main)))
    }
}

/// Reports the intrinsic height of an audio carousel page so the pager can size
/// to the tallest track (variable karaoke height) without clipping.
private struct AudioCarouselHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
