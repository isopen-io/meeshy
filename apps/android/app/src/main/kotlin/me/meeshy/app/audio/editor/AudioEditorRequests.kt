package me.meeshy.app.audio.editor

import java.io.File
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.audioedit.AudioEditResult

/** Une ouverture de l'éditeur : la source et les deux issues. [id] distingue deux ouvertures successives. */
internal class AudioEditorRequest(
    val id: Long,
    val source: File,
    val onConfirm: (AudioEditResult) -> Unit,
    val onCancel: () -> Unit,
)

/**
 * La file d'UN éditeur : une ouverture à la fois (une seconde est refusée à l'instant), et chaque issue ferme
 * l'éditeur AVANT de prévenir l'appelant, pour qu'un rappel qui rouvre un éditeur le trouve libre.
 */
internal class AudioEditorRequests {
    private val sequence = AtomicLong()
    private val current = MutableStateFlow<AudioEditorRequest?>(null)

    val request: StateFlow<AudioEditorRequest?> = current.asStateFlow()

    fun open(source: File, onConfirm: (AudioEditResult) -> Unit, onCancel: () -> Unit) {
        val next = AudioEditorRequest(sequence.incrementAndGet(), source, onConfirm, onCancel)
        if (!current.compareAndSet(null, next)) onCancel()
    }

    fun confirm(request: AudioEditorRequest, result: AudioEditResult) {
        if (current.compareAndSet(request, null)) request.onConfirm(result)
    }

    fun cancel(request: AudioEditorRequest) {
        if (current.compareAndSet(request, null)) request.onCancel()
    }
}
