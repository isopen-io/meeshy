import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from RootView.swift

// MARK: - Themed Floating Button
struct ThemedFloatingButton: View {
    let icon: String?
    let colors: [String]
    var showLogo: Bool = false
    var badge: Int = 0
    let action: () -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isPressed = false

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(.ultraThinMaterial)
                    .frame(width: 48, height: 48)
                    .overlay(
                        Circle()
                            .stroke(
                                LinearGradient(
                                    colors: colors.map { Color(hex: $0).opacity(0.5) },
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1.5
                            )
                    )
                    .shadow(color: Color(hex: colors[0]).opacity(0.35), radius: 10, y: 5)

                if showLogo {
                    AnimatedLogoView(color: .white, lineWidth: 2.5)
                        .frame(width: 24, height: 24)
                } else if let icon = icon {
                    Image(systemName: icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(
                            LinearGradient(
                                colors: colors.map { Color(hex: $0) },
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                }

                // Badge
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 18, height: 18)
                        .background(
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: [MeeshyColors.error, MeeshyColors.indigo500],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .shadow(color: MeeshyColors.error.opacity(0.5), radius: 4)
                        )
                        .offset(x: 16, y: -16)
                }
            }
            .scaleEffect(isPressed ? 0.9 : 1)
        }
    }
}

// MARK: - Themed Action Button
struct ThemedActionButton: View {
    let icon: String
    let color: String
    var badge: Int = 0
    var size: CGFloat = 46
    let action: () -> Void

    @State private var isPressed = false
    @State private var isGlowing = false

    private var iconSize: CGFloat { round(size * 0.39) }

    var body: some View {
        Button(action: {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.15, dampingFraction: 0.5)) { isPressed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) { isPressed = false }
            }
            action()
        }) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: color), Color(hex: color).opacity(0.7)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: size, height: size)
                    .shadow(
                        color: Color(hex: color).opacity(isGlowing ? 0.65 : 0.45),
                        radius: isGlowing ? 14 : 10,
                        y: 4
                    )

                Image(systemName: icon)
                    .font(.system(size: iconSize, weight: .semibold))
                    .foregroundColor(.white)
                    .scaleEffect(isPressed ? 1.2 : 1.0)
                    .rotationEffect(.degrees(isPressed ? -8 : 0))

                if badge > 0 {
                    Text("\(min(badge, 99))")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(Color(hex: color))
                        .frame(width: 16, height: 16)
                        .background(Circle().fill(Color.white))
                        .offset(x: size * 0.33, y: -size * 0.33)
                        .pulse(intensity: 0.08)
                }
            }
            .scaleEffect(isPressed ? 0.82 : 1)
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 2.0).repeatForever(autoreverses: true)) {
                isGlowing = true
            }
        }
    }
}

