package me.meeshy.app.conversations

import androidx.annotation.VisibleForTesting
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.CreatedShareLink
import me.meeshy.sdk.model.CreateShareLinkForm
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.sdk.model.joinUrl
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.sharelink.ShareLinkRepository
import javax.inject.Inject

/**
 * UDF state for the share-link creation flow: an editable [CreateShareLinkForm]
 * seeded from the conversation, the in-flight create, and the terminal created link.
 * The resolved [webOrigin] lets the success sheet derive a shareable [createdJoinUrl]
 * without storing it redundantly.
 */
data class CreateShareLinkUiState(
    val form: CreateShareLinkForm,
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val created: CreatedShareLink? = null,
    val webOrigin: String = "",
) {
    val canSubmit: Boolean get() = form.canSubmit && !isSubmitting

    val isCreated: Boolean get() = created != null

    /** The public, shareable join URL for the created link, or `null` before create. */
    val createdJoinUrl: String? get() = created?.joinUrl(webOrigin)
}

/**
 * Orchestrates share-link creation on top of the pure [CreateShareLinkForm] SSOT
 * and [ShareLinkRepository]. Threads every field edit through the form and submits
 * the built request; a failed create keeps every edit for retry, never a crash.
 */
@HiltViewModel
class CreateShareLinkViewModel @Inject constructor(
    private val repository: ShareLinkRepository,
    savedStateHandle: SavedStateHandle,
    config: MeeshyConfig,
) : ViewModel() {

    private val conversationId: String = checkNotNull(savedStateHandle[CONVERSATION_ID_ARG]) {
        "CreateShareLinkViewModel requires a '$CONVERSATION_ID_ARG' navigation argument"
    }

    /** Public web origin (e.g. `https://meeshy.me`) for the created link's join URL. */
    private val webOrigin: String =
        ServerEnvironmentResolver.webOrigin(
            ServerEnvironmentResolver.serverOrigin(config.apiBaseUrl),
        )

    private val _state = MutableStateFlow(
        CreateShareLinkUiState(
            form = CreateShareLinkForm.from(conversationId),
            webOrigin = webOrigin,
        ),
    )
    val state: StateFlow<CreateShareLinkUiState> = _state.asStateFlow()

    /** Injectable at the edge so the built `expiresAt` stays deterministic in tests. */
    @VisibleForTesting
    internal var now: () -> Long = { System.currentTimeMillis() }

    fun onNameChange(value: String) = updateForm { it.withName(value) }

    fun onDescriptionChange(value: String) = updateForm { it.withDescription(value) }

    fun onSlugChange(value: String) = updateForm { it.withSlug(value) }

    fun onRequireAccountChange(value: Boolean) = updateForm { it.withRequireAccount(value) }

    fun onRequireNicknameChange(value: Boolean) = updateForm { it.withRequireNickname(value) }

    fun onRequireEmailChange(value: Boolean) = updateForm { it.withRequireEmail(value) }

    fun onRequireBirthdayChange(value: Boolean) = updateForm { it.withRequireBirthday(value) }

    fun onAllowAnonymousMessagesChange(value: Boolean) =
        updateForm { it.withAllowAnonymousMessages(value) }

    fun onAllowAnonymousImagesChange(value: Boolean) =
        updateForm { it.withAllowAnonymousImages(value) }

    fun onAllowAnonymousFilesChange(value: Boolean) =
        updateForm { it.withAllowAnonymousFiles(value) }

    fun onAllowViewHistoryChange(value: Boolean) = updateForm { it.withAllowViewHistory(value) }

    fun onMaxUsesEnabledChange(value: Boolean) = updateForm { it.withMaxUsesEnabled(value) }

    fun onMaxUsesChange(value: Int) = updateForm { it.withMaxUses(value) }

    fun onExpirationChange(value: ShareLinkExpiration) = updateForm { it.withExpiration(value) }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return
        val request = current.form.toRequest(now()) ?: return
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            _state.update {
                when (val result = repository.create(request)) {
                    is NetworkResult.Success -> it.copy(isSubmitting = false, created = result.data)
                    is NetworkResult.Failure -> it.copy(
                        isSubmitting = false,
                        errorMessage = result.error.message,
                    )
                }
            }
        }
    }

    private fun updateForm(transform: (CreateShareLinkForm) -> CreateShareLinkForm) {
        _state.update { it.copy(form = transform(it.form), errorMessage = null) }
    }

    companion object {
        const val CONVERSATION_ID_ARG: String = "conversationId"
    }
}
