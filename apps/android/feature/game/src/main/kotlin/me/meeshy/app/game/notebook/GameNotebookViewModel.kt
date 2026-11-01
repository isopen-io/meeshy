package me.meeshy.app.game.notebook

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.app.game.photo.GamePhotoNotebooking
import me.meeshy.app.game.photo.GamePhotoNotebooks
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.PhotoLawEntry
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.photo.GamePhotoNotebookIndex
import me.meeshy.sdk.model.game.photo.NotebookEntry
import me.meeshy.sdk.model.game.photo.NotebookStatus

/** `Loading` : rien de connu encore, le squelette ; `Ready` : ce que le cache sait, même vide. */
enum class GameNotebookPhase { Loading, Ready }

/** Ce que la Chronique de l'appareil garde : ses entrées (la plus récente d'abord), leurs vignettes, la place occupée. */
data class NotebookShelf(
    val entries: List<NotebookEntry> = emptyList(),
    val thumbnails: Map<String, Bitmap> = emptyMap(),
    val occupiedBytes: Long = 0,
    val removalFailed: Boolean = false,
)

/**
 * Ce que la Chronique montre (iOS `GameNotebookViewModel`) : les moments laissés « plus tard », les étapes à rattraper
 * (la loi partagée [GamePhotoCatchUpLaw], moins les photos GARDÉES), les photos gardées, et la place qu'elles occupent.
 */
data class GameNotebookUiState(
    val phase: GameNotebookPhase = GameNotebookPhase.Loading,
    val catchUp: List<PhotoLawEntry> = emptyList(),
    val shelf: NotebookShelf = NotebookShelf(),
) {
    val kept: List<NotebookEntry> get() = shelf.entries.filter { it.status == NotebookStatus.Kept }

    /** « En attente » ne garde que les moments hors des pistes : une étape reportée ne se montre que dans « À rattraper ». */
    val pending: List<NotebookEntry> get() = GamePhotoNotebookIndex.pending(shelf.entries)

    val isEmpty: Boolean get() = phase == GameNotebookPhase.Ready && catchUp.isEmpty() && kept.isEmpty() && pending.isEmpty()

    /** Le titre d'une étape attendue par une autre, pour « Prends d'abord : … ». */
    fun step(id: String): PhotoLawEntry? = catchUp.firstOrNull { it.id == id }

    companion object {
        /** La Chronique d'une situation connue — ou d'aucune (`null`) : rien à rattraper. */
        fun ready(standing: PhotoCatchUpStanding?, shelf: NotebookShelf = NotebookShelf()): GameNotebookUiState = GameNotebookUiState(
            phase = GameNotebookPhase.Ready,
            catchUp = standing?.let { GamePhotoCatchUpLaw.catchUp(it, GamePhotoNotebookIndex.keptIds(shelf.entries)) }.orEmpty(),
            shelf = shelf,
        )

        /** Froid : le squelette, tant que la synchronisation n'a pas dit qu'elle échouait ; ensuite, l'état vide. */
        fun of(result: CacheResult<ApiEngagementProgress>, syncFailed: Boolean, shelf: NotebookShelf = NotebookShelf()): GameNotebookUiState {
            val progress = result.valueOrNull ?: return if (syncFailed) ready(null, shelf) else GameNotebookUiState(shelf = shelf)
            return ready(progress.game?.let(PhotoCatchUpStanding::of), shelf)
        }
    }
}

/**
 * LA CHRONIQUE (iOS `GameNotebookViewModel`) — lue dans le cache de la progression, comme la première page, et dans la
 * Chronique de l'appareil : elle s'ouvre instantanément, hors ligne comme en ligne. Les photos vivent sur l'appareil ;
 * rien n'est envoyé au serveur. Une photo gardée ouvre l'étape suivante de sa piste.
 */
@HiltViewModel
class GameNotebookViewModel internal constructor(
    repository: EngagementProgressRepository,
    val notebook: GamePhotoNotebooking,
    private val defaultDispatcher: CoroutineDispatcher,
    private val thumbnail: (ByteArray) -> Bitmap? = ::listThumbnail,
) : ViewModel() {

    @Inject constructor(
        repository: EngagementProgressRepository,
        notebooks: GamePhotoNotebooks,
        @DefaultDispatcher defaultDispatcher: CoroutineDispatcher,
    ) : this(repository, notebooks.current(), defaultDispatcher)

    private val syncFailed = MutableStateFlow(false)
    private val shelf = MutableStateFlow(NotebookShelf())

    val state: StateFlow<GameNotebookUiState> = combine(
        repository.progress(onSyncError = { syncFailed.value = true }),
        syncFailed,
        shelf,
        GameNotebookUiState::of,
    ).flowOn(defaultDispatcher)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), GameNotebookUiState())

    init {
        reload()
    }

    /** Relit la Chronique de l'appareil — à l'ouverture, et au retour du déroulé photo. */
    fun reload() {
        viewModelScope.launch { refresh(removalFailed = shelf.value.removalFailed) }
    }

    fun remove(entry: NotebookEntry) {
        viewModelScope.launch {
            val ok = notebook.remove(entry.momentId)
            if (ok) refresh(removalFailed = false) else shelf.update { it.copy(removalFailed = true) }
        }
    }

    private suspend fun refresh(removalFailed: Boolean) {
        val entries = notebook.list()
        val known = shelf.value.thumbnails
        val thumbnails = entries.filter { it.status == NotebookStatus.Kept }.mapNotNull { entry ->
            (known[entry.momentId] ?: notebook.storyBytes(entry)?.let { decode(it) })?.let { entry.momentId to it }
        }.toMap()
        shelf.value = NotebookShelf(entries, thumbnails, notebook.occupiedBytes(), removalFailed)
    }

    private suspend fun decode(bytes: ByteArray): Bitmap? = withContext(defaultDispatcher) { thumbnail(bytes) }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L

        /** La vignette se décode À LA TAILLE DE LA LISTE : une photo 1 080 × 1 920 entière pèse huit Mo. */
        const val THUMBNAIL_MAX_PIXEL = 320

        fun listThumbnail(bytes: ByteArray): Bitmap? {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
            val longest = maxOf(bounds.outWidth, bounds.outHeight)
            if (longest <= 0) return null
            var sample = 1
            while (longest / (sample * 2) >= THUMBNAIL_MAX_PIXEL) sample *= 2
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
        }
    }
}