// MARK: - Themed Feed Overlay
struct ThemedFeedOverlay: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = FeedViewModel()
    @EnvironmentObject var router: Router
    @EnvironmentObject var storyViewModel: StoryViewModel
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var conversationListViewModel: ConversationListViewModel
    @State private var composerText = ""
    @FocusState private var isComposerFocused: Bool
    @State private var showStoryViewer = false
    @State private var selectedStoryUserId: String?
    @State private var showStatusComposer = false
    @State private var showFullComposer = false
    @State private var pendingAttachmentType: String?
    @State private var quoteOriginalPost: FeedPost?

    var body: some View {
        ZStack {
            // Background
            ZStack {
                theme.backgroundGradient

                Circle()
                    .fill(Color(hex: "4ECDC4").opacity(theme.mode.isDark ? 0.1 : 0.06))
                    .frame(width: 300, height: 300)
                    .blur(radius: 80)
                    .offset(x: -80, y: -100)
                    .floating(range: 20, duration: 5.0)

                Circle()
                    .fill(MeeshyColors.error.opacity(theme.mode.isDark ? 0.1 : 0.06))
                    .frame(width: 250, height: 250)
                    .blur(radius: 70)
                    .offset(x: 100, y: 200)
                    .floating(range: 18, duration: 6.0)
            }
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 14) {
                    Spacer().frame(height: 70)

                    // Story Tray
                    StoryTrayView(viewModel: storyViewModel, onViewStory: { userId in
                        selectedStoryUserId = userId
                        showStoryViewer = true
                    }, onAddStatus: {
                        showStatusComposer = true
                    })

                    // Composer placeholder — tap to open full composer
                    Button {
                        showFullComposer = true
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 12) {
                            MeeshyAvatar(
                                name: getUserDisplayName(AuthManager.shared.currentUser, fallback: "M"),
                                context: .feedComposer,
                                accentColor: "FF6B6B",
                                secondaryColor: "4ECDC4"
                            )

                            Text("Partager quelque chose...")
                                .font(.system(size: 14))
                                .foregroundColor(theme.textMuted)

                            Spacer()

                            Image(systemName: "photo.on.rectangle.angled")
                                .font(.system(size: 16))
                                .foregroundColor(MeeshyColors.indigo400)
                        }
                        .padding(12)
                        .background(
                            RoundedRectangle(cornerRadius: 16)
                                .fill(theme.inputBackground)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16)
                                        .stroke(theme.inputBorder, lineWidth: 1)
                                )
                        )
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 16)

                    // Feed posts with infinite scroll
                    ForEach(Array(viewModel.posts.enumerated()), id: \.element.id) { index, post in
                        FeedPostCard(
                            post: post,
                            onLike: { postId in
                                Task { await viewModel.likePost(postId) }
                            },
                            onRepost: { postId in
                                Task { await viewModel.repostPost(postId) }
                            },
                            onQuote: { postId in
                                quoteOriginalPost = viewModel.posts.first(where: { $0.id == postId })
                            },
                            onShare: { postId in
                                Task { await viewModel.sharePost(postId) }
                            },
                            onBookmark: { postId in
                                Task { await viewModel.bookmarkPost(postId) }
                            },
                            onSendComment: { postId, content, parentId in
                                Task { await viewModel.sendComment(postId: postId, content: content, parentId: parentId) }
                            },
                            onLikeComment: { postId, commentId in
                                Task { await viewModel.likeComment(postId: postId, commentId: commentId) }
                            },
                            onTapPost: { post in
                                router.push(.postDetail(post.id, post))
                            },
                            onTapRepost: { repostId in
                                router.push(.postDetail(repostId))
                            },
                            onDelete: post.authorId == AuthManager.shared.currentUser?.id ? { postId in
                                Task { await viewModel.deletePost(postId) }
                            } : nil,
                            onReport: post.authorId != AuthManager.shared.currentUser?.id ? { postId in
                                Task { await viewModel.reportPost(postId) }
                            } : nil,
                            authorMoodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                            onAuthorMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
                            moodLookup: { userId in
                                (emoji: statusViewModel.statusForUser(userId: userId)?.moodEmoji,
                                 tapHandler: statusViewModel.moodTapHandler(for: userId))
                            }
                        )
                        .equatable()
                            .staggeredAppear(index: index, baseDelay: 0.06)
                            .onAppear {
                                Task { await viewModel.loadMoreIfNeeded(currentPost: post) }
                            }
                    }

                    // Loading indicator
                    if viewModel.isLoadingMore {
                        ProgressView()
                            .tint(Color(hex: "4ECDC4"))
                            .padding()
                    }
                }
                .padding(.bottom, 100)
            }
            .refreshable {
                await viewModel.refresh()
                await storyViewModel.loadStories()
                await statusViewModel.loadStatuses()
            }
        }
        .task {
            if viewModel.posts.isEmpty {
                await viewModel.loadFeed()
            }
            viewModel.subscribeToSocketEvents()
            await storyViewModel.loadStories()
            await statusViewModel.loadStatuses()
        }
        .onDisappear {
            viewModel.unsubscribeFromSocketEvents()
        }
        .fullScreenCover(isPresented: $showStoryViewer) {
            StoryViewerContainer(
                viewModel: storyViewModel,
                userId: selectedStoryUserId,
                isPresented: $showStoryViewer,
                presentationSource: "FeedOverlay"
            )
            .environmentObject(router)
            .environmentObject(statusViewModel)
            .environmentObject(conversationListViewModel)
        }
        .sheet(isPresented: $showStatusComposer) {
            StatusComposerView(viewModel: statusViewModel)
                .presentationDetents([.medium])
        }
        .fullScreenCover(isPresented: $showFullComposer) {
            FeedComposerSheet(
                viewModel: viewModel,
                initialText: composerText,
                pendingAttachmentType: pendingAttachmentType,
                onDismiss: {
                    showFullComposer = false
                    pendingAttachmentType = nil
                    composerText = ""
                }
            )
        }
        .fullScreenCover(item: $quoteOriginalPost) { quoted in
            FeedComposerSheet(
                viewModel: viewModel,
                initialText: "",
                pendingAttachmentType: nil,
                quotePost: quoted,
                onDismiss: {
                    quoteOriginalPost = nil
                }
            )
        }
    }
}

