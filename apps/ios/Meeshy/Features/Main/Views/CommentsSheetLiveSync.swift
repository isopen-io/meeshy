import SwiftUI
import Combine
import MeeshySDK

/// Le temps réel de la feuille de commentaires : abonne la feuille aux
/// événements socket du post et réconcilie, par ses bindings, la liste
/// (`liveComments`), les fils (`repliesMap`), le compteur et l'état des cœurs.
/// La feuille ne garde que l'affichage ; l'édition locale (`applyEdit`) reste
/// la sienne, partagée avec l'optimiste de `submitCommentEdit`.
struct CommentsSheetLiveSync: ViewModifier {
    let post: FeedPost
    @Binding var liveComments: [FeedComment]?
    @Binding var liveCommentCount: Int?
    @Binding var repliesMap: [String: [FeedComment]]
    @Binding var expandedThreads: Set<String>
    @Binding var hearts: CommentHeartLedger
    let applyEdit: (FeedComment) -> Void

    func body(content: Content) -> some View {
        content
            .onReceive(
                SocialSocketManager.shared.commentAdded
                    .receive(on: DispatchQueue.main)
                    .filter { [postId = post.id] in $0.postId == postId }
            ) { data in
                handleCommentAdded(data)
            }
            // Édition en temps réel : remplace la ligne EN PLACE (contenu, effets,
            // traductions régénérées) — idempotent avec l'optimiste local.
            .onReceive(
                SocialSocketManager.shared.commentUpdated
                    .receive(on: DispatchQueue.main)
                    .filter { [postId = post.id] in $0.postId == postId }
            ) { data in
                let langs = ReaderPrism.resolve(for: AuthManager.shared.currentUser)
                let updated = FeedComment(api: data.comment, preferredLanguages: langs)
                let topLevelWasLoaded = liveComments != nil
                applyEdit(updated)
                persistCommentCache(
                    touchedThreadIds: updated.parentId.map { [$0] } ?? [],
                    topLevelWasLoaded: topLevelWasLoaded
                )
            }
            // Traduction de commentaire arrivée (pipeline async ou demande à la
            // demande) : pose `translatedContent` si la langue est préférée,
            // qu'aucune traduction n'est déjà affichée, ET que la langue d'origine
            // du commentaire n'occupe pas déjà un rang au moins aussi prioritaire
            // dans le Prisme (#6531, règle unique — miroir de
            // `FeedViewModel.applyCommentTranslation`).
            .onReceive(
                SocialSocketManager.shared.commentTranslationUpdated
                    .receive(on: DispatchQueue.main)
                    .filter { [postId = post.id] in $0.postId == postId }
            ) { data in
                handleCommentTranslation(data)
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
    }

    private func handleCommentAdded(_ data: SocketCommentAddedData) {
        let parentId = data.comment.parentId
        // Parité effets + Prisme avec le mapping REST : sans effectFlags, un
        // commentaire stylé arrivant en temps réel rendait SANS ses effets.
        let langs = ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        let feedComment = FeedComment(api: data.comment, preferredLanguages: langs)
        let current = liveComments ?? post.comments
        // L'écho de NOTRE envoi remplace la ligne optimiste EN PLACE (cmid) ;
        // une réponse nouvelle compte sur son parent — la règle unique du fil.
        let echo = FeedCommentThread(roots: current, replies: repliesMap)
            .applyingEcho(feedComment, clientMutationId: data.clientMutationId,
                          expandedThreads: expandedThreads, at: .first)
        liveCommentCount = data.commentCount
        guard echo.effect != .known else { return }
        repliesMap = echo.thread.replies
        if parentId == nil || (echo.effect == .inserted && current.contains { $0.id == parentId }) {
            liveComments = echo.thread.roots
        }
        guard echo.effect == .reconciled else { return }
        // Réécriture du cache avec la ligne RÉCONCILIÉE : un cache persisté
        // pendant que la ligne optimiste (cmid) était encore là garderait le
        // fantôme pour toujours. Scope STRICT à la réconciliation — persister
        // sur l'insertion d'un TIERS écraserait un fil caché plus complet.
        let key = parentId.map { "replies-\($0)" } ?? "post-\(post.id)"
        let rows = parentId.map { echo.thread.replies[$0] ?? [] } ?? echo.thread.roots
        Task {
            await bestEffort("commentsSheetLiveSync.comments.savePreservingFreshness", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(CommentSheetRules.persistableComments(rows), for: key) }
        }
    }

    /// A translation that arrived joins the comment's map and re-resolves
    /// through the Prism — the thread's one rule (`mergingTranslation`).
    private func handleCommentTranslation(_ data: SocketCommentTranslationUpdatedData) {
        let topLevelWasLoaded = liveComments != nil
        let current = liveComments ?? post.comments
        let merged = FeedCommentThread(roots: current, replies: repliesMap).mergingTranslation(
            data.translation.text, commentId: data.commentId, language: data.language,
            preferredLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser))
        if current.contains(where: { $0.id == data.commentId }) {
            liveComments = merged.roots
            persistCommentCache(touchedThreadIds: [], topLevelWasLoaded: topLevelWasLoaded)
            return
        }
        guard let key = repliesMap.first(where: { $0.value.contains { $0.id == data.commentId } })?.key else { return }
        repliesMap = merged.replies
        persistCommentCache(touchedThreadIds: [key], topLevelWasLoaded: topLevelWasLoaded)
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
        let writes = CommentSheetRules.cacheWrites(
            postId: post.id,
            liveComments: topLevelWasLoaded ? liveComments : nil,
            repliesMap: repliesMap,
            touchedThreadIds: touchedThreadIds
        )
        guard !writes.isEmpty else { return }
        Task {
            for write in writes {
                await bestEffort("commentsSheetLiveSync.comments.savePreservingFreshness.3", category: .cache) { try await CacheCoordinator.shared.comments.savePreservingFreshness(write.comments, for: write.key) }
            }
        }
    }

    /// Réconciliation par l'agrégat absolu d'un événement cœur de commentaire —
    /// pose `likes = count` (top-level ou réponse), purge le delta optimiste et
    /// dérive « mon cœur » de la liste des réacteurs. Miroir de
    /// `PostDetailViewModel.applyCommentReactionAggregate`.
    private func applyCommentReactionAggregate(commentId: String, count: Int, reactorUserIds: [String], actorUserId: String) {
        let resolvedCount = hearts.reconcile(commentId: commentId, count: count, reactorUserIds: reactorUserIds,
                                             actorUserId: actorUserId, myUserId: AuthManager.shared.currentUser?.id)
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
}
