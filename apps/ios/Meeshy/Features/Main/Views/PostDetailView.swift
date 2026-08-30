import SwiftUI
import Combine
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

struct PostDetailView: View {
    let postId: String
    var initialPost: FeedPost?
    var showComments: Bool = false
    /// Commentaire ciblé par une navigation depuis une notification (like /
    /// réponse / commentaire). L'écran défile jusqu'à lui et le surligne.
    var targetCommentId: String?
    /// Commentaire parent quand la cible est une réponse — l'écran déplie le fil
    /// du parent puis défile jusqu'à ce fil (la réponse y apparaît).
    var targetParentCommentId: String?

    @StateObject private var viewModel = PostDetailViewModel()
    /// Autocomplétion @mention pour le composer de commentaire — contexte `.post`,
    /// donc le backend suggère l'auteur du post, les personnes ayant commenté, puis
    /// les contacts (parité avec `FeedCommentsSheet`).
    @StateObject private var mentionController: MentionComposerController
    // internal : lu par `PostDetailView+Canvas.swift` (#4086) — un membre
    // `private` d'une View n'est PAS visible depuis un fichier d'extension.
    var theme: ThemeManager { ThemeManager.shared }

    init(
        postId: String,
        initialPost: FeedPost? = nil,
        showComments: Bool = false,
        targetCommentId: String? = nil,
        targetParentCommentId: String? = nil
    ) {
        self.postId = postId
        self.initialPost = initialPost
        // A comment target implies the comments section must be revealed.
        self.showComments = showComments || targetCommentId != nil
        self.targetCommentId = targetCommentId
        self.targetParentCommentId = targetParentCommentId
        _mentionController = StateObject(wrappedValue: MentionComposerController(context: .post(id: postId)))
    }
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
    @State private var audioFullscreen: AudioFullscreenSource?
    /// Lieu du post ouvert plein écran (sticker / carte de la page Detail).
    @State private var detailFullscreenPlace: BubbleFullscreenPlace?
    /// Muet LOCAL du canvas story inline (natif OU repost-de-story, RF3) —
    /// B3.6, Task E2. Pilote `mute:` aux DEUX sites `StoryReaderRepresentable`
    /// (mutuellement exclusifs — un seul rend à la fois). Jamais
    /// `isGlobalMuted` du viewer story : surfaces indépendantes.
    @State var isCanvasMuted = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var commentBlurEnabled: Bool = false
    @State private var commentEffects: MessageEffects = .none
    @State private var composerFocusTrigger: Bool = false
    /// Focus réel du champ du composer — pilote l'insertion d'un texte déposé
    /// (au curseur quand le champ a le focus, sinon à la fin).
    @State private var composerIsFocused: Bool = false
    /// Section de commentaire actuellement surlignée (cible d'une notification).
    @State private var highlightedCommentId: String? = nil
    /// Garde-fou : ne défile vers la cible qu'une seule fois (les commentaires
    /// peuvent arriver après le premier rendu via le chargement paginé).
    @State private var didScrollToTargetComment: Bool = false
    /// Latch de la chasse paginée (cible hors des pages chargées) — une seule
    /// chasse par présentation.
    @State private var isHuntingTargetComment: Bool = false
    /// Texte du composer, lié au `UniversalComposerBar`. Permet de préremplir une
    /// @mention quand on répond à une réponse (niveau 2) — l'auteur ciblé est
    /// notifié via `user_mentioned` même si la réponse est reparentée à la racine.
    @State private var composerText: String = ""
    /// @mention auto-injectée par `beginReply` (réponse à une réponse) — suivie
    /// pour la retirer proprement si on change de cible sans envoyer.
    @State private var prefilledMention: String? = nil
    // Comment attachments + real voice capture (parity with feed/reels composer).
    @State private var commentAttachments: [ComposerAttachment] = []
    @State private var showCommentPhotoPicker: Bool = false
    @State private var commentPhotoItems: [PhotosPickerItem] = []
    @State private var showCommentFilePicker: Bool = false
    @State private var showCommentLocationPicker: Bool = false
    /// Lieu choisi via le picker, en attente d'envoi — transporté jusqu'au
    /// commentaire à l'envoi (contrairement à `FeedCommentsSheet`, dont le
    /// transport arrive dans une tâche ultérieure du plan).
    @State private var pendingPlace: SharedPlace? = nil
    @StateObject private var audioRecorder = AudioRecorderManager()
    @State private var isTextExpanded = false
    @State private var headerScrollRelay = ScrollOffsetRelay()
    // Inline story canvas playback gating (audio active → pause when off-screen / in call).
    @State var storyCanvasVisible: Bool = true
    @State var isCallActive: Bool = false
    @State var scrollViewportHeight: CGFloat = 0
    static let scrollSpace = "postDetailScroll"
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
            FeedbackToastManager.shared.showError(String(localized: "post.link.unavailable", defaultValue: "Lien indisponible", bundle: .main))
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

