package me.meeshy.app.audio

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.runningFold
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.playback.MiniPlayerSubject
import me.meeshy.sdk.model.playback.MiniPlayerVisibility
import me.meeshy.sdk.model.playback.MiniPlayerVisibilityState
import me.meeshy.sdk.model.rootnav.ActiveAudioContext as ReturnContext
import me.meeshy.sdk.model.rootnav.NowPlayingReturnPolicy
import me.meeshy.sdk.playback.ActiveAudioContext
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Ce que la barre dit du vocal affiché ; la couleur du visage sans photo voyage en hex, l'écran la convertit. */
@Immutable
data class MiniPlayerBarState(
    val senderName: String,
    val senderAvatarUrl: String?,
    val conversationName: String,
    val avatarAccentHex: String,
)

/** `bar == null` : rien à montrer. [isPlaying] ne change pas à chaque tic ; la progression a son propre flux. */
@Immutable
data class MiniPlayerUiState(
    val bar: MiniPlayerBarState? = null,
    val isPlaying: Boolean = false,
)

sealed interface MiniPlayerUiEvent {
    data object TogglePlay : MiniPlayerUiEvent
    data object Next : MiniPlayerUiEvent
    data object Close : MiniPlayerUiEvent
    data object Open : MiniPlayerUiEvent
    data class CurrentConversation(val conversationId: String?) : MiniPlayerUiEvent
}

sealed interface MiniPlayerUiEffect {
    data class OpenConversation(val conversationId: String, val messageId: String) : MiniPlayerUiEffect
}

/**
 * Le présentateur du mini-lecteur (iOS `MiniAudioPlayerBar`) : suit le coordinateur unique de lecture, laisse la loi
 * pure [MiniPlayerVisibility] décider de ce qui s'affiche (masquée dans la conversation qui joue, maintenue pendant la
 * grâce de la fin de file, fermée sur le champ par la croix), et publie la valeur AFFICHÉE dans [MiniPlayerDisplay].
 */
@HiltViewModel
class MiniPlayerViewModel @Inject constructor(
    private val coordinator: ConversationAudioCoordinator,
    private val display: MiniPlayerDisplay,
) : ViewModel() {

    private data class Shown(val subject: MiniPlayerSubject, val context: ActiveAudioContext)

    private data class Visible(
        val state: MiniPlayerVisibilityState = MiniPlayerVisibilityState(),
        val shown: Shown? = null,
    )

    private val currentConversation = MutableStateFlow<String?>(null)
    private val effects = Channel<MiniPlayerUiEffect>(Channel.BUFFERED)

    val uiEffects = effects.receiveAsFlow()

    private val visible: StateFlow<Visible> = combine(
        coordinator.snapshot,
        coordinator.graceContext,
        currentConversation,
    ) { snapshot, grace, conversationId -> Triple(snapshot.context, grace, conversationId) }
        .runningFold(Visible()) { previous, (active, grace, conversationId) ->
            val next = MiniPlayerVisibility.next(previous.state, active?.subject(), grace?.subject(), conversationId)
            Visible(next, next.shown?.let { subject -> contextOf(subject, active, grace)?.let { Shown(subject, it) } })
        }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Visible())

    private val isPlaying: StateFlow<Boolean> = combine(visible, coordinator.playback) { current, playback ->
        MiniPlayerVisibility.transport(current.shown?.subject?.attachmentId, playback).isPlaying
    }.distinctUntilChanged().stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), false)

    val uiState: StateFlow<MiniPlayerUiState> = combine(visible, isPlaying) { current, playing ->
        MiniPlayerUiState(bar = current.shown?.context?.toBar(), isPlaying = playing)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), MiniPlayerUiState())

    /** 0..1, lue par la feuille de la barre : la barre elle-même ne se recompose pas à chaque tic. */
    val progress: StateFlow<Float> = combine(visible, coordinator.playback) { current, playback ->
        MiniPlayerVisibility.transport(current.shown?.subject?.attachmentId, playback).progress
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), 0f)

    init {
        viewModelScope.launch {
            visible.map { it.shown != null }.distinctUntilChanged().collect(display::publish)
        }
    }

    fun onEvent(event: MiniPlayerUiEvent) {
        when (event) {
            MiniPlayerUiEvent.TogglePlay -> coordinator.togglePlayPause()
            MiniPlayerUiEvent.Next -> coordinator.next()
            MiniPlayerUiEvent.Close -> coordinator.stop()
            MiniPlayerUiEvent.Open -> open()
            is MiniPlayerUiEvent.CurrentConversation -> currentConversation.value = event.conversationId
        }
    }

    private fun open() {
        val subject = visible.value.shown?.subject ?: return
        val target = NowPlayingReturnPolicy.miniPlayerTarget(ReturnContext(subject.conversationId, subject.messageId)) ?: return
        effects.trySend(MiniPlayerUiEffect.OpenConversation(target.conversationId, target.messageId))
    }

    private fun contextOf(subject: MiniPlayerSubject, active: ActiveAudioContext?, grace: ActiveAudioContext?): ActiveAudioContext? =
        listOfNotNull(active, grace).firstOrNull { it.subject() == subject }

    private fun ActiveAudioContext.subject() = MiniPlayerSubject(
        conversationId = audio.conversationId,
        messageId = audio.messageId,
        attachmentId = audio.attachmentId,
    )

    private fun ActiveAudioContext.toBar() = MiniPlayerBarState(
        senderName = audio.senderName,
        senderAvatarUrl = audio.senderAvatarUrl,
        conversationName = conversationName,
        avatarAccentHex = DynamicColorGenerator.colorForName(audio.senderName),
    )

    private companion object {
        const val STOP_TIMEOUT_MS = 5_000L
    }
}
