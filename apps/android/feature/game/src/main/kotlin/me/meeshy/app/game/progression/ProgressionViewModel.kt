package me.meeshy.app.game.progression

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import java.time.LocalDateTime
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.core.common.DefaultDispatcher
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameGlory
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementMeeshProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.progression.ProgressionConceptCard
import me.meeshy.sdk.model.game.progression.ProgressionConceptModel
import me.meeshy.sdk.model.game.progression.ProgressionFailure
import me.meeshy.sdk.model.game.progression.ProgressionScreenPlan

/**
 * Ce que le blason et le compteur de l'en-tête disent : le rang servi et le solde de Meeshes. `null` ⇒ rien — un
 * solde de zéro montré à quelqu'un qui en a deux serait pire qu'une absence.
 */
data class ProgressionStanding(val glory: GameGlory?, val meesh: EngagementMeeshProgress?) {
    val isEmpty: Boolean get() = glory == null && meesh == null
}

/** La charge servie, DÉRIVÉE une fois hors du fil principal : l'écran ne calcule rien en composant. */
data class ProgressionSnapshot(
    val progress: EngagementProgress,
    val game: GameBlock?,
    val cards: List<ProgressionConceptCard>,
    val standing: ProgressionStanding,
)

data class ProgressionUiState(
    val snapshot: ProgressionSnapshot? = null,
    val plan: ProgressionScreenPlan = ProgressionScreenPlan(showsSkeleton = true, notices = emptyList()),
    val isRefreshing: Boolean = false,
)

/**
 * L'écran « Progression » (iOS `ProgressionViewModel`, partie lecture) — lu depuis `GET /me/engagement`, cache
 * d'abord : le dernier instantané se peint immédiatement, la revalidation se fait en silence, le squelette
 * n'apparaît qu'à froid. Hors ligne, l'instantané reste affiché avec son avis.
 *
 * Il ne calcule ni niveau, ni rang, ni prix, ni solde : chaque nombre est celui de la passerelle, dérivé par la loi
 * partagée ([EngagementProgressResolver], [ProgressionConceptModel]). Les gestes d'écriture (frapper, coffre,
 * Flamme) vivent dans les fiches, avec leur identifiant d'idempotence — ils ne sont pas dans cette itération.
 */
@HiltViewModel
class ProgressionViewModel @Inject constructor(
    private val repository: EngagementProgressRepository,
    @DefaultDispatcher private val defaultDispatcher: CoroutineDispatcher = Dispatchers.Default,
) : ViewModel() {

    private val failure = MutableStateFlow<ProgressionFailure?>(null)
    private val refreshing = MutableStateFlow(false)

    val state: StateFlow<ProgressionUiState> = combine(
        repository.progress(onSyncError = { failure.value = classify(it) })
            .onEach { if (it is CacheResult.Fresh) failure.value = null }
            .map { result -> result to result.valueOrNull?.let(::derive) }
            .flowOn(defaultDispatcher),
        failure,
        refreshing,
    ) { (result, snapshot), failed, isRefreshing ->
        ProgressionUiState(
            snapshot = snapshot,
            plan = ProgressionScreenPlan.of(
                hasProgress = snapshot != null,
                progressIsEmpty = snapshot?.progress?.isEmpty ?: false,
                failure = failed,
                isLoading = result !is CacheResult.Fresh,
            ),
            isRefreshing = isRefreshing,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), ProgressionUiState())

    /** Tirer pour rafraîchir, ou « Réessayer » : force le réseau, le cache reste peint si la passerelle échoue. */
    fun refresh() {
        if (refreshing.value) return
        viewModelScope.launch {
            refreshing.value = true
            failure.value = null
            try {
                repository.refresh()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                failure.value = classify(error)
            } finally {
                refreshing.value = false
            }
        }
    }

    private fun classify(error: Throwable): ProgressionFailure =
        if (error is IOException) ProgressionFailure.Offline else ProgressionFailure.Server

    private fun derive(payload: ApiEngagementProgress): ProgressionSnapshot {
        val progress = EngagementProgressResolver.resolve(payload)
        val game = payload.game
        val now = LocalDateTime.now(ZoneId.systemDefault())
        val moment = SeasonMoment(now.toLocalDate().toString(), now.hour * MINUTES_PER_HOUR + now.minute)
        return ProgressionSnapshot(
            progress = progress,
            game = game,
            cards = ProgressionConceptModel.cards(progress, game, System.currentTimeMillis(), moment),
            standing = ProgressionStanding(glory = game?.glory, meesh = progress.meesh),
        )
    }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
        const val MINUTES_PER_HOUR = 60
    }
}
