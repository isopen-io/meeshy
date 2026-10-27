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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome
import me.meeshy.sdk.model.game.GameSettingsResponse
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.pages.GameDevicePrefs

/** Le refus d'un interrupteur : la coupure, ou le code de la passerelle (mis en phrase par l'écran). */
sealed interface SwitchRefusal {
    data object Offline : SwitchRefusal
    data class Code(val wire: String?) : SwitchRefusal
}

data class GameSettingsUiState(
    val prefs: GameDevicePrefs = GameDevicePrefs(),
    /** Les réglages SERVIS : « Jeu masqué », l'opposition à la ligue Amis, les quatre visibilités. */
    val served: GameSettingsResponse? = null,
    val hideBusy: Boolean = false,
    val optOutBusy: Boolean = false,
    val hideRefusal: SwitchRefusal? = null,
    val optOutRefusal: SwitchRefusal? = null,
) {
    /** L'opposition à la ligue Amis : la dernière réponse du serveur, sinon ce qu'il a confirmé avant. */
    val friendsLeagueOptedOut: Boolean get() = served?.friendsLeagueOptOut ?: prefs.friendsLeagueOptOut
}

/**
 * Les réglages du jeu (iOS `GameSettingsScreen`, `GameWave2Model.setHidden`) : « Célébrations » reste sur l'appareil ;
 * « Jeu masqué » et l'opposition à la ligue Amis sont dits au serveur, qui reste maître. Masquer ne tient que si le
 * serveur l'a pris — « masqué » ici alors que les autres voient encore serait une fausse promesse — ; réafficher ne se
 * bloque JAMAIS côté appareil. Hors ligne, masquer est suspendu pour la même raison.
 *
 * Une fois le masquage pris, le reste se ferme comme sur iOS (`closeEverything`) : les quatre visibilités passent à
 * « moi seul » — réafficher ne les rouvrira pas — et l'accord à la ligue publique est retiré. Ne sachant pas, l'écran
 * ferme : une visibilité ou un accès à la ligue inconnus se ferment aussi. Un refus se dit sans défaire le masquage,
 * que le serveur applique déjà.
 *
 * L'identifiant d'idempotence naît UNE fois par intention et ne se renouvelle qu'après un succès. Aucun solde n'est
 * touché par ces interrupteurs.
 */
