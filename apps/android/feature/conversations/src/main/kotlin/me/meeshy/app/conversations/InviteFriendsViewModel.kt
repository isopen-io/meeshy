package me.meeshy.app.conversations

import androidx.annotation.VisibleForTesting
import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.CreateShareLinkForm
import me.meeshy.sdk.model.InviteLinkDefaults
import me.meeshy.sdk.model.InviteLinkDraft
import me.meeshy.sdk.model.InviteLinkSummary
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.model.joinUrl
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.sharelink.ShareLinkRepository
import javax.inject.Inject

/** Les textes que la feuille localise et que la création du lien reprend quand l'utilisateur n'a rien saisi. */
@Immutable
data class InviteTexts(val defaultMessage: String, val defaultLinkName: String)

/** Où en est le lien : en cours de création (aucun lien encore), prêt, ou en échec avec réessai. */
enum class InviteLinkPhase { Creating, Ready, Failed }

@Immutable
data class InviteFriendsUiState(
    val draft: InviteLinkDraft? = null,
    val generated: InviteLinkDraft? = null,
    val joinUrl: String? = null,
    val isCreating: Boolean = false,
    val errorMessage: String? = null,
    val showOptions: Boolean = false,
    val copied: Boolean = false,
) {
    val optionsModified: Boolean
        get() = draft != null && InviteLinkDefaults.optionsModified(generated, draft)

    val summary: InviteLinkSummary? get() = draft?.let(InviteLinkDefaults::summary)

    val phase: InviteLinkPhase
        get() = when {
            joinUrl != null -> InviteLinkPhase.Ready
            errorMessage != null && !isCreating -> InviteLinkPhase.Failed
            else -> InviteLinkPhase.Creating
        }

    /** Partager n'attend que le premier lien : une régénération se fait au geste, derrière lui. */
    val canShare: Boolean get() = !(isCreating && joinUrl == null)
}

sealed interface InviteFriendsUiEvent {
    data class EditMessage(val value: String) : InviteFriendsUiEvent
    data class EditForm(val transform: (CreateShareLinkForm) -> CreateShareLinkForm) : InviteFriendsUiEvent
    data class StepMaxUses(val direction: Int) : InviteFriendsUiEvent
    data object ToggleOptions : InviteFriendsUiEvent
    data object Copy : InviteFriendsUiEvent
    data object Share : InviteFriendsUiEvent
    data object Retry : InviteFriendsUiEvent
}

sealed interface InviteFriendsUiEffect {
    data object SuccessHaptic : InviteFriendsUiEffect
    data class CopyToClipboard(val url: String) : InviteFriendsUiEffect
    data class OpenChooser(val url: String) : InviteFriendsUiEffect
}

/**
 * Miroir de `InviteFriendsSheet` (iOS) : le lien se crée à l'ouverture avec les défauts sûrs, se régénère au
 * partage si les options ont changé depuis, et la copie se confirme 1,5 s.
 */
@HiltViewModel
class InviteFriendsViewModel @Inject constructor(
    private val repository: ShareLinkRepository,
    config: MeeshyConfig,
) : ViewModel() {

    private val webOrigin: String = ServerEnvironmentResolver.webOrigin(
        ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl),
    )
    private val _state = MutableStateFlow(InviteFriendsUiState())
    val state: StateFlow<InviteFriendsUiState> = _state.asStateFlow()

    private val _effects = Channel<InviteFriendsUiEffect>(Channel.BUFFERED)
    val effects: Flow<InviteFriendsUiEffect> = _effects.receiveAsFlow()

    @VisibleForTesting
    internal var now: () -> Long = { System.currentTimeMillis() }

    private var texts: InviteTexts? = null
    private var createJob: Job? = null
    private var copiedJob: Job? = null

    /** Appelé à l'ouverture : crée le lien en arrière-plan, une seule fois par feuille. */
    fun start(conversationId: String, texts: InviteTexts) {
        if (this.texts != null) return
        this.texts = texts
        _state.update { it.copy(draft = InviteLinkDefaults.draft(conversationId)) }
        createLink(shareAfter = false)
    }

    fun onEvent(event: InviteFriendsUiEvent) {
        when (event) {
            is InviteFriendsUiEvent.EditMessage -> edit { it.withMessage(event.value) }
            is InviteFriendsUiEvent.EditForm -> edit { it.withForm(event.transform) }
            is InviteFriendsUiEvent.StepMaxUses -> edit { it.withForm { f -> InviteLinkDefaults.stepMaxUses(f, event.direction) } }
            InviteFriendsUiEvent.ToggleOptions -> _state.update { it.copy(showOptions = !it.showOptions) }
            InviteFriendsUiEvent.Copy -> copy()
            InviteFriendsUiEvent.Share -> share()
            InviteFriendsUiEvent.Retry -> createLink(shareAfter = false)
        }
    }

    private fun edit(transform: (InviteLinkDraft) -> InviteLinkDraft) {
        _state.update { current -> current.draft?.let { current.copy(draft = transform(it)) } ?: current }
    }

    private fun copy() {
        val url = _state.value.joinUrl ?: return
        _effects.trySend(InviteFriendsUiEffect.CopyToClipboard(url))
        _effects.trySend(InviteFriendsUiEffect.SuccessHaptic)
        _state.update { it.copy(copied = true) }
        copiedJob?.cancel()
        copiedJob = viewModelScope.launch {
            delay(COPIED_FEEDBACK_MILLIS)
            _state.update { it.copy(copied = false) }
        }
    }

    private fun share() {
        val current = _state.value
        if (!current.canShare || createJob?.isActive == true) return
        val url = current.joinUrl
        if (url != null && !current.optionsModified) {
            _effects.trySend(InviteFriendsUiEffect.OpenChooser(url))
        } else {
            createLink(shareAfter = true)
        }
    }

    private fun createLink(shareAfter: Boolean) {
        val draft = _state.value.draft ?: return
        val texts = texts ?: return
        if (createJob?.isActive == true) return
        val request = InviteLinkDefaults.toRequest(draft, now(), texts.defaultMessage, texts.defaultLinkName)
            ?: return
        _state.update { it.copy(isCreating = true, errorMessage = null) }
        createJob = viewModelScope.launch {
            when (val result = repository.create(request)) {
                is NetworkResult.Success -> {
                    val url = result.data.joinUrl(webOrigin)
                    _state.update { it.copy(isCreating = false, generated = draft, joinUrl = url) }
                    if (shareAfter) _effects.trySend(InviteFriendsUiEffect.OpenChooser(url)) else _effects.trySend(InviteFriendsUiEffect.SuccessHaptic)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isCreating = false, errorMessage = result.error.message.ifBlank { GENERIC_ERROR })
                }
            }
        }
    }

    private companion object {
        const val COPIED_FEEDBACK_MILLIS = 1_500L
        const val GENERIC_ERROR = "error"
    }
}
