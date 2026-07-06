import SwiftUI
import Combine
import PhotosUI
import UniformTypeIdentifiers
import CoreLocation
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
    /// Supprime un commentaire (racine ou réponse). Le parent gère le retrait
    /// optimiste + l'appel API. Câblé sur chaque ligne uniquement quand
    /// l'utilisateur courant est l'auteur (`canDelete`).
    var onDeleteComment: ((FeedComment) -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState = .offline
    var replyMoodResolver: ((String) -> String?)? = nil
    var replyStoryResolver: ((String) -> StoryRingState)? = nil
    var replyPresenceResolver: ((String) -> PresenceState)? = nil

    @EnvironmentObject private var statusViewModel: StatusViewModel

    private var theme: ThemeManager { ThemeManager.shared }

    /// Renvoie un handler de suppression pour `c` SEULEMENT si l'utilisateur
    /// courant en est l'auteur — sinon `nil` (l'item « Supprimer » disparaît).
    private func deleteHandler(for c: FeedComment) -> (() -> Void)? {
        guard let onDeleteComment,
              let me = AuthManager.shared.currentUser?.id, !me.isEmpty,
              c.authorId == me else { return nil }
        return { onDeleteComment(c) }
    }

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
                onDeleteComment: deleteHandler(for: comment),
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
                        onDeleteComment: deleteHandler(for: reply),
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
                        onDeleteComment: deleteHandler(for: reply),
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
    /// Comment targeted by a notification — the sheet scrolls to and highlights it
    /// once loaded (for a reply, expands the parent thread first).
    var targetCommentId: String? = nil
    /// Parent comment when `targetCommentId` is a reply.
    var targetParentCommentId: String? = nil
    var onSendComment: ((String, String, String?) -> Void)? = nil
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
    /// @mention auto-injectée par `beginReply` lors d'une réponse à une réponse —
    /// suivie pour pouvoir la retirer proprement si on change de cible.
    @State private var prefilledMention: String? = nil
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var liveComments: [FeedComment]?
    @State private var liveCommentCount: Int?
    /// Section de commentaire surlignée (cible d'une notification).
    @State private var highlightedCommentId: String? = nil
    /// Garde-fou : ne défile vers la cible qu'une seule fois.
    @State private var didScrollToTargetComment: Bool = false
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

    // MARK: Comment attachments (UI composer parity with messages)
    /// Media the user staged from the composer carousel (photo / video / file /
    /// location / voice). Surfaced to `UniversalComposerBar` as
    /// `externalAttachments` and previewed via `commentAttachmentsPreview`.
    @State private var commentAttachments: [ComposerAttachment] = []
    @State private var showCommentPhotoPicker: Bool = false
    @State private var commentPhotoItems: [PhotosPickerItem] = []
    /// True while `commentPhotoItems` is being primed with the recent-media
    /// strip's multi-selection before presenting the PhotosPicker — swallows
    /// the priming onChange echo so only a user confirmation ingests items.
    @State private var commentPhotoPickerPriming: Bool = false
    @State private var showCommentFilePicker: Bool = false
    @State private var showCommentLocationPicker: Bool = false
    /// "Éditer" from the recent-media strip — the editor opens before staging;
    /// the edited output is ingested, never the original.
    @State private var commentRecentImageToEdit: UIImage? = nil
    @State private var commentRecentVideoToEdit: URL? = nil

    /// Enregistreur vocal parent-managed — MÊME composant que les conversations
    /// (`ConversationView`). Produit un vrai fichier audio (pas un timer) déposé
    /// dans `commentAttachments` comme pièce jointe voix, puis uploadé comme média.
    @StateObject private var audioRecorder = AudioRecorderManager()

    @StateObject private var mentionController: MentionComposerController

    init(
        post: FeedPost,
        accentColor: String,
        targetCommentId: String? = nil,
        targetParentCommentId: String? = nil,
        onSendComment: ((String, String, String?) -> Void)? = nil,
        onCommentSent: ((_ postId: String) -> Void)? = nil
    ) {
        self.post = post
        self.accentColor = accentColor
        self.targetCommentId = targetCommentId
        self.targetParentCommentId = targetParentCommentId
        self.onSendComment = onSendComment
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
                    ScrollViewReader { commentsProxy in
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
                                        beginReply(to: target)
                                    },
                                    onToggleThread: {
                                        Task { await toggleThread(comment.id) }
                                    },
                                    onLikeComment: { commentId in
                                        Task { await toggleCommentLike(commentId: commentId) }
                                    },
                                    onDeleteComment: { target in
                                        Task { await deleteComment(target) }
                                    },
                                    moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                                    storyState: storyViewModel.storyRingState(forUserId: comment.authorId),
                                    presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline,
                                    replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                                    replyStoryResolver: { storyViewModel.storyRingState(forUserId: $0) },
                                    replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state ?? .offline }
                                )
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(Color(hex: accentColor).opacity(highlightedCommentId == comment.id ? 0.12 : 0))
                                )
                                .animation(.easeInOut(duration: 0.4), value: highlightedCommentId)
                                .id("comment-\(comment.id)")
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 100)
                    }
                    .onAppear {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            attemptScrollToTargetComment(using: commentsProxy)
                        }
                    }
                    .adaptiveOnChange(of: topLevelComments.count) { _, _ in
                        attemptScrollToTargetComment(using: commentsProxy)
                    }
                    } // ScrollViewReader

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
                        .font(MeeshyFont.relative(16, weight: .semibold))
                        .foregroundColor(theme.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                }

                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        dismiss()
                    } label: {
                        // Figé : chrome xmark dans un cadre tap fixe 32×32 (doctrine 82i).
                        Image(systemName: "xmark")
                            .font(MeeshyFont.relative(14, weight: .semibold))
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
        .adaptiveWideSheet()
        .modifier(TranslucentSheetBackground())
        .onAppear {
            SocialSocketManager.shared.joinPostRoom(postId: post.id)
            // Sème l'état "liké par moi" des commentaires top-level déjà chargés
            // (`post.comments` porte `currentUserReactions` depuis `toFeedPost`).
            seedLikedIds(from: comments)
            // Reprend le brouillon de commentaire laissé sur ce post (cache-first).
            if composerText.isEmpty, let draft = CommentDraftStore.shared.load(postId: post.id) {
                composerText = draft
            }
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
                authorUsername: data.comment.author.username,
                authorAvatarURL: data.comment.author.avatar,
                content: data.comment.content, timestamp: data.comment.createdAt,
                likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                parentId: parentId,
                currentUserReactions: data.comment.currentUserReactions,
                media: (data.comment.media ?? []).map { $0.toFeedMedia() }
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
        // Pipeline audio d'un média de commentaire terminé (transcription / variantes
        // TTS prêtes) → on remplace le média du commentaire en cache par la version
        // enrichie. Le drapeau de langue + le player audio Prisme se mettent à jour.
        .onReceive(
            SocialSocketManager.shared.commentMediaUpdated
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let media = (data.comment.media ?? []).map { $0.toFeedMedia() }
            guard !media.isEmpty else { return }
            applyCommentMediaUpdate(commentId: data.commentId, parentId: data.comment.parentId, media: media)
        }
        // Suppression en temps réel : retire le commentaire et resynchronise le
        // compteur sur la valeur autoritative serveur (heale la dérive optimiste).
        // Idempotent avec le retrait optimiste du client qui supprime.
        .onReceive(
            SocialSocketManager.shared.commentDeleted
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            applyCommentDeletion(commentId: data.commentId, commentCount: data.commentCount)
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: statusViewModel.statusForUser(userId: user.userId ?? "")?.moodEmoji,
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
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
    }

    // MARK: - Notification → comment scroll

    /// Scrolls to (and briefly highlights) the comment targeted by a notification
    /// once it's loaded. For a reply, scrolls to the parent section and expands its
    /// thread so the reply is revealed. Runs once; re-invoked as comments load in.
    private func attemptScrollToTargetComment(using proxy: ScrollViewProxy) {
        guard let target = targetCommentId, !target.isEmpty, !didScrollToTargetComment else { return }

        // Only top-level sections carry a scroll anchor. For a reply, that's the
        // parent comment; otherwise the comment itself.
        let sectionId = targetParentCommentId.flatMap { $0.isEmpty ? nil : $0 } ?? target
        guard topLevelComments.contains(where: { $0.id == sectionId }) else { return }
        didScrollToTargetComment = true

        if let parentId = targetParentCommentId, !parentId.isEmpty, !expandedThreads.contains(parentId) {
            Task { await toggleThread(parentId) }
        }

        withAnimation { proxy.scrollTo("comment-\(sectionId)", anchor: .top) }
        highlightedCommentId = sectionId
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
            if highlightedCommentId == sectionId { highlightedCommentId = nil }
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
                    authorUsername: c.author.username,
                    authorAvatarURL: c.author.avatar,
                    content: c.content, timestamp: c.createdAt,
                    likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                    parentId: commentId,
                    originalLanguage: c.originalLanguage, translatedContent: translated,
                    currentUserReactions: c.currentUserReactions,
                    media: (c.media ?? []).map { $0.toFeedMedia() }
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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                        .foregroundColor(theme.textPrimary)

                    Text(RelativeTimeFormatter.shortString(for: post.timestamp))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)
                }
            }

            Text(post.displayContent)
                .font(MeeshyFont.relative(15))
                .foregroundColor(theme.textSecondary)
                .lineLimit(3)

            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    Image(systemName: "heart.fill")
                        .font(MeeshyFont.relative(12))
                    Text("\(post.likes)")
                        .font(MeeshyFont.relative(12, weight: .medium))
                }
                .foregroundColor(MeeshyColors.error)

                HStack(spacing: 4) {
                    Image(systemName: "bubble.right.fill")
                        .font(MeeshyFont.relative(12))
                    Text("\(commentCount)")
                        .font(MeeshyFont.relative(12, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
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
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.authorColor))

                Text(reply.displayContent)
                    .font(MeeshyFont.relative(12))
                    .foregroundColor(theme.textSecondary)
                    .lineLimit(1)
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                    replyingTo = nil
                }
            } label: {
                // Figé : chrome xmark dans un cadre tap fixe 24×24 (doctrine 82i).
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(10, weight: .bold))
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
            // Opt comments into the attachment carousel + voice (parity with
            // message-with-attachments). Pickers are wired below.
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSendMessage: { text, attachments, _ in
                submitComment(text: text, attachments: attachments)
            },
            onLocationRequest: { showCommentLocationPicker = true },
            textBinding: $composerText,
            replyBanner: replyingTo.map { AnyView(commentReplyBanner($0)) },
            customAttachmentsPreview: commentAttachments.isEmpty
                ? nil
                : AnyView(commentAttachmentsPreview),
            onTextChange: { text in
                mentionController.handleQuery(in: text)
                // Persiste le brouillon par post (un envoi vide le texte → efface).
                CommentDraftStore.shared.save(postId: post.id, text: text)
            },
            // Capture voix réelle — mêmes composants que les conversations.
            onStartRecording: { startCommentRecording() },
            onStopRecordingToAttachment: { stopCommentRecordingToAttachment() },
            onSendRecording: { stopAndSendCommentRecording() },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            onRecentMediaSelected: { pick in ingestCommentRecentMedia(pick) },
            onRecentMediaEdit: { pick in editCommentRecentMedia(pick) },
            onPhotoLibraryPreselecting: { ids in openCommentLibraryPreselecting(ids) },
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            externalAttachments: commentAttachments,
            focusTrigger: $composerFocusTrigger
        )
        // `photoLibrary: .shared()` est requis pour la présélection : les
        // PhotosPickerItem(itemIdentifier:) injectés depuis le strip ne
        // matchent les assets du picker que sur la photothèque partagée.
        .photosPicker(
            isPresented: $showCommentPhotoPicker,
            selection: $commentPhotoItems,
            maxSelectionCount: 10,
            matching: .any(of: [.images, .videos]),
            photoLibrary: .shared()
        )
        .fileImporter(
            isPresented: $showCommentFilePicker,
            allowedContentTypes: [.item],
            allowsMultipleSelection: true
        ) { result in
            handleCommentFileImport(result)
        }
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { coordinate, _ in
                commentAttachments.append(
                    ComposerAttachment.location(lat: coordinate.latitude, lng: coordinate.longitude)
                )
                showCommentLocationPicker = false
            }
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            handleCommentPhotoSelection(items)
        }
        // "Éditer" from the recent-media strip → edit BEFORE staging: only the
        // edited output lands in the comment attachments.
        .fullScreenCover(isPresented: Binding(
            get: { commentRecentImageToEdit != nil },
            set: { if !$0 { commentRecentImageToEdit = nil } }
        )) {
            if let image = commentRecentImageToEdit {
                MeeshyImageEditorView(image: image, context: .post, accentColor: accentColor, onAccept: { edited in
                    commentRecentImageToEdit = nil
                    ingestCommentRecentMedia(.image(edited))
                }, onCancel: {
                    commentRecentImageToEdit = nil
                })
            }
        }
        .fullScreenCover(isPresented: Binding(
            get: { commentRecentVideoToEdit != nil },
            set: { if !$0 { commentRecentVideoToEdit = nil } }
        )) {
            if let url = commentRecentVideoToEdit {
                MeeshyVideoEditorView(
                    url: url,
                    context: .post,
                    accentColor: accentColor,
                    onComplete: { result in
                        commentRecentVideoToEdit = nil
                        ingestCommentRecentMedia(.video(result.url))
                    },
                    onCancel: { commentRecentVideoToEdit = nil }
                )
            }
        }
    }

    // MARK: - Comment Attachments Preview (custom chips with remove)

    private var commentAttachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(commentAttachments) { attachment in
                    HStack(spacing: 6) {
                        Image(systemName: commentAttachmentIcon(attachment.type))
                            .font(.caption)
                            .foregroundColor(Color(hex: attachment.thumbnailColor))
                        Text(attachment.name)
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                            .frame(maxWidth: 120)
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                commentAttachments.removeAll { $0.id == attachment.id }
                            }
                            if let url = attachment.url { try? FileManager.default.removeItem(at: url) }
                        } label: {
                            Image(systemName: "xmark")
                                .font(.caption2.weight(.bold))
                                .foregroundColor(theme.textMuted)
                                .frame(width: 18, height: 18)
                                .background(Circle().fill(theme.textMuted.opacity(0.15)))
                        }
                        .accessibilityLabel(String(localized: "composer.a11y.removeAttachment", defaultValue: "Retirer la pi\u{00E8}ce jointe", bundle: .main))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(theme.inputBackground)
                            .overlay(Capsule().stroke(theme.textMuted.opacity(0.2), lineWidth: 0.5))
                    )
                    .foregroundColor(theme.textPrimary)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    private func commentAttachmentIcon(_ type: ComposerAttachmentType) -> String {
        switch type {
        case .voice: return "mic.fill"
        case .location: return "location.fill"
        case .image: return "photo.fill"
        case .file: return "doc.fill"
        case .video: return "video.fill"
        }
    }

    // MARK: - Comment Attachment Pickers

    /// Opens the full photo library with the strip's multi-selection already
    /// checked (identifier-based priming — see `commentPhotoPickerPriming`).
    /// Capped at the picker's `maxSelectionCount` (10); with no strip
    /// selection, stale primed items from a cancelled run are dropped.
    private func openCommentLibraryPreselecting(_ assetIds: [String]) {
        if !assetIds.isEmpty {
            let primed = assetIds.prefix(10).map { PhotosPickerItem(itemIdentifier: $0) }
            // Arm the echo-swallow ONLY when priming actually mutates the
            // binding — an unchanged binding fires no onChange, and a stale
            // armed flag would swallow the user's real confirmation instead.
            commentPhotoPickerPriming = primed != commentPhotoItems
            commentPhotoItems = primed
        } else {
            commentPhotoItems = []
        }
        showCommentPhotoPicker = true
    }

    private func handleCommentPhotoSelection(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        // Priming echo (strip multi-selection injected before presenting the
        // picker) — not a user confirmation, nothing to ingest yet.
        if commentPhotoPickerPriming {
            commentPhotoPickerPriming = false
            return
        }
        Task {
            for item in items {
                let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
                guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
                let ext = isVideo ? "mov" : "jpg"
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("comment_\(UUID().uuidString).\(ext)")
                guard (try? data.write(to: url)) != nil else { continue }
                let attachment: ComposerAttachment = isVideo
                    ? ComposerAttachment(
                        id: "video-\(UUID().uuidString)", type: .video,
                        name: String(localized: "attachment.label.video", defaultValue: "Video", bundle: .main),
                        url: url, size: data.count, thumbnailColor: "FF6B6B")
                    : ComposerAttachment.image(url: url)
                await MainActor.run { commentAttachments.append(attachment) }
            }
            await MainActor.run { commentPhotoItems = [] }
        }
    }

    /// "Éditer" from the strip's long-press menu: opens the media editor on the
    /// resolved pick; the edited result is ingested like a strip tap.
    private func editCommentRecentMedia(_ pick: RecentMediaPick) {
        switch pick {
        case .image(let image): commentRecentImageToEdit = image
        case .video(let url): commentRecentVideoToEdit = url
        }
    }

    /// Ingests a photo/video tapped in the inline recent-media strip into the
    /// staged comment attachments.
    private func ingestCommentRecentMedia(_ pick: RecentMediaPick) {
        switch pick {
        case .image(let image):
            guard let data = image.jpegData(compressionQuality: 0.9) else { return }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("comment_\(UUID().uuidString).jpg")
            guard (try? data.write(to: url)) != nil else { return }
            commentAttachments.append(ComposerAttachment.image(url: url))
        case .video(let url):
            commentAttachments.append(
                ComposerAttachment(
                    id: "video-\(UUID().uuidString)", type: .video,
                    name: String(localized: "attachment.label.video", defaultValue: "Video", bundle: .main),
                    url: url, thumbnailColor: "FF6B6B"
                )
            )
        }
    }

    private func handleCommentFileImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        for url in urls {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent("comment_\(UUID().uuidString)_\(url.lastPathComponent)")
            try? FileManager.default.copyItem(at: url, to: dest)
            let size = (try? FileManager.default.attributesOfItem(atPath: dest.path))?[.size] as? Int
            commentAttachments.append(
                ComposerAttachment.file(url: dest, name: url.lastPathComponent, size: size)
            )
        }
    }

    // MARK: - Comment Voice Recording (real capture — parity with conversations)

    private func startCommentRecording() {
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

    /// Stoppe l'enregistrement et dépose l'audio (vrai fichier `.m4a`) dans la tray
    /// des attachements du commentaire — éditable avant envoi. < 0,5 s = ignoré.
    /// Renvoie `true` si un attachement a été déposé.
    @discardableResult
    private func stopCommentRecordingToAttachment() -> Bool {
        guard audioRecorder.duration > 0.5 else {
            audioRecorder.cancelRecording()
            return false
        }
        let duration = audioRecorder.duration
        guard let url = audioRecorder.stopRecording() else { return false }
        commentAttachments.append(CommentComposerStaging.voiceAttachment(duration: duration, url: url))
        return true
    }

    /// Stoppe et envoie le commentaire vocal immédiatement (raw).
    private func stopAndSendCommentRecording() {
        guard stopCommentRecordingToAttachment() else { return }
        submitComment(text: composerText, attachments: commentAttachments)
        composerText = ""
    }

    // MARK: - Reply targeting

    /// Amorce une réponse vers `target`. Une réponse à un commentaire RACINE se
    /// rattache à lui. Une réponse à une RÉPONSE (niveau 2) reste plate au niveau
    /// 2 (cf. `submitComment` : parentId = racine) ; pour que l'auteur ciblé soit
    /// notifié malgré ce reparentage, on préremplit une @mention — le backend
    /// déclenche `user_mentioned` sur le contenu du commentaire.
    private func beginReply(to target: FeedComment) {
        replyingTo = target
        composerFocusTrigger = true
        // Retire d'abord la @mention auto-injectée pour une cible précédente (si on
        // change de cible sans envoyer) — sinon les mentions s'accumulent ou un
        // mauvais auteur est notifié. La mention auto est toujours préfixée.
        if let old = prefilledMention, composerText.hasPrefix(old) {
            composerText = String(composerText.dropFirst(old.count))
        }
        prefilledMention = nil
        guard target.parentId != nil,
              let username = target.authorUsername, !username.isEmpty else { return }
        let mention = "@\(username) "
        // Match exact en préfixe (pas un `contains` qui confondrait @bob et @bobby).
        if !composerText.hasPrefix(mention) {
            composerText = mention + composerText
        }
        prefilledMention = mention
    }

    // MARK: - Comment Send (optimistic, with single media)

    /// Poste un commentaire de façon optimiste, avec optionnellement UN média
    /// (image/vidéo/audio — un commentaire ne porte qu'un seul média). Le texte
    /// suit le flux reconcile/rollback existant ; le média est uploadé via TUS
    /// (`uploadContext: "comment"` → PostMedia) puis lié via `addComment(attachmentIds:)`.
    /// Les attachements file/location et la voix sans fichier sont ignorés (hors périmètre).
    /// Un commentaire média-seul (sans texte) est autorisé.
    private func submitComment(text: String, attachments: [ComposerAttachment]) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Un seul média par commentaire : on prend le premier image/vidéo/audio valide.
        let media: PendingCommentMedia? = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()

        // Rien à envoyer (ni texte ni média exploitable).
        guard !trimmed.isEmpty || media != nil else { return }

        // Réponse plate à 2 niveaux : répondre à une réponse rattache la nouvelle
        // réponse au MÊME parent racine (`replyingTo.parentId`) pour qu'elle reste
        // au niveau 2 ; répondre à une racine utilise son id. L'auteur ciblé est
        // notifié via la @mention préremplie par `beginReply`.
        let parentId = replyingTo?.parentId ?? replyingTo?.id
        let effects = commentEffects
        let blur = commentBlurEnabled
        replyingTo = nil
        commentEffects = .none
        commentBlurEnabled = false
        mentionController.clearDraft()

        let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
        let effectFlags = flags > 0 ? Int(flags) : nil

        // Optimistic: insert the comment (with its local media for instant inline
        // display) IMMEDIATELY — reply under its parent, else top-level — without
        // waiting for the network. The confirmed server row reconciles it (REST
        // response OR the `comment:added` socket event); a failure rolls it back.
        let tempId = "tmp_\(UUID().uuidString)"
        let me = AuthManager.shared.currentUser
        let optimistic = FeedComment(
            id: tempId,
            author: me?.displayName ?? me?.username ?? "",
            authorId: me?.id ?? "",
            authorUsername: me?.username,
            authorAvatarURL: me?.avatar,
            content: trimmed, timestamp: Date(),
            likes: 0, replies: 0, parentId: parentId,
            effectFlags: effectFlags ?? 0,
            media: media.map { [$0.optimistic] } ?? []
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
        liveCommentCount = (liveCommentCount ?? post.commentCount) + 1

        let lang = composerLanguage

        Task {
            do {
                let attachmentIds: [String]?
                if let media {
                    attachmentIds = [try await CommentMediaUploader.upload(media)]
                } else {
                    attachmentIds = nil
                }
                let apiComment = try await PostService.shared.addComment(
                    postId: post.id, content: trimmed, parentId: parentId, effectFlags: effectFlags,
                    attachmentIds: attachmentIds, mobileTranscription: media?.mobileTranscription,
                    originalLanguage: lang
                )
                let feedComment = FeedComment(
                    id: apiComment.id, author: apiComment.author.name, authorId: apiComment.author.id,
                    authorAvatarURL: apiComment.author.avatar,
                    content: apiComment.content, timestamp: apiComment.createdAt,
                    likes: 0, replies: 0,
                    parentId: parentId,
                    effectFlags: apiComment.effectFlags ?? effectFlags ?? 0,
                    media: (apiComment.media ?? []).map { $0.toFeedMedia() }
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
                // Roll back the optimistic row + counts.
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
                liveCommentCount = max((liveCommentCount ?? post.commentCount) - 1, 0)
                FeedbackToastManager.shared.showError(String(localized: "feed.comments.send_error", defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main))
            }
        }
    }

    /// Remplace le média (enrichi) d'un commentaire en cache, qu'il soit top-level
    /// (`liveComments`) ou une réponse (`repliesMap`). Déclenché par
    /// `comment:media-updated` quand la transcription / les variantes TTS arrivent.
    private func applyCommentMediaUpdate(commentId: String, parentId: String?, media: [FeedMedia]) {
        if let parentId, var existing = repliesMap[parentId] {
            if let idx = existing.firstIndex(where: { $0.id == commentId }) {
                existing[idx].media = media
                repliesMap[parentId] = existing
                return
            }
        }
        var current = liveComments ?? post.comments
        if let idx = current.firstIndex(where: { $0.id == commentId }) {
            current[idx].media = media
            liveComments = current
            return
        }
        // Réponse non encore montée dans repliesMap : tente tous les threads chargés.
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies[idx].media = media
                repliesMap[key] = replies
                return
            }
        }
    }

    /// Retire un commentaire (racine + ses réponses chargées, ou réponse avec
    /// décrément du compteur de son parent) et resynchronise le total sur la valeur
    /// autoritative serveur. Déclenché par le socket `comment:deleted` — idempotent
    /// avec le retrait optimiste local.
    private func applyCommentDeletion(commentId: String, commentCount: Int) {
        var current = liveComments ?? post.comments
        current.removeAll { $0.id == commentId }
        repliesMap[commentId] = nil
        expandedThreads.remove(commentId)
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies.remove(at: idx)
                repliesMap[key] = replies
                if let pIdx = current.firstIndex(where: { $0.id == key }), current[pIdx].replies > 0 {
                    current[pIdx].replies -= 1
                }
            }
        }
        liveComments = current
        liveCommentCount = commentCount
    }

    // MARK: - Comment Deletion

    /// Supprime un commentaire (auteur uniquement, gated par `CommentRowView`).
    /// Retrait optimiste immédiat (racine + ses réponses chargées, ou réponse
    /// avec décrément du compteur du parent) puis appel API. Rollback complet
    /// du snapshot si l'API échoue. Miroir du flux optimiste d'envoi.
    private func deleteComment(_ comment: FeedComment) async {
        let previousComments = liveComments
        let previousReplies = repliesMap
        let previousExpanded = expandedThreads
        let previousCount = liveCommentCount

        if let parentId = comment.parentId {
            if var existing = repliesMap[parentId] {
                existing.removeAll { $0.id == comment.id }
                repliesMap[parentId] = existing
                // Met à jour le cache d'aperçu pour ne pas réafficher la réponse
                // supprimée à la ré-ouverture du post.
                try? await CacheCoordinator.shared.comments.save(existing, for: "replies-\(parentId)")
            }
            var current = liveComments ?? post.comments
            if let idx = current.firstIndex(where: { $0.id == parentId }), current[idx].replies > 0 {
                current[idx].replies -= 1
                liveComments = current
            }
            liveCommentCount = max(0, (liveCommentCount ?? post.commentCount) - 1)
        } else {
            var current = liveComments ?? post.comments
            current.removeAll { $0.id == comment.id }
            liveComments = current
            repliesMap[comment.id] = nil
            expandedThreads.remove(comment.id)
            // La suppression d'un commentaire racine cascade ses réponses côté
            // serveur → on retire 1 + le nombre de réponses (compteur serveur).
            liveCommentCount = max(0, (liveCommentCount ?? post.commentCount) - 1 - comment.replies)
        }

        do {
            try await PostService.shared.deleteComment(postId: post.id, commentId: comment.id)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.comments.deleted", defaultValue: "Commentaire supprimé", bundle: .main))
        } catch {
            liveComments = previousComments
            repliesMap = previousReplies
            expandedThreads = previousExpanded
            liveCommentCount = previousCount
            FeedbackToastManager.shared.showError(String(localized: "feed.comments.delete_error", defaultValue: "Impossible de supprimer le commentaire", bundle: .main))
        }
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
    /// Supprime ce commentaire. Fourni (non-nil) UNIQUEMENT quand l'utilisateur
    /// courant est l'auteur — le parent décide de l'éligibilité. `nil` ⇒ l'item
    /// « Supprimer » n'apparaît pas dans le menu « … ».
    var onDeleteComment: (() -> Void)? = nil
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
        // Re-render si l'éligibilité à la suppression change (ex: changement de
        // compte avec la feuille ouverte) — sinon l'item « Supprimer » reste figé.
        (lhs.onDeleteComment == nil) == (rhs.onDeleteComment == nil) &&
        lhs.comment.replies == rhs.comment.replies &&
        lhs.comment.content == rhs.comment.content &&
        lhs.comment.translatedContent == rhs.comment.translatedContent &&
        // Re-render quand le média (ou son enrichissement audio : transcription /
        // variantes TTS via comment:media-updated) change.
        lhs.comment.media.first?.id == rhs.comment.media.first?.id &&
        lhs.comment.media.first?.transcription?.text == rhs.comment.media.first?.transcription?.text &&
        lhs.comment.media.first?.translatedAudios.count == rhs.comment.media.first?.translatedAudios.count
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

    /// « Copier » n'a de sens que pour un commentaire qui porte du texte
    /// (un commentaire média-seul n'a rien à copier).
    private var canCopyContent: Bool {
        !effectiveCommentContent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Le menu « … » n'est affiché que s'il contient au moins une action —
    /// évite un bouton mort (le bug d'origine) sur un commentaire média-seul
    /// dont l'utilisateur n'est pas l'auteur.
    private var hasMoreOptions: Bool {
        canCopyContent || onDeleteComment != nil
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
                        .font(MeeshyFont.relative(authorFont, weight: .semibold))
                        .foregroundColor(Color(hex: comment.authorColor))
                        .onTapGesture {
                            HapticFeedback.light()
                            selectedProfileUser = .from(feedComment: comment)
                        }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(String(format: String(localized: "a11y.comment.author_profile", defaultValue: "Profil de %@", bundle: .main), comment.author))
                        .accessibilityHint(String(localized: "a11y.comment.author_profile.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))

                    if hasTranslation {
                        Text("\u{00B7}").font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted)

                        let origDisplay = LanguageDisplay.from(code: comment.originalLanguage)
                        let isOrigActive = showOriginal
                        VStack(spacing: 1) {
                            // Figé : taille 12/10 = indicateur d'état actif/inactif du
                            // drapeau (emoji), apparié au soulignement fixe 10×1.5 dessous.
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
                            // Figé : taille 12/10 = indicateur d'état actif/inactif du
                            // drapeau (emoji), apparié au soulignement fixe 10×1.5 dessous.
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

                        // Figé : indicateur décoratif (accessibilityHidden), géométrie
                        // fixe alignée sur la rangée de drapeaux d'état ci-dessus.
                        Image(systemName: "translate")
                            .font(MeeshyFont.relative(10, weight: .medium))
                            .foregroundColor(MeeshyColors.indigo400)
                            .accessibilityHidden(true)
                    }

                    Text("\u{00B7}").font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)

                    Text(RelativeTimeFormatter.shortString(for: comment.timestamp))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }

                Text(effectiveCommentContent)
                    .font(MeeshyFont.relative(contentFont))
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

                // Média unique du commentaire (image/vidéo/audio) — inline + plein
                // écran « comme dans une conversation ». Le commentaire ne porte
                // qu'un seul média (cf. backend commentId FK sur PostMedia).
                if let media = comment.media.first {
                    CommentMediaView(
                        media: media,
                        accentColor: accentColor,
                        authorName: comment.author,
                        authorAvatarURL: comment.authorAvatarURL,
                        authorColor: comment.authorColor,
                        sentAt: comment.timestamp
                    )
                    .padding(.top, 2)
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
                                .font(MeeshyFont.relative(isReply ? 12 : 14))
                                .foregroundColor(heartColor)
                                .scaleEffect(isLiked ? 1.1 : 1.0)

                            Text("\(likeCount)")
                                .font(MeeshyFont.relative(12, weight: .medium))
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

                    // Réponses plates à 2 niveaux : on peut répondre à un commentaire
                    // racine OU à une réponse, mais une réponse-de-réponse reste affichée
                    // au niveau 2 (rattachée au même parent racine, cf. submitComment).
                    // Répondre à une réponse @mentionne son auteur → il est notifié.
                    // Le compteur `↰ N` et « Voir » ne concernent que la racine.
                    HStack(spacing: 8) {
                            Button {
                                onReply()
                                HapticFeedback.light()
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "arrowshape.turn.up.left")
                                        .font(MeeshyFont.relative(13))
                                    if !isReply && comment.replies > 0 {
                                        Text("\(comment.replies)")
                                            .font(MeeshyFont.relative(12, weight: .semibold))
                                    }
                                    Text(String(localized: "feed.comments.reply", defaultValue: "Répondre", bundle: .main))
                                        .font(MeeshyFont.relative(12, weight: .medium))
                                }
                                .foregroundColor(theme.textMuted)
                            }
                            .frame(minHeight: 44)
                            .accessibilityLabel(String(localized: "a11y.comment.reply", defaultValue: "Répondre", bundle: .main))
                            .accessibilityValue(comment.replies > 0 ? String(format: String(localized: "a11y.comment.replies.count", defaultValue: "%d réponses", bundle: .main), comment.replies) : "")
                            .accessibilityHint(String(format: String(localized: "a11y.comment.reply.hint", defaultValue: "Répondre à %@", bundle: .main), comment.author))

                            if showSeeReplies {
                                Text("\u{00B7}")
                                    .font(MeeshyFont.relative(12))
                                    .foregroundColor(theme.textMuted)
                                    .accessibilityHidden(true)

                                Button {
                                    onSeeReplies?()
                                    HapticFeedback.light()
                                } label: {
                                    Text(String(localized: "feed.comments.see_replies", defaultValue: "Voir", bundle: .main))
                                        .font(MeeshyFont.relative(12, weight: .semibold))
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

                    Spacer()

                    if hasMoreOptions {
                        Menu {
                            if canCopyContent {
                                Button {
                                    UIPasteboard.general.string = effectiveCommentContent
                                    HapticFeedback.success()
                                } label: {
                                    Label(String(localized: "comment.action.copy", defaultValue: "Copier le texte", bundle: .main), systemImage: "doc.on.doc")
                                }
                            }
                            if let onDeleteComment {
                                Button(role: .destructive) {
                                    HapticFeedback.medium()
                                    onDeleteComment()
                                } label: {
                                    Label(String(localized: "comment.action.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                                }
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(MeeshyFont.relative(isReply ? 12 : 14))
                                .foregroundColor(theme.textMuted)
                        }
                        .accessibilityLabel(String(localized: "a11y.comment.more_options", defaultValue: "Plus d'options", bundle: .main))
                        .meeshyTapTarget(44)
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
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
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
