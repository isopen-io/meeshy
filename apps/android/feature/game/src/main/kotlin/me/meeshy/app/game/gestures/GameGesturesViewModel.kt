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
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameGestureRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.game.DailyChest
import me.meeshy.sdk.model.game.GameIntentIds
import me.meeshy.sdk.model.game.GameMintPreview
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.ceremony.GameMintSettlement
import me.meeshy.sdk.model.game.ceremony.MintSettlementOutcome
import me.meeshy.sdk.model.game.engagement.MeeshMintOutcome
import me.meeshy.sdk.model.game.engagement.outcome
import me.meeshy.sdk.model.game.GameRefusalLaw
import me.meeshy.sdk.network.NetworkMonitor
import me.meeshy.sdk.session.SessionRepository

/** Les gestes du jeu qui touchent un solde. Un seul vol à la fois PAR geste : un double appui n'envoie qu'une requête. */
enum class GameGesture { Reroll, Chest, Freeze, Relight, Mint, Claim, Seal, Prestige }

/**
 * Le refus du DERNIER essai d'un geste. Jamais un code affiché : l'écran le met en phrase ([offline] ⇒ rien n'est
 * parti, [code] ⇒ la passerelle a répondu).
 */
data class GameGestureFailure(val offline: Boolean, val code: String?)

/** Ce que la passerelle a RENDU aux derniers gestes, tel quel. */
private data class Results(
    val chestReward: DailyChest?,
    val celebration: MintCelebration?,
    val mintSettlement: GameMintSettlement?,
    val claimingStep: Int?,
    val prestigePassed: Int?,
    val accountTimezone: String?,
)

/** La pièce que la passerelle vient de frapper — le numéro et l'édition sont CEUX DE SA RÉPONSE. [key] rejoue la scène. */
data class MintCelebration(val number: Int, val edition: MeeshEdition?, val key: Int)

