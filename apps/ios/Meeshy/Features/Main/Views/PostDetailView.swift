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

    // `internal` et non `private` : les deux écrans d'absence vivent dans
    // `PostDetailView+AbsenceStates.swift`, et un `private` de portée FICHIER
    // les rendrait inaccessibles depuis une extension frère (piège documenté
    // dans `apps/ios/CLAUDE.md`, déjà payé sur `composerFocusTrigger`).
    @State private var showsReactionPalette = false
    @StateObject var viewModel = PostDetailViewModel()
    /// Autocomplétion @mention pour le composer de commentaire — contexte `.post`,
    /// donc le backend suggère l'auteur du post, les personnes ayant commenté, puis
    /// les contacts (parité avec `FeedCommentsSheet`).
    @StateObject var mentionController: MentionComposerController
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
    @EnvironmentObject var statusViewModel: StatusViewModel
    @EnvironmentObject var router: Router
    @State var showTranslationSheet = false
    @State var selectedProfileUser: ProfileSheetUser?
    @State private var likeScale: CGFloat = 1.0
    @State var secondaryLangCode: String? = nil
    @State var activeDisplayLangCode: String? = nil
    @State var fullscreenMediaId: String? = nil
    @State var showFullscreenGallery = false
    /// La scène par laquelle on ENTRE en plein écran depuis la mosaïque du
    /// détail (directive porteur 2026-09-06).
    @State var detailSceneIndex: Int = 0
    @State var audioFullscreen: AudioFullscreenSource?
    /// Lieu du post ouvert plein écran (sticker / carte de la page Detail).
    @State var detailFullscreenPlace: BubbleFullscreenPlace?
    /// Muet LOCAL du canvas story inline (natif OU repost-de-story, RF3) —
    /// B3.6, Task E2. Pilote `mute:` aux DEUX sites `StoryReaderRepresentable`
    /// (mutuellement exclusifs — un seul rend à la fois). Jamais
    /// `isGlobalMuted` du viewer story : surfaces indépendantes.
    @State var isCanvasMuted = false
    /// **Arrêt LOCAL de la lecture, commandé par le viewer** (#5602) — le
    /// troisième terme de `StoryDetailPlaybackPolicy`, servi aux TROIS chemins
    /// de rendu (mosaïque, mono-scène, republication) : « le bouton stop et
    /// play permet d'arrêter tout ou de poursuivre tout ». Distinct du muet,
    /// qui laisse la scène courir en silence.
    @State var isCanvasPaused = false
    @State var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State var commentBlurEnabled: Bool = false
    @State var commentEffects: MessageEffects = .none
    @State var composerFocusTrigger: Bool = false
    /// Focus réel du champ du composer — pilote l'insertion d'un texte déposé
    /// (au curseur quand le champ a le focus, sinon à la fin).
    @State var composerIsFocused: Bool = false
    /// Section de commentaire actuellement surlignée (cible d'une notification).
    @State var highlightedCommentId: String? = nil
    /// Garde-fou : ne défile vers la cible qu'une seule fois (les commentaires
    /// peuvent arriver après le premier rendu via le chargement paginé).
    @State var didScrollToTargetComment: Bool = false
    /// Latch de la chasse paginée (cible hors des pages chargées) — une seule
    /// chasse par présentation.
    @State var isHuntingTargetComment: Bool = false
    /// Texte du composer, lié au `UniversalComposerBar`. Permet de préremplir une
    /// @mention quand on répond à une réponse (niveau 2) — l'auteur ciblé est
    /// notifié via `user_mentioned` même si la réponse est reparentée à la racine.
    @State var composerText: String = ""
    /// @mention auto-injectée par `beginReply` (réponse à une réponse) — suivie
    /// pour la retirer proprement si on change de cible sans envoyer.
    @State var prefilledMention: String? = nil
    // Comment attachments + real voice capture (parity with feed/reels composer).
    @State var commentAttachments: [ComposerAttachment] = []
    @State var showCommentPhotoPicker: Bool = false
    @State var commentPhotoItems: [PhotosPickerItem] = []
    @State var showCommentFilePicker: Bool = false
    @State var showCommentLocationPicker: Bool = false
    /// Lieu choisi via le picker, en attente d'envoi — transporté jusqu'au
    /// commentaire à l'envoi (contrairement à `FeedCommentsSheet`, dont le
    /// transport arrive dans une tâche ultérieure du plan).
    @State var pendingPlace: SharedPlace? = nil
    @StateObject var audioRecorder = AudioRecorderManager()
    @State private var isTextExpanded = false
    @State var headerScrollRelay = ScrollOffsetRelay()
    // Inline story canvas playback gating (audio active → pause when off-screen / in call).
    @State var storyCanvasVisible: Bool = true
    @State var isCallActive: Bool = false
    @State var sceneMeasures = PostDetailSceneFraming.Measures()
    nonisolated static let scrollSpace = "postDetailScroll"
    /// Set once `PostService.share(... generateLink: true)` returns — the
    /// `.sheet(item:)` further down presents the system share UI as soon
    /// as this becomes non-nil and clears it on dismiss.
    @State var shareableLink: ShareableLink?


    // Post reaction state — socket-driven, hoisted to this view (single-post context).
    // PostDetailView joins the post:{postId} room on appear and leaves on disappear,
    // enabling real-time reaction updates from other users.
    @State var postLikedIds: Set<String> = []
    @State var postLikeDelta: [String: Int] = [:]
    @State var postHeartInFlightIds: Set<String> = []

    // Bookmark / repost optimistic state — same pattern as FeedView.
    @State var isPostBookmarked: Bool = false
    @State var isBookmarkInFlight: Bool = false
    @State var isPostReposted: Bool = false
    @State var isRepostInFlight: Bool = false
    @State private var showRepostOptions: Bool = false
    @State var isEditing: Bool = false
    /// Flux « Enregistrer en local » du menu « … » — déclenché uniquement
    /// quand le post a un média (sinon Enregistrer bascule le favori in-app).
    @StateObject var mediaSaveCoordinator = MediaSaveCoordinator(exitGate: .open)

    private var detailIsLiked: Bool { postLikedIds.contains(postId) }
    private var detailLikeCount: Int {
        guard let post = displayPost else { return 0 }
        return max(0, post.likes + (postLikeDelta[postId] ?? 0))
    }

    private struct BookmarkRESTPayload: Decodable { let bookmarked: Bool? }


    // MARK: - Bookmark / Repost / Share (post detail)

    @MainActor
    func toggleDetailBookmark() {
        guard !isBookmarkInFlight else { return }
        let wasBookmarked = isPostBookmarked
        isPostBookmarked.toggle()
        isBookmarkInFlight = true
        Task {
            defer { Task { @MainActor in isBookmarkInFlight = false } }
            let ok: Bool = await {
                do {
                    let _: APIResponse<BookmarkRESTPayload> = try await APIClient.shared.request(
                        PostsEndpoint.byPostIdBookmark(postId: postId),
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
    /// du post, aiguillé par `PostSaveRoute` (#9681) — gardé par `canSaveMedia`.
    func requestSaveMedia() {
        guard let post = displayPost else { return }
        PostSaveAction.perform(post, coordinator: mediaSaveCoordinator)
    }

    var canSaveMedia: Bool {
        displayPost.map { PostSaveAction.route(for: $0, coordinator: mediaSaveCoordinator) != .unavailable } ?? false
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
                FeedbackToastManager.shared.showSuccess(String(localized: "post.repost.label", defaultValue: "Repartage"))
            } catch {
                isPostReposted = false
                FeedbackToastManager.shared.showError(String(localized: "post.repost.error", defaultValue: "Erreur lors du repost", bundle: .main))
            }
        }
    }

    var displayPost: FeedPost? { viewModel.post ?? initialPost }

    /// Non `private` : `PostDetailView+Canvas.swift` en a besoin pour monter la
    /// mosaïque de scènes. Un `private` sur une propriété d'une `View` la rend
    /// inaccessible depuis un fichier d'extension du MÊME module — piège
    /// documenté au `CLAUDE.md` d'`apps/ios`.
    var accentColor: String {
        displayPost?.authorColor ?? "6366F1"
    }

    /// Second arrêt du dégradé servi au composer de commentaire. Dérivé de
    /// l'accent du post par la formule de palette du SDK
    /// (`secondary = shiftHue(primary, +30°)`) : sans lui, le composer
    /// retombe sur son défaut de marque et le bouton d'envoi rend un dégradé
    /// hybride accent → indigo.
    var composerSecondaryColor: String {
        DynamicColorGenerator.hueShiftedHex(accentColor, degrees: 30)
    }

    /// True when the signed-in user authored this post — gates the private reach
    /// stats (vues + impressions) shown next to the @handle, mirroring the feed
    /// and reel cards where analytics are author-only.
    var isPostAuthor: Bool {
        guard let me = AuthManager.shared.currentUser?.id, let post = displayPost else { return false }
        return me == post.authorId
    }


    // Scrollable post-detail content (text, media, repost, actions, comments).
    // Extracted from `body` into its own @ViewBuilder unit so the Swift
    // type-checker stays within budget — inlining the threaded-comment
    // ForEach made `body` exceed the reasonable type-check time.
    @ViewBuilder
    private func postDetailContent(_ post: FeedPost,
                                   scrollProxy: ScrollViewProxy) -> some View {
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
        // **La scène se rend parce que le post en PORTE une, pas parce qu'il
        // est une story** (constat porteur 2026-09-06). `post.isStory` était
        // ici une question de TYPE là où le fil pose, lui, une question de
        // CONTENU (`post.storyEffects?.canvasV3`) — d'où un POST à scène
        // peint dans le fil et ABSENT du détail. Le prédicat est partagé avec
        // la porte du bouton muet : voir `BackgroundSoundBadge`.
        if BackgroundSoundBadge.rendersOwnCanvas(post) {
            storyCanvasSection(post, renderedItem: renderedItem)
        } else if post.hasMedia, !isSharedStory {
            detailMediaSection(post.media, owner: DetailMediaAuthor(post: post))
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.top, MeeshySpacing.sm)
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
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.sm)
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
        actionsBar(post, renderedItem: renderedItem, scrollProxy: scrollProxy)

        // Separator + Comments (ZONE 3)
        Rectangle()
            .fill(theme.inputBorder.opacity(0.5))
            .frame(height: 1)
            .padding(.horizontal, MeeshySpacing.lg)

        commentsHeader
            .id("commentsSection")

        // Comments (threaded)
        ForEach(viewModel.topLevelComments) { comment in
            PostDetailCommentThread(
                comment: comment, post: displayPost, postId: postId,
                accentColor: accentColor, highlightedCommentId: highlightedCommentId,
                onReply: { target in beginReply(to: target) },
                onEditComment: { target in beginEditComment(target) },
                viewModel: viewModel
            )
            // Anchor for notification-driven navigation: scroll/highlight targets
            // the top-level section. For a reply, the parent thread is expanded so
            // the reply becomes visible right below this anchor.
            .id("comment-\(comment.id)")
        }

        if viewModel.isLoadingComments {
            ProgressView()
                .padding()
        }

        // **`hasMoreComments` vaut « je ne sais pas encore », pas « il y en a
        // plus ».** Il est initialisé à `true` À DESSEIN — sans quoi la
        // pagination se bloquerait pour la session (cf. `loadMoreComments`) —
        // mais cet état d'IGNORANCE affichait « Charger plus » sous un
        // « Commentaires (0) », mesuré au simulateur le 2026-09-02. Un bouton
        // qui propose de charger ce qui n'existe pas est un contrôle sans
        // matière (loi 4).
        //
        // > Un booléen initialisé à `true` pour ne rien bloquer porte DEUX sens
        // > — « inconnu » et « oui » — et l'affichage lit toujours le second.
        // > Ce qui manque n'est pas une garde de plus : c'est que le tri-état
        // > ait été écrasé en booléen à sa déclaration.
        //
        // La liste VIDE tranche sans toucher à la pagination : « charger PLUS »
        // n'a de sens qu'après un premier lot. Le chargement initial est
        // automatique, donc une liste vide après lui signifie zéro.
        if viewModel.hasMoreComments == true && !viewModel.isLoadingComments && !viewModel.comments.isEmpty {
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
        detailPresentations(heartLiveSync(detailScreen))
    }

    private var detailScreen: some View {
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
                                    postDetailContent(post, scrollProxy: scrollProxy)
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
                        // Par `onGeometryChange` : une préférence ne délivrait ici que `.zero` (#6708).
                        .onGeometryChange(for: CGSize.self) { $0.size } action: { sceneMeasures = sceneMeasures.recordingViewport($0, composerIsFocused: composerIsFocused) }
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
                        .keepsReplyTargetInView(viewModel.replyingTo?.id, proxy: scrollProxy)
                        .onReceive(CallManagerHost.shared.callStatePublisher) { state in
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
                // Ni post, ni chargement. Cette branche n'existait pas —
                // l'écran rendait une PAGE BLANCHE surmontée d'un composeur de
                // commentaire, sans en-tête donc sans bouton retour. C'est
                // exactement où atterrit un `/l/<token>` de story expirée, le
                // cas le plus fréquent de ces liens (toute story meurt à 24 h).
                //
                // Elle disait ensuite « ce contenu n'est plus disponible » pour
                // les DEUX causes : la cible a disparu, ou la requête a échoué.
                // Le second cas est un MENSONGE — l'écran affirme une
                // suppression qui n'a pas eu lieu et n'offre que « Retour »,
                // retirant la seule action utile : réessayer (#4903).
                absenceState
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
                    composer.foldableComment(isReplying: viewModel.replyingTo != nil)
                }
                .animation(.spring(response: 0.3, dampingFraction: 0.8), value: mentionController.activeQuery != nil)
            }
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .navigationBarHidden(true)
        .task { await openDetail() }
        .onDisappear { closeDetail() }
        .trackEngagement(postId: postId, contentType: .post, surface: .detail)
    }

    // MARK: - Post Menu

    /// The `…` menu, lifted out of the old navBar into the header's trailing slot.
    var postMenu: some View {
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
                if canSaveMedia {
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
                    canSaveMedia
                        ? String(localized: "feed.reel.save_media", defaultValue: "Sauvegarder", bundle: .main)
                        : (isPostBookmarked
                            ? String(localized: "a11y.post.bookmark_remove", defaultValue: "Retirer des favoris", bundle: .main)
                            : String(localized: "feed.post.save", defaultValue: "Enregistrer", bundle: .main)),
                    systemImage: canSaveMedia
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
                PublicationDestructiveMenuItems(postId: postId, onDelete: { _ in
                    Task { if await viewModel.deletePost(postId) { router.pop() } }
                }, onRemove: nil)
            } else {
                if let post = displayPost {
                    PublicationDestructiveMenuItems(postId: postId, onDelete: nil, onRemove: ContentRemovalOffer.publication(for: post) { [viewModel, router] in
                        if await viewModel.deletePost($0, reason: $1) { router.pop() }
                    })
                }
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
            HStack(spacing: MeeshySpacing.xs) {
                if hasUsername {
                    Text("@\(username)")
                        .font(.caption)
                        .foregroundColor(theme.textSecondary)
                }
                if isPostAuthor {
                    if hasUsername {
                        MetaSeparator().font(.caption2).foregroundColor(theme.textMuted)
                    }
                    HStack(spacing: MeeshySpacing.xxs) {
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
            HStack(spacing: MeeshySpacing.md) {
                MeeshyAvatar(
                    name: post.author,
                    context: .postAuthor,
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL,
                    moodEmoji: statusViewModel.statusForUser(userId: post.authorId)?.moodEmoji,
                    presenceState: PresenceManager.shared.knownPresenceState(for: post.authorId),
                    ring: post.authorRing,
                    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                    onMoodTap: statusViewModel.moodTapHandler(for: post.authorId),
                    contextMenuItems: [
                        AvatarContextMenuItem(label: String(localized: "feed.post.detail.view_profile", defaultValue: "Voir le profil", bundle: .main), icon: "person.fill") {
                            selectedProfileUser = .from(feedPost: post)
                        }
                    ]
                )
                .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
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

                    HStack(spacing: MeeshySpacing.xs) {
                        PostDateWithPoints(postId: post.id, seed: post.viewerPoints, color: theme.textMuted) { Text(post.timestamp, style: .relative) }

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
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.smPlus)

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
            VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
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
            .padding(.horizontal, MeeshySpacing.lg)
            .onTapGesture {
                if truncation.isTruncated {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        isTextExpanded.toggle()
                    }
                    if isTextExpanded {
                        // L'ouverture du détail a déjà compté sa vue
                        // (`registerDetailOpen`) : déplier le texte n'en est
                        // pas une seconde (#10483, viewCount = total).
                        EngagementTracker.shared.recordAction(.expandedText, surface: .detail)
                    }
                }
            }

            // Inline secondary translation panel
            if let content = secondaryContent, let code = secondaryLangCode {
                PostDetailSecondaryTranslationPanel(content: content, code: code)
            }

            // Embed vidéo (YouTube) détecté dans le contenu du post.
            if let embeddedVideo {
                VideoEmbedContainer(video: embeddedVideo, accent: Color(hex: accentColor), trackedURL: embedTrackedURL)
                    .padding(.horizontal, MeeshySpacing.lg)
                    .padding(.top, MeeshySpacing.sm)
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
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.top, MeeshySpacing.xsPlus)
        }
    }

    // MARK: - Repost Embed

    @State var repostSecondaryLangCode: String? = nil
    @State var repostActiveDisplayLangCode: String? = nil


    // MARK: - Actions Bar

    @ViewBuilder
    private func actionsBar(_ post: FeedPost,
                            renderedItem: StoryItem,
                            scrollProxy: ScrollViewProxy) -> some View {
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
                HStack(spacing: MeeshySpacing.xs) {
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
            .engagementHitArea()
            .disabled(postHeartInFlightIds.contains(postId))
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(detailIsLiked
                ? String(localized: "a11y.post.unlike", defaultValue: "Je n'aime plus", bundle: .main)
                : String(localized: "a11y.post.like", defaultValue: "J'aime", bundle: .main))
            .accessibilityValue(LocalizedNumber.exact(detailLikeCount))
            .accessibilityHint(String(localized: "a11y.post.like.hint", defaultValue: "Aimer cette publication", bundle: .main))
            // Le GESTE vit sur le bouton, la PALETTE sur la barre entière : un
            // overlay ancré à un bouton de 28 pt s'y trouve comprimé, et la
            // rangée d'émojis n'a pas la place de se dessiner — mesuré au
            // simulateur, elle s'ouvrait en pilule vide. La cible du geste et
            // le cadre du contenu ne sont pas le même objet.
            .reactionPaletteTrigger(isPresented: $showsReactionPalette)

            Spacer()

            // **Commentaires — le deuxieme item de la cible `2h`** (#4086).
            //
            // La rangee du detail n'en portait que trois (coeur, repost,
            // signet) la ou la carte du fil en porte cinq et la cible quatre.
            // Le lecteur qui cherchait le nombre de commentaires devait
            // defiler dans un cas et pas dans l'autre — meme publication, deux
            // rangees.
            //
            // Il AGIT : le tap amene a la section, deja ancree
            // `.id("commentsSection")` et deja visee par
            // `attemptScrollToTargetComment`. Un item de comptage sans effet
            // aurait fait mentir la rangee entiere (loi 4) — les trois autres
            // agissent.
            Button {
                HapticFeedback.light()
                withAnimation { scrollProxy.scrollTo("commentsSection", anchor: .top) }
            } label: {
                HStack(spacing: MeeshySpacing.xs) {
                    let n = displayPost?.commentCount ?? 0
                    EngagementGlyph(
                        outline: "bubble.right",
                        filled: "bubble.right.fill",
                        participated: false,
                        accentHex: accentColor,
                        activeTint: Color(hex: accentColor),
                        inactiveTint: n > 0 ? Color(hex: accentColor) : theme.textSecondary,
                        filledWhenInactive: n > 0,
                        size: 18
                    )
                    if n > 0 {
                        Text("\(n)")
                            .font(.caption.weight(.medium))
                            .foregroundColor(Color(hex: accentColor))
                            .contentTransition(.numericText())
                    }
                }
            }
            .engagementHitArea()
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(String(localized: "a11y.post.comments",
                                       defaultValue: "Commentaires", bundle: .main))
            .accessibilityValue(LocalizedNumber.exact(displayPost?.commentCount ?? 0))
            .accessibilityHint(String(localized: "a11y.post.comments.hint",
                                      defaultValue: "Aller aux commentaires", bundle: .main))

            Spacer()

            // Repost
            Button {
                showRepostOptions = true
                HapticFeedback.light()
            } label: {
                EngagementGlyph(
                    // Les flèches nues dans les deux états, comme le fil et le
                    // réel : `arrow.2.squarepath.circle(.fill)` n'existe pas au
                    // catalogue SF Symbols, l'état reposté se peignait vide
                    // (#8939). Le reposté se lit à sa teinte et à son contour
                    // d'accent.
                    outline: "arrow.2.squarepath",
                    filled: "arrow.2.squarepath",
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
            .engagementHitArea()
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
            .engagementHitArea()
            .disabled(isBookmarkInFlight)
            .accessibilityLabel(isPostBookmarked
                ? String(localized: "a11y.post.bookmark_remove", defaultValue: "Retirer des favoris", bundle: .main)
                : String(localized: "a11y.post.bookmark_add", defaultValue: "Ajouter aux favoris", bundle: .main))
            .accessibilityHint(String(localized: "a11y.post.bookmark.hint", defaultValue: "Enregistrer cette publication", bundle: .main))

            // Plus de baffle ici (#9677, directive porteur 2026-10-08) : c'est la
            // NOTE du crédit, au-dessus de la scène, qui coupe le son de fond.
        }
        .padding(.horizontal, MeeshySpacing.xl)
        .padding(.vertical, MeeshySpacing.smPlus)
        // Le CADRE de la palette est ici, sur la barre ENTIÈRE : elle a la
        // largeur qu'une rangée de six émojis demande. Le geste, lui, reste
        // sur le bouton — cible petite et précise, cadre large et libre.
        .reactionPaletteFrame(isPresented: $showsReactionPalette,
                              isDark: theme.mode.isDark,
                              anchor: .bottomLeading,
                              offsetY: -46) { sendDetailReaction($0) }
    }

    // MARK: - Comments Header

    private var commentsHeader: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Text(String(localized: "feed.post.detail.comments", defaultValue: "Commentaires", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundColor(theme.textPrimary)

            Text("(\(displayPost?.commentCount ?? 0))")
                .font(.subheadline.weight(.bold))
                .foregroundColor(theme.textMuted)

            Spacer()
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.sm)
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isHeader)
        .accessibilityLabel(String(localized: "a11y.comment.section_header", defaultValue: "Commentaires", bundle: .main))
        .accessibilityValue(LocalizedNumber.exact(displayPost?.commentCount ?? 0))
    }

}
