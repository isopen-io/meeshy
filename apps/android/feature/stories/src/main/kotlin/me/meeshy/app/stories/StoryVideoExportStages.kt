package me.meeshy.app.stories

import java.io.File
import java.util.Locale
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.ImagerDecision
import me.meeshy.sdk.model.scene.export.ImagerOffer
import me.meeshy.sdk.model.scene.export.StoryExportMode

/**
 * Ce que l'export attend de l'écran : rien, la vue Imager (ouverte dès le geste, son [Imagining.offer] arrivant une fois la
 * composition mesurée — `null` : elle se prépare), ou la peinture des calques.
 */
sealed interface StoryVideoExportStage {
    data object Idle : StoryVideoExportStage
    data class Imagining(val offer: ImagerOffer?) : StoryVideoExportStage
    data class Painting(val request: StoryExportPaintRequest) : StoryVideoExportStage
}

/** Enregistrer dépose le rendu dans la photothèque, Partager le remet à la feuille de partage ; Imager part vers la photothèque jusqu'à ce que sa vue décide. */
val StoryExportMode.destination: SceneExportDestination
    get() = if (this == StoryExportMode.SHARE) SceneExportDestination.SHARE else SceneExportDestination.GALLERY

/**
 * Le pont entre la préparation (hors du fil principal) et l'écran : chaque étape se montre, puis attend la réponse de
 * l'écran ; annuler libère l'étape en vol.
 */
class StoryVideoExportStages {

    private val mutableStage = MutableStateFlow<StoryVideoExportStage>(StoryVideoExportStage.Idle)
    val stage: StateFlow<StoryVideoExportStage> = mutableStage.asStateFlow()

    private var imager: CompletableDeferred<ImagerDecision?>? = null
    private var painting: CompletableDeferred<List<File>?>? = null

    /** La vue Imager s'ouvre au GESTE, avant toute mesure : rien ne se rend tant qu'elle n'a pas décidé. */
    fun openImager() {
        imager = CompletableDeferred()
        mutableStage.value = StoryVideoExportStage.Imagining(offer = null)
    }

    /** La composition est mesurée : la vue montre son [offer] et l'export attend sa décision, qui ne sert qu'une fois. */
    suspend fun askImager(offer: ImagerOffer): ImagerDecision? {
        val answer = imager ?: CompletableDeferred<ImagerDecision?>().also { imager = it }
        return try {
            ask(StoryVideoExportStage.Imagining(offer), answer)
        } finally {
            if (imager === answer) imager = null
        }
    }

    suspend fun askPaint(request: StoryExportPaintRequest): List<File>? =
        ask(StoryVideoExportStage.Painting(request), CompletableDeferred<List<File>?>().also { painting = it })

    fun answerImager(decision: ImagerDecision?) {
        imager?.complete(decision)
    }

    fun answerPaint(files: List<File>?) {
        painting?.complete(files)
    }

    fun reset() {
        imager?.cancel()
        painting?.cancel()
        imager = null
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
