package me.meeshy.app.game.notebook

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
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.GamePhotoCatchUpLaw
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.PhotoLawEntry
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress

/** `Loading` : rien de connu encore, le squelette ; `Ready` : ce que le cache sait, même vide. */
enum class GameNotebookPhase { Loading, Ready }

/**
 * Ce que la Chronique montre. Les étapes à rattraper viennent de la loi partagée ([GamePhotoCatchUpLaw]) sur la
 * situation du jeu ; aucune photo n'est encore gardée sur Android, toutes les étapes franchies attendent donc la leur.
 */
data class GameNotebookUiState(
    val phase: GameNotebookPhase = GameNotebookPhase.Loading,
    val catchUp: List<PhotoLawEntry> = emptyList(),
) {
    val isEmpty: Boolean get() = phase == GameNotebookPhase.Ready && catchUp.isEmpty()

    /** Le titre d'une étape attendue par une autre, pour « Prends d'abord : … ». */
    fun step(id: String): PhotoLawEntry? = catchUp.firstOrNull { it.id == id }

    companion object {
        /** La Chronique d'une situation connue — ou d'aucune (`null`) : rien à rattraper. */
        fun ready(standing: PhotoCatchUpStanding?): GameNotebookUiState = GameNotebookUiState(
            phase = GameNotebookPhase.Ready,
            catchUp = standing?.let { GamePhotoCatchUpLaw.catchUp(it, kept = emptySet()) }.orEmpty(),
        )

        /** Froid : le squelette, tant que la synchronisation n'a pas dit qu'elle échouait ; ensuite, l'état vide. */
        fun of(result: CacheResult<ApiEngagementProgress>, syncFailed: Boolean): GameNotebookUiState {
            val progress = result.valueOrNull ?: return if (syncFailed) ready(null) else GameNotebookUiState()
            return ready(progress.game?.let(PhotoCatchUpStanding::of))
        }
    }
}

/**
 * LA CHRONIQUE (iOS `GameNotebookViewModel`) — lue dans le cache de la progression, comme la première page : elle
 * s'ouvre instantanément, hors ligne comme en ligne, et n'interroge le réseau que par la revalidation silencieuse du
 * cache. Les photos vivent sur l'appareil ; rien n'est envoyé au serveur.
 */
@HiltViewModel
class GameNotebookViewModel @Inject constructor(
    repository: EngagementProgressRepository,
    @DefaultDispatcher defaultDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val syncFailed = MutableStateFlow(false)

    val state: StateFlow<GameNotebookUiState> = combine(
        repository.progress(onSyncError = { syncFailed.value = true }),
        syncFailed,
        GameNotebookUiState::of,
    ).flowOn(defaultDispatcher)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), GameNotebookUiState())

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
    }
}
