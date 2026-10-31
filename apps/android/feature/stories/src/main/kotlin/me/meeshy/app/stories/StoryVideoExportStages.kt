package me.meeshy.app.stories

import java.io.File
import java.util.Locale
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.ImagerLengthChoice
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode

/** Ce que l'export attend de l'écran : rien, le choix de la longueur rendue, ou la peinture des calques. */
sealed interface StoryVideoExportStage {
    data object Idle : StoryVideoExportStage
    data class ChoosingLength(val choices: List<ImagerLengthChoice>) : StoryVideoExportStage
    data class Painting(val request: StoryExportPaintRequest) : StoryVideoExportStage
}

/** Enregistrer et Imager déposent la vidéo dans la photothèque ; Partager la remet à la feuille de partage. */
val StoryExportMode.destination: SceneExportDestination
    get() = if (this == StoryExportMode.SHARE) SceneExportDestination.SHARE else SceneExportDestination.GALLERY

/**
 * Le pont entre la préparation (hors du fil principal) et l'écran : chaque étape se montre, puis attend la réponse de
 * l'écran ; annuler libère l'étape en vol.
 */
class StoryVideoExportStages {

    private val mutableStage = MutableStateFlow<StoryVideoExportStage>(StoryVideoExportStage.Idle)
    val stage: StateFlow<StoryVideoExportStage> = mutableStage.asStateFlow()

    private var length: CompletableDeferred<ImagerQuarter?>? = null
    private var painting: CompletableDeferred<List<File>?>? = null

    suspend fun askLength(choices: List<ImagerLengthChoice>): ImagerQuarter? =
        ask(StoryVideoExportStage.ChoosingLength(choices), CompletableDeferred<ImagerQuarter?>().also { length = it })

    suspend fun askPaint(request: StoryExportPaintRequest): List<File>? =
        ask(StoryVideoExportStage.Painting(request), CompletableDeferred<List<File>?>().also { painting = it })

    fun answerLength(quarter: ImagerQuarter?) {
        length?.complete(quarter)
    }

    fun answerPaint(files: List<File>?) {
        painting?.complete(files)
    }

    fun reset() {
        length?.cancel()
        painting?.cancel()
        length = null
        painting = null
        mutableStage.value = StoryVideoExportStage.Idle
    }

    private suspend fun <T> ask(stage: StoryVideoExportStage, answer: CompletableDeferred<T>): T {
        mutableStage.value = stage
        try {
            return answer.await()
        } finally {
            mutableStage.update { if (it == stage) StoryVideoExportStage.Idle else it }
        }
    }

    companion object {
        private const val SECONDS_PER_MINUTE = 60

        fun clock(millis: Long): String {
            val seconds = (millis / MILLIS_PER_SECOND).coerceAtLeast(0L)
            return String.format(Locale.ROOT, "%d:%02d", seconds / SECONDS_PER_MINUTE, seconds % SECONDS_PER_MINUTE)
        }

        private const val MILLIS_PER_SECOND = 1000L
    }
}
