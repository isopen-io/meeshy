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
import me.meeshy.sdk.model.composer.scene.SceneExportBackground
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.composer.scene.SceneExportRecipe
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.composer.scene.SceneExportVideoInput

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
            val scaled = Bitmap.createScaledBitmap(frame, plan.width, plan.height, true).also { painted = it }
            work.mkdirs()
            val background = when (recipe.background) {
                SceneExportBackground.Still -> File(work, "scene.png").also { file ->
                    file.outputStream().use { scaled.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it) }
                }
                is SceneExportBackground.Video -> File(work, "background.mp4").also {
                    factory.fetcher.fetch(requireNotNull(sources.video).url, it)
                }
            }
            val sounds = recipe.sounds.withIndex().associate { (index, sound) ->
                val url = sources.sounds.first { it.input.id == sound.id }.url
                sound.id to File(work, "sound-$index.audio").also { factory.fetcher.fetch(url, it) }
            }
            val overlay = scaled.takeIf { recipe.background is SceneExportBackground.Video }
            if (overlay == null) { scaled.recycle(); painted = null }
            return SceneExportJob(recipe, background, overlay, sounds, output, release = { painted?.recycle() })
        } catch (failure: Throwable) {
            painted?.recycle()
            throw failure
        } finally {
            frame.recycle()
        }
    }

    fun cancel() = coordinator.cancel()

    fun acknowledge() = coordinator.acknowledge()

    fun handedOver() = coordinator.handedOver()

    override fun onCleared() {
        coordinator.cancel()
    }

    private companion object {
        const val PNG_QUALITY = 100
    }
}
