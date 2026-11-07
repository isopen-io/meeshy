import Foundation
import MeeshySDK

// MARK: - Actions sur le post chargé

/// Signalement, suppression et épinglage du post affiché, hors de
/// `PostDetailViewModel.swift`.
extension PostDetailViewModel {

    /// Reports the loaded post as inappropriate. Mirrors `FeedViewModel.reportPost`
    /// — uses ReportService directly so PostDetailView doesn't have to dual-wire.
    func reportPost(_ postId: String) async {
        do {
            try await ReportService.shared.reportPost(postId: postId, reportType: "inappropriate", reason: nil)
            FeedbackToastManager.shared.showSuccess(String(localized: "profile.posts.report.success", defaultValue: "Signalement envoyé", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "post.detail.report.error", defaultValue: "Erreur lors du signalement"))
        }
    }

    /// Deletes the loaded post. Mirrors `FeedViewModel.deletePost` — no local
    /// list to remove from (this IS the single loaded post), so success just
    /// reports true and the caller (`PostDetailView`) pops the screen.
    @discardableResult
    func deletePost(_ postId: String, reason: String? = nil) async -> Bool {
        await withdrawPost(postId, .delete(reason: reason))
    }

    /// Suppression, retrait ou passage en privé (#11535) : `true` quand le serveur l'a appliqué — l'écran se referme.
    @discardableResult
    func withdrawPost(_ postId: String, _ withdrawal: PublicationWithdrawal) async -> Bool {
        guard !ClientMutationId.isValid(postId) else { return await cancelPendingSend(postId) }
        do {
            try await withdrawal.perform(postId: postId, with: postService)
            FeedbackToastManager.shared.showSuccess(withdrawal.successText(deleted: String(localized: "feed.post.deleted", defaultValue: "Publication supprimée", bundle: .main)))
            return true
        } catch {
            FeedbackToastManager.shared.showError(withdrawal.failureText(deleteError: String(localized: "feed.post.deleteError", defaultValue: "Erreur lors de la suppression", bundle: .main)))
            return false
        }
    }

    /// **Une publication encore dans la file d'envoi s'ANNULE** (#10331) : son
    /// id est le cmid de sa ligne `.createPost`, et rien n'existe côté serveur
    /// à supprimer. Même action que la pastille (`PendingPublicationCancel`).
    private func cancelPendingSend(_ cmid: String) async -> Bool {
        await PendingPublicationCancel.run(cmid, queue: offlineQueue)
    }

    /// Ferme / rouvre les commentaires du post affiché (#16541). Rouvrir
    /// efface aussi un refus local : la surface redevient ce que le serveur dit.
    func toggleComments() async {
        guard let post else { return }
        await CommentSettingsToggle.run(postId: post.id, current: post.commentsDisabled, service: postService) { closed in
            self.post?.commentsDisabled = closed
            if !closed { commentsRefusedLocally = false }
        }
    }

    /// Le composeur cède la place à la ligne « commentaires désactivés ».
    var commentsClosed: Bool { (post?.commentsClosed ?? false) || commentsRefusedLocally }

    /// Pose l'état servi par `post:updated` sur le post affiché.
    func applyServedCommentClosure(_ served: APIPost) {
        post?.commentsDisabled = served.commentsDisabled ?? false
        post?.repost?.commentsDisabled = served.repostOf?.commentsDisabled ?? false
        if !served.commentsClosed { commentsRefusedLocally = false }
    }

    func pinPost(_ postId: String) async {
        do {
            try await postService.pinPost(postId: postId)
            FeedbackToastManager.shared.showSuccess(String(localized: "feed.post.pinned", defaultValue: "Publication épinglée", bundle: .main))
        } catch {
            FeedbackToastManager.shared.showError(String(localized: "feed.post.pinError", defaultValue: "Erreur lors de l'épinglage", bundle: .main))
        }
    }
}
