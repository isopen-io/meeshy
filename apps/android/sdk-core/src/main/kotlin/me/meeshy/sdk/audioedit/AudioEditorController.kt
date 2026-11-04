package me.meeshy.sdk.audioedit

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.audioedit.AudioEditDocument
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditorMode
import me.meeshy.sdk.model.audioedit.AudioEditorStaging
import me.meeshy.sdk.model.audioedit.AudioEditorTool
import me.meeshy.sdk.model.audioedit.AudioTranscriptionFailure
import me.meeshy.sdk.model.audioedit.AudioTranscriptionState
import me.meeshy.sdk.model.speech.TranscriptionError
import me.meeshy.sdk.model.speech.TranscriptionException
import me.meeshy.sdk.speech.SoundTranscriptionOutcome

/** Ce que l'écran de l'éditeur audio affiche — une seule vérité, rendue par [AudioEditorController.state]. */
public data class AudioEditorState(
    val preparing: Boolean = true,
    val document: AudioEditDocument? = null,
    val staging: AudioEditorStaging = AudioEditorStaging(),
    val processing: Boolean = false,
    val error: AudioEditError? = null,
    val transcription: AudioTranscriptionState = AudioTranscriptionState.Idle,
    val transcriptionLanguage: String = "fr",
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
    private val transcriber: AudioTranscriber? = null,
    defaultLanguage: String = "fr",
) {
    private val _state = MutableStateFlow(AudioEditorState(transcriptionLanguage = defaultLanguage))
    public val state: StateFlow<AudioEditorState> = _state.asStateFlow()

    private val opening = Mutex()
    private var session: AudioEditSession? = null
    private var job: Job? = null
    private var transcriptionJob: Job? = null

    /** Faux quand l'appareil ne sait pas transcrire : l'outil est alors ABSENT, jamais grisé. */
    public val canTranscribe: Boolean get() = transcriber != null

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
                _state.value = _state.value.copy(
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
        return opened.confirm(outputDirectory).copy(transcription = _state.value.transcription.exported())
    }

    /** Abandonne : arrête le rendu en cours et efface tous les fichiers temporaires. */
    public suspend fun discard() {
        cancelBackgroundWork()
        session?.discard()
    }

    /**
     * L'écran disparaît sans être passé par [confirm] ni [discard] (activité recréée, hôte retiré) : le rendu en
     * cours s'arrête et la session s'efface hors du fil principal, sans attendre — rien ne reste en cache.
     */
    public fun abandon() {
        cancelBackgroundWork()
        val opened = session ?: return
        CoroutineScope(ioDispatcher + NonCancellable).launch { opened.discard() }
    }

    public fun cancelBackgroundWork() {
        job?.cancel()
        job = null
        cancelTranscription()
    }

    public fun setTranscriptionLanguage(code: String) {
        _state.update { it.copy(transcriptionLanguage = code) }
    }

    /**
     * Lance la reconnaissance de la version active (la précédente est annulée). Tolérante aux crashs : un
     * reconnaisseur qui plante, se tait ou ne finit pas devient un état `Failed`, jamais une exception.
     */
    public fun transcribe(): Job {
        val recognizer = transcriber
        val file = activeFile
        if (recognizer == null || file == null) return finished()
        cancelTranscription()
        val language = _state.value.transcriptionLanguage
        _state.update { it.copy(transcription = AudioTranscriptionState.Running) }
        return scope.launch {
            val outcome = recognize(recognizer, file, language)
            _state.update { it.copy(transcription = outcome) }
        }.also { transcriptionJob = it }
    }

    private suspend fun recognize(recognizer: AudioTranscriber, file: File, language: String): AudioTranscriptionState {
        val size = withContext(ioDispatcher) { if (file.isFile) file.length() else -1L }
        if (size < 0) return AudioTranscriptionState.Failed(AudioTranscriptionFailure.FILE_MISSING)
        if (size == 0L) return AudioTranscriptionState.Failed(AudioTranscriptionFailure.EMPTY)
        return try {
            val outcome = withTimeoutOrNull(TRANSCRIPTION_TIMEOUT_MS) { recognizer.transcribe(file, language) }
            when (outcome) {
                is SoundTranscriptionOutcome.Heard -> outcome.transcription.text.trim().let { text ->
                    if (text.isEmpty()) AudioTranscriptionState.Failed(AudioTranscriptionFailure.NO_SPEECH)
                    else AudioTranscriptionState.Done(text, language)
                }
                else -> AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (refused: TranscriptionException) {
            if (refused.error is TranscriptionError.PermissionDenied) AudioTranscriptionState.PermissionDenied
            else AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED)
        } catch (failure: Exception) {
            AudioTranscriptionState.Failed(AudioTranscriptionFailure.FAILED)
        }
    }

    private fun cancelTranscription() {
        transcriptionJob?.cancel()
        transcriptionJob = null
        _state.update { if (it.transcription.isRunning) it.copy(transcription = AudioTranscriptionState.Idle) else it }
    }

    private fun move(step: suspend (AudioEditSession) -> AudioEditDocument): Job {
        val opened = session
        if (opened == null || _state.value.processing) return finished()
        return launchEdit { publish(step(opened), closeTool = false) }
    }

    private fun publish(document: AudioEditDocument, closeTool: Boolean) {
        transcriptionJob?.cancel()
        transcriptionJob = null
        _state.update { current ->
            val reset = current.staging.resetFor(document.active.durationSeconds)
            current.copy(
                document = document,
                processing = false,
                transcription = AudioTranscriptionState.Idle,
                staging = if (closeTool) reset else reset.copy(tool = current.staging.tool),
            )
        }
    }

    private fun launchEdit(block: suspend () -> Unit): Job = scope.launch { block() }.also { job = it }

    private fun finished(): Job = Job().also { it.complete() }

    public companion object {
        /** Un reconnaisseur qui n'a rien rendu au bout de ce délai est forcé à échouer (comme le chien de garde d'iOS). */
        public const val TRANSCRIPTION_TIMEOUT_MS: Long = 90_000
    }
}
