package me.meeshy.app.game.pages

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.app.game.gestures.GameGestureFailure
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.friend.FriendListRepository
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.FriendRequestUser
import me.meeshy.sdk.model.game.GameIntentIds
import me.meeshy.sdk.model.game.GameRefusalLaw
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.pages.GameShowcaseRules
import me.meeshy.sdk.model.game.pages.GameVisibilityEdit
import me.meeshy.sdk.model.game.pages.VisibilityField
import me.meeshy.sdk.network.NetworkMonitor

/** Les écritures de cette page qui ne touchent aucun solde. Un seul vol à la fois PAR sorte : un double appui n'envoie qu'une requête. */
enum class ArrangementWrite { Order, Visibility, Duo, Pseudonym }

/** Un ami que l'alliance peut inviter. */
data class DuoFriend(val id: String, val name: String)

data class GameArrangementUiState(
    /** Le réseau est là. Hors ligne, ces gestes sont INDISPONIBLES : ils ne sont ni envoyés ni mis en file. */
    val online: Boolean = true,
    /** « Jeu masqué » : rien ne se rouvre tant que le jeu est masqué. */
    val hidden: Boolean = false,
    /** L'ordre montré PENDANT le vol d'un rangement ; `null` hors vol (l'ordre servi fait foi). */
    val orderInFlight: List<String>? = null,
    /** Les niveaux montrés PENDANT le vol d'un réglage ; vide hors vol. */
    val visibilityInFlight: Map<VisibilityField, ShowcaseVisibility> = emptyMap(),
    val busy: Set<ArrangementWrite> = emptySet(),
    /** L'ami dont l'invitation est en vol (les autres boutons restent ceux de la carte). */
    val invitingFriendId: String? = null,
    val failures: Map<ArrangementWrite, GameGestureFailure> = emptyMap(),
    val friends: List<DuoFriend> = emptyList(),
) {
    /** Régler une visibilité demande le réseau ET un jeu affiché : masqué, tout reste fermé. */
    val canWriteVisibility: Boolean get() = online && !hidden
}

/**
 * LES ÉCRITURES SANS SOLDE DES PAGES DU JEU (iOS `GameWave2Model`) : ranger la vitrine, régler qui voit, l'alliance
 * (inviter, accepter, quitter) et le nom de joute. Aucun solde n'est touché, donc un rangement et un réglage se
 * montrent tout de suite (l'ordre et le niveau choisis) avec retour arrière au refus ; l'alliance, elle, n'est jamais
 * devinée — son identifiant, sa mission et la part de l'autre ne naissent que chez la passerelle : l'écran montre un
 * geste « en cours » puis relit la progression servie.
 *
 * **Idempotence.** L'identifiant naît UNE fois par intention ([GameIntentIds]), est rejoué tel quel après une coupure et
 * ne se renouvelle qu'après une réponse DÉFINITIVE de la passerelle (succès, ou refus de son contrat) ; une coupure, un
 * délai ou un 5xx le rejouent tel quel. **Double appui** : la
 * sorte d'écriture est réservée AVANT l'envoi. **Hors ligne**, rien ne part. **Jeu masqué** : aucune visibilité ne se
 * rouvre. Un refus se dit en une phrase et relit l'état.
 */
