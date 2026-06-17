import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct PostDetailView: View {
    let postId: String
    var initialPost: FeedPost?
    var showComments: Bool = false

    @StateObject private var viewModel = PostDetailViewModel()
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var statusViewModel: StatusViewModel
    @EnvironmentObject private var storyViewModel: StoryViewModel
    @EnvironmentObject private var router: Router
    @State private var showTranslationSheet = false
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var likeScale: CGFloat = 1.0
    @State private var secondaryLangCode: String? = nil
    @State private var activeDisplayLangCode: String? = nil
    @State private var fullscreenMediaId: String? = nil
    @State private var showFullscreenGallery = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var commentBlurEnabled: Bool = false
    @State private var commentEffects: MessageEffects = .none
    @State private var composerFocusTrigger: Bool = false
    @State private var isTextExpanded = false
    @State private var headerScrollOffset: CGFloat = 0
    private static let scrollSpace = "postDetailScroll"
    /// Set once `PostService.share(... generateLink: true)` returns — the
    /// `.sheet(item:)` further down presents the system share UI as soon
    /// as this becomes non-nil and clears it on dismiss.
    @State private var shareableLink: ShareableLink?

    /// Which post action the user just triggered from the `…` menu. Both
    /// "Copier le lien" and "Partager" call the same gateway endpoint;
    /// only the post-success behaviour differs (pasteboard vs share sheet).
    private enum ShareLinkAction { case copyToPasteboard, presentShareSheet }

    /// Calls `POST /posts/:id/share?generateLink=true`, then dispatches the
    /// short URL to either the pasteboard or the system share sheet.
    /// `medium=share` UTM is attached by the gateway so analytics can split
    /// "share via copy-link" from "share via system sheet" later. If the
    /// mint fails (offline, rate-limit, gateway error) the call still
    /// surfaces the raw post URL so the user is never stuck with nothing to
    /// share — only the attribution analytics are skipped.
    private func mintShareLink(action: ShareLinkAction) async {
        guard let post = viewModel.post else { return }
        let trackingShortUrl: String? = await {
            do {
                let result = try await PostService.shared.share(
                    postId: post.id,
                    platform: action == .copyToPasteboard ? "copy" : "system",
                    generateLink: true
                )
                return result.shortUrl
            } catch {
                return nil
            }
        }()

        let fallbackUrlString = "\(ShareableLink.webBaseURL)/feeds/post/\(post.id)"
        let resolvedString = trackingShortUrl ?? fallbackUrlString
        guard let resolvedUrl = URL(string: resolvedString) else {
            FeedbackToastManager.shared.showError("Lien indisponible")
            return
        }

        await MainActor.run {
            switch action {
            case .copyToPasteboard:
                UIPasteboard.general.string = resolvedString
                HapticFeedback.success()
                FeedbackToastManager.shared.show(
                    String(localized: "feed.post.detail.copy_link.success", defaultValue: "Lien copié", bundle: .main)
                )
            case .presentShareSheet:
                shareableLink = ShareableLink(url: resolvedUrl)
                HapticFeedback.light()
            }
        }
    }

    // Post reaction state — socket-driven, hoisted to this view (single-post context).
    // PostDetailView joins the post:{postId} room on appear and leaves on disappear,
    // enabling real-time reaction updates from other users.
    @State private var postLikedIds: Set<String> = []
    @State private var postLikeDelta: [String: Int] = [:]
    @State private var postHeartInFlightIds: Set<String> = []

    // Bookmark / repost / share optimistic state — same pattern as FeedView.
    @State private var isPostBookmarked: Bool = false
    @State private var isBookmarkInFlight: Bool = false
    @State private var isPostReposted: Bool = false
    @State private var isRepostInFlight: Bool = false
    @State private var isShareInFlight: Bool = false
    @State private var showRepostOptions: Bool = false
    @State private var isEditing: Bool = false

    private var detailIsLiked: Bool { postLikedIds.contains(postId) }
    private var detailLikeCount: Int {
        guard let post = displayPost else { return 0 }
        return max(0, post.likes + (postLikeDelta[postId] ?? 0))
    }

    // MARK: - Post Heart Toggle (socket-driven, post detail)

    @MainActor
    private func toggleDetailPostHeart() {
        Task {
            guard !postHeartInFlightIds.contains(postId) else { return }
            postHeartInFlightIds.insert(postId)
            defer {
                Task { @MainActor in
                    postHeartInFlightIds.remove(postId)
                }
            }
            let wasLiked = postLikedIds.contains(postId)
            // Optimistic update
            if wasLiked {
                postLikedIds.remove(postId)
                postLikeDelta[postId, default: 0] -= 1
            } else {
                postLikedIds.insert(postId)
                postLikeDelta[postId, default: 0] += 1
            }
            do {
                if wasLiked {
                    _ = try await SocialSocketManager.shared.removePostReaction(
                        postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                } else {
                    _ = try await SocialSocketManager.shared.addPostReaction(
                        postId: postId, emoji: StoryViewerView.heartEmoji
                    )
                }
            } catch {
                // REST fallback when socket fails (noSocket / timeout). Only
                // rollback the optimistic flip when REST also fails — keeps
                // the heart visible whenever the server actually persisted.
                let restOK = await postLikeViaREST(like: !wasLiked)
                if !restOK {
                    if wasLiked {
                        postLikedIds.insert(postId)
                        postLikeDelta[postId, default: 0] += 1
                    } else {
                        postLikedIds.remove(postId)
                        postLikeDelta[postId, default: 0] -= 1
                    }
                }
            }
        }
    }

    private struct LikeRESTPayload: Decodable { let liked: Bool? }
    private struct BookmarkRESTPayload: Decodable { let bookmarked: Bool? }

    private func postLikeViaREST(like: Bool) async -> Bool {
        do {
            let _: APIResponse<LikeRESTPayload> = try await APIClient.shared.request(
                endpoint: "/posts/\(postId)/like",
                method: like ? "POST" : "DELETE"
            )
            return true
        } catch {
            return false
        }
    }

    // MARK: - Bookmark / Repost / Share (post detail)

    @MainActor
    private func toggleDetailBookmark() {
        guard !isBookmarkInFlight else { return }
        let wasBookmarked = isPostBookmarked
        isPostBookmarked.toggle()
        isBookmarkInFlight = true
        Task {
            defer { Task { @MainActor in isBookmarkInFlight = false } }
            let ok: Bool = await {
                do {
                    let _: APIResponse<BookmarkRESTPayload> = try await APIClient.shared.request(
                        endpoint: "/posts/\(postId)/bookmark",
                        method: wasBookmarked ? "DELETE" : "POST"
                    )
                    return true
                } catch { return false }
            }()
            if !ok {
                isPostBookmarked = wasBookmarked
                FeedbackToastManager.shared.showError("Erreur lors de l'enregistrement")
            } else {
                FeedbackToastManager.shared.showSuccess(wasBookmarked
                    ? String(localized: "Retire des favoris", defaultValue: "Retire des favoris")
                    : String(localized: "Ajoute aux favoris", defaultValue: "Ajoute aux favoris"))
            }
        }
    }

    @MainActor
    private func toggleDetailRepost(quote: Bool) {
        guard !isRepostInFlight else { return }
        isPostReposted = true
        isRepostInFlight = true
        Task {
            defer { Task { @MainActor in isRepostInFlight = false } }
            do {
                _ = try await PostService.shared.repost(
                    postId: postId,
                    targetType: nil,
                    content: nil,
                    isQuote: quote
                )
                FeedbackToastManager.shared.showSuccess(String(localized: "Repartage", defaultValue: "Repartage"))
            } catch {
                isPostReposted = false
                FeedbackToastManager.shared.showError("Erreur lors du repost")
            }
        }
    }

    @MainActor
    private func sharePostFromDetail() {
        guard !isShareInFlight else { return }
        isShareInFlight = true
        Task {
            defer { Task { @MainActor in isShareInFlight = false } }
            // Mint a tracking link; fall back to the raw post URL when the
            // gateway can't issue a TrackingLink (offline / 5xx).
            do {
                struct SharePayload: Decodable {
                    let shared: Bool?
                    let shareCount: Int?
                    let shortUrl: String?
                    let token: String?
                }
                let body = try JSONSerialization.data(withJSONObject: ["generateLink": true])
                let resp: APIResponse<SharePayload> = try await APIClient.shared.request(
                    endpoint: "/posts/\(postId)/share",
                    method: "POST",
                    body: body
                )
                if let s = resp.data.shortUrl, let url = URL(string: s) {
                    shareableLink = ShareableLink(url: url)
                    return
                }
            } catch {
                // fall through to raw fallback
            }
            if let raw = ShareableLink.fallback(forPostId: postId) {
                shareableLink = raw
            } else {
                FeedbackToastManager.shared.showError("Erreur lors du partage")
            }
        }
    }

    private var displayPost: FeedPost? { viewModel.post ?? initialPost }

    private var accentColor: String {
        displayPost?.authorColor ?? "6366F1"
    }

    // MARK: - Prisme Linguistique

    private var currentDisplayLangCode: String {
        guard let post = displayPost else { return "fr" }
        return activeDisplayLangCode ?? post.translations?.keys.first(where: { lang in
            AuthManager.shared.currentUser?.preferredContentLanguages.contains(where: { $0.caseInsensitiveCompare(lang) == .orderedSame }) ?? false
        })?.lowercased() ?? post.originalLanguage?.lowercased() ?? "fr"
    }

    private var effectiveContent: String {
        guard let post = displayPost else { return "" }
        let code = currentDisplayLangCode
        if code == post.originalLanguage?.lowercased() { return post.content }
        if let translation = post.translations?[code] ?? post.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return post.displayContent
    }

    private var textTruncation: (text: String, isTruncated: Bool) {
        let words = effectiveContent.split(separator: " ", omittingEmptySubsequences: true)
        if words.count <= 60 { return (effectiveContent, false) }
        let truncated = words.prefix(60).joined(separator: " ")
        return (truncated, true)
    }

    private var secondaryContent: String? {
        guard let post = displayPost, let code = secondaryLangCode else { return nil }
        if code == post.originalLanguage?.lowercased() { return post.content }
        return post.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    private func buildAvailableFlags() -> [String] {
        guard let post = displayPost, let origLang = post.originalLanguage?.lowercased() else { return [] }
        let activeLang = currentDisplayLangCode
        let user = AuthManager.shared.currentUser
        var all: [String] = [origLang]
        var seen: Set<String> = [origLang]
        for lang in user?.preferredContentLanguages ?? [] {
            let l = lang.lowercased()
            if !seen.contains(l), post.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                all.append(l); seen.insert(l)
            }
        }
        return all.filter { $0 != activeLang }
    }

    private func handleFlagTap(_ code: String) {
        guard let post = displayPost else { return }
        let isOriginal = code == post.originalLanguage?.lowercased()
        let hasContent = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == code }) == true
        if !hasContent { HapticFeedback.light(); return }
        if isOriginal {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                activeDisplayLangCode = code; secondaryLangCode = nil
            }
        } else {
            let isShowing = secondaryLangCode == code
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                secondaryLangCode = isShowing ? nil : code
            }
        }
        HapticFeedback.light()
    }

    // Scrollable post-detail content (text, media, repost, actions, comments).
    // Extracted from `body` into its own @ViewBuilder unit so the Swift
    // type-checker stays within budget — inlining the threaded-comment
    // ForEach made `body` exceed the reasonable type-check time.
    @ViewBuilder
    private func postDetailContent(_ post: FeedPost) -> some View {
        // ZONE 1: Text
        textZone(post)

        // ZONE 2: Media
        if post.hasMedia {
            detailMediaSection(post.media)
                .padding(.horizontal, 16)
                .padding(.top, 8)
        }

        // Repost embed
        if let repost = post.repost {
            repostEmbed(repost)
        }

        // Actions bar
        actionsBar(post)

        // Separator + Comments (ZONE 3)
        Rectangle()
            .fill(theme.inputBorder.opacity(0.5))
            .frame(height: 1)
            .padding(.horizontal, 16)

        commentsHeader
            .id("commentsSection")

        // Comments (threaded)
        ForEach(viewModel.topLevelComments) { comment in
            ThreadedCommentSection(
                comment: comment,
                replies: viewModel.repliesFor(comment.id),
                isExpanded: viewModel.expandedThreads.contains(comment.id),
                isLoadingReplies: viewModel.loadingReplies.contains(comment.id),
                accentColor: accentColor,
                // Like de commentaire optimiste + réaction socket cœur, porté par le
                // ViewModel (miroir de `CommentsSheetView`). L'état est semé depuis
                // `currentUserReactions` au chargement, donc les commentaires déjà
                // likés s'affichent cœur plein et le tap donne un retour instantané.
                likedIds: viewModel.commentLikedIds,
                likeDelta: viewModel.commentLikeDelta,
                heartInFlightIds: viewModel.commentHeartInFlightIds,
                onReply: { target in
                    viewModel.replyingTo = target
                },
                onToggleThread: {
                    Task { await viewModel.toggleThread(comment.id, postId: postId) }
                },
                onLikeComment: { commentId in
                    Task { await viewModel.toggleCommentLike(commentId, postId: postId) }
                },
                moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                storyState: storyViewModel.storyRingState(forUserId: comment.authorId),
                presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state ?? .offline,
                replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                replyStoryResolver: { storyViewModel.storyRingState(forUserId: $0) },
                replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state ?? .offline }
            )
            .padding(.horizontal, 16)
        }

        if viewModel.isLoadingComments {
            ProgressView()
                .padding()
        }

        if viewModel.hasMoreComments && !viewModel.isLoadingComments {
            Button {
                Task { await viewModel.loadMoreComments(postId) }
            } label: {
                Text(String(localized: "feed.post.detail.load_more", defaultValue: "Charger plus", bundle: .main))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo500)
            }
            .padding()
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Connection status banner (banner manages its own socket observation)
            ConnectionBanner()

            if let post = displayPost {
                ScrollViewReader { scrollProxy in
                    ScrollView(showsIndicators: false) {
                        // Sentinel: publishes the scroll offset so the floating
                        // header reveals the author at scroll. minY≈0 at rest
                        // (content origin sits just under the header inset),
                        // goes negative on scroll.
                        GeometryReader { geo in
                            Color.clear.preference(
                                key: ScrollOffsetPreferenceKey.self,
                                value: geo.frame(in: .named(Self.scrollSpace)).minY
                            )
                        }
                        .frame(height: 0)

                        LazyVStack(spacing: 0) {
                            postDetailContent(post)
                        }
                        .padding(.bottom, 80)
                    }
                    .coordinateSpace(name: Self.scrollSpace)
                    .onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in
                        headerScrollOffset = offset
                    }
                    // Floating translucent header pinned to the top. `safeAreaInset`
                    // reserves the header height for the content (author block stays
                    // visible right below it at rest) while letting the content scroll
                    // UNDER the translucent surface — the canonical SwiftUI pattern for
                    // a bar over a scroll view, and it handles the safe area itself.
                    // (A plain ZStack overlay let the header's `.ignoresSafeArea(.top)`
                    // pull the scroll content under the bar and hide the author.)
                    .safeAreaInset(edge: .top, spacing: 0) {
                        postDetailHeader(post)
                    }
                    .onAppear {
                        if showComments {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                withAnimation {
                                    scrollProxy.scrollTo("commentsSection", anchor: .top)
                                }
                                composerFocusTrigger.toggle()
                            }
                        }
                    }
                } // ScrollViewReader
            } else if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            }

            composer
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .navigationBarHidden(true)
        .task {
            // Wire persistence layer on first appearance
            if viewModel.commentStore == nil {
                let deps = DependencyContainer.shared
                let commentStore = CommentStore(postId: postId, persistence: deps.feedPersistence)
                viewModel.setupPersistence(commentStore: commentStore, persistence: deps.feedPersistence)
                await commentStore.loadInitial()
            }

            if viewModel.post == nil {
                await viewModel.loadPost(postId)
            }
            // Seed liked state from initial/cached post (post.isLiked is derived from
            // APIPost.currentUserReactions / isLikedByMe by the SDK).
            if let post = displayPost, post.isLiked {
                postLikedIds.insert(postId)
            }
            // Seed bookmark + repost state. Primary source: the server-
            // enriched fields on the loaded post (PostFeedService provides
            // isBookmarkedByMe + isRepostedByMe on the feed and detail
            // payloads). Defensive fallback: the local "bookmarks" cache.
            if !isBookmarkInFlight {
                if let p = displayPost, p.isBookmarkedByMe {
                    isPostBookmarked = true
                } else {
                    let cached = await CacheCoordinator.shared.feed.load(for: "bookmarks")
                    let bookmarks: [FeedPost]
                    switch cached {
                    case .fresh(let v, _), .stale(let v, _): bookmarks = v
                    case .expired, .empty: bookmarks = []
                    }
                    if bookmarks.contains(where: { $0.id == postId }) {
                        isPostBookmarked = true
                    }
                }
            }
            if !isRepostInFlight, let p = displayPost, p.isRepostedByMe {
                isPostReposted = true
            }
            await viewModel.loadComments(postId)
            viewModel.subscribeToSocket(postId)
            // Join the post room for real-time reaction events (single focused post).
            SocialSocketManager.shared.joinPostRoom(postId: postId)
            // Anti-spam banner: declare this post as "currently visible" so
            // NotificationToastManager can drop in-app banners about it (the user
            // already sees the content live).
            NotificationToastManager.shared.activePostId = postId
            // Record view when post detail is opened
            try? await PostService.shared.viewPost(postId: postId, duration: nil)
        }
        .onDisappear {
            SocialSocketManager.shared.leavePostRoom(postId: postId)
            if NotificationToastManager.shared.activePostId == postId {
                NotificationToastManager.shared.activePostId = nil
            }
        }
        .trackEngagement(postId: postId, contentType: .post, surface: .detail)
        .adaptiveOnChange(of: viewModel.post) { _, updatedPost in
            // Re-seed when post loads from network (stale → fresh). Preserve
            // optimistic state: only update if no in-flight toggle is active.
            guard let updatedPost, !postHeartInFlightIds.contains(postId) else { return }
            if updatedPost.isLiked {
                postLikedIds.insert(postId)
            } else {
                postLikedIds.remove(postId)
            }
        }
        .onReceive(SocialSocketManager.shared.postReactionAdded.receive(on: DispatchQueue.main)) { event in
            let heart = StoryViewerView.heartEmoji
            guard event.emoji == heart, event.postId == postId else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                postLikedIds.insert(postId)
            } else {
                postLikeDelta[postId, default: 0] += 1
            }
        }
        .onReceive(SocialSocketManager.shared.postReactionRemoved.receive(on: DispatchQueue.main)) { event in
            let heart = StoryViewerView.heartEmoji
            guard event.emoji == heart, event.postId == postId else { return }
            let currentUserId = AuthManager.shared.currentUser?.id
            if event.userId == currentUserId {
                postLikedIds.remove(postId)
            } else {
                postLikeDelta[postId, default: 0] -= 1
            }
        }
        // Unification du like : le ❤️ arrive désormais comme `post:liked`/`post:unliked`
        // (compteur ABSOLU). On pose la base autoritative sur le post chargé, on purge le
        // delta optimiste et on confirme `isLiked` pour l'acteur — aligné avec le feed et
        // le reel viewer. Le détail rejoint déjà `ROOMS.post`, donc reçoit l'événement.
        .onReceive(SocialSocketManager.shared.postLiked.receive(on: DispatchQueue.main)) { event in
            guard event.postId == postId else { return }
            viewModel.post?.likes = event.likeCount
            postLikeDelta[postId] = nil
            if event.userId == AuthManager.shared.currentUser?.id {
                postLikedIds.insert(postId)
            }
        }
        .onReceive(SocialSocketManager.shared.postUnliked.receive(on: DispatchQueue.main)) { event in
            guard event.postId == postId else { return }
            viewModel.post?.likes = event.likeCount
            postLikeDelta[postId] = nil
            if event.userId == AuthManager.shared.currentUser?.id {
                postLikedIds.remove(postId)
            }
        }
        .sheet(isPresented: $showTranslationSheet) {
            if let post = displayPost {
                PostTranslationSheet(
                    post: post,
                    onSelectLanguage: { language in
                        let langLower = language.lowercased()
                        let isOriginal = langLower == post.originalLanguage?.lowercased()
                        let hasTranslation = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == langLower }) == true
                        if hasTranslation {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                activeDisplayLangCode = langLower
                                secondaryLangCode = nil
                            }
                        }
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
        .sheet(item: $shareableLink) { link in
            // Same `meeshy.me/l/<token>` URL that "Copier le lien" copies —
            // the gateway already recorded the share + minted the
            // TrackingLink owned by the current user.
            ShareSheet(activityItems: [link.url])
        }
        .sheet(isPresented: $isEditing) {
            if let post = displayPost {
                EditPostSheet(
                    originalContent: post.content,
                    onSave: { newContent in
                        await viewModel.updatePost(content: newContent)
                    },
                    onDismiss: { isEditing = false }
                )
            }
        }
        .fullScreenCover(isPresented: $showFullscreenGallery) {
            if let post = displayPost {
                let attachments = post.media
                    .filter { $0.type == .image || $0.type == .video }
                    .map { $0.toMessageAttachment() }
                // Infos auteur en bas de la galerie (au-dessus des dimensions),
                // identique au chemin feed (`FeedPostCard`). Tous les médias d'un
                // poste partagent le même auteur.
                let senderInfo = ConversationViewModel.MediaSenderInfo(
                    senderName: post.author,
                    senderAvatarURL: post.authorAvatarURL,
                    senderColor: post.authorColor,
                    sentAt: post.timestamp
                )
                let senderMap = Dictionary(uniqueKeysWithValues: attachments.map { ($0.id, senderInfo) })
                ConversationMediaGalleryView(
                    allAttachments: attachments,
                    startAttachmentId: fullscreenMediaId ?? attachments.first?.id ?? "",
                    accentColor: accentColor,
                    senderInfoMap: senderMap
                )
            }
        }
    }

    // MARK: - Floating Header (CollapsibleHeader)

    /// Centered author chip revealed in the floating header as the inline
    /// author block scrolls away. Tapping opens the profile sheet (mirrors the
    /// inline name tap).
    @ViewBuilder
    private func authorRevealView(_ post: FeedPost) -> some View {
        HStack(spacing: 8) {
            Button {
                selectedProfileUser = .from(feedPost: post)
            } label: {
                HStack(spacing: 8) {
                    MeeshyAvatar(
                        name: post.author,
                        context: .custom(26),
                        accentColor: post.authorColor,
                        avatarURL: post.authorAvatarURL
                    )
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        Text(RelativeTimeFormatter.shortString(for: post.timestamp))
                            .font(.caption2)
                            .foregroundColor(theme.textMuted)
                    }
                }
            }
            .buttonStyle(.plain)

            // Détails de langue insérés dans le header (miroir du bloc auteur inline) :
            // drapeaux tappables + icône translate. Hors du Button profil pour que les
            // gestes de langue ne déclenchent pas l'ouverture du profil.
            let flags = buildAvailableFlags()
            if !flags.isEmpty || (post.translations != nil && !post.translations!.isEmpty) {
                HStack(spacing: 5) {
                    ForEach(flags, id: \.self) { code in
                        let display = LanguageDisplay.from(code: code)
                        let isActive = code == secondaryLangCode
                        VStack(spacing: 1) {
                            Text(display?.flag ?? "?")
                                .font(isActive ? .caption : .caption2)
                                .scaleEffect(isActive ? 1.05 : 1.0)
                            if isActive {
                                RoundedRectangle(cornerRadius: 1)
                                    .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                                    .frame(width: 10, height: 1.5)
                            }
                        }
                        .animation(.easeInOut(duration: 0.2), value: isActive)
                        .onTapGesture { handleFlagTap(code) }
                    }
                    if post.translations != nil, !post.translations!.isEmpty {
                        Image(systemName: "translate")
                            .font(.caption2.weight(.medium))
                            .foregroundColor(MeeshyColors.indigo400)
                            .onTapGesture {
                                HapticFeedback.light()
                                showTranslationSheet = true
                            }
                    }
                }
            }
        }
    }

    /// The `…` menu, lifted out of the old navBar into the header's trailing slot.
    private var postMenu: some View {
        Menu {
            Button {
                Task { await mintShareLink(action: .copyToPasteboard) }
            } label: {
                Label(String(localized: "feed.post.detail.copy_link", defaultValue: "Copier le lien", bundle: .main), systemImage: "link")
            }
            Button {
                Task { await mintShareLink(action: .presentShareSheet) }
            } label: {
                Label(String(localized: "feed.post.detail.share", defaultValue: "Partager", bundle: .main), systemImage: "square.and.arrow.up")
            }
            if displayPost?.authorId == AuthManager.shared.currentUser?.id {
                Button {
                    isEditing = true
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
                }
            }
            Button(role: .destructive) {
                HapticFeedback.light()
                Task { await viewModel.reportPost(postId) }
            } label: {
                Label(String(localized: "feed.post.detail.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)
                .frame(width: 36, height: 36)
                .background(Circle().fill(theme.inputBackground.opacity(0.6)))
        }
    }

    private func postDetailHeader(_ post: FeedPost) -> some View {
        CollapsibleHeader(
            title: "",
            scrollOffset: headerScrollOffset,
            showBackButton: true,
            onBack: { HapticFeedback.light(); router.pop() },
            titleColor: theme.textPrimary,
            backArrowColor: theme.textPrimary,
            backgroundColor: theme.backgroundPrimary,
            centerReveal: { authorRevealView(post) },
            trailing: { postMenu }
        )
    }

    // MARK: - Text Zone

    @ViewBuilder
    private func textZone(_ post: FeedPost) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Author header
            HStack(spacing: 12) {
                MeeshyAvatar(
                    name: post.author,
                    context: .postAuthor,
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL,
                    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                    onMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: String(localized: "feed.post.detail.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                            selectedProfileUser = .from(feedPost: post)
                        }
                    ]
                )

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(theme.textPrimary)
                        .onTapGesture {
                            selectedProfileUser = .from(feedPost: post)
                        }

                    HStack(spacing: 4) {
                        Text(post.timestamp, style: .relative)
                            .font(.caption)
                            .foregroundColor(theme.textMuted)

                        let flags = buildAvailableFlags()
                        if !flags.isEmpty || (post.translations != nil && !post.translations!.isEmpty) {
                            Text("·").font(.caption).foregroundColor(theme.textMuted)

                            ForEach(flags, id: \.self) { code in
                                let display = LanguageDisplay.from(code: code)
                                let isActive = code == secondaryLangCode
                                VStack(spacing: 1) {
                                    Text(display?.flag ?? "?")
                                        .font(isActive ? .caption : .caption2)
                                        .scaleEffect(isActive ? 1.05 : 1.0)
                                    if isActive {
                                        RoundedRectangle(cornerRadius: 1)
                                            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                                            .frame(width: 10, height: 1.5)
                                    }
                                }
                                .animation(.easeInOut(duration: 0.2), value: isActive)
                                .onTapGesture { handleFlagTap(code) }
                            }

                            if post.translations != nil, !post.translations!.isEmpty {
                                Image(systemName: "translate")
                                    .font(.caption2.weight(.medium))
                                    .foregroundColor(MeeshyColors.indigo400)
                                    .onTapGesture {
                                        HapticFeedback.light()
                                        showTranslationSheet = true
                                    }
                            }
                        }
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Content with truncation
            let truncation = textTruncation
            Group {
                if truncation.isTruncated && !isTextExpanded {
                    Text(truncation.text + "... ")
                        .font(.callout)
                        .foregroundColor(theme.textPrimary)
                    + Text(String(localized: "feed.post.detail.see_more", defaultValue: "voir plus", bundle: .main))
                        .font(.callout.weight(.semibold))
                        .foregroundColor(Color(hex: accentColor))
                } else if truncation.isTruncated && isTextExpanded {
                    Text(effectiveContent + " ")
                        .font(.callout)
                        .foregroundColor(theme.textPrimary)
                    + Text(String(localized: "feed.post.detail.see_less", defaultValue: "voir moins", bundle: .main))
                        .font(.callout.weight(.semibold))
                        .foregroundColor(Color(hex: accentColor))
                } else {
                    Text(effectiveContent)
                        .font(.callout)
                        .foregroundColor(theme.textPrimary)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .textSelection(.enabled)
            .padding(.horizontal, 16)
            .onTapGesture {
                if truncation.isTruncated {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isTextExpanded.toggle()
                    }
                    if isTextExpanded {
                        EngagementTracker.shared.recordAction(.expandedText, surface: .detail)
                        Task { try? await PostService.shared.viewPost(postId: postId, duration: nil) }  // viewPost stays duration-less
                    }
                }
            }

            // Inline secondary translation panel
            if let content = secondaryContent, let code = secondaryLangCode {
                let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
                let display = LanguageDisplay.from(code: code)
                VStack(spacing: 0) {
                    HStack(spacing: 6) {
                        Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                        Circle().fill(langColor).frame(width: 4, height: 4)
                        Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        if let display {
                            HStack(spacing: 4) {
                                Text(display.flag).font(.caption)
                                Text(display.name)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundColor(langColor)
                            }
                        }
                        Text(content)
                            .font(.subheadline)
                            .foregroundColor(theme.textPrimary.opacity(0.8))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(langColor.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .padding(.horizontal, 16)
                .padding(.top, 6)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: - Repost Embed

    @State private var repostSecondaryLangCode: String? = nil
    @State private var repostActiveDisplayLangCode: String? = nil

    @ViewBuilder
    private func repostEmbed(_ repost: RepostContent) -> some View {
        let isStoryRepost = (repost.type ?? "").uppercased() == "STORY"

        VStack(alignment: .leading, spacing: 0) {
            // Author header — always tappable to navigate
            Button {
                HapticFeedback.light()
                router.push(.postDetail(repost.id))
            } label: {
                HStack(spacing: 8) {
                    MeeshyAvatar(
                        name: repost.author,
                        context: .postComment,
                        accentColor: repost.authorColor,
                        avatarURL: repost.authorAvatarURL
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(repost.author)
                            .font(.footnote.weight(.semibold))
                            .foregroundColor(theme.accentText(repost.authorColor))
                        HStack(spacing: 4) {
                            Text(repost.timestamp, style: .relative)
                                .font(.caption2)
                                .foregroundColor(theme.textMuted)
                            // Language flags for repost translations
                            if let translations = repost.translations, !translations.isEmpty {
                                repostLanguageFlags(repost)
                            }
                        }
                    }
                    Spacer()
                }
            }
            .buttonStyle(PlainButtonStyle())
            .padding(.horizontal, 12)
            .padding(.top, 10)
            .padding(.bottom, 6)

            // Text content with translation support
            if !repost.content.isEmpty {
                let repostDisplayContent = repostEffectiveContent(repost)
                Text(repostDisplayContent)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)

                // Inline secondary translation for repost
                if let code = repostSecondaryLangCode,
                   let secondaryText = repostSecondaryContent(repost, code: code) {
                    let langColor = Color(hex: LanguageDisplay.colorHex(for: code))
                    let display = LanguageDisplay.from(code: code)
                    VStack(spacing: 0) {
                        HStack(spacing: 6) {
                            Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                            Circle().fill(langColor).frame(width: 3, height: 3)
                            Rectangle().fill(langColor.opacity(0.4)).frame(height: 1)
                        }
                        VStack(alignment: .leading, spacing: 3) {
                            if let display {
                                HStack(spacing: 3) {
                                    Text(display.flag).font(.caption2)
                                    Text(display.name)
                                        .font(.caption2.weight(.semibold))
                                        .foregroundColor(langColor)
                                }
                            }
                            Text(secondaryText)
                                .font(.footnote)
                                .foregroundColor(theme.textPrimary.opacity(0.8))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.vertical, 6)
                        .padding(.horizontal, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(langColor.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }

            // Story-type repost — render the canvas
            if isStoryRepost {
                StoryReaderRepresentable(
                    repost: repost,
                    preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
                    mute: true
                )
                .aspectRatio(9.0 / 16.0, contentMode: .fit)
                .frame(maxWidth: 460)
                .frame(maxWidth: .infinity, alignment: .center)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            } else if !repost.media.isEmpty {
                // Standard media attachments
                detailMediaSection(repost.media)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            // Audio URL (legacy story audio)
            if let audioUrl = repost.audioUrl, !audioUrl.isEmpty, !isStoryRepost {
                let repostAudio = MeeshyMessageAttachment(
                    id: "repost-audio-\(repost.id)",
                    fileName: "audio.mp3",
                    originalName: "audio.mp3",
                    mimeType: "audio/mpeg",
                    fileSize: 0,
                    fileUrl: audioUrl,
                    thumbnailColor: repost.authorColor
                )
                AudioAvailabilityResolver(attachment: repostAudio, autoDownload: true) { availability, onDownload in
                    AudioPlayerView(
                        attachment: repostAudio,
                        context: .feedPost,
                        accentColor: repost.authorColor,
                        transcription: nil,
                        availability: availability,
                        onDownload: onDownload
                    )
                }
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            }

            // Stats row
            HStack(spacing: 12) {
                if repost.likes > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "heart.fill")
                            .font(.caption2)
                        Text("\(repost.likes)")
                            .font(.caption2.weight(.medium))
                    }
                    .foregroundColor(theme.accentText(repost.authorColor).opacity(0.7))
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: repost.authorColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: repost.authorColor, intensity: 0.2), lineWidth: 1)
                )
        )
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    // MARK: - Repost Language Support

    private func repostEffectiveContent(_ repost: RepostContent) -> String {
        let code = repostActiveDisplayLangCode ?? AuthManager.shared.currentUser?.preferredContentLanguages.first(where: { lang in
            repost.translations?.keys.contains(where: { $0.caseInsensitiveCompare(lang) == .orderedSame }) ?? false
        })?.lowercased() ?? repost.originalLanguage?.lowercased() ?? "fr"
        if code == repost.originalLanguage?.lowercased() { return repost.content }
        if let translation = repost.translations?[code] ?? repost.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return repost.content
    }

    private func repostSecondaryContent(_ repost: RepostContent, code: String) -> String? {
        if code == repost.originalLanguage?.lowercased() { return repost.content }
        return repost.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    @ViewBuilder
    private func repostLanguageFlags(_ repost: RepostContent) -> some View {
        let origLang = repost.originalLanguage?.lowercased() ?? ""
        let activeLang = repostActiveDisplayLangCode ?? origLang
        let user = AuthManager.shared.currentUser
        let flags: [String] = {
            var all: [String] = origLang.isEmpty ? [] : [origLang]
            var seen = Set(all)
            for lang in user?.preferredContentLanguages ?? [] {
                let l = lang.lowercased()
                if !seen.contains(l), repost.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                    all.append(l); seen.insert(l)
                }
            }
            return all.filter { $0 != activeLang }
        }()

        if !flags.isEmpty {
            Text("·").font(.caption2).foregroundColor(theme.textMuted)
            ForEach(flags, id: \.self) { code in
                let display = LanguageDisplay.from(code: code)
                let isActive = code == repostSecondaryLangCode
                VStack(spacing: 1) {
                    Text(display?.flag ?? "?")
                        .font(isActive ? .caption : .caption2)
                        .scaleEffect(isActive ? 1.05 : 1.0)
                    if isActive {
                        RoundedRectangle(cornerRadius: 1)
                            .fill(Color(hex: display?.color ?? LanguageDisplay.defaultColor))
                            .frame(width: 8, height: 1.5)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: isActive)
                .onTapGesture {
                    let isOriginal = code == origLang
                    if isOriginal {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostActiveDisplayLangCode = code
                            repostSecondaryLangCode = nil
                        }
                    } else {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostSecondaryLangCode = repostSecondaryLangCode == code ? nil : code
                        }
                    }
                    HapticFeedback.light()
                }
            }
            Image(systemName: "translate")
                .font(.caption2.weight(.medium))
                .foregroundColor(MeeshyColors.indigo400)
        }
    }

    // MARK: - Actions Bar

    @ViewBuilder
    private func actionsBar(_ post: FeedPost) -> some View {
        HStack(spacing: 0) {
            // Heart button — socket-driven (joins post room on appear, leaves on disappear)
            Button {
                guard !postHeartInFlightIds.contains(postId) else { return }
                toggleDetailPostHeart()
                HapticFeedback.light()
                withAnimation(.spring(response: 0.3, dampingFraction: 0.5)) {
                    likeScale = 1.3
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        likeScale = 1.0
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    let heartColor: Color = detailIsLiked ? MeeshyColors.error : (detailLikeCount > 0 ? Color(hex: accentColor) : theme.textSecondary)
                    Image(systemName: detailIsLiked || detailLikeCount > 0 ? "heart.fill" : "heart")
                        .font(.headline)
                        .foregroundColor(heartColor)
                        .scaleEffect(likeScale)
                        .opacity(postHeartInFlightIds.contains(postId) ? 0.5 : 1.0)
                    Text("\(detailLikeCount)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(detailIsLiked ? MeeshyColors.error : (detailLikeCount > 0 ? Color(hex: accentColor) : theme.textMuted))
                        .contentTransition(.numericText())
                }
            }
            .disabled(postHeartInFlightIds.contains(postId))

            Spacer()

            HStack(spacing: 5) {
                Image(systemName: "bubble.right")
                    .font(.body)
                    .foregroundColor(Color(hex: accentColor))
                Text("\(post.commentCount)")
                    .font(.caption.weight(.medium))
                    .foregroundColor(theme.textMuted)
            }

            // Total opens (postOpenCount) — informative, non-interactive, mirrors the
            // reel eye badge. The Detail page now both COUNTS an opening (engagement
            // surface=detail) and SHOWS the running total.
            if post.postOpenCount > 0 {
                Spacer()
                HStack(spacing: 5) {
                    Image(systemName: "eye.fill")
                        .font(.body)
                        .foregroundColor(theme.textSecondary)
                    Text("\(post.postOpenCount)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(theme.textMuted)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(String(localized: "reels.action.views", defaultValue: "Vues", bundle: .main))
                .accessibilityValue("\(post.postOpenCount)")
            }

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                Image(systemName: isPostReposted ? "arrow.2.squarepath.circle.fill" : "arrow.2.squarepath")
                    .font(.body)
                    .foregroundColor(isPostReposted ? MeeshyColors.success : theme.textSecondary)
                    .scaleEffect(isRepostInFlight ? 0.85 : 1.0)
                    .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isPostReposted)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isRepostInFlight)
            }
            .disabled(isRepostInFlight)
            .confirmationDialog("Repartager", isPresented: $showRepostOptions) {
                Button(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main)) {
                    toggleDetailRepost(quote: false)
                }
                Button(String(localized: "feed.post.quote", defaultValue: "Citer", bundle: .main)) {
                    toggleDetailRepost(quote: true)
                }
                Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            }

            Spacer()

            // Bookmark
            Button {
                toggleDetailBookmark()
                HapticFeedback.light()
            } label: {
                Image(systemName: isPostBookmarked ? "bookmark.fill" : "bookmark")
                    .font(.body)
                    .foregroundColor(isPostBookmarked ? MeeshyColors.warning : theme.textSecondary)
                    .scaleEffect(isBookmarkInFlight ? 0.85 : 1.0)
                    .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isPostBookmarked)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isBookmarkInFlight)
            }
            .disabled(isBookmarkInFlight)

            Spacer()

            // Share
            Button {
                sharePostFromDetail()
                HapticFeedback.light()
            } label: {
                ZStack {
                    Image(systemName: "square.and.arrow.up")
                        .font(.body)
                        .foregroundColor(theme.textSecondary)
                        .opacity(isShareInFlight ? 0 : 1)
                    if isShareInFlight {
                        ProgressView()
                            .scaleEffect(0.6)
                            .progressViewStyle(.circular)
                    }
                }
                .animation(.easeInOut(duration: 0.2), value: isShareInFlight)
            }
            .disabled(isShareInFlight)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Media Views

    @ViewBuilder
    private func detailMediaSection(_ mediaList: [FeedMedia]) -> some View {
        let visualMedia = mediaList.filter { $0.type == .image || $0.type == .video }
        let audioMedia = mediaList.filter { $0.type == .audio }
        let docMedia = mediaList.filter { $0.type == .document }
        let locMedia = mediaList.filter { $0.type == .location }

        VStack(spacing: 8) {
            // Single media
            if mediaList.count == 1, let media = mediaList.first {
                detailSingleMedia(media)
            } else {
                // Visual grid
                if !visualMedia.isEmpty {
                    detailVisualGrid(visualMedia)
                }
                // Audio players
                ForEach(audioMedia) { media in
                    detailSingleMedia(media)
                }
                // Documents
                ForEach(docMedia) { media in
                    detailSingleMedia(media)
                }
                // Locations
                ForEach(locMedia) { media in
                    detailSingleMedia(media)
                }
            }
        }
    }

    @ViewBuilder
    private func detailSingleMedia(_ media: FeedMedia) -> some View {
        switch media.type {
        case .image:
            let aspectRatio: CGFloat? = {
                guard let w = media.width, let h = media.height, w > 0, h > 0 else { return nil }
                return CGFloat(w) / CGFloat(h)
            }()
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url,
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(aspectRatio, contentMode: .fit)
            .frame(maxWidth: .infinity, maxHeight: 400)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .onTapGesture { openMediaFullscreen(media) }

        case .video:
            let attachment = media.toMessageAttachment()
            VideoAvailabilityResolver(attachment: attachment, autoDownload: true) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: attachment,
                    style: .inline,
                    controls: .inlineDefault,
                    accentColor: accentColor,
                    frame: .card,
                    availability: availability,
                    performance: .inline,
                    onDownload: onDownload,
                    onExpand: { openMediaFullscreen(media) }
                )
            }
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))

        case .audio:
            let audioAttachment = media.toMessageAttachment()
            AudioAvailabilityResolver(attachment: audioAttachment, autoDownload: true) { availability, onDownload in
                AudioPlayerView(
                    attachment: audioAttachment,
                    context: .feedPost,
                    accentColor: media.thumbnailColor,
                    transcription: media.transcription,
                    availability: availability,
                    onDownload: onDownload
                )
            }
            .clipShape(RoundedRectangle(cornerRadius: 12))

        case .document:
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                        .frame(width: 48, height: 56)
                    Image(systemName: "doc.fill")
                        .font(.title3)
                        .foregroundColor(Color(hex: media.thumbnailColor))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(media.fileName ?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    HStack(spacing: 8) {
                        if let size = media.fileSize {
                            Text(size).font(.caption).foregroundColor(theme.textMuted)
                        }
                        if let pages = media.pageCount {
                            Text("\u{2022}").foregroundColor(theme.textMuted)
                            Text("\(pages) \(String(localized: "feed.post.detail.pages", defaultValue: "pages", bundle: .main))").font(.caption).foregroundColor(theme.textMuted)
                        }
                    }
                }
                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
            )

        case .location:
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Color(hex: media.thumbnailColor).opacity(0.2))
                        .frame(width: 64, height: 64)
                    Image(systemName: "mappin.circle.fill")
                        .font(.title2)
                        .foregroundColor(Color(hex: media.thumbnailColor))
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(media.locationName ?? String(localized: "feed.post.detail.location", defaultValue: "Location", bundle: .main))
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(theme.textPrimary)
                    if let lat = media.latitude, let lon = media.longitude {
                        Text(String(format: "%.4f, %.4f", lat, lon))
                            .font(.caption2)
                            .foregroundColor(theme.textMuted)
                    }
                }
                Spacer()
            }
            .padding(14)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color(hex: media.thumbnailColor).opacity(0.3), lineWidth: 1))
            )
        }
    }

    @ViewBuilder
    private func detailVisualGrid(_ visualMedia: [FeedMedia]) -> some View {
        let spacing: CGFloat = 3
        let count = visualMedia.count

        if count == 2 {
            HStack(spacing: spacing) {
                detailGridCell(visualMedia[0])
                detailGridCell(visualMedia[1])
            }
            .frame(height: 200)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else if count == 3 {
            HStack(spacing: spacing) {
                detailGridCell(visualMedia[0])
                    .aspectRatio(0.75, contentMode: .fill)
                VStack(spacing: spacing) {
                    detailGridCell(visualMedia[1])
                    detailGridCell(visualMedia[2])
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        } else {
            VStack(spacing: spacing) {
                HStack(spacing: spacing) {
                    detailGridCell(visualMedia[0])
                    if count > 1 { detailGridCell(visualMedia[1]) }
                }
                if count > 2 {
                    HStack(spacing: spacing) {
                        detailGridCell(visualMedia[2])
                        if count > 3 {
                            ZStack {
                                detailGridCell(visualMedia[3])
                                if count > 4 {
                                    Color.black.opacity(0.5)
                                    Text("+\(count - 4)")
                                        .font(.headline.weight(.bold))
                                        .foregroundColor(.white)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { openMediaFullscreen(visualMedia[3]) }
                        }
                    }
                }
            }
            .frame(height: 240)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
    }

    private func detailGridCell(_ media: FeedMedia) -> some View {
        return ZStack {
            ProgressiveCachedImage(
                thumbHash: media.thumbHash,
                thumbnailUrl: media.thumbnailUrl,
                fullUrl: media.url,
                autoLoad: true
            ) {
                Color(hex: media.thumbnailColor).shimmer()
            }
            .aspectRatio(contentMode: .fill)
            .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
            .clipped()

            if media.type == .video {
                ZStack {
                    Circle().fill(.ultraThinMaterial).frame(width: 36, height: 36)
                    Circle().fill(Color(hex: accentColor).opacity(0.85)).frame(width: 30, height: 30)
                    Image(systemName: "play.fill")
                        .font(.caption.bold())
                        .foregroundColor(.white)
                        .offset(x: 1)
                }
                .shadow(color: .black.opacity(0.3), radius: 6, y: 3)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { openMediaFullscreen(media) }
    }

    private func openMediaFullscreen(_ media: FeedMedia) {
        guard media.type == .image || media.type == .video else { return }
        fullscreenMediaId = media.id
        showFullscreenGallery = true
        HapticFeedback.light()
    }

    // MARK: - Comments Header

    private var commentsHeader: some View {
        HStack(spacing: 8) {
            Text(String(localized: "feed.post.detail.comments", defaultValue: "Commentaires", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundColor(theme.textPrimary)

            if let post = displayPost, post.commentCount > 0 {
                Text("\(post.commentCount)")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color(hex: accentColor)))
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }

    // MARK: - Composer

    private var replyBannerView: AnyView? {
        guard let reply = viewModel.replyingTo else { return nil }
        return AnyView(
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: reply.authorColor))
                    .frame(width: 3, height: 36)

                VStack(alignment: .leading, spacing: 2) {
                    Text(reply.author)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(hex: reply.authorColor))

                    Text(reply.displayContent)
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                }

                Spacer()

                Button {
                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                        viewModel.clearReply()
                    }
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.bold())
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
        )
    }

    private var composer: some View {
        UniversalComposerBar(
            style: .light,
            mode: .comment,
            accentColor: accentColor,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onSend: { text in
                let effects = commentEffects
                let blur = commentBlurEnabled
                commentEffects = .none
                commentBlurEnabled = false
                Task {
                    let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
                    let effectFlags = flags > 0 ? Int(flags) : nil
                    if viewModel.replyingTo != nil {
                        await viewModel.sendReply(text, effectFlags: effectFlags)
                    } else {
                        await viewModel.sendComment(text, effectFlags: effectFlags)
                    }
                }
            },
            replyBanner: replyBannerView,
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            focusTrigger: $composerFocusTrigger
        )
    }
}
