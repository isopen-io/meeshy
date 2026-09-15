import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'édition d'un commentaire depuis la feuille du fil, hors du god object.**
///
/// `FeedCommentsSheet.swift` est hors budget (directive : 1000–1200 lignes) et
/// la règle est explicite — *ajouter à un fichier déjà hors budget est
/// interdit, on extrait d'abord*. L'entrée en édition, sa sortie, son envoi
/// optimiste et l'application de la ligne éditée vivent ici, sous les MÊMES
/// noms que la jumelle du détail (`PostDetailView+CommentEdit.swift`).
extension CommentsSheetView {

    /// Charge le commentaire dans le composer avec TOUT ce que l'édition
    /// permet : texte + effets visuels (lueur/pulse/…) + flou — mêmes
    /// capacités que la création (le média existant est conservé tel quel).
    /// La pastille s'ouvre sur la LANGUE du commentaire : c'est elle que
    /// l'envoi déclare, et le défaut « fr » la réécrirait sinon (#6600).
    func beginEditComment(_ target: FeedComment) {
        replyingTo = nil
        editingComment = target
        composerLanguage = DefaultComposerLanguage.resolve(editing: target.originalLanguage, current: composerLanguage)
        composerText = target.content
        let flags = MessageEffectFlags(rawValue: UInt32(clamping: target.effectFlags))
        commentBlurEnabled = flags.contains(.blurred)
        commentEffects = MessageEffects(flags: flags.subtracting(.blurred))
        HapticFeedback.light()
    }

    func cancelEditComment() {
        editingComment = nil
        composerText = ""
        commentEffects = .none
        commentBlurEnabled = false
    }

    /// PATCH du commentaire : remplacement optimiste EN PLACE (jamais
    /// d'insertion — même id), rollback complet si le serveur refuse.
    /// L'écho `comment:updated` reconfirme ensuite la ligne (idempotent).
    /// La langue de la pastille est DÉCLARÉE au serveur (#6600), lue avant que
    /// le champ vidé ne ramène la pastille au défaut.
    func submitCommentEdit(_ target: FeedComment, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !target.media.isEmpty else { return }
        let language = composerLanguage
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
                    postId: post.id, commentId: target.id, content: trimmed, effectFlags: flags,
                    originalLanguage: language
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
    func applyCommentEdit(_ edited: FeedComment) {
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
}
