package me.meeshy.sdk.model.media

/** L'état d'UN fichier dans la file d'envoi : en file, en envoi, en reprise, ou en échec (relançable ou non). */
public sealed interface UploadFileState {
    /** Attend son tour (hors ligne, ou derrière le pool). */
    public data object Queued : UploadFileState

    public data class Uploading(val sent: Long, val total: Long) : UploadFileState

    /** Repart de [sent] octets que le serveur a déjà acceptés. */
    public data class Resuming(val sent: Long, val total: Long) : UploadFileState

    /** [retryable] : l'échec reste relançable (réseau, 5xx) ; sinon le média est refusé. */
    public data class Failed(val retryable: Boolean) : UploadFileState
}

/** La progression de TOUTE la file : octets envoyés sur octets annoncés, et ce qui reste à faire. */
public data class UploadQueueProgress(val sent: Long, val total: Long, val pending: Int, val failed: Int) {
    /** `null` tant qu'aucun total n'est connu (progression INDÉTERMINÉE), sinon la fraction 0..1. */
    val fraction: Float? get() = if (total > 0L) (sent.toDouble() / total).toFloat().coerceIn(0f, 1f) else null

    public companion object {
        public val Idle: UploadQueueProgress = UploadQueueProgress(0L, 0L, 0, 0)

        public fun of(files: Collection<UploadFileState>): UploadQueueProgress {
            var sent = 0L
            var total = 0L
            var pending = 0
            var failed = 0
            files.forEach { state ->
                when (state) {
                    UploadFileState.Queued -> pending++
                    is UploadFileState.Uploading -> { sent += state.sent; total += state.total; pending++ }
                    is UploadFileState.Resuming -> { sent += state.sent; total += state.total; pending++ }
                    is UploadFileState.Failed -> failed++
                }
            }
            return UploadQueueProgress(sent, total, pending, failed)
        }
    }
}
