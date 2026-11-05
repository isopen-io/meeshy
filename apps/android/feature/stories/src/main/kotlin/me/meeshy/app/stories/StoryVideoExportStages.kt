package me.meeshy.app.stories

import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.composer.scene.SceneExportDestination
import me.meeshy.sdk.model.scene.export.StoryExportMode

sealed interface StoryVideoExportStage {
    data object Idle : StoryVideoExportStage
    data class Painting(val request: StoryExportPaintRequest) : StoryVideoExportStage
}

val StoryExportMode.destination: SceneExportDestination
    get() = if (this == StoryExportMode.SAVE) SceneExportDestination.GALLERY else SceneExportDestination.SHARE

class StoryVideoExportStages {

    private val mutableStage = MutableStateFlow<StoryVideoExportStage>(StoryVideoExportStage.Idle)
    val stage: StateFlow<StoryVideoExportStage> = mutableStage.asStateFlow()

    private var painting: CompletableDeferred<List<File>?>? = null

    suspend fun askPaint(request: StoryExportPaintRequest): List<File>? =
        ask(StoryVideoExportStage.Painting(request), CompletableDeferred<List<File>?>().also { painting = it })

    fun answerPaint(files: List<File>?) {
        painting?.complete(files)
    }

    fun reset() {
        painting?.cancel()
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
}
