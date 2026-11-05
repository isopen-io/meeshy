package me.meeshy.sdk.media

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.media.UploadBarFile
import me.meeshy.sdk.model.media.UploadBarProgress
import me.meeshy.sdk.model.media.UploadBarStatus
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

    private val names = MutableStateFlow<Map<String, Announced>>(emptyMap())
    private val finished = MutableStateFlow<Map<String, Announced>>(emptyMap())

    private val _bar = MutableStateFlow(UploadBarProgress(emptyList()))

    /** La barre d'envoi GLOBALE : un pourcentage, le fichier en cours, « x/y fichiers » (iOS `UploadProgressBar`). */
    public val bar: StateFlow<UploadBarProgress> = _bar.asStateFlow()

    /** Un fichier annoncé AVANT de monter : il porte son nom et son poids dans la barre, déjà « en file ». */
    public fun announce(id: String, fileName: String, totalBytes: Long) {
        names.update { it + (id to Announced(fileName, totalBytes)) }
        set(id, UploadFileState.Queued)
    }

    public fun queued(id: String): Unit = set(id, UploadFileState.Queued)

    public fun uploading(id: String, sent: Long, total: Long): Unit = set(id, UploadFileState.Uploading(sent, total))

    public fun resuming(id: String, sent: Long, total: Long): Unit = set(id, UploadFileState.Resuming(sent, total))

    public fun failed(id: String, retryable: Boolean): Unit = set(id, UploadFileState.Failed(retryable))

    public fun done(id: String) {
        val known = names.value[id]
        val total = when (val state = _files.value[id]) {
            is UploadFileState.Uploading -> state.total
            is UploadFileState.Resuming -> state.total
            else -> known?.totalBytes ?: 0L
        }
        finished.update { it + (id to Announced(known?.fileName ?: id, total)) }
        _files.update { it - id }
        publish()
    }

    private fun set(id: String, state: UploadFileState) {
        _files.update { it + (id to state) }
        publish()
    }

    private fun publish() {
        _queue.value = UploadQueueProgress.of(_files.value.values)
        if (_files.value.values.none { it.isActive }) {
            finished.value = emptyMap()
            names.value = names.value.filterKeys { it in _files.value }
        }
        _bar.value = UploadBarProgress(barFiles())
    }

    private fun barFiles(): List<UploadBarFile> {
        val done = finished.value.map { (_, info) -> UploadBarFile(info.fileName, info.totalBytes, info.totalBytes, UploadBarStatus.COMPLETED) }
        val live = _files.value.map { (id, state) ->
            val info = names.value[id]
            val name = info?.fileName ?: id
            when (state) {
                UploadFileState.Queued -> UploadBarFile(name, 0L, info?.totalBytes ?: 0L, UploadBarStatus.QUEUED)
                is UploadFileState.Uploading -> UploadBarFile(name, state.sent, state.total, UploadBarStatus.UPLOADING)
                is UploadFileState.Resuming -> UploadBarFile(name, state.sent, state.total, UploadBarStatus.UPLOADING)
                is UploadFileState.Failed -> UploadBarFile(name, 0L, info?.totalBytes ?: 0L, UploadBarStatus.FAILED)
            }
        }
        return done + live
    }

    private val UploadFileState.isActive: Boolean get() = this !is UploadFileState.Failed

    private data class Announced(val fileName: String, val totalBytes: Long)
}
