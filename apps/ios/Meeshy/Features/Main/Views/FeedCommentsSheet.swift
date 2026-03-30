import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - Comments Sheet View
struct CommentsSheetView: View {
    let post: FeedPost
    let accentColor: String
    var onSendComment: ((String, String, String?) -> Void)? = nil // (postId, content, parentId?)
    var onLikeComment: ((String, String) -> Void)? = nil // (postId, commentId)

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @State private var commentText = ""
    @State private var replyingTo: FeedComment? = nil
    @FocusState private var isComposerFocused: Bool
    @State private var commentBounce: Bool = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var liveComments: [FeedComment]?
    @State private var liveCommentCount: Int?

    private var comments: [FeedComment] { liveComments ?? post.comments }
    private var commentCount: Int { liveCommentCount ?? post.commentCount }

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Comments list
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            // Comments
                            ForEach(comments) { comment in
                                CommentRowView(
                                    comment: comment,
                                    accentColor: accentColor,
                                    onReply: {
                                        replyingTo = comment
                                        isComposerFocused = true
                                    },
                                    onLikeComment: {
                                        onLikeComment?(post.id, comment.id)
                                    },
                                    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                                    storyState: storyViewModel.storyGroupForUser(userId: comment.authorId).map { $0.hasUnviewed ? .unread : .read } ?? .none,
                                    presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }

                    // Composer
                    commentComposer
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("\(commentCount) commentaires")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                }

                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(theme.textSecondary)
                            .frame(width: 32, height: 32)
                            .background(Circle().fill(theme.inputBackground))
                    }
                }
            }
        }
        .presentationDetents([.large, .medium])
        .presentationDragIndicator(.visible)
        .onReceive(
            SocialSocketManager.shared.commentAdded
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let feedComment = FeedComment(
                id: data.comment.id, author: data.comment.author.name,
                authorId: data.comment.author.id,
                authorAvatarURL: data.comment.author.avatar,
                content: data.comment.content, timestamp: data.comment.createdAt,
                likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0
            )
            var current = liveComments ?? post.comments
            if !current.contains(where: { $0.id == feedComment.id }) {
                current.insert(feedComment, at: 0)
            }
            liveComments = current
            liveCommentCount = data.commentCount
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
        .withStatusBubble()
    }

    // MARK: - Post Preview
    private var postPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Author
            HStack(spacing: 10) {
                MeeshyAvatar(
                    name: post.author,
                    context: .postAuthor,
                    accentColor: post.authorColor,
                    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                    onMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(feedPost: post)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(timeAgo(from: post.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }
            }

            // Content (Prisme Linguistique)
            Text(post.displayContent)
                .font(.system(size: 15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(3)

            // Stats
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(.system(size: 12))
                    Text("\(post.likes)")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(MeeshyColors.error)

                HStack(spacing: 4) {
                    Image(systemName: "bubble.right.fill")
                        .font(.system(size: 12))
                    Text("\(commentCount)")
                        .font(.system(size: 12, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor, intensity: 0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Comment Composer
    private var commentComposer: some View {
        VStack(spacing: 0) {
            // Reply indicator
            if let replyingTo = replyingTo {
                HStack(spacing: 8) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(Color(hex: replyingTo.authorColor))
                        .frame(width: 3, height: 36)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(replyingTo.author)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: replyingTo.authorColor))

                        Text(replyingTo.displayContent)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textSecondary)
                            .lineLimit(1)
                    }

                    Spacer()

                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                            self.replyingTo = nil
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(theme.textMuted)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    RoundedRectangle(cornerRadius: 14)
                        .fill(theme.surfaceGradient(tint: accentColor))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(theme.border(tint: accentColor, intensity: 0.3), lineWidth: 1)
                        )
                )
                .padding(.horizontal, 8)
            }

            // Composer
            HStack(spacing: 12) {
                // Avatar
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.indigo300],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 36, height: 36)
                    .overlay(
                        Text("M")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(.white)
                    )

                // Text field
                HStack(spacing: 8) {
                    TextField(replyingTo != nil ? "Répondre..." : "Ajouter un commentaire...", text: $commentText)
                        .focused($isComposerFocused)
                        .font(.system(size: 15))
                        .foregroundColor(theme.textPrimary)

                    // Emoji button
                    Button {
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "face.smiling")
                            .font(.system(size: 20))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(
                                    isComposerFocused ?
                                    Color(hex: accentColor).opacity(0.5) :
                                        theme.inputBorder,
                                    lineWidth: 1
                                )
                        )
                )
                .scaleEffect(commentBounce ? 1.02 : 1.0)
                .onChange(of: isComposerFocused) { _, newValue in
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                        commentBounce = newValue
                    }
                }

                // Send button
                if !commentText.isEmpty {
                    Button {
                        let text = commentText
                        let parentId = replyingTo?.id
                        commentText = ""
                        replyingTo = nil
                        isComposerFocused = false
                        HapticFeedback.success()
                        Task {
                            do {
                                let apiComment = try await PostService.shared.addComment(postId: post.id, content: text, parentId: parentId)
                                let feedComment = FeedComment(
                                    id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                                    authorAvatarURL: apiComment.author.avatar,
                                    content: apiComment.content, timestamp: apiComment.createdAt,
                                    likes: 0, replies: 0
                                )
                                var current = liveComments ?? post.comments
                                if !current.contains(where: { $0.id == feedComment.id }) {
                                    current.insert(feedComment, at: 0)
                                }
                                liveComments = current
                                liveCommentCount = (liveCommentCount ?? post.comments.count) + 1
                            } catch {
                                ToastManager.shared.showError("Erreur lors de l'envoi du commentaire")
                            }
                        }
                    } label: {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 36, height: 36)
                            .overlay(
                                Image(systemName: "paperplane.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundColor(.white)
                                    .rotationEffect(.degrees(45))
                                    .offset(x: -1)
                            )
                            .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 3)
                    }
                    .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .overlay(
                        Rectangle()
                            .fill(theme.backgroundPrimary.opacity(0.8))
                    )
                    .shadow(color: Color.black.opacity(0.1), radius: 10, y: -5)
            )
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: commentText.isEmpty)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: replyingTo?.id)
    }

    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Comment Row View
