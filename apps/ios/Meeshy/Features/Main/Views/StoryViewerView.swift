import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct SharedContentWrapper: Identifiable {
    let id = UUID()
    let content: SharedContentType
}

/// Draft state for a single story's composer
struct StoryDraft {
    var text: String = ""
    var attachments: [ComposerAttachment] = []
}

struct StoryViewerView: View {
    @ObservedObject var viewModel: StoryViewModel
    let groups: [StoryGroup]
    @State var currentGroupIndex: Int
    @Binding var isPresented: Bool
    var onReplyToStory: ((ReplyContext) -> Void)? = nil

    @State var currentStoryIndex = 0 // internal for cross-file extension access
    @State var progress: CGFloat = 0 // internal for cross-file extension access
    @State var isPaused = false // internal for cross-file extension access
    /// True when user is actively engaging with the composer (focused, recording, emoji panel, etc.)
    @State var isComposerEngaged = false // internal for cross-file extension access
    /// True when composer has pending content (text, attachments, or recording)
    @State var hasComposerContent = false // internal for cross-file extension access

    // Per-story draft storage
    @State var storyDrafts: [String: StoryDraft] = [:]

    @ObservedObject private var theme = ThemeManager.shared

    let storyDuration: Double = 5.0 // internal for cross-file extension access
    @State var timerCancellable: AnyCancellable? // internal for cross-file extension access

    @State var showFullEmojiPicker = false // internal for cross-file extension access
    @State var showTextEmojiPicker = false // internal for cross-file extension access
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var emojiToInject = ""
    @State private var composerFocusTrigger = false
    @State var showLanguageOptions = false // internal for cross-file extension access
    @State var showFullLanguagePicker = false // internal for cross-file extension access
    @StateObject private var keyboard = KeyboardObserver()

    // === Transition states ===

    // Appear
    @State private var appearScale: CGFloat = 0.45
    @State private var appearCornerRadius: CGFloat = 32
    @State private var appearOpacity: Double = 0

    // Dismiss
    @State var isDismissing = false // internal for cross-file extension access
    @State var dragOffset: CGFloat = 0 // internal for cross-file extension access

    // Group slide (group ↔ group)
    @State var groupSlide: CGFloat = 0 // internal for cross-file extension access

    // Content cross-fade (story ↔ story within group)
    @State var contentOpacity: Double = 1 // internal for cross-file extension access

    // Outgoing layer for true cross-dissolve (old stays visible while new fades in)
    @State var outgoingStory: StoryItem? = nil // internal for cross-file extension access
    @State var outgoingOpacity: Double = 0 // internal for cross-file extension access

    // Transition lock — prevents overlapping animations
    @State var isTransitioning = false // internal for cross-file extension access

    // Text parallax offset (slides up during cross-dissolve for depth)
    @State var textSlideOffset: CGFloat = 0 // internal for cross-file extension access

    // Opening effect animation states
    @State var openingScale: CGFloat = 1.0        // internal for cross-file extension access
    @State var isRevealActive: Bool = false       // internal for cross-file extension access
    @State var closingScale: CGFloat = 1.0        // internal for cross-file extension access

    // Horizontal swipe (group ↔ group)
    @State var horizontalDrag: CGFloat = 0 // internal for cross-file extension access
    @State var gestureAxis: Int = 0 // internal for cross-file extension access  // 0=undecided, 1=horizontal, 2=vertical
    @State var showViewersSheet = false

    private var screenH: CGFloat { UIScreen.main.bounds.height }

    var screenW: CGFloat { UIScreen.main.bounds.width } // internal for cross-file extension access

    // Drag dismiss progress 0–1
    private var dragProgress: CGFloat {
        min(max(dragOffset / 350, 0), 1)
    }

    // Combined horizontal offset (programmatic slide + interactive drag)
    private var totalSlideX: CGFloat {
        groupSlide + horizontalDrag * 0.5
    }

    // Depth effect from horizontal movement (slight scale + rotation)
    private var slideProgress: CGFloat {
        min(abs(totalSlideX) / screenW, 1.0)
    }

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                // Opaque black base — prevents any white frame bleed
                Color.black.ignoresSafeArea()

