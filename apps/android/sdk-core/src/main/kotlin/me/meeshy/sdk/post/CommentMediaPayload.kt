package me.meeshy.sdk.post

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.MobileTranscriptionPayload
import me.meeshy.sdk.model.comment.UploadedCommentMedia

/**
 * Les pièces d'un commentaire en file (iOS `CreateCommentPayload.localMediaPaths` + `uploadedMedia`) : [paths] relatifs au
 * dossier des pièces en attente ([CommentMediaFiles]), leurs [mimeTypes] et [thumbHashes] alignés par index, et
 * [uploaded] ce qu'une tentative précédente a déjà monté — l'outbox reprend sans renvoyer.
 */
@Serializable
public data class CommentMediaPayload(
    val paths: List<String>,
    val mimeTypes: List<String> = emptyList(),
    val thumbHashes: List<String?> = emptyList(),
    val uploaded: List<UploadedCommentMedia> = emptyList(),
    val mobileTranscription: MobileTranscriptionPayload? = null,
) {
    /** Grave une pièce de plus parmi les acquises (une pièce re-téléversée remplace l'ancienne de même index). */
    public fun withUploaded(piece: UploadedCommentMedia): CommentMediaPayload =
        copy(uploaded = uploaded.filterNot { it.sourceIndex == piece.sourceIndex } + piece)
}