    // Bookmark / repost optimistic state — same pattern as FeedView.
    @State private var isPostBookmarked: Bool = false
    @State private var isBookmarkInFlight: Bool = false
    @State private var isPostReposted: Bool = false
    @State private var isRepostInFlight: Bool = false
    @State private var showRepostOptions: Bool = false
    @State private var isEditing: Bool = false
    /// Flux « Enregistrer en local » du menu « … » — déclenché uniquement
    /// quand le post a un média (sinon Enregistrer bascule le favori in-app).
    @StateObject private var mediaSaveCoordinator = MediaSaveCoordinator()

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
                FeedbackToastManager.shared.showError(String(localized: "post.bookmark.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main))
            } else {
                FeedbackToastManager.shared.showSuccess(wasBookmarked
                    ? String(localized: "post.bookmark.removed", defaultValue: "Retiré des favoris", bundle: .main)
                    : String(localized: "post.bookmark.added", defaultValue: "Ajouté aux favoris", bundle: .main))
            }
        }
    }

    /// Déclenche le flux unifié « Enregistrer en local » sur le média principal
    /// du post (repost-aware via `primaryReelDisplayMedia`). No-op si absent —
    /// gardé par l'appelant (`displayPost?.primaryReelDisplayMedia != nil`).
    private func requestSaveMedia() {
        guard let media = displayPost?.primaryReelDisplayMedia, let url = media.url, !url.isEmpty else { return }
        HapticFeedback.light()
        let attachmentKind: AttachmentKind
        switch media.type {
        case .video: attachmentKind = .video
        case .audio: attachmentKind = .audio
        case .document: attachmentKind = .document
        case .image: attachmentKind = .image
        }
        mediaSaveCoordinator.requestSave(MediaSaveRequest(
            kind: attachmentKind,
            remoteURLString: url,
            suggestedFileName: media.fileName
        ))
    }

    @MainActor
    private func toggleDetailRepost(quote: Bool) {
        guard !isRepostInFlight else { return }
        isPostReposted = true
        isRepostInFlight = true
        // L'instantané se prend AVANT d'ouvrir le `Task`, donc dans le tour de
        // boucle du tap : cette fonction est déjà `@MainActor`, mais un `Task`
        // ne s'exécute pas au tap — il s'ENFILE. Lire la carte à l'intérieur
        // laissait au socket un tour de boucle pour la retirer du modèle ;
        // `cardType` rendait alors `nil`, le gateway repliait sur `POST`
        // (`?? PostType.POST`) et une story repartagée devenait un post
        // permanent. Le `Task` reçoit une cible déjà résolue : il n'a plus de
        // lecture à faire.
        let carte = displayPost
        let cible = RepostTargeting.target(
            cardId: postId, cardType: carte?.type,
            repostOfId: carte?.repost?.id,
            originalRepostOfId: carte?.repost?.originalRepostOfId
        )
        // « Citer » ouvre une alerte SANS champ de saisie : ce site DÉCLARE la
        // citation sans recueillir de commentaire. `declaredQuote` porte ce
        // geste tel qu'il est plutôt que de le normaliser en repartage sec —
        // `isQuote` change côté serveur où s'enracinent les réactions.
        let intention: RepostIntent = quote
            ? RepostIntent.declaredQuote(postId: cible.postId, targetType: cible.targetType, visibility: nil)
            : RepostIntent.simple(postId: cible.postId, targetType: cible.targetType, visibility: nil)
        Task {
            defer { Task { @MainActor in isRepostInFlight = false } }
            do {
                try await RepostPublisher.shared.publish(intention)
                FeedbackToastManager.shared.showSuccess(String(localized: "Repartage", defaultValue: "Repartage"))
            } catch {
                isPostReposted = false
                FeedbackToastManager.shared.showError(String(localized: "post.repost.error", defaultValue: "Erreur lors du repost", bundle: .main))
            }
        }
    }

    private var displayPost: FeedPost? { viewModel.post ?? initialPost }

    private var accentColor: String {
        displayPost?.authorColor ?? "6366F1"
    }

    /// Second arrêt du dégradé servi au composer de commentaire. Dérivé de
    /// l'accent du post par la formule de palette du SDK
    /// (`secondary = shiftHue(primary, +30°)`) : sans lui, le composer
    /// retombe sur son défaut de marque et le bouton d'envoi rend un dégradé
    /// hybride accent → indigo.
    private var composerSecondaryColor: String {
        DynamicColorGenerator.hueShiftedHex(accentColor, degrees: 30)
    }

    /// True when the signed-in user authored this post — gates the private reach
    /// stats (vues + impressions) shown next to the @handle, mirroring the feed
    /// and reel cards where analytics are author-only.
    private var isPostAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id, let post = displayPost else { return false }
        return me == post.authorId
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

    /// Vidéo embeddable (YouTube) détectée dans le contenu affiché du post.
    private var embeddedVideo: EmbeddedVideo? {
        EmbeddableVideoResolver.resolve(in: effectiveContent)
    }

    /// `[rawURL: token]` outbound-link tracking map du post (nil si aucun lien
    /// tracké → pas de réécriture dans le renderer).
    private var postTrackedLinks: [String: String]? {
        let map = displayPost?.trackedLinkMap ?? [:]
        return map.isEmpty ? nil : map
    }

    /// Destination trackée `/l/<token>` pour la façade vidéo, dérivée de la
    /// première URL du contenu via `trackedLinkMap`. `nil` → watchURL.
    private var embedTrackedURL: URL? {
        guard let raw = LinkPreviewFetcher.firstURL(in: effectiveContent),
              let token = displayPost?.trackedLinkMap[raw] else { return nil }
        return URL(string: "https://meeshy.me/l/\(token)")
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

    /// Le retour haptique appartient à `LanguageFlagChip` — seul appelant de
    /// cette méthode — et non aux deux sorties de sa logique.
    private func handleFlagTap(_ code: String) {
        guard let post = displayPost else { return }
        let isOriginal = code == post.originalLanguage?.lowercased()
        let hasContent = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == code }) == true
        if !hasContent { return }
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
    }

    // Scrollable post-detail content (text, media, repost, actions, comments).
    // Extracted from `body` into its own @ViewBuilder unit so the Swift
    // type-checker stays within budget — inlining the threaded-comment
    // ForEach made `body` exceed the reasonable type-check time.
    @ViewBuilder
    private func postDetailContent(_ post: FeedPost) -> some View {
        // ZONE 1: Text
        textZone(post)

        // ZONE 2: Story canvas (inline reader) OR standard media
        //
        // For a SHARED STORY (a POST that reposts a STORY), the embedded story
        // canvas is rendered by `repostEmbed` below — so suppress the wrapper's
        // own media here to avoid showing the same story content twice. Mirrors
        // the existing text-dedup guards (`if !post.isStory` / `if !isStoryRepost`).
        let isSharedStory = (post.repost?.type ?? "").uppercased() == "STORY"
        // Conversion UNIQUE — partagée par storyCanvasSection ET la porte du
        // bouton muet dans actionsBar (correctif revue mineur #8) : évite une
        // 2e construction de StoryItem(feedPost:) par évaluation de body (ce
        // panneau réévalue à chaque frame de scroll via storyCanvasVisible),
        // ET garantit que la porte et le rendu voient EXACTEMENT le même item.
        let renderedItem = StoryItem(feedPost: post)
        if post.isStory {
            storyCanvasSection(post, renderedItem: renderedItem)
        } else if post.hasMedia, !isSharedStory {
            detailMediaSection(post.media, owner: DetailMediaAuthor(post: post))
                .padding(.horizontal, 16)
                .padding(.top, 8)
        }

        // Lieu attaché au post (constat user 2026-07-30) : même paire de
        // rendus que la card du feed — carte pleine largeur + texte overlay
        // quand la position est le seul visuel, sinon sticker compact.
        if let place = post.location {
            Group {
                if !post.hasMedia && post.repost == nil {
                    // Pas de texte en overlay ici : la page Detail rend déjà le
                    // texte complet dans sa `textZone` — la carte est le visuel.
                    FeedPostLocationMapCard(
                        place: place,
                        overlayText: nil,
                        onOpen: { detailFullscreenPlace = BubbleFullscreenPlace(place: place) }
                    )
                } else {
                    FeedPostLocationSticker(place: place) {
                        detailFullscreenPlace = BubbleFullscreenPlace(place: place)
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }

        // Repost embed
        //
        // STORY qui reposte une STORY : le canvas principal ci-dessus rend
        // DÉJÀ la republication complète (effects/médias/audio retombent sur
        // la source via `StoryItem(feedPost:)`). Rendre en plus l'embed de
        // l'original doublait le contenu à l'écran (bug 2026-07-13,
        // IMG_1161) — on le remplace par une ligne d'attribution « via
        // @auteur » qui ouvre l'original.
        if let repost = post.repost {
            if post.isStory && isSharedStory {
                storyRepostAttributionRow(repost)
            } else {
                repostEmbed(repost, renderedItem: renderedItem)
            }
        }

        // Actions bar
        actionsBar(post, renderedItem: renderedItem)

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
                    beginReply(to: target)
                },
                onToggleThread: {
                    Task { await viewModel.toggleThread(comment.id, postId: postId) }
                },
                onLikeComment: { commentId in
                    Task { await viewModel.toggleCommentLike(commentId, postId: postId) }
                },
                onDeleteComment: { target in
                    Task { await viewModel.deleteComment(target) }
                },
                onEditComment: { target in
                    viewModel.clearReply()
                    viewModel.editingComment = target
                    composerText = target.content
                    let flags = MessageEffectFlags(rawValue: UInt32(clamping: target.effectFlags))
                    commentBlurEnabled = flags.contains(.blurred)
                    commentEffects = MessageEffects(flags: flags.subtracting(.blurred))
                    HapticFeedback.light()
                },
                onRequestTranslation: { target in
                    let lang = AuthManager.shared.currentUser?.preferredContentLanguages.first?.lowercased() ?? "fr"
                    Task {
                        try? await PostService.shared.requestCommentTranslation(
                            postId: postId, commentId: target.id, targetLanguage: lang)
                    }
                },
                moodEmoji: statusViewModel.statusForUser(userId: comment.authorId)?.moodEmoji,
                storyState: storyViewModel.storyRingState(forUserId: comment.authorId),
                presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state,
                replyMoodResolver: { statusViewModel.statusForUser(userId: $0)?.moodEmoji },
                replyStoryResolver: { storyViewModel.storyRingState(forUserId: $0) },
                replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state },
                hasMoreReplies: viewModel.expandedThreads.contains(comment.id)
                    && (viewModel.repliesHasMore[comment.id] ?? false),
                onLoadMoreReplies: { await viewModel.loadMoreReplies(comment.id, postId: postId) },
                highlightedCommentId: highlightedCommentId
            )
            .padding(.horizontal, 16)
            .padding(.vertical, highlightedCommentId == comment.id ? 6 : 0)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(hex: accentColor).opacity(highlightedCommentId == comment.id ? 0.12 : 0))
                    .padding(.horizontal, 8)
            )
            .animation(.easeInOut(duration: 0.4), value: highlightedCommentId)
            // Anchor for notification-driven navigation: scroll/highlight targets
            // the top-level section. For a reply, the parent thread is expanded so
            // the reply becomes visible right below this anchor.
            .id("comment-\(comment.id)")
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

    /// Notification → comment navigation. Scrolls to (and briefly highlights) the
    /// targeted comment once it's loaded. For a reply, scrolls to the parent
    /// section and expands its thread so the reply is revealed. Falls back to the
    /// legacy "reveal comments + focus composer" behaviour when there's no target.
    /// Runs once (guarded by `didScrollToTargetComment`); re-invoked as comments
    /// page in until the target is present.
    private func attemptScrollToTargetComment(using proxy: ScrollViewProxy) {
        guard let target = targetCommentId, !target.isEmpty else {
            if showComments && !didScrollToTargetComment {
                didScrollToTargetComment = true
                withAnimation { proxy.scrollTo("commentsSection", anchor: .top) }
                composerFocusTrigger.toggle()
            }
            return
        }
        guard !didScrollToTargetComment else { return }

        // Only top-level sections carry a scroll anchor. For a reply, that's the
        // parent comment; otherwise the comment itself.
        let sectionId = targetParentCommentId.flatMap { $0.isEmpty ? nil : $0 } ?? target
        guard viewModel.topLevelComments.contains(where: { $0.id == sectionId }) else {
            // Cible au-delà des pages chargées (20/page) : chasse paginée
            // bornée. Chaque page qui arrive re-déclenche ce scroll via
            // l'onChange sur topLevelComments.count ; si la chasse échoue
            // (cap ou fin de liste), on désarme le ciblage.
            if !isHuntingTargetComment {
                isHuntingTargetComment = true
                Task {
                    let found = await viewModel.loadCommentsUntilPresent(sectionId, postId: postId)
                    if !found { didScrollToTargetComment = true }
                }
            }
            return
        }
        didScrollToTargetComment = true

        if let parentId = targetParentCommentId, !parentId.isEmpty, target != sectionId {
            // Cible = une RÉPONSE. Déplier le parent (awaité — ancrer avant
            // l'expansion décale la section), CHASSER la page de réponses qui
            // contient la cible (le fil est paginé à 20), puis scroller sur la
            // rangée de la réponse elle-même. Repli : section + highlight du
            // parent si la chasse échoue (cap / fin de fil / réseau).
            Task {
                if !viewModel.expandedThreads.contains(parentId) {
                    await viewModel.toggleThread(parentId, postId: postId)
                }
                let found = await viewModel.loadRepliesUntilPresent(target, in: parentId, postId: postId)
                if found {
                    withAnimation { proxy.scrollTo("comment-\(target)", anchor: .center) }
                    applyTargetHighlight(target)
                } else {
                    withAnimation { proxy.scrollTo("comment-\(sectionId)", anchor: .top) }
                    applyTargetHighlight(sectionId)
                }
            }
        } else {
            withAnimation { proxy.scrollTo("comment-\(sectionId)", anchor: .top) }
            applyTargetHighlight(sectionId)
        }
    }

    /// Surligne `id` puis désarme après 2,6 s (si toujours actif).
    private func applyTargetHighlight(_ id: String) {
        highlightedCommentId = id
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.6) {
            if highlightedCommentId == id { highlightedCommentId = nil }
        }
    }

    /// Contenu introuvable : expiré, retiré, ou jamais accessible à cette
    /// personne. On ne distingue pas — le serveur répond la même chose dans les
    /// trois cas, et prétendre le contraire serait inventer.
    private var unavailableState: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.badge.xmark")
                .font(.system(size: 40))
                .foregroundColor(theme.textMuted)
                .accessibilityHidden(true)
            Text(String(localized: "feed.post.detail.unavailable.title",
                        defaultValue: "Ce contenu n'est plus disponible", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(String(localized: "feed.post.detail.unavailable.body",
                        defaultValue: "Il a peut-être expiré ou été retiré par son auteur.", bundle: .main))
                .font(MeeshyFont.relative(14))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
            Button {
                // Même geste que la flèche de l'en-tête (`postDetailHeader`) —
                // et le seul disponible ici : l'en-tête ne se rend qu'avec un
                // post, donc cette branche n'en a aucun.
                HapticFeedback.light()
                router.pop()
            } label: {
                Text(String(localized: "feed.post.detail.unavailable.back",
                            defaultValue: "Retour", bundle: .main))
                    .font(MeeshyFont.relative(15, weight: .semibold))
            }
            .buttonStyle(.bordered)
            .padding(.top, 4)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    var body: some View {
        VStack(spacing: 0) {
            if let post = displayPost {
                ZStack(alignment: .top) {
                    ScrollViewReader { scrollProxy in
                        ScrollView(showsIndicators: false) {
                            VStack(spacing: 0) {
                                // Reserve the floating header's height so the inline
                                // author block sits just below it at rest and scrolls
                                // UNDER the translucent surface (same as SettingsView).
                                Color.clear.frame(height: CollapsibleHeaderMetrics.expandedHeight)

                                LazyVStack(spacing: 0) {
                                    postDetailContent(post)
                                }
                                .padding(.bottom, 80)
                            }
                            // iOS 16–17 scroll-offset reader: the content's top `minY`
                            // is 0 at rest and goes negative as it scrolls up.
                            .background(
                                GeometryReader { geo in
                                    Color.clear.preference(
                                        key: ScrollOffsetPreferenceKey.self,
                                        value: geo.frame(in: .named(Self.scrollSpace)).minY
                                    )
                                }
                            )
                        }
                        .coordinateSpace(name: Self.scrollSpace)
                        // `.onPreferenceChange` stops re-firing on scroll under iOS 18+
                        // (it delivers only the initial value — verified on iOS 18.2
                        // and iOS 26), so the author chip never revealed. Keep it for
                        // iOS 16–17 and overlay the native iOS 18+ scroll reader, which
                        // reports `contentOffset.y` (0 at top, positive scrolling down),
                        // negated to match the `minY` sign the preference path produced.
                        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { headerScrollRelay.offset = $0 }
                        .trackScrollContentOffset { headerScrollRelay.offset = -$0 }
                        .background(
                            GeometryReader { geo in
                                Color.clear.preference(key: ScrollViewportHeightKey.self, value: geo.size.height)
                            }
                        )
                        .onPreferenceChange(ScrollViewportHeightKey.self) { scrollViewportHeight = $0 }
                        .onAppear {
                            if showComments {
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                    attemptScrollToTargetComment(using: scrollProxy)
                                }
                            }
                        }
                        // Comments load asynchronously (and paginate), so the
                        // target may not exist at first render. Retry the scroll
                        // each time the loaded set changes until it lands once.
                        .adaptiveOnChange(of: viewModel.topLevelComments.count) { _, _ in
                            attemptScrollToTargetComment(using: scrollProxy)
                        }
                        .onReceive(CallManager.shared.$callState) { state in
                            isCallActive = state.isActive
                        }
                    } // ScrollViewReader

                    // Floating translucent header overlaid on the scroll content's
                    // top — NOT `.safeAreaInset` (which pinned the scroll-offset
                    // preference). The ZStack respects the safe area so the header
                    // clears the Dynamic Island; the `Color.clear` spacer above
                    // reserves its room so the author isn't hidden at rest.
                    VStack(spacing: 0) {
                        postDetailHeader(post)
                        Spacer(minLength: 0)
                    }
                } // ZStack
            } else if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            } else {
                // Ni post, ni chargement : la cible n'existe plus. Cette branche
                // n'existait pas — l'écran rendait une PAGE BLANCHE surmontée
                // d'un composeur de commentaire, sans en-tête donc sans bouton
                // retour. C'est exactement où atterrit un `/l/<token>` de story
                // expirée, le cas le plus fréquent de ces liens (toute story
                // meurt à 24 h) : le lien ouvre enfin la bonne destination, il
                // fallait encore que la destination dise quelque chose.
                Spacer()
                unavailableState
                Spacer()
            }

            // Le composeur ne survit pas à l'absence de post : commenter ce qui
            // n'existe plus n'aboutirait jamais.
            if displayPost != nil || viewModel.isLoading {
                VStack(spacing: 0) {
                    if mentionController.activeQuery != nil {
                        MentionSuggestionPanel(
                            controller: mentionController,
                            accentColor: accentColor,
                            currentText: composerText,
                            onSelect: { updated in composerText = updated }
                        )
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    composer
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: mentionController.activeQuery != nil)
            }
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
            // already sees the content live). `onPostOpened` fait DAVANTAGE que
            // l'ancienne affectation nue de `activePostId` : il marque aussi les
            // notifications de ce post comme lues (cache local + serveur), le
            // contenu étant consommé.
            NotificationToastManager.shared.onPostOpened(postId)
            // Record view when post detail is opened.
            // - viewPost → vue UNIQUE (viewCount, dédupliquée, sauvegardée non affichée)
            // - registerDetailOpen → vue TOTALE (postOpenCount, chaque ouverture) + impression,
            //   comptées IMMÉDIATEMENT, avant tout tracking d'engagement (durée de lecture).
            try? await PostService.shared.viewPost(postId: postId, duration: nil)
            await viewModel.registerDetailOpen(postId)
            // Reprend le brouillon de commentaire laissé sur ce post (cache-first).
            if composerText.isEmpty, let draft = CommentDraftStore.shared.load(postId: postId) {
                composerText = draft
            }
        }
        .onDisappear {
            SocialSocketManager.shared.leavePostRoom(postId: postId)
            NotificationToastManager.shared.onPostClosed(postId)
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
                onMoodTap: statusViewModel.moodTapHandler(for: user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in
                    AnyView(ProfileUserPostsList(userId: uid, onOpenPost: { post in
                        selectedProfileUser = nil
                        router.push(.postDetail(post.id, post))
                    }, onOpenReel: { reel, reels in
                        ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil }
                    }))
                }
            )
            .presentationDetents([.large, .medium])
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
                    originalLanguage: post.originalLanguage,
                    originalType: post.type,
                    media: post.media.map { EditablePostMedia($0) },
                    originalLocation: post.location,
                    originalVisibility: post.visibility,
                    originalVisibilityUserIds: post.visibilityUserIds ?? [],
                    isRepost: post.repost != nil,
                    onSave: { draft in
                        await viewModel.updatePost(content: draft.content, language: draft.language, type: draft.type, removeMediaIds: draft.removeMediaIds.isEmpty ? nil : draft.removeMediaIds, location: draft.location, visibility: draft.visibility, visibilityUserIds: draft.visibilityUserIds, known: draft.known)
                    },
                    onDismiss: { isEditing = false }
                )
            }
        }
        .fullScreenCover(item: $detailFullscreenPlace) { item in
            // Même surface plein écran que la bulle et la card feed :
            // carte + « Ouvrir dans Plans » / « Itinéraire ».
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: accentColor,
                senderName: displayPost?.author
            )
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
                    captionMap: SocialMediaCaption.map(
                        for: post.media, carrierText: post.displayContent
                    ),
                    senderInfoMap: senderMap
                )
            }
        }
        .audioFullscreenCover($audioFullscreen, accentColor: accentColor)
        .mediaSaveFlow(mediaSaveCoordinator)
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
                    .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(post.author)
                            .font(.subheadline.weight(.bold))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(1)
                        let reach = PostReachFormatter.components(
                            username: post.authorUsername,
                            isAuthor: isPostAuthor
                        )
                        if reach.pseudo != nil || reach.showsStats {
                            HStack(spacing: 4) {
                                if let pseudo = reach.pseudo {
                                    Text(pseudo)
                                        .font(.caption2)
                                        .foregroundColor(theme.textMuted)
                                        .lineLimit(1)
                                        .truncationMode(.tail)
                                        .layoutPriority(0)
                                }
                                if reach.showsStats {
                                    if reach.pseudo != nil {
                                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                                    }
                                    HStack(spacing: 3) {
                                        ReachMetricLabel(
                                            icon: "eye.fill",
                                            count: post.viewCount,
                                            label: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main),
                                            tint: theme.textMuted
                                        )
                                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                                        ReachMetricLabel(
                                            icon: "chart.bar.fill",
                                            count: post.impressionCount,
                                            label: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main),
                                            tint: theme.textMuted
                                        )
                                    }
                                    // Stats must always print in full (up to "2.3M") —
                                    // they're the values the user cross-checks against the
                                    // inline reach line. Pin their size + priority so the
                                    // @pseudo yields/truncates first; never clip a number.
                                    .lineLimit(1)
                                    .fixedSize(horizontal: true, vertical: false)
                                    .layoutPriority(1)
                                }
                            }
                        }
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(format: String(localized: "a11y.post.author_profile", defaultValue: "Profil de %@", bundle: .main), post.author))
            .accessibilityHint(String(localized: "a11y.post.author_profile.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))
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
            Button {
                if displayPost?.primaryReelDisplayMedia != nil {
                    requestSaveMedia()
                } else {
                    toggleDetailBookmark()
                }
            } label: {
                // Le TITRE disait « Enregistrer » que le post soit déjà
                // enregistré ou non — seule l'icône changeait. Dans un MENU,
                // c'est le nom qui porte l'état : un lecteur d'écran y entend
                // une liste de commandes, pas des interrupteurs, et
                // « Enregistrer » sur un post déjà enregistré est faux
                // (253i, #4266).
                //
                // La barre d'action de CE MÊME FICHIER fait varier son
                // étiquette depuis toujours, avec ces deux clés exactes : le
                // savoir était à trente lignes d'ici.
                Label(
                    displayPost?.primaryReelDisplayMedia != nil
                        ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
                        : (isPostBookmarked
                            ? String(localized: "a11y.post.bookmark_remove", defaultValue: "Retirer des favoris", bundle: .main)
                            : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)),
                    systemImage: displayPost?.primaryReelDisplayMedia != nil
                        ? "arrow.down.to.line"
                        : (isPostBookmarked ? "bookmark.fill" : "bookmark")
                )
            }
            if displayPost?.authorId == AuthManager.shared.currentUser?.id {
                Button {
                    Task { await viewModel.pinPost(postId) }
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.pin", defaultValue: "Épingler", bundle: .main), systemImage: "pin")
                }
                Button {
                    isEditing = true
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
                }
                Divider()
                Button(role: .destructive) {
                    HapticFeedback.medium()
                    Task {
                        if await viewModel.deletePost(postId) {
                            router.pop()
                        }
                    }
                } label: {
                    Label(String(localized: "common.delete", defaultValue: "Supprimer", bundle: .main), systemImage: "trash")
                }
            } else {
                Divider()
                Button(role: .destructive) {
                    HapticFeedback.light()
                    Task { await viewModel.reportPost(postId) }
                } label: {
                    Label(String(localized: "feed.post.detail.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)
                .frame(width: 36, height: 36)
                .background(Circle().fill(theme.inputBackground.opacity(0.6)))
        }
        .accessibilityLabel(String(localized: "a11y.post.more_options", defaultValue: "Plus d'options", bundle: .main))
        .accessibilityHint(String(localized: "a11y.post.more_options.hint", defaultValue: "Copier le lien, partager, signaler", bundle: .main))
    }

    private func postDetailHeader(_ post: FeedPost) -> some View {
        // Seul ce reader se re-rend au fil du scroll — la racine écrit
        // `headerScrollRelay.offset` sans s'y abonner (P1-1).
        ScrollOffsetReader(relay: headerScrollRelay) { offset in
            CollapsibleHeader(
                title: "",
                scrollOffset: offset,
                showBackButton: true,
                onBack: { HapticFeedback.light(); router.pop() },
                titleColor: theme.textPrimary,
                backArrowColor: theme.textPrimary,
                backgroundColor: theme.backgroundPrimary,
                centerReveal: { authorRevealView(post) },
                trailing: { postMenu }
            )
        }
    }

    // MARK: - Author Reach Line

    /// `@pseudo` suivi, pour l'auteur uniquement, des compteurs de portée
    /// (vues puis impressions) — la barre d'actions du bas n'affiche donc plus
    /// l'œil. Même grammaire visuelle que le feed/réel (`FeedPostCard`,
    /// `ReelFeedCard`) : analytics privées, réservées à l'auteur.
    @ViewBuilder
    private func authorReachLine(_ post: FeedPost) -> some View {
        let username = post.authorUsername ?? ""
        let hasUsername = !username.isEmpty
        if hasUsername || isPostAuthor {
            HStack(spacing: 5) {
                if hasUsername {
                    Text("@\(username)")
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                }
                if isPostAuthor {
                    if hasUsername {
                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                    }
                    HStack(spacing: 3) {
                        ReachMetricLabel(
                            icon: "eye.fill",
                            count: post.viewCount,
                            label: String(localized: "feed.reel.views", defaultValue: "Vues", bundle: .main),
                            tint: theme.textMuted
                        )
                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                        ReachMetricLabel(
                            icon: "chart.bar.fill",
                            count: post.impressionCount,
                            label: String(localized: "feed.reel.impressions", defaultValue: "Impressions", bundle: .main),
                            tint: theme.textMuted
                        )
                    }
                }
            }
        }
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
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    Text(post.author)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(theme.textPrimary)
                        .onTapGesture {
                            selectedProfileUser = .from(feedPost: post)
                        }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityLabel(String(format: String(localized: "a11y.post.author_profile", defaultValue: "Profil de %@", bundle: .main), post.author))
                        .accessibilityHint(String(localized: "a11y.post.author_profile.hint", defaultValue: "Ouvre le profil de l'auteur", bundle: .main))

                    // @pseudo + portée (vues · impressions) — sous le nom, l'œil
                    // ne vit plus dans la barre d'actions du bas.
                    authorReachLine(post)

                    HStack(spacing: 4) {
                        Text(post.timestamp, style: .relative)
                            .font(.caption)
                            .foregroundColor(theme.textMuted)

                        let flags = buildAvailableFlags()
                        if !flags.isEmpty || post.translations?.isEmpty == false {
                            MetaSeparator().font(.caption).foregroundColor(theme.textMuted)

                            ForEach(flags, id: \.self) { code in
                                LanguageFlagChip(code: code, isActive: code == secondaryLangCode) {
                                    handleFlagTap(code)
                                }
                            }

                            if post.translations?.isEmpty == false {
                                TranslationsBadge { showTranslationSheet = true }
                            }
                        }
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)

            // Story caption lives inside the canvas overlays → suppress the plain
            // body (caption + secondary translation + embed) for stories to avoid
            // showing the same text twice.
            if !post.isStory {
            // Content with truncation — le corps passe par `MessageTextRenderer`
            // pour rendre les URLs cliquables + trackées (`/l/<token>`). Le lien
            // a priorité sur le tap d'expansion (défaut SwiftUI pour `.link`).
            let truncation = textTruncation
            let bodyText = (truncation.isTruncated && !isTextExpanded)
                ? truncation.text + "..."
                : effectiveContent
            VStack(alignment: .leading, spacing: 2) {
                MessageTextRenderer.render(bodyText, fontSize: 16, color: theme.textPrimary, mentionColor: MeeshyColors.mentionColor(isDark: theme.mode.isDark), hashtagColor: MeeshyColors.hashtagColor(isDark: theme.mode.isDark), accentColor: Color(hex: accentColor), trackedLinks: postTrackedLinks, validUsernames: post.validMentionUsernames)
                    .tint(Color(hex: accentColor))
                if truncation.isTruncated {
                    Text(isTextExpanded
                        ? String(localized: "feed.post.detail.see_less", defaultValue: "voir moins", bundle: .main)
                        : String(localized: "feed.post.detail.see_more", defaultValue: "voir plus", bundle: .main))
                        .font(.callout.weight(.semibold))
                        .foregroundColor(Color(hex: accentColor))
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
                .accessibilityElement(children: .combine)
                .accessibilityLabel(String(format: String(localized: "a11y.post.secondary_translation", defaultValue: "Traduction en %1$@ : %2$@", bundle: .main), display?.name ?? code, content))
            }

            // Embed vidéo (YouTube) détecté dans le contenu du post.
            if let embeddedVideo {
                VideoEmbedContainer(video: embeddedVideo, accent: Color(hex: accentColor), trackedURL: embedTrackedURL)
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
            }
            } // if !post.isStory

            // « Avec … » + marqueur personnel — indépendant de `isStory` : NOTE
            // et SILENT n'ont pas de représentation sur le canevas, donc une
            // story référencée a besoin de la même rangée qu'un post plat.
            ReferenceNoteRow(
                references: post.mentions ?? [],
                currentUserId: AuthManager.shared.currentUser?.id,
                accentColor: Color(hex: accentColor),
                onTapReference: { selectedProfileUser = .from(reference: $0) }
            )
            .padding(.horizontal, 16)
            .padding(.top, 6)
        }
    }

    // MARK: - Repost Embed

    @State private var repostSecondaryLangCode: String? = nil
    @State private var repostActiveDisplayLangCode: String? = nil

    /// Attribution compacte d'une STORY republiée en story : icône repost +
    /// « @auteur » (SANS « via » — l'icône dit déjà la republication, même
    /// règle que le header du viewer, directive user 2026-07-13) tappable
    /// vers l'original. Remplace l'embed canvas complet (qui doublait le
    /// contenu sous le canvas principal — IMG_1161, 2026-07-13).
    private func storyRepostAttributionRow(_ repost: RepostContent) -> some View {
        Button {
            HapticFeedback.light()
            router.push(.postDetail(repost.id))
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "arrow.2.squarepath")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(theme.textMuted)
                Text("@\(repost.authorUsername ?? repost.author)")
                    .font(.footnote)
                    .foregroundColor(theme.accentText(repost.authorColor))
                Spacer()
                Image(systemName: "chevron.forward")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textMuted)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .buttonStyle(PlainButtonStyle())
        .accessibilityLabel(String(format: String(localized: "a11y.post.repost_author", defaultValue: "Publication repartagée de %@", bundle: .main), repost.author))
        .accessibilityHint(String(localized: "a11y.post.repost_author.hint", defaultValue: "Ouvre la publication d'origine", bundle: .main))
    }

    @ViewBuilder
    private func repostEmbed(_ repost: RepostContent, renderedItem: StoryItem) -> some View {
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
                    .accessibilityHidden(true)
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
                                    .accessibilityHidden(true)
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
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(format: String(localized: "a11y.post.repost_author", defaultValue: "Publication repartagée de %@", bundle: .main), repost.author))
            .accessibilityHint(String(localized: "a11y.post.repost_author.hint", defaultValue: "Ouvre la publication d'origine", bundle: .main))

            // Text content with translation support.
            // For STORY reposts the caption lives inside the canvas overlays
            // (rendered below via StoryReaderRepresentable) — suppress the
            // plain body here to avoid showing the same text twice, mirroring
            // the main-post guard (`if !post.isStory`) and `StoryRepostEmbedCell`.
            if !isStoryRepost, !repost.content.isEmpty {
                let repostDisplayContent = repostEffectiveContent(repost)
                Text(repostDisplayContent)
                    .font(.subheadline)
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(6)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 6)
                    .accessibilityLabel(String(format: String(localized: "a11y.post.repost_content", defaultValue: "Contenu repartagé : %@", bundle: .main), repostDisplayContent))

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

            // Story-type repost — render the canvas. Unmuted by default to match
            // the native story detail (RF3); a local mute toggle in the actions
            // bar (B3.6, Task E2) can silence it — `isCanvasMuted`. The SHARED
            // `storyCanvasContainer` brings the SAME off-screen + call-aware
            // pause wiring, so the repost canvas can't play with sound while
            // scrolled off-screen.
            if isStoryRepost {
                // Vue `2h` (#4086) — MÊME décision que le chemin natif.
                // Ce site appelait `storyCanvasContainer` directement, donc
                // sans aucune garde de contenu : une story republiée dont la
                // source est expirée ou sans asset rendait un rectangle NOIR,
                // là où la même story, native, affiche « Story indisponible ».
                // Le canvas suffisait à faire répondre `true` à la porte du
                // bouton muet, qui se montait par-dessus, prêt à piloter un
                // lecteur sans rien à jouer.
                //
                // `renderedItem` décrit bien CE contenu : `StoryItem(feedPost:)`
                // retombe sur la SOURCE d'une republication (`hasOwnContent`).
                storyCanvasOrPlaceholder(renderedItem: renderedItem) {
                    StoryReaderRepresentable(
                        repost: repost,
                        preferredContentLanguages: AuthManager.shared.currentUser?.preferredContentLanguages,
                        mute: isCanvasMuted,
                        isPaused: StoryDetailPlaybackPolicy.isPaused(visible: storyCanvasVisible, callActive: isCallActive)
                    )
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 8)
            } else if !repost.media.isEmpty {
                // Standard media attachments — owner is the CITED repost, not
                // the outer post: its audio's Now Playing card must show the
                // quoted author's name/avatar, not the outer post's.
                detailMediaSection(repost.media, owner: DetailMediaAuthor(repost: repost))
                    .padding(.horizontal, 12)
                    .padding(.bottom, 8)
            }

            // Lieu du post SOURCE — sticker cliquable, même surface plein
            // écran que le lieu du post porteur.
            if let place = repost.location {
                FeedPostLocationSticker(place: place) {
                    detailFullscreenPlace = BubbleFullscreenPlace(place: place)
                }
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
                    CoordinatedAudioPlayer(
                        attachmentId: repostAudio.id,
                        nowPlayingName: repost.author,
                        nowPlayingArtworkURL: repost.authorAvatarURL,
                        makeQueuedAudio: {
                            QueuedAudio(
                                attachmentId: repostAudio.id,
                                messageId: repost.id,
                                conversationId: repost.id,
                                fileUrl: repostAudio.fileUrl,
                                durationMs: repostAudio.duration ?? 0,
                                senderName: repost.author,
                                senderAvatarURL: repost.authorAvatarURL,
                                receivedAt: repost.timestamp
                            )
                        }
                    ) { external, onPlay in
                        AudioPlayerView(
                            attachment: repostAudio,
                            context: .feedPost,
                            accentColor: repost.authorColor,
                            transcription: nil,
                            availability: availability,
                            onDownload: onDownload,
                            externalPlayer: external,
                            onPlayRequest: onPlay
                        )
                    }
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
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(String(localized: "a11y.post.like", defaultValue: "J'aime", bundle: .main))
                    .accessibilityValue(LocalizedNumber.exact(repost.likes))
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
            MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
            ForEach(flags, id: \.self) { code in
                LanguageFlagChip(code: code, isActive: code == repostSecondaryLangCode) {
                    if code == origLang {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostActiveDisplayLangCode = code
                            repostSecondaryLangCode = nil
                        }
                    } else {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            repostSecondaryLangCode = repostSecondaryLangCode == code ? nil : code
                        }
                    }
                }
            }
            // Décorative ici : le repartage n'ouvre pas la liste des langues,
            // et les drapeaux voisins portent déjà l'information « traduit ».
            TranslationsBadge()
        }
    }

    // MARK: - Actions Bar

    @ViewBuilder
    private func actionsBar(_ post: FeedPost, renderedItem: StoryItem) -> some View {
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
EngagementGlyph(
                        outline: "heart",
                        filled: "heart.fill",
                        participated: detailIsLiked,
                        accentHex: accentColor,
                        activeTint: MeeshyColors.error,
                        // Cœur PLEIN dès qu'il existe des likes, contour accent
                        // seulement quand ils sont les miens.
                        inactiveTint: heartColor,
                        filledWhenInactive: detailLikeCount > 0,
                        size: 18
                    )
                    .scaleEffect(likeScale)
                        .opacity(postHeartInFlightIds.contains(postId) ? 0.5 : 1.0)
                    Text("\(detailLikeCount)")
                        .font(.caption.weight(.medium))
                        .foregroundColor(detailIsLiked ? MeeshyColors.error : (detailLikeCount > 0 ? Color(hex: accentColor) : theme.textMuted))
                        .contentTransition(.numericText())
                }
            }
            .disabled(postHeartInFlightIds.contains(postId))
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(detailIsLiked
                ? String(localized: "a11y.post.unlike", defaultValue: "Je n'aime plus", bundle: .main)
                : String(localized: "a11y.post.like", defaultValue: "J'aime", bundle: .main))
            .accessibilityValue(LocalizedNumber.exact(detailLikeCount))
            .accessibilityHint(String(localized: "a11y.post.like.hint", defaultValue: "Aimer cette publication", bundle: .main))

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                EngagementGlyph(
                    // Le repost est le seul des trois à changer de FAMILLE selon
                    // son état : flèches nues au repos, disque plein une fois
                    // reposté. Son contour est donc `.circle` — et c'est juste :
                    // il retrace le bord du glyphe AFFICHÉ. La règle proscrit
                    // l'anneau ajouté autour d'un glyphe qui n'en a pas, pas la
                    // famille `.circle` quand le glyphe EST un disque.
                    outline: "arrow.2.squarepath.circle",
                    filled: "arrow.2.squarepath.circle.fill",
                    // Au REPOS, les flèches nues — l'apparence d'origine. Sans
                    // ce paramètre, le repos aurait hérité du contour `.circle`
                    // et gagné un cercle qu'il n'avait pas.
                    inactiveSymbol: "arrow.2.squarepath",
                    participated: isPostReposted,
                    accentHex: accentColor,
                    activeTint: MeeshyColors.success,
                    inactiveTint: theme.textSecondary,
                    size: 18
                )
                .scaleEffect(isRepostInFlight ? 0.85 : 1.0)
                    .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isPostReposted)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isRepostInFlight)
            }
            .disabled(isRepostInFlight)
            .accessibilityLabel(String(localized: "a11y.post.repost", defaultValue: "Republier", bundle: .main))
            .accessibilityValue(isPostReposted ? String(localized: "a11y.post.reposted", defaultValue: "Republié", bundle: .main) : "")
            .accessibilityHint(String(localized: "a11y.post.repost.hint", defaultValue: "Republier ou citer cette publication", bundle: .main))
            .alert(String(localized: "feed.post.repost", defaultValue: "Repartager", bundle: .main), isPresented: $showRepostOptions) {
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
                EngagementGlyph(
                    outline: "bookmark",
                    filled: "bookmark.fill",
                    participated: isPostBookmarked,
                    accentHex: accentColor,
                    activeTint: MeeshyColors.warning,
                    inactiveTint: theme.textSecondary,
                    size: 18
                )
                .scaleEffect(isBookmarkInFlight ? 0.85 : 1.0)
                    .animation(.spring(response: 0.35, dampingFraction: 0.55), value: isPostBookmarked)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isBookmarkInFlight)
            }
            .disabled(isBookmarkInFlight)
            .accessibilityLabel(isPostBookmarked
                ? String(localized: "a11y.post.bookmark_remove", defaultValue: "Retirer des favoris", bundle: .main)
                : String(localized: "a11y.post.bookmark_add", defaultValue: "Ajouter aux favoris", bundle: .main))
            .accessibilityHint(String(localized: "a11y.post.bookmark.hint", defaultValue: "Enregistrer cette publication", bundle: .main))

            // Muet du canvas (B3.6, Task E2) — monté SI ET SEULEMENT SI une
            // piste existe (résolveur partagé E1, sur `renderedItem` HISSÉ par
            // l'appelant — pas une reconstruction locale, correctif revue
            // mineur #8) ET si un canvas est RÉELLEMENT rendu quelque part
            // dans `postDetailContent` (`detailCanvasIsRendered`, correctif
            // revue majeur #3) : l'annonce seule peut être vraie pour un post
            // NON-story portant son PROPRE fond (son emprunté, E1) sans
            // qu'aucun canvas ne rende — le bouton serait alors décoratif.
            let detailAnnouncement = BackgroundSoundBadge.announcement(for: renderedItem.storyEffects)
            if BackgroundSoundBadge.detailCanvasIsRendered(post: post, renderedItem: renderedItem),
               BackgroundSoundBadge.showsMuteButton(for: detailAnnouncement) {
                Spacer()

                Button {
                    isCanvasMuted.toggle()
                    HapticFeedback.light()
                } label: {
                    Image(systemName: BackgroundSoundBadge.muteIconName(isMuted: isCanvasMuted))
                        .font(.body)
                        .foregroundColor(theme.textSecondary)
                }
                .accessibilityLabel(isCanvasMuted
                    ? String(localized: "a11y.feed.post.sound.unmute", defaultValue: "Réactiver le son du fond", bundle: .main)
                    : String(localized: "a11y.feed.post.sound.mute", defaultValue: "Couper le son du fond", bundle: .main))
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
    }

    // MARK: - Media Views

    /// Auteur porteur d'un lot de médias affiché par `detailMediaSection` — le
    /// post EXTÉRIEUR affiché OU le repost CITÉ qu'il embarque. `post.media`
    /// et `repost.media` partagent le même rendu (`detailSingleMedia`) mais
    /// n'ont pas le même auteur : `FeedPost` et `RepostContent` sont deux
    /// types distincts sans protocole commun, d'où ce petit porteur minimal
    /// plutôt qu'un générique. Sans lui, l'audio d'un post CITÉ attribuait ses
    /// métadonnées Now Playing (nom/avatar/date/id) au post EXTÉRIEUR — même
    /// famille de bug que le snapshot d'auteur figé côté citation (commit
    /// `656d0b7e4`, "fix(gateway): fige l'auteur dans le snapshot d'un post cité").
    private struct DetailMediaAuthor {
        let id: String
        let author: String
        let authorAvatarURL: String?
        let timestamp: Date

        init(post: FeedPost) {
            id = post.id; author = post.author
            authorAvatarURL = post.authorAvatarURL; timestamp = post.timestamp
        }

        init(repost: RepostContent) {
            id = repost.id; author = repost.author
            authorAvatarURL = repost.authorAvatarURL; timestamp = repost.timestamp
        }
    }

    @ViewBuilder
    private func detailMediaSection(_ mediaList: [FeedMedia], owner: DetailMediaAuthor?) -> some View {
        let visualMedia = mediaList.filter { $0.type == .image || $0.type == .video }
        let audioMedia = mediaList.filter { $0.type == .audio }
        let docMedia = mediaList.filter { $0.type == .document }

        VStack(spacing: 8) {
            // Single media
            if mediaList.count == 1, let media = mediaList.first {
                detailSingleMedia(media, isPrimaryVideo: media.id == primaryAutoplayVideoId, owner: owner)
            } else {
                // Visual grid (multi-media videos render as tap-to-play thumbnails
                // here — they never autoplay).
                if !visualMedia.isEmpty {
                    detailVisualGrid(visualMedia)
                }
                // Audio players (never a video → never the primary autoplay video)
                ForEach(audioMedia) { media in
                    detailSingleMedia(media, isPrimaryVideo: false, owner: owner)
                }
                // Documents
                ForEach(docMedia) { media in
                    detailSingleMedia(media, isPrimaryVideo: false, owner: owner)
                }
            }
        }
    }

    /// The single video that autoplays on open (F2): deterministic own > repost.
    /// The first `.video` of the post's own media; if the post has no own video,
    /// the first `.video` of the repost's media. `nil` when neither has a video.
    /// Only this media id gets `autoplayOnAppear: true` — every other video stays
    /// tap-to-play so two videos (own + repost) never fight over the single
    /// `SharedAVPlayerManager` (last-to-appear-wins flicker / clobbered load).
    private var primaryAutoplayVideoId: String? {
        guard let post = displayPost else { return nil }
        if let own = post.media.first(where: { $0.type == .video }) { return own.id }
        if let reposted = post.repost?.media.first(where: { $0.type == .video }) { return reposted.id }
        return nil
    }

    @ViewBuilder
    private func detailSingleMedia(_ media: FeedMedia, isPrimaryVideo: Bool, owner: DetailMediaAuthor? = nil) -> some View {
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
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
            .accessibilityHint(String(localized: "a11y.post.media.open.hint", defaultValue: "Ouvrir en plein écran", bundle: .main))

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
                    // WS3.7 / D2 / F2 — detail media is a focused view: autoplay
                    // the PRIMARY video (with sound) on appear. The feed and every
                    // other call site keep the default (tap-to-play, muted). Only
                    // the primary video (deterministic own > repost, see
                    // `primaryAutoplayVideoId`) autoplays — a post + repost each
                    // with a video would otherwise both hit the single
                    // `SharedAVPlayerManager` and clobber each other.
                    autoplayOnAppear: isPrimaryVideo,
                    // F5 — detail = sound on. The mute intent is now an opaque SDK
                    // param; the product decision lives here, app-side.
                    autoplayMuted: false,
                    onDownload: onDownload,
                    onExpand: { openMediaFullscreen(media) }
                )
            }
            .frame(maxWidth: .infinity)
            .clipShape(RoundedRectangle(cornerRadius: 12))

        case .audio:
            let audioAttachment = media.toMessageAttachment()
            // Le PORTEUR réel de CE média (repost cité si `owner` vient de
            // `repostEmbed`, sinon le post extérieur) — jamais `displayPost`
            // en dur : ce serait le bug corrigé ici (audio d'un post cité
            // attribué au post extérieur sur la carte Now Playing).
            // Fallback `displayPost` seulement si l'appelant n'a authentiquement
            // rien fourni (défensif — les deux call sites actuels passent
            // toujours un `owner`).
            let resolvedOwner = owner ?? displayPost.map(DetailMediaAuthor.init(post:))
            AudioAvailabilityResolver(attachment: audioAttachment, autoDownload: true) { availability, onDownload in
                CoordinatedAudioPlayer(
                    attachmentId: audioAttachment.id,
                    nowPlayingName: resolvedOwner?.author ?? "",
                    nowPlayingArtworkURL: resolvedOwner?.authorAvatarURL,
                    makeQueuedAudio: {
                        QueuedAudio(
                            attachmentId: audioAttachment.id,
                            messageId: resolvedOwner?.id ?? audioAttachment.id,
                            conversationId: resolvedOwner?.id ?? audioAttachment.id,
                            fileUrl: audioAttachment.fileUrl,
                            durationMs: audioAttachment.duration ?? 0,
                            senderName: resolvedOwner?.author ?? "",
                            senderAvatarURL: resolvedOwner?.authorAvatarURL,
                            receivedAt: resolvedOwner?.timestamp ?? audioAttachment.createdAt
                        )
                    }
                ) { external, onPlay in
                    AudioPlayerView(
                        attachment: audioAttachment,
                        context: .feedPost,
                        accentColor: media.thumbnailColor,
                        transcription: media.transcription,
                        translatedAudios: media.translatedAudios,
                        onFullscreen: {
                            guard let post = displayPost else { return }
                            audioFullscreen = .fromFeed(
                                media: media,
                                author: ProfileSheetUser.from(feedPost: post),
                                originalLanguage: post.originalLanguage,
                                caption: post.content,
                                createdAt: post.timestamp,
                                // Même id que `makeQueuedAudio` ci-dessus (F2) :
                                // le plein écran de CETTE entité (repost cité
                                // ou post extérieur) doit être vu comme la
                                // même session coordinator.
                                conversationId: resolvedOwner?.id ?? audioAttachment.id
                            )
                        },
                        availability: availability,
                        onDownload: onDownload,
                        externalPlayer: external,
                        onPlayRequest: onPlay
                    )
                }
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
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(format: String(localized: "a11y.post.media.document", defaultValue: "Document : %@", bundle: .main), media.fileName ?? String(localized: "feed.post.detail.document", defaultValue: "Document", bundle: .main)))

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
                            .accessibilityElement(children: .ignore)
                            .accessibilityAddTraits(.isButton)
                            .accessibilityLabel(count > 4
                                ? String(format: String(localized: "a11y.post.media.more", defaultValue: "Voir les %d médias", bundle: .main), count)
                                : String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
                            .accessibilityHint(String(localized: "a11y.post.media.open.hint", defaultValue: "Ouvrir en plein écran", bundle: .main))
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
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(media.type == .video
            ? String(localized: "a11y.post.media.video", defaultValue: "Vidéo partagée", bundle: .main)
            : String(localized: "a11y.post.media.image", defaultValue: "Image partagée", bundle: .main))
        .accessibilityHint(String(localized: "a11y.post.media.open.hint", defaultValue: "Ouvrir en plein écran", bundle: .main))
    }

    private func openMediaFullscreen(_ media: FeedMedia) {
        guard media.type == .image || media.type == .video else { return }
        fullscreenMediaId = media.id
        showFullscreenGallery = true
        HapticFeedback.light()
    }

    // MARK: - Comments Header

    private var commentsHeader: some View {
        HStack(spacing: 6) {
            Text(String(localized: "feed.post.detail.comments", defaultValue: "Commentaires", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundColor(theme.textPrimary)

            Text("(\(displayPost?.commentCount ?? 0))")
                .font(.subheadline.weight(.bold))
                .foregroundColor(theme.textMuted)

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel(String(localized: "a11y.comment.section_header", defaultValue: "Commentaires", bundle: .main))
        .accessibilityValue(LocalizedNumber.exact(displayPost?.commentCount ?? 0))
    }

    // MARK: - Composer

    private var replyBannerView: AnyView? {
        // Mode ÉDITION : bandeau dédié (prioritaire sur la réponse).
        if let editing = viewModel.editingComment {
            return AnyView(
                HStack(spacing: 8) {
                    Image(systemName: "pencil")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(Color(hex: accentColor))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "feed.comments.editing", defaultValue: "Modification du commentaire", bundle: .main))
                            .font(.caption.weight(.semibold))
                            .foregroundColor(theme.textSecondary)
                        Text(editing.displayContent)
                            .font(.caption)
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                    Spacer()
                    Button {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                            viewModel.editingComment = nil
                            composerText = ""
                            commentEffects = .none
                            commentBlurEnabled = false
                        }
                    } label: {
                        Image(systemName: "xmark")
                            .font(.caption2.bold())
                            .foregroundColor(theme.textMuted)
                            .frame(width: 24, height: 24)
                            .background(Circle().fill(theme.mode.isDark ? Color.white.opacity(0.1) : Color.black.opacity(0.05)))
                    }
                    .accessibilityLabel(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
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
            )
        }
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
        )
    }

    private var composer: some View {
        UniversalComposerBar(
            style: .light,
            mode: .comment,
            onIngest: { ingests in handleComposerIngest(ingests) },
            accentColor: accentColor,
            secondaryColor: composerSecondaryColor,
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onFocusChange: { composerIsFocused = $0 },
            onSendMessage: { text, attachments, _ in submitComment(text: text, attachments: attachments) },
            onLocationRequest: { showCommentLocationPicker = true },
            textBinding: $composerText,
            replyBanner: replyBannerView,
            customAttachmentsPreview: (commentAttachments.isEmpty && pendingPlace == nil)
                ? nil
                : AnyView(CommentAttachmentsTray(attachments: commentAttachments, onRemove: { id in
                    commentAttachments.removeAll { $0.id == id }
                  }, place: pendingPlace, onRemovePlace: { pendingPlace = nil })),
            onTextChange: { text in
                mentionController.handleQuery(in: text)
                CommentDraftStore.shared.save(postId: postId, text: text)
            },
            onStartRecording: { startCommentRecording() },
            onStopRecordingToAttachment: { stopCommentRecordingToAttachment() },
            onSendRecording: { stopAndSendCommentRecording() },
            onCancelRecording: { audioRecorder.cancelRecording() },
            externalIsRecording: audioRecorder.isRecording,
            externalRecordingDuration: audioRecorder.duration,
            externalAudioLevels: audioRecorder.audioLevels,
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || pendingPlace != nil,
            onPhotoLibrary: { showCommentPhotoPicker = true },
            onFilePicker: { showCommentFilePicker = true },
            isBlurEnabled: $commentBlurEnabled,
            pendingEffects: $commentEffects,
            externalAttachments: commentAttachments,
            focusTrigger: $composerFocusTrigger
        )
        .photosPicker(
            isPresented: $showCommentPhotoPicker,
            selection: $commentPhotoItems,
            maxSelectionCount: 1,
            matching: .any(of: [.images, .videos])
        )
        .fileImporter(
            isPresented: $showCommentFilePicker,
            allowedContentTypes: [.item],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result {
                commentAttachments = CommentComposerStaging.fileAttachments(from: urls)
            }
        }
        .sheet(isPresented: $showCommentLocationPicker) {
            LocationPickerView(accentColor: accentColor) { place in
                pendingPlace = place
                showCommentLocationPicker = false
            }
        }
        .adaptiveOnChange(of: commentPhotoItems) { _, items in
            Task {
                commentAttachments = await CommentComposerStaging.photoAttachments(from: items)
                await MainActor.run { commentPhotoItems = [] }
            }
        }
    }

    // MARK: - Reply targeting

    /// Amorce une réponse. Répondre à une réponse (niveau 2) reste plat au niveau
    /// 2 (cf. `sendReply` : parentId = racine) ; on préremplit une @mention vers
    /// l'auteur ciblé pour qu'il soit notifié (`user_mentioned`) malgré le
    /// reparentage à la racine.
    private func beginReply(to target: FeedComment) {
        viewModel.replyingTo = target
        composerFocusTrigger = true
        // Retire la @mention auto-injectée d'une cible précédente avant d'en poser
        // une nouvelle (évite accumulation / mauvais auteur notifié).
        if let old = prefilledMention, composerText.hasPrefix(old) {
            composerText = String(composerText.dropFirst(old.count))
        }
        prefilledMention = nil
        guard target.parentId != nil,
              let username = target.authorUsername, !username.isEmpty else { return }
        let mention = "@\(username) "
        if !composerText.hasPrefix(mention) {
            composerText = mention + composerText
        }
        prefilledMention = mention
    }

    // MARK: - Comment send + voice (parity with feed/reels composer)

    /// Dépôt / collage arrivé par la bande du composer (`onIngest`) : textes
    /// fusionnés en UNE insertion (au curseur si le champ a le focus, sinon à
    /// la fin), fichiers routés vers le staging commentaire existant
    /// (spec 2026-07-30, lot 1).
    private func handleComposerIngest(_ ingests: [ComposerIngest]) {
        if let block = CommentComposerIngestion.mergedText(from: ingests) {
            if !(composerIsFocused && CommentComposerIngestion.insertAtCursor(block)) {
                composerText += block
            }
        }
        CommentComposerIngestion.stageFiles(
            CommentComposerIngestion.files(from: ingests),
            accentColor: accentColor
        ) { staged in
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                commentAttachments.append(contentsOf: staged)
            }
        }
    }

    private func submitComment(text: String, attachments: [ComposerAttachment]) {
        if let editing = viewModel.editingComment {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty || !editing.media.isEmpty else { return }
            let flags = commentEffects.flags.rawValue
                | (commentBlurEnabled ? MessageEffectFlags.blurred.rawValue : 0)
            viewModel.editingComment = nil
            composerText = ""
            commentEffects = .none
            commentBlurEnabled = false
            commentAttachments.removeAll()
            Task { await viewModel.updateComment(editing, content: trimmed, effectFlags: Int(flags)) }
            return
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let media = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()
        let place = pendingPlace
        pendingPlace = nil
        guard !trimmed.isEmpty || media != nil || place != nil else { return }
        let effects = commentEffects
        let blur = commentBlurEnabled
        commentEffects = .none
        commentBlurEnabled = false
        // Réponse plate à 2 niveaux (cf. sendReply) : reparente à la racine.
        let parentId = viewModel.replyingTo?.parentId ?? viewModel.replyingTo?.id
        let flags = effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0)
        let effectFlags = flags > 0 ? Int(flags) : nil
        Task {
            if let media {
                await viewModel.submitCommentWithMedia(trimmed, effectFlags: effectFlags, parentId: parentId, pendingMedia: media, location: place)
            } else if parentId != nil {
                await viewModel.sendReply(trimmed, effectFlags: effectFlags, location: place)
            } else {
                await viewModel.sendComment(trimmed, effectFlags: effectFlags, location: place)
            }
        }
    }

    private func startCommentRecording() {
        audioRecorder.startRecording()
        HapticFeedback.medium()
    }

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

    private func stopAndSendCommentRecording() {
        guard stopCommentRecordingToAttachment() else { return }
        submitComment(text: "", attachments: commentAttachments)
    }
}

// MARK: - Story canvas visibility preference keys

struct StoryCanvasFrameKey: PreferenceKey {
    static var defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) { value = nextValue() }
}

private struct ScrollViewportHeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
