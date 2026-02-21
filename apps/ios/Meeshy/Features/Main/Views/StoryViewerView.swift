import SwiftUI
import Combine
import MeeshySDK

/// Draft state for a single story's composer
private struct StoryDraft {
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
    @State private var storyDrafts: [String: StoryDraft] = [:]

    @ObservedObject private var theme = ThemeManager.shared

    let storyDuration: Double = 5.0 // internal for cross-file extension access
    @State var timerCancellable: AnyCancellable? // internal for cross-file extension access

    @State var showFullEmojiPicker = false // internal for cross-file extension access
    @State var showTextEmojiPicker = false // internal for cross-file extension access
    @State private var showProfileAlert = false
    @State private var emojiToInject = ""
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

    // Horizontal swipe (group ↔ group)
    @State var horizontalDrag: CGFloat = 0 // internal for cross-file extension access
    @State var gestureAxis: Int = 0 // internal for cross-file extension access  // 0=undecided, 1=horizontal, 2=vertical

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

    private let quickEmojis = ["❤️", "😂", "😮", "🔥", "😢", "👏"]

    // MARK: - Story Card

    private func storyCard(geometry: GeometryProxy) -> some View {
        ZStack {
            // === Layer 1: Background ===
            // Color/gradient fallback (always present)
            storyBackground(geometry: geometry)

            // === Outgoing Layers (cross-dissolve: old content fades out behind new) ===
            if let outgoing = outgoingStory, outgoingOpacity > 0 {
                // Outgoing media
                if let media = outgoing.media.first, media.type == .image || media.type == .video {
                    mediaOverlay(media: media, geometry: geometry)
                        .opacity(outgoingOpacity)
                }
                // Outgoing text + stickers
                VStack(spacing: 8) {
                    if let content = outgoing.content, !content.isEmpty {
                        storyTextContent(content, storyEffects: outgoing.storyEffects)
                    }
                    if let stickers = outgoing.storyEffects?.stickers, !stickers.isEmpty {
                        HStack(spacing: 8) {
                            ForEach(stickers, id: \.self) { sticker in
                                Text(sticker)
                                    .font(.system(size: 40))
                            }
                        }
                    }
                }
                .opacity(outgoingOpacity)
                .padding(.top, geometry.safeAreaInsets.top + 80)
                .padding(.bottom, 120)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }

            // === Layer 2: Media image/video (fills as background) ===
            if let media = currentStory?.media.first, media.type == .image || media.type == .video {
                mediaOverlay(media: media, geometry: geometry)
                    .opacity(contentOpacity)
            }

            // === Layer 3: Filter overlay (tint on top of image) ===
            filterOverlay

            // === Layer 4: Text content + stickers (with parallax slide on transition) ===
            VStack(spacing: 8) {
                if let content = currentStory?.content, !content.isEmpty {
                    storyTextContent(content)
                }

                if let stickers = currentStory?.storyEffects?.stickers, !stickers.isEmpty {
                    HStack(spacing: 8) {
                        ForEach(stickers, id: \.self) { sticker in
                            Text(sticker)
                                .font(.system(size: 40))
                        }
                    }
                }
            }
            .opacity(contentOpacity)
            .offset(y: textSlideOffset)
            .padding(.top, geometry.safeAreaInsets.top + 80)
            .padding(.bottom, 120)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

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
                .frame(height: geometry.safeAreaInsets.top + 110)
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

            // === Layer 6: Top UI (progress bars + header) — ALWAYS visible ===
            VStack(spacing: 0) {
                progressBars
                    .padding(.top, geometry.safeAreaInsets.top + 8)
                    .padding(.horizontal, 12)

                storyHeader
                    .padding(.horizontal, 16)
                    .padding(.top, 12)

                Spacer()
            }

            // === Layer 7: Gesture overlay (tap left/right, long press) ===
            gestureOverlay(geometry: geometry)

            // === Layer 8: Right action sidebar ===
            HStack {
                Spacer()
                storyActionSidebar
                    .padding(.trailing, 10)
            }
            .padding(.bottom, 100 + geometry.safeAreaInsets.bottom)

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
            }

            // Bottom area: composer + emoji panel / keyboard space
            VStack(spacing: 0) {
                Spacer()

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
        }
    }

    // MARK: - Right Action Sidebar

    private var storyActionSidebar: some View {
        VStack(spacing: 16) {
            // Heart/reaction toggle button — emoji picker floats as overlay
            sidebarButton(
                icon: "heart.fill",
                color: showEmojiStrip ? Color(hex: "FF2E63") : .white,
                bgOpacity: showEmojiStrip ? 0.25 : 0.15
            ) {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                    showEmojiStrip.toggle()
                }
            }
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
                    .offset(x: -52)
                }
            }
            .zIndex(10)

            // Reply (scroll to/focus composer)
            sidebarButton(icon: "arrowshape.turn.up.left.fill", color: .white) {
                HapticFeedback.light()
            }

            // Reshare
            sidebarButton(icon: "arrow.2.squarepath", color: .white) {
                reshareStory()
            }

            // Language
            sidebarButton(icon: "globe", color: .white) {
                HapticFeedback.light()
            }
        }
    }

    private func sidebarButton(
        icon: String,
        color: Color,
        bgOpacity: Double = 0.15,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(color)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(.ultraThinMaterial)
                        .overlay(Circle().fill(Color.black.opacity(bgOpacity)))
                        .overlay(Circle().stroke(Color.white.opacity(0.12), lineWidth: 0.5))
                )
                .shadow(color: .black.opacity(0.2), radius: 6, y: 3)
        }
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
            placeholder: "Répondre...",
            onSend: { text in sendReply(text: text) },
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
                    colors: [Color(hex: "0F0C29"), Color(hex: "302B63"), Color(hex: "24243E")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
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
                                        colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B"), Color(hex: "08D9D6")],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )) :
                                    AnyShapeStyle(Color.white)
                                )
                                .frame(width: w)
                                .shadow(
                                    color: index == currentStoryIndex ? Color(hex: "FF2E63").opacity(0.6) : .clear,
                                    radius: 4, y: 0
                                )
                        }
                    }
                    .frame(height: 2.5)
                }
            }
        }
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

    private var storyHeader: some View {
        HStack(spacing: 12) {
            if let group = currentGroup {
                // Avatar with tap/longpress interactions
                MeeshyAvatar(
                    name: group.username,
                    mode: .custom(32),
                    accentColor: group.avatarColor,
                    onViewProfile: { showProfileAlert = true },
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            showProfileAlert = true
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(group.username)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)
                        .onTapGesture {
                            HapticFeedback.light()
                            showProfileAlert = true
                        }

                    if let story = currentStory {
                        HStack(spacing: 4) {
                            Text(story.timeAgo)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))

                            if let expiresAt = story.expiresAt, expiresAt.timeIntervalSinceNow > 0 {
                                Text("\u{00B7}")
                                    .foregroundColor(.white.opacity(0.35))
                                Text(storyTimeRemaining(expiresAt))
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(.white.opacity(0.45))
                            }
                        }
                    }
                }
            }

            Spacer()

            // Close button
            Button {
                HapticFeedback.light()
                dismissViewer()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 32, height: 32)
                    .background(Circle().fill(Color.white.opacity(0.2)))
            }
        }
        .alert("Navigation", isPresented: $showProfileAlert) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Naviguer vers le profil de \(currentGroup?.username ?? "")")
        }
    }

    // MARK: - Content, Gestures, Navigation, Timer & Actions (see StoryViewerView+Content.swift)
}
