package me.meeshy.sdk.audioedit

import java.io.File
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.audioedit.AudioEditError
import me.meeshy.sdk.model.audioedit.AudioEditOperation
import me.meeshy.sdk.model.audioedit.AudioEditPlan

/** Ce que la source contient, avant de lancer un rendu. */
public enum class AudioSourceStatus { READABLE, UNREADABLE, NO_AUDIO_TRACK }

public interface AudioSourceProbe {
    public fun status(file: File): AudioSourceStatus
}

/** Un rendu à produire : la tranche gardée, la vitesse, le gain et les fondus du [plan]. */
public data class AudioTransformRequest(val source: File, val output: File, val plan: AudioEditPlan)

/**
 * Le moteur d'écriture (Media3 Transformer en production). Il lève en cas d'échec ; sur
 * annulation de la coroutine il arrête l'export. Il ne nettoie pas : c'est [AudioEditEngine].
 */
public interface AudioTransformRunner {
    public suspend fun run(request: AudioTransformRequest)
}

/**
 * Rend une [AudioEditOperation] en fichier m4a — miroir d'`AudioEditEngine` (iOS). Sans
 * état : chaque appel écrit un fichier neuf dans le dossier de l'appelant, la source n'est
 * jamais modifiée. Le travail se fait hors du fil principal et respecte l'annulation ; un
 * échec ne laisse aucun fichier partiel et se rend par une [AudioEditError] typée.
 */
public class AudioEditEngine(
    private val probe: AudioSourceProbe,
    private val runner: AudioTransformRunner,
    private val ioDispatcher: CoroutineDispatcher,
) {

    /** Applique [operation] à [source] et rend le fichier produit dans [directory]. */
    public suspend fun apply(
        operation: AudioEditOperation,
        source: File,
        sourceDuration: Double,
        directory: File,
    ): File {
        val plan = renderable(AudioEditPlan.lower(operation, sourceDuration))
        return withContext(ioDispatcher) { render(source, plan, directory) }
    }

    private fun renderable(plan: AudioEditPlan): AudioEditPlan {
        val ranges = plan.keptRanges.filter { it.duration > MIN_RANGE }
        val kept = plan.copy(keptRanges = ranges)
        if (kept.keptDuration <= AudioEditPlan.MIN_SLICE) throw AudioEditError.ResultTooShort
        return kept
    }

    private suspend fun render(source: File, plan: AudioEditPlan, directory: File): File {
        ensureActive()
        if (!source.isFile) throw AudioEditError.SourceUnreadable
        when (probe.status(source)) {
            AudioSourceStatus.UNREADABLE -> throw AudioEditError.SourceUnreadable
            AudioSourceStatus.NO_AUDIO_TRACK -> throw AudioEditError.NoAudioTrack
            AudioSourceStatus.READABLE -> Unit
        }
        if (!directory.isDirectory && !directory.mkdirs()) throw AudioEditError.CompositionFailed
        val output = File(directory, "v_${UUID.randomUUID()}.m4a")
        try {
            ensureActive()
            runner.run(AudioTransformRequest(source, output, plan))
        } catch (cancelled: CancellationException) {
            output.delete()
            throw cancelled
        } catch (typed: AudioEditError) {
            output.delete()
            throw typed
        } catch (failure: Exception) {
            output.delete()
            throw AudioEditError.ExportFailed(failure.message ?: failure.javaClass.simpleName)
        }
        if (!output.isFile || output.length() == 0L) {
            output.delete()
            throw AudioEditError.ExportFailed("Empty output")
        }
        return output
    }

    private companion object {
        const val MIN_RANGE = 0.01
    }
}