struct CommentRowView: View {
    let comment: FeedComment
    let accentColor: String
    let onReply: () -> Void
    var onLikeComment: (() -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState = .offline

    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var isLiked = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showOriginal = false

    private var hasTranslation: Bool {
        comment.translatedContent != nil && comment.originalLanguage != nil
    }

    private var effectiveCommentContent: String {
        if showOriginal { return comment.content }
        return comment.displayContent
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Avatar
            MeeshyAvatar(
                name: comment.author,
                context: .postComment,
                accentColor: comment.authorColor,
                avatarURL: comment.authorAvatarURL,
                storyState: storyState,
                moodEmoji: moodEmoji,
                presenceState: presenceState,
                onViewProfile: { selectedProfileUser = .from(feedComment: comment) },
                contextMenuItems: [
                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                        selectedProfileUser = .from(feedComment: comment)
                    }
                ]
            )

            VStack(alignment: .leading, spacing: 6) {
                // Author, flags, and time
                HStack(spacing: 4) {
                    Text(comment.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))
                        .onTapGesture {
                            HapticFeedback.light()
                            selectedProfileUser = .from(feedComment: comment)
                        }

                    if hasTranslation {
                        Text("·").font(.system(size: 12)).foregroundColor(theme.textMuted)

                        // Original language flag
                        let origDisplay = LanguageDisplay.from(code: comment.originalLanguage)
                        let isOrigActive = showOriginal
                        VStack(spacing: 1) {
                            Text(origDisplay?.flag ?? "?")
                                .font(.system(size: isOrigActive ? 12 : 10))
                                .scaleEffect(isOrigActive ? 1.05 : 1.0)
                            if isOrigActive {
                                RoundedRectangle(cornerRadius: 1)
                                    .fill(Color(hex: origDisplay?.color ?? LanguageDisplay.defaultColor))
                                    .frame(width: 10, height: 1.5)
                            }
                        }
                        .animation(.easeInOut(duration: 0.2), value: showOriginal)
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showOriginal = true
                            }
                            HapticFeedback.light()
                        }

                        // Translated language flag
                        let userLangs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
                        let targetLang = userLangs.first?.lowercased() ?? "fr"
                        let targetDisplay = LanguageDisplay.from(code: targetLang)
                        let isTransActive = !showOriginal
                        VStack(spacing: 1) {
                            Text(targetDisplay?.flag ?? "?")
                                .font(.system(size: isTransActive ? 12 : 10))
                                .scaleEffect(isTransActive ? 1.05 : 1.0)
                            if isTransActive {
                                RoundedRectangle(cornerRadius: 1)
                                    .fill(Color(hex: targetDisplay?.color ?? LanguageDisplay.defaultColor))
                                    .frame(width: 10, height: 1.5)
                            }
                        }
                        .animation(.easeInOut(duration: 0.2), value: showOriginal)
                        .onTapGesture {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                showOriginal = false
                            }
                            HapticFeedback.light()
                        }

                        // Translate icon
                        Image(systemName: "translate")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(MeeshyColors.indigo400)
                    }

                    Text("·").font(.system(size: 12)).foregroundColor(theme.textMuted)

                    Text(timeAgo(from: comment.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                // Content (Prisme Linguistique — direct replacement)
                Text(effectiveCommentContent)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: showOriginal)

                // Actions
                HStack(spacing: 20) {
                    Button {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                            isLiked.toggle()
                        }
                        HapticFeedback.light()
                        onLikeComment?()
                    } label: {
                        HStack(spacing: 4) {
                            let totalLikes = comment.likes + (isLiked ? 1 : 0)
                            let heartColor: Color = isLiked ? MeeshyColors.error : (totalLikes > 0 ? Color(hex: accentColor) : theme.textMuted)
                            Image(systemName: isLiked || totalLikes > 0 ? "heart.fill" : "heart")
                                .font(.system(size: 14))
                                .foregroundColor(heartColor)
                                .scaleEffect(isLiked ? 1.1 : 1.0)

                            Text("\(totalLikes)")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(heartColor)
                        }
                    }

                    Button {
                        onReply()
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrowshape.turn.up.left")
                                .font(.system(size: 13))
                            Text("Répondre")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(theme.textMuted)
                    }

                    Spacer()

                    Button {
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 12)
        .overlay(
            Rectangle()
                .fill(theme.inputBorder.opacity(0.3))
                .frame(height: 1),
            alignment: .bottom
        )
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? "")
            )
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .withStatusBubble()
    }

    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Legacy Support
struct FeedCard: View {
    let item: FeedItem

    var body: some View {
        FeedPostCard(
            post: FeedPost(author: item.author, content: item.content, timestamp: item.timestamp, likes: item.likes)
        )
    }
}
