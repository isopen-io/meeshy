import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La navigation vers un commentaire ciblé** (notification de like, de
/// réponse ou de commentaire). Extrait de `PostDetailView.swift` (#10956).
extension PostDetailView {

    /// Notification → comment navigation. Scrolls to (and briefly highlights) the
    /// targeted comment once it's loaded. For a reply, scrolls to the parent
    /// section and expands its thread so the reply is revealed. Falls back to the
    /// legacy "reveal comments + focus composer" behaviour when there's no target.
    /// Runs once (guarded by `didScrollToTargetComment`); re-invoked as comments
    /// page in until the target is present.
    func attemptScrollToTargetComment(using proxy: ScrollViewProxy) {
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
}
