package me.meeshy.sdk.media.scene

import java.io.File
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.media.CaptureGallery
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportPlan
import me.meeshy.sdk.model.composer.scene.SceneExportReducer
import me.meeshy.sdk.model.composer.scene.SceneExportState

/**
 * **Ce que le `⋯` du composer emporte hors de Meeshy** (miroir de `ComposerSceneExportController` iOS) : la scène bakée
 * en MP4, remise à la galerie ou à une feuille de partage. Un bake dure des secondes, peut échouer et doit survivre à
 * l'écran : ce type tient donc la progression, l'annulation et le nettoyage du fichier temporaire.
 *
 * Le MP4 ne touche jamais le backend (« RAW publish + author-only export »). Préparation et rendu tournent hors du fil
 * principal ([dispatcher]) ; le moteur ne fait basculer sur le fil principal que ce que Media3 exige.
 */
public class SceneExportCoordinator(
    private val runner: SceneTransformRunner,
    private val gallery: CaptureGallery,
    private val tempDirectory: File,
    private val scope: CoroutineScope,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Default,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val mutableState = MutableStateFlow<SceneExportState>(SceneExportState.Idle)
    public val state: StateFlow<SceneExportState> = mutableState.asStateFlow()

    private var running: Job? = null

    /**
     * Bake la scène : [prepare] résout les fichiers et peint le calque (hors du fil principal) pour le [File] de sortie.
     * Un export en vol rend l'appel sans effet.
     */
    public fun export(destination: SceneExportDestination, prepare: suspend (output: File) -> SceneExportJob) {
        if (state.value is SceneExportState.Running) return
        mutableState.value = SceneExportReducer.start(state.value, destination)
        running = scope.launch(dispatcher) { bake(destination, prepare) }
    }

    private suspend fun bake(destination: SceneExportDestination, prepare: suspend (File) -> SceneExportJob) {
        tempDirectory.mkdirs()
        val output = File(tempDirectory, SceneExportPlan.fileName(nowMillis()))
        var kept = false
        try {
            runner.run(prepare(output)) { fraction -> mutableState.update { SceneExportReducer.progress(it, fraction) } }
            kept = deliver(destination, output)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Throwable) {
            mutableState.update(SceneExportReducer::failed)
        } finally {
            if (!kept) withContext(NonCancellable) { output.delete() }
        }
    }

    /** `true` quand le fichier doit survivre (partage : la feuille le lit PENDANT sa présentation). */
    private suspend fun deliver(destination: SceneExportDestination, output: File): Boolean = when (destination) {
        SceneExportDestination.SHARE -> {
            mutableState.update { SceneExportReducer.completed(it, output.absolutePath) }
            true
        }
        SceneExportDestination.GALLERY -> {
            val saved = gallery.saveVideo(output, output.name)
            mutableState.update { if (saved) SceneExportReducer.saved(it) else SceneExportReducer.failed(it) }
            false
        }
    }

    /** L'écran se ferme pendant un bake, ou l'auteur annule : le moteur s'arrête et ce qu'il avait écrit part. */
    public fun cancel() {
        running?.cancel()
        running = null
        discardReadyFile()
        mutableState.value = SceneExportReducer.cancel(state.value)
    }

    /** La feuille de partage s'est refermée, menée à terme ou non : dans les deux cas le temporaire part. */
    public fun finishSharing() {
        discardReadyFile()
        mutableState.value = SceneExportState.Idle
    }

    /** Le toast (enregistré / échec) a été dit. */
    public fun acknowledge() {
        mutableState.update(SceneExportReducer::acknowledged)
    }

    private fun discardReadyFile() {
        SceneExportReducer.leftoverFile(state.value)?.let { File(it).delete() }
    }
}
