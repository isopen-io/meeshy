import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView canvas components
//
// Dedicated View structs extracted from StoryViewerView so the deeply nested
// story canvas (viewer content + story card) no longer composes into
// StoryViewerView.body's opaque type. That monolithic type exceeded the Swift
// type-checker budget and triggered a type-metadata instantiation crash on
// low-memory devices. Real structs (vs AnyView) break the type while
// preserving SwiftUI structural identity.

// MARK: - Story Gesture Overlay

/// Tap-left / tap-right navigation overlay plus the long-press pause gesture.
/// Extracted from `StoryViewerView.gestureOverlay(geometry:)` so its subtree
/// is its own type-metadata unit.
struct StoryGestureOverlayView: View {
    let geometry: GeometryProxy
    let isComposerEngaged: Bool
    let onDismissComposer: () -> Void
    let onPrevious: () -> Void
    let onNext: () -> Void
    let onPauseTimer: () -> Void
    let onResumeTimer: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            // Left half — previous
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if isComposerEngaged { onDismissComposer(); return }
                    onPrevious()
                }
                .accessibilityLabel("Story precedente")
                .accessibilityHint("Toucher pour revenir a la story precedente")
                .accessibilityAddTraits(.isButton)

            // Right half — next
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if isComposerEngaged { onDismissComposer(); return }
                    onNext()
                }
                .accessibilityLabel("Story suivante")
                .accessibilityHint("Toucher pour passer a la story suivante")
                .accessibilityAddTraits(.isButton)
        }
        // Exclude the bottom composer zone from tap targets
        .padding(.bottom, 120 + geometry.safeAreaInsets.bottom)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.2)
                .onChanged { _ in
                    guard !isComposerEngaged else { return }
                    onPauseTimer()
                }
                .onEnded { _ in
                    guard !isComposerEngaged else { return }
                    onResumeTimer()
                }
        )
    }
}

// MARK: - Story Composer Bar

/// Bottom comment composer used by the non-owner story viewer flow.
/// Extracted from `StoryViewerView.storyComposerBar` so the
/// `UniversalComposerBar` wiring is its own type-metadata unit.
struct StoryComposerBarView: View {
    let accentColor: String
    let storyId: String?

    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var hasComposerContent: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]

    let sendComment: (_ text: String, _ effectFlags: Int?) -> Void

    var body: some View {
        UniversalComposerBar(
            style: .dark,
            mode: .comment,
            accentColor: accentColor,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSend: { text in
                let effects = commentEffects
                let blur = commentBlurEnabled
                commentEffects = .none
                commentBlurEnabled = false
                let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
                let effectFlags = flags > 0 ? Int(flags) : nil
                sendComment(text, effectFlags)
            },
            onFocusChange: { focused in
                if focused {
                    isComposerEngaged = true
                    // Keyboard opening → dismiss emoji panel
                    if showTextEmojiPicker {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showTextEmojiPicker = false
                        }
                    }
                } else {
                    // Only disengage if emoji panel isn't showing
                    if !showTextEmojiPicker {
                        isComposerEngaged = false
                    }
                }
            },
            onRequestTextEmoji: {
                isComposerEngaged = true
                // Dismiss keyboard first, then show emoji panel
                UIApplication.shared.sendAction(
                    #selector(UIResponder.resignFirstResponder),
                    to: nil, from: nil, for: nil
                )
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                        showTextEmojiPicker = true
                    }
                }
            },
            injectedEmoji: $emojiToInject,
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            storyId: storyId,
            onSaveDraft: { storyId, text, attachments in
                if text.isEmpty && attachments.isEmpty {
                    storyDrafts.removeValue(forKey: storyId)
                } else {
                    storyDrafts[storyId] = StoryDraft(text: text, attachments: attachments)
                }
            },
            getDraft: { storyId in
                guard let draft = storyDrafts[storyId] else { return nil }
                return (text: draft.text, attachments: draft.attachments)
            },
            onAnyInteraction: {
                // No-op: shouldPauseTimer handles all pause logic based on UI state
            },
            focusTrigger: $composerFocusTrigger,
            onRecordingChange: { recording in
                isComposerEngaged = recording
            },
            onHasContentChange: { hasContent in
                hasComposerContent = hasContent
            }
        )
    }
}

