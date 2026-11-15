package me.meeshy.app.auth

import android.os.LocaleList
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
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.GuestJoinError
import me.meeshy.sdk.model.GuestJoinForm
import me.meeshy.sdk.model.GuestJoinLanguages
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionRepository
import javax.inject.Inject
import java.util.Locale
import kotlin.random.Random

/**
 * UDF state for the guest (shared-link) join flow: a cache-cold preview load,
 * an editable [GuestJoinForm], the in-flight join, and the terminal joined
 * session.
 */
data class GuestJoinUiState(
    val isLoadingPreview: Boolean = true,
    val info: ShareLinkInfo? = null,
    val form: GuestJoinForm = GuestJoinForm(),
    val isSubmitting: Boolean = false,
    val previewError: GuestJoinError? = null,
    val submitError: GuestJoinError? = null,
    val session: AnonymousSessionContext? = null,
) {
    /** True once the link forbids anonymous joins — steer the visitor to sign in. */
    val requiresAccount: Boolean get() = form.requiresAccount

    val canSubmit: Boolean get() = info != null && !isSubmitting && form.canSubmit

    val isJoined: Boolean get() = session != null

    val previewErrorMessage: String? get() = (previewError as? GuestJoinError.ServerMessage)?.text

    val submitErrorMessage: String? get() = (submitError as? GuestJoinError.ServerMessage)?.text
}

/**
 * Orchestrates the guest-join flow (preview → form → join) on top of the pure
 * [GuestJoinForm] SSOT and [AnonymousSessionRepository]. Loads the public link
 * preview on creation, threads every field edit through the form (auto-suggesting
 * a username once both names are present, mirroring the web flow), and submits the
 * hardened join — a failed join keeps every edit for retry, never a crash.
 */
@HiltViewModel
class GuestJoinViewModel @Inject constructor(
    private val repository: AnonymousSessionRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val identifier: String = checkNotNull(savedStateHandle[IDENTIFIER_ARG]) {
        "GuestJoinViewModel requires an '$IDENTIFIER_ARG' navigation argument"
    }

    private val _state = MutableStateFlow(GuestJoinUiState())
    val state: StateFlow<GuestJoinUiState> = _state.asStateFlow()

    /** Injectable at the edge so the auto-suggested username stays deterministic in tests. */
    @VisibleForTesting
    internal var usernameSuffix: () -> Int = { Random.nextInt(1000) }

    /** The device's preferred languages, read when the preview lands; injectable for tests. */
    @VisibleForTesting
    internal var deviceLanguages: () -> List<String> = ::systemLanguageTags

    init {
        loadPreview()
    }

    fun loadPreview() {
        _state.update { it.copy(isLoadingPreview = true, previewError = null) }
        viewModelScope.launch {
            _state.update {
                when (val result = repository.preview(identifier)) {
                    is NetworkResult.Success -> it.copy(
                        isLoadingPreview = false,
                        info = result.data,
                        form = GuestJoinForm.from(
                            result.data,
                            GuestJoinLanguages.defaultFor(deviceLanguages()),
                        ),
                    )
                    is NetworkResult.Failure -> it.copy(
                        isLoadingPreview = false,
                        previewError = result.error.toGuestJoinError(),
                    )
                }
            }
        }
    }

    fun onFirstNameChange(value: String) =
        updateForm { it.withFirstName(value).suggestingUsername(usernameSuffix()) }

    fun onLastNameChange(value: String) =
        updateForm { it.withLastName(value).suggestingUsername(usernameSuffix()) }

    fun onUsernameChange(value: String) = updateForm { it.withUsername(value) }

    fun onEmailChange(value: String) = updateForm { it.withEmail(value) }

    fun onBirthdayChange(value: String) = updateForm { it.withBirthday(value) }

    fun onLanguageChange(value: String) = updateForm { it.withLanguage(value) }

    fun submit() {
        val current = _state.value
        if (current.isSubmitting) return
        val info = current.info ?: return
        val request = current.form.toRequest() ?: return
        val linkId = info.linkId.ifBlank { info.id }.ifBlank { identifier }
        _state.update { it.copy(isSubmitting = true, submitError = null) }
        viewModelScope.launch {
            _state.update {
                when (val result = repository.join(linkId, request)) {
                    is NetworkResult.Success -> it.copy(isSubmitting = false, session = result.data)
                    is NetworkResult.Failure -> it.copy(
                        isSubmitting = false,
                        submitError = result.error.toGuestJoinError(),
                    )
                }
            }
        }
    }

    private fun updateForm(transform: (GuestJoinForm) -> GuestJoinForm) {
        _state.update { it.copy(form = transform(it.form), submitError = null) }
    }

    companion object {
        const val IDENTIFIER_ARG: String = "identifier"
    }
}

private fun ApiError.toGuestJoinError(): GuestJoinError = GuestJoinError.from(httpStatus, message)

private fun systemLanguageTags(): List<String> =
    runCatching {
        val locales = LocaleList.getDefault()
        List(locales.size()) { locales[it].toLanguageTag() }
    }.getOrElse { listOf(Locale.getDefault().toLanguageTag()) }
