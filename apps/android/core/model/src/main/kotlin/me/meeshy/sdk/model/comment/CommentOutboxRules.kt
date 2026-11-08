package me.meeshy.sdk.model.comment

/**
 * Les règles, sans état, de l'envoi durable d'un commentaire (iOS `CommentUnsent`, `OfflineQueue+CommentMedia`).
 */
public object CommentOutboxRules {

    /** Un média pré-téléversé plus vieux que cela a pu être balayé par le serveur : il repart depuis son fichier. */
    public const val UPLOADED_MEDIA_WINDOW_MS: Long = 24L * 60L * 60L * 1000L

    /** Une ligne qui porte encore son identifiant CLIENT (`cmid_` / `tmp_`) n'a pas été remplacée par celle du serveur. */
    public fun isLocal(commentId: String): Boolean =
        commentId.startsWith("cmid_") || commentId.startsWith("tmp_")

    /** Le média téléversé à [uploadedAtMs] doit-il être re-téléversé à [nowMs] plutôt que présenté avec son ancien id ? */
    public fun mustReupload(uploadedAtMs: Long, nowMs: Long): Boolean = nowMs - uploadedAtMs > UPLOADED_MEDIA_WINDOW_MS

    /**
     * Le fil est plat : répondre à une réponse se rattache au commentaire RACINE. [tappedParentOf] est le parent du
     * commentaire touché (`null` s'il est lui-même racine).
     */
    public fun threadRoot(tappedId: String, tappedParentOf: String?): String =
        tappedParentOf?.takeIf { it.isNotBlank() } ?: tappedId

    /** La reprise AJOUTE le texte à ce que le composer contient déjà : rien de ce qui est écrit ne se perd. */
    public fun resuming(text: String, into: String): String =
        if (into.isBlank()) text else into + "\n" + text

    /** Les lignes relues de la file, les plus récentes en tête, sans celles que la liste porte déjà. */
    public fun <T> merging(unsent: List<T>, into: List<T>, idOf: (T) -> String): List<T> {
        val known = into.mapTo(HashSet(), idOf)
        return unsent.filter { idOf(it) !in known }.reversed() + into
    }
}