// MARK: - Story Card

/// The full story canvas: background, pixel-perfect reader, voice caption,
/// audio badge, translation badge, scrims, gesture overlay, progress bars,
/// header, action sidebar, big-reaction overlay, comments overlay, composer
/// and the full emoji / language pickers.
///
/// Extracted from `StoryViewerView.storyCard(geometry:)` (formerly an
/// `AnyView`) so its ~10-layer `ZStack` is its own type-metadata unit.
struct StoryCardView: View {
    let geometry: GeometryProxy

    // Story content
    let currentStory: StoryItem?
    let outgoingStory: StoryItem?
    let currentGroup: StoryGroup?
    let currentStoryIndex: Int
    let resolvedViewerLanguage: String?
    let resolvedViewerLanguageChain: [String]
    let preloadedImages: [String: UIImage]
    let preloadedVideoURLs: [String: URL]
    let preloadedAudioURLs: [String: URL]
    let currentVoiceCaption: String?
    let isContentTranslated: Bool
    let isOwnStory: Bool
    let quickEmojis: [String]

    // Animation drivers (written by parent transition funcs)
    let progress: CGFloat
    let outgoingOpacity: Double
    let closingScale: CGFloat
    let contentOpacity: Double
    let textSlideOffset: CGFloat
    let openingScale: CGFloat
    let isRevealActive: Bool
    let bigReactionEmoji: String?
    let bigReactionPhase: Int

    // Sidebar inputs
    let storyReactionCount: Int
    let storyCommentCount: Int
    let isStoryCommentsEmpty: Bool
    let currentStoryNeedsVideoExport: Bool
    let storyHasAudioOrVideo: Bool
    let storyHasTranslatableContent: Bool
    let isGlobalMuted: Bool
    let availableTranslationLanguages: [TranslationLanguage]
    let onReplyToStory: ((ReplyContext) -> Void)?

    // Header inputs
    let composerAccentColor: String

    // Comments overlay inputs
    let storyComments: [FeedComment]
    let storyCommentRepliesMap: [String: [FeedComment]]
    let storyCommentExpandedThreads: Set<String>
    let storyCommentLoadingReplies: Set<String>
    let isLoadingComments: Bool
    let commentsUserLang: String

    // Bindings — UI state owned by the viewer
    @Binding var showEmojiStrip: Bool
    @Binding var showFullEmojiPicker: Bool
    @Binding var showCommentsOverlay: Bool
    @Binding var showLanguageOptions: Bool
    @Binding var showFullLanguagePicker: Bool
    @Binding var showViewersSheet: Bool
    @Binding var showExportShareSheet: Bool
    @Binding var isGlobalMutedBinding: Bool
    @Binding var showTextEmojiPicker: Bool
    @Binding var isComposerEngaged: Bool
    @Binding var hasComposerContent: Bool
    @Binding var sharedContentWrapper: SharedContentWrapper?
    @Binding var repostStoryComposerSource: RepostStorySourceWrapper?
    @Binding var editAndRepostAsPostSource: RepostPostSourceWrapper?
    @Binding var isPresented: Bool
    @Binding var selectedProfileUser: ProfileSheetUser?
    @Binding var showReportSheet: Bool
    @Binding var replyingToStoryComment: FeedComment?
    @Binding var composerLanguage: String
    @Binding var commentEffects: MessageEffects
    @Binding var commentBlurEnabled: Bool
    @Binding var emojiToInject: String
    @Binding var composerFocusTrigger: Bool
    @Binding var storyDrafts: [String: StoryDraft]

    @ObservedObject var keyboard: KeyboardObserver

