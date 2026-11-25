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
import me.meeshy.sdk.model.game.FlameGoalAnnouncement
import me.meeshy.sdk.model.game.FlameGoalLocal
import me.meeshy.sdk.model.game.FlamePauseDecision
import me.meeshy.sdk.model.game.GameFlame
import me.meeshy.sdk.model.game.GameFlameGoalLaw
import me.meeshy.sdk.model.game.GameFlamePause
import me.meeshy.sdk.model.game.GameFlamePauseLaw
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
enum class GameGesture { Reroll, Chest, Freeze, Relight, Pause, Goal, Mint, Claim, Seal, Prestige }

/**
 * Le refus du DERNIER essai d'un geste. Jamais un code affiché : l'écran le met en phrase ([offline] ⇒ rien n'est
 * parti, [code] ⇒ la passerelle a répondu).
 */
data class GameGestureFailure(val offline: Boolean, val code: String?, val reason: String? = null)

/** Ce que la passerelle a RENDU aux derniers gestes, tel quel. */
private data class Results(
    val chestReward: DailyChest?,
    val celebration: MintCelebration?,
    val mintSettlement: GameMintSettlement?,
    val claimingStep: Int?,
    val prestigePassed: Int?,
    val accountTimezone: String?,
    val announcedPause: GameFlamePause?,
    val flameGoal: FlameGoalLocal,
)

/** La queue des résultats : `combine` ne prend que cinq flux à la fois. */
private data class Tail(
    val passed: Int?,
    val timezone: String?,
    val announcedPause: GameFlamePause?,
    val flameGoal: FlameGoalLocal,
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
    /** La veille de la Flamme annoncée, en vol (#20511). */
    val pausing: Boolean = false,
    /**
     * La veille que la carte dit en attendant que le bloc relu la serve (#20511) : celle que la loi prévoit dès l'appui
     * (retour optimiste), puis celle que la passerelle a rendue. Un refus la retire. `null` sinon.
     */
    val announcedPause: GameFlamePause? = null,
    /** L'objectif de Flamme choisi, en vol (#20523). */
    val choosingGoal: Boolean = false,
    /** L'objectif que la carte dit en attendant la relecture, et les signes des aïeux fermés à l'instant (#20523). */
    val flameGoal: FlameGoalLocal = FlameGoalLocal(),
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
    private val announcedPauseFlow = MutableStateFlow<GameFlamePause?>(null)
    private val flameGoalFlow = MutableStateFlow(FlameGoalLocal())

    val state: StateFlow<GameGesturesUiState> = combine(
        network.isOnline,
        inFlight,
        rerollingMission,
        failures,
        combine(
            chestReward,
            celebrationFlow,
            settlementFlow,
            claimingStepFlow,
            combine(prestigePassedFlow, accountTimezone, announcedPauseFlow, flameGoalFlow, ::Tail),
        ) { reward, celebration, settlement, claiming, tail ->
            Results(reward, celebration, settlement, claiming, tail.passed, tail.timezone, tail.announcedPause, tail.flameGoal)
        },
    ) { online, busy, rerolling, failed, results ->
        val (reward, celebration, settlement, claiming, passed, timezone) = results
        GameGesturesUiState(
            online = online,
            rerollingMissionId = rerolling,
            chestOpening = GameGesture.Chest in busy,
            buyingFreeze = GameGesture.Freeze in busy,
            relighting = GameGesture.Relight in busy,
            pausing = GameGesture.Pause in busy,
            announcedPause = results.announcedPause,
            choosingGoal = GameGesture.Goal in busy,
            flameGoal = results.flameGoal,
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
     * Mettre la Flamme en veille [days] jours, à partir de demain (#20511) — rien n'est payé. La carte dit la veille dès
     * l'appui, par la MÊME loi que la passerelle ([GameFlamePauseLaw.canPause], depuis le jour du Jeu [today]) ; la
     * réponse la remplace par celle que la passerelle a écrite, un refus la retire et dit sa raison. Une durée est une
     * intention : la rejouer après une coupure garde son identifiant, une autre durée en prend un neuf.
     */
    fun pauseFlame(flame: GameFlame, today: String, days: Int) {
        val before = announcedPauseFlow.value
        val foreseen = (GameFlamePauseLaw.canPause(today, days, flame.status, flame.pause) as? FlamePauseDecision.Allowed)?.pause
        run(
            GameGesture.Pause,
            "pause:$days",
            onStart = { if (foreseen != null) announcedPauseFlow.value = foreseen },
            onDone = { response -> announcedPauseFlow.value = response.pause },
            onRefused = { announcedPauseFlow.value = before },
        ) { id -> gestures.pauseFlame(id, days) }
    }

    /**
     * Choisir l'objectif de la Flamme, en jours (#20523) — rien n'est payé. La carte le dit dès l'appui, par la MÊME loi
     * que la passerelle ([GameFlameGoalLaw.servedAfterChoosing]), seulement pour un objectif qu'elle propose ; la
     * réponse le remplace par celui que la passerelle sert, un refus le retire et dit sa raison. Un objectif est une
     * intention : le rejouer après une coupure garde son identifiant, un autre en prend un neuf.
     */
    fun chooseFlameGoal(flame: GameFlame, target: Int) {
        val before = flameGoalFlow.value.announcement
        val served = flame.goal
        val foreseen = GameFlameGoalLaw.servedAfterChoosing(target, flame.days)
            ?.takeIf { served?.offer?.contains(target) == true }
        run(
            GameGesture.Goal,
            "goal:$target",
            onStart = { if (foreseen != null) setGoalAnnouncement(FlameGoalAnnouncement(served, foreseen)) },
            onDone = { response -> setGoalAnnouncement(FlameGoalAnnouncement(served, response.goal)) },
            onRefused = { setGoalAnnouncement(before) },
        ) { id -> gestures.chooseFlameGoal(id, target) }
    }

    /**
     * Fermer le signe des aïeux de l'objectif [target] atteint, et la marche suivante qu'il propose (#20523). Il se tait
     * tout de suite ; un envoi refusé le laisse se redire à la prochaine ouverture, comme le guide.
     */
    fun closeFlameGoalSign(target: Int) {
        if (target in flameGoalFlow.value.closedSigns) return
        flameGoalFlow.update { it.copy(closedSigns = it.closedSigns + target) }
        if (!isOnline.value) return
        val intention = "goal-sign:$target"
        viewModelScope.launch {
            if (gestures.closeFlameGoalSign(ids.idFor(intention), target) is GameWriteOutcome.Done) ids.spent(intention)
        }
    }

    private fun setGoalAnnouncement(announcement: FlameGoalAnnouncement?) =
        flameGoalFlow.update { it.copy(announcement = announcement) }

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
                        val failure = GameGestureFailure(outcome.offline, outcome.code, outcome.reason)
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
