package me.meeshy.sdk.media

import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.media.PreparationStage
import me.meeshy.sdk.model.media.PreparedMedia
import me.meeshy.sdk.model.media.PreparingAttachment
import me.meeshy.sdk.model.media.PreparingAttachmentReducer

/** Le compte rendu d'une étape à la poignée : le pipeline rend compte, il ne touche pas à l'état. */
fun interface PreparationProgress {
    fun enter(stage: PreparationStage)
}

/** Le travail d'une pièce (chargement, compression, vignette, empreinte) ; il lève pour échouer. */
fun interface PreparationPipeline {
    suspend fun run(progress: PreparationProgress): PreparedMedia
}

/** Une préparation échouée : le message est celui que la tuile affiche. */
class AttachmentPreparationException(message: String) : Exception(message)

/** Issue terminale d'une préparation. */
sealed interface PreparationOutcome {
    data class Ready(val attachment: PreparingAttachment) : PreparationOutcome
    data class Failed(val message: String) : PreparationOutcome
    data object Cancelled : PreparationOutcome
}

/**
 * Le service de préparation — miroir d'`AttachmentPreparationService` iOS : chaque pièce choisie traverse
 * `loading -> compressing -> thumbnailing -> hashing -> ready | failed`, hors du fil principal, et le
 * composer la suit par [items]. Les pièces gardent l'ordre d'arrivée dans [items] ; seul l'appelant
 * place la pièce prête ([me.meeshy.sdk.model.AttachmentPlacement]). Un vocal de moins de [MIN_VOICE_MS]
 * est refusé à l'entrée.
 */
class AttachmentPreparationService(private val scope: CoroutineScope) {

    private val _items = MutableStateFlow<List<PreparingAttachment>>(emptyList())

    /** Les préparations en vol et celles qui ont échoué, dans l'ordre de sélection. */
    val items: StateFlow<List<PreparingAttachment>> = _items.asStateFlow()

    private class Entry(val pipeline: PreparationPipeline) {
        var job: Job? = null
        var done = CompletableDeferred<PreparationOutcome>()
    }

    private val entries = ConcurrentHashMap<String, Entry>()

    fun prepare(
        id: String,
        type: PendingAttachmentType,
        pipeline: PreparationPipeline,
        accentHex: String? = null,
        capturedInApp: Boolean = false,
    ): PreparingAttachment {
        val item = PreparingAttachment(id, type, accentHex = accentHex, capturedInApp = capturedInApp)
        val entry = Entry(pipeline)
        entries[id] = entry
        _items.update { it.filterNot { other -> other.id == id } + item }
        start(id, entry)
        return item
    }

    /** Un vocal trop court n'entre pas : même seuil que iOS (`max(durationMs, 500)`). */
    fun admitsVoice(durationMs: Long): Boolean = durationMs >= MIN_VOICE_MS

    fun cancel(id: String) {
        val entry = entries[id] ?: return
        update(id) { PreparingAttachmentReducer.cancel(it) }
        entry.job?.cancel()
        finish(id, PreparationOutcome.Cancelled)
    }

    fun retry(id: String) {
        val entry = entries[id] ?: return
        val current = _items.value.firstOrNull { it.id == id } ?: return
        if (current.stage !is PreparationStage.Failed) return
        update(id) { PreparingAttachmentReducer.retry(it) }
        entry.done = CompletableDeferred()
        start(id, entry)
    }

    /** Retire la pièce du suivi (prête consommée, échec abandonné, annulation). */
    fun dismiss(id: String) {
        entries.remove(id)
        _items.update { it.filterNot { item -> item.id == id } }
    }

    /** Suspend jusqu'à l'état terminal ; plusieurs appelants reçoivent la même issue. */
    suspend fun awaitCompletion(id: String): PreparationOutcome {
        val entry = entries[id] ?: return PreparationOutcome.Cancelled
        return entry.done.await()
    }

    private fun start(id: String, entry: Entry) {
        entry.job = scope.launch {
            val progress = PreparationProgress { stage -> update(id) { PreparingAttachmentReducer.advance(it, stage) } }
            try {
                val media = entry.pipeline.run(progress)
                update(id) { PreparingAttachmentReducer.advance(PreparingAttachmentReducer.withMedia(it) { _ -> media }, PreparationStage.Ready) }
                _items.value.firstOrNull { it.id == id }?.let { finish(id, PreparationOutcome.Ready(it)) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                val message = e.message ?: GENERIC_FAILURE
                update(id) { PreparingAttachmentReducer.fail(it, message) }
                finish(id, PreparationOutcome.Failed(message))
            }
        }
    }

    private fun finish(id: String, outcome: PreparationOutcome) {
        entries[id]?.done?.complete(outcome)
    }

    private fun update(id: String, transform: (PreparingAttachment) -> PreparingAttachment) {
        _items.update { list -> list.map { if (it.id == id) transform(it) else it } }
    }

    companion object {
        const val MIN_VOICE_MS = 500L
        private const val GENERIC_FAILURE = "Préparation impossible"
    }
}
