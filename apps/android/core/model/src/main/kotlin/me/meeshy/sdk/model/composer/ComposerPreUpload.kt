package me.meeshy.sdk.model.composer

/** État d'une pré-montée TUS — miroir d'iOS `ComposerPreUploadState` (#5086, vue 4c). */
sealed interface ComposerPreUploadState {
    /** Rien n'a commencé, ou le fichier n'est pas éligible. */
    data object Idle : ComposerPreUploadState

    /** Octets envoyés / total : « 4,8 / 14,2 Mo », pas seulement une fraction. */
    data class Uploading(val sent: Long, val total: Long) : ComposerPreUploadState

    /** L'asset est chez le serveur : la publication n'aura qu'à le référencer. */
    data class Ready(val postMediaId: String, val remoteUrl: String) : ComposerPreUploadState

    /** Échec silencieux : la publication reprendra l'envoi, rien n'est montré. */
    data object Failed : ComposerPreUploadState

    /** Progression de la barre, `null` quand il n'y a rien à montrer. */
    val fraction: Double?
        get() = (this as? Uploading)?.takeIf { it.total > 0 }?.let { (it.sent.toDouble() / it.total).coerceIn(0.0, 1.0) }

    val isReady: Boolean get() = this is Ready
    val showsProgress: Boolean get() = this is Uploading
}

/** Règles pures de la pré-montée — miroir d'iOS `ComposerPreUploadPolicy`. */
object ComposerPreUploadPolicy {
    const val MINIMUM_BYTES: Long = 64L * 1024
    const val MAXIMUM_CONCURRENT: Int = 2
    const val CHUNK_BYTES: Int = 5 * 1024 * 1024

    /** Un asset déjà distant ne repart jamais : le remonter créerait un doublon côté serveur. */
    fun mayBegin(fileSize: Long, alreadyRemote: Boolean): Boolean = !alreadyRemote && fileSize >= MINIMUM_BYTES

    /** Seul le canal de la scène référence ce qui a été pré-monté ; le document re-téléverse tout. */
    fun pays(format: ComposerFormat): Boolean = ComposerPublishChannel.of(format) == ComposerPublishChannel.SCENE

    /** Prêt ⇒ référencé ; en cours ⇒ la publication monte elle-même (jamais d'attente). */
    fun publishReuses(state: ComposerPreUploadState): Boolean = state.isReady
}

/** Quels objets du document attendent leur montée — indifférent à la porte d'entrée du média. */
object ComposerPreUploadSweep {
    /** Chemin du fichier local d'un objet sans identifiant distant, sinon `null`. */
    fun pendingFile(postMediaId: String, mediaUrl: String?): String? {
        if (postMediaId.isNotEmpty() || mediaUrl.isNullOrEmpty()) return null
        return when {
            mediaUrl.startsWith("file://") -> mediaUrl.removePrefix("file://")
            mediaUrl.startsWith("/") -> mediaUrl
            else -> null
        }
    }
}
