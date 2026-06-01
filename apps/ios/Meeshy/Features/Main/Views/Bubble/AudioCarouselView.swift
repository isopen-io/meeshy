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

    @State private var currentPageID: String?

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
                if newHeight > 0 { pagerHeight = max(pagerHeight, newHeight) }
            }

            BubbleFooter(
                model: footerModel,
                actions: footerActions,
                style: .overlay,
                isDark: isDark
            )
            .equatable()
        }
        .onAppear {
            if currentPageID == nil { currentPageID = items.first?.id }
        }
        // Swipe to a track plays it from 0 (validated UX). Tapping play inside a
        // page routes through the same `onPlayAudio` callback below.
        .adaptiveOnChange(of: currentPageID) { _, newID in
            guard let newID else { return }
            HapticFeedback.light()
            onPlayAudio?(newID)
        }
    }

    /// Height of the pager — grows to the tallest audio page so a track with a
    /// longer karaoke transcription is not clipped. Pages without a karaoke
    /// zone (no transcription) are shorter; the pager keeps the max so paging
    /// between them does not jump.
    @State private var pagerHeight: CGFloat = 72

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
                .font(.system(size: 12, weight: .bold, design: .monospaced))
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
}

/// Reports the intrinsic height of an audio carousel page so the pager can size
/// to the tallest track (variable karaoke height) without clipping.
private struct AudioCarouselHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
