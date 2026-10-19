import SwiftUI
import os
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - Comments Overlay (Instagram-style)

    /// Builds the floating comments overlay (`StoryCommentsOverlayView`).
    /// Rendered by `StoryViewerContentView` as a sibling of the story card,
    /// NOT inside it, so the overlay does not inherit the card's drag offset,
    /// scale, or 3D rotation (bug 2026-05-28: overlay shifted left during
    /// drag / scale transitions).
    func storyCommentsOverlay(zone: StoryCommentsZone.Frame) -> StoryCommentsOverlayView {
        // L'overlay commentaires n'embarque PLUS son propre composer. Il
        // affiche uniquement : (1) la liste des commentaires, (2) les
        // actions « Répondre » / « like » de chaque row qui mutent
        // `replyingToStoryComment`. Le composer principal — toujours
        // visible en bas via `StoryComposerBarView` rendu dans la canvas
        // « Bottom area » — lit ce binding et affiche sa reply banner
        // au-dessus de sa rangée de saisie. Spec user 2026-05-28 :
        // « une seule zone de saisie de commentaire ».
        StoryCommentsOverlayView(
            storyComments: storyComments,
            storyCommentCount: storyCommentCount,
            storyCommentRepliesMap: storyCommentRepliesMap,
            storyCommentExpandedThreads: storyCommentExpandedThreads,
            storyCommentLoadingReplies: storyCommentLoadingReplies,
            storyCommentRepliesHasMore: storyCommentRepliesHasMore,
            isLoadingComments: isLoadingComments,
            userLang: AuthManager.shared.currentUser?.preferredContentLanguages.first ?? "fr",
            isStoryExpired: currentStory?.isExpired() ?? false,
            targetCommentId: targetCommentId,
            targetParentCommentId: targetParentCommentId,
            huntTargetComment: { await huntTargetStoryComment() },
            loadMoreStoryCommentReplies: { await loadMoreStoryCommentReplies(commentId: $0) },
            revealTargetReply: { parentId, replyId in
                await revealTargetStoryReply(parentId: parentId, replyId: replyId)
            },
            showCommentsOverlay: $showCommentsOverlay,
            replyingToStoryComment: $replyingToStoryComment,
            zone: zone,
            makeStoryCommentRow: makeStoryCommentRow,
            toggleStoryCommentThread: toggleStoryCommentThread
        )
    }

    // MARK: - Story Comment Thread Management

    func toggleStoryCommentThread(_ commentId: String) async {
        if storyCommentExpandedThreads.contains(commentId) {
            storyCommentExpandedThreads.remove(commentId)
        } else {
            storyCommentExpandedThreads.insert(commentId)
            // Always refetch to get latest replies
            await loadStoryCommentReplies(commentId: commentId)
        }
    }

    func loadStoryCommentReplies(commentId: String) async {
        guard let story = currentStory,
              !storyCommentLoadingReplies.contains(commentId) else { return }
        storyCommentLoadingReplies.insert(commentId)
        defer { storyCommentLoadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: story.id, commentId: commentId
            )
            // Refetch-on-expand = première page → REPLACE + réinitialisation
            // du curseur ; les pages suivantes (loadMoreStoryCommentReplies)
            // s'append-ent dessus.
            storyCommentRepliesMap[commentId] = mapStoryReplies(response.data, parentId: commentId)
            storyCommentRepliesNextCursor[commentId] = response.pagination?.nextCursor
            storyCommentRepliesHasMore[commentId] = response.pagination?.hasMore ?? false
        } catch {
            // Échec réseau transitoire : on garde le thread OUVERT (le
            // refermer punissait l'utilisateur qui venait de l'ouvrir) —
            // il affiche son état vide/spinner et le prochain toggle ou
            // refetch opportuniste réessaiera.
            Logger.messages.error("[StoryViewer] loadStoryCommentReplies failed for \(commentId, privacy: .public): \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Page suivante (curseur `gt`, tri ASC → APPEND) des réponses d'un fil de
    /// commentaire de story. Jamais de remplacement : les réponses posées
    /// optimistiquement / par socket restent en place (dédup par id).
    /// NOTE : `storyCommentRepliesHasMore[id] == nil` (pagination jamais
    /// enregistrée — premier fetch échoué) n'est PAS bloquant : `cursor: nil`
    /// signifie « page 1 » et récupère un vrai curseur. Seul `false` stoppe.
    func loadMoreStoryCommentReplies(commentId: String) async {
        guard let story = currentStory,
              storyCommentRepliesHasMore[commentId] != false,
              !storyCommentLoadingReplies.contains(commentId) else { return }
        storyCommentLoadingReplies.insert(commentId)
        defer { storyCommentLoadingReplies.remove(commentId) }
        do {
            let response = try await PostService.shared.getCommentReplies(
                postId: story.id, commentId: commentId,
                cursor: storyCommentRepliesNextCursor[commentId], limit: 20
            )
            let fetched = mapStoryReplies(response.data, parentId: commentId)
            let existing = storyCommentRepliesMap[commentId] ?? []
            let existingIds = Set(existing.map(\.id))
            storyCommentRepliesMap[commentId] = existing + fetched.filter { !existingIds.contains($0.id) }
            storyCommentRepliesNextCursor[commentId] = response.pagination?.nextCursor
            storyCommentRepliesHasMore[commentId] = response.pagination?.hasMore ?? false
        } catch {
            // Échec réseau : stopper proprement la pagination (et toute chasse
            // en cours) — le fil garde les pages déjà chargées.
            storyCommentRepliesHasMore[commentId] = false
        }
    }

    /// Ciblage d'une RÉPONSE notifiée : déplie le fil du parent (refetch page 1,
    /// curseur réinitialisé) puis chasse les pages de réponses jusqu'à la cible
    /// (borné — cf. `CommentTargetHunter`). Retourne `true` si la réponse est
    /// chargée à l'issue de la chasse.
    func revealTargetStoryReply(parentId: String, replyId: String) async -> Bool {
        if !storyCommentExpandedThreads.contains(parentId) {
            await toggleStoryCommentThread(parentId)
        } else if storyCommentRepliesMap[parentId] == nil {
            await loadStoryCommentReplies(commentId: parentId)
        }
        return await CommentTargetHunter.hunt(
            isPresent: { storyCommentRepliesMap[parentId]?.contains(where: { $0.id == replyId }) ?? false },
            // `nil` = pagination inconnue (premier fetch échoué) → retenter la
            // page 1 ; seul `false` (fin de fil connue) arrête la chasse.
            hasMore: { storyCommentRepliesHasMore[parentId] != false },
            loadNextPage: { await loadMoreStoryCommentReplies(commentId: parentId) }
        )
    }

    private func mapStoryReplies(_ data: [APIPostComment], parentId: String) -> [FeedComment] {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        return data.map { FeedComment(api: $0, preferredLanguages: langs, parentId: parentId) }
    }

    // MARK: - Story Comment Reactions

    /// Applique un événement socket `comment:reaction-added` ou
    /// `comment:reaction-removed` en utilisant l'agrégation server-authoritative
    /// (`event.aggregation.count` + `event.aggregation.hasCurrentUser`).
    ///
    /// Avant 2026-05-28, le code maintenait deux états locaux séparés —
    /// `storyCommentLikedIds` (set d'ids likés par l'utilisateur) et
    /// `storyCommentLikeDelta` (offset depuis le count serveur) — et appliquait
    /// l'événement socket en patchant le delta selon `event.userId ==
    /// currentUserId`. Ce design dérivait facilement :
    ///   - Si `currentUserId` était nil ou mal formaté, l'événement propre était
    ///     traité comme « autre utilisateur » → delta double-comptait.
    ///   - Si le serveur émettait un `comment:reaction-removed` parasite (ex :
    ///     idempotence côté gateway), le delta repassait à 0 et le count
    ///     « disparaissait » à l'écran (bug user 2026-05-28).
    ///
    /// La solution : faire confiance à `event.aggregation` qui porte le state
    /// global (count total + flag `hasCurrentUser`) après application de
    /// l'événement. On met à jour `storyComments[i].likes` à ce count, on
    /// réinitialise le delta à 0, et on synchronise `storyCommentLikedIds`
    /// depuis `hasCurrentUser`. Le résultat affiché — `comment.likes + delta`
    /// — converge vers la vérité serveur sans flicker.
    /// Realtime asymmetry fix (mirrors `PostDetailViewModel.subscribeToSocket`'s
    /// `commentAdded` sink): a `comment:added` broadcast for the currently
    /// viewed story used to only move the sidebar's denormalized count (via
    /// `StoryViewModel`'s `storyGroups` mutation → the `.adaptiveOnChange(of:
    /// currentStory?.commentCount)` mirror) — the comments overlay's own
    /// `storyComments`/`storyCommentRepliesMap` never received the new row, so
    /// a viewer with the overlay open needed to close and reopen it to see a
    /// comment someone else just posted.
    func applyStoryCommentAdded(_ data: SocketCommentAddedData) {
        guard data.postId == currentStory?.id else { return }

        let comment = FeedComment(api: data.comment, preferredLanguages: resolvedViewerLanguageChain)

        let result = Self.applyingStoryCommentAdded(
            comment: comment,
            clientMutationId: data.clientMutationId,
            expandedThreads: storyCommentExpandedThreads,
            comments: storyComments,
            repliesMap: storyCommentRepliesMap
        )
        storyComments = result.comments
        storyCommentRepliesMap = result.repliesMap
        storyCommentCount = data.commentCount
    }

    /// Édition en temps réel (`comment:updated`) : remplace la ligne EN PLACE
    /// dans l'overlay (racine ou réponse) — idempotent par id, aucun compteur
    /// à toucher. Miroir de `PostDetailViewModel.applyCommentUpdated`.
    func applyStoryCommentUpdated(_ data: SocketCommentUpdatedData) {
        guard data.postId == currentStory?.id else { return }
        let updated = FeedComment(api: data.comment, preferredLanguages: resolvedViewerLanguageChain)
        let applied = StoryCommentEditing.replacing(updated, comments: storyComments, replies: storyCommentRepliesMap)
        storyComments = applied.comments
        storyCommentRepliesMap = applied.replies
    }

    /// Traduction de commentaire arrivée pendant la lecture : pose
    /// `translatedContent` (racine ou réponse) si la langue est préférée,
    /// qu'aucune traduction n'est déjà affichée, ET que la langue d'origine
    /// du commentaire n'occupe pas déjà un rang au moins aussi prioritaire
    /// dans le Prisme (#6531, règle unique —
    /// `FeedViewModel.applyCommentTranslation`).
    func applyStoryCommentTranslationUpdated(_ data: SocketCommentTranslationUpdatedData) {
        guard data.postId == currentStory?.id else { return }
        let langs = resolvedViewerLanguageChain.filter { !$0.isEmpty }.map { $0.lowercased() }
        guard let incomingRank = langs.firstIndex(where: { $0 == data.language.lowercased() }) else { return }
        func shouldApply(_ comment: FeedComment) -> Bool {
            guard comment.translatedContent == nil else { return false }
            let originalRank = comment.originalLanguage
                .map { $0.lowercased() }
                .flatMap { orig in langs.firstIndex(where: { $0 == orig }) }
            if let originalRank, originalRank <= incomingRank { return false }
            return true
        }
        let text = data.translation.text
        if let idx = storyComments.firstIndex(where: { $0.id == data.commentId }),
           shouldApply(storyComments[idx]) {
            storyComments[idx].translatedContent = text
            return
        }
        for (key, var replies) in storyCommentRepliesMap {
            if let idx = replies.firstIndex(where: { $0.id == data.commentId }), shouldApply(replies[idx]) {
                replies[idx].translatedContent = text
                storyCommentRepliesMap[key] = replies
                return
            }
        }
    }

    /// Pure routing/dedup decision for a `comment:added` broadcast — extracted
    /// so it's directly unit-testable (`StoryViewerCommentRealtimeTests`)
    /// without constructing a live view (mirrors `rollingBackOptimisticComment`
    /// just above). The echoed broadcast for OUR OWN just-sent comment/reply:
    /// `sendComment` already inserted an optimistic `temp_` placeholder and
    /// bumped the counters synchronously — it never reconciles that
    /// placeholder on POST success. Without the `isTwin` check the server's
    /// real row lands ALONGSIDE the temp_ one (visible duplicate) and, for a
    /// reply, the parent's `replies` count gets incremented a second time.
    /// Mirrors `FeedCommentsSheet`'s `isTwin` reconciliation for the
    /// equivalent case.
    nonisolated static func applyingStoryCommentAdded(
        comment: FeedComment,
        clientMutationId: String? = nil,
        expandedThreads: Set<String>,
        comments: [FeedComment],
        repliesMap: [String: [FeedComment]]
    ) -> (comments: [FeedComment], repliesMap: [String: [FeedComment]]) {
        var comments = comments
        var repliesMap = repliesMap

        // Clé primaire : le cmid ré-émis par le gateway matche exactement l'id
        // de la ligne optimiste. Repli : les lignes `temp_` héritées, matchées
        // par auteur + contenu + parent (fragile quand le serveur normalise le
        // texte — d'où le cmid).
        func isTwin(_ c: FeedComment) -> Bool {
            if let clientMutationId, c.id == clientMutationId { return true }
            return c.id.hasPrefix("temp_")
                && c.authorId == comment.authorId
                && c.content == comment.content
                && c.parentId == comment.parentId
        }

        if let parentId = comment.parentId {
            var existing = repliesMap[parentId] ?? []
            if let idx = existing.firstIndex(where: isTwin) {
                existing[idx] = comment
                repliesMap[parentId] = existing
            } else {
                if expandedThreads.contains(parentId), !existing.contains(where: { $0.id == comment.id }) {
                    existing.append(comment)
                    repliesMap[parentId] = existing
                }
                if let idx = comments.firstIndex(where: { $0.id == parentId }) {
                    comments[idx].replies += 1
                }
            }
        } else if let idx = comments.firstIndex(where: isTwin) {
            comments[idx] = comment
        } else if !comments.contains(where: { $0.id == comment.id }) {
            comments.append(comment)
        }

        return (comments, repliesMap)
    }

    func applyCommentReactionEvent(_ event: SocketCommentReactionUpdateEvent) {
        // 2026-05-29 : on ne gate plus sur `showCommentsOverlay` — l'état doit
        // rester aligné sur le serveur même quand l'overlay est fermé.
        // Si `storyComments` est vide (overlay jamais ouvert), `firstIndex(where:)`
        // plus bas retourne nil et on skip silencieusement ; on se ré-aligne
        // au prochain load via `computeLikedIds(fromCachedComments:)` (Task 3).
        guard event.postId == currentStory?.id else { return }
        guard event.emoji == Self.heartEmoji else { return }

        let commentId = event.commentId
        let serverCount = event.aggregation.count

        // Mise à jour de likedIds depuis l'agrégat (source de vérité) — « mon
        // cœur » dérive de `userIds` (la liste des User.id ayant réagi), PAS de
        // `hasCurrentUser` : ce flag est calculé côté gateway relativement à
        // l'ACTEUR de l'événement, donc il vaut true pour le like d'un TIERS et
        // allumait le cœur de tous les destinataires du broadcast.
        var resolvedCount = serverCount
        if let myId = AuthManager.shared.currentUser?.id {
            if event.aggregation.userIds.contains(myId) {
                storyCommentLikedIds.insert(commentId)
            } else if event.userId == myId {
                // L'événement décrit MA propre action : agrégat autoritatif.
                storyCommentLikedIds.remove(commentId)
            } else if storyCommentLikedIds.contains(commentId) {
                // Agrégat d'un TIERS pendant que MON like est encore en vol :
                // il ne me connaît pas — préserver le cœur, compter le mien
                // par-dessus (l'écho de mon propre like reconfirmera).
                resolvedCount = serverCount + 1
            }
        }

        // Reset du delta et propagation du count serveur dans la liste pour
        // que la prochaine reaction parte d'une baseline propre.
        storyCommentLikeDelta[commentId] = 0
        if let idx = storyComments.firstIndex(where: { $0.id == commentId }) {
            storyComments[idx].likes = resolvedCount
        } else if let parentId = storyComments.first(where: { storyCommentRepliesMap[$0.id]?.contains(where: { $0.id == commentId }) == true })?.id,
                  var replies = storyCommentRepliesMap[parentId],
                  let replyIdx = replies.firstIndex(where: { $0.id == commentId }) {
            replies[replyIdx].likes = resolvedCount
            storyCommentRepliesMap[parentId] = replies
        }
    }

    func toggleStoryCommentLike(_ comment: FeedComment) async {
        let id = comment.id
        guard !heartInFlightIds.contains(id) else { return }
        heartInFlightIds.insert(id)
        defer { heartInFlightIds.remove(id) }

        let wasLiked = storyCommentLikedIds.contains(id)
        let postId = currentStory?.id ?? ""

        withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
            if wasLiked {
                storyCommentLikedIds.remove(id)
                storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) - 1
            } else {
                storyCommentLikedIds.insert(id)
                storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) + 1
            }
        }

        do {
            if wasLiked {
                _ = try await SocialSocketManager.shared.removeCommentReaction(commentId: id, postId: postId, emoji: StoryViewerView.heartEmoji)
            } else {
                _ = try await SocialSocketManager.shared.addCommentReaction(commentId: id, postId: postId, emoji: StoryViewerView.heartEmoji)
            }
        } catch {
            withAnimation {
                if wasLiked {
                    storyCommentLikedIds.insert(id)
                    storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) + 1
                } else {
                    storyCommentLikedIds.remove(id)
                    storyCommentLikeDelta[id] = (storyCommentLikeDelta[id] ?? 0) - 1
                }
            }
        }
    }

    // MARK: - Load Comments

    static func computeLikedIds(from comments: [APIPostComment]) -> Set<String> {
        return Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    /// Overload pour le chemin cache : `FeedComment` (déjà mappé) porte maintenant
    /// `currentUserReactions` (cf. `FeedModels.swift`). Permet de restaurer
    /// `storyCommentLikedIds` au cold start sans round-trip réseau.
    static func computeLikedIds(fromCachedComments comments: [FeedComment]) -> Set<String> {
        return Set(
            comments
                .filter { $0.currentUserReactions?.contains(StoryViewerView.heartEmoji) == true }
                .map { $0.id }
        )
    }

    func loadStoryComments() {
        guard let story = currentStory, !isLoadingComments else { return }
        Task { await loadStoryCommentsAsync(story: story) }
    }

    private func loadStoryCommentsAsync(story: StoryItem) async {
        let cacheKey = "post-\(story.id)"

        let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
        // Stale-write guard: drop the result ONLY if the viewer has CLEARLY
        // swiped to a different known story. A transient `currentStory == nil`
        // (group/index race during socket updates) must NOT drop the response
        // — otherwise the overlay stays empty for a story that has comments.
        if let now = currentStory?.id, now != story.id { return }
        switch cached {
        case .fresh(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            return
        case .stale(let comments, _):
            storyComments = comments
            storyCommentLikedIds = Self.computeLikedIds(fromCachedComments: comments)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
        case .expired, .empty:
            isLoadingComments = true
        }

        await fetchStoryCommentsFromNetwork(story: story, cacheKey: cacheKey)
        isLoadingComments = false
    }

    /// Ligne de l'overlay bâtie depuis la PREMIÈRE charge réseau — le chemin
    /// principal, celui de chaque ouverture sur cache froid. Sa langue passe par
    /// le résolveur canonique du Prisme, comme les trois autres chemins de ce
    /// fichier (réponses, temps réel, pagination) : la fermeture locale qui
    /// vivait ici ignorait `originalLanguage`, si bien qu'un commentaire déjà
    /// écrit dans la langue n°1 du lecteur s'affichait traduit dans sa langue
    /// n°2 dès que le serveur avait produit cette traduction pour d'autres.
    /// Extrait en `static` pour que le témoin de RANG lise ce chemin-ci, pas
    /// seulement le résolveur.
    static func storyComment(from c: APIPostComment, preferredLanguages langs: [String]) -> FeedComment {
        FeedComment(api: c, preferredLanguages: langs)
    }

    private func fetchStoryCommentsFromNetwork(story: StoryItem, cacheKey: String) async {
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        do {
            let response = try await PostService.shared.getComments(postId: story.id, cursor: nil, limit: 50)
            // Stale-write guard: drop ONLY if user has clearly swiped to a
            // different known story (tolerate transient nil reads).
            if let now = currentStory?.id, now != story.id { return }
            let comments = response.data.map { Self.storyComment(from: $0, preferredLanguages: langs) }
            storyComments = comments
            storyCommentsNextCursor = response.pagination?.nextCursor
            storyCommentsHasMore = response.pagination?.hasMore ?? false
            storyCommentLikedIds = Self.computeLikedIds(from: response.data)
            let topAll = comments.filter { $0.parentId == nil }
            storyCommentCount = topAll.count + topAll.reduce(0) { $0 + $1.replies }
            try? await CacheCoordinator.shared.comments.save(comments, for: cacheKey)

            let topLevel = topAll.filter { $0.replies > 0 }
            Task {
                for comment in topLevel.prefix(5) {
                    await loadStoryCommentReplies(commentId: comment.id)
                }
            }
        } catch {
            // Cache-first : l'overlay garde les commentaires cachés déjà
            // affichés ; on logue l'échec du refresh réseau au lieu de
            // l'avaler (diagnostic des overlays vides signalés).
            Logger.messages.error("[StoryViewer] fetchStoryComments failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Page suivante (plus ancienne) des commentaires top-level de la story —
    /// utilisée par la chasse paginée d'un commentaire notifié hors de la
    /// première page. Append + dédup (jamais de remplacement : le fetch plein
    /// reste le seul à réinitialiser la liste).
    func loadNextStoryCommentsPage() async {
        guard storyCommentsHasMore, let story = currentStory else { return }
        let langs = AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        do {
            let response = try await PostService.shared.getComments(
                postId: story.id, cursor: storyCommentsNextCursor, limit: 50
            )
            if let now = currentStory?.id, now != story.id { return }
            let fetched = response.data.map { FeedComment(api: $0, preferredLanguages: langs) }
            let existing = Set(storyComments.map(\.id))
            storyComments.append(contentsOf: fetched.filter { !existing.contains($0.id) })
            storyCommentsNextCursor = response.pagination?.nextCursor
            storyCommentsHasMore = response.pagination?.hasMore ?? false
        } catch {
            storyCommentsHasMore = false
        }
    }

    /// Chasse bornée du commentaire ciblé par la notification (racine ou
    /// parent de thread) — cf. `CommentTargetHunter`.
    func huntTargetStoryComment() async {
        let anchors = [targetCommentId, targetParentCommentId].compactMap { $0 }
        guard !anchors.isEmpty else { return }
        _ = await CommentTargetHunter.hunt(
            isPresent: { storyComments.contains { anchors.contains($0.id) } },
            hasMore: { storyCommentsHasMore },
            loadNextPage: { await loadNextStoryCommentsPage() }
        )
    }

    /// Seeds `storyCommentCount` for the slide that just became visible.
    ///
    /// Uses the count baked into the story payload as the first approximation,
    /// then reconciles with the local comments cache if one exists. The payload
    /// is frequently a >24h client cache, so its count can be a stale 0 for a
    /// story that has since gained comments — and the sidebar hides the comments
    /// button at 0. To break that, when (and ONLY when) the count is still 0
    /// after the cache check, a single debounced network reconciliation confirms
    /// the real count. The 400ms dwell + stale-id guard keep this O(1) per
    /// *watched* story (never the O(N)-on-swipe fetch removed in 2026-05-28).
    ///
    /// Every time a reconciliation branch actually MOVES `storyCommentCount`
    /// (cache hit or network stale-0 fix), it also bumps
    /// `storyCommentCountReconciledPulse` — the dedicated, one-way signal
    /// `StoryActionSidebarView` watches to re-open its already-frozen rail
    /// membership for the comments button. This is what makes the reveal
    /// happen on a NORMAL open (tray/profile/feed — no notification postId),
    /// not just on the notification path already covered upstream by
    /// `StoryViewModel.refreshFromCachedPostIfAvailable`.
    func loadStoryCommentCount() {
        guard let story = currentStory else {
            storyCommentCount = 0
            storyComments = []
            return
        }

        storyCommentCount = story.commentCount

        Task {
            let cacheKey = "post-\(story.id)"
            let cached = await CacheCoordinator.shared.comments.load(for: cacheKey)
            if let now = currentStory?.id, now != story.id { return }
            switch cached {
            case .fresh(let comments, _), .stale(let comments, _):
                let top = comments.filter { $0.parentId == nil }
                let total = top.count + top.reduce(0) { $0 + $1.replies }
                // Le bump ne s'exécute que sur un changement RÉEL de valeur —
                // `storyCommentCountReconciledPulse` doit rester silencieux
                // quand le cache confirme simplement le seed du payload.
                // Voir StoryActionSidebarView pour le consommateur : SEUL ce
                // canal peut faire réapparaître le bouton commentaires après
                // le gel, jamais une activité temps réel.
                if total != storyCommentCount {
                    storyCommentCount = total
                    storyCommentCountReconciledPulse += 1
                }
                return
            case .expired, .empty:
                break
            }

            // Stale-0 reconciliation. The story payload is frequently served from
            // a >24h client cache, so its `commentCount` can read 0 for a story
            // that has since received comments; with no comment cache above we
            // cannot distinguish a genuine 0 from a stale 0, and the sidebar's
            // `count > 0` gate then hides the comments button even though the
            // thread exists (user-reported: « malgré les commentaires on ne
            // voyait rien »). Confirm against the network — but ONLY for the
            // ambiguous 0, and debounced so a fast swipe-through never spams it
            // (the O(N)-on-swipe regression of 2026-05-28). 400ms dwell + the
            // stale-id guard mean only stories the viewer actually pauses on
            // trigger a single lightweight reconciliation.
            guard storyCommentCount == 0 else { return }
            try? await Task.sleep(nanoseconds: 400_000_000)
            if let now = currentStory?.id, now != story.id { return }
            guard let response = try? await PostService.shared.getComments(
                postId: story.id, cursor: nil, limit: 50
            ) else { return }
            if let now = currentStory?.id, now != story.id { return }
            // Same formula as the cache/open paths: top-level comments + their
            // replies. A genuinely empty thread stays 0 → button stays hidden.
            let top = response.data.filter { $0.parentId == nil }
            let total = top.count + top.reduce(0) { $0 + ($1.replyCount ?? 0) }
            if total != storyCommentCount {
                storyCommentCount = total
                storyCommentCountReconciledPulse += 1
            }
        }
    }
}
