package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Color
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.media.scene.SceneExportCoordinatorFactory
import me.meeshy.sdk.media.scene.SceneMediaProbe
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.net.MeeshyConfig

/**
 * L'export vidéo d'une story depuis le lecteur : Enregistrer, Partager ou Imager. Le bake vit à la portée du ViewModel —
 * quitter le lecteur arrête le moteur et efface ce qu'il avait écrit.
 */
@HiltViewModel
class StoryVideoExportViewModel @Inject constructor(
    factory: SceneExportCoordinatorFactory,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val coordinator = factory.create(viewModelScope)
    private val stages = StoryVideoExportStages()

    val state: StateFlow<SceneExportState> = coordinator.state
    val stage: StateFlow<StoryVideoExportStage> = stages.stage

    private val preparer = StoryVideoExportPreparer(
        fetch = factory.fetcher::fetch,
        probeMillis = SceneMediaProbe::durationMillis,
        blankPicture = ::writeBlankPicture,
        chooseLength = stages::askLength,
        paint = stages::askPaint,
    )

    fun export(mode: StoryExportMode, item: StoryItem, slide: StorySlideView) {
        val subject = StoryExportSubject.of(item, slide, config.apiBaseUrl)
        coordinator.export(mode.destination) { output, work -> preparer.prepare(mode, subject, slide, output, work) }
    }

    /** `null` : l'auteur renonce au choix de longueur, l'export s'arrête. */
    fun chooseLength(quarter: ImagerQuarter?) {
        if (quarter == null) cancel() else stages.answerLength(quarter)
    }

    fun painted(files: List<File>?) = stages.answerPaint(files)

    fun cancel() {
        stages.reset()
        coordinator.cancel()
    }

    fun acknowledge() = coordinator.acknowledge()

    fun handedOver() = coordinator.handedOver()

    override fun onCleared() {
        cancel()
    }

    private companion object {
        const val BLANK_WIDTH = 108
        const val BLANK_HEIGHT = 192
        const val PNG_QUALITY = 100

        /** Le support d'un fond fixe : le calque peint porte déjà le fond, l'image ne sert qu'à tenir la durée. */
        fun writeBlankPicture(target: File) {
            val bitmap = Bitmap.createBitmap(BLANK_WIDTH, BLANK_HEIGHT, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.BLACK) }
            try {
                target.outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it) }
            } finally {
                bitmap.recycle()
            }
        }
    }
}
