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
import me.meeshy.sdk.model.game.GameUpdatedEvent
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementMeeshProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import me.meeshy.sdk.model.game.progression.ProgressionConceptCard
import me.meeshy.sdk.model.game.progression.ProgressionConceptFiche
import me.meeshy.sdk.model.game.progression.ProgressionConceptFiches
import me.meeshy.sdk.model.game.progression.ProgressionConceptModel
import me.meeshy.sdk.model.game.progression.ProgressionConceptPieces
import me.meeshy.sdk.model.game.progression.ProgressionFailure
import me.meeshy.sdk.model.game.progression.ProgressionScreenPlan
import me.meeshy.sdk.socket.MessageSocketManager

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
    val gameRevision: Long? = null,
    /** Ce que la fiche de chaque concept servi dit sous sa tête (« Où j'en suis », dédoublonné). */
    val fiches: Map<ProgressionConcept, ProgressionConceptFiche> = emptyMap(),
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
 * Flamme) vivent dans les fiches, avec leur identifiant d'idempotence. L'état changé sur un autre appareil
 * (`game:updated`) se relit en silence tant que l'écran vit.
 */
@HiltViewModel
class ProgressionViewModel @Inject constructor(
    private val repository: EngagementProgressRepository,
    private val messages: MessageSocketManager,
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

    init {
        viewModelScope.launch { messages.gameUpdated.collect(::receive) }
    }

    /**
     * `game:updated` (iOS `ProgressionViewModel.receive`) — une frappe, un gain, une reprise faits AILLEURS : la
     * progression entière se relit derrière, en silence, sans rouvrir l'écran ni montrer le geste de tirer. Un état
     * qui n'est pas plus récent que celui montré ne relit rien ; un événement sans révision (serveur antérieur) relit
     * toujours. Une relecture qui échoue garde l'instantané : l'avis de coupure vient déjà de la synchronisation.
     */
    private suspend fun receive(event: GameUpdatedEvent) {
        val incoming = event.gameRevision
        val shown = state.value.snapshot?.gameRevision
        if (incoming != null && shown != null && incoming <= shown) return
        try {
            repository.refresh()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (ignored: Exception) {
            // L'instantané reste peint ; la synchronisation dit déjà la coupure.
        }
    }

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
        val nowMillis = System.currentTimeMillis()
        val cards = ProgressionConceptModel.cards(progress, game, nowMillis, moment)
        return ProgressionSnapshot(
            progress = progress,
            game = game,
            cards = cards,
            standing = ProgressionStanding(glory = game?.glory, meesh = progress.meesh),
            gameRevision = payload.gameRevision,
            fiches = cards.associate { card ->
                val concept = card.concept
                concept to ProgressionConceptFiches.make(
                    concept, progress, game, nowMillis, moment, pieceIsHero = ProgressionConceptPieces.isHero(concept),
                )
            },
        )
    }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
        const val MINUTES_PER_HOUR = 60
    }
}
