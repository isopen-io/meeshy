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

    /// « Voir » n'apparaît que tant qu'il reste des réponses non révélées (au-delà
    /// de l'auto-preview de 2). Une fois le thread déplié, il disparaît → pas de repli.
    private var showSeeReplies: Bool {
        !isExpanded && remainingRepliesCount > 0
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
                showSeeReplies: showSeeReplies,
                onSeeReplies: { onToggleThread() },
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

            // Le bouton « Voir » vit désormais dans la barre d'actions du commentaire
            // racine (`CommentRowView`, gated par `showSeeReplies`), plus ici.

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
}

// MARK: - Comments Sheet View

struct CommentsSheetView: View {
    let post: FeedPost
    let accentColor: String
    /// Fired with the post id AFTER a comment was successfully sent — lets a host
    /// (e.g. the reels viewer) bump its own comment counter. Optional; nil = no-op.
    var onCommentSent: ((_ postId: String) -> Void)? = nil

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
        onCommentSent: ((_ postId: String) -> Void)? = nil
    ) {
        self.post = post
        self.accentColor = accentColor
        self.onCommentSent = onCommentSent
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

    /// Variante pour les commentaires domaine déjà mappés (`FeedComment`). C'est
    /// celle réellement branchée dans la sheet : elle sème `likedIds` à partir de
    /// `post.comments` (et des réponses chargées) qui portent désormais
    /// `currentUserReactions` (cf. `toFeedPost` / `loadReplies`). Sans ce seeding,
    /// tout commentaire déjà liké s'affichait cœur vide à l'ouverture.
    static func computeLikedIds(from comments: [FeedComment]) -> Set<String> {
        Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    /// Sème (additif) `likedIds` depuis l'état serveur des commentaires fournis,
    /// sans écraser les toggles optimistic/socket déjà appliqués.
    private func seedLikedIds(from comments: [FeedComment]) {
        let seeded = Self.computeLikedIds(from: comments)
        guard !seeded.isEmpty else { return }
        likedIds.formUnion(seeded)
    }

    /// Layers a freshly-fetched comment page over the current in-memory list
    /// WITHOUT discarding local-only rows the fetch's server snapshot
    /// couldn't have known about — an unconfirmed optimistic `tmp_` send, or
    /// a comment reconciled from the `comment:added` socket echo that landed
    /// while the GET was in flight. A plain `liveComments = fetched`
    /// overwrite would silently drop those. `fetched` (server-ordered,
    /// newest first) is the base; any `current` row whose id isn't present
    /// in `fetched` is kept in front — it's newer than the snapshot, matching
    /// where the composer/socket handler insert it (`at: 0`).
    static func mergeFetchedComments(current: [FeedComment], fetched: [FeedComment]) -> [FeedComment] {
        let fetchedIds = Set(fetched.map(\.id))
        let localOnly = current.filter { !fetchedIds.contains($0.id) }
        return localOnly + fetched
    }

    /// Removes the optimistic `tempId` row (and decrements its parent's reply
    /// count / the sheet's total count) — shared by the synchronous
    /// enqueue-refusal `catch` and the async `.exhausted` outbox observer,
    /// both of which restore the identical pre-send snapshot.
    private func rollbackOptimisticComment(tempId: String, parentId: String?) {
        if let parentId {
            var existing = repliesMap[parentId] ?? []
            existing.removeAll { $0.id == tempId }
            repliesMap[parentId] = existing
            var current = liveComments ?? post.comments
            if let idx = current.firstIndex(where: { $0.id == parentId }), current[idx].replies > 0 {
                current[idx].replies -= 1
                liveComments = current
            }
        } else {
            var current = liveComments ?? post.comments
            current.removeAll { $0.id == tempId }
            liveComments = current
        }
        liveCommentCount = max((liveCommentCount ?? post.comments.count) - 1, 0)
    }

    /// Subscribes to `OfflineQueue.shared.outcomeStream(for: cmid)` and rolls
    /// back the optimistic comment if the row is escalated to `.exhausted`
    /// (retry budget spent — the server permanently rejected it). `.applied`
    /// is a no-op — the `comment:added` socket echo already reconciled the
    /// temp row in place.
    private func observeCreateCommentOutcome(cmid: String, tempId: String, parentId: String?) {
        Task { @MainActor in
            let stream = await OfflineQueue.shared.outcomeStream(for: cmid)
            for await event in stream {
                if case .exhausted = event {
                    rollbackOptimisticComment(tempId: tempId, parentId: parentId)
                    FeedbackToastManager.shared.showError(
                        String(localized: "feed.comments.send_error", defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main)
                    )
                }
            }
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                // Translucent sheet: no opaque fill on 16.4+ (the translucent
                // `presentationBackground` lets the reel/video show through, in
                // light AND dark). Pre-16.4 keeps the opaque gradient (no
                // presentation-background API).
                Group {
                    if #available(iOS 16.4, *) {
                        Color.clear
                    } else {
                        theme.backgroundGradient
                    }
                }
                .ignoresSafeArea()

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
                                    storyState: storyViewModel.storyRingState(forUserId: comment.authorId),
                                    presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline,
                                    replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                                    replyStoryResolver: { storyViewModel.storyRingState(forUserId: $0) },
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
                    Text(String(localized: "feed.comments.count", defaultValue: "\(commentCount) commentaires", bundle: .main))
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
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
                    .accessibilityLabel(String(localized: "a11y.comment.close", defaultValue: "Fermer", bundle: .main))
                }
            }
        }
        .presentationDetents([.large, .medium])
        .presentationDragIndicator(.visible)
        .modifier(TranslucentSheetBackground())
        .onAppear {
            SocialSocketManager.shared.joinPostRoom(postId: post.id)
            // Sème l'état "liké par moi" des commentaires top-level déjà chargés
            // (`post.comments` porte `currentUserReactions` depuis `toFeedPost`).
            seedLikedIds(from: comments)
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
                parentId: parentId,
                currentUserReactions: data.comment.currentUserReactions
            )
            // The echoed event for OUR own just-sent comment: replace the optimistic
            // placeholder (same author + content) in place instead of duplicating it.
            func isTwin(_ c: FeedComment) -> Bool {
                c.id.hasPrefix("tmp_")
                    && c.authorId == feedComment.authorId
                    && c.content == feedComment.content
                    && c.parentId == parentId
            }
            if let parentId {
                var existing = repliesMap[parentId] ?? []
                if let idx = existing.firstIndex(where: isTwin) {
                    existing[idx] = feedComment                 // reconcile our temp
                    repliesMap[parentId] = existing
                } else if !existing.contains(where: { $0.id == feedComment.id }) {
                    existing.insert(feedComment, at: 0)
                    repliesMap[parentId] = existing
                    var current = liveComments ?? post.comments
                    if let idx = current.firstIndex(where: { $0.id == parentId }) {
                        current[idx].replies += 1
                        liveComments = current
                    }
                }
            } else {
                var current = liveComments ?? post.comments
                if let idx = current.firstIndex(where: isTwin) {
                    current[idx] = feedComment                  // reconcile our temp
                } else if !current.contains(where: { $0.id == feedComment.id }) {
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
            // Hydrate repliesMap from cache before hitting the network so
            // auto-preview rows are visible instantly on re-present.
            let withReplies = topLevelComments.filter { $0.replies > 0 }
            for comment in withReplies.prefix(5) {
                let cacheKey = "replies-\(comment.id)"
                let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
                if case .fresh(let replies, _) = cached {
                    repliesMap[comment.id] = replies
                    seedLikedIds(from: replies)
                } else if case .stale(let replies, _) = cached {
                    repliesMap[comment.id] = replies
                    seedLikedIds(from: replies)
                }
                await loadReplies(commentId: comment.id)
            }
        }
        .task {
            await loadFullCommentsIfNeeded()
        }
    }

    /// The feed only embeds the top 3 comments per post (gateway
    /// `postIncludes.ts` `take: 3`) — this sheet used to permanently show
    /// just those 3 even when the header announces the real total
    /// (`post.commentCount`), with no fetch and no pagination past what the
    /// feed page happened to carry. Loads the full first page cache-first
    /// (mirrors `PostDetailViewModel.loadComments`) whenever the server-known
    /// total exceeds what's embedded; a no-op for posts with ≤3 comments.
    private func loadFullCommentsIfNeeded() async {
        guard post.commentCount > post.comments.count else { return }
        let cacheKey = "post-\(post.id)"
        let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
        switch cached {
        case .fresh(let full, _), .stale(let full, _):
            // Merge (not overwrite): the `await` above may have given an
            // optimistic send or a `comment:added` socket echo enough time
            // to land in `liveComments` first.
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: full)
            seedLikedIds(from: full)
        case .expired, .empty:
            break
        }
        do {
            let response = try await PostService.shared.getComments(postId: post.id, cursor: nil, limit: 20)
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let fetched = response.data.map { c -> FeedComment in
                let translated = PostDetailViewModel.resolveCommentTranslation(
                    translations: c.translations, originalLanguage: c.originalLanguage, preferredLanguages: langs
                )
                return FeedComment(
                    id: c.id, author: c.author.name, authorId: c.author.id,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: c.parentId, effectFlags: c.effectFlags ?? 0,
                    originalLanguage: c.originalLanguage, translatedContent: translated,
                    currentUserReactions: c.currentUserReactions
                )
            }
            // Merge, never overwrite: `liveComments` may already carry an
            // optimistic send or a socket-reconciled comment that landed
            // while this GET was in flight — the server snapshot the GET
            // resolved from can't know about either yet.
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: fetched)
            seedLikedIds(from: fetched)
            try? await CacheCoordinator.shared.comments.save(fetched, for: cacheKey)
        } catch {
            // Network failed — keep whatever we already have (embedded top-3
            // or the cached stale page loaded above). Matches this sheet's
            // existing silent-fail pattern for supplementary loads (e.g. the
            // replies prefetch above).
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
        // Unification du like de commentaire : la réaction socket ❤️ ci-dessous est la
        // SOURCE UNIQUE (le gateway synchronise `likeCount = count(CommentReaction)` —
        // CS1). On NE déclenche PLUS le callback REST `onLikeComment` (double-écriture
        // qui incrémentait `likeCount` + `reactionSummary` une 2e fois, et n'envoyait
        // jamais d'unlike : toujours `liked:true`). Aligne le chemin feed sur reels/détail.

        do {
            // A6 — hard timeout: protects against a hung SocialSocketManager
            // leaving the heart button locked forever (commentId stuck in
            // heartInFlightIds because defer only fires on Task completion).
            try await withTaskTimeout(seconds: TaskTimeoutDefaults.socialReaction) {
                if wasLiked {
                    _ = try await SocialSocketManager.shared.removeCommentReaction(
                        commentId: commentId, postId: post.id, emoji: StoryViewerView.heartEmoji
                    )
                } else {
                    _ = try await SocialSocketManager.shared.addCommentReaction(
                        commentId: commentId, postId: post.id, emoji: StoryViewerView.heartEmoji
                    )
                }
            }
        } catch {
            // Fallback REST quand le socket échoue (timeout / déconnexion). Le endpoint
            // REST écrit la MÊME table `CommentReaction` (idempotent, likeCount synchronisé)
            // → le like persiste. Mutuellement exclusif avec le socket (déclenché SEULEMENT
            // dans ce catch) : ce n'est PAS la double-écriture retirée. Miroir de
            // `FeedView.togglePostHeart` (post). Rollback uniquement si le REST échoue aussi.
            let restOK: Bool
            do {
                if wasLiked {
                    try await PostService.shared.unlikeComment(postId: post.id, commentId: commentId)
                } else {
                    try await PostService.shared.likeComment(postId: post.id, commentId: commentId)
                }
                restOK = true
            } catch {
                restOK = false
            }
            if !restOK {
                if wasLiked {
                    likedIds.insert(commentId)
                    likeDelta[commentId] = (likeDelta[commentId] ?? 0) + 1
                } else {
                    likedIds.remove(commentId)
                    likeDelta[commentId] = (likeDelta[commentId] ?? 0) - 1
                }
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
                    originalLanguage: c.originalLanguage, translatedContent: translated,
                    currentUserReactions: c.currentUserReactions
                )
            }
            repliesMap[commentId] = replies
            // Sème l'état "liké par moi" des réponses chargées (elles portent
            // `currentUserReactions` depuis `loadReplies`/`getCommentReplies`).
            seedLikedIds(from: replies)
            // Persist replies under "replies-{commentId}" so re-presenting the sheet
            // hydrates the auto-preview rows instantly without a round-trip.
            try? await CacheCoordinator.shared.comments.save(replies, for: "replies-\(commentId)")
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
                        AvatarContextMenuItem(label: String(localized: "feed.comments.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                            selectedProfileUser = .from(feedPost: post)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(RelativeTimeFormatter.shortString(for: post.timestamp))
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
            .accessibilityLabel(String(localized: "a11y.comment.cancel_reply", defaultValue: "Annuler la réponse", bundle: .main))
            .meeshyTapTarget(44)
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
                mentionController.clearDraft()

                let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
                let effectFlags = flags > 0 ? Int(flags) : nil

                // Optimistic: insert the comment in its place IMMEDIATELY — a reply
                // goes under its parent (sub-message), otherwise it's a top-level
                // row — WITHOUT waiting for the network. The confirmed server row
                // reconciles it (REST response OR the `comment:added` socket event,
                // whichever lands first); a failure rolls it back.
                let tempId = "tmp_\(UUID().uuidString)"
                let me = AuthManager.shared.currentUser
                let optimistic = FeedComment(
                    id: tempId,
                    author: me?.displayName ?? me?.username ?? "",
                    authorId: me?.id ?? "",
                    authorAvatarURL: me?.avatar,
                    content: text, timestamp: Date(),
                    likes: 0, replies: 0, parentId: parentId,
                    effectFlags: effectFlags ?? 0
                )
                if let parentId {
                    var existing = repliesMap[parentId] ?? []
                    existing.insert(optimistic, at: 0)
                    repliesMap[parentId] = existing
                    expandedThreads.insert(parentId)
                    var current = liveComments ?? post.comments
                    if let idx = current.firstIndex(where: { $0.id == parentId }) {
                        current[idx].replies += 1
                        liveComments = current
                    }
                } else {
                    var current = liveComments ?? post.comments
                    current.insert(optimistic, at: 0)
                    liveComments = current
                }
                liveCommentCount = (liveCommentCount ?? post.comments.count) + 1

                Task {
                    do {
                        let apiComment = try await PostService.shared.addComment(postId: post.id, content: text, parentId: parentId, effectFlags: effectFlags)
                        let feedComment = FeedComment(
                            id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                            authorAvatarURL: apiComment.author.avatar,
                            content: apiComment.content, timestamp: apiComment.createdAt,
                            likes: 0, replies: 0,
                            parentId: parentId,
                            effectFlags: apiComment.effectFlags ?? effectFlags ?? 0
                        )
                        // Swap the optimistic temp for the server row (no count
                        // change). Idempotent if the socket event already did it.
                        if let parentId {
                            var existing = repliesMap[parentId] ?? []
                            if let idx = existing.firstIndex(where: { $0.id == tempId }) {
                                existing[idx] = feedComment
                            } else if !existing.contains(where: { $0.id == feedComment.id }) {
                                existing.insert(feedComment, at: 0)
                            }
                            repliesMap[parentId] = existing
                        } else {
                            var current = liveComments ?? post.comments
                            if let idx = current.firstIndex(where: { $0.id == tempId }) {
                                current[idx] = feedComment
                            } else if !current.contains(where: { $0.id == feedComment.id }) {
                                current.insert(feedComment, at: 0)
                            }
                            liveComments = current
                        }
                        onCommentSent?(post.id)
                    } catch {
                        // REST failed — most commonly because the device is
                        // offline. Durably enqueue via the existing
                        // `.createComment` outbox kind (same one
                        // `FeedViewModel`/`PostDetailViewModel.sendComment`
                        // already use) instead of unconditionally losing the
                        // comment. The optimistic `tempId` row is reconciled
                        // by the already-wired `comment:added` socket handler
                        // below (`isTwin` match on author+content+parentId),
                        // which fires once the outbox replay lands — no
                        // separate REST-response reconciliation needed here.
                        // NOTE: like those two call sites, `CreateCommentPayload`
                        // doesn't carry `effectFlags` yet (SDK schema gap) — a
                        // blur/sticker effect on a comment sent while offline
                        // is dropped on replay; the comment text itself survives.
                        do {
                            let cmid = ClientMutationId.generate()
                            let payload = CreateCommentPayload(
                                clientMutationId: cmid,
                                postId: post.id,
                                parentCommentId: parentId,
                                content: text
                            )
                            try await OfflineQueue.shared.enqueue(.createComment, payload: payload, conversationId: post.id)
                            onCommentSent?(post.id)

                            // Roll back the optimistic comment if the outbox
                            // exhausts its retry budget (server permanently
                            // rejects). Mirrors `FeedViewModel.sendComment`'s
                            // `observeOutcome` — without this a permanently-
                            // failing comment stays in the sheet forever: the
                            // `comment:added` echo it's waiting on will never
                            // arrive for a mutation the outbox gave up on.
                            observeCreateCommentOutcome(cmid: cmid, tempId: tempId, parentId: parentId)
                        } catch {
                            // Roll back the optimistic row + counts — the
                            // outbox itself refused the row.
                            rollbackOptimisticComment(tempId: tempId, parentId: parentId)
                            FeedbackToastManager.shared.showError(String(localized: "feed.comments.send_error", defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main))
                        }
                    }
                }
            },
            textBinding: $composerText,
            replyBanner: replyingTo.map { AnyView(commentReplyBanner($0)) },
            onTextChange: { text in
                mentionController.handleQuery(in: text)
            },
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            focusTrigger: $composerFocusTrigger
        )
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
    /// Affiche le bouton « Voir » (charger/afficher les réponses) à côté de
    /// « Répondre ». Calculé par le parent (`ThreadedCommentSection`) : vrai
    /// seulement s'il reste des réponses non révélées. Ignoré pour une réponse.
    var showSeeReplies: Bool = false
    /// Déclenché par « Voir » : déplie le thread (charge + affiche les réponses)
    /// sans avoir à répondre. Sans repli (le bouton disparaît une fois déplié).
    var onSeeReplies: (() -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState = .offline

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.showSeeReplies == rhs.showSeeReplies &&
        lhs.comment.replies == rhs.comment.replies &&
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
                    AvatarContextMenuItem(label: String(localized: "feed.comments.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                        selectedProfileUser = .from(feedComment: comment)
                    }
                ]
            )
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: isReply ? 4 : 6) {
                HStack(spacing: 4) {
                    Text(comment.author)
                        .font(.system(size: authorFont, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))
                        .onTapGesture {
                            HapticFeedback.light()
                            selectedProfileUser = .from(feedComment: comment)
                        }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(String(format: String(localized: "a11y.comment.author_profile", defaultValue: "Profil de %@", bundle: .main), comment.author))
                        .accessibilityHint(String(localized: "a11y.comment.author_profile.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))

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
                        .accessibilityElement(children: .ignore)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(String(format: String(localized: "a11y.comment.show_language", defaultValue: "Afficher en %@", bundle: .main), origDisplay?.name ?? (comment.originalLanguage ?? "")))
                        .accessibilityValue(isOrigActive ? String(localized: "a11y.comment.language_shown", defaultValue: "Affichée", bundle: .main) : "")
                        .meeshyTapTarget(44)

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
                        .accessibilityElement(children: .ignore)
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(String(format: String(localized: "a11y.comment.show_language", defaultValue: "Afficher en %@", bundle: .main), targetDisplay?.name ?? targetLang))
                        .accessibilityValue(isTransActive ? String(localized: "a11y.comment.language_shown", defaultValue: "Affichée", bundle: .main) : "")
                        .meeshyTapTarget(44)

                        Image(systemName: "translate")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(MeeshyColors.indigo400)
                            .accessibilityHidden(true)
                    }

                    Text("\u{00B7}").font(.system(size: 12)).foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)

                    Text(RelativeTimeFormatter.shortString(for: comment.timestamp))
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }

                Text(effectiveCommentContent)
                    .font(.system(size: contentFont))
                    .foregroundColor(theme.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: showOriginal)
                    .messageEffects(comment.effects, hasPlayedAppearance: hasPlayedAppearanceEffect)
                    .accessibilityLabel(String(format: String(localized: "a11y.comment.body", defaultValue: "%1$@ : %2$@", bundle: .main), RelativeTimeFormatter.shortString(for: comment.timestamp), effectiveCommentContent))
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
                    .accessibilityElement(children: .ignore)
                    .accessibilityAddTraits(.isButton)
                    .accessibilityLabel(isLiked
                        ? String(localized: "a11y.comment.unlike", defaultValue: "Je n'aime plus", bundle: .main)
                        : String(localized: "a11y.comment.like", defaultValue: "J'aime", bundle: .main))
                    .accessibilityValue("\(likeCount)")
                    .accessibilityHint(String(localized: "a11y.comment.like.hint", defaultValue: "Aimer ce commentaire", bundle: .main))

                    // Max 2 niveaux : une réponse (niveau 2) ne peut pas elle-même
                    // recevoir de réponse → ni « Répondre » ni « Voir ». Un commentaire
                    // racine montre `↰ N  Répondre`, puis — s'il reste des réponses non
                    // révélées (`showSeeReplies`) — `·  Voir` qui charge/affiche les
                    // réponses SANS avoir à répondre.
                    if !isReply {
                        HStack(spacing: 8) {
                            Button {
                                onReply()
                                HapticFeedback.light()
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "arrowshape.turn.up.left")
                                        .font(.system(size: 13))
                                    if comment.replies > 0 {
                                        Text("\(comment.replies)")
                                            .font(.system(size: 12, weight: .semibold))
                                    }
                                    Text(String(localized: "feed.comments.reply", defaultValue: "Répondre", bundle: .main))
                                        .font(.system(size: 12, weight: .medium))
                                }
                                .foregroundColor(theme.textMuted)
                            }
                            .frame(minHeight: 44)
                            .accessibilityLabel(String(localized: "a11y.comment.reply", defaultValue: "Répondre", bundle: .main))
                            .accessibilityValue(comment.replies > 0 ? String(format: String(localized: "a11y.comment.replies.count", defaultValue: "%d réponses", bundle: .main), comment.replies) : "")
                            .accessibilityHint(String(format: String(localized: "a11y.comment.reply.hint", defaultValue: "Répondre à %@", bundle: .main), comment.author))

                            if showSeeReplies {
                                Text("\u{00B7}")
                                    .font(.system(size: 12))
                                    .foregroundColor(theme.textMuted)
                                    .accessibilityHidden(true)

                                Button {
                                    onSeeReplies?()
                                    HapticFeedback.light()
                                } label: {
                                    Text(String(localized: "feed.comments.see_replies", defaultValue: "Voir", bundle: .main))
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundColor(Color(hex: accentColor))
                                }
                                .frame(minHeight: 44)
                                .accessibilityElement(children: .ignore)
                                .accessibilityAddTraits(.isButton)
                                .accessibilityLabel(comment.replies > 0
                                    ? String(format: String(localized: "a11y.comment.show_replies", defaultValue: "Voir %d réponses", bundle: .main), comment.replies)
                                    : String(localized: "feed.comments.see_replies", defaultValue: "Voir", bundle: .main))
                            }
                        }
                    }

                    Spacer()

                    Button {
                        HapticFeedback.light()
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: isReply ? 12 : 14))
                            .foregroundColor(theme.textMuted)
                    }
                    .accessibilityLabel(String(localized: "a11y.comment.more_options", defaultValue: "Plus d'options", bundle: .main))
                    .meeshyTapTarget(44)
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

/// Makes a sheet's backdrop translucent (`.ultraThinMaterial`) so the reel /
/// post media shows through behind the comments, in light AND dark. No-op
/// before iOS 16.4 (the `presentationBackground` API is unavailable there).
private struct TranslucentSheetBackground: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 16.4, *) {
            content.presentationBackground(.ultraThinMaterial)
        } else {
            content
        }
    }
}
