package me.meeshy.app.game.gestures

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
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameGestureRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.game.DailyChest
import me.meeshy.sdk.model.game.GameIntentIds
import me.meeshy.sdk.model.game.GameRefusalLaw
import me.meeshy.sdk.network.NetworkMonitor

/** Les gestes du jeu qui touchent un solde. Un seul vol à la fois PAR geste : un double appui n'envoie qu'une requête. */
enum class GameGesture { Reroll, Chest }

/**
 * Le refus du DERNIER essai d'un geste. Jamais un code affiché : l'écran le met en phrase ([offline] ⇒ rien n'est
 * parti, [code] ⇒ la passerelle a répondu).
 */
data class GameGestureFailure(val offline: Boolean, val code: String?)

data class GameGesturesUiState(
    /** Le réseau est là. Hors ligne, un geste est INDISPONIBLE (il n'est ni envoyé ni mis en file : un débit n'attend pas). */
    val online: Boolean = true,
    /** La mission dont la remplaçante est attendue. */
    val rerollingMissionId: String? = null,
    val chestOpening: Boolean = false,
    val failures: Map<GameGesture, GameGestureFailure> = emptyMap(),
    /** Le contenu du coffre TEL QUE LA PASSERELLE L'A RENDU — posé à la réponse, jamais deviné. */
    val chestReward: DailyChest? = null,
)

/**
 * LES GESTES DU JEU (iOS `ProgressionViewModel+Game`) : chacun envoie une INTENTION et affiche ce que la passerelle
 * rend. **Rien d'optimiste sur un solde** : le débit, le crédit, la mission tirée, le contenu du coffre sont décidés et
 * appliqués atomiquement côté passerelle ; pendant le vol l'écran montre un geste « en cours », à la réponse il relit la
 * progression servie ([EngagementProgressRepository.refresh], le cache par compte), jamais un solde calculé ici.
 *
 * **Idempotence.** L'identifiant naît UNE fois par intention ([GameIntentIds]) et se rejoue tel quel après un échec
 * réseau : la passerelle reconnaît la requête et rend la première écriture, jamais une seconde. Il ne se renouvelle
 * qu'après une réponse de la passerelle, ou quand elle dit qu'il a servi à une autre écriture.
 *
 * **Double appui.** Le geste est réservé AVANT tout envoi (comparaison-échange) : un second appui, même simultané,
 * est ignoré. **Hors ligne**, rien ne part et rien ne se met en file.
 *
 * **Un refus** (409 du contrat, 5xx, charge illisible) se dit en une phrase et relit l'état : l'écran était peut-être
 * périmé, ou l'écriture a été prise sans que le client le sache.
 */
@HiltViewModel
class GameGesturesViewModel internal constructor(
    private val gestures: GameGestureRepository,
    private val progress: EngagementProgressRepository,
    network: NetworkMonitor,
    private val ids: GameIntentIds,
) : ViewModel() {

    @Inject
    constructor(
        gestures: GameGestureRepository,
        progress: EngagementProgressRepository,
        network: NetworkMonitor,
    ) : this(gestures, progress, network, GameIntentIds { UUID.randomUUID().toString() })

    private val inFlight = MutableStateFlow<Set<GameGesture>>(emptySet())
    private val rerollingMission = MutableStateFlow<String?>(null)
    private val failures = MutableStateFlow<Map<GameGesture, GameGestureFailure>>(emptyMap())
    private val chestReward = MutableStateFlow<DailyChest?>(null)

    val state: StateFlow<GameGesturesUiState> = combine(
        network.isOnline, inFlight, rerollingMission, failures, chestReward,
    ) { online, busy, rerolling, failed, reward ->
        GameGesturesUiState(
            online = online,
            rerollingMissionId = rerolling,
            chestOpening = GameGesture.Chest in busy,
            failures = failed,
            chestReward = reward,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), GameGesturesUiState(online = network.isOnline.value))

    private val isOnline = network.isOnline

    /** Changer un acte du jour : 1 Meesh. La remplaçante et le solde sont ceux que la passerelle rend. */
    fun reroll(missionId: String) {
        run(GameGesture.Reroll, "reroll:$missionId", onStart = { rerollingMission.value = missionId }, onEnd = { rerollingMission.value = null }) { id ->
            gestures.rerollMission(id, missionId)
        }
    }

    /** Ouvrir l'Offrande du jour. Son contenu n'existe qu'une fois la passerelle l'a tiré : il se pose à la réponse. */
    fun claimChest() {
        run(GameGesture.Chest, "chest", onDone = { chestReward.value = it.reward }) { id -> gestures.claimChest(id) }
    }

    private fun <T : Any> run(
        gesture: GameGesture,
        intention: String,
        onStart: () -> Unit = {},
        onEnd: () -> Unit = {},
        onDone: (T) -> Unit = {},
        send: suspend (requestId: String) -> GameWriteOutcome<T>,
    ) {
        if (!reserve(gesture)) return
        if (!isOnline.value) {
            failures.update { it + (gesture to GameGestureFailure(offline = true, code = null)) }
            release(gesture)
            return
        }
        onStart()
        failures.update { it - gesture }
        viewModelScope.launch {
            try {
                when (val outcome = send(ids.idFor(intention))) {
                    is GameWriteOutcome.Done -> {
                        ids.spent(intention)
                        onDone(outcome.value)
                        refreshProgress()
                    }
                    is GameWriteOutcome.Refused -> {
                        if (GameRefusalLaw.releasesId(outcome.code)) ids.spent(intention)
                        failures.update { it + (gesture to GameGestureFailure(outcome.offline, outcome.code)) }
                        if (GameRefusalLaw.refreshesAfter(outcome.code) && !outcome.offline) refreshProgress()
                    }
                }
            } finally {
                onEnd()
                release(gesture)
            }
        }
    }

    /** Réserve le geste d'un coup : deux appuis simultanés ne passent jamais tous les deux. */
    private fun reserve(gesture: GameGesture): Boolean {
        while (true) {
            val current = inFlight.value
            if (gesture in current) return false
            if (inFlight.compareAndSet(current, current + gesture)) return true
        }
    }

    private fun release(gesture: GameGesture) = inFlight.update { it - gesture }

    private suspend fun refreshProgress() {
        try {
            progress.refresh()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // La progression se relira à la prochaine ouverture : l'écriture, elle, est prise.
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
    }
}
