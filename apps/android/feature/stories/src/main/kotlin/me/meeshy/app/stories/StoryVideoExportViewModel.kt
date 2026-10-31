package me.meeshy.app.stories

import android.graphics.Bitmap
import android.graphics.Color
import android.media.MediaMetadataRetriever
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.File
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.media.scene.SceneExportCoordinatorFactory
import me.meeshy.sdk.media.scene.SceneExportLog
import me.meeshy.sdk.media.scene.SceneMediaProbe
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.composer.scene.SceneExportState
import me.meeshy.sdk.model.scene.export.StoryExportAuthorFacts
import me.meeshy.sdk.model.scene.export.ImagerQuarter
import me.meeshy.sdk.model.scene.export.StoryExportMode
import me.meeshy.sdk.model.scene.export.StoryExportMood
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.relation.RelationLevelProvider
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import me.meeshy.sdk.status.StatusRepository

/**
 * L'export vidéo d'une story depuis le lecteur, ou des scènes d'un post ou d'un réel : Enregistrer, Partager ou Imager. Le bake vit à la portée du ViewModel —
 * quitter le lecteur arrête le moteur et efface ce qu'il avait écrit.
 */
@HiltViewModel
class StoryVideoExportViewModel @Inject constructor(
    factory: SceneExportCoordinatorFactory,
    private val config: MeeshyConfig,
    private val statusRepository: StatusRepository,
    private val statusBarCache: StatusBarCache,
    relationLevel: RelationLevelProvider,
) : ViewModel() {

    private val coordinator = factory.create(viewModelScope)
    private val stages = StoryVideoExportStages()

    val state: StateFlow<SceneExportState> = coordinator.state
    val stage: StateFlow<StoryVideoExportStage> = stages.stage

    private val preparer = StoryVideoExportPreparer(
        fetch = factory.fetcher::fetch,
        probeMillis = SceneMediaProbe::durationMillis,
        blankPicture = ::writeBlankPicture,
        lastFrame = ::writeLastFrame,
        chooseLength = stages::askLength,
        paint = stages::askPaint,
        paintBrand = ::paintBrand,
    )

    /** Le mood de l'auteur et le niveau de son lien sont lus à l'export, bornés : ce qui n'arrive pas à temps manque. */
    private val brandResolver = StoryExportBrandResolver(
        relationLevel = relationLevel,
        moodOf = { userId -> StoryExportMood.liveIn(friendStatuses(), userId, System.currentTimeMillis()) },
    )

    /**
     * Les statuts « amis », cache d'abord (iOS `resolveMood` lit le cache `statuses_friends`) : le réseau n'est appelé que
     * lorsque la barre des moods n'a encore rien servi — le serveur y place le statut du lecteur lui-même en tête.
     */
    private suspend fun friendStatuses(): List<StatusEntry> =
        statusBarCache.load(StatusFeedMode.FRIENDS).valueOrNull
            ?: statusRepository.list(StatusFeedMode.FRIENDS).getOrNull()?.statuses.orEmpty()

    fun export(mode: StoryExportMode, item: StoryItem, slide: StorySlideView) = export(mode, listOf(item to slide))

    /**
     * Les scènes d'un post ou d'un réel, rendues bout à bout dans UNE vidéo (#13896) ; une story n'en a qu'une. [author] :
     * l'auteur d'une STORY — l'export s'ouvre sur son intro (mood, présence selon l'affinité, logo de cercle dès Proche) et se
     * ferme sur sa carte, avec les jingles ; `null` rend l'œuvre seule.
     */
    fun export(mode: StoryExportMode, scenes: List<Pair<StoryItem, StorySlideView>>, author: StoryExportAuthorFacts? = null) {
        if (scenes.isEmpty()) return
        val exported = scenes.map { (item, slide) -> StoryExportScene.of(item, slide, config.apiBaseUrl) }
        coordinator.export(mode.destination) { output, work ->
            preparer.prepare(mode, exported, output, work, author?.let { brandResolver.identity(it) })
        }
    }

    private suspend fun paintBrand(request: StoryExportBrandPaintRequest): StoryExportBrandCards? = try {
        withContext(Dispatchers.Default) { StoryExportBrandCardPainter.write(request) }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (failure: Exception) {
        null
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
        const val MICROS_PER_MILLI = 1_000L

        /** La dernière image d'une vidéo de fond qui ne boucle pas : elle tient l'écran jusqu'à la fin de la slide. */
        fun writeLastFrame(video: File, atMillis: Long, target: File): Boolean {
            val retriever = MediaMetadataRetriever()
            return try {
                retriever.setDataSource(video.path)
                val frame = retriever.getFrameAtTime(atMillis * MICROS_PER_MILLI, MediaMetadataRetriever.OPTION_CLOSEST) ?: return false
                try {
                    target.outputStream().use { frame.compress(Bitmap.CompressFormat.PNG, PNG_QUALITY, it) }
                } finally {
                    frame.recycle()
                }
            } catch (failure: Exception) {
                SceneExportLog.warn("dernière image de la vidéo de fond illisible, fond noir tenu", failure)
                false
            } finally {
                retriever.release()
            }
        }

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