    // Closures — actions on the parent view
    let triggerStoryReaction: (String) -> Void
    let pauseTimer: () -> Void
    let resumeTimer: () -> Void
    let loadStoryComments: () -> Void
    let dismissComposer: () -> Void
    let goToPrevious: () -> Void
    let goToNext: () -> Void
    let sendComment: (_ text: String, _ effectFlags: Int?, _ parentId: String?) -> Void
    let makeStoryCommentRow: (FeedComment, String) -> StoryCommentRowView
    let toggleStoryCommentThread: (String) async -> Void
    let makeStoryExternalShareURL: (String) -> URL?
    let storyTimeRemaining: (Date) -> String
    let deleteCurrentStory: () -> Void
    let repostAsPostDirect: () -> Void
    let dismissViewer: () -> Void
    let reportStory: (_ storyId: String, _ reportType: String, _ reason: String?) async throws -> Void
    let composerBottomPadding: (GeometryProxy) -> CGFloat

    private var topInset: CGFloat {
        max(geometry.safeAreaInsets.top, 59)
    }

    var body: some View {
        ZStack {
            // === Layer 1: Background ===
            // Color/gradient fallback (always present)
            storyBackground

            // === Outgoing canvas (cross-dissolve pixel-perfect) ===
            if let outgoing = outgoingStory, outgoingOpacity > 0 {
                StoryReaderRepresentable(story: outgoing, preferredLanguage: resolvedViewerLanguage,
                                      preferredContentLanguages: resolvedViewerLanguageChain,
                                      preloadedImages: preloadedImages,
                                      preloadedVideoURLs: preloadedVideoURLs,
                                      preloadedAudioURLs: preloadedAudioURLs)
                    .id("out-\(outgoing.id)")
                    .opacity(outgoingOpacity)
                    .scaleEffect(closingScale)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layers 2–4: Canvas pixel-perfect (media + filter + text + stickers) ===
            if let story = currentStory {
                StoryReaderRepresentable(story: story, preferredLanguage: resolvedViewerLanguage,
                                      preferredContentLanguages: resolvedViewerLanguageChain,
                                      preloadedImages: preloadedImages,
                                      preloadedVideoURLs: preloadedVideoURLs,
                                      preloadedAudioURLs: preloadedAudioURLs)
                    .id(story.id)
                    .opacity(contentOpacity)
                    .offset(y: textSlideOffset)
                    .scaleEffect(openingScale)
                    .clipShape(
                        RevealCircleShape(progress: isRevealActive ? 1.0 : (currentStory?.storyEffects?.opening == .reveal ? 0.001 : 1.0))
                    )
            }

            // === Voice caption overlay (transcription voix) ===
            if let transcription = currentVoiceCaption {
                VStack {
                    Spacer()
                    Text(transcription)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                        .background(
                            RoundedRectangle(cornerRadius: 10)
                                .fill(Color.black.opacity(0.55))
                        )
                        .padding(.horizontal, 20)
                        .padding(.bottom, topInset + 130)
                }
                .allowsHitTesting(false)
                .transition(.opacity)
            }

            // === Background audio badge ===
            if let audio = currentStory?.backgroundAudio {
                VStack {
                    Spacer()
                    backgroundAudioBadge(audio: audio)
                        .padding(.bottom, topInset + 165)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .allowsHitTesting(false)
            }

            // === Translation indicator (Prisme Linguistique — discret) ===
            if isContentTranslated {
                translationBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, 16)
                    .padding(.bottom, topInset + 175)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layer 5: Gradient scrims for readability over photos ===
            VStack {
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.7), location: 0),
                        .init(color: .black.opacity(0.4), location: 0.5),
                        .init(color: .black.opacity(0.0), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: topInset + 110)
                Spacer()
                LinearGradient(
                    stops: [
                        .init(color: .black.opacity(0.0), location: 0),
                        .init(color: .black.opacity(0.35), location: 0.5),
                        .init(color: .black.opacity(0.65), location: 1)
                    ],
                    startPoint: .top, endPoint: .bottom
                )
                .frame(height: 180)
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)

            // === Layer 6: Gesture overlay (tap left/right, long press) ===
            StoryGestureOverlayView(
                geometry: geometry,
                isComposerEngaged: isComposerEngaged,
                onDismissComposer: dismissComposer,
                onPrevious: goToPrevious,
                onNext: goToNext,
                onPauseTimer: pauseTimer,
                onResumeTimer: resumeTimer
            )

            // === Layer 7: Top UI (progress bars + header) — ABOVE gesture overlay for hit testing ===
            // min 59pt accounts for Dynamic Island when .statusBarHidden() zeroes safeAreaInsets
            VStack(spacing: 0) {
                StoryProgressBarsView(
                    group: currentGroup,
                    currentIndex: currentStoryIndex,
                    progress: progress
                )
                    .padding(.horizontal, 12)
                    .padding(.top, topInset + 4)

                StoryHeaderView(
                    currentGroup: currentGroup,
                    currentStory: currentStory,
                    isOwnStory: isOwnStory,
                    selectedProfileUser: $selectedProfileUser,
                    editAndRepostAsPostSource: $editAndRepostAsPostSource,
                    showReportSheet: $showReportSheet,
                    makeStoryExternalShareURL: makeStoryExternalShareURL,
                    storyTimeRemaining: storyTimeRemaining,
                    deleteCurrentStory: deleteCurrentStory,
                    repostAsPostDirect: repostAsPostDirect,
                    pauseTimer: pauseTimer,
                    dismissViewer: dismissViewer,
                    reportStory: reportStory
                )
                    .padding(.horizontal, 16)
                    .padding(.top, 10)

                Spacer()
            }

            // === Layer 8: Right action sidebar — centered vertically, right side ===
            HStack {
                Spacer()
                StoryActionSidebarView(
                    isOwnStory: isOwnStory,
                    storyReactionCount: storyReactionCount,
                    quickEmojis: quickEmojis,
                    onReplyToStory: onReplyToStory,
                    currentStory: currentStory,
                    currentGroup: currentGroup,
                    storyCommentCount: storyCommentCount,
                    isStoryCommentsEmpty: isStoryCommentsEmpty,
                    currentStoryNeedsVideoExport: currentStoryNeedsVideoExport,
                    storyHasAudioOrVideo: storyHasAudioOrVideo,
                    storyHasTranslatableContent: storyHasTranslatableContent,
                    isGlobalMuted: isGlobalMuted,
                    availableTranslationLanguages: availableTranslationLanguages,
                    showEmojiStrip: $showEmojiStrip,
                    showFullEmojiPicker: $showFullEmojiPicker,
                    showCommentsOverlay: $showCommentsOverlay,
                    showLanguageOptions: $showLanguageOptions,
                    showFullLanguagePicker: $showFullLanguagePicker,
                    showViewersSheet: $showViewersSheet,
                    showExportShareSheet: $showExportShareSheet,
                    isGlobalMutedBinding: $isGlobalMutedBinding,
                    sharedContentWrapper: $sharedContentWrapper,
                    repostStoryComposerSource: $repostStoryComposerSource,
                    isPresented: $isPresented,
                    triggerStoryReaction: triggerStoryReaction,
                    pauseTimer: pauseTimer,
                    loadStoryComments: loadStoryComments
                )
                    .padding(.trailing, 6)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)

            // === Layer 9: Big reaction emoji overlay (dramatic burst + float) ===
            if let emoji = bigReactionEmoji {
                Text(emoji)
                    .font(.system(size: 100))
                    .scaleEffect(bigReactionPhase == 1 ? 1.5 : (bigReactionPhase == 2 ? 0.5 : 0.05))
                    .opacity(bigReactionPhase == 2 ? 0 : (bigReactionPhase == 1 ? 1 : 0))
                    .offset(y: bigReactionPhase == 2 ? -280 : 0)
                    .rotationEffect(.degrees(bigReactionPhase == 1 ? -6 : (bigReactionPhase == 2 ? 12 : 0)))
                    .shadow(color: .black.opacity(0.3), radius: 20, y: 10)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layer 10: Live comments overlay (Instagram-style) ===
            if showCommentsOverlay {
                StoryCommentsOverlayView(
                    storyComments: storyComments,
                    storyCommentCount: storyCommentCount,
                    storyCommentRepliesMap: storyCommentRepliesMap,
                    storyCommentExpandedThreads: storyCommentExpandedThreads,
                    storyCommentLoadingReplies: storyCommentLoadingReplies,
                    isLoadingComments: isLoadingComments,
                    userLang: commentsUserLang,
                    composerAccentColor: composerAccentColor,
                    showCommentsOverlay: $showCommentsOverlay,
                    replyingToStoryComment: $replyingToStoryComment,
                    composerLanguage: $composerLanguage,
                    commentEffects: $commentEffects,
                    commentBlurEnabled: $commentBlurEnabled,
                    makeStoryCommentRow: makeStoryCommentRow,
                    toggleStoryCommentThread: toggleStoryCommentThread,
                    sendComment: sendComment
                )
                    .transition(.opacity)
                    .allowsHitTesting(true)
            }

            // Bottom area: composer + emoji panel / keyboard space
            VStack(spacing: 0) {
                Spacer()

                if !isOwnStory {
                    StoryComposerBarView(
                        accentColor: currentGroup?.avatarColor ?? "6366F1",
                        storyId: currentStory?.id,
                        composerLanguage: $composerLanguage,
                        commentEffects: $commentEffects,
                        commentBlurEnabled: $commentBlurEnabled,
                        isComposerEngaged: $isComposerEngaged,
                        showTextEmojiPicker: $showTextEmojiPicker,
                        hasComposerContent: $hasComposerContent,
                        emojiToInject: $emojiToInject,
                        composerFocusTrigger: $composerFocusTrigger,
                        storyDrafts: $storyDrafts,
                        sendComment: { text, effectFlags in
                            sendComment(text, effectFlags, nil)
                        }
                    )
                        .padding(.horizontal, 14)
                        .simultaneousGesture(
                            DragGesture(minimumDistance: 20, coordinateSpace: .local)
                                .onEnded { value in
                                    // Swipe down on composer → dismiss keyboard & disengage
                                    if value.translation.height > 40 && abs(value.translation.width) < value.translation.height {
                                        dismissComposer()
                                    }
                                }
                        )

                    // Inline emoji keyboard panel (replaces system keyboard)
                    if showTextEmojiPicker {
                        EmojiKeyboardPanel(
                            style: .dark,
                            onSelect: { emoji in
                                emojiToInject = emoji
                            }
                        )
                        .frame(height: max(keyboard.lastKnownHeight - geometry.safeAreaInsets.bottom, 260))
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
            }
            .padding(.bottom, composerBottomPadding(geometry))
            .animation(.easeInOut(duration: 0.25), value: keyboard.height)
            .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTextEmojiPicker)

            // Full emoji picker — REACTIONS ONLY (sends via API)
            if showFullEmojiPicker {
                EmojiFullPickerSheet(
                    style: .dark,
                    onReact: { emoji in
                        triggerStoryReaction(emoji)
                    },
                    onDismiss: {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            showFullEmojiPicker = false
                        }
                    }
                )
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(100)
            }

            // === Layer 10: Full Language Picker overlay (transparent — story stays visible) ===
            if showFullLanguagePicker {
                LanguagePickerSheet(style: .dark) { lang in
                    LanguageUsageTracker.recordUsage(languageId: lang.id)
                    guard let story = currentStory else { return }
                    Task {
                        let body: [String: String] = ["targetLanguage": lang.id]
                        let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                            endpoint: "/posts/\(story.id)/translate",
                            body: body
                        )
                    }
                } onDismiss: {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        showFullLanguagePicker = false
                    }
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .zIndex(150)
            }
        }
    }

