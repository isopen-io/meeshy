package me.meeshy.app.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.ProfileStatsCacheRepository
import me.meeshy.sdk.user.UserRepository

/** Pourquoi la dernière synchronisation n'a rien rendu : hors ligne (l'instantané reste affiché) ou en erreur. */
enum class UserStatsFailure { Offline, Error }

/**
 * L'écran des statistiques (iOS `UserStatsView`) : le cache de CE compte se peint d'abord, tout de suite, puis la
 * revalidation se fait en silence — le squelette n'existe qu'à froid. Lecture seule : aucune écriture, donc aucun
 * identifiant d'intention. Un échec ne retire jamais ce qui est affiché ; il se dit (hors ligne / erreur) et se
 * rejoue d'un geste.
 */
data class UserStatsUiState(
    val stats: UserStatsPresentation? = null,
    val timeline: StatsTimelinePresentation? = null,
    /** Aucun instantané et une synchronisation en cours : le squelette. */
    val isColdLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val failure: UserStatsFailure? = null,
) {
    val hasContent: Boolean get() = stats != null || timeline != null
}

@HiltViewModel
class UserStatsViewModel @Inject constructor(
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val statsCache: ProfileStatsCacheRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _state = MutableStateFlow(UserStatsUiState())
    val state: StateFlow<UserStatsUiState> = _state.asStateFlow()

    private val accountId: String? = sessionRepository.currentUserId?.takeIf { it.isNotBlank() }

    init {
        viewModelScope.launch {
            paintFromCache()
            synchronize()
        }
    }

    /** Tirer pour rafraîchir, ou « Réessayer » : relit le serveur sans effacer ce qui est affiché. */
    fun refresh() {
        if (_state.value.isRefreshing) return
        viewModelScope.launch { synchronize() }
    }

    private suspend fun paintFromCache() {
        val id = accountId ?: return
        val stats = guarded { statsCache.cachedStats(id)?.let { UserStatsBuilder.build(it) } }
        val timeline = guarded { statsCache.cachedTimeline(id)?.let { StatsTimelineBuilder.build(it) } }
        if (stats == null && timeline == null) return
        _state.update { it.copy(stats = stats, timeline = timeline, isColdLoading = false) }
    }

    private suspend fun synchronize() {
        val id = accountId
        if (id == null) {
            _state.update { it.copy(isColdLoading = false, failure = UserStatsFailure.Error) }
            return
        }
        _state.update { it.copy(isRefreshing = true) }
        val ticket = statsCache.ticket()
        val (statsResult, timelineResult) = kotlinx.coroutines.coroutineScope {
            val stats = async { guarded { userRepository.getMyStats() } }
            val timeline = async { guarded { userRepository.getUserStatsTimeline() } }
            stats.await() to timeline.await()
        }
        val freshStats = (statsResult as? NetworkResult.Success)?.data
        val freshTimeline = (timelineResult as? NetworkResult.Success)?.data
        val failed = freshStats == null || freshTimeline == null
        _state.update { current ->
            current.copy(
                stats = freshStats?.let(UserStatsBuilder::build) ?: current.stats,
                timeline = if (freshTimeline != null) StatsTimelineBuilder.build(freshTimeline) else current.timeline,
                isColdLoading = false,
                isRefreshing = false,
                failure = when {
                    !failed -> null
                    networkMonitor.isOnline.value -> UserStatsFailure.Error
                    else -> UserStatsFailure.Offline
                },
            )
        }
        freshStats?.let { guarded { statsCache.persistStats(id, it, ticket) } }
        freshTimeline?.let { guarded { statsCache.persistTimeline(id, it, ticket) } }
    }

    /** Une panne de cache ou de réseau ne casse jamais l'écran : elle vaut « rien de neuf ». */
    private suspend fun <T> guarded(block: suspend () -> T): T? = try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        null
    }
}
