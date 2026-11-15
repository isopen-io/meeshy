package me.meeshy.sdk.post

import me.meeshy.sdk.model.ApiPostComment
import me.meeshy.sdk.model.comment.CommentMediaResume
import me.meeshy.sdk.model.comment.CommentOwnership
import me.meeshy.sdk.model.comment.UploadedCommentMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.CommentPayload
import java.io.File

/**
 * **LE SEUL CHEMIN PAR LEQUEL UN COMMENTAIRE À PIÈCES SE CRÉE** (iOS `CommentPublisher`, #9743).
 *
 * La règle tient en une ligne : **le jeton qui signe une requête est celui qu'on vient de vérifier.**
 * [CommentOwnership.tokenBound] lit le compte DANS le jeton, le compare à l'auteur de la ligne, et rend ce jeton-là ; il est
 * posé tel quel sur le téléversement et sur la création (en-tête `Authorization` épinglé, aucun rafraîchissement). Aucune
 * seconde lecture, donc aucun décalage où le compte changerait entre la vérification et l'envoi. Sans auteur lisible, sans
 * jeton, ou sous un autre compte : rien ne part ([CommentOwnershipRefusal]).
 *
 * @param prepare amène un jeton frais quand celui de la session a expiré — AVANT la lecture qui sera vérifiée.
 * @param token le jeton de la session courante, lu UNE fois par requête.
 * @param upload téléverse une pièce en TUS (contexte `comment`) sous le jeton remis ; rend l'id du média.
 * @param create crée le commentaire (`attachmentIds`, `X-Client-Mutation-Id`) sous le jeton remis ; `null` = le serveur a
 *   confirmé sans décrire le commentaire (rejeu dédoublonné), ce n'est pas un échec.
 */
public class CommentPublisher(
    private val prepare: suspend () -> Unit,
    private val token: () -> String?,
    private val upload: suspend (Piece, bearer: String) -> NetworkResult<String>,
    private val create: suspend (Creation, bearer: String) -> NetworkResult<ApiPostComment?>,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    /** Une pièce à téléverser, sous son index d'origine dans la zone de commentaire. */
    public data class Piece(val sourceIndex: Int, val file: File, val mimeType: String, val thumbHash: String? = null)

    /** Ce qui fait UN commentaire : où il va, qui l'écrit, sous quelle clé d'idempotence, et son contenu. */
    public data class Creation(
        val postId: String,
        val authorId: String?,
        val clientMutationId: String,
        val comment: CommentPayload,
        val attachmentIds: List<String>,
    )

    /** La montée s'est arrêtée en chemin : ce qui est acquis voyage avec la cause, pour que la file ne le re-téléverse pas. */
    public class Interrupted(public val acquired: List<UploadedCommentMedia>, public val error: ApiError) :
        Exception(error.message)

    /**
     * Téléverse ce qui manque (les pièces de [acquired] ne repartent pas), puis crée le commentaire. [onUploaded] est appelé
     * à chaque pièce montée, avant la suivante : la file la grave sur sa ligne.
     *
     * @throws CommentOwnershipRefusal quand le jeton ne désigne pas [authorId].
     * @throws Interrupted quand un envoi échoue, avec ce qui est déjà acquis.
     */
    public suspend fun publish(
        postId: String,
        authorId: String?,
        clientMutationId: String,
        comment: CommentPayload,
        pieces: List<Piece>,
        acquired: List<UploadedCommentMedia> = emptyList(),
        onUploaded: suspend (UploadedCommentMedia) -> Unit = {},
    ): ApiPostComment? {
        var uploaded = acquired
        for (piece in pieces.filter { p -> uploaded.none { it.sourceIndex == p.sourceIndex } }) {
            when (val result = upload(piece, boundToken(authorId))) {
                is NetworkResult.Failure -> throw Interrupted(uploaded, result.error)
                is NetworkResult.Success -> {
                    val done = UploadedCommentMedia(piece.sourceIndex, result.data, nowMillis())
                    uploaded = uploaded + done
                    onUploaded(done)
                }
            }
        }
        val creation = Creation(postId, authorId, clientMutationId, comment, CommentMediaResume.attachmentIds(uploaded))
        return when (val result = create(creation, boundToken(authorId))) {
            is NetworkResult.Failure -> throw Interrupted(uploaded, result.error)
            is NetworkResult.Success -> result.data
        }
    }

    private suspend fun boundToken(authorId: String?): String {
        prepare()
        return CommentOwnership.tokenBound(authorId, token())
    }
}
