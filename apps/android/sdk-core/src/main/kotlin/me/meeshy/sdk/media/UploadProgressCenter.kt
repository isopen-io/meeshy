package me.meeshy.sdk.media

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.media.UploadFileState
import me.meeshy.sdk.model.media.UploadQueueProgress
import javax.inject.Inject
import javax.inject.Singleton

/**
 * La progression des envois TUS, PAR FICHIER et pour TOUTE la file (miroir d'iOS `FileUploadProgress`/`UploadQueueProgress`).
 * Mémoire de processus : la vérité durable (en file, refusé) est la ligne de l'outbox ; ici, seulement ce qui est vrai
 * tant que le transfert tourne. Un fichier terminé quitte la carte, qui ne grossit donc jamais au-delà de la file.
 */
@Singleton
public class UploadProgressCenter @Inject constructor() {
    private val _files = MutableStateFlow<Map<String, UploadFileState>>(emptyMap())
    public val files: StateFlow<Map<String, UploadFileState>> = _files.asStateFlow()

    private val _queue = MutableStateFlow(UploadQueueProgress.Idle)
    public val queue: StateFlow<UploadQueueProgress> = _queue.asStateFlow()

    public fun queued(id: String): Unit = set(id, UploadFileState.Queued)

    public fun uploading(id: String, sent: Long, total: Long): Unit = set(id, UploadFileState.Uploading(sent, total))

    public fun resuming(id: String, sent: Long, total: Long): Unit = set(id, UploadFileState.Resuming(sent, total))

    public fun failed(id: String, retryable: Boolean): Unit = set(id, UploadFileState.Failed(retryable))

    public fun done(id: String) {
        _files.update { it - id }
        publish()
    }

    private fun set(id: String, state: UploadFileState) {
        _files.update { it + (id to state) }
        publish()
    }

    private fun publish() {
        _queue.value = UploadQueueProgress.of(_files.value.values)
    }
}
