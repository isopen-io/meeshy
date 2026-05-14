import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Threaded Comment Section

struct ThreadedCommentSection: View {
    let comment: FeedComment
    let replies: [FeedComment]
    let isExpanded: Bool
    let isLoadingReplies: Bool
    let accentColor: String
    let likedIds: Set<String>
    let likeDelta: [String: Int]
    let heartInFlightIds: Set<String>
    let onReply: (FeedComment) -> Void
    let onToggleThread: () -> Void
    let onLikeComment: (String) -> Void
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState = .offline
    var replyMoodResolver: ((String) -> String?)? = nil
    var replyStoryResolver: ((String) -> StoryRingState)? = nil
    var replyPresenceResolver: ((String) -> PresenceState)? = nil

    @EnvironmentObject private var statusViewModel: StatusViewModel

    private var theme: ThemeManager { ThemeManager.shared }

    /// Show first 2 replies by default without requiring toggle
    private var autoPreviewReplies: [FeedComment] {
        Array(replies.prefix(2))
    }

    private var remainingRepliesCount: Int {
        let loaded = replies.count
        // Use the greater of server count or local count for accuracy
        let total = max(comment.replies, loaded)
        return max(0, total - autoPreviewReplies.count)
    }

    var body: some View {
        VStack(spacing: 0) {
            CommentRowView(
                comment: comment,
                accentColor: accentColor,
                isLiked: likedIds.contains(comment.id),
                likeCount: max(0, comment.likes + (likeDelta[comment.id] ?? 0)),
                isInFlight: heartInFlightIds.contains(comment.id),
                onReply: { onReply(comment) },
                onLikeComment: { onLikeComment(comment.id) },
                moodEmoji: moodEmoji,
                storyState: storyState,
                presenceState: presenceState
            )

            // Auto-show first 2 replies (no toggle needed)
            if !autoPreviewReplies.isEmpty && !isExpanded {
                ForEach(autoPreviewReplies) { reply in
                    CommentRowView(
                        comment: reply,
                        accentColor: accentColor,
                        isReply: true,
                        isLiked: likedIds.contains(reply.id),
                        likeCount: max(0, reply.likes + (likeDelta[reply.id] ?? 0)),
                        isInFlight: heartInFlightIds.contains(reply.id),
                        onReply: { onReply(reply) },
                        onLikeComment: { onLikeComment(reply.id) },
                        moodEmoji: replyMoodResolver?(reply.authorId),
                        storyState: replyStoryResolver?(reply.authorId) ?? .none,
                        presenceState: replyPresenceResolver?(reply.authorId) ?? .offline
                    )
                    .padding(.leading, 36)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            // "Voir les autres réponses" toggle
            if comment.replies > 2 {
                threadToggleButton
            }

            // Expanded — show ALL replies
            if isExpanded {
                if isLoadingReplies && replies.isEmpty {
                    HStack {
                        Spacer()
                        ProgressView()
                            .scaleEffect(0.8)
                        Spacer()
                    }
                    .padding(.leading, 36)
                    .padding(.vertical, 8)
                }

                ForEach(replies) { reply in
                    CommentRowView(
                        comment: reply,
                        accentColor: accentColor,
                        isReply: true,
                        isLiked: likedIds.contains(reply.id),
                        likeCount: max(0, reply.likes + (likeDelta[reply.id] ?? 0)),
                        isInFlight: heartInFlightIds.contains(reply.id),
                        onReply: { onReply(reply) },
                        onLikeComment: { onLikeComment(reply.id) },
                        moodEmoji: replyMoodResolver?(reply.authorId),
                        storyState: replyStoryResolver?(reply.authorId) ?? .none,
                        presenceState: replyPresenceResolver?(reply.authorId) ?? .offline
                    )
                    .padding(.leading, 36)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isExpanded)
    }

    private var threadToggleButton: some View {
        Button {
            HapticFeedback.light()
            onToggleThread()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .bold))

                Text(isExpanded
                     ? "Masquer les r\u{00E9}ponses"
                     : "Voir \(remainingRepliesCount) autre\(remainingRepliesCount > 1 ? "s" : "") r\u{00E9}ponse\(remainingRepliesCount > 1 ? "s" : "")")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(Color(hex: accentColor))
            .padding(.leading, 36)
            .padding(.vertical, 6)
        }
    }
}

// MARK: - Comments Sheet View

struct CommentsSheetView: View {
    let post: FeedPost
    let accentColor: String
    var onSendComment: ((String, String, String?) -> Void)? = nil
    var onLikeComment: ((String, String) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @State private var replyingTo: FeedComment? = nil
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var liveComments: [FeedComment]?
    @State private var liveCommentCount: Int?
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var commentBlurEnabled: Bool = false
    @State private var commentEffects: MessageEffects = .none
    @State private var composerFocusTrigger: Bool = false
    @State private var repliesMap: [String: [FeedComment]] = [:]
    @State private var expandedThreads: Set<String> = []
    @State private var loadingReplies: Set<String> = []

    /// Hoisted like state — keyed by commentId, seeded from API `currentUserReactions`.
    @State private var likedIds: Set<String> = []
    /// Local like-count delta keyed by commentId (optimistic, applied on top of server count).
    @State private var likeDelta: [String: Int] = [:]
    /// In-flight heart taps: prevents rapid-tap desync.
    @State private var heartInFlightIds: Set<String> = []

    /// Tracks current composer text so `MentionSuggestionPanel` can pass it
    /// back to `insertMention(_:into:)` without needing to own the text field.
    @State private var composerText: String = ""

    @StateObject private var mentionController: MentionComposerController

    init(
        post: FeedPost,
        accentColor: String,
        onSendComment: ((String, String, String?) -> Void)? = nil,
        onLikeComment: ((String, String) -> Void)? = nil
    ) {
        self.post = post
        self.accentColor = accentColor
        self.onSendComment = onSendComment
        self.onLikeComment = onLikeComment
        _mentionController = StateObject(wrappedValue: MentionComposerController(
            context: .post(id: post.id)
        ))
    }

    private var comments: [FeedComment] { liveComments ?? post.comments }
    private var commentCount: Int { liveCommentCount ?? post.commentCount }

    private var topLevelComments: [FeedComment] {
        comments.filter { $0.parentId == nil }
    }

    /// Computes the set of comment ids that the current user has heart-reacted to.
    /// Mirrors `StoryViewerView.computeLikedIds(from:)` so seeding logic is testable.
    static func computeLikedIds(from comments: [APIPostComment]) -> Set<String> {
        Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                VStack(spacing: 0) {
                    ScrollView(showsIndicators: false) {
                        LazyVStack(spacing: 0) {
                            ForEach(topLevelComments) { comment in
                                ThreadedCommentSection(
                                    comment: comment,
                                    replies: repliesMap[comment.id] ?? [],
                                    isExpanded: expandedThreads.contains(comment.id),
                                    isLoadingReplies: loadingReplies.contains(comment.id),
                                    accentColor: accentColor,
                                    likedIds: likedIds,
                                    likeDelta: likeDelta,
                                    heartInFlightIds: heartInFlightIds,
                                    onReply: { target in
                                        replyingTo = target
                                        composerFocusTrigger = true
                                    },
                                    onToggleThread: {
                                        Task { await toggleThread(comment.id) }
                                    },
                                    onLikeComment: { commentId in
                                        Task { await toggleCommentLike(commentId: commentId) }
                                    },
                                    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                                    storyState: storyViewModel.storyGroupForUser(userId: comment.authorId).map { $0.hasUnviewed ? .unread : .read } ?? .none,
                                    presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline,
                                    replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                                    replyStoryResolver: { storyViewModel.storyGroupForUser(userId: $0).map { $0.hasUnviewed ? .unread : .read } ?? .none },
                                    replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state ?? .offline }
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }

                    VStack(spacing: 0) {
                        if mentionController.activeQuery != nil {
                            MentionSuggestionPanel(
                                controller: mentionController,
                                accentColor: accentColor,
                                currentText: composerText,
                                onSelect: { updated in
                                    // The panel calls insertMention which clears suggestions;
                                    // we update composerText so the next onChange syncs.
                                    composerText = updated
                                }
                            )
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                        commentComposer
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: mentionController.activeQuery != nil)
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
        .onAppear {
            SocialSocketManager.shared.joinPostRoom(postId: post.id)
        }
        .onDisappear {
            SocialSocketManager.shared.leavePostRoom(postId: post.id)
        }
        .onReceive(
            SocialSocketManager.shared.commentAdded
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let parentId = data.comment.parentId
            let feedComment = FeedComment(
                id: data.comment.id, author: data.comment.author.name,
                authorId: data.comment.author.id,
                authorAvatarURL: data.comment.author.avatar,
                content: data.comment.content, timestamp: data.comment.createdAt,
                likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                parentId: parentId
            )
            if let parentId {
                // Always insert into repliesMap so auto-preview stays live
                var existing = repliesMap[parentId] ?? []
                if !existing.contains(where: { $0.id == feedComment.id }) {
                    existing.insert(feedComment, at: 0)
                    repliesMap[parentId] = existing
                }
                var current = liveComments ?? post.comments
                if let idx = current.firstIndex(where: { $0.id == parentId }) {
                    current[idx].replies += 1
                    liveComments = current
                }
            } else {
                var current = liveComments ?? post.comments
                if !current.contains(where: { $0.id == feedComment.id }) {
                    current.insert(feedComment, at: 0)
                }
                liveComments = current
            }
            liveCommentCount = data.commentCount
        }
        .onReceive(
            SocialSocketManager.shared.commentReactionAdded
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { event in
            guard event.emoji == StoryViewerView.heartEmoji else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                likedIds.insert(event.commentId)
            } else {
                likeDelta[event.commentId] = (likeDelta[event.commentId] ?? 0) + 1
            }
        }
        .onReceive(
            SocialSocketManager.shared.commentReactionRemoved
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { event in
            guard event.emoji == StoryViewerView.heartEmoji else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                likedIds.remove(event.commentId)
            } else {
                likeDelta[event.commentId] = (likeDelta[event.commentId] ?? 0) - 1
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
        .withStatusBubble()
        .task {
            // Auto-load replies for first 5 comments that have replies > 0
            // so the auto-preview (first 2 replies) is populated on appear
            let withReplies = topLevelComments.filter { $0.replies > 0 }
            for comment in withReplies.prefix(5) {
                await loadReplies(commentId: comment.id)
            }
        }
    }

    // MARK: - Comment Like Toggle

    private func toggleCommentLike(commentId: String) async {
        guard !heartInFlightIds.contains(commentId) else { return }
        heartInFlightIds.insert(commentId)
        defer { heartInFlightIds.remove(commentId) }

        let wasLiked = likedIds.contains(commentId)
        if wasLiked {
            likedIds.remove(commentId)
            likeDelta[commentId] = (likeDelta[commentId] ?? 0) - 1
        } else {
            likedIds.insert(commentId)
            likeDelta[commentId] = (likeDelta[commentId] ?? 0) + 1
        }
        onLikeComment?(post.id, commentId)

        do {
            if wasLiked {
                _ = try await SocialSocketManager.shared.removeCommentReaction(
                    commentId: commentId, postId: post.id, emoji: StoryViewerView.heartEmoji
                )
            } else {
                _ = try await SocialSocketManager.shared.addCommentReaction(
                    commentId: commentId, postId: post.id, emoji: StoryViewerView.heartEmoji
                )
            }
        } catch {
            if wasLiked {
                likedIds.insert(commentId)
                likeDelta[commentId] = (likeDelta[commentId] ?? 0) + 1
            } else {
                likedIds.remove(commentId)
                likeDelta[commentId] = (likeDelta[commentId] ?? 0) - 1
            }
        }
    }

    // MARK: - Thread Management

    private func toggleThread(_ commentId: String) async {
        if expandedThreads.contains(commentId) {
            expandedThreads.remove(commentId)
        } else {
            expandedThreads.insert(commentId)
            if repliesMap[commentId] == nil {
                await loadReplies(commentId: commentId)
            }
        }
    }

    private func loadReplies(commentId: String) async {
        guard !loadingReplies.contains(commentId), repliesMap[commentId] == nil else { return }
        loadingReplies.insert(commentId)
        defer { loadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: post.id, commentId: commentId
            )
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let replies = response.data.map { c -> FeedComment in
                let translated = PostDetailViewModel.resolveCommentTranslation(
                    translations: c.translations, originalLanguage: c.originalLanguage,
                    preferredLanguages: langs
                )
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: commentId,
                    originalLanguage: c.originalLanguage, translatedContent: translated
                )
            }
            repliesMap[commentId] = replies
        } catch {
            expandedThreads.remove(commentId)
        }
    }

    // MARK: - Post Preview

    private var postPreview: some View {
        VStack(alignment: .leading, spacing: 12) {
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

            Text(post.displayContent)
                .font(.system(size: 15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(3)

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

    // MARK: - Comment Reply Banner

    private func commentReplyBanner(_ reply: FeedComment) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: reply.authorColor))
                .frame(width: 3, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(reply.author)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.authorColor))

                Text(reply.displayContent)
                    .font(.system(size: 12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    replyingTo = nil
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(theme.textMuted)
                    .frame(width: 24, height: 24)
                    .background(Circle().fill(isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
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

    // MARK: - Comment Composer (UniversalComposerBar)

    private var commentComposer: some View {
        UniversalComposerBar(
            style: .light,
            mode: .comment,
            accentColor: accentColor,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSend: { text in
                let parentId = replyingTo?.id
                let effects = commentEffects
                let blur = commentBlurEnabled
                replyingTo = nil
                commentEffects = .none
                commentBlurEnabled = false
                Task {
                    do {
                        let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
                        let effectFlags = flags > 0 ? Int(flags) : nil
                        let apiComment = try await PostService.shared.addComment(postId: post.id, content: text, parentId: parentId, effectFlags: effectFlags)
                        let feedComment = FeedComment(
                            id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                            authorAvatarURL: apiComment.author.avatar,
                            content: apiComment.content, timestamp: apiComment.createdAt,
                            likes: 0, replies: 0,
                            parentId: parentId,
                            effectFlags: apiComment.effectFlags ?? effectFlags ?? 0
                        )
                        if let parentId {
                            var existing = repliesMap[parentId] ?? []
                            existing.insert(feedComment, at: 0)
                            repliesMap[parentId] = existing
                            expandedThreads.insert(parentId)
                            var current = liveComments ?? post.comments
                            if let idx = current.firstIndex(where: { $0.id == parentId }) {
                                current[idx].replies += 1
                                liveComments = current
                            }
                        } else {
                            var current = liveComments ?? post.comments
                            if !current.contains(where: { $0.id == feedComment.id }) {
                                current.insert(feedComment, at: 0)
                            }
                            liveComments = current
                        }
                        liveCommentCount = (liveCommentCount ?? post.comments.count) + 1
                        mentionController.clearDraft()
                    } catch {
                        ToastManager.shared.showError("Erreur lors de l'envoi du commentaire")
                    }
                }
            },
            textBinding: $composerText,
            replyBanner: replyingTo.map { AnyView(commentReplyBanner($0)) },
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            focusTrigger: $composerFocusTrigger,
            onTextChange: { text in
                mentionController.handleQuery(in: text)
            }
        )
    }

    private func timeAgo(from date: Date) -> String {
        let seconds = Int(Date().timeIntervalSince(date))
        if seconds < 60 { return "\u{00C0} l'instant" }
        if seconds < 3600 { return "\(seconds / 60)m" }
        if seconds < 86400 { return "\(seconds / 3600)h" }
        return "\(seconds / 86400)j"
    }
}

// MARK: - Comment Row View

struct CommentRowView: View, Equatable {
    let comment: FeedComment
    let accentColor: String
    var isReply: Bool = false
    var isLiked: Bool = false
    var likeCount: Int = 0
    var isInFlight: Bool = false
    let onReply: () -> Void
    var onLikeComment: (() -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState = .offline

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.comment.content == rhs.comment.content &&
        lhs.comment.translatedContent == rhs.comment.translatedContent
    }

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showOriginal = false
    @State private var hasPlayedAppearanceEffect = false

    private var avatarContext: AvatarContext { .postComment }
    private var contentFont: CGFloat { isReply ? 14 : 15 }
    private var authorFont: CGFloat { isReply ? 13 : 14 }

    private var hasTranslation: Bool {
        comment.translatedContent != nil && comment.originalLanguage != nil
    }

    private var effectiveCommentContent: String {
        if showOriginal { return comment.content }
        return comment.displayContent
    }

    var body: some View {
        HStack(alignment: .top, spacing: isReply ? 10 : 12) {
            MeeshyAvatar(
                name: comment.author,
                context: avatarContext,
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

            VStack(alignment: .leading, spacing: isReply ? 4 : 6) {
                HStack(spacing: 4) {
                    Text(comment.author)
                        .font(.system(size: authorFont, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))
                        .onTapGesture {
                            HapticFeedback.light()
                            selectedProfileUser = .from(feedComment: comment)
                        }

                    if hasTranslation {
                        Text("\u{00B7}").font(.system(size: 12)).foregroundColor(theme.textMuted)

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

                        Image(systemName: "translate")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(MeeshyColors.indigo400)
                    }

                    Text("\u{00B7}").font(.system(size: 12)).foregroundColor(theme.textMuted)

                    Text(timeAgo(from: comment.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }

                Text(effectiveCommentContent)
                    .font(.system(size: contentFont))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: showOriginal)
                    .messageEffects(comment.effects, hasPlayedAppearance: hasPlayedAppearanceEffect)
                    .onAppear {
                        if comment.effects.hasAnyEffect && !hasPlayedAppearanceEffect {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                hasPlayedAppearanceEffect = true
                            }
                        }
                    }

                HStack(spacing: 20) {
                    Button {
                        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.6)) {
                            onLikeComment?()
                        }
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            let heartColor: Color = isLiked ? MeeshyColors.error : (likeCount > 0 ? Color(hex: accentColor) : theme.textMuted)
                            Image(systemName: isLiked || likeCount > 0 ? "heart.fill" : "heart")
                                .font(.system(size: isReply ? 12 : 14))
                                .foregroundColor(heartColor)
                                .scaleEffect(isLiked ? 1.1 : 1.0)

                            Text("\(likeCount)")
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(heartColor)
                        }
                    }
                    .disabled(isInFlight)
                    .frame(minHeight: 44)

                    Button {
                        onReply()
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrowshape.turn.up.left")
                                .font(.system(size: isReply ? 11 : 13))
                            Text("R\u{00E9}pondre")
                                .font(.system(size: 12, weight: .medium))
                        }
                        .foregroundColor(theme.textMuted)
                    }
                    .frame(minHeight: 44)

                    Spacer()

                    Button {
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: isReply ? 12 : 14))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.top, isReply ? 2 : 4)
            }
        }
        .padding(.vertical, isReply ? 8 : 12)
        .overlay(
            Group {
                if !isReply {
                    Rectangle()
                        .fill(theme.inputBorder.opacity(0.3))
                        .frame(height: 1)
                }
            },
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
        if seconds < 60 { return "\u{00C0} l'instant" }
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
