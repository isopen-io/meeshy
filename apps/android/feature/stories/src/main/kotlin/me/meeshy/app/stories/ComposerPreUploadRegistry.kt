package me.meeshy.app.stories

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.composer.ComposerPreUploadPolicy
import me.meeshy.sdk.model.composer.ComposerPreUploadState

/** Un fichier monté : l'identifiant `PostMedia` et l'URL distante. */
internal data class PreUploadedAsset(val postMediaId: String, val remoteUrl: String)

/** Monte un fichier local ; rend `null` sur échec (jamais une exception visible de l'auteur). */
internal fun interface ComposerPreUploader {
    suspend fun upload(path: String, mimeType: String, onProgress: (sent: Long, total: Long) -> Unit): PreUploadedAsset?
}

/**
 * Registre des pré-montées — miroir d'iOS `ComposerPreUploadRegistry` (#5086). La montée part dès la pose d'un
 * fichier >= 64 Ko non déjà distant ; file FIFO, deux montées au plus ; un échec devient [ComposerPreUploadState.Failed]
 * sans jamais invalider la composition (la publication reprendra l'envoi). Toutes les méthodes sont appelées depuis
 * le thread principal (le scope du ViewModel).
 */
internal class ComposerPreUploadRegistry(
    private val scope: CoroutineScope,
    private val uploader: ComposerPreUploader,
    /** Adopte l'asset dans le document ; `false` si l'objet a disparu pendant la montée. */
    private val adopt: (path: String, asset: PreUploadedAsset) -> Boolean,
) {
    private val _states = MutableStateFlow<Map<String, ComposerPreUploadState>>(emptyMap())
    val states: StateFlow<Map<String, ComposerPreUploadState>> = _states.asStateFlow()

    private val waiting = ArrayDeque<Pair<String, String>>()
    private val jobs = mutableMapOf<String, Job>()

    fun state(path: String): ComposerPreUploadState = _states.value[path] ?: ComposerPreUploadState.Idle

    fun begin(path: String, mimeType: String, fileSize: Long, alreadyRemote: Boolean) {
        if (_states.value.containsKey(path)) return
        if (!ComposerPreUploadPolicy.mayBegin(fileSize, alreadyRemote)) return
        set(path, ComposerPreUploadState.Uploading(0, fileSize))
        waiting.addLast(path to mimeType)
        drain()
    }

    /** Le fichier a quitté la composition : on annule et on oublie. */
    fun forget(path: String) {
        jobs.remove(path)?.cancel()
        waiting.removeAll { it.first == path }
        set(path, null)
        drain()
    }

    /** La publication démarre : plus aucune pré-montée ne court, les assets prêts restent référencés. */
    fun stopForPublication() {
        jobs.values.forEach { it.cancel() }
        jobs.clear()
        waiting.clear()
        _states.value = _states.value.filterValues { it.isReady }
    }

    private fun drain() {
        while (jobs.size < ComposerPreUploadPolicy.MAXIMUM_CONCURRENT && waiting.isNotEmpty()) {
            val (path, mime) = waiting.removeFirst()
            val job = scope.launch(start = CoroutineStart.LAZY) { run(path, mime) }
            jobs[path] = job
            job.start()
        }
    }

    private suspend fun run(path: String, mime: String) {
        val outcome = try {
            uploader.upload(path, mime) { sent, total -> progress(path, sent, total) }
        } catch (cancel: CancellationException) {
            throw cancel
        } catch (_: Exception) {
            null
        }
        if (!jobs.containsKey(path)) return
        jobs.remove(path)
        when {
            outcome == null -> set(path, ComposerPreUploadState.Failed)
            adopt(path, outcome) -> set(path, ComposerPreUploadState.Ready(outcome.postMediaId, outcome.remoteUrl))
            else -> set(path, null)
        }
        drain()
    }

    private fun progress(path: String, sent: Long, total: Long) {
        if (_states.value[path] is ComposerPreUploadState.Uploading) {
            set(path, ComposerPreUploadState.Uploading(sent, total))
        }
    }

    private fun set(path: String, state: ComposerPreUploadState?) {
        _states.value = if (state == null) _states.value - path else _states.value + (path to state)
    }

}