data class GameGesturesUiState(
    /** Le réseau est là. Hors ligne, un geste est INDISPONIBLE (il n'est ni envoyé ni mis en file : un débit n'attend pas). */
    val online: Boolean = true,
    /** La mission dont la remplaçante est attendue. */
    val rerollingMissionId: String? = null,
    val chestOpening: Boolean = false,
    val buyingFreeze: Boolean = false,
    val relighting: Boolean = false,
    val minting: Boolean = false,
    /** La halte dont la récompense est attendue. */
    val claimingStep: Int? = null,
    val buyingSeal: Boolean = false,
    val passingPrestige: Boolean = false,
    /** Le numéro de la Renaissance que la passerelle vient d'enregistrer (sa réponse) ; `null` sinon. */
    val prestigePassed: Int? = null,
    /** La dernière frappe confirmée par la passerelle ; `null` tant qu'aucune ne l'a été sur cet écran. */
    val celebration: MintCelebration? = null,
    /**
     * La DERNIÈRE frappe RÉGLÉE par la passerelle — pièce ou refus (iOS `mintSettlement`) : ce que la cérémonie attend
     * pour frapper, ce qui libère la tête de l'Héritage. `null` tant qu'aucune n'a été réglée sur cet écran.
     */
    val mintSettlement: GameMintSettlement? = null,
    val failures: Map<GameGesture, GameGestureFailure> = emptyMap(),
    /** Le fuseau du COMPTE, où la passerelle découpe le jour de jeu : jamais celui de l'appareil. */
    val accountTimezone: String? = null,
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
    accountTimezone: Flow<String?>,
) : ViewModel() {

    @Inject
    constructor(
        gestures: GameGestureRepository,
        progress: EngagementProgressRepository,
        network: NetworkMonitor,
        session: SessionRepository,
    ) : this(
        gestures,
        progress,
        network,
        GameIntentIds { UUID.randomUUID().toString() },
        session.currentUser.map { it?.timezone }.distinctUntilChanged(),
    )

    private val inFlight = MutableStateFlow<Set<GameGesture>>(emptySet())
    private val rerollingMission = MutableStateFlow<String?>(null)
    private val failures = MutableStateFlow<Map<GameGesture, GameGestureFailure>>(emptyMap())
    private val chestReward = MutableStateFlow<DailyChest?>(null)
    private val celebrationFlow = MutableStateFlow<MintCelebration?>(null)
    private val settlementFlow = MutableStateFlow<GameMintSettlement?>(null)
    private val claimingStepFlow = MutableStateFlow<Int?>(null)
    private val prestigePassedFlow = MutableStateFlow<Int?>(null)

    val state: StateFlow<GameGesturesUiState> = combine(
        network.isOnline,
        inFlight,
        rerollingMission,
        failures,
        combine(chestReward, celebrationFlow, settlementFlow, claimingStepFlow, combine(prestigePassedFlow, accountTimezone, ::Pair)) {
                reward, celebration, settlement, claiming, (passed, timezone) ->
            Results(reward, celebration, settlement, claiming, passed, timezone)
        },
    ) { online, busy, rerolling, failed, (reward, celebration, settlement, claiming, passed, timezone) ->
        GameGesturesUiState(
            online = online,
            rerollingMissionId = rerolling,
            chestOpening = GameGesture.Chest in busy,
            buyingFreeze = GameGesture.Freeze in busy,
            relighting = GameGesture.Relight in busy,
            minting = GameGesture.Mint in busy,
            claimingStep = claiming,
            buyingSeal = GameGesture.Seal in busy,
            passingPrestige = GameGesture.Prestige in busy,
            prestigePassed = passed,
            celebration = celebration,
            mintSettlement = settlement,
            failures = failed,
            accountTimezone = timezone,
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

    /** Prendre une Veilleuse : 1 Meesh, 2 en réserve au plus. Le nombre de Veilleuses est celui que la passerelle sert ensuite. */
    fun buyFreeze() {
        run(GameGesture.Freeze, "freeze") { id -> gestures.buyFlameFreeze(id) }
    }

    /** Rallumer la Flamme éteinte : 3 Meeshes, 48 h, une fois par mois. La série rendue est celle de la passerelle. */
    fun relight() {
        run(GameGesture.Relight, "relight") { id -> gestures.relightFlame(id) }
    }

    /**
     * Frapper la Meesh suivante. Le prix que l'écran a montré part avec la frappe ([GameMintPreview.price]) : au-delà,
     * la passerelle refuse (`PRICE_CHANGED`) sans rien débiter. La pièce, son numéro et son édition sont ceux de la
     * RÉPONSE ; le solde, le niveau et le prix suivant sont relus sur la progression servie.
     *
     * Sans bloc de jeu ([preview] nul, iOS `ProgressionMeeshDetail`), la frappe part sans garde de prix, comme iOS
     * (`maxPrice: game?.mint.price`), et la pièce ne se célèbre que si la réponse dit son numéro.
     *
     * Chaque réponse — pièce ou refus, réseau absent compris — se RÈGLE ([GameGesturesUiState.mintSettlement]) avant la
     * relecture : la cérémonie de frappe ne frappe qu'à ce réglement, jamais avant.
     */
    fun mint(preview: GameMintPreview?) {
        run(
            GameGesture.Mint,
            "mint",
            onRefused = { failure -> settle(GameMintSettlement.refusal(failure.offline, failure.code)) },
            onDone = { result ->
                settle(GameMintSettlement.outcomeOf(result, preview))
                if (result.outcome == MeeshMintOutcome.MINTED) {
                    val number = result.number ?: preview?.number
                    if (number != null) {
                        celebrationFlow.update { MintCelebration(number, result.edition ?: preview?.edition, (it?.key ?: 0) + 1) }
                    }
                } else if (result.outcome != MeeshMintOutcome.ALREADY_MINTED) {
                    failures.update { it + (GameGesture.Mint to GameGestureFailure(offline = false, code = null)) }
                }
            },
        ) { id -> gestures.mint(id, preview?.price) }
    }

    /** Réclamer la récompense d'une halte du Voyage. Le crédit (points, fragment, Veilleuse) est celui que la passerelle applique. */
    fun claimStep(step: Int) {
        run(GameGesture.Claim, "claim:$step", onStart = { claimingStepFlow.value = step }, onEnd = { claimingStepFlow.value = null }) { id ->
            gestures.claimSeasonStep(id, step)
        }
    }

    /** Prendre le Sceau du Voyage : 10 Meeshes, purement décoratif. */
    fun buySeal() {
        run(GameGesture.Seal, "seal") { id -> gestures.buySeasonSeal(id) }
    }

    /** Renaître : le niveau repart à 1, les étincelles à 0 — c'est la passerelle qui le fait, et l'écran relit ce qu'elle sert. */
    fun passPrestige() {
        run(GameGesture.Prestige, "prestige", onStart = { prestigePassedFlow.value = null }, onDone = { prestigePassedFlow.value = it.prestige }) { id ->
            gestures.passPrestige(id)
        }
    }

    private fun <T : Any> run(
        gesture: GameGesture,
        intention: String,
        onStart: () -> Unit = {},
        onEnd: () -> Unit = {},
        onDone: (T) -> Unit = {},
        onRefused: (GameGestureFailure) -> Unit = {},
        send: suspend (requestId: String) -> GameWriteOutcome<T>,
    ) {
        if (!reserve(gesture)) return
        if (!isOnline.value) {
            val failure = GameGestureFailure(offline = true, code = null)
            failures.update { it + (gesture to failure) }
            onRefused(failure)
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
                        val failure = GameGestureFailure(outcome.offline, outcome.code)
                        failures.update { it + (gesture to failure) }
                        onRefused(failure)
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

    private fun settle(outcome: MintSettlementOutcome) = settlementFlow.update { GameMintSettlement.next(it, outcome) }

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