// MARK: - Themed Feed Composer
struct ThemedFeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    var onOpenComposerWithAttachment: ((String) -> Void)?
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var showAttachmentMenu = false
    @State private var selectedProfileUser: ProfileSheetUser?

    // Attachment options (without mic - mic is the toggle button when expanded)
    private let attachmentOptions: [(icon: String, color: String, type: String)] = [
        ("photo.on.rectangle.angled", "9B59B6", "photo"),
        ("camera.fill", "FF6B6B", "camera"),
        ("doc.fill", "3498DB", "file"),
        ("location.fill", "2ECC71", "location")
    ]

    private var hasTextToPublish: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        ZStack(alignment: .topTrailing) {
            // Main composer card
            HStack(alignment: .top, spacing: 12) {
                // Avatar
                MeeshyAvatar(
                    name: getUserDisplayName(authManager.currentUser, fallback: "M"),
                    context: .feedComposer,
                    accentColor: "FF6B6B",
                    secondaryColor: "4ECDC4",
                    onViewProfile: {
                        if let user = authManager.currentUser {
                            selectedProfileUser = .from(user: user)
                        }
                    },
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Mon profil", icon: "person.fill") {
                            if let user = authManager.currentUser {
                                selectedProfileUser = .from(user: user)
                            }
                        }
                    ]
                )

                // Multi-line text input
                ZStack(alignment: .topLeading) {
                    // Placeholder
                    if text.isEmpty {
                        Text("Partager quelque chose avec le monde...")
                            .font(.system(size: 14))
                            .foregroundColor(theme.textMuted)
                            .padding(.horizontal, 4)
                            .padding(.top, 8)
                    }

                    // TextEditor for multi-line support
                    TextEditor(text: $text)
                        .focused($isFocused)
                        .foregroundColor(theme.textPrimary)
                        .font(.system(size: 14))
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 36, maxHeight: 100)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(
                                    isFocused ?
                                    Color(hex: "4ECDC4").opacity(0.5) :
                                    theme.inputBorder,
                                    lineWidth: 1
                                )
                        )
                )

                // Right column: (+)/mic button and Publish button
                VStack(spacing: 8) {
                    // Toggle button: (+) when closed, mic when open
                    Button {
                        HapticFeedback.light()
                        if showAttachmentMenu {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachmentMenu = false
                            }
                            onOpenComposerWithAttachment?("voice")
                        } else {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                                showAttachmentMenu = true
                            }
                        }
                    } label: {
                        ZStack {
                            Circle()
                                .fill(
                                    LinearGradient(
                                        colors: showAttachmentMenu ?
                                            [Color(hex: "F8B500"), Color(hex: "FF9500")] :
                                            [Color(hex: "4ECDC4"), Color(hex: "45B7D1")],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    )
                                )
                                .frame(width: 32, height: 32)
                                .shadow(color: (showAttachmentMenu ? Color(hex: "F8B500") : Color(hex: "4ECDC4")).opacity(0.4), radius: 6, y: 3)

                            Image(systemName: showAttachmentMenu ? "mic.fill" : "plus")
                                .font(.system(size: 14, weight: .bold))
                                .foregroundColor(.white)
                        }
                    }

                    // Publish button (below + button)
                    if hasTextToPublish {
                        Button {
                            text = ""
                            isFocused = false
                            showAttachmentMenu = false
                            HapticFeedback.success()
                        } label: {
                            ZStack {
                                Circle()
                                    .fill(
                                        LinearGradient(
                                            colors: [MeeshyColors.error, MeeshyColors.indigo500],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 32, height: 32)
                                    .shadow(color: MeeshyColors.error.opacity(0.5), radius: 6, y: 3)

                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundColor(.white)
                                    .rotationEffect(.degrees(45))
                                    .offset(x: -1, y: 1)
                            }
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(theme.surfaceGradient(tint: "4ECDC4"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 20)
                            .stroke(theme.border(tint: "4ECDC4", intensity: 0.25), lineWidth: 1)
                    )
            )

            // Attachment menu overlay - floating icons without background
            if showAttachmentMenu {
                HStack(spacing: 12) {
                    ForEach(attachmentOptions, id: \.icon) { option in
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showAttachmentMenu = false
                            }
                            onOpenComposerWithAttachment?(option.type)
                        } label: {
                            Image(systemName: option.icon)
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(Color(hex: option.color))
                                .shadow(color: Color(hex: option.color).opacity(0.5), radius: 4, y: 2)
                        }
                        .transition(.scale.combined(with: .opacity))
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    Capsule()
                        .fill(theme.backgroundPrimary.opacity(0.92))
                        .shadow(color: Color.black.opacity(0.2), radius: 12, y: 6)
                )
                .offset(x: -8, y: -50)
                .transition(.scale(scale: 0.5, anchor: .bottomTrailing).combined(with: .opacity))
                .zIndex(100)
            }
        }
        .padding(.horizontal, 16)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isFocused)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: text.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showAttachmentMenu)
        .onChange(of: isFocused) { _, focused in
            if focused && showAttachmentMenu {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachmentMenu = false
                }
            }
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
    }
}

