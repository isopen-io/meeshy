package me.meeshy.app.game.pages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.game.LeagueFriendsResponse
import me.meeshy.sdk.model.game.LeagueWeekResponse
import me.meeshy.sdk.model.game.progression.ProgressionFailure

/** Ce qu'une lecture montre : la valeur (du cache ou servie), le squelette à froid, l'échec — jamais l'un SUR l'autre. */
data class GameBoard<out T>(
    val value: T? = null,
    val showsSkeleton: Boolean = false,
    val failure: ProgressionFailure? = null,
) {
    /** L'échec se dit en grand quand il n'y a rien d'autre à montrer ; sinon il reste discret. */
    val failedWithoutValue: Boolean get() = value == null && failure != null
}

/** Le refus du consentement : la coupure, ou le code de la passerelle (mis en phrase par l'écran). */
sealed interface ConsentRefusal {
    data object Offline : ConsentRefusal
    data class Code(val wire: String?) : ConsentRefusal
}

data class LeagueUiState(
    val week: GameBoard<LeagueWeekResponse> = GameBoard(),
    val friends: GameBoard<LeagueFriendsResponse> = GameBoard(),
    /** Les amis acceptés, par identifiant : le SEUL endroit du jeu où un classement porte des identités. */
    val directory: Map<String, FriendRequestUser> = emptyMap(),
    val consentBusy: Boolean = false,
    val consentRefusal: ConsentRefusal? = null,
)

/**
 * La page « Ligue » (iOS `GameWave2Model`, partie lecture + consentement) : le classement de MA semaine et la ligue
 * Amis, cache d'abord. Le client ne place ni ne classe personne : l'ordre, les zones et `isMe` sont ceux de la
 * passerelle. Chaque lecture ne démarre que lorsque l'écran la demande (l'onglet, l'ouverture de la ligue).
 *
 * Le consentement est le seul geste : il ne touche à aucun solde. Son identifiant d'idempotence naît UNE fois par
 * intention et ne se renouvelle qu'après un SUCCÈS — un réessai après coupure rejoue la même requête.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class LeagueViewModel @Inject constructor(
    private val pages: GamePagesRepository,
    private val progress: EngagementProgressRepository,
    private val friendList: FriendListRepository,
) : ViewModel() {

    private val weekWanted = MutableStateFlow(false)
    private val friendsWanted = MutableStateFlow(false)
    private val weekFailure = MutableStateFlow<ProgressionFailure?>(null)
    private val friendsFailure = MutableStateFlow<ProgressionFailure?>(null)
    private val directory = MutableStateFlow<Map<String, FriendRequestUser>>(emptyMap())
    private val consentBusy = MutableStateFlow(false)
    private val consentRefusal = MutableStateFlow<ConsentRefusal?>(null)
    private var consentIntent: Pair<Boolean, String>? = null

    private val weekBoard: Flow<GameBoard<LeagueWeekResponse>> =
        board(weekWanted, weekFailure) { pages.leagueWeek(onSyncError = { weekFailure.value = classify(it) }) }
    private val friendsBoard: Flow<GameBoard<LeagueFriendsResponse>> =
        board(friendsWanted, friendsFailure) { pages.friendsLeague(onSyncError = { friendsFailure.value = classify(it) }) }

    val state: StateFlow<LeagueUiState> = combine(
        weekBoard, friendsBoard, directory, consentBusy, consentRefusal,
    ) { week, friends, names, busy, refusal ->
        LeagueUiState(week, friends, names, busy, refusal)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), LeagueUiState())

    init {
        viewModelScope.launch {
            directory.value = friendList.cachedSnapshot().orEmpty().associateBy { it.id }
        }
    }

    /** L'ouverture de la ligue publique demande le classement ; son retrait le lâche. */
    fun wantWeek(wanted: Boolean) {
        weekWanted.value = wanted
    }

    /** L'onglet « Amis » demande la ligue Amis. */
    fun wantFriends(wanted: Boolean) {
        friendsWanted.value = wanted
    }

    /** « Réessayer » : force le réseau, le cache reste peint si la passerelle échoue. */
    fun retryWeek() = refresh(weekFailure) { pages.refreshLeagueWeek() }

    fun retryFriends() = refresh(friendsFailure) { pages.refreshFriendsLeague() }

    /** Consentir à la ligue publique, ou retirer son accord. */
    fun setConsent(consent: Boolean) {
        if (consentBusy.value) return
        val intent = consentIntent?.takeIf { it.first == consent } ?: (consent to UUID.randomUUID().toString())
        consentIntent = intent
        viewModelScope.launch {
            consentBusy.value = true
            consentRefusal.value = null
            when (val outcome = pages.setLeagueConsent(intent.second, consent)) {
                is GameWriteOutcome.Done -> {
                    consentIntent = null
                    if (!consent) pages.forgetLeagueWeek()
                    runCatching { progress.refresh() }.onFailure { if (it is CancellationException) throw it }
                }
                is GameWriteOutcome.Refused ->
                    consentRefusal.value = if (outcome.offline) ConsentRefusal.Offline else ConsentRefusal.Code(outcome.code)
            }
            consentBusy.value = false
        }
    }

    private fun refresh(failure: MutableStateFlow<ProgressionFailure?>, force: suspend () -> Unit) {
        viewModelScope.launch {
            failure.value = null
            try {
                force()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (error: Exception) {
                failure.value = classify(error)
            }
        }
    }

    private fun <T : Any> board(
        wanted: Flow<Boolean>,
        failure: MutableStateFlow<ProgressionFailure?>,
        open: () -> Flow<CacheResult<T>>,
    ): Flow<GameBoard<T>> = wanted.flatMapLatest { on ->
        if (!on) {
            flowOf(GameBoard())
        } else {
            combine(open().onEach { if (it is CacheResult.Fresh) failure.value = null }, failure) { result, failed ->
                val value = result.valueOrNull
                GameBoard(value = value, showsSkeleton = value == null && failed == null, failure = failed)
            }
        }
    }

    private fun classify(error: Throwable): ProgressionFailure =
        if (error is IOException) ProgressionFailure.Offline else ProgressionFailure.Server

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
    }
}
