import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from FeedView.swift

// MARK: - Feed Post Card
struct FeedPostCard: View {
    let post: FeedPost
    var isCommentsExpanded: Bool = false
    var onToggleComments: (() -> Void)? = nil
    var onLike: ((String) -> Void)? = nil
    var onRepost: ((String) -> Void)? = nil
    var onQuote: ((String) -> Void)? = nil
    var onShare: ((String) -> Void)? = nil
    var onBookmark: ((String) -> Void)? = nil
    var onSendComment: ((String, String, String?) -> Void)? = nil // (postId, content, parentId?)
    var onLikeComment: ((String, String) -> Void)? = nil // (postId, commentId)
    var onSelectLanguage: ((String, String) -> Void)? = nil // (postId, language)
    var onTapPost: ((String) -> Void)? = nil
    var onTapRepost: ((String) -> Void)? = nil

    @EnvironmentObject private var statusViewModel: StatusViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @State private var showCommentsSheet = false
    @State private var showTranslationSheet = false
    @State private var showRepostOptions = false
    @State private var selectedProfileUser: ProfileSheetUser?

    private var accentColor: String { post.authorColor }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Main content
            VStack(alignment: .leading, spacing: 12) {
                // Author header
                authorHeader

                // Post content (Prisme Linguistique: displays translated content when available)
                Text(post.displayContent)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(nil)
                    .onLongPressGesture {
                        if let translations = post.translations, !translations.isEmpty {
                            HapticFeedback.light()
                            showTranslationSheet = true
                        }
                    }
                    .accessibilityHint("Maintenir pour voir les traductions")

                // Translation indicator
                if post.isTranslated {
                    HStack(spacing: 4) {
                        Image(systemName: "translate")
                            .font(.system(size: 11))
                        Text("Traduit depuis \(Locale.current.localizedString(forLanguageCode: post.originalLanguage ?? "?") ?? post.originalLanguage ?? "?")")
                            .font(.system(size: 11))
                    }
                    .foregroundColor(theme.textMuted)
                    .onTapGesture {
                        HapticFeedback.light()
                        showTranslationSheet = true
                    }
                }

                // Media preview
                if post.hasMedia {
                    mediaPreview
                }

                // Reposted content
                if let repost = post.repost {
                    repostView(repost)
                }

                // Actions bar
                actionsBar
            }
            .padding(16)

            // Comments preview (compact)
            if !post.comments.isEmpty {
                commentsPreview
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(theme.border(tint: accentColor, intensity: 0.25), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .onTapGesture {
            onTapPost?(post.id)
        }
        .sheet(isPresented: $showCommentsSheet) {
            CommentsSheetView(post: post, accentColor: accentColor, onSendComment: onSendComment, onLikeComment: onLikeComment)
        }
        .sheet(isPresented: $showTranslationSheet) {
            PostTranslationSheet(
                post: post,
                onSelectLanguage: { language in
                    onSelectLanguage?(post.id, language)
                }
            )
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

    // MARK: - Author Header
    private var authorHeader: some View {
        HStack(spacing: 12) {
            // Avatar
            MeeshyAvatar(
                name: post.author,
                context: .postAuthor,
                accentColor: accentColor,
                avatarURL: post.authorAvatarURL,
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
                // Author name with repost indicator
                HStack(spacing: 6) {
                    Text(post.author)
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    // Repost indicator inline
                    if post.repostAuthor != nil {
                        HStack(spacing: 3) {
                            Image(systemName: "arrow.2.squarepath")
                                .font(.system(size: 10))
                            Text("a republié")
                                .font(.system(size: 11))
                        }
                        .foregroundColor(theme.textMuted)
                    }
                }

                Text(timeAgo(from: post.timestamp))
                    .font(.system(size: 12))
                    .foregroundColor(theme.accentText(accentColor))
            }

            Spacer()

            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 16))
                    .foregroundColor(theme.textMuted)
                    .padding(8)
            }
            .accessibilityLabel("Plus d'options")
            .accessibilityHint("Ouvre le menu des actions")
        }
    }

