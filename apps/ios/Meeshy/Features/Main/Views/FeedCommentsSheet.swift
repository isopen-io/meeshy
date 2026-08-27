import SwiftUI
import Combine
import PhotosUI
import UniformTypeIdentifiers
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
    /// Édite un commentaire (contenu + effets visuels). Même règle
    /// d'éligibilité que la suppression : auteur uniquement.
    var onEditComment: ((FeedComment) -> Void)? = nil
    /// Demande la traduction d'un commentaire vers la langue préférée du
    /// lecteur — câblé par l'hôte (sheet / détail) vers le endpoint on-demand.
    var onRequestTranslation: ((FeedComment) -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState? = nil
    var replyMoodResolver: ((String) -> String?)? = nil
    var replyStoryResolver: ((String) -> StoryRingState)? = nil
    var replyPresenceResolver: ((String) -> PresenceState?)? = nil
    /// Vrai quand le serveur a d'autres pages de réponses au-delà de celles
    /// chargées (le endpoint replies est paginé à 20). Affiche le bouton
    /// « Voir plus de réponses » en bas du fil déplié.
    var hasMoreReplies: Bool = false
    var onLoadMoreReplies: (() async -> Void)? = nil
    /// Réponse surlignée (cible d'une notification). Le tint de section reste
    /// porté par le parent ; ici on teinte la rangée de la RÉPONSE ciblée.
    var highlightedCommentId: String? = nil

    private var theme: ThemeManager { ThemeManager.shared }

    /// Renvoie un handler de suppression pour `c` SEULEMENT si l'utilisateur
    /// courant en est l'auteur — sinon `nil` (l'item « Supprimer » disparaît).
    private func deleteHandler(for c: FeedComment) -> (() -> Void)? {
        guard let onDeleteComment,
              let me = AuthManager.shared.currentUser?.id, !me.isEmpty,
              c.authorId == me else { return nil }
        return { onDeleteComment(c) }
    }

    /// Même éligibilité que `deleteHandler` : l'item « Modifier » n'apparaît
    /// que sur les commentaires de l'utilisateur courant.
    private func editHandler(for c: FeedComment) -> (() -> Void)? {
        guard let onEditComment,
              let me = AuthManager.shared.currentUser?.id, !me.isEmpty,
              c.authorId == me else { return nil }
        return { onEditComment(c) }
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
                onEditComment: editHandler(for: comment),
                onRequestTranslation: onRequestTranslation.map { handler in { handler(comment) } },
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
                        onEditComment: editHandler(for: reply),
                        onRequestTranslation: onRequestTranslation.map { handler in { handler(reply) } },
                        moodEmoji: replyMoodResolver?(reply.authorId),
                        storyState: replyStoryResolver?(reply.authorId) ?? .none,
                        presenceState: replyPresenceResolver?(reply.authorId) ?? nil
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
                        onEditComment: editHandler(for: reply),
                        onRequestTranslation: onRequestTranslation.map { handler in { handler(reply) } },
                        moodEmoji: replyMoodResolver?(reply.authorId),
                        storyState: replyStoryResolver?(reply.authorId) ?? .none,
                        presenceState: replyPresenceResolver?(reply.authorId) ?? nil
                    )
                    .padding(.leading, 36)
                    // Même style que le tint de section (les deux appelants) —
                    // au niveau de la rangée pour cibler UNE réponse précise.
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: accentColor).opacity(highlightedCommentId == reply.id ? 0.12 : 0))
                    )
                    .animation(.easeInOut(duration: 0.4), value: highlightedCommentId)
                    // Ancre de scroll par RÉPONSE (le ciblage notification peut
                    // viser une réponse, pas seulement la section parente).
                    .id("comment-\(reply.id)")
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }

                if hasMoreReplies, let onLoadMoreReplies {
                    Button {
                        HapticFeedback.light()
                        Task { await onLoadMoreReplies() }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.down")
                                .font(MeeshyFont.relative(10, weight: .bold))
                            Text(String(localized: "feed.comments.load_more_replies", defaultValue: "Voir plus de réponses", bundle: .main))
                                .font(MeeshyFont.relative(12, weight: .semibold))
                        }
                        .foregroundColor(Color(hex: accentColor))
                    }
                    .frame(minHeight: 44)
                    .padding(.leading, 36)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel(String(localized: "a11y.comment.load_more_replies", defaultValue: "Charger plus de réponses", bundle: .main))
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
    // Chrome social par EnvironmentValues, JAMAIS par @EnvironmentObject : cette
    // vue est toujours présentée en feuille, et une feuille n'hérite pas des
    // EnvironmentObject de son présentateur (cf. SocialChromeEnvironment.swift).
    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyStoryRingResolver) private var storyRingResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver
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
    /// Curseur de pagination du GET commentaires — suivi pour la chasse
    /// paginée d'un commentaire notifié hors de la première page.
    @State private var commentsNextCursor: String?
    @State private var commentsHasMore: Bool = false
    @State private var isHuntingTargetComment: Bool = false
    @State private var composerLanguage: String = DefaultComposerLanguage.resolve()
    @State private var commentBlurEnabled: Bool = false
    @State private var commentEffects: MessageEffects = .none
    /// Commentaire en cours d'ÉDITION (auteur uniquement). Non-nil ⇒ le
    /// composer soumet un PATCH (contenu + effets) au lieu d'une création.
    @State private var editingComment: FeedComment?
    @State private var composerFocusTrigger: Bool = false
    /// Focus réel du champ du composer — pilote l'insertion d'un texte déposé
    /// (au curseur quand le champ a le focus, sinon à la fin).
    @State private var composerIsFocused: Bool = false
    /// Vrai si C'EST CETTE FEUILLE qui a déclaré le post actif (présentation
    /// depuis le feed). Depuis un hôte qui l'avait déjà déclaré (viewer de
    /// réels), la feuille ne revendique rien et ne relâche rien à sa
    /// fermeture — l'ordre onDismiss/onDisappear devient indifférent.
    @State private var claimedActivePost: Bool = false
    @State private var repliesMap: [String: [FeedComment]] = [:]
    @State private var expandedThreads: Set<String> = []
    @State private var loadingReplies: Set<String> = []
    /// Pagination des réponses par commentaire racine (endpoint replies paginé
    /// ASC 20/page) — miroir de `PostDetailViewModel.repliesHasMore/NextCursor`.
    @State private var repliesHasMore: [String: Bool] = [:]
    @State private var repliesNextCursor: [String: String] = [:]

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
    /// Lieu choisi via le picker, en attente d'envoi (Task 11/12, 2026-07-29).
    /// `SharedPlace` porte le nom ; la fabrique `ComposerAttachment.location`
    /// ne le portait pas, n'était plus le véhicule, et a été retirée (248i).
    @State private var commentPendingPlace: SharedPlace? = nil
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

    /// Second arrêt du dégradé servi au composer de commentaire. Dérivé de
    /// l'accent de l'hôte par la formule de palette du SDK
    /// (`secondary = shiftHue(primary, +30°)`) : sans lui, le composer retombe
    /// sur son défaut de marque et le bouton d'envoi rend un dégradé hybride
    /// accent → indigo.
    private var composerSecondaryColor: String {
        DynamicColorGenerator.hueShiftedHex(accentColor, degrees: 30)
    }

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

    /// Ne JAMAIS persister une ligne optimiste non confirmée (id `cmid_`/`tmp_`) :
    /// une fois la ligne réconciliée en mémoire par l'écho socket, le fantôme
    /// resterait en cache pour toujours — `mergeFetchedComments` le garde en
    /// tête à chaque relecture puisque le serveur ne le renverra jamais.
    static func persistableComments(_ comments: [FeedComment]) -> [FeedComment] {
        comments.filter { !$0.id.hasPrefix("cmid_") && !$0.id.hasPrefix("tmp_") }
    }

    /// Une réécriture de cache commentaires : la clé et son contenu déjà filtré.
    struct CommentCacheWrite {
        let key: String
        let comments: [FeedComment]
    }

    /// Clés à réécrire après une mutation de commentaire DÉJÀ appliquée en
    /// mémoire. PURE : `CommentsSheetView` est une `View` à `@State`, donc non
    /// instrumentable — la décision « quelles clés porter, et lesquelles TAIRE »
    /// vit ici pour être testable.
    ///
    /// Deux gardes, reprises telles quelles de `submitCommentEdit` :
    /// - `post-<postId>` n'est écrit QUE si l'appelant fournit `liveComments`.
    ///   Un sink peut tirer AVANT que `.task { loadFullCommentsIfNeeded() }`
    ///   n'ait chargé la page complète : persister le repli `post.comments`
    ///   (les 3 commentaires que le feed embarque) écraserait la page de 20
    ///   déjà écrite sous la même clé par `PostDetailViewModel` / `FeedViewModel`.
    /// - `replies-<parentId>` n'est écrit que pour un fil MONTÉ dans
    ///   `repliesMap`. La clé orpheline `replies-<commentId>` d'un top-level
    ///   supprimé n'est jamais écrite : plus rien ne la relira, son parent
    ///   n'existe plus.
    static func commentCacheWrites(
        postId: String,
        liveComments: [FeedComment]?,
        repliesMap: [String: [FeedComment]],
        touchedThreadIds: [String]
    ) -> [CommentCacheWrite] {
        let threads = touchedThreadIds.compactMap { parentId -> CommentCacheWrite? in
            guard let replies = repliesMap[parentId] else { return nil }
            return CommentCacheWrite(key: "replies-\(parentId)", comments: persistableComments(replies))
        }
        guard let current = liveComments else { return threads }
        return threads + [CommentCacheWrite(key: "post-\(postId)", comments: persistableComments(current))]
    }

    /// Réécrit le cache après une mutation reçue À DISTANCE — ce que le
    /// doc-comment de `loadFullCommentsIfNeeded` affirmait déjà (« la
    /// modification invalide le cache par réécriture ») alors qu'aucun sink ne
    /// le faisait : seules les écritures LOCALES persistaient.
    ///
    /// `topLevelWasLoaded` est capturé AVANT la mutation : les `apply…`
    /// promeuvent `post.comments` dans `liveComments` dès que la ligne touchée
    /// s'y trouve, donc relire `liveComments != nil` après coup ne dirait plus
    /// si la page complète avait été chargée.
    private func persistCommentCache(touchedThreadIds: [String], topLevelWasLoaded: Bool) {
        let writes = Self.commentCacheWrites(
            postId: post.id,
            liveComments: topLevelWasLoaded ? liveComments : nil,
            repliesMap: repliesMap,
            touchedThreadIds: touchedThreadIds
        )
        guard !writes.isEmpty else { return }
        Task {
            for write in writes {
                try? await CacheCoordinator.shared.comments.savePreservingFreshness(write.comments, for: write.key)
            }
        }
    }

    /// Réconciliation par l'agrégat absolu d'un événement cœur de commentaire —
    /// pose `likes = count` (top-level ou réponse), purge le delta optimiste et
    /// dérive « mon cœur » de la liste des réacteurs. Miroir de
    /// `PostDetailViewModel.applyCommentReactionAggregate`.
    private func applyCommentReactionAggregate(commentId: String, count: Int, reactorUserIds: [String], actorUserId: String) {
        var resolvedCount = count
        if let myId = AuthManager.shared.currentUser?.id {
            if reactorUserIds.contains(myId) {
                likedIds.insert(commentId)
            } else if actorUserId == myId {
                // L'événement décrit MA propre action (cet appareil ou un
                // autre) : l'agrégat est autoritatif pour mon cœur.
                likedIds.remove(commentId)
            } else if likedIds.contains(commentId) {
                // Événement d'un TIERS pendant que MON like est encore en vol :
                // son agrégat ne me connaît pas — préserver le cœur et compter
                // le mien par-dessus (l'écho de mon propre like reconfirmera).
                resolvedCount = count + 1
            }
        }
        likeDelta[commentId] = nil
        var current = liveComments ?? post.comments
        if let idx = current.firstIndex(where: { $0.id == commentId }) {
            current[idx].likes = resolvedCount
            liveComments = current
            return
        }
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies[idx].likes = resolvedCount
                repliesMap[key] = replies
                return
            }
        }
    }

    // MARK: - Édition de commentaire (auteur)

    /// Bandeau au-dessus du composer pendant une édition — sortie possible
    /// par la croix (le composer revient en mode création, texte effacé).
    private var editingBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "pencil")
                .font(MeeshyFont.relative(12))
                .foregroundColor(Color(hex: accentColor))
            Text(String(localized: "feed.comments.editing", defaultValue: "Modification du commentaire", bundle: .main))
                .font(MeeshyFont.relative(12, weight: .medium))
                .foregroundColor(theme.textSecondary)
            Spacer()
            Button {
                cancelEditComment()
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(MeeshyFont.relative(14))
                    .foregroundColor(theme.textMuted)
            }
            .accessibilityLabel(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(theme.inputBackground.opacity(0.6))
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    /// Charge le commentaire dans le composer avec TOUT ce que l'édition
    /// permet : texte + effets visuels (lueur/pulse/…) + flou — mêmes
    /// capacités que la création (le média existant est conservé tel quel).
    private func beginEditComment(_ target: FeedComment) {
        replyingTo = nil
        editingComment = target
        composerText = target.content
        let flags = MessageEffectFlags(rawValue: UInt32(clamping: target.effectFlags))
        commentBlurEnabled = flags.contains(.blurred)
        commentEffects = MessageEffects(flags: flags.subtracting(.blurred))
        HapticFeedback.light()
    }

    private func cancelEditComment() {
        editingComment = nil
        composerText = ""
        commentEffects = .none
        commentBlurEnabled = false
    }

    /// PATCH du commentaire : remplacement optimiste EN PLACE (jamais
    /// d'insertion — même id), rollback complet si le serveur refuse.
    /// L'écho `comment:updated` reconfirme ensuite la ligne (idempotent).
    private func submitCommentEdit(_ target: FeedComment, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !target.media.isEmpty else { return }
        let effects = commentEffects
        let blur = commentBlurEnabled
        let flags = Int(effects.flags.rawValue | (blur ? MessageEffectFlags.blurred.rawValue : 0))
        editingComment = nil
        commentEffects = .none
        commentBlurEnabled = false
        commentAttachments.removeAll()
        commentPendingPlace = nil
        mentionController.clearDraft()

        let edited = target.withEditedContent(trimmed, effectFlags: flags)
        let snapshotComments = liveComments ?? post.comments
        let snapshotReplies = repliesMap
        applyCommentEdit(edited)
        Task {
            do {
                _ = try await PostService.shared.updateComment(
                    postId: post.id, commentId: target.id, content: trimmed, effectFlags: flags
                )
                // Invalidation locale par réécriture : la version éditée
                // remplace la version cachée — les autres vues (détail,
                // overlay story) la resservent depuis le cache sans refetch.
                if let parentId = edited.parentId {
                    if let replies = repliesMap[parentId] {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(Self.persistableComments(replies), for: "replies-\(parentId)")
                    }
                } else if let current = liveComments {
                    try? await CacheCoordinator.shared.comments.savePreservingFreshness(Self.persistableComments(current), for: "post-\(post.id)")
                }
            } catch {
                liveComments = snapshotComments
                repliesMap = snapshotReplies
                FeedbackToastManager.shared.showError(
                    String(localized: "feed.comments.edit_error", defaultValue: "Erreur lors de la modification du commentaire", bundle: .main))
            }
        }
    }

    /// Remplace la ligne éditée EN PLACE (racine ou réponse) — idempotent,
    /// partagé par l'optimiste local et l'écho socket `comment:updated`.
    private func applyCommentEdit(_ edited: FeedComment) {
        if let parentId = edited.parentId {
            if var existing = repliesMap[parentId], let idx = existing.firstIndex(where: { $0.id == edited.id }) {
                existing[idx] = edited
                repliesMap[parentId] = existing
                return
            }
        }
        var current = liveComments ?? post.comments
        if let idx = current.firstIndex(where: { $0.id == edited.id }) {
            current[idx] = edited
            liveComments = current
        }
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
                                    onEditComment: { target in
                                        beginEditComment(target)
                                    },
                                    onRequestTranslation: { target in
                                        let lang = AuthManager.shared.currentUser?.preferredContentLanguages.first?.lowercased() ?? "fr"
                                        Task {
                                            try? await PostService.shared.requestCommentTranslation(
                                                postId: post.id, commentId: target.id, targetLanguage: lang)
                                        }
                                    },
                                    moodEmoji: moodEmojiResolver?(comment.authorId),
                                    storyState: storyRingResolver?(comment.authorId) ?? .none,
                                    presenceState: PresenceManager.shared.presenceMap[comment.authorId]?.state,
                                    replyMoodResolver: { moodEmojiResolver?($0) },
                                    replyStoryResolver: { storyRingResolver?($0) ?? .none },
                                    replyPresenceResolver: { PresenceManager.shared.presenceMap[$0]?.state },
                                    hasMoreReplies: expandedThreads.contains(comment.id) && (repliesHasMore[comment.id] ?? false),
                                    onLoadMoreReplies: { await loadMoreReplies(commentId: comment.id) },
                                    highlightedCommentId: highlightedCommentId
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
                        if editingComment != nil {
                            editingBanner
                        }
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
        .adaptiveWideSheet()
        .modifier(TranslucentSheetBackground())
        .onAppear {
            SocialSocketManager.shared.joinPostRoom(postId: post.id)
            // Les commentaires du post sont CONSOMMÉS : marque lues les
            // notifications du post (portée serveur `context.postId`, qui
            // couvre commentaires et réactions) et déclare le post actif —
            // les notifications arrivant pendant la lecture naissent
            // consommées. Cette feuille est présentée depuis le FEED et les
            // RÉELS sans passer par PostDetailView : c'était le seul chemin
            // où une notification de commentaire n'était jamais consommée.
            // Idempotent quand l'hôte (réel) a déjà déclaré ce post actif.
            claimedActivePost = NotificationToastManager.shared.activePostId != post.id
            NotificationToastManager.shared.onPostOpened(post.id)
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
            // Ne relâcher QUE ce que la feuille a revendiqué : présentée
            // depuis le viewer de réels (post déjà actif), elle ne doit pas
            // effacer l'état du réel encore affiché derrière — quel que soit
            // l'ordre onDismiss/onDisappear que SwiftUI choisit.
            if claimedActivePost {
                NotificationToastManager.shared.onPostClosed(post.id)
            }
        }
        .onReceive(
            SocialSocketManager.shared.commentAdded
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let parentId = data.comment.parentId
            // Parité effets + Prisme avec le mapping REST (`mapFetchedComments`) :
            // sans effectFlags, un commentaire stylé (lueur/pulse) arrivant en
            // temps réel rendait SANS ses effets dans cette feuille.
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let translated = PostDetailViewModel.resolveCommentTranslation(
                translations: data.comment.translations,
                originalLanguage: data.comment.originalLanguage,
                preferredLanguages: langs
            )
            let feedComment = FeedComment(
                id: data.comment.id, author: data.comment.author.name,
                authorId: data.comment.author.id,
                authorUsername: data.comment.author.username,
                authorAvatarURL: data.comment.author.avatar,
                content: data.comment.content, timestamp: data.comment.createdAt,
                likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                parentId: parentId,
                effectFlags: data.comment.effectFlags ?? 0,
                originalLanguage: data.comment.originalLanguage,
                translatedContent: translated,
                currentUserReactions: data.comment.currentUserReactions,
                media: (data.comment.media ?? []).map { $0.toFeedMedia() }
            )
            // The echoed event for OUR own just-sent comment: replace the optimistic
            // placeholder in place instead of duplicating it. Primary key: the
            // cmid echoed by the gateway matches the optimistic row id exactly.
            // Fallback: legacy tmp_ rows matched by author + content + parent.
            func isTwin(_ c: FeedComment) -> Bool {
                if let cmid = data.clientMutationId, c.id == cmid { return true }
                return c.id.hasPrefix("tmp_")
                    && c.authorId == feedComment.authorId
                    && c.content == feedComment.content
                    && c.parentId == parentId
            }
            if let parentId {
                var existing = repliesMap[parentId] ?? []
                if let idx = existing.firstIndex(where: isTwin) {
                    existing[idx] = feedComment                 // reconcile our temp
                    repliesMap[parentId] = existing
                    // Réécriture du cache avec la ligne RÉCONCILIÉE : un cache
                    // persisté pendant que la ligne optimiste (cmid) était
                    // encore là garderait le fantôme pour toujours. Scope
                    // STRICT à la réconciliation — persister sur l'insertion
                    // d'un TIERS écraserait un fil de réponses caché plus
                    // complet quand le fil n'a pas (encore) été chargé ici.
                    let replies = existing
                    Task {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(Self.persistableComments(replies), for: "replies-\(parentId)")
                    }
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
                    // Même réécriture réconciliée pour le fil top-level (clé
                    // partagée avec le détail de post et l'overlay story) —
                    // même scope strict que côté réponses.
                    let snapshot = current
                    Task {
                        try? await CacheCoordinator.shared.comments.savePreservingFreshness(Self.persistableComments(snapshot), for: "post-\(post.id)")
                    }
                } else if !current.contains(where: { $0.id == feedComment.id }) {
                    current.insert(feedComment, at: 0)
                }
                liveComments = current
            }
            liveCommentCount = data.commentCount
        }
        // Édition en temps réel : remplace la ligne EN PLACE (contenu, effets,
        // traductions régénérées) — idempotent avec l'optimiste local.
        .onReceive(
            SocialSocketManager.shared.commentUpdated
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            let translated = PostDetailViewModel.resolveCommentTranslation(
                translations: data.comment.translations,
                originalLanguage: data.comment.originalLanguage,
                preferredLanguages: langs
            )
            let updated = FeedComment(
                id: data.comment.id, author: data.comment.author.name,
                authorId: data.comment.author.id,
                authorUsername: data.comment.author.username,
                authorAvatarURL: data.comment.author.avatar,
                content: data.comment.content, timestamp: data.comment.createdAt,
                likes: data.comment.likeCount ?? 0, replies: data.comment.replyCount ?? 0,
                parentId: data.comment.parentId,
                effectFlags: data.comment.effectFlags ?? 0,
                originalLanguage: data.comment.originalLanguage,
                translatedContent: translated,
                currentUserReactions: data.comment.currentUserReactions,
                media: (data.comment.media ?? []).map { $0.toFeedMedia() }
            )
            let topLevelWasLoaded = liveComments != nil
            applyCommentEdit(updated)
            persistCommentCache(
                touchedThreadIds: updated.parentId.map { [$0] } ?? [],
                topLevelWasLoaded: topLevelWasLoaded
            )
        }
        // Traduction de commentaire arrivée (pipeline async ou demande à la
        // demande) : pose `translatedContent` si la langue est préférée et
        // qu'aucune traduction n'est déjà affichée (règle unique du Prisme —
        // miroir de `FeedViewModel.applyCommentTranslation`).
        .onReceive(
            SocialSocketManager.shared.commentTranslationUpdated
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
            guard langs.contains(where: { $0.caseInsensitiveCompare(data.language) == .orderedSame }) else { return }
            let text = data.translation.text
            let topLevelWasLoaded = liveComments != nil
            var current = liveComments ?? post.comments
            if let idx = current.firstIndex(where: { $0.id == data.commentId }), current[idx].translatedContent == nil {
                current[idx].translatedContent = text
                liveComments = current
                persistCommentCache(touchedThreadIds: [], topLevelWasLoaded: topLevelWasLoaded)
                return
            }
            for (key, var replies) in repliesMap {
                if let idx = replies.firstIndex(where: { $0.id == data.commentId }), replies[idx].translatedContent == nil {
                    replies[idx].translatedContent = text
                    repliesMap[key] = replies
                    persistCommentCache(touchedThreadIds: [key], topLevelWasLoaded: topLevelWasLoaded)
                    return
                }
            }
        }
        // Réconciliation par l'AGRÉGAT ABSOLU (miroir de
        // `StoryViewerView.applyCommentReactionEvent`) : l'ancien ±1 ne purgeait
        // jamais le delta de sa PROPRE réaction — dès que la base était
        // rafraîchie (loadReplies, refetch), `likes` incluait déjà le like et
        // l'affichage `likes + delta` comptait DOUBLE. « Mon cœur » dérive de
        // `aggregation.userIds` (User.id des réacteurs), PAS de `hasCurrentUser`
        // qui est calculé relativement à l'ACTEUR de l'événement côté gateway.
        .onReceive(
            SocialSocketManager.shared.commentReactionAdded
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { event in
            guard event.emoji == StoryViewerView.heartEmoji else { return }
            applyCommentReactionAggregate(
                commentId: event.commentId,
                count: event.aggregation.count,
                reactorUserIds: event.aggregation.userIds,
                actorUserId: event.userId
            )
        }
        .onReceive(
            SocialSocketManager.shared.commentReactionRemoved
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { event in
            guard event.emoji == StoryViewerView.heartEmoji else { return }
            applyCommentReactionAggregate(
                commentId: event.commentId,
                count: event.aggregation.count,
                reactorUserIds: event.aggregation.userIds,
                actorUserId: event.userId
            )
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
            let topLevelWasLoaded = liveComments != nil
            let touchedThreadIds = applyCommentMediaUpdate(
                commentId: data.commentId, parentId: data.comment.parentId, media: media
            )
            persistCommentCache(touchedThreadIds: touchedThreadIds, topLevelWasLoaded: topLevelWasLoaded)
        }
        // Suppression en temps réel : retire le commentaire et resynchronise le
        // compteur sur la valeur autoritative serveur (heale la dérive optimiste).
        // Idempotent avec le retrait optimiste du client qui supprime.
        .onReceive(
            SocialSocketManager.shared.commentDeleted
                .receive(on: DispatchQueue.main)
                .filter { [postId = post.id] in $0.postId == postId }
        ) { data in
            let topLevelWasLoaded = liveComments != nil
            let touchedThreadIds = applyCommentDeletion(
                commentId: data.commentId, commentCount: data.commentCount
            )
            persistCommentCache(touchedThreadIds: touchedThreadIds, topLevelWasLoaded: topLevelWasLoaded)
        }
        .sheet(item: $selectedProfileUser) { user in
            UserProfileSheet(
                user: user,
                moodEmoji: moodEmojiResolver?(user.userId ?? ""),
                onMoodTap: moodTapResolver?(user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
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
        case .fresh(let full, _):
            // LOCAL-FIRST : un cache FRAIS se sert SANS refetch — changer de
            // vue (feed → sheet → détail → story) ne recharge pas des
            // commentaires déjà présents et non modifiés. Le temps réel
            // (comment:added/updated/deleted/translation-updated) et les
            // écritures locales maintiennent la fraîcheur ; la modification
            // invalide le cache par réécriture (savePreservingFreshness).
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: full)
            seedLikedIds(from: full)
            // La pagination reste possible : cursor nil = page 1 de recovery
            // quand l'utilisateur atteint le bas (même contrat que le profil).
            // `post.commentCount` compte TOUTES les lignes (réponses incluses)
            // alors que `liveComments` n'a que le top-level : le total local
            // comparable = top-level chargés + réponses qu'ils annoncent.
            let loaded = liveComments ?? []
            let knownTotal = loaded.count + loaded.reduce(0) { $0 + $1.replies }
            commentsHasMore = post.commentCount > knownTotal
            return
        case .stale(let full, _):
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
            let fetched = mapFetchedComments(response.data)
            // Merge, never overwrite: `liveComments` may already carry an
            // optimistic send or a socket-reconciled comment that landed
            // while this GET was in flight — the server snapshot the GET
            // resolved from can't know about either yet.
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: fetched)
            seedLikedIds(from: fetched)
            commentsNextCursor = response.pagination?.nextCursor
            commentsHasMore = response.pagination?.hasMore ?? false
            try? await CacheCoordinator.shared.comments.save(fetched, for: cacheKey)
        } catch {
            // Network failed — keep whatever we already have (embedded top-3
            // or the cached stale page loaded above). Matches this sheet's
            // existing silent-fail pattern for supplementary loads (e.g. the
            // replies prefetch above).
        }
    }

    private func mapFetchedComments(_ data: [APIPostComment]) -> [FeedComment] {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        return data.map { c -> FeedComment in
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
    }

    /// Page suivante (plus ancienne) du fil — utilisée par la chasse paginée
    /// d'un commentaire notifié hors de la première page.
    private func loadNextCommentsPage() async {
        guard commentsHasMore else { return }
        do {
            let response = try await PostService.shared.getComments(
                postId: post.id, cursor: commentsNextCursor, limit: 20
            )
            let fetched = mapFetchedComments(response.data)
            liveComments = Self.mergeFetchedComments(current: liveComments ?? post.comments, fetched: fetched)
            seedLikedIds(from: fetched)
            commentsNextCursor = response.pagination?.nextCursor
            commentsHasMore = response.pagination?.hasMore ?? false
        } catch {
            // Échec réseau : stopper la chasse proprement (la liste reste
            // utilisable, le ciblage se désarmera côté appelant).
            commentsHasMore = false
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
        guard topLevelComments.contains(where: { $0.id == sectionId }) else {
            // Cible au-delà de la première page : chasse paginée bornée —
            // chaque page re-déclenche ce scroll via l'onChange sur
            // topLevelComments.count ; échec (cap/fin) → désarmer le ciblage.
            if !isHuntingTargetComment {
                isHuntingTargetComment = true
                Task {
                    let found = await CommentTargetHunter.hunt(
                        isPresent: { topLevelComments.contains { $0.id == sectionId } },
                        hasMore: { commentsHasMore },
                        loadNextPage: { await loadNextCommentsPage() }
                    )
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
                if !expandedThreads.contains(parentId) {
                    await toggleThread(parentId)
                }
                let found = await loadRepliesUntilPresent(target, in: parentId)
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
            let replies = mapFetchedReplies(response.data, parentId: commentId)
            repliesMap[commentId] = replies
            repliesNextCursor[commentId] = response.pagination?.nextCursor
            repliesHasMore[commentId] = response.pagination?.hasMore ?? false
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

    /// Page suivante des réponses d'un fil (curseur `gt`, tri ASC → APPEND).
    /// Jamais de remplacement : les réponses arrivées par le socket
    /// (`comment:added`) pendant la pagination sont préservées (dédup par id).
    /// NOTE : `repliesHasMore[id] == nil` (fil hydraté du cache par le `.task`,
    /// pagination jamais enregistrée) n'est PAS bloquant — `cursor: nil`
    /// signifie « page 1 », ce qu'il faut pour récupérer un vrai curseur
    /// (même fix documenté que `loadMoreComments` côté VM). Seul `false`
    /// (fin de fil connue) stoppe.
    private func loadMoreReplies(commentId: String) async {
        guard !loadingReplies.contains(commentId), repliesHasMore[commentId] != false else { return }
        loadingReplies.insert(commentId)
        defer { loadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: post.id, commentId: commentId,
                cursor: repliesNextCursor[commentId], limit: 20
            )
            let fetched = mapFetchedReplies(response.data, parentId: commentId)
            let existing = repliesMap[commentId] ?? []
            let existingIds = Set(existing.map(\.id))
            let unique = fetched.filter { !existingIds.contains($0.id) }
            repliesMap[commentId] = existing + unique
            repliesNextCursor[commentId] = response.pagination?.nextCursor
            repliesHasMore[commentId] = response.pagination?.hasMore ?? false
            seedLikedIds(from: unique)
            try? await CacheCoordinator.shared.comments.save(
                repliesMap[commentId] ?? [], for: "replies-\(commentId)"
            )
        } catch {
            // Échec réseau : stopper proprement la pagination (et toute chasse
            // en cours) — le fil garde les pages déjà chargées.
            repliesHasMore[commentId] = false
        }
    }

    /// Chasse paginée bornée d'une RÉPONSE notifiée hors de la première page
    /// de son fil (miroir de `PostDetailViewModel.loadRepliesUntilPresent`).
    private func loadRepliesUntilPresent(_ replyId: String, in commentId: String) async -> Bool {
        if repliesMap[commentId] == nil {
            await loadReplies(commentId: commentId)
        }
        return await CommentTargetHunter.hunt(
            isPresent: { repliesMap[commentId]?.contains(where: { $0.id == replyId }) ?? false },
            // `nil` = pagination inconnue (fil hydraté du cache) → tenter la
            // page 1 pour récupérer un curseur ; seul `false` arrête la chasse.
            hasMore: { repliesHasMore[commentId] != false },
            loadNextPage: { await loadMoreReplies(commentId: commentId) }
        )
    }

    private func mapFetchedReplies(_ data: [APIPostComment], parentId: String) -> [FeedComment] {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        return data.map { c -> FeedComment in
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
                parentId: parentId,
                originalLanguage: c.originalLanguage, translatedContent: translated,
                currentUserReactions: c.currentUserReactions,
                media: (c.media ?? []).map { $0.toFeedMedia() }
            )
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
                    moodEmoji: moodEmojiResolver?(post.authorId),
                    onViewProfile: { selectedProfileUser = .from(feedPost: post) },
                    onMoodTap: moodTapResolver?(post.authorId),
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

            MessageTextRenderer.render(
                post.displayContent,
                fontSize: 15,
                color: theme.textSecondary,
                mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                accentColor: Color(hex: accentColor),
                usesRelativeFont: true
            )
                .tint(Color(hex: accentColor))
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
                    .font(MeeshyFont.relative(12, weight: .semibold))
                    .foregroundColor(Color(hex: reply.authorColor))

                MessageTextRenderer.render(
                    reply.displayContent,
                    fontSize: 12,
                    color: theme.textSecondary,
                    mentionColor: MeeshyColors.mentionColor(isDark: isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: isDark),
                    accentColor: Color(hex: reply.authorColor),
                    usesRelativeFont: true
                )
                    .tint(Color(hex: reply.authorColor))
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
            onIngest: { ingests in handleComposerIngest(ingests) },
            accentColor: accentColor,
            secondaryColor: composerSecondaryColor,
            // Opt comments into the attachment carousel + voice (parity with
            // message-with-attachments). Pickers are wired below.
            forceShowAttachment: true,
            forceShowVoice: true,
            selectedLanguage: composerLanguage,
            onLanguageChange: { composerLanguage = $0 },
            onFocusChange: { composerIsFocused = $0 },
            onSendMessage: { text, attachments, _ in
                submitComment(text: text, attachments: attachments)
            },
            onLocationRequest: { showCommentLocationPicker = true },
            textBinding: $composerText,
            replyBanner: replyingTo.map { AnyView(commentReplyBanner($0)) },
            customAttachmentsPreview: (commentAttachments.isEmpty && commentPendingPlace == nil)
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
            externalHasContent: !commentAttachments.isEmpty || audioRecorder.isRecording || commentPendingPlace != nil,
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
            LocationPickerView(accentColor: accentColor) { place in
                commentPendingPlace = place
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
                if let place = commentPendingPlace {
                    HStack(spacing: 6) {
                        Image(systemName: "location.fill")
                            .font(.caption)
                            .foregroundColor(MeeshyColors.success)
                        Text(MediaKindLabel.placeLabel(place.name))
                            .font(.caption.weight(.medium))
                            .lineLimit(1)
                            .frame(maxWidth: 120)
                        Button {
                            HapticFeedback.light()
                            withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                                commentPendingPlace = nil
                            }
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
                        name: MediaKindLabel.name(.video),
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
                    name: MediaKindLabel.name(.video),
                    url: url, thumbnailColor: "FF6B6B"
                )
            )
        }
    }

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
    /// (image/vidéo/audio — un commentaire ne porte qu'un seul média) ET/OU un
    /// lieu partagé. Le texte suit le flux reconcile/rollback existant ; le
    /// média est uploadé via TUS (`uploadContext: "comment"` → PostMedia) puis
    /// lié via `addComment(attachmentIds:)` ; le lieu transite par
    /// `addComment(location:)` en ligne et par `CreateCommentPayload.location`
    /// hors-ligne (même contrat que `PostDetailViewModel.sendComment/sendReply/
    /// submitCommentWithMedia`). Les attachements file et la voix sans fichier
    /// restent ignorés (hors périmètre).
    /// Un commentaire média-seul ou lieu-seul (sans texte) est autorisé.
    private func submitComment(text: String, attachments: [ComposerAttachment]) {
        if let editing = editingComment {
            submitCommentEdit(editing, text: text)
            return
        }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        // Un seul média par commentaire : on prend le premier image/vidéo/audio valide.
        let media: PendingCommentMedia? = CommentComposerStaging.firstPendingMedia(in: attachments)
        commentAttachments.removeAll()
        // Lieu partagé en attente — capturé puis effacé AVANT le guard (comme
        // `PostDetailView.submitComment`) : la chip ne doit pas ré-apparaître
        // sur le commentaire suivant, qu'il parte ou soit rejeté par le guard.
        let place = commentPendingPlace
        commentPendingPlace = nil

        // Rien à envoyer (ni texte, ni média, ni lieu exploitable).
        guard !trimmed.isEmpty || media != nil || place != nil else { return }

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
        // La ligne optimiste est keyée par le cmid : envoyé au REST ET réutilisé
        // par le repli outbox, il fait dédoublonner le serveur (MutationLog) et
        // revient dans l'écho `comment:added` pour une réconciliation par id
        // exacte — le twin-match par contenu ne tenait pas quand le serveur
        // normalise le texte (sanitize).
        let tempId = ClientMutationId.generate()
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
                    originalLanguage: lang, location: place, clientMutationId: tempId
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
                // REST failed — most commonly because the device is offline.
                // Durably enqueue via the existing `.createComment` outbox
                // kind (same one `FeedViewModel`/`PostDetailViewModel.sendComment`
                // already use) instead of unconditionally losing the comment.
                // The optimistic `tempId` row is reconciled by the already-wired
                // `comment:added` socket handler once the outbox replay lands.
                // NOTE: `CreateCommentPayload` carries `effectFlags` but not
                // `attachmentIds` (SDK schema gap) — attached media on a comment
                // sent while offline is dropped on replay; the comment text and
                // its visual effects survive.
                do {
                    // MÊME cmid que la tentative REST : si le POST a abouti côté
                    // serveur mais que sa réponse s'est perdue, le rejeu outbox
                    // est dédoublonné par le MutationLog au lieu de créer un
                    // second commentaire.
                    let cmid = tempId
                    let payload = CreateCommentPayload(
                        clientMutationId: cmid,
                        postId: post.id,
                        parentCommentId: parentId,
                        content: trimmed,
                        location: place,
                        effectFlags: effectFlags
                    )
                    try await OfflineQueue.shared.enqueue(.createComment, payload: payload, conversationId: post.id)
                    onCommentSent?(post.id)

                    // Roll back the optimistic comment if the outbox exhausts
                    // its retry budget (server permanently rejects). Without
                    // this a permanently-failing comment stays in the sheet
                    // forever: the `comment:added` echo it's waiting on will
                    // never arrive for a mutation the outbox gave up on.
                    observeCreateCommentOutcome(cmid: cmid, tempId: tempId, parentId: parentId)
                } catch {
                    // Roll back the optimistic row + counts — the outbox
                    // itself refused the row.
                    rollbackOptimisticComment(tempId: tempId, parentId: parentId)
                    FeedbackToastManager.shared.showError(String(localized: "feed.comments.send_error", defaultValue: "Erreur lors de l'envoi du commentaire", bundle: .main))
                }
            }
        }
    }

    /// Remplace le média (enrichi) d'un commentaire en cache, qu'il soit top-level
    /// (`liveComments`) ou une réponse (`repliesMap`). Déclenché par
    /// `comment:media-updated` quand la transcription / les variantes TTS arrivent.
    /// Rend les fils de réponses touchés, pour que l'appelant sache quelle clé
    /// de cache réécrire (`[]` = la mutation a atterri dans le top-level).
    private func applyCommentMediaUpdate(commentId: String, parentId: String?, media: [FeedMedia]) -> [String] {
        if let parentId, var existing = repliesMap[parentId] {
            if let idx = existing.firstIndex(where: { $0.id == commentId }) {
                existing[idx].media = media
                repliesMap[parentId] = existing
                return [parentId]
            }
        }
        var current = liveComments ?? post.comments
        if let idx = current.firstIndex(where: { $0.id == commentId }) {
            current[idx].media = media
            liveComments = current
            return []
        }
        // Réponse non encore montée dans repliesMap : tente tous les threads chargés.
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies[idx].media = media
                repliesMap[key] = replies
                return [key]
            }
        }
        return []
    }

    /// Retire un commentaire (racine + ses réponses chargées, ou réponse avec
    /// décrément du compteur de son parent) et resynchronise le total sur la valeur
    /// autoritative serveur. Déclenché par le socket `comment:deleted` — idempotent
    /// avec le retrait optimiste local.
    /// Rend les fils de réponses touchés : une RÉPONSE supprimée sort de
    /// `replies-<parentId>` ET fait bouger le compteur de son parent dans le
    /// top-level, donc l'appelant a DEUX clés à réécrire. La clé orpheline
    /// `replies-<commentId>` d'un top-level supprimé n'est jamais rendue :
    /// plus rien ne la relira, son parent n'existe plus.
    private func applyCommentDeletion(commentId: String, commentCount: Int) -> [String] {
        var current = liveComments ?? post.comments
        current.removeAll { $0.id == commentId }
        repliesMap[commentId] = nil
        expandedThreads.remove(commentId)
        var touchedThreadIds: [String] = []
        for (key, var replies) in repliesMap {
            if let idx = replies.firstIndex(where: { $0.id == commentId }) {
                replies.remove(at: idx)
                repliesMap[key] = replies
                touchedThreadIds.append(key)
                if let pIdx = current.firstIndex(where: { $0.id == key }), current[pIdx].replies > 0 {
                    current[pIdx].replies -= 1
                }
            }
        }
        liveComments = current
        liveCommentCount = commentCount
        return touchedThreadIds
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
            // Invalidation locale par réécriture : sans elle, la version cachée
            // ressuscitait le commentaire supprimé à la prochaine ouverture
            // (sheet, détail, overlay story lisent la même clé).
            if comment.parentId == nil, let current = liveComments {
                try? await CacheCoordinator.shared.comments.savePreservingFreshness(Self.persistableComments(current), for: "post-\(post.id)")
            }
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
    /// Édite ce commentaire (contenu + effets). Fourni UNIQUEMENT quand
    /// l'utilisateur courant est l'auteur — même règle que la suppression.
    var onEditComment: (() -> Void)? = nil
    /// Demande la traduction du commentaire vers la langue préférée du
    /// lecteur (Prisme « Exploration ») — affiché quand AUCUNE traduction
    /// n'est disponible et que la langue d'origine diffère. Le résultat
    /// arrive via `comment:translation-updated`.
    var onRequestTranslation: (() -> Void)? = nil
    /// Affiche le bouton « Voir » (charger/afficher les réponses) à côté de
    /// « Répondre ». Calculé par le parent (`ThreadedCommentSection`) : vrai
    /// seulement s'il reste des réponses non révélées. Ignoré pour une réponse.
    var showSeeReplies: Bool = false
    /// Déclenché par « Voir » : déplie le thread (charge + affiche les réponses)
    /// sans avoir à répondre. Sans repli (le bouton disparaît une fois déplié).
    var onSeeReplies: (() -> Void)? = nil
    var moodEmoji: String? = nil
    var storyState: StoryRingState = .none
    var presenceState: PresenceState? = nil

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.comment.id == rhs.comment.id &&
        lhs.isLiked == rhs.isLiked &&
        lhs.likeCount == rhs.likeCount &&
        lhs.isInFlight == rhs.isInFlight &&
        lhs.showSeeReplies == rhs.showSeeReplies &&
        // Re-render si l'éligibilité à la suppression change (ex: changement de
        // compte avec la feuille ouverte) — sinon l'item « Supprimer » reste figé.
        (lhs.onDeleteComment == nil) == (rhs.onDeleteComment == nil) &&
        (lhs.onEditComment == nil) == (rhs.onEditComment == nil) &&
        lhs.comment.effectFlags == rhs.comment.effectFlags &&
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
    @Environment(\.meeshyMoodEmojiResolver) private var moodEmojiResolver
    @Environment(\.meeshyMoodTapResolver) private var moodTapResolver
    @State private var selectedProfileUser: ProfileSheetUser?
    @State private var showOriginal = false
    /// Lieu du commentaire ouvert plein écran (tap sur le sticker).
    @State private var rowFullscreenPlace: BubbleFullscreenPlace?
    /// Demande de traduction envoyée pour cette ligne (feedback immédiat,
    /// l'icône passe en sablier jusqu'à l'arrivée du résultat).
    @State private var translationRequested = false

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
        canCopyContent || onDeleteComment != nil || onEditComment != nil
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
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(MeeshyColors.indigo400)
                            .accessibilityHidden(true)
                    } else if let onRequestTranslation,
                              comment.originalLanguage != nil,
                              comment.originalLanguage?.lowercased()
                                != (AuthManager.shared.currentUser?.preferredContentLanguages.first?.lowercased() ?? "fr") {
                        // Pas encore de traduction vers la langue préférée :
                        // « Traduire » à la demande (langues hors des 5
                        // pré-générées comprises) — le résultat remplit la
                        // ligne via `comment:translation-updated`.
                        Button {
                            guard !translationRequested else { return }
                            translationRequested = true
                            onRequestTranslation()
                            HapticFeedback.light()
                        } label: {
                            Image(systemName: translationRequested ? "hourglass" : "translate")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundColor(MeeshyColors.indigo400.opacity(translationRequested ? 0.5 : 1))
                        }
                        .accessibilityLabel(String(localized: "feed.comments.translate", defaultValue: "Traduire", bundle: .main))
                        .meeshyTapTarget(44)
                    }

                    Text("\u{00B7}").font(MeeshyFont.relative(12)).foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)

                    Text(RelativeTimeFormatter.shortString(for: comment.timestamp))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textMuted)
                        .accessibilityHidden(true)
                }

                // `MessageTextRenderer` (et non `Text`) pour que `@mention` /
                // `#hashtag` soient teintés comme partout ailleurs.
                // `usesRelativeFont` conserve le scaling Dynamic Type du
                // `MeeshyFont.relative(contentFont)` d'origine.
                MessageTextRenderer.render(
                    effectiveCommentContent,
                    fontSize: contentFont,
                    color: theme.textPrimary,
                    mentionColor: MeeshyColors.mentionColor(isDark: theme.mode.isDark),
                    hashtagColor: MeeshyColors.hashtagColor(isDark: theme.mode.isDark),
                    accentColor: Color(hex: accentColor),
                    usesRelativeFont: true
                )
                    .tint(Color(hex: accentColor))
                    .fixedSize(horizontal: false, vertical: true)
                    .animation(.easeInOut(duration: 0.2), value: showOriginal)
                    .messageEffects(comment.effects)
                    .accessibilityLabel(String(format: String(localized: "a11y.comment.body", defaultValue: "%1$@ : %2$@", bundle: .main), RelativeTimeFormatter.shortString(for: comment.timestamp), effectiveCommentContent))

                // Média unique du commentaire (image/vidéo/audio) — inline + plein
                // écran « comme dans une conversation ». Le commentaire ne porte
                // qu'un seul média (cf. backend commentId FK sur PostMedia).
                if let media = comment.media.first {
                    CommentMediaView(
                        media: media,
                        accentColor: accentColor,
                        commentId: comment.id,
                        authorName: comment.author,
                        authorAvatarURL: comment.authorAvatarURL,
                        authorColor: comment.authorColor,
                        sentAt: comment.timestamp
                    )
                    .padding(.top, 2)
                }

                // Lieu attaché au commentaire (`FeedComment.location`, hissé du
                // gateway) — sticker cliquable → carte plein écran. Couvre la
                // sheet ET la page détail (les deux passent par cette row).
                if let place = comment.location {
                    FeedPostLocationSticker(place: place) {
                        rowFullscreenPlace = BubbleFullscreenPlace(place: place)
                    }
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
                            // Le contour d'accent — « c'est MOI qui ai liké » —
                            // manquait ici alors que le fil des posts le porte
                            // depuis toujours : un commentaire que j'avais aimé
                            // ne se distinguait que par sa teinte, la même que
                            // celle d'un commentaire simplement aimé par
                            // d'autres. `filledWhenInactive` garde le cœur plein
                            // dès qu'il existe des likes, sans revendiquer les
                            // miens.
                            EngagementGlyph(
                                outline: "heart",
                                filled: "heart.fill",
                                participated: isLiked,
                                accentHex: accentColor,
                                activeTint: MeeshyColors.error,
                                inactiveTint: heartColor,
                                filledWhenInactive: likeCount > 0,
                                size: isReply ? 12 : 14
                            )
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
                    .accessibilityValue(LocalizedNumber.exact(likeCount))
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
                            .accessibilityValue(comment.replies > 0 ? PostStatAccessibility.repliesLabel(comment.replies) : "")
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
                                    ? String(localized: "a11y.comment.show_replies", defaultValue: "Voir \(comment.replies) réponses", bundle: .main)
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
                            if let onEditComment {
                                Button {
                                    HapticFeedback.light()
                                    onEditComment()
                                } label: {
                                    Label(String(localized: "comment.action.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
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
                moodEmoji: moodEmojiResolver?(user.userId ?? ""),
                onMoodTap: moodTapResolver?(user.userId ?? ""),
                presenceProvider: { PresenceManager.shared.knownPresenceState(for: $0) },
                postsContent: { uid in AnyView(ProfileUserPostsList(
                    userId: uid,
                    onOpenPost: { post in ProfilePostsOpener.openPost(post) { selectedProfileUser = nil } },
                    onOpenReel: { reel, reels in ProfilePostsOpener.openReel(reel, in: reels) { selectedProfileUser = nil } }
                )) }
            )
            .presentationDetents([.large, .medium])
            .presentationDragIndicator(.visible)
        }
        .fullScreenCover(item: $rowFullscreenPlace) { item in
            // Même surface plein écran que la bulle et la card feed :
            // carte + « Ouvrir dans Plans » / « Itinéraire ».
            LocationFullscreenView(
                latitude: item.place.latitude,
                longitude: item.place.longitude,
                placeName: item.place.name,
                address: item.place.address,
                accentColor: accentColor,
                senderName: comment.author
            )
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