    // MARK: - Story Background

    private var storyBackground: some View {
        Group {
            if let bg = currentStory?.storyEffects?.background {
                if bg.hasPrefix("gradient:") {
                    let colors = bg.replacingOccurrences(of: "gradient:", with: "").split(separator: ",").map { String($0) }
                    LinearGradient(
                        colors: colors.map { Color(hex: $0) },
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                } else {
                    Color(hex: bg)
                }
            } else {
                LinearGradient(
                    colors: [MeeshyColors.indigo950, MeeshyColors.indigo900, Color(hex: "24243E")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }

    // MARK: - Background Audio Badge

    private func backgroundAudioBadge(audio: StoryBackgroundAudioEntry) -> some View {
        HStack(spacing: 6) {
            Image(systemName: "music.note")
                .font(.system(size: 11, weight: .semibold))
            Text(audio.title)
                .font(.system(size: 12, weight: .medium))
                .lineLimit(1)
                .truncationMode(.tail)
            if let uploader = audio.uploaderName {
                Text("· \(uploader)")
                    .font(.system(size: 11))
                    .opacity(0.7)
                    .lineLimit(1)
            }
        }
        .foregroundColor(.white)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.35)))
        )
    }

    // MARK: - Translation Badge

    private var translationBadge: some View {
        HStack(spacing: 4) {
            Image(systemName: "translate")
                .font(.system(size: 10, weight: .semibold))
            if let lang = resolvedViewerLanguage {
                Text(lang.uppercased())
                    .font(.system(size: 9, weight: .bold, design: .monospaced))
            }
        }
        .foregroundColor(.white.opacity(0.8))
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.3)))
        )
    }
}

