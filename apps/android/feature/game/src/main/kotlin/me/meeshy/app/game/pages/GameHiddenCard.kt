package me.meeshy.app.game.pages

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.app.game.GameErrorMessages
import me.meeshy.feature.game.R
import me.meeshy.sdk.game.GameDevicePrefsStore
import me.meeshy.sdk.game.GamePagesRepository
import me.meeshy.sdk.game.GameWriteOutcome

data class GameHiddenUiState(val hidden: Boolean = false, val busy: Boolean = false, val refusal: SwitchRefusal? = null)

/**
 * LE JEU MASQUÉ (iOS `GameHiddenCard`) — quand la personne a masqué le jeu sur cet appareil, la première page et les
 * fiches ne le montrent pas : une carte le dit, un bouton le réaffiche, une porte mène aux réglages. Réafficher se fait
 * toujours côté appareil et ne se bloque JAMAIS ; le dire au serveur est fait ensuite, et son échec se dit sans rien
 * défaire. Réafficher ne rouvre RIEN d'autre : les visibilités fermées restent fermées.
 */
@HiltViewModel
class GameHiddenViewModel @Inject constructor(
    private val prefsStore: GameDevicePrefsStore,
    private val pages: GamePagesRepository,
) : ViewModel() {

    private val busy = MutableStateFlow(false)
    private val refusal = MutableStateFlow<SwitchRefusal?>(null)
    private var intent: String? = null

    val state: StateFlow<GameHiddenUiState> = combine(prefsStore.prefs.map { it.hidden }, busy, refusal) { hidden, working, refused ->
        GameHiddenUiState(hidden, working, refused)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS), GameHiddenUiState(prefsStore.current().hidden))

    fun show() {
        if (busy.value) return
        val requestId = intent ?: UUID.randomUUID().toString().also { intent = it }
        prefsStore.set(hidden = false)
        viewModelScope.launch {
            busy.value = true
            refusal.value = null
            when (val outcome = pages.setPrivacy(requestId, gameHidden = false)) {
                is GameWriteOutcome.Done -> intent = null
                is GameWriteOutcome.Refused ->
                    refusal.value = if (outcome.offline) SwitchRefusal.Offline else SwitchRefusal.Code(outcome.code)
            }
            busy.value = false
        }
    }

    private companion object {
        const val STOP_TIMEOUT_MILLIS = 5_000L
    }
}

/** Lit si le jeu est masqué sur cet appareil — la première page et les fiches s'effacent derrière la carte. */
@Composable
internal fun rememberGameHidden(viewModel: GameHiddenViewModel = hiltViewModel()): GameHiddenUiState {
    val state by viewModel.state.collectAsStateWithLifecycle()
    return state
}

@Composable
internal fun GameHiddenCard(onSettings: () -> Unit, viewModel: GameHiddenViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val resources = LocalContext.current.resources
    val error = when (val refused = state.refusal) {
        null -> null
        SwitchRefusal.Offline -> stringResource(R.string.game2_offline_action)
        is SwitchRefusal.Code -> GameErrorMessages.message(resources, refused.wire)
    }
    GameCard(title = stringResource(R.string.game2_settings_hidden_title)) {
        GameNote(stringResource(R.string.game2_settings_hidden_card) + " " + stringResource(R.string.game2_settings_hidden_reopen_note))
        GameErrorLine(error)
        GameActionButton(title = stringResource(R.string.game2_settings_hidden_show), onClick = viewModel::show, busy = state.busy)
        GameQuietButton(title = stringResource(R.string.game2_door_settings), onClick = onSettings)
    }
}
