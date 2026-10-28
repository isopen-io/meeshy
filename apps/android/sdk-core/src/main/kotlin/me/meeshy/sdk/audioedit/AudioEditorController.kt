package me.meeshy.sdk.audioedit

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.audioedit.AudioEditDocument
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditorMode
import me.meeshy.sdk.model.audioedit.AudioEditorStaging
import me.meeshy.sdk.model.audioedit.AudioEditorTool

/** Ce que l'écran de l'éditeur audio affiche — une seule vérité, rendue par [AudioEditorController.state]. */
public data class AudioEditorState(
    val preparing: Boolean = true,
    val document: AudioEditDocument? = null,
    val staging: AudioEditorStaging = AudioEditorStaging(),
    val processing: Boolean = false,
    val error: AudioEditError? = null,
) {
    val duration: Double get() = document?.active?.durationSeconds ?: 0.0
    val canUndo: Boolean get() = document?.canUndo == true && !processing
    val canRedo: Boolean get() = document?.canRedo == true && !processing
    val canApply: Boolean get() = document != null && staging.canApply(duration, processing)
    val isModified: Boolean get() = document?.isModified == true
}

/**
 * Le cerveau de l'éditeur audio plein écran — miroir d'`AudioEditorController` (iOS). Il ouvre la
 * [AudioEditSession] hors du fil principal, tient les réglages armés ([AudioEditorStaging]) et lance
 * les rendus dans [scope] : un seul à la fois, annulable, sans jamais bloquer l'écran. La source n'est
 * jamais modifiée ; les versions temporaires disparaissent à [confirm] ou [discard].
 */
public class AudioEditorController(
    private val source: File,
    private val root: File,
    private val engine: AudioEditEngine,
    private val durations: AudioDurationReader,
    private val ioDispatcher: CoroutineDispatcher,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow(AudioEditorState())
    public val state: StateFlow<AudioEditorState> = _state.asStateFlow()

    private val opening = Mutex()
    private var session: AudioEditSession? = null
    private var job: Job? = null

    public val sessionDirectory: File? get() = session?.sessionDirectory

    /** Le fichier de la version active, ou `null` tant que la session n'est pas ouverte. */
    public val activeFile: File? get() = session?.takeIf { _state.value.document != null }?.activeFile

    /** Ouvre la session ; les appels suivants sont ignorés pour ne jamais réinitialiser les réglages armés. */
    public suspend fun prepare() {
        opening.withLock {
            if (session != null || !_state.value.preparing) return
            try {
                val opened = AudioEditSession.open(source, root, engine, durations, ioDispatcher)
                session = opened
                val document = opened.document.value
                _state.value = AudioEditorState(
                    preparing = false,
                    document = document,
                    staging = AudioEditorStaging.initial(document.active.durationSeconds),
                )
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (typed: AudioEditError) {
                _state.update { it.copy(preparing = false, error = typed) }
            } catch (failure: Exception) {
                _state.update { it.copy(preparing = false, error = AudioEditError.SourceUnreadable) }
            }
        }
    }

    public fun selectTool(tool: AudioEditorTool?) {
        _state.update { it.copy(staging = it.staging.select(tool, it.duration), error = null) }
    }

    public fun setMode(mode: AudioEditorMode) {
        _state.update { it.copy(staging = it.staging.withMode(mode)) }
    }

    public fun toggleMode() {
        setMode(if (_state.value.staging.mode == AudioEditorMode.SIMPLE) AudioEditorMode.PRO else AudioEditorMode.SIMPLE)
    }

    /** Modifie les réglages armés (poignées, interrupteurs, curseurs). */
    public fun update(change: (AudioEditorStaging) -> AudioEditorStaging) {
        _state.update { it.copy(staging = change(it.staging)) }
    }

    /** Cuit l'opération armée en nouvelle version ; rend le job (annulable par [cancelBackgroundWork]). */
    public fun apply(): Job {
        val current = _state.value
        val opened = session
        val operation = current.staging.pendingOperation(current.duration)
        if (opened == null || operation == null || operation.isIdentity || current.processing) return finished()
        _state.update { it.copy(processing = true, error = null) }
        return launchEdit {
            try {
                val document = opened.apply(operation)
                publish(document, closeTool = true)
            } catch (cancelled: CancellationException) {
                _state.update { it.copy(processing = false) }
                throw cancelled
            } catch (typed: AudioEditError) {
                _state.update { it.copy(processing = false, error = typed) }
            } catch (failure: Exception) {
                _state.update { it.copy(processing = false, error = AudioEditError.ExportFailed(failure.message ?: "")) }
            }
        }
    }

    public fun undo(): Job = move { it.undo() }

    public fun redo(): Job = move { it.redo() }

    public fun selectVersion(versionId: String): Job = move { it.selectVersion(versionId) }

    /** Copie la version active hors de la session et efface la session. */
    public suspend fun confirm(outputDirectory: File): AudioEditResult {
        cancelBackgroundWork()
        val opened = checkNotNull(session) { "confirm before prepare" }
        return opened.confirm(outputDirectory)
    }

    /** Abandonne : arrête le rendu en cours et efface tous les fichiers temporaires. */
    public suspend fun discard() {
        cancelBackgroundWork()
        session?.discard()
    }

    public fun cancelBackgroundWork() {
        job?.cancel()
        job = null
    }

    private fun move(step: suspend (AudioEditSession) -> AudioEditDocument): Job {
        val opened = session
        if (opened == null || _state.value.processing) return finished()
        return launchEdit { publish(step(opened), closeTool = false) }
    }

    private fun publish(document: AudioEditDocument, closeTool: Boolean) {
        _state.update { current ->
            val reset = current.staging.resetFor(document.active.durationSeconds)
            current.copy(
                document = document,
                processing = false,
                staging = if (closeTool) reset else reset.copy(tool = current.staging.tool),
            )
        }
    }

    private fun launchEdit(block: suspend () -> Unit): Job = scope.launch { block() }.also { job = it }

    private fun finished(): Job = Job().also { it.complete() }
}
