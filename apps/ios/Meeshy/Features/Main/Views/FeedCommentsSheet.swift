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
    @State private var commentText = ""
    @State private var replyingTo: FeedComment? = nil
    @FocusState private var isComposerFocused: Bool
    @State private var commentBounce: Bool = false
    @State private var selectedProfileUser: ProfileSheetUser?

    var body: some View {
        NavigationStack {
            ZStack {
                // Background
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 0) {
                    // Comments list
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            // Post preview at top
                            postPreview
                                .padding(.bottom, 16)

                            // Comments
                            ForEach(post.comments) { comment in
                                CommentRowView(
                                    comment: comment,
                                    accentColor: accentColor,
                                    onReply: {
                                        replyingTo = comment
                                        isComposerFocused = true
                                    },
                                    onLikeComment: {
                                        onLikeComment?(post.id, comment.id)
                                    }
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
                    Text("\(post.comments.count) commentaires")
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
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(user: user)
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
                    mode: .custom(40),
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

            // Content
            Text(post.content)
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
                .foregroundColor(MeeshyColors.coral)

                HStack(spacing: 4) {
                    Image(systemName: "bubble.right.fill")
                        .font(.system(size: 12))
                    Text("\(post.comments.count)")
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
                    Rectangle()
                        .fill(Color(hex: replyingTo.authorColor))
                        .frame(width: 3)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Réponse à \(replyingTo.author)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Color(hex: replyingTo.authorColor))

                        Text(replyingTo.content)
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }

                    Spacer()

                    Button {
                        self.replyingTo = nil
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(theme.backgroundSecondary)
            }

            // Composer
            HStack(spacing: 12) {
                // Avatar
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [MeeshyColors.coral, MeeshyColors.teal],
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
                        onSendComment?(post.id, text, parentId)
                        commentText = ""
                        replyingTo = nil
                        isComposerFocused = false
                        HapticFeedback.success()
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

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var isLiked = false
    @State private var selectedProfileUser: ProfileSheetUser?

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Avatar
            MeeshyAvatar(
                name: comment.author,
                mode: .custom(36),
                accentColor: comment.authorColor,
                moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                onViewProfile: { selectedProfileUser = .from(feedComment: comment) },
                onMoodTap: statusViewModel.moodTapHandler(for: comment.authorId),
                contextMenuItems: [
                    AvatarContextMenuItem(label: "Voir le profil", icon: "person.fill") {
                        selectedProfileUser = .from(feedComment: comment)
                    }
                ]
            )

            VStack(alignment: .leading, spacing: 6) {
                // Author and time
                HStack(spacing: 6) {
                    Text(comment.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))
                        .onTapGesture {
                            HapticFeedback.light()
                            selectedProfileUser = .from(feedComment: comment)
                        }

                    Text("·")
                        .foregroundColor(theme.textMuted)

                    Text(timeAgo(from: comment.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                // Content
                Text(comment.content)
                    .font(.system(size: 15))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)

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
                            Image(systemName: isLiked ? "heart.fill" : "heart")
                                .font(.system(size: 14))
                                .foregroundColor(isLiked ? MeeshyColors.coral : theme.textMuted)
                                .scaleEffect(isLiked ? 1.1 : 1.0)

                            Text("\(comment.likes + (isLiked ? 1 : 0))")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(isLiked ? MeeshyColors.coral : theme.textMuted)
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
            UserProfileSheet(user: user)
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
