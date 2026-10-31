package me.meeshy.app.stories

import android.graphics.Bitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.media.scene.SceneExportCoordinatorFactory
import me.meeshy.sdk.media.scene.SceneExportJob
import me.meeshy.sdk.media.scene.SceneExportOverlay
import me.meeshy.sdk.media.scene.SceneExportSlideFill
import me.meeshy.sdk.media.scene.SceneExportSoundFile
import me.meeshy.sdk.media.scene.SceneMediaProbe
import me.meeshy.sdk.model.composer.scene.SceneExportBackground
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportRecipe
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.composer.scene.SceneExportVideoInput
import me.meeshy.sdk.model.scene.export.StoryExportClipRange
import me.meeshy.sdk.model.scene.export.StoryExportVideoFormat

/**
 * L'export de la scène hors de Meeshy (galerie, partage) : le bake se tient ici et non dans l'écran — il dure des
 * secondes, peut échouer et s'annule avec l'écran (la portée est celle du ViewModel : fermer le composeur arrête le
 * moteur et efface ce qu'il avait écrit).
 */
@HiltViewModel
class SceneExportViewModel @Inject constructor(
    private val factory: SceneExportCoordinatorFactory,
) : ViewModel() {

    private val coordinator = factory.create(viewModelScope)

    val state: StateFlow<SceneExportState> = coordinator.state

    /**
     * [frame] : la scène capturée telle que l'auteur la voit — entière pour un fond fixe, sans fond pour une vidéo (le
     * calque des objets se pose alors sur chaque image). Le ViewModel la possède dès cet appel et la libère.
     */
    internal fun export(destination: SceneExportDestination, sources: SceneExportSources, frame: Bitmap) {
        coordinator.export(destination) { output, work -> prepare(sources, frame, output, work) }
    }

    private suspend fun prepare(sources: SceneExportSources, frame: Bitmap, output: File, work: File): SceneExportJob {
        var painted: Bitmap? = null
        try {
            val recipe = SceneExportRecipe.of(
                durationSeconds = sources.durationSeconds,
                video = sources.video?.let { SceneExportVideoInput(null, null, it.assetDurationSeconds, it.muted) },
                sounds = sources.sounds.map { it.input },
            )
            val plan = recipe.plan
            val scaled = scaledCopy(frame, plan.width, plan.height).also { painted = it }
            work.mkdirs()
            val background = when (val fill = recipe.background) {
                SceneExportBackground.Still -> File(work, "scene.png").also { file ->
                    file.outputStream().use { scaled.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it) }
                }.let { SceneExportSlideFill.Picture(it) }
                is SceneExportBackground.Video -> File(work, "background.mp4").also {
                    factory.fetcher.fetch(factory.mediaUrl(requireNotNull(sources.video).url), it)
                }.let { SceneExportSlideFill.Video(it, listOf(StoryExportClipRange(fill.clipStartMillis, fill.clipEndMillis))) }
            }
            val sounds = recipe.sounds.withIndex().associate { (index, sound) ->
                val url = sources.sounds.first { it.input.id == sound.id }.url
                url to File(work, "sound-$index.audio").also { factory.fetcher.fetch(url, it) }
            }
            val files = sounds.mapValues { (_, file) -> SceneExportSoundFile(file, SceneMediaProbe.durationMillis(file)) } +
                ((background as? SceneExportSlideFill.Video)?.let { mapOf(BACKGROUND_SOURCE to SceneExportSoundFile(it.file, null)) }.orEmpty())
            val timeline = recipe.timeline(BACKGROUND_SOURCE) { sound -> sources.sounds.firstOrNull { it.input.id == sound.id }?.url }
            val overlay = scaled.takeIf { background is SceneExportSlideFill.Video }
            if (overlay == null) { scaled.recycle(); painted = null }
            return SceneExportJob(
                plan = timeline,
                format = StoryExportVideoFormat(plan.width, plan.height, plan.fps, plan.bitRate),
                fills = listOf(background),
                overlays = listOfNotNull(overlay?.let { SceneExportOverlay.Painted(0L, plan.durationMillis, it) }),
                sounds = files,
                output = output,
                release = { painted?.recycle() },
            )
        } catch (failure: Throwable) {
            painted?.recycle()
            throw failure
        } finally {
            frame.recycle()
        }
    }

    /**
     * Toujours une copie NEUVE : `createScaledBitmap` rend la source elle-même quand elle a déjà la taille du plan, et
     * la source est recyclée à la fin de la préparation — le calque d'un fond vidéo serait alors recyclé sous le moteur.
     */
    private fun scaledCopy(frame: Bitmap, width: Int, height: Int): Bitmap =
        if (frame.width == width && frame.height == height) {
            frame.copy(Bitmap.Config.ARGB_8888, false)
        } else {
            Bitmap.createScaledBitmap(frame, width, height, true)
        }

    fun cancel() = coordinator.cancel()

    fun acknowledge() = coordinator.acknowledge()

    fun handedOver() = coordinator.handedOver()

    override fun onCleared() {
        coordinator.cancel()
    }

    private companion object {
        const val PNG_QUALITY = 100
        const val BACKGROUND_SOURCE = "background"
    }
}