@HiltViewModel
class GameSettingsViewModel @Inject constructor(
    private val pages: GamePagesRepository,
    private val prefsStore: GameDevicePrefsStore,
    private val progress: EngagementProgressRepository,
) : ViewModel() {

    private val served = MutableStateFlow<GameSettingsResponse?>(null)
    private val hideBusy = MutableStateFlow(false)
    private val optOutBusy = MutableStateFlow(false)
    private val hideRefusal = MutableStateFlow<SwitchRefusal?>(null)
    private val optOutRefusal = MutableStateFlow<SwitchRefusal?>(null)
    private val intents = mutableMapOf<String, String>()

    private val servedFlow = pages.settings()
        .onEach { result ->
            val value = result.valueOrNull ?: return@onEach
            served.value = value
            if (result is CacheResult.Fresh && !hideBusy.value && !optOutBusy.value) {
                prefsStore.set(hidden = value.gameHidden, friendsLeagueOptOut = value.friendsLeagueOptOut)
            }
        }

    val state: StateFlow<GameSettingsUiState> = combine(
        prefsStore.prefs, served, hideBusy, optOutBusy, combine(hideRefusal, optOutRefusal) { a, b -> a to b },
    ) { prefs, response, hiding, opting, refusals ->
        GameSettingsUiState(prefs, response, hiding, opting, refusals.first, refusals.second)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), GameSettingsUiState(prefsStore.current()))

    init {
        viewModelScope.launch { servedFlow.collect { } }
    }

    fun setCelebrations(on: Boolean) = prefsStore.set(celebrations = on)

    /** Masquer ne tient que si le serveur l'a pris ; réafficher se fait toujours côté appareil. */
    fun setHidden(hidden: Boolean) {
        if (hideBusy.value) return
        val previous = prefsStore.current().hidden
        val intention = "hide:$hidden"
        val requestId = intents.getOrPut(intention) { UUID.randomUUID().toString() }
        viewModelScope.launch {
            hideBusy.value = true
            hideRefusal.value = null
            prefsStore.set(hidden = hidden)
            when (val outcome = pages.setPrivacy(requestId, gameHidden = hidden)) {
                is GameWriteOutcome.Done -> {
                    intents.remove(intention)
                    served.value = served.value?.copy(
                        gameHidden = outcome.value.gameHidden,
                        friendsLeagueOptOut = outcome.value.friendsLeagueOptOut,
                    )
                    prefsStore.set(friendsLeagueOptOut = outcome.value.friendsLeagueOptOut)
                    if (hidden && outcome.value.gameHidden) closeEverything()
                    refreshProgress()
                }
                is GameWriteOutcome.Refused -> {
                    if (hidden) prefsStore.set(hidden = previous)
                    hideRefusal.value = refusal(outcome)
                }
            }
            hideBusy.value = false
        }
    }

    fun setFriendsLeagueOptOut(optedOut: Boolean) {
        if (optOutBusy.value) return
        val intention = "friends-opt-out:$optedOut"
        val requestId = intents.getOrPut(intention) { UUID.randomUUID().toString() }
        viewModelScope.launch {
            optOutBusy.value = true
            optOutRefusal.value = null
            when (val outcome = pages.setPrivacy(requestId, friendsLeagueOptOut = optedOut)) {
                is GameWriteOutcome.Done -> {
                    intents.remove(intention)
                    served.value = served.value?.copy(friendsLeagueOptOut = outcome.value.friendsLeagueOptOut)
                    prefsStore.set(friendsLeagueOptOut = outcome.value.friendsLeagueOptOut)
                }
                is GameWriteOutcome.Refused -> optOutRefusal.value = refusal(outcome)
            }
            optOutBusy.value = false
        }
    }

    private suspend fun closeEverything() {
        if (served.value?.visibility != CLOSED) closeVisibility()
        if (leagueMayBeOpen()) withdrawLeagueConsent()
    }

    private suspend fun closeVisibility() {
        val requestId = intents.getOrPut(CLOSE_VISIBILITY) { UUID.randomUUID().toString() }
        when (val outcome = pages.closeVisibility(requestId)) {
            is GameWriteOutcome.Done -> {
                intents.remove(CLOSE_VISIBILITY)
                served.value = served.value?.copy(visibility = outcome.value.visibility)
            }
            is GameWriteOutcome.Refused -> hideRefusal.value = refusal(outcome)
        }
    }

    private suspend fun withdrawLeagueConsent() {
        val requestId = intents.getOrPut(WITHDRAW_CONSENT) { UUID.randomUUID().toString() }
        when (val outcome = pages.setLeagueConsent(requestId, consent = false)) {
            is GameWriteOutcome.Done -> {
                intents.remove(WITHDRAW_CONSENT)
                pages.forgetLeagueWeek()
            }
            is GameWriteOutcome.Refused -> hideRefusal.value = refusal(outcome)
        }
    }

    private suspend fun leagueMayBeOpen(): Boolean {
        val access = try {
            progress.progress().first().valueOrNull?.game?.league?.access
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        return access == null || access == LeagueAccess.Open
    }

    private suspend fun refreshProgress() {
        try {
            progress.refresh()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // La progression se relira à la prochaine ouverture : le réglage, lui, est pris.
        }
    }

    private fun refusal(outcome: GameWriteOutcome.Refused): SwitchRefusal =
        if (outcome.offline) SwitchRefusal.Offline else SwitchRefusal.Code(outcome.code)

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
        const val CLOSE_VISIBILITY = "close-visibility"
        const val WITHDRAW_CONSENT = "consent:false"
        val CLOSED = ShowcaseVisibility.Me.let { me -> GameVisibility(me, me, me, me) }
    }
}