// MARK: - Themed Feed Card
struct ThemedFeedCard: View {
    let item: FeedItem
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isLiked = false
    @State private var isBookmarked = false
    @State private var showCopiedToast = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: item.author,
                    context: .feedComposer,
                    accentColor: item.color
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.author)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(timeAgoShort(from: item.timestamp))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: item.color))
                }

                Spacer()

                Menu {
                    Button {
                        UIPasteboard.general.string = item.content
                        HapticFeedback.success()
                    } label: {
                        Label("Copier le texte", systemImage: "doc.on.doc")
                    }
                    Button {
                        let activityVC = UIActivityViewController(activityItems: [item.content], applicationActivities: nil)
                        if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                           let root = scene.windows.first?.rootViewController {
                            root.present(activityVC, animated: true)
                        }
                        HapticFeedback.light()
                    } label: {
                        Label("Partager", systemImage: "square.and.arrow.up")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundColor(theme.textMuted)
                }
            }

            // Content
            Text(item.content)
                .font(.system(size: 15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(3)

            // Actions
            HStack(spacing: 20) {
                FeedActionButton(icon: isLiked ? "heart.fill" : "heart", color: "FF6B6B", count: item.likes + (isLiked ? 1 : 0), isActive: isLiked) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { isLiked.toggle() }
                }
                FeedActionButton(icon: "bubble.right", color: "4ECDC4", count: 0)
                FeedActionButton(icon: "arrow.2.squarepath", color: "9B59B6", count: 0)

                Spacer()

                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) { isBookmarked.toggle() }
                    HapticFeedback.light()
                } label: {
                    Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                        .foregroundColor(Color(hex: "F8B500"))
                }
                .accessibilityLabel(isBookmarked ? "Retirer des favoris" : "Ajouter aux favoris")
            }
            .padding(.top, 4)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(theme.surfaceGradient(tint: item.color))
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(theme.border(tint: item.color), lineWidth: 1)
                )
                .shadow(color: Color(hex: item.color).opacity(theme.mode.isDark ? 0.15 : 0.1), radius: 8, y: 4)
        )
    }

    private func timeAgoShort(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "maintenant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Feed Action Button
struct FeedActionButton: View {
    let icon: String
    let color: String
    let count: Int
    var isActive: Bool = false
    var action: (() -> Void)? = nil

    @State private var bounce = false

    var body: some View {
        Button(action: {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                bounce = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                bounce = false
            }
            action?()
        }) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .scaleEffect(bounce ? 1.3 : 1)
                    .rotationEffect(.degrees(bounce ? -15 : 0))
                Text("\(count)")
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(Color(hex: color).opacity(isActive ? 1 : 0.7))
            .scaleEffect(isActive ? 1.1 : 1)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.5), value: isActive)
        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: bounce)
    }
}

// MARK: - Legacy Support
struct FeedOverlay: View {
    var body: some View { ThemedFeedOverlay() }
}

struct ColorfulFeedOverlay: View {
    var body: some View { ThemedFeedOverlay() }
}

struct ColorfulFeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    var body: some View { ThemedFeedComposer(text: $text, isFocused: _isFocused) }
}

struct ColorfulFeedCard: View {
    let author: String
    let content: String
    let time: String
    let color: String
    var body: some View {
        ThemedFeedCard(item: FeedItem(author: author, content: content, likes: 0, color: color))
    }
}

struct ColorfulFeedAction: View {
    let icon: String
    let color: String
    let count: Int
    var body: some View { FeedActionButton(icon: icon, color: color, count: count) }
}

struct ColorfulQuickActionButton: View {
    let icon: String
    let color: String
    var badge: Int = 0
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, badge: badge, action: action) }
}

struct QuickActionButton: View {
    let icon: String
    let color: String
    var badge: Int = 0
    let action: () -> Void
    var body: some View { ThemedActionButton(icon: icon, color: color, badge: badge, action: action) }
}

struct FeedComposer: View {
    @Binding var text: String
    @FocusState var isFocused: Bool
    var body: some View { ThemedFeedComposer(text: $text, isFocused: _isFocused) }
}

struct LegacyFeedCard: View {
    let author: String
    let content: String
    let time: String
    var body: some View {
        ThemedFeedCard(item: FeedItem(author: author, content: content))
    }
}

struct FeedAction: View {
    let icon: String
    let count: Int
    var body: some View { FeedActionButton(icon: icon, color: "4ECDC4", count: count) }
}

