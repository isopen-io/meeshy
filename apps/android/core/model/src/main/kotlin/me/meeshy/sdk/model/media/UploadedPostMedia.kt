package me.meeshy.sdk.model.media

/**
 * Un média de publication déjà téléversé, rangé avec l'instant où le serveur l'a reçu (iOS `PostMediaProgress`).
 *
 * Le serveur ne garde un média non rattaché à un post que 24 h : au-delà, l'id qu'il a rendu ne désigne plus rien.
 * Une publication hors ligne qui reprend après un long silence ne présente donc jamais un id trop vieux : elle
 * re-téléverse le fichier, encore sur disque, au lieu de publier un id disparu.
 *
 * @property localKey le fichier local d'origine (chemin copié dans le dossier durable), la clé de reprise.
 */
data class UploadedPostMedia(
    val localKey: String,
    val mediaId: String,
    val uploadedAtMillis: Long,
) {

    /** Vrai tant que l'id peut encore être présenté au serveur, avec une marge sur la fenêtre de 24 h. */
    fun isPresentable(nowMillis: Long): Boolean {
        val age = nowMillis - uploadedAtMillis
        return age in 0 until PRESENTATION_WINDOW_MS
    }

    companion object {
        const val SERVER_RETENTION_MS: Long = 24L * 60 * 60 * 1000
        const val SAFETY_MARGIN_MS: Long = 60L * 60 * 1000
        const val PRESENTATION_WINDOW_MS: Long = SERVER_RETENTION_MS - SAFETY_MARGIN_MS
    }
}

/** Ce que la reprise fait d'UN média : rejouer l'id déjà obtenu, ou téléverser (de nouveau). */
sealed interface PostMediaStep {
    val localKey: String

    data class Reuse(override val localKey: String, val mediaId: String) : PostMediaStep

    data class Upload(override val localKey: String) : PostMediaStep
}

/** Le plan de reprise d'une publication à plusieurs médias : l'ordre des médias est celui du post, jamais réordonné. */
object PostMediaResumePlan {

    fun plan(
        localKeys: List<String>,
        registry: List<UploadedPostMedia>,
        nowMillis: Long,
    ): List<PostMediaStep> {
        val byKey = registry.filter { it.isPresentable(nowMillis) }.associateBy { it.localKey }
        return localKeys.map { key ->
            byKey[key]?.let { PostMediaStep.Reuse(key, it.mediaId) } ?: PostMediaStep.Upload(key)
        }
    }

    /** Les médias qu'il reste à envoyer, dans l'ordre : la reprise repart du premier manquant, pas de l'index 0. */
    fun remaining(steps: List<PostMediaStep>): List<String> = steps.filterIsInstance<PostMediaStep.Upload>().map { it.localKey }
}