@HiltViewModel
class GameArrangementViewModel internal constructor(
    private val pages: GamePagesRepository,
    private val progress: EngagementProgressRepository,
    private val friendList: FriendListRepository,
    private val prefs: GameDevicePrefsStore,
    network: NetworkMonitor,
    private val ids: GameIntentIds,
) : ViewModel() {

    @Inject
    constructor(
        pages: GamePagesRepository,
        progress: EngagementProgressRepository,
        friendList: FriendListRepository,
        prefs: GameDevicePrefsStore,
        network: NetworkMonitor,
    ) : this(pages, progress, friendList, prefs, network, GameIntentIds { UUID.randomUUID().toString() })

    private val busy = MutableStateFlow<Set<ArrangementWrite>>(emptySet())
    private val orderInFlight = MutableStateFlow<List<String>?>(null)
    private val visibilityInFlight = MutableStateFlow<Map<VisibilityField, ShowcaseVisibility>>(emptyMap())
    private val invitingFriend = MutableStateFlow<String?>(null)
    private val failures = MutableStateFlow<Map<ArrangementWrite, GameGestureFailure>>(emptyMap())
    private val friends = MutableStateFlow<List<DuoFriend>>(emptyList())
    private val isOnline = network.isOnline

    val state: StateFlow<GameArrangementUiState> = combine(
        network.isOnline, prefs.prefs, busy, combine(orderInFlight, visibilityInFlight, invitingFriend, ::Flights), combine(failures, friends, ::Pair),
    ) { online, devicePrefs, writing, flights, (failed, roster) ->
        GameArrangementUiState(
            online = online,
            hidden = devicePrefs.hidden,
            orderInFlight = flights.order,
            visibilityInFlight = flights.visibility,
            busy = writing,
            invitingFriendId = flights.inviting,
            failures = failed,
            friends = roster,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), GameArrangementUiState(online = network.isOnline.value, hidden = prefs.current().hidden))

    private data class Flights(val order: List<String>?, val visibility: Map<VisibilityField, ShowcaseVisibility>, val inviting: String?)

    init {
        viewModelScope.launch {
            val roster = runCatching { friendList.cachedSnapshot() }.getOrNull().orEmpty()
            friends.value = roster.take(FRIEND_LIMIT).map { DuoFriend(it.id, friendName(it)) }
        }
    }

    /** Monter ou descendre un trophée d'un cran : [order] est l'ordre COMPLET que la personne vient de composer. */
    fun saveOrder(order: List<String>, previous: List<String>) {
        if (order == previous) return
        run(ArrangementWrite.Order, "order:${order.joinToString(",")}", onStart = { orderInFlight.value = order }, onEnd = { orderInFlight.value = null }) { id ->
            pages.setShowcaseOrder(id, order)
        }
    }

    /** Pose ce rangement d'un cran (voir [GameShowcaseRules.moved]). */
    fun move(order: List<String>, index: Int, delta: Int) = saveOrder(GameShowcaseRules.moved(order, index, delta), order)

    /** Régler UNE facette de « qui voit quoi ». Jeu masqué ou hors ligne : rien ne part. */
    fun setVisibility(field: VisibilityField, level: ShowcaseVisibility) {
        if (prefs.current().hidden) return
        run(
            ArrangementWrite.Visibility,
            "visibility:${field.name}:${level.name}",
            onStart = { visibilityInFlight.value = mapOf(field to level) },
            onEnd = { visibilityInFlight.value = emptyMap() },
        ) { id -> pages.setVisibility(GameVisibilityEdit.request(id, field, level)) }
    }

    fun invite(friend: DuoFriend) {
        run(ArrangementWrite.Duo, "invite:${friend.id}", onStart = { invitingFriend.value = friend.id }, onEnd = { invitingFriend.value = null }) { id ->
            pages.inviteToDuo(id, friend.id)
        }
    }

    fun accept(duoId: String) = run(ArrangementWrite.Duo, "accept:$duoId") { id -> pages.acceptDuo(id, duoId) }

    /** Décliner, annuler ou quitter : un seul geste (conformité B-4). */
    fun abandon(duoId: String) = run(ArrangementWrite.Duo, "abandon:$duoId") { id -> pages.abandonDuo(id, duoId) }

    /** Le nom de joute choisi — fermé tant que le contrat ne l'ouvre pas ([me.meeshy.sdk.model.game.pages.GameLeagueRules]). */
    fun setPseudonym(name: String) = run(ArrangementWrite.Pseudonym, "pseudonym:$name") { id -> pages.setLeaguePseudonym(id, name) }

    private fun <T : Any> run(
        write: ArrangementWrite,
        intention: String,
        onStart: () -> Unit = {},
        onEnd: () -> Unit = {},
        send: suspend (requestId: String) -> GameWriteOutcome<T>,
    ) {
        if (!reserve(write)) return
        if (!isOnline.value) {
            failures.update { it + (write to GameGestureFailure(offline = true, code = null)) }
            release(write)
            return
        }
        onStart()
        failures.update { it - write }
        viewModelScope.launch {
            try {
                when (val outcome = send(ids.idFor(intention))) {
                    is GameWriteOutcome.Done -> {
                        ids.spent(intention)
                        refreshProgress()
                    }
                    is GameWriteOutcome.Refused -> {
                        if (GameRefusalLaw.releasesId(outcome.code) || GameRefusalLaw.isDefinitive(outcome.code)) ids.spent(intention)
                        failures.update { it + (write to GameGestureFailure(outcome.offline, outcome.code)) }
                        if (GameRefusalLaw.refreshesAfter(outcome.code) && !outcome.offline) refreshProgress()
                    }
                }
            } finally {
                onEnd()
                release(write)
            }
        }
    }

    private fun reserve(write: ArrangementWrite): Boolean {
        while (true) {
            val current = busy.value
            if (write in current) return false
            if (busy.compareAndSet(current, current + write)) return true
        }
    }

    private fun release(write: ArrangementWrite) = busy.update { it - write }

    private suspend fun refreshProgress() {
        try {
            progress.refresh()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // La progression se relira à la prochaine ouverture : l'écriture, elle, est prise.
        }
    }

    private fun friendName(friend: FriendRequestUser): String =
        friend.displayName?.takeIf { it.isNotBlank() }
            ?: listOfNotNull(friend.firstName, friend.lastName).joinToString(" ").ifBlank { friend.username }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
        const val FRIEND_LIMIT = 8
    }
}
