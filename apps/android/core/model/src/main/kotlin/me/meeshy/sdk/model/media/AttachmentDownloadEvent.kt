package me.meeshy.sdk.model.media

/** Octets reçus et attendus ; [totalBytes] vaut 0 tant que la taille est inconnue. */
public data class DownloadProgress(val downloadedBytes: Long, val totalBytes: Long) {
    /** Fraction 0..1, 0 tant que la taille totale est inconnue. */
    public val fraction: Float
        get() = if (totalBytes > 0) (downloadedBytes.toFloat() / totalBytes).coerceIn(0f, 1f) else 0f
}

/** Ce que le registre diffuse, par clé de cache, à toutes les surfaces qui montrent le média. */
public sealed interface AttachmentDownloadEvent {
    public data class Progress(val progress: DownloadProgress) : AttachmentDownloadEvent

    public data class Finished(val totalBytes: Long) : AttachmentDownloadEvent

    /** [gone] : le serveur répond 404/410 — média rappelé, expiré ou consommé ; inutile de réessayer. */
    public data class Failed(val gone: Boolean = false) : AttachmentDownloadEvent

    public data object Cancelled : AttachmentDownloadEvent

    /** Fin du téléchargement (finie, échouée ou annulée). */
    public val isTerminal: Boolean get() = this !is Progress
}
