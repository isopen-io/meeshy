package me.meeshy.sdk.model

/** Une pièce promise par un commentaire en file : déjà téléversée (id serveur) ou encore locale. */
data class CommentPiece(
    val key: String,
    val uploadedId: String? = null,
    val fileExists: Boolean = true,
)

/**
 * Ce qu'un commentaire rédigé hors ligne rejoue après un redémarrage à froid (iOS `OfflineQueue+CommentMedia`).
 * Un commentaire ne part jamais avec moins de pièces que promis : il part complet, ou pas du tout.
 */
sealed interface CommentMediaReplay {

    /** Toutes les pièces ont un id : le commentaire peut partir, les ids dans l'ordre des pièces. */
    data class Ready(val attachmentIds: List<String>) : CommentMediaReplay

    /** Seules les pièces non encore téléversées sont rejouées, dans l'ordre promis. */
    data class Upload(val keys: List<String>) : CommentMediaReplay

    /** Un fichier non téléversé a disparu : le commentaire échoue proprement (422 local), sans envoi. */
    data class Refused(val missingKeys: List<String>) : CommentMediaReplay {
        val httpStatus: Int get() = LOCAL_UNPROCESSABLE
    }

    companion object {
        const val LOCAL_UNPROCESSABLE: Int = 422
    }
}

object CommentMediaReplayPlan {

    fun plan(pieces: List<CommentPiece>): CommentMediaReplay {
        val pending = pieces.filter { it.uploadedId.isNullOrBlank() }
        val missing = pending.filterNot { it.fileExists }
        return when {
            missing.isNotEmpty() -> CommentMediaReplay.Refused(missing.map { it.key })
            pending.isNotEmpty() -> CommentMediaReplay.Upload(pending.map { it.key })
            else -> CommentMediaReplay.Ready(pieces.mapNotNull { it.uploadedId })
        }
    }
}
