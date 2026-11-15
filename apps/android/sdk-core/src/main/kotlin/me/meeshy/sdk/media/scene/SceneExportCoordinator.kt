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
 * en MP4 — ou, fixe et muette, son image (#13897) —, remise à la galerie ou à une feuille de partage. Un bake dure des secondes, peut échouer et doit survivre à
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
    /** Ce qui arrête l'export, journalisé (#13986) : jamais un échec sans sa cause. */
    private val report: (Throwable) -> Unit = SceneExportLog::failed,
    /** Relit la vidéo rendue avant de la remettre : un fichier qui ne montre pas sa scène échoue au lieu de s'enregistrer (#13986). */
    private val proof: SceneExportProof = SceneExportProof.NONE,
) {
    private val mutableState = MutableStateFlow<SceneExportState>(SceneExportState.Idle)
    public val state: StateFlow<SceneExportState> = mutableState.asStateFlow()

    private var running: Job? = null

    /**
     * Bake la scène : [prepare] résout les fichiers et peint le calque (hors du fil principal) pour le [File] de sortie ;
     * ses fichiers de travail vivent dans `workDirectory`, effacé quoi qu'il arrive. Un export en vol rend l'appel sans effet.
     */
    public fun export(destination: SceneExportDestination, prepare: suspend (output: File, workDirectory: File) -> SceneExportJob) {
        if (state.value is SceneExportState.Running) return
        mutableState.value = SceneExportReducer.start(state.value, destination)
        running = scope.launch(dispatcher) { bake(destination, prepare) }
    }

    private suspend fun bake(destination: SceneExportDestination, prepare: suspend (File, File) -> SceneExportJob) {
        sweepStale()
        tempDirectory.mkdirs()
        val stamp = nowMillis()
        val output = File(tempDirectory, SceneExportPlan.fileName(stamp))
        val image = File(tempDirectory, SceneExportPlan.stillFileName(stamp))
        val workDirectory = File(tempDirectory, "work-$stamp")
        var kept = false
        var job: SceneExportJob? = null
        try {
            job = prepare(output, workDirectory)
            val target = job.destination ?: destination
            mutableState.update { SceneExportReducer.retarget(it, target) }
            val still = job.still
            kept = if (still != null) {
                deliverStill(target, still, image)
            } else {
                runner.run(job) { fraction -> mutableState.update { SceneExportReducer.progress(it, fraction) } }
                mutableState.update(SceneExportReducer::verifying)
                val checking = nowMillis()
                proof.verify(job)
                SceneExportLog.info("vérification du rendu : ${nowMillis() - checking} ms")
                deliver(target, output)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Throwable) {
            report(failure)
            mutableState.update(SceneExportReducer::failed)
        } finally {
            withContext(NonCancellable) {
                job?.release?.invoke()
                workDirectory.deleteRecursively()
                if (!kept) {
                    output.delete()
                    image.delete()
                }
            }
        }
    }

    /** Ce qu'un export précédent a laissé (fichier remis à une autre appli, session tuée) : un seul bake à la fois, donc plus de lecteur. */
    private fun sweepStale() {
        tempDirectory.listFiles()?.forEach { it.deleteRecursively() }
    }

    /** `true` quand le fichier doit survivre (partage : la feuille le lit PENDANT sa présentation). */
    private suspend fun deliver(destination: SceneExportDestination, output: File): Boolean = when (destination) {
        SceneExportDestination.SHARE -> {
            mutableState.update { SceneExportReducer.completed(it, output.absolutePath) }
            true
        }
        SceneExportDestination.GALLERY -> {
            settle(gallery.saveVideo(output, output.name), output.name)
            false
        }
    }

    /** Une scène fixe : son image part telle quelle, à la galerie ou à la feuille de partage ; `true` quand [image] doit survivre. */
    private suspend fun deliverStill(destination: SceneExportDestination, still: File, image: File): Boolean = when (destination) {
        SceneExportDestination.SHARE -> {
            still.copyTo(image, overwrite = true)
            mutableState.update { SceneExportReducer.completed(it, image.absolutePath) }
            true
        }
        SceneExportDestination.GALLERY -> {
            settle(gallery.saveImage(still.readBytes(), image.name), image.name)
            false
        }
    }

    private fun settle(saved: Boolean, name: String) {
        if (!saved) report(IllegalStateException("la galerie a refusé $name"))
        mutableState.update { if (saved) SceneExportReducer.saved(it) else SceneExportReducer.failed(it) }
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

    /**
     * Le fichier est parti vers une autre appli (feuille de partage système) : on ne peut pas savoir quand elle l'aura lu,
     * donc il n'est PAS effacé ici — le prochain export balaie le dossier.
     */
    public fun handedOver() {
        mutableState.update { if (it is SceneExportState.Ready) SceneExportState.Idle else it }
    }

    /** Le toast (enregistré / échec) a été dit. */
    public fun acknowledge() {
        mutableState.update(SceneExportReducer::acknowledged)
    }

    private fun discardReadyFile() {
        SceneExportReducer.leftoverFile(state.value)?.let { File(it).delete() }
    }
}
