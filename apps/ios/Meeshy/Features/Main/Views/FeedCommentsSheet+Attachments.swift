import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

/// **Ce qu'on joint à un commentaire depuis la feuille du fil et des réels**
/// (#9736, #9697) — extrait de `FeedCommentsSheet.swift`, hors budget.
///
/// Toute pièce entre par `CommentAttachmentIntake` : elle apparaît AUSSITÔT
/// dans la zone du message (`CommentAttachmentsTray`), plafonnée à ce que le
/// serveur accepte. La galerie passe par `RecentMediaAsset` : ce qui est joint
/// y est marqué et ne se reprend pas, et décocher une image jointe dans la
/// photothèque système la retire de la zone.
extension CommentsSheetView {

    // MARK: - La zone

    var commentAttachmentsPreview: some View {
        CommentAttachmentsTray(attachments: commentAttachments, onRemove: { id in
            commentAttachments.removeAll { $0.id == id }
        }, place: commentPendingPlace, onRemovePlace: { commentPendingPlace = nil }, accentColor: accentColor)
    }

    /// Les assets de la photothèque déjà dans la zone, DÉRIVÉS d'elle.
    var attachedCommentAssetIds: [String] {
        commentLibrary.attachedAssetIds(liveAttachmentIds: commentAttachments.map(\.id))
    }

    /// Verse des pièces dans la zone ; rend celles qui y sont entrées.
    @discardableResult
    func stageCommentAttachments(_ pieces: [ComposerAttachment]) -> [ComposerAttachment] {
        CommentAttachmentIntake.admit(pieces, into: &commentAttachments)
    }

    // MARK: - Photothèque système

    /// Ouvre la photothèque avec les assets déjà joints cochés, puis la
    /// sélection de la grille (amorçage par identifiant — voir
    /// `commentPhotoPickerPriming`). Sans rien à cocher, une sélection amorcée
    /// restée d'un passage annulé est abandonnée.
    func openCommentLibraryPreselecting(_ assetIds: [String]) {
        let attached = attachedCommentAssetIds
        let preselection = RecentMediaAttachmentLink.pickerPreselection(
            attached: attached, selection: assetIds, limit: MAX_POST_MEDIA
        )
        commentLibrary.pickerPreselection = RecentMediaAttachmentLink.preselectedAttached(
            attached: attached, preselection: preselection
        )
        if !preselection.isEmpty {
            let primed = preselection.map { PhotosPickerItem(itemIdentifier: $0) }
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

    func handleCommentPhotoSelection(_ items: [PhotosPickerItem]) {
        // Une sélection VIDE n'est une confirmation que si le sélecteur a été
        // ouvert avec des pièces jointes cochées : tout décocher les retire.
        guard !items.isEmpty || !commentLibrary.pickerPreselection.isEmpty else { return }
        // Priming echo — not a user confirmation, nothing to ingest yet.
        if commentPhotoPickerPriming, !items.isEmpty {
            commentPhotoPickerPriming = false
            return
        }
        let identifiers = items.map(\.itemIdentifier)
        let deselected = commentLibrary.deselected(returned: identifiers,
                                                   liveAttachmentIds: commentAttachments.map(\.id))
        commentLibrary.pickerPreselection = []
        commentPhotoItems = []
        CommentAttachmentIntake.remove(ids: deselected, from: &commentAttachments)
        let fresh = RecentMediaAttachmentLink.ingestibleIndices(
            of: identifiers, excluding: Set(attachedCommentAssetIds)
        ).map { items[$0] }
        guard !fresh.isEmpty else { return }
        HapticFeedback.light()
        CommentAttachmentIntake.stage(fresh, into: $commentAttachments) { assetId, attachmentId in
            linkCommentAsset(assetId, to: attachmentId)
        }
    }

    // MARK: - Grille des récents

    /// Un média de la grille entre dans la zone AVEC son identifiant : sa
    /// tuile se marque, et ne se reprend pas tant que la pièce y reste.
    func ingestCommentLibraryAsset(_ asset: RecentMediaAsset) {
        guard !attachedCommentAssetIds.contains(asset.assetId) else {
            if case .video(let url) = asset.payload { try? FileManager.default.removeItem(at: url) }
            return
        }
        guard let piece = CommentAttachmentIntake.stage(asset, into: $commentAttachments) else { return }
        linkCommentAsset(asset.assetId, to: piece.id)
    }

    /// Le résultat de la scène (« Éditer » sur un média récent) rejoint la
    /// zone : c'est une image neuve, sans asset.
    func ingestCommentRecentMedia(_ pick: RecentMediaPick) {
        switch pick {
        case .image(let image):
            guard let data = image.jpegData(compressionQuality: 0.9) else { return }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("comment_\(UUID().uuidString).jpg")
            guard (try? data.write(to: url)) != nil else { return }
            stageCommentAttachments([ComposerAttachment.image(url: url)])
        case .video(let url):
            var piece = CommentAttachmentIntake.placeholder(isVideo: true)
            piece.url = url
            stageCommentAttachments([piece])
        }
    }

    /// "Éditer" from the strip's long-press menu: opens the media editor on the
    /// resolved pick; the edited result is ingested like a strip tap.
    func editCommentRecentMedia(_ pick: RecentMediaPick) {
        switch pick {
        case .image(let image): commentRecentImageToEdit = image
        case .video(let url): commentRecentVideoToEdit = url
        }
    }

    // MARK: - Fichiers

    func handleCommentFileImport(_ result: Result<[URL], Error>) {
        guard case .success(let urls) = result else { return }
        stageCommentAttachments(CommentComposerStaging.fileAttachments(from: urls))
    }

    // MARK: - Ce qui n'est pas parti (#9743)

    /// Les commentaires de ce post encore dans la file reviennent à l'écran :
    /// ils survivent à la fermeture de la feuille et au redémarrage de l'app.
    func restoreUnsentComments() async {
        let unsent = await OfflineQueue.shared.unsentComments(postId: post.id)
            .map { CommentUnsent.row(for: $0, author: AuthManager.shared.currentUser) }
        guard !unsent.isEmpty else { return }
        liveComments = CommentUnsent.merging(unsent.filter { $0.parentId == nil }, into: liveComments ?? post.comments)
        for reply in unsent {
            guard let parentId = reply.parentId else { continue }
            repliesMap[parentId] = CommentUnsent.merging([reply], into: repliesMap[parentId] ?? [])
        }
    }

    /// L'auteur renonce à un commentaire non envoyé : sa ligne part.
    func discardUnsentComment(_ commentId: String) {
        let parentId = repliesMap.first { $0.value.contains { $0.id == commentId } }?.key
        guard parentId != nil || (liveComments ?? post.comments).contains(where: { $0.id == commentId }) else { return }
        rollbackOptimisticComment(tempId: commentId, parentId: parentId)
    }

    private func linkCommentAsset(_ assetId: String, to attachmentId: String) {
        commentLibrary.link(assetId, to: attachmentId, liveAttachmentIds: commentAttachments.map(\.id))
    }
}