// MARK: - Story Viewer Content

/// Root canvas of the story viewer: opaque black base, offscreen prefetcher
/// host, and the geometry-wrapped story card with its transform stack and
/// lifecycle modifiers. Extracted from `StoryViewerView.viewerContent`
/// (formerly an `AnyView`) so the whole subtree is its own type-metadata
/// unit instead of inflating `StoryViewerView.body`'s opaque type.
struct StoryViewerContentView: View {
    let prefetcher: StoryReaderPrefetcher
    let isPreviewMode: Bool

    // Card transform inputs
    let cardScale: CGFloat
    let cardCornerRadius: CGFloat
    let cardOpacity: Double
    let cardOffsetY: CGFloat
    let totalSlideX: CGFloat
    let slideProgress: CGFloat
    let dragProgress: CGFloat

    @Binding var isPresented: Bool

    /// Builds the story card for the supplied geometry. The closure is owned by
    /// `StoryViewerView` so the card receives the view's `@State` bindings.
    let makeStoryCard: (GeometryProxy) -> StoryCardView

    var body: some View {
        ZStack {
            // Opaque black base — prevents any white frame bleed
            Color.black.ignoresSafeArea()

            // === P3 wire-up : offscreen prefetcher host ===
            PrefetcherHostView(prefetcher: prefetcher)
                .frame(width: 1, height: 1)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .zIndex(-1000)

            GeometryReader { geometry in
                ZStack {
                    // The story card with all transforms layered
                    makeStoryCard(geometry)
                        .scaleEffect(cardScale * (1.0 - slideProgress * 0.08))
                        .clipShape(RoundedRectangle(cornerRadius: cardCornerRadius + slideProgress * 16, style: .continuous))
                        .opacity(cardOpacity)
                        .offset(x: totalSlideX, y: cardOffsetY)
                        .rotation3DEffect(
                            .degrees(Double(-totalSlideX) / 25.0),
                            axis: (x: 0, y: 1, z: 0),
                            perspective: 0.6
                        )
                        .shadow(
                            color: .black.opacity(dragProgress > 0.05 || slideProgress > 0.02 ? 0.5 : 0),
                            radius: 40, y: 15
                        )

                    // Bouton ✕ uniquement en preview mode
                    if isPreviewMode {
                        VStack {
                            HStack {
                                Button {
                                    isPresented = false
                                } label: {
                                    Image(systemName: "xmark")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(.white)
                                        .frame(width: 36, height: 36)
                                        .background(Circle().fill(Color.black.opacity(0.5)))
                                }
                                .accessibilityLabel("Fermer la story")
                                .padding(.leading, 16)
                                .padding(.top, max(geometry.safeAreaInsets.top, 59) + 4)
                                Spacer()
                            }
                            Spacer()
                        }
                    }
                }
            }
        }
    }
}