    // MARK: - Repost View
    private func repostView(_ repost: RepostContent) -> some View {
        Button {
            HapticFeedback.light()
            onTapRepost?(repost.id)
        } label: {
            VStack(alignment: .leading, spacing: 10) {
                // Original author
                HStack(spacing: 8) {
                    MeeshyAvatar(
                        name: repost.author,
                        context: .postComment,
                        accentColor: repost.authorColor,
                        avatarURL: repost.authorAvatarURL
                    )

                    Text(repost.author)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.accentText(repost.authorColor))

                    Text("·")
                        .foregroundColor(theme.textMuted)

                    Text(timeAgo(from: repost.timestamp))
                        .font(.system(size: 11))
                        .foregroundColor(theme.textMuted)
                }

                // Original content
                Text(repost.content)
                    .font(.system(size: 14))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(4)

                // Original stats
                HStack(spacing: 12) {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.system(size: 10))
                        Text("\(repost.likes)")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundColor(theme.accentText(repost.authorColor).opacity(0.7))
                }
            }
            .padding(12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(theme.accentText(repost.authorColor).opacity(0.2), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Media Preview
    // See FeedPostCard+Media.swift

    // MARK: - Actions Bar
    @State private var likeAnimating = false

    private var actionsBar: some View {
        HStack(spacing: 0) {
            // Like with heart burst animation
            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                    likeAnimating = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                    likeAnimating = false
                }
                onLike?(post.id)
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    ZStack {
                        // Burst ring behind heart
                        if post.isLiked {
                            Circle()
                                .stroke(MeeshyColors.error.opacity(likeAnimating ? 0.6 : 0), lineWidth: likeAnimating ? 2 : 0)
                                .frame(width: likeAnimating ? 32 : 18, height: likeAnimating ? 32 : 18)
                                .animation(.easeOut(duration: 0.4), value: likeAnimating)
                        }

                        Image(systemName: post.isLiked ? "heart.fill" : "heart")
                            .font(.system(size: 18))
                            .foregroundColor(post.isLiked ? MeeshyColors.error : theme.textSecondary)
                            .scaleEffect(likeAnimating ? 1.3 : (post.isLiked ? 1.1 : 1.0))
                            .rotationEffect(.degrees(likeAnimating ? -15 : 0))
                    }

                    Text("\(post.likes)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(post.isLiked ? MeeshyColors.error : theme.textSecondary)
                        .contentTransition(.numericText())
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.5), value: post.isLiked)
            .accessibilityLabel("\(post.likes) j'aime")

            Spacer()

            // Comment
            Button {
                showCommentsSheet = true
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "bubble.right")
                        .font(.system(size: 17))

                    if post.commentCount > 0 {
                        Text("\(post.commentCount)")
                            .font(.system(size: 13, weight: .medium))
                    }
                }
                .foregroundColor(showCommentsSheet ? theme.accentText(accentColor) : theme.textSecondary)
            }
            .accessibilityLabel("\(post.commentCount) commentaires")
            .accessibilityHint("Ouvre les commentaires")

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                Image(systemName: "arrow.2.squarepath")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityLabel("Repartager")
            .confirmationDialog("Repartager", isPresented: $showRepostOptions) {
                Button("Repartager") { onRepost?(post.id) }
                Button("Citer") { onQuote?(post.id) }
                Button("Annuler", role: .cancel) {}
            }

            Spacer()

            // Bookmark
            Button {
                onBookmark?(post.id)
                HapticFeedback.light()
            } label: {
                Image(systemName: "bookmark")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityLabel("Enregistrer")

            Spacer()

            // Share
            Button {
                onShare?(post.id)
                HapticFeedback.light()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
            .accessibilityLabel("Partager")
        }
        .padding(.top, 4)
    }

    // MARK: - Comments Preview (Top 3 Comments)
    private var commentsPreview: some View {
        Button {
            showCommentsSheet = true
            HapticFeedback.light()
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                // Divider
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.5))
                    .frame(height: 1)
                    .padding(.horizontal, 16)

                VStack(alignment: .leading, spacing: 12) {
                    // Top 3 comments sorted by likes
                    let topComments = post.comments.sorted { $0.likes > $1.likes }.prefix(3)

                    ForEach(Array(topComments.enumerated()), id: \.element.id) { index, comment in
                        topCommentRow(comment: comment, isLast: index == topComments.count - 1)
                    }

                    // "See all comments" link
                    HStack(spacing: 8) {
                        // Stacked avatars of remaining commenters
                        if post.comments.count > 3 {
                            HStack(spacing: -6) {
                                ForEach(Array(post.comments.dropFirst(3).prefix(3).enumerated()), id: \.element.id) { index, comment in
                                    MeeshyAvatar(
                                        name: comment.author,
                                        context: .postReaction,
                                        accentColor: comment.authorColor,
                                        avatarURL: comment.authorAvatarURL
                                    )
                                        .overlay(
                                            Circle()
                                                .stroke(theme.backgroundPrimary, lineWidth: 1.5)
                                        )
                                        .zIndex(Double(3 - index))
                                }
                            }
                        }

                        Text("Voir les \(post.comments.count) commentaires")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(theme.accentText(accentColor))

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, 4)
                }
                .padding(14)
            }
        }
        .buttonStyle(PlainButtonStyle())
    }

    // MARK: - Top Comment Row
    private func topCommentRow(comment: FeedComment, isLast: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 10) {
                // Avatar
                MeeshyAvatar(
                    name: comment.author,
                    context: .postComment,
                    accentColor: comment.authorColor,
                    avatarURL: comment.authorAvatarURL,
                    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                    onViewProfile: { selectedProfileUser = .from(feedComment: comment) },
                    onMoodTap: statusViewModel.moodTapHandler(for: comment.authorId),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                            selectedProfileUser = .from(feedComment: comment)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 4) {
                    // Author name
                    Text(comment.author)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(theme.accentText(comment.authorColor))

                    // Content (Prisme Linguistique)
                    Text(comment.displayContent)
                        .font(.system(size: 14))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(2)

                    // Stats row: likes and replies
                    HStack(spacing: 16) {
                        // Likes
                        HStack(spacing: 4) {
                            Image(systemName: "heart.fill")
                                .font(.system(size: 11))
                                .foregroundColor(MeeshyColors.error)
                            Text("\(comment.likes)")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundColor(theme.textMuted)
                        }

                        // Replies
                        if comment.replies > 0 {
                            HStack(spacing: 4) {
                                Image(systemName: "arrowshape.turn.up.left.fill")
                                    .font(.system(size: 10))
                                    .foregroundColor(theme.accentText(accentColor).opacity(0.7))
                                Text("\(comment.replies) réponses")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(theme.textMuted)
                            }
                        }

                        Spacer()

                        // Timestamp
                        Text(timeAgo(from: comment.timestamp))
                            .font(.system(size: 10))
                            .foregroundColor(theme.textMuted)
                    }
                    .padding(.top, 2)
                }
            }

            // Separator (except for last item)
            if !isLast {
                Rectangle()
                    .fill(theme.inputBorder.opacity(0.3))
                    .frame(height: 1)
                    .padding(.leading, 42)
                    .padding(.top, 10)
            }
        }
    }

    func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "À l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}
