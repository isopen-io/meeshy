import Foundation
import MeeshySDK

// MARK: - Publications encore dans la file (#10321)
extension FeedViewModel {

    /// **« Annuler l'envoi » sur une carte encore en file** (#10321) — la carte
    /// part tout de suite, l'action est celle de la pastille et du détail
    /// (`PendingPublicationCancel`). Si rien n'a pu être arrêté (déjà partie,
    /// base en échec), la carte revient à sa place ; le serveur fait foi.
    func withdrawPendingPublication(_ cmid: String) async {
        let removedIndex = posts.firstIndex(where: { $0.id == cmid })
        let removedPost = removedIndex.map { posts[$0] }
        removeOptimisticPost(id: cmid)
        guard !(await PendingPublicationCancel.run(cmid, queue: offlineQueue, feedCache: feedCache)),
              let removedPost, let removedIndex else { return }
        posts = OptimisticRollback.restoring(removedPost, at: removedIndex, into: posts)
    }

    /// Returns the last POST/REEL that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the feed composer can pre-fill it as a draft
    /// — only when that composer can restore it (`FeedDraftRecovery`).
    func recoverUnsentPost() async -> RecoveredOfflinePost? {
        let draft = await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["POST", "REEL"],
            olderThan: Self.offlineStuckThreshold
        )
        return draft.flatMap { FeedDraftRecovery.isProposable($0) ? $0 : nil }
    }

    /// Supersedes a recovered post/reel when the user re-sends it from the
    /// composer, so the resend replaces the stuck row (and reclaims its
    /// pending-media files) instead of duplicating it on reconnect.
    ///
    /// Also drops the orphaned optimistic feed post keyed by this cmid: an
    /// offline post/reel was inserted optimistically (id == cmid) when first
    /// queued, and its `.createPost` row is what we're now deleting — without
    /// this the optimistic card would linger in the feed forever (its row gone,
    /// so it can never reconcile). The resend inserts a fresh optimistic card
    /// under a new cmid.
    func supersedeRecoveredPost(clientMutationId: String) async {
        removeOptimisticPost(id: clientMutationId)
        await offlineQueue.cancelCreatePost(clientMutationId: clientMutationId)
    }

    /// Removes an optimistic post by id (re-resolving the index since the feed
    /// may mutate across an `await`). Rolls back a queued create the outbox
    /// refused or exhausted.
    /// Retire le commentaire optimiste `cmid` du post — et lui seul : les commentaires reçus pendant
    /// l'attente restent. Le compteur suit la ligne retirée.
    func withdrawOptimisticComment(_ cmid: String, fromPost postId: String) {
        guard let i = posts.firstIndex(where: { $0.id == postId }) else { return }
        let result = OptimisticRollback.withdrawing(cmid, from: posts[i].comments)
        posts[i].comments = result.items
        posts[i].commentCount = OptimisticRollback.decremented(posts[i].commentCount, removed: result.removed)
    }

    /// **La carte d'un post en attente montre SA photo** (#15095). La file a
    /// copié les fichiers sous `Documents/pending-media/<cmid>/` puis effacé
    /// leurs sources : la carte optimiste, qui visait encore ces sources, ne
    /// rendait plus qu'un aplat. Elle vise désormais la copie que la file
    /// garde jusqu'à l'envoi.
    func showRelocatedMedia(of cmid: String, storedPaths: [String]) {
        guard let i = posts.firstIndex(where: { $0.id == cmid }),
              let relocated = PendingPublicationLocalMedia.relocated(posts[i], storedPaths: storedPaths) else { return }
        posts[i] = relocated
        debouncedCacheSave()
    }

    func removeOptimisticPost(id: String) {
        guard let i = posts.firstIndex(where: { $0.id == id }) else { return }
        posts.remove(at: i)
        debouncedCacheSave()
    }
}

/// **Le média local d'une publication en attente suit le conteneur de l'app**
/// (#15095). Le cache du fil garde l'URL `file://` absolue de la copie que la
/// file d'envoi détient ; le dossier `…/Data/Application/<UUID>/` change d'un
/// lancement à l'autre (mise à jour, réinstallation, simulateur), et la carte
/// relue visait l'ANCIEN conteneur. Seules les cartes en attente sont
/// touchées : une carte publiée ne porte jamais de fichier local.
nonisolated enum PendingPublicationLocalMedia {
    static func rebased(_ posts: [FeedPost], ontoHome home: String = NSHomeDirectory()) -> [FeedPost] {
        posts.map { post in
            guard PendingPublicationMarker.isPending(postId: post.id) else { return post }
            var rebased = post
            rebased.media = post.media.map { media in
                guard let url = media.url.flatMap(URL.init(string:)), url.isFileURL else { return media }
                let path = StoryMediaReference.rebasing(url.path, ontoHome: home)
                return path == url.path ? media : pointing(media, at: URL(fileURLWithPath: path))
            }
            return rebased
        }
    }

    static func relocated(_ post: FeedPost, storedPaths: [String]) -> FeedPost? {
        guard post.media.count == storedPaths.count else { return nil }
        var relocated = post
        relocated.media = zip(post.media, storedPaths).map { media, stored in
            pointing(media, at: URL(fileURLWithPath: OfflineQueue.absoluteMediaPath(forStored: stored)))
        }
        return relocated
    }

    static func optimisticMedia(_ files: [URL], declaredMimeTypes: [String]?) -> [FeedMedia] {
        files.enumerated().map { index, url in
            optimistic(forLocalURL: url, declaredMimeType: declaredMimeTypes.flatMap {
                $0.indices.contains(index) ? $0[index] : nil
            })
        }
    }

    /// Builds the optimistic `FeedMedia` for a not-yet-uploaded local file,
    /// deriving the type from its DECLARED mime — and only from its extension
    /// when nothing was declared. The `file://` URL is replaced by the server
    /// media URL on reconcile.
    ///
    /// La distinction n'est pas cosmétique : un vocal importé en `.caf` se
    /// re-dérivait en `application/octet-stream`, donc `AttachmentKind` le
    /// classait autrement qu'audio et la carte optimiste s'affichait comme une
    /// IMAGE — un lecteur absent là où l'auteur venait d'enregistrer sa voix.
    static func optimistic(
        forLocalURL url: URL, declaredMimeType: String?
    ) -> FeedMedia {
        let mime = declaredMimeType ?? MimeTypeResolver.mimeType(forExtension: url.pathExtension)
        let type: FeedMediaType
        switch AttachmentKind(mimeType: mime) {
        case .video: type = .video
        case .audio: type = .audio
        default: type = .image
        }
        return FeedMedia(type: type, url: url.absoluteString)
    }

    static func pointing(_ media: FeedMedia, at file: URL) -> FeedMedia {
        FeedMedia(id: media.id, type: media.type, url: file.absoluteString,
                  thumbnailColor: media.thumbnailColor,
                  width: media.width, height: media.height, duration: media.duration,
                  fileName: media.fileName, caption: media.caption, alt: media.alt)
    }
}
