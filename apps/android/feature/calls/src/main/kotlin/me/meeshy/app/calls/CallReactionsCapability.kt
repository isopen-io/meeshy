package me.meeshy.app.calls

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoMap
import dagger.multibindings.IntoSet
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallReactionEmoji
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.CallSocialSignalManager
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.motion.pressable
import me.meeshy.ui.theme.MeeshySpacing
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les réactions de l'appel (iOS `CallControlsController.react`) : on en envoie une depuis le
 * panneau de la pilule, elle monte aussitôt à l'écran (optimiste) pendant que la passerelle la
 * relaie aux autres ; celles des autres montent à leur tour. Le flot ne porte que les émojis en
 * vol, borné par [CallReactionOverlayLaw].
 */
@Singleton
class CallReactionsController internal constructor(
    private val social: CallSocialSignalManager,
    private val session: SessionRepository,
    private val scope: CoroutineScope,
) : CallFeatureController {
    @Inject
    constructor(social: CallSocialSignalManager, session: SessionRepository) :
        this(social, session, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))

    private val _floating = MutableStateFlow<List<FloatingCallReaction>>(emptyList())

    /** Les émojis en vol, du plus ancien au plus récent. */
    val floating: StateFlow<List<FloatingCallReaction>> = _floating.asStateFlow()

    @Volatile private var callId: String = ""
    private var sequence: Long = 0
    private var listening: Job? = null

    override fun onTransition(previous: CallState, next: CallState, session: CallSessionInfo) {
        when (next) {
            is CallState.Ended, CallState.Idle -> reset()
            else -> {
                callId = session.callId
                if (listening == null) listening = listen()
            }
        }
    }

    override fun onCleared() = reset()

    /** Envoie [emoji] au reste de l'appel ; `false` tant que l'appel n'a pas d'identifiant. */
    fun react(emoji: CallReactionEmoji): Boolean {
        val target = callId.ifBlank { return false }
        float(emoji)
        scope.launch {
            social.sendCallReaction(target, emoji).onFailure { Timber.w(it, "call reaction not delivered") }
        }
        return true
    }

    fun finished(id: Long) {
        _floating.value = CallReactionOverlayLaw.remove(_floating.value, id)
    }

    private fun listen(): Job = social.reactionReceived
        .onEach { event ->
            val mine = this.session.currentUser.value?.id
            if (event.callId == callId && event.userId != mine) float(event.emoji)
        }
        .launchIn(scope)

    private fun float(emoji: CallReactionEmoji) {
        val id = ++sequence
        _floating.value = CallReactionOverlayLaw.enqueue(
            _floating.value,
            FloatingCallReaction(id, emoji, CallReactionOverlayLaw.laneFor(id)),
        )
    }

    private fun reset() {
        listening?.cancel()
        listening = null
        callId = ""
        _floating.value = emptyList()
    }
}

/** « Réagir » dans la rangée de l'appel : proposé dès que l'appel est établi ; le panneau s'ouvre dans la pilule. */
@Singleton
class CallReactionsActionHandler @Inject constructor() : CallActionHandler {
    override fun present(state: CallUiState): CallActionPresentation? =
        if (state.status == CallStatus.CONNECTED) CallActionPresentation(MeeshyIcons.Emoji, R.string.call_control_react) else null

    override fun perform() = Unit
}

/** Les émojis qui montent depuis le bas de l'écran, sans jamais attraper un toucher. */
@Singleton
class CallReactionsOverlay @Inject constructor(
    private val reactions: CallReactionsController,
) : CallOverlay {
    override val id: String = "call-reactions"
    override val slot: CallOverlaySlot = CallOverlaySlot.Center

    @Composable
    override fun Content(context: CallOverlayContext) {
        val floating by reactions.floating.collectAsState()
        if (floating.isEmpty()) return
        CallReactionOverlay(
            reactions = floating,
            reduceMotion = rememberCallReduceMotion(),
            onFinished = reactions::finished,
        )
    }
}

@HiltViewModel
class CallReactionsViewModel @Inject constructor(
    private val reactions: CallReactionsController,
) : ViewModel() {
    fun react(emoji: CallReactionEmoji) = reactions.react(emoji)
}

private val REACTION_TARGET = 48.dp

/** Le panneau « Réagir » de la pilule : les huit émojis de la passerelle, un toucher chacun. */
@Composable
internal fun CallReactionsPanel(
    onReact: (CallReactionEmoji) -> Unit,
    modifier: Modifier = Modifier,
) {
    val haptics = LocalHapticFeedback.current
    Row(
        modifier = modifier
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.sm),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        CallReactionEmoji.entries.forEach { emoji ->
            Box(
                modifier = Modifier
                    .defaultMinSize(REACTION_TARGET, REACTION_TARGET)
                    .pressable()
                    .clip(CircleShape)
                    .clickable(role = Role.Button) {
                        haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        onReact(emoji)
                    }
                    .semantics { contentDescription = emoji.glyph },
                contentAlignment = Alignment.Center,
            ) {
                Text(text = emoji.glyph, fontSize = 26.sp)
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface CallReactionsCapabilityModule {
    @Binds
    @IntoSet
    fun bindFeatureController(impl: CallReactionsController): CallFeatureController

    @Binds
    @IntoSet
    fun bindOverlay(impl: CallReactionsOverlay): CallOverlay

    @Binds
    @IntoMap
    @CallActionKey(CallAction.React)
    fun bindActionHandler(impl: CallReactionsActionHandler): CallActionHandler
}