                // The story card with all transforms layered
                storyCard(geometry: geometry)
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

            }
        }
        .ignoresSafeArea()
        .statusBarHidden()
        .gesture(unifiedDragGesture)
        .onAppear {
            startTimer()
            markCurrentViewed()
            prefetchCurrentGroup()
            // Entrance: scale up from small card to fullscreen
            withAnimation(.spring(response: 0.55, dampingFraction: 0.78)) {
                appearScale = 1.0
                appearCornerRadius = 0
                appearOpacity = 1
            }
        }
        .onDisappear {
            timerCancellable?.cancel()
        }
        .sheet(isPresented: $showViewersSheet, onDismiss: {
            resumeTimer()
        }) {
            if let story = currentStory {
                StoryViewersSheet(story: story, accentColor: Color(hex: "4ECDC4"))
            }
        }
        .sheet(item: $sharedContentWrapper, onDismiss: {
            resumeTimer()
        }) { wrapper in
            SharePickerView(
                sharedContent: wrapper.content,
                onDismiss: { sharedContentWrapper = nil },
                onShareToConversation: nil
            )
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Computed Card Transforms

    private var cardScale: CGFloat {
        if isDismissing { return 0.12 }
        return appearScale * (1.0 - dragProgress * 0.35)
    }

    private var cardCornerRadius: CGFloat {
        if isDismissing { return 32 }
        return max(appearCornerRadius, dragProgress * 36)
    }

    private var cardOpacity: Double {
        if isDismissing { return 0 }
        return appearOpacity * (1.0 - Double(dragProgress) * 0.3)
    }

    private var cardOffsetY: CGFloat {
        if isDismissing { return -screenH * 0.35 }
        return dragOffset * 0.5
    }

    @State var showEmojiStrip = false // internal for cross-file extension access
    @State private var bigReactionEmoji: String?
    @State private var bigReactionPhase: Int = 0
    @State private var sharedContentWrapper: SharedContentWrapper?

    private let quickEmojis = ["❤️", "😂", "😮", "🔥", "😢", "👏"]

    // MARK: - Story Card

    private func storyCard(geometry: GeometryProxy) -> some View {
        ZStack {
            // === Layer 1: Background ===
            // Color/gradient fallback (always present)
            storyBackground(geometry: geometry)

            // === Outgoing canvas (cross-dissolve pixel-perfect) ===
            if let outgoing = outgoingStory, outgoingOpacity > 0 {
                StoryCanvasReaderView(story: outgoing, preferredLanguage: resolvedViewerLanguage)
                    .opacity(outgoingOpacity)
                    .scaleEffect(closingScale)
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            // === Layers 2–4: Canvas pixel-perfect (media + filter + text + stickers) ===
            if let story = currentStory {
                StoryCanvasReaderView(story: story, preferredLanguage: resolvedViewerLanguage)
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
                        .padding(.bottom, max(geometry.safeAreaInsets.top, 59) + 130)
                }
                .allowsHitTesting(false)
                .transition(.opacity)
            }

            // === Background audio badge ===
            if let audio = currentStory?.backgroundAudio {
                VStack {
                    Spacer()
                    backgroundAudioBadge(audio: audio)
                        .padding(.bottom, max(geometry.safeAreaInsets.top, 59) + 165)
                }
                .frame(maxWidth: .infinity, alignment: .center)
                .allowsHitTesting(false)
            }

            // === Translation indicator (Prisme Linguistique — discret) ===
            if isContentTranslated {
                translationBadge
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
                    .padding(.trailing, 16)
                    .padding(.bottom, max(geometry.safeAreaInsets.top, 59) + 175)
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
                .frame(height: max(geometry.safeAreaInsets.top, 59) + 110)
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
            gestureOverlay(geometry: geometry)

            // === Layer 7: Top UI (progress bars + header) — ABOVE gesture overlay for hit testing ===
            // min 59pt accounts for Dynamic Island when .statusBarHidden() zeroes safeAreaInsets
            VStack(spacing: 0) {
                progressBars
                    .padding(.horizontal, 12)
                    .padding(.top, max(geometry.safeAreaInsets.top, 59) + 4)

                storyHeader
                    .padding(.horizontal, 16)
                    .padding(.top, 10)

                Spacer()
            }

            // === Layer 8: Right action sidebar — centered vertically, right side ===
            HStack {
                Spacer()
                storyActionSidebar
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

            // Bottom area: composer + emoji panel / keyboard space
            VStack(spacing: 0) {
                Spacer()

                if !isOwnStory {
                    storyComposerBar
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
            .padding(.bottom, composerBottomPadding(geometry: geometry))
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

    // MARK: - Right Action Sidebar

    @State private var heartScale: CGFloat = 1.0

    private var isOwnStory: Bool {
        currentGroup?.id == AuthManager.shared.currentUser?.id
    }

    private var storyActionSidebar: some View {
        VStack(spacing: 20) {
            // 1. Reaction (heart) — primary action, brand-colored when active
            if !isOwnStory {
                storyActionButton(
                    icon: "heart.fill",
                    label: "React",
                    isActive: showEmojiStrip,
                    activeColor: MeeshyColors.pink,
                    activeGlow: MeeshyColors.pink
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showEmojiStrip.toggle()
                    }
                }
                .scaleEffect(heartScale)
                .overlay(alignment: .trailing) {
                    if showEmojiStrip {
                        EmojiReactionPicker(
                            quickEmojis: quickEmojis,
                            style: .dark,
                            onReact: { emoji in
                                triggerStoryReaction(emoji)
                            },
                            onDismiss: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                }
                            },
                            onExpandFullPicker: {
                                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                    showEmojiStrip = false
                                    showFullEmojiPicker = true
                                }
                            }
                        )
                        .fixedSize()
                        .transition(.asymmetric(
                            insertion: .scale(scale: 0.8, anchor: .trailing).combined(with: .opacity),
                            removal: .opacity
                        ))
                        .offset(x: -56)
                    }
                }
                .zIndex(10)
            }

            // 2. Forward (send to someone)
            storyActionButton(
                icon: "paperplane.fill",
                label: "Envoyer"
            ) {
                HapticFeedback.light()
                pauseTimer()
                if let story = currentStory, let group = currentGroup {
                    sharedContentWrapper = SharedContentWrapper(content: .story(item: story, authorName: group.username))
                }
            }

            // 3. Reshare (republish to own story) — hidden for own stories
            if !isOwnStory {
                storyActionButton(
                    icon: "arrow.2.squarepath",
                    label: "Partager"
                ) {
                    reshareStory()
                }
            } else {
                storyActionButton(
                    icon: "eye.fill",
                    label: "Vues"
                ) {
                    HapticFeedback.light()
                    pauseTimer()
                    showViewersSheet = true
                }
            }

            // 4. Translate — brand cyan when active
            if !isOwnStory {
                storyActionButton(
                    icon: "textformat.abc",
                    label: "Traductions",
                    isActive: showLanguageOptions,
                    activeColor: MeeshyColors.cyan,
                    activeGlow: MeeshyColors.cyan
                ) {
                    HapticFeedback.light()
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        showLanguageOptions.toggle()
                    }
                }
                .overlay(alignment: .trailing) {
                    if showLanguageOptions {
                        languageScrollStrip
                            .transition(.asymmetric(
                                insertion: .scale(scale: 0.8, anchor: .trailing).combined(with: .opacity),
                                removal: .opacity
                            ))
                            .offset(x: -56)
                    }
                }
                .zIndex(10)
            }
        }
    }

    private func storyActionButton(
        icon: String,
        label: String,
        isActive: Bool = false,
        activeColor: Color = .white,
        activeGlow: Color? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            action()
        } label: {
            VStack(spacing: 4) {
                ZStack {
                    // Outer glow when active
                    if isActive, let glow = activeGlow {
                        Circle()
                            .fill(glow.opacity(0.2))
                            .frame(width: 52, height: 52)
                            .blur(radius: 4)
                    }

                    Circle()
                        .fill(.ultraThinMaterial)
                        .overlay(
                            Circle()
                                .fill(isActive ? activeColor.opacity(0.15) : Color.black.opacity(0.15))
                        )
                        .overlay(
                            Circle()
                                .stroke(
                                    isActive ?
                                        AnyShapeStyle(activeColor.opacity(0.4)) :
                                        AnyShapeStyle(Color.white.opacity(0.12)),
                                    lineWidth: isActive ? 1 : 0.5
                                )
                        )
                        .frame(width: 46, height: 46)

                    Image(systemName: icon)
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(isActive ? activeColor : .white)
                        .symbolEffect(.bounce, value: isActive)
                }
                .shadow(
                    color: isActive ? (activeGlow ?? activeColor).opacity(0.3) : .black.opacity(0.2),
                    radius: isActive ? 8 : 4,
                    y: isActive ? 0 : 2
                )

                Text(label)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white.opacity(isActive ? 0.95 : 0.65))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .frame(width: 56)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityHint(isActive ? "\(label) actif, toucher pour desactiver" : "Toucher pour \(label.lowercased())")
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }

    // MARK: - Language Scroll Strip

    private var languageScrollStrip: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(LanguageUsageTracker.sorted(TranslationLanguage.all)) { lang in
                        Button {
                            HapticFeedback.light()
                            LanguageUsageTracker.recordUsage(languageId: lang.id)
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                showLanguageOptions = false
                            }
                            guard let story = currentStory else { return }
                            Task {
                                let body: [String: String] = ["targetLanguage": lang.id]
                                let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                                    endpoint: "/posts/\(story.id)/translate",
                                    body: body
                                )
                            }
                        } label: {
                            Text(lang.flag)
                                .font(.system(size: 22))
                                .frame(width: 38, height: 38)
                                .background(Circle().fill(Color.white.opacity(0.1)))
                        }
                        .accessibilityLabel("Traduire en \(lang.name)")
                    }
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
            }
            .frame(width: 222, height: 50)

            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    showLanguageOptions = false
                }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showFullLanguagePicker = true
                }
            } label: {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.15))
                        .frame(width: 38, height: 38)
                    Image(systemName: "plus")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white.opacity(0.85))
                }
            }
            .padding(.trailing, 10)
            .padding(.vertical, 6)
            .accessibilityLabel("Plus de langues")
            .accessibilityHint("Ouvre la liste complete des langues")
        }
        .background(
            Capsule()
                .fill(.ultraThinMaterial)
                .overlay(Capsule().fill(Color.black.opacity(0.4)))
                .overlay(Capsule().stroke(Color.white.opacity(0.1), lineWidth: 0.5))
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Selection de langue de traduction")
    }

    // MARK: - Story Reactions

    private func triggerStoryReaction(_ emoji: String) {
        HapticFeedback.medium()

        // Big floating emoji — dramatic 3-phase animation
        bigReactionEmoji = emoji
        bigReactionPhase = 0
        // Phase 1: burst in with overshoot
        withAnimation(.spring(response: 0.25, dampingFraction: 0.4)) {
            bigReactionPhase = 1
        }
        // Phase 1.5: subtle pulse at peak (secondary haptic)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            HapticFeedback.light()
        }
        // Phase 2: float up and dissolve
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
            withAnimation(.easeOut(duration: 0.6)) { bigReactionPhase = 2 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) {
            bigReactionEmoji = nil
            bigReactionPhase = 0
        }

        // Collapse strip after reaction (timer auto-resumes when showEmojiStrip=false)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showEmojiStrip = false
            }
        }

        sendReaction(emoji: emoji)
    }

    // MARK: - Bottom Composer

    private var storyComposerBar: some View {
        UniversalComposerBar(
            style: .dark,
            placeholder: "Commenter...",
            onSend: { text in sendComment(text: text) },
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
            storyId: currentStory?.id,
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

    // MARK: - Computed Bottom Padding

    private func composerBottomPadding(geometry: GeometryProxy) -> CGFloat {
        if showTextEmojiPicker {
            // Emoji panel is showing — just need safe area below it
            return geometry.safeAreaInsets.bottom
        } else if keyboard.isVisible {
            // Keyboard is showing — push everything above it
            return keyboard.height
        } else {
            // Default — safe area + breathing room
            return geometry.safeAreaInsets.bottom + 20
        }
    }

    // MARK: - Current State

    var currentGroup: StoryGroup? { // internal for cross-file extension access
        guard currentGroupIndex >= 0 && currentGroupIndex < groups.count else { return nil }
        return groups[currentGroupIndex]
    }

    var currentStory: StoryItem? { // internal for cross-file extension access
        guard let group = currentGroup,
              currentStoryIndex >= 0 && currentStoryIndex < group.stories.count else { return nil }
        return group.stories[currentStoryIndex]
    }

    private var resolvedViewerLanguage: String? {
        AuthManager.shared.currentUser?.systemLanguage
    }

    var isContentTranslated: Bool { // internal for cross-file extension access
        guard let story = currentStory,
              let viewerLang = resolvedViewerLanguage,
              let translations = story.translations,
              !translations.isEmpty else { return false }
        return translations.contains { $0.language == viewerLang }
    }

    // MARK: - Story Background

    private func storyBackground(geometry: GeometryProxy) -> some View {
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
                    colors: [MeeshyColors.darkBlue, MeeshyColors.deepPurple, Color(hex: "24243E")],
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

    // MARK: - Voice Caption

    var currentVoiceCaption: String? { // internal for cross-file extension access
        guard let effects = currentStory?.storyEffects,
              effects.voiceAttachmentId != nil,
              let transcriptions = effects.voiceTranscriptions,
              !transcriptions.isEmpty else { return nil }
        let lang = resolvedViewerLanguage ?? "en"
        return transcriptions.first { $0.language == lang }?.content
            ?? transcriptions.first?.content
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

    // MARK: - Progress Bars

    private var progressBars: some View {
        HStack(spacing: 3) {
            if let group = currentGroup {
                ForEach(Array(group.stories.enumerated()), id: \.element.id) { index, _ in
                    GeometryReader { barGeo in
                        let w = progressWidth(for: index, totalWidth: barGeo.size.width)
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.2))
                            Capsule()
                                .fill(
                                    index == currentStoryIndex ?
                                    AnyShapeStyle(LinearGradient(
                                        colors: [MeeshyColors.pink, MeeshyColors.coral, MeeshyColors.cyan],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )) :
                                    AnyShapeStyle(Color.white)
                                )
                                .frame(width: w)
                                .shadow(
                                    color: index == currentStoryIndex ? MeeshyColors.pink.opacity(0.6) : .clear,
                                    radius: 4, y: 0
                                )
                        }
                    }
                    .frame(height: 3)
                    .accessibilityHidden(true)
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Story \(currentStoryIndex + 1) sur \(currentGroup?.stories.count ?? 0)")
        .accessibilityValue("\(Int(progress * 100)) pourcent")
    }

    private func progressWidth(for index: Int, totalWidth: CGFloat) -> CGFloat {
        if index < currentStoryIndex {
            return totalWidth
        } else if index == currentStoryIndex {
            return totalWidth * progress
        } else {
            return 0
        }
    }

    // MARK: - Header

    @State private var showStoryOptions = false
    @State private var avatarLongPressGlow = false
    @State private var showReportSheet = false

    private var storyHeader: some View {
        HStack(spacing: 10) {
            if let group = currentGroup {
                Button {
                    HapticFeedback.light()
                    selectedProfileUser = .from(storyGroup: group)
                } label: {
                    HStack(spacing: 10) {
                        ZStack {
                            // Glow radial au long press
                            if avatarLongPressGlow {
                                Circle()
                                    .fill(
                                        RadialGradient(
                                            colors: [
                                                Color(hex: group.avatarColor).opacity(0.4),
                                                MeeshyColors.pink.opacity(0.2),
                                                .clear
                                            ],
                                            center: .center,
                                            startRadius: 15,
                                            endRadius: 35
                                        )
                                    )
                                    .frame(width: 70, height: 70)
                                    .blur(radius: 8)
                                    .transition(.scale(scale: 0.8).combined(with: .opacity))
                                    .allowsHitTesting(false)
                            }

                            MeeshyAvatar(
                                name: group.username,
                                mode: .custom(40),
                                accentColor: group.avatarColor,
                                onViewProfile: { selectedProfileUser = .from(storyGroup: group) },
                                contextMenuItems: [
                                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                                        selectedProfileUser = .from(storyGroup: group)
                                    }
                                ]
                            )
                            .overlay(
                                Circle()
                                    .stroke(
                                        LinearGradient(
                                            colors: [MeeshyColors.pink, MeeshyColors.cyan],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        ),
                                        lineWidth: avatarLongPressGlow ? 3 : 2
                                    )
                                    .frame(width: 44, height: 44)
                                    .shadow(
                                        color: avatarLongPressGlow ? MeeshyColors.pink.opacity(0.6) : .clear,
                                        radius: 12,
                                        y: 0
                                    )
                            )
                            .scaleEffect(avatarLongPressGlow ? 1.05 : 1.0)
                        }
                        .onLongPressGesture(minimumDuration: 0.4) {
                            HapticFeedback.medium()
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                avatarLongPressGlow = false
                            }
                            selectedProfileUser = .from(storyGroup: group)
                        } onPressingChanged: { pressing in
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                avatarLongPressGlow = pressing
                            }
                        }

                        VStack(alignment: .leading, spacing: 2) {
                            Text(group.username)
                                .font(.system(size: 15, weight: .bold))
                                .foregroundColor(.white)

                            if let story = currentStory {
                                HStack(spacing: 4) {
                                    Text(story.timeAgo)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundColor(.white.opacity(0.75))

                                    if story.repostOfId != nil {
                                        Image(systemName: "arrow.2.squarepath")
                                            .font(.system(size: 10, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.6))
                                    }

                                    if let expiresAt = story.expiresAt, expiresAt.timeIntervalSinceNow > 0 {
                                        Text("\u{00B7}")
                                            .foregroundColor(.white.opacity(0.4))
                                        Image(systemName: "clock")
                                            .font(.system(size: 9, weight: .semibold))
                                            .foregroundColor(.white.opacity(0.5))
                                        Text(storyTimeRemaining(expiresAt))
                                            .font(.system(size: 12, weight: .medium))
                                            .foregroundColor(.white.opacity(0.55))
                                    }
                                }
                            }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .frame(minHeight: 44)
                .accessibilityLabel("Profil de \(group.username)")
                .accessibilityHint("Ouvre le profil de \(group.username)")
            }

            Spacer()

            // Options menu (three dots)
            Menu {
                if let _ = currentStory, let group = currentGroup {
                    if isOwnStory {
                        Button(role: .destructive) {
                            deleteCurrentStory()
                        } label: {
                            Label("Supprimer", systemImage: "trash")
                        }
                    } else {
                        Button {
                            selectedProfileUser = .from(storyGroup: group)
                        } label: {
                            Label("Voir le profil", systemImage: "person.fill")
                        }

                        Button {
                            reshareStory()
                        } label: {
                            Label("Republier", systemImage: "arrow.2.squarepath")
                        }

                        Divider()

                        Button(role: .destructive) {
                            showReportSheet = true
                        } label: {
                            Label("Signaler", systemImage: "exclamationmark.triangle")
                        }
                    }
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .overlay(Circle().fill(Color.black.opacity(0.15)))
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Options de la story")

            // Close button
            Button {
                HapticFeedback.light()
                dismissViewer()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(
                        Circle()
                            .fill(.ultraThinMaterial)
                            .overlay(Circle().fill(Color.black.opacity(0.2)))
                            .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                    )
                    .shadow(color: .black.opacity(0.15), radius: 4, y: 2)
            }
            .frame(minWidth: 44, minHeight: 44)
            .accessibilityLabel("Fermer")
            .accessibilityHint("Ferme le lecteur de stories")
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showReportSheet) {
            ReportMessageSheet(accentColor: currentGroup?.avatarColor ?? "FF2D55") { type, reason in
                guard let storyId = currentStory?.id else { return }
                Task {
                    do {
                        try await ReportService.shared.reportStory(storyId: storyId, reportType: type, reason: reason)
                        DispatchQueue.main.async {
                            HapticFeedback.success()
                            showReportSheet = false
                        }
                    } catch {
                        DispatchQueue.main.async {
                            HapticFeedback.error()
                            showReportSheet = false
                        }
                    }
                }
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }

    // MARK: - Content, Gestures, Navigation, Timer & Actions (see StoryViewerView+Content.swift)
}
