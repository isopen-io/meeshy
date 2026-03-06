import SwiftUI
import MeeshySDK
import MeeshyUI

struct PostDetailView: View {
    let postId: String
    var initialPost: FeedPost?

    @StateObject private var viewModel = PostDetailViewModel()
    @EnvironmentObject private var theme: ThemeManager
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var commentText = ""
    @State private var showTranslationSheet = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @FocusState private var isCommentFocused: Bool

    private var displayPost: FeedPost? { viewModel.post ?? initialPost }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0) {
                    if let post = displayPost {
                        postHeader(post)
                        postContent(post)

                        if post.hasMedia {
                            mediaPreview(post)
                        }

                        postActions(post)

                        Rectangle()
                            .fill(theme.inputBorder.opacity(0.5))
                            .frame(height: 1)
                            .padding(.horizontal, 16)

                        commentsSection
                    } else if viewModel.isLoading {
                        ProgressView()
                            .padding(.top, 40)
                    }
                }
            }

            commentComposer
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .navigationTitle("Post")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if viewModel.post == nil {
                await viewModel.loadPost(postId)
            }
            await viewModel.loadComments(postId)
            viewModel.subscribeToSocket(postId)
        }
        .sheet(isPresented: $showTranslationSheet) {
            if let post = displayPost {
                PostTranslationSheet(
                    post: post,
                    onSelectLanguage: { language in
                        guard let translations = viewModel.post?.translations,
                              let translation = translations[language] else { return }
                        viewModel.post?.translatedContent = translation.text
                    }
                )
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

    // MARK: - Post Header

    @ViewBuilder
    private func postHeader(_ post: FeedPost) -> some View {
        HStack(spacing: 12) {
            MeeshyAvatar(
                name: post.author,
                mode: .custom(44),
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
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(theme.textPrimary)

                Text(post.timestamp, style: .relative)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
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
        }
        .padding(16)
    }

    // MARK: - Post Content

    @ViewBuilder
    private func postContent(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(post.displayContent)
                .font(.system(size: 16))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)

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
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.bottom, 12)
    }

    // MARK: - Media (placeholder — full gallery will reuse FeedPostCard media components)

    @ViewBuilder
    private func mediaPreview(_ post: FeedPost) -> some View {
        if let firstMedia = post.media.first, let urlString = firstMedia.url {
            AsyncImage(url: URL(string: urlString)) { image in
                image
                    .resizable()
                    .scaledToFill()
            } placeholder: {
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.inputBackground)
                    .overlay(ProgressView())
            }
            .frame(maxHeight: 300)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(.horizontal, 16)
            .padding(.bottom, 12)

            if post.media.count > 1 {
                Text("+\(post.media.count - 1) media")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 8)
            }
        }
    }

    // MARK: - Actions

    @ViewBuilder
    private func postActions(_ post: FeedPost) -> some View {
        HStack(spacing: 0) {
            Button {
                Task { await viewModel.likePost() }
                HapticFeedback.light()
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: post.isLiked ? "heart.fill" : "heart")
                        .font(.system(size: 18))
                        .foregroundColor(post.isLiked ? MeeshyColors.error : theme.textSecondary)
                    Text("\(post.likes)")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(post.isLiked ? MeeshyColors.error : theme.textSecondary)
                }
            }

            Spacer()

            HStack(spacing: 6) {
                Image(systemName: "bubble.right")
                    .font(.system(size: 17))
                if post.commentCount > 0 {
                    Text("\(post.commentCount)")
                        .font(.system(size: 13, weight: .medium))
                }
            }
            .foregroundColor(theme.textSecondary)

            Spacer()

            Button {
                Task { await viewModel.bookmarkPost() }
                HapticFeedback.light()
            } label: {
                Image(systemName: "bookmark")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }

            Spacer()

            Button {
                HapticFeedback.light()
            } label: {
                Image(systemName: "square.and.arrow.up")
                    .font(.system(size: 17))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .padding(16)
    }

    // MARK: - Comments

    @ViewBuilder
    private var commentsSection: some View {
        ForEach(viewModel.comments) { comment in
            CommentRowView(
                comment: comment,
                accentColor: displayPost?.authorColor ?? "6366F1",
                onReply: {
                    isCommentFocused = true
                },
                onLikeComment: {
                    Task {
                        try? await PostService.shared.likeComment(postId: postId, commentId: comment.id)
                    }
                }
            )
            .padding(.horizontal, 16)
        }

        if viewModel.isLoadingComments {
            ProgressView()
                .padding()
        }

        if viewModel.hasMoreComments && !viewModel.isLoadingComments {
            Button {
                Task { await viewModel.loadComments(postId) }
            } label: {
                Text("Charger plus de commentaires")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
            }
            .padding()
        }
    }

    // MARK: - Comment Composer

    private var commentComposer: some View {
        HStack(spacing: 12) {
            TextField("Ajouter un commentaire...", text: $commentText)
                .focused($isCommentFocused)
                .font(.system(size: 15))
                .foregroundColor(theme.textPrimary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 20)
                        .fill(theme.inputBackground)
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(
                                    isCommentFocused ? MeeshyColors.indigo500.opacity(0.5) : theme.inputBorder,
                                    lineWidth: 1
                                )
                        )
                )

            if !commentText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Button {
                    let text = commentText.trimmingCharacters(in: .whitespacesAndNewlines)
                    commentText = ""
                    isCommentFocused = false
                    HapticFeedback.success()
                    Task { await viewModel.sendComment(text) }
                } label: {
                    Circle()
                        .fill(MeeshyColors.brandGradient)
                        .frame(width: 36, height: 36)
                        .overlay(
                            Image(systemName: "paperplane.fill")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .rotationEffect(.degrees(45))
                                .offset(x: -1)
                        )
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
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: commentText.isEmpty)
    }
}
