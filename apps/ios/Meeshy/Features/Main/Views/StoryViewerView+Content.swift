import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from StoryViewerView.swift

extension StoryViewerView {

    // MARK: - Text Content

    func storyTextContent(_ content: String, storyEffects: StoryEffects? = nil) -> some View {
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
            // Neon glow effect for neon text style
            .shadow(
                color: fontStyle == "neon" ? color.opacity(0.7) : .clear,
                radius: fontStyle == "neon" ? 12 : 0
            )
            .shadow(
                color: fontStyle == "neon" ? color.opacity(0.4) : .clear,
                radius: fontStyle == "neon" ? 24 : 0
            )
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: compositeAlignment(position: position, align: align))
            .offset(y: offsetY)
            .accessibilityLabel("Texte de la story: \(content)")
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

    func mediaOverlay(media: FeedMedia, geometry: GeometryProxy) -> some View {
        Group {
            if media.url != nil {
                CachedAsyncImage(url: media.url) {
                    coloredMediaFallback(media: media)
                }
                .aspectRatio(contentMode: .fill)
                .frame(width: geometry.size.width, height: geometry.size.height)
                .clipped()
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
                    .accessibilityHidden(true)
            }
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .accessibilityLabel(media.type == .video ? "Video de la story" : "Image de la story")
    }

    private func coloredMediaFallback(media: FeedMedia) -> some View {
        LinearGradient(
            colors: [Color(hex: media.thumbnailColor).opacity(0.6), Color(hex: media.thumbnailColor).opacity(0.3)],
            startPoint: .top,
            endPoint: .bottom
        )
    }

    // MARK: - Filter Overlay

    var filterOverlay: some View {
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
        .accessibilityHidden(true)
    }

    // MARK: - Gesture Overlay

    func gestureOverlay(geometry: GeometryProxy) -> some View {
        HStack(spacing: 0) {
            // Left half — previous
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if isComposerEngaged { dismissComposer(); return }
                    goToPrevious()
                }
                .accessibilityLabel("Story precedente")
                .accessibilityHint("Toucher pour revenir a la story precedente")
                .accessibilityAddTraits(.isButton)

            // Right half — next
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    if isComposerEngaged { dismissComposer(); return }
                    goToNext()
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
                    pauseTimer()
                }
                .onEnded { _ in
                    guard !isComposerEngaged else { return }
                    resumeTimer()
                }
        )
    }

    // MARK: - Unified Drag Gesture (horizontal = groups, vertical = dismiss)

    var unifiedDragGesture: some Gesture {
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

                    // Transfer interactive drag -> groupSlide (no visual snap)
                    groupSlide += horizontalDrag * 0.5
                    horizontalDrag = 0

                    if (dx < -60 || predicted < -150) && currentGroupIndex < groups.count - 1 {
                        // Swipe left -> next group
                        groupTransition(forward: true) {
                            currentGroupIndex += 1
                            currentStoryIndex = 0
                            progress = 0
                        }
                    } else if (dx > 60 || predicted > 150) && currentGroupIndex > 0 {
                        // Swipe right -> prev group
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
    /// Text gets a subtle parallax slide-up for cinematic depth.
    private func crossFadeStory(update: @escaping () -> Void) {
        isTransitioning = true

        // 1. Snapshot current story as outgoing (already rendered, no reload needed)
        outgoingStory = currentStory
        outgoingOpacity = 1
        contentOpacity = 0
        textSlideOffset = 14 // Start text slightly below for parallax entrance

        // 2. Instantly swap to the new story
        update()
        markCurrentViewed()
        prefetchStory(at: currentStoryIndex + 1)

        // 3. Simultaneously cross-dissolve with text parallax
        withAnimation(.easeOut(duration: 0.35)) {
            outgoingOpacity = 0
            contentOpacity = 1
            textSlideOffset = 0
        }

        restartTimer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.38) {
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
    func dismissViewer() {
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

    /// State-driven pause: the timer checks ALL active UI states each tick
    /// instead of relying on paired pauseTimer/resumeTimer event calls.
    /// `isPaused` is ONLY for direct user gestures (long press, drag).
    private var shouldPauseTimer: Bool {
        isPaused
        || isComposerEngaged
        || hasComposerContent
        || showEmojiStrip
        || showFullEmojiPicker
        || showTextEmojiPicker
        || showLanguageOptions
        || showFullLanguagePicker
        || isTransitioning
        || isDismissing
    }

    func startTimer() {
        timerCancellable?.cancel()
        progress = 0
        let interval: Double = 0.03
        let increment = CGFloat(interval / storyDuration)

        timerCancellable = Timer.publish(every: interval, on: .main, in: .common)
            .autoconnect()
            .sink { _ in
                guard !shouldPauseTimer else { return }
                if progress >= 1.0 {
                    goToNext()
                } else {
                    progress += increment
                }
            }
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    private func restartTimer() {
        isPaused = false
        startTimer()
    }

    /// Manual pause — only for direct gesture holds (long press, drag).
    func pauseTimer() { isPaused = true }

    /// Manual resume — only for ending gesture holds.
    func resumeTimer() { isPaused = false }

    // MARK: - Dismiss Composer

    func dismissComposer() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showTextEmojiPicker = false
            showFullEmojiPicker = false
        }
        isComposerEngaged = false
    }

    // MARK: - Actions

    func sendReply(text: String) {
        guard !text.isEmpty, let story = currentStory, let group = currentGroup else { return }
        let context = ReplyContext.story(
            storyId: story.id,
            authorId: group.id,
            authorName: group.username,
            preview: story.content ?? "Story"
        )

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

    func sendReaction(emoji: String) {
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

    func reshareStory() {
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

    func shareStory() {
        guard let story = currentStory else { return }
        let shareURL = "https://meeshy.me/story/\(story.id)"
        let activityVC = UIActivityViewController(activityItems: [shareURL], applicationActivities: nil)
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootVC = windowScene.windows.first?.rootViewController {
            var topVC = rootVC
            while let presented = topVC.presentedViewController { topVC = presented }
            activityVC.popoverPresentationController?.sourceView = topVC.view
            topVC.present(activityVC, animated: true)
        }
    }

    // MARK: - Story Time Remaining

    func storyTimeRemaining(_ expiresAt: Date) -> String {
        let seconds = Int(expiresAt.timeIntervalSinceNow)
        if seconds <= 0 { return "expire bientot" }
        let hours = seconds / 3600
        let minutes = (seconds % 3600) / 60
        if hours > 0 {
            return "expire dans \(hours)h"
        }
        return "expire dans \(minutes)min"
    }

    // MARK: - Delete Story

    func deleteCurrentStory() {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        
        Task {
            let success = await viewModel.deleteStory(storyId: story.id)
            DispatchQueue.main.async {
                if success {
                    HapticFeedback.success()
                    dismissViewer()
                } else {
                    HapticFeedback.error()
                }
            }
        }
    }

    // MARK: - Mark Viewed

    func markCurrentViewed() {
        if let story = currentStory {
            viewModel.markViewed(storyId: story.id)
        }
    }

    // MARK: - Prefetch

    /// Précharge l'image de la story à l'index donné dans le groupe actuel.
    func prefetchStory(at index: Int) {
        guard currentGroupIndex < groups.count else { return }
        let stories = groups[currentGroupIndex].stories
        guard index >= 0, index < stories.count else { return }
        stories[index].media.compactMap(\.url).forEach {
            MediaCacheManager.shared.prefetch($0)
        }
    }

    /// Précharge toutes les stories du groupe actuel (appelé à l'ouverture du viewer).
    func prefetchCurrentGroup() {
        guard currentGroupIndex >= 0, currentGroupIndex < groups.count else { return }
        groups[currentGroupIndex].stories.forEach { story in
            story.media.compactMap(\.url).forEach {
                MediaCacheManager.shared.prefetch($0)
            }
        }
    }
}

// MARK: - Story Viewers Sheet

struct StoryViewerItem: Identifiable {
    let id: String
    let username: String
    let displayName: String
    let avatarUrl: String?
    let viewedAt: Date
    let reactionEmoji: String?
    let replyContent: String?
    let hasReshared: Bool
}

struct StoryViewersSheet: View {
    @Environment(\.dismiss) private var dismiss
    let story: StoryItem
    let accentColor: Color

    @State private var viewers: [StoryViewerItem] = []
    @State private var isLoading = true

    var body: some View {
        NavigationStack {
            ZStack {
                ThemeManager.shared.mode.isDark ? Color.black.ignoresSafeArea() : Color(UIColor.systemGroupedBackground).ignoresSafeArea()

                if isLoading {
                    ProgressView("Chargement des vues...")
                        .tint(accentColor)
                } else if viewers.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "eye.slash")
                            .font(.system(size: 48))
                            .foregroundColor(.secondary.opacity(0.5))
                        Text("Aucune vue pour le moment")
                            .font(.headline)
                            .foregroundColor(.secondary)
                        Text("Les personnes qui regardent votre story apparaîtront ici.")
                            .font(.subheadline)
                            .foregroundColor(.secondary.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }
                } else {
                    List {
                        Section(header: Text("\(viewers.count) Vues")
                            .font(.headline)
                            .foregroundColor(.primary)
                            .textCase(nil)
                        ) {
                            ForEach(viewers) { viewer in
                                viewerRow(viewer)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Vues")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") {
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(accentColor)
                }
            }
            .task {
                await loadViewers()
            }
        }
    }

    private func viewerRow(_ viewer: StoryViewerItem) -> some View {
        HStack(spacing: 12) {
            CachedAsyncImage(url: viewer.avatarUrl ?? "") {
                Color.gray.opacity(0.3)
            }
            .frame(width: 44, height: 44)
            .clipShape(Circle())
            .overlay(
                Circle().stroke(Color.primary.opacity(0.1), lineWidth: 1)
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(viewer.displayName)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)

                    if viewer.hasReshared {
                        Image(systemName: "arrow.2.squarepath")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(accentColor)
                    }

                    Spacer()

                    Text(viewer.viewedAt, style: .time)
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                }

                if let reply = viewer.replyContent {
                    HStack(spacing: 6) {
                        Image(systemName: "arrowshape.turn.up.left.fill")
                            .font(.system(size: 10))
                        Text(reply)
                            .font(.system(size: 14))
                            .lineLimit(1)
                    }
                    .foregroundColor(.secondary)
                } else if let reaction = viewer.reactionEmoji {
                    HStack(spacing: 6) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                            .foregroundColor(.red)
                        Text(reaction)
                            .font(.system(size: 14))
                    }
                }
            }
        }
        .padding(.vertical, 4)
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowBackground(ThemeManager.shared.mode.isDark ? Color(UIColor.secondarySystemGroupedBackground) : Color.white)
    }

    struct ViewersResponse: Decodable {
        struct ViewerApi: Decodable {
            let id: String
            let username: String
            let displayName: String?
            let avatarUrl: String?
            let viewedAt: Date?
            let reaction: String?
            let isReshared: Bool?
            let reply: String?
        }
        let viewers: [ViewerApi]
    }

    private func loadViewers() async {
        do {
            let response: APIResponse<ViewersResponse>? = try? await APIClient.shared.request(endpoint: "/posts/\(story.id)/interactions")
            
            await MainActor.run {
                if let apiViewers = response?.data.viewers, !apiViewers.isEmpty {
                    self.viewers = apiViewers.map { v in
                        StoryViewerItem(
                            id: v.id,
                            username: v.username,
                            displayName: v.displayName ?? v.username,
                            avatarUrl: v.avatarUrl,
                            viewedAt: v.viewedAt ?? Date(),
                            reactionEmoji: v.reaction,
                            replyContent: v.reply,
                            hasReshared: v.isReshared ?? false
                        )
                    }
                } else {
                    // Mock data if backend not connected or returns 404
                    self.viewers = [
                        StoryViewerItem(id: "1", username: "alex", displayName: "Alex", avatarUrl: nil, viewedAt: Date().addingTimeInterval(-3600), reactionEmoji: "🔥", replyContent: nil, hasReshared: false),
                        StoryViewerItem(id: "2", username: "sarah", displayName: "Sarah", avatarUrl: nil, viewedAt: Date().addingTimeInterval(-7200), reactionEmoji: nil, replyContent: "Wow, incroyable !", hasReshared: true),
                        StoryViewerItem(id: "3", username: "marc", displayName: "Marc", avatarUrl: nil, viewedAt: Date().addingTimeInterval(-86400), reactionEmoji: "❤️", replyContent: nil, hasReshared: false)
                    ]
                }
                self.isLoading = false
            }
        }
    }
}
