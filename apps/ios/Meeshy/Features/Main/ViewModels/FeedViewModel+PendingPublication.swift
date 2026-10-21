import Foundation
import MeeshySDK

// MARK: - Publications encore dans la file (#10321)
extension FeedViewModel {

    /// **« Supprimer » sur une carte encore en file d'envoi** (#10321).
    ///
    /// La carte optimiste porte le cmid de sa ligne `.createPost` : il n'existe
    /// rien côté serveur à supprimer, un `DELETE` y échouait et la ligne
    /// partait quand même au retour du réseau. Le geste retire donc la ligne de
    /// la file, localement, sans appeler le serveur. Une ligne déjà EN VOL est
    /// marquée : l'envoi s'arrête au prochain point de contrôle, et si la
    /// requête était déjà partie, le serveur fait foi — la publication
    /// apparaîtra en ligne au rechargement, sans carte fantôme ici.
    func withdrawPendingPublication(_ cmid: String) async {
        let removedIndex = posts.firstIndex(where: { $0.id == cmid })
        let removedPost = removedIndex.map { posts[$0] }
        removeOptimisticPost(id: cmid)
        // Remet CETTE carte à sa place — le fil chargé pendant l'attente reste (`OptimisticRollback`).
        let putBack = { [weak self] in
            guard let self, let removedPost, let removedIndex else { return }
            self.posts = OptimisticRollback.restoring(removedPost, at: removedIndex, into: self.posts)
        }
        switch await offlineQueue.cancelPendingPublication(clientMutationId: cmid) {
        case .removed, .cancelRequested:
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.pending.withdrawn", defaultValue: "Envoi annulé", bundle: .main))
        case .notFound:
            putBack()
            FeedbackToastManager.shared.showError(String(localized: "feed.post.pending.alreadySent", defaultValue: "Cette publication vient de partir. Supprimez-la une fois en ligne.", bundle: .main))
        case .failed:
            putBack()
            FeedbackToastManager.shared.showError(String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main))
        }
    }

    /// Returns the last POST/REEL that got stuck offline (unsent for more than
    /// `offlineStuckThreshold`) so the feed composer can pre-fill it as a draft.
    ///
    /// **Une ligne dont un média est de l'AUDIO n'est jamais proposée, et c'est
    /// une garde de CONTENU, pas une préférence d'ergonomie.**
    ///
    /// Le composer du feed ne sait pas rouvrir un enregistrement : sa
    /// restauration ne traite que l'image et la vidéo
    /// (`FeedView+Attachments.restoreRecoveredMedia`). Offrir la ligne quand
    /// même produisait une chaîne complète de DESTRUCTION — brouillon
    /// « restauré » VIDE (un vocal n'a pas de texte), `recoveredPostCmid` posé
    /// malgré tout, puis, à la publication suivante quelle qu'elle soit,
    /// `supersedeRecoveredPost` → `cancelCreatePost`, qui efface le fichier
    /// relocalisé ET la ligne. L'enregistrement n'a alors JAMAIS été vu par son
    /// auteur, et rien ne le lui dit.
    ///
    /// Le trou n'existait pas avant que les deux jumeaux audio entrent dans
    /// cette file : `case .audio: break` y était juste, et son commentaire
    /// (« audio offline posts aren't queued through this composer path yet »)
    /// était vrai. Un lot qui fait CONVERGER une chaîne doit énumérer les
    /// CONSOMMATEURS de la ligne qu'il vient de créer, pas seulement les
    /// producteurs.
    ///
    /// Prix assumé : tant qu'un vocal est bloqué en file, aucun brouillon plus
    /// ancien n'est proposé. Une affordance de reprise retardée n'est pas
    /// comparable à un enregistrement détruit.
    func recoverUnsentPost() async -> RecoveredOfflinePost? {
        let draft = await offlineQueue.recoverLastUnsentPost(
            matchingTypes: ["POST", "REEL"],
            olderThan: Self.offlineStuckThreshold
        )
        guard let draft else { return nil }
        let porteUneVoix = draft.localMediaURLs.contains { url in
            AttachmentKind(mimeType: MimeTypeResolver.mimeType(forURL: url)) == .audio
        }
        return porteUneVoix ? nil : draft
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

    func removeOptimisticPost(id: String) {
        guard let i = posts.firstIndex(where: { $0.id == id }) else { return }
        posts.remove(at: i)
        debouncedCacheSave()
    }
}
