import SwiftUI
import Combine

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

    @State private var currentStoryIndex = 0
    @State private var progress: CGFloat = 0
    @State private var isPaused = false
    /// True when user is actively engaging with the composer (focused, recording, emoji panel, etc.)
    @State private var isComposerEngaged = false

    // Per-story draft storage
    @State private var storyDrafts: [String: StoryDraft] = [:]

    @ObservedObject private var theme = ThemeManager.shared

    private let storyDuration: Double = 5.0
    @State private var timerCancellable: AnyCancellable?

    @State private var showFullEmojiPicker = false
    @State private var showTextEmojiPicker = false
    @State private var emojiToInject = ""
    @StateObject private var keyboard = KeyboardObserver()

    // === Transition states ===

    // Appear
    @State private var appearScale: CGFloat = 0.45
    @State private var appearCornerRadius: CGFloat = 32
    @State private var appearOpacity: Double = 0

    // Dismiss
    @State private var isDismissing = false
    @State private var dragOffset: CGFloat = 0

    // Group slide (group ↔ group)
    @State private var groupSlide: CGFloat = 0

    // Content cross-fade (story ↔ story within group)
    @State private var contentOpacity: Double = 1

    // Outgoing layer for true cross-dissolve (old stays visible while new fades in)
    @State private var outgoingStory: StoryItem? = nil
    @State private var outgoingOpacity: Double = 0

    // Transition lock — prevents overlapping animations
    @State private var isTransitioning = false

    // Horizontal swipe (group ↔ group)
    @State private var horizontalDrag: CGFloat = 0
    @State private var gestureAxis: Int = 0 // 0=undecided, 1=horizontal, 2=vertical

    private var screenH: CGFloat { UIScreen.main.bounds.height }

    private var screenW: CGFloat { UIScreen.main.bounds.width }

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

    @State private var showEmojiStrip = false
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

            // === Layer 4: Text content + stickers ===
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
            .padding(.top, geometry.safeAreaInsets.top + 80)
            .padding(.bottom, 120)
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            // === Layer 5: Gradient scrims for readability over photos ===
            VStack {
                LinearGradient(colors: [.black.opacity(0.6), .black.opacity(0.0)], startPoint: .top, endPoint: .bottom)
                    .frame(height: geometry.safeAreaInsets.top + 100)
                Spacer()
                LinearGradient(colors: [.black.opacity(0.0), .black.opacity(0.5)], startPoint: .top, endPoint: .bottom)
                    .frame(height: 160)
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

            // === Layer 9: Big reaction emoji overlay ===
            if let emoji = bigReactionEmoji {
                Text(emoji)
                    .font(.system(size: 90))
                    .scaleEffect(bigReactionPhase == 1 ? 1.4 : (bigReactionPhase == 2 ? 0.6 : 0.1))
                    .opacity(bigReactionPhase == 2 ? 0 : (bigReactionPhase == 1 ? 1 : 0))
                    .offset(y: bigReactionPhase == 2 ? -250 : 0)
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
                                    UIApplication.shared.sendAction(
                                        #selector(UIResponder.resignFirstResponder),
                                        to: nil, from: nil, for: nil
                                    )
                                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                        showTextEmojiPicker = false
                                    }
                                    isComposerEngaged = false
                                    resumeTimer()
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
                        resumeTimer()
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
                if showEmojiStrip { pauseTimer() } else { resumeTimer() }
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
                            resumeTimer()
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
                pauseTimer()
            }

            // Reshare
            sidebarButton(icon: "arrow.2.squarepath", color: .white) {
                pauseTimer()
                reshareStory()
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    if !isComposerEngaged { resumeTimer() }
                }
            }

            // Language
            sidebarButton(icon: "globe", color: .white) {
                HapticFeedback.light()
                pauseTimer()
                // Auto-resume after brief interaction
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    if !isComposerEngaged {
                        resumeTimer()
                    }
                }
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
        HapticFeedback.light()

        // Big floating emoji
        bigReactionEmoji = emoji
        bigReactionPhase = 0
        withAnimation(.spring(response: 0.3, dampingFraction: 0.45)) {
            bigReactionPhase = 1
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
            withAnimation(.easeOut(duration: 0.5)) { bigReactionPhase = 2 }
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) {
            bigReactionEmoji = nil
            bigReactionPhase = 0
        }

        // Collapse strip after reaction
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                showEmojiStrip = false
            }
            resumeTimer()
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
                    pauseTimer()
                } else {
                    // Only disengage if emoji panel isn't showing
                    if !showTextEmojiPicker {
                        isComposerEngaged = false
                    }
                    resumeTimer()
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
                pauseTimer()
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
                // Pause the timer on any interaction, but only set isComposerEngaged
                // for sustained interactions (focus, recording, emoji panel).
                // Simple taps (button presses) just pause the timer temporarily.
                pauseTimer()
                // Auto-resume after a short delay if no sustained interaction took over
                DispatchQueue.main.asyncAfter(deadline: .now() + 3.0) {
                    if !isComposerEngaged {
                        resumeTimer()
                    }
                }
            },
            onRecordingChange: { recording in
                if recording {
                    isComposerEngaged = true
                    pauseTimer()
                } else {
                    isComposerEngaged = false
                    resumeTimer()
                }
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

    private var currentGroup: StoryGroup? {
        guard currentGroupIndex >= 0 && currentGroupIndex < groups.count else { return nil }
        return groups[currentGroupIndex]
    }

    private var currentStory: StoryItem? {
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
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.3))
                            Capsule()
                                .fill(Color.white)
                                .frame(width: progressWidth(for: index, totalWidth: barGeo.size.width))
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
                // Avatar
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: group.avatarColor), Color(hex: group.avatarColor).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text(String(group.username.prefix(1)).uppercased())
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text(group.username)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white)

                    if let story = currentStory {
                        Text(story.timeAgo)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
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
    }

    // MARK: - Text Content

    private func storyTextContent(_ content: String, storyEffects: StoryEffects? = nil) -> some View {
        let effects = storyEffects ?? currentStory?.storyEffects
        let position = effects?.textPosition ?? "center"
        let color = effects?.textColor.map { Color(hex: $0) } ?? .white
        let fontStyle = effects?.textStyle ?? "normal"
        let align = effects?.textAlign ?? "center"
        let sizeOverride = effects?.textSize
        let textBg = effects?.textBg
        let offsetY = effects?.textOffsetY ?? 0

        return Text(content)
            .font(fontForStyle(fontStyle, sizeOverride: sizeOverride))
            .foregroundColor(color)
            .multilineTextAlignment(textAlignmentFor(align))
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                Group {
                    if let bg = textBg {
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: bg).opacity(0.6))
                    }
                }
            )
            .shadow(color: .black.opacity(0.4), radius: 6, y: 2)
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: compositeAlignment(position: position, align: align))
            .offset(y: offsetY)
    }

    private func fontForStyle(_ style: String, sizeOverride: CGFloat? = nil) -> Font {
        switch style {
        case "bold":
            return .system(size: sizeOverride ?? 28, weight: .bold, design: .default)
        case "italic":
            return .system(size: sizeOverride ?? 24, weight: .medium, design: .serif).italic()
        case "handwriting":
            return .system(size: sizeOverride ?? 26, weight: .medium, design: .serif)
        case "typewriter":
            return .system(size: sizeOverride ?? 20, weight: .regular, design: .monospaced)
        case "neon":
            return .system(size: sizeOverride ?? 32, weight: .black, design: .rounded)
        case "retro":
            return .system(size: sizeOverride ?? 26, weight: .bold, design: .rounded)
        default:
            return .system(size: sizeOverride ?? 22, weight: .medium)
        }
    }

    private func textAlignmentFor(_ align: String) -> TextAlignment {
        switch align {
        case "left": return .leading
        case "right": return .trailing
        default: return .center
        }
    }

    private func compositeAlignment(position: String, align: String) -> Alignment {
        let v: VerticalAlignment = {
            switch position {
            case "top": return .top
            case "bottom": return .bottom
            default: return .center
            }
        }()
        let h: HorizontalAlignment = {
            switch align {
            case "left": return .leading
            case "right": return .trailing
            default: return .center
            }
        }()
        return Alignment(horizontal: h, vertical: v)
    }

    // MARK: - Media Overlay

    private func mediaOverlay(media: FeedMedia, geometry: GeometryProxy) -> some View {
        Group {
            if let urlString = media.url, let url = URL(string: urlString) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: geometry.size.width, height: geometry.size.height)
                            .clipped()
                    case .failure:
                        // Fallback: colored gradient
                        coloredMediaFallback(media: media)
                    case .empty:
                        // Loading: subtle shimmer on gradient bg
                        coloredMediaFallback(media: media)
                            .overlay(
                                ProgressView()
                                    .tint(.white)
                            )
                    @unknown default:
                        coloredMediaFallback(media: media)
                    }
                }
            } else {
                coloredMediaFallback(media: media)
            }
        }
        .overlay(alignment: .center) {
            if media.type == .video {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundColor(.white.opacity(0.8))
                    .shadow(color: .black.opacity(0.4), radius: 8, y: 2)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    private func coloredMediaFallback(media: FeedMedia) -> some View {
        LinearGradient(
            colors: [Color(hex: media.thumbnailColor).opacity(0.6), Color(hex: media.thumbnailColor).opacity(0.3)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Filter Overlay

    private var filterOverlay: some View {
        Group {
            if let filter = currentStory?.storyEffects?.filter {
                switch filter {
                case "vintage":
                    Color(hex: "F8B500").opacity(0.15)
                        .blendMode(.multiply)
                case "bw":
                    Color.gray.opacity(0.4)
                        .blendMode(.saturation)
                case "warm":
                    Color(hex: "FF6B6B").opacity(0.1)
                        .blendMode(.softLight)
                case "cool":
                    Color(hex: "08D9D6").opacity(0.1)
                        .blendMode(.softLight)
                default:
                    EmptyView()
                }
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
    }

    // MARK: - Gesture Overlay

    private func gestureOverlay(geometry: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            // Left half — previous
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !isComposerEngaged else { return }
                    goToPrevious()
                }

            // Right half — next
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !isComposerEngaged else { return }
                    goToNext()
                }
        }
        // Exclude the bottom composer zone from tap targets
        .padding(.bottom, 120 + geometry.safeAreaInsets.bottom)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.2)
                .onChanged { _ in
                    guard !isComposerEngaged else { return }
                    pauseTimer()
                }
                .onEnded { _ in
                    guard !isComposerEngaged else { return }
                    resumeTimer()
                }
        )
    }

    // MARK: - Unified Drag Gesture (horizontal = groups, vertical = dismiss)

    private var unifiedDragGesture: some Gesture {
        DragGesture(minimumDistance: 15, coordinateSpace: .global)
            .onChanged { value in
                guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
                let dx = value.translation.width
                let dy = value.translation.height

                // Decide axis on first significant movement
                if gestureAxis == 0 {
                    if abs(dx) > abs(dy) + 8 {
                        gestureAxis = 1 // horizontal
                        pauseTimer()
                    } else if dy > abs(dx) + 8 && dy > 0 {
                        gestureAxis = 2 // vertical
                        pauseTimer()
                    }
                }

                switch gestureAxis {
                case 1: horizontalDrag = dx
                case 2: if dy > 0 { dragOffset = dy }
                default: break
                }
            }
            .onEnded { value in
                let axis = gestureAxis
                gestureAxis = 0

                guard !isDismissing && !isTransitioning && !isComposerEngaged else {
                    snapBackAll()
                    return
                }

                switch axis {
                case 1: // Horizontal — group navigation
                    let dx = value.translation.width
                    let predicted = value.predictedEndTranslation.width

                    // Transfer interactive drag → groupSlide (no visual snap)
                    groupSlide += horizontalDrag * 0.5
                    horizontalDrag = 0

                    if (dx < -60 || predicted < -150) && currentGroupIndex < groups.count - 1 {
                        // Swipe left → next group
                        groupTransition(forward: true) {
                            currentGroupIndex += 1
                            currentStoryIndex = 0
                            progress = 0
                        }
                    } else if (dx > 60 || predicted > 150) && currentGroupIndex > 0 {
                        // Swipe right → prev group
                        groupTransition(forward: false) {
                            currentGroupIndex -= 1
                            currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                            progress = 0
                        }
                    } else {
                        // Snap back — animate groupSlide to 0
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            groupSlide = 0
                        }
                        resumeTimer()
                    }

                case 2: // Vertical — dismiss
                    if value.translation.height > 120 || value.predictedEndTranslation.height > 350 {
                        dismissViewer()
                    } else {
                        withAnimation(.spring(response: 0.35, dampingFraction: 0.75)) {
                            dragOffset = 0
                        }
                        resumeTimer()
                    }

                default:
                    snapBackAll()
                }
            }
    }

    private func snapBackAll() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            horizontalDrag = 0
            dragOffset = 0
            groupSlide = 0
        }
        resumeTimer()
    }

    // MARK: - Navigation

    private func goToNext() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
        HapticFeedback.light()
        guard let group = currentGroup else { return }

        if currentStoryIndex < group.stories.count - 1 {
            crossFadeStory {
                currentStoryIndex += 1
                progress = 0
            }
        } else if currentGroupIndex < groups.count - 1 {
            groupTransition(forward: true) {
                currentGroupIndex += 1
                currentStoryIndex = 0
                progress = 0
            }
        } else {
            dismissViewer()
        }
    }

    private func goToPrevious() {
        guard !isDismissing && !isTransitioning && !isComposerEngaged else { return }
        HapticFeedback.light()

        if currentStoryIndex > 0 {
            crossFadeStory {
                currentStoryIndex -= 1
                progress = 0
            }
        } else if currentGroupIndex > 0 {
            groupTransition(forward: false) {
                currentGroupIndex -= 1
                currentStoryIndex = max(0, groups[currentGroupIndex].stories.count - 1)
                progress = 0
            }
        }
    }

    /// True cross-dissolve for stories within the same user.
    /// Old content stays visible (outgoing layer) while new content fades in on top —
    /// eliminates the flash caused by AsyncImage reloading between swaps.
    private func crossFadeStory(update: @escaping () -> Void) {
        isTransitioning = true

        // 1. Snapshot current story as outgoing (already rendered, no reload needed)
        outgoingStory = currentStory
        outgoingOpacity = 1
        contentOpacity = 0

        // 2. Instantly swap to the new story
        update()
        markCurrentViewed()

        // 3. Simultaneously cross-dissolve: old fades out, new fades in
        withAnimation(.easeInOut(duration: 0.3)) {
            outgoingOpacity = 0
            contentOpacity = 1
        }

        restartTimer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            outgoingStory = nil
            isTransitioning = false
        }
    }

    /// Slide transition for navigating between different users' story groups
    private func groupTransition(forward: Bool, update: @escaping () -> Void) {
        guard !isTransitioning else { return }
        isTransitioning = true

        let exitX: CGFloat = forward ? -screenW : screenW
        let enterX: CGFloat = forward ? screenW : -screenW

        // 1. Slide current card off-screen
        withAnimation(.easeIn(duration: 0.2)) {
            groupSlide = exitX
        }

        // 2. Swap content while off-screen, slide new card in
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.18) {
            update()
            markCurrentViewed()
            groupSlide = enterX
            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                groupSlide = 0
            }
            restartTimer()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                isTransitioning = false
            }
        }
    }

    /// Dismiss — shrink to small card and fly toward top
    private func dismissViewer() {
        guard !isDismissing else { return }
        isTransitioning = true
        timerCancellable?.cancel()

        // isDismissing MUST be inside withAnimation so computed transforms animate
        withAnimation(.spring(response: 0.5, dampingFraction: 0.82)) {
            isDismissing = true
            dragOffset = 0
            horizontalDrag = 0
            groupSlide = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
            isPresented = false
        }
    }

    // MARK: - Timer

    private func startTimer() {
        timerCancellable?.cancel()
        progress = 0
        let interval: Double = 0.03
        let increment = CGFloat(interval / storyDuration)

        timerCancellable = Timer.publish(every: interval, on: .main, in: .common)
            .autoconnect()
            .sink { _ in
                guard !isPaused else { return }
                if progress >= 1.0 {
                    goToNext()
                } else {
                    progress += increment
                }
            }
    }

    private func restartTimer() { startTimer() }
    private func pauseTimer() { isPaused = true }
    private func resumeTimer() { isPaused = false }

    // MARK: - Actions

    private func sendReply(text: String) {
        guard !text.isEmpty, let story = currentStory, let group = currentGroup else { return }
        let context = ReplyContext.story(
            storyId: story.id,
            authorName: group.username,
            preview: story.content ?? "Story"
        )
        resumeTimer()

        // Fire & forget comment
        Task {
            let body: [String: String] = ["content": text]
            let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                endpoint: "/posts/\(story.id)/comments",
                body: body
            )
        }

        // Navigate to DM
        dismissViewer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            onReplyToStory?(context)
        }
    }

    private func sendReaction(emoji: String) {
        guard let story = currentStory else { return }

        // Fire & forget like
        Task {
            let body = ReactionRequest(emoji: emoji)
            let _: APIResponse<[String: AnyCodable]>? = try? await APIClient.shared.post(
                endpoint: "/posts/\(story.id)/like",
                body: body
            )
        }
    }

    private func reshareStory() {
        guard let story = currentStory else { return }
        HapticFeedback.light()

        Task {
            do {
                let body = RepostRequest(content: nil, isQuote: false)
                let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.post(
                    endpoint: "/posts/\(story.id)/repost",
                    body: body
                )
                HapticFeedback.success()
            } catch {
                HapticFeedback.error()
            }
        }
    }

    // MARK: - Mark Viewed

    private func markCurrentViewed() {
        if let story = currentStory {
            viewModel.markViewed(storyId: story.id)
        }
    }
}
