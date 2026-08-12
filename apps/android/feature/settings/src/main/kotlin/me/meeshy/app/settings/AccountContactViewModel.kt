package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.MagicLinkCountdown
import me.meeshy.sdk.model.auth.SignupFieldValidation
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.user.UserRepository
import javax.inject.Inject

/**
 * The reason an email/phone-change action failed — a fixed per-action kind the screen
 * localizes, mirroring [TwoFactorErrorKind]: the gateway's `change-email`/`change-phone`/
 * `verify-phone-change` routes return free-text English messages (`sendBadRequest(reply,
 * 'This email address is already in use')`, etc. — `services/gateway/src/routes/users/
 * contact-change.ts`), never a structured code, so surfacing them raw would break every
 * non-English locale this app ships (en/fr/es/pt).
 */
enum class AccountContactErrorKind {
    EMAIL_CHANGE,
    EMAIL_RESEND,
    PHONE_CHANGE,
    PHONE_VERIFY_INVALID,
    PHONE_VERIFY_GENERIC,
}

/** Seconds the gateway rate-limits `resend-email-change-verification` to (`contact-change.ts`). */
private const val EMAIL_RESEND_COOLDOWN_SECONDS = 60

/** Length of the SMS code `verify-phone-change` expects (`verifyPhoneChangeSchema`). */
private const val PHONE_CODE_LENGTH = 6

data class AccountContactUiState(
    val user: MeeshyUser? = null,

    val isEditingEmail: Boolean = false,
    val newEmail: String = "",
    val emailLoading: Boolean = false,
    val emailSent: Boolean = false,
    val emailError: AccountContactErrorKind? = null,
    val resendCooldown: MagicLinkCountdown? = null,

    val isEditingPhone: Boolean = false,
    val newPhone: String = "",
    val phoneLoading: Boolean = false,
    val phoneSent: Boolean = false,
    val phoneCode: String = "",
    val phoneVerifying: Boolean = false,
    val phoneError: AccountContactErrorKind? = null,
) {
    /** Local format gate before hitting the network (server has the final say). */
    val canSubmitEmail: Boolean
        get() = SignupFieldValidation.isEmailValidLocally(newEmail) && !emailLoading

    /** Resend is only offered once the 60 s gateway rate-limit window has drained. */
    val canResendEmail: Boolean
        get() = resendCooldown?.canResend(emailLoading) == true

    val canSubmitPhone: Boolean
        get() = SignupFieldValidation.isPhoneValidLocally(newPhone) && !phoneLoading

    /** [onPhoneCodeChange] already guarantees a digit-only, ≤6-char buffer. */
    val canVerifyPhoneCode: Boolean
        get() = phoneCode.length == PHONE_CODE_LENGTH && !phoneVerifying
}

/**
 * Drives the "Change email / phone" settings screen (feature-parity §K) — port of iOS
 * `SecurityView`'s email/phone sections. Two independent two-step sub-flows sharing one
 * screen: email change confirms out-of-band (a link mailed to the new address — this
 * view model never calls `verifyEmailChange`, exactly like iOS, which also never wires
 * it into any UI: the token only ever arrives via a clicked email link); phone change
 * confirms in-app via a 6-digit SMS code. Both are inherently *online* actions (the
 * gateway must reach a real inbox/handset), so neither is optimistic or offline-queued —
 * mirrors [ChangePasswordViewModel]'s online-only shape, not [ProfileViewModel]'s
 * optimistic one.
 */
@HiltViewModel
class AccountContactViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val sessionRepository: SessionRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AccountContactUiState())
    val state: StateFlow<AccountContactUiState> = _state.asStateFlow()

    private var resendTickJob: Job? = null

    init {
        viewModelScope.launch {
            sessionRepository.currentUser.collect { user ->
                _state.update { it.copy(user = user) }
            }
        }
    }

    // ---- email ----

    fun beginEditEmail() {
        _state.update { it.copy(isEditingEmail = true, newEmail = it.user?.email.orEmpty(), emailError = null) }
    }

    fun onNewEmailChange(value: String) {
        _state.update { it.copy(newEmail = value, emailError = null) }
    }

    fun cancelEditEmail() {
        _state.update { it.copy(isEditingEmail = false, newEmail = "", emailError = null) }
    }

    /**
     * Sends a verification email to [AccountContactUiState.newEmail]. Inert unless the
     * gate is satisfied and no request is already in flight (double-tap safe — mirrors
     * [ChangePasswordViewModel.submit]).
     */
    fun submitEmailChange() {
        val snapshot = _state.value
        if (!snapshot.canSubmitEmail) return
        _state.update { it.copy(emailLoading = true, emailError = null) }
        viewModelScope.launch {
            when (userRepository.changeEmail(snapshot.newEmail.trim())) {
                is NetworkResult.Success -> {
                    _state.update {
                        it.copy(
                            emailLoading = false,
                            emailSent = true,
                            isEditingEmail = false,
                            resendCooldown = MagicLinkCountdown.start(EMAIL_RESEND_COOLDOWN_SECONDS),
                        )
                    }
                    startResendTicking()
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(emailLoading = false, emailError = AccountContactErrorKind.EMAIL_CHANGE)
                }
            }
        }
    }

    /** Re-sends the pending verification email. Inert while the cooldown is still active. */
    fun resendEmailVerification() {
        if (!_state.value.canResendEmail) return
        viewModelScope.launch {
            when (userRepository.resendEmailChangeVerification()) {
                is NetworkResult.Success -> {
                    _state.update { it.copy(resendCooldown = MagicLinkCountdown.start(EMAIL_RESEND_COOLDOWN_SECONDS)) }
                    startResendTicking()
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(emailError = AccountContactErrorKind.EMAIL_RESEND)
                }
            }
        }
    }

    /**
     * Re-triggers verification for the already-set-but-unverified current email,
     * without opening the edit form first (port of iOS `SecurityView`'s inline
     * "Verify" action on the email row). No-op with no current email.
     */
    fun verifyCurrentEmail() {
        val email = _state.value.user?.email?.takeIf { it.isNotBlank() } ?: return
        _state.update { it.copy(newEmail = email) }
        submitEmailChange()
    }

    private fun startResendTicking() {
        resendTickJob?.cancel()
        resendTickJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                val ticked = _state.value.resendCooldown?.tick() ?: break
                _state.update { it.copy(resendCooldown = ticked) }
                if (ticked.expired) break
            }
        }
    }

    // ---- phone ----

    fun beginEditPhone() {
        _state.update { it.copy(isEditingPhone = true, newPhone = it.user?.phoneNumber.orEmpty(), phoneError = null) }
    }

    fun onNewPhoneChange(value: String) {
        _state.update { it.copy(newPhone = value, phoneError = null) }
    }

    fun cancelEditPhone() {
        _state.update { it.copy(isEditingPhone = false, newPhone = "", phoneError = null) }
    }

    /** Sends a 6-digit SMS code to [AccountContactUiState.newPhone]. Double-tap safe. */
    fun submitPhoneChange() {
        val snapshot = _state.value
        if (!snapshot.canSubmitPhone) return
        _state.update { it.copy(phoneLoading = true, phoneError = null) }
        viewModelScope.launch {
            when (userRepository.changePhone(snapshot.newPhone.trim())) {
                is NetworkResult.Success -> _state.update {
                    it.copy(phoneLoading = false, phoneSent = true, isEditingPhone = false)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(phoneLoading = false, phoneError = AccountContactErrorKind.PHONE_CHANGE)
                }
            }
        }
    }

    /**
     * Re-triggers verification for the already-set-but-unverified current phone
     * number, without opening the edit form first (port of iOS `SecurityView`'s
     * inline "Verify" action on the phone row). No-op with no current number.
     */
    fun verifyCurrentPhone() {
        val phone = _state.value.user?.phoneNumber?.takeIf { it.isNotBlank() } ?: return
        _state.update { it.copy(newPhone = phone) }
        submitPhoneChange()
    }

    /** Digit-only, truncated-to-6 buffer — the field itself guarantees [AccountContactUiState.canVerifyPhoneCode]'s shape. */
    fun onPhoneCodeChange(value: String) {
        val digitsOnly = value.filter(Char::isDigit).take(PHONE_CODE_LENGTH)
        _state.update { it.copy(phoneCode = digitsOnly, phoneError = null) }
    }

    /** Backs out of the phone flow without a network call (mirrors [TwoFactorViewModel.cancel]). */
    fun cancelPhoneVerification() {
        _state.update {
            it.copy(phoneSent = false, isEditingPhone = false, phoneCode = "", newPhone = "", phoneError = null)
        }
    }

    /**
     * Confirms the SMS code and, on success, re-hydrates the session so
     * [AccountContactUiState.user] reflects the new number immediately (mirrors iOS's
     * `authManager.checkExistingSession()` after a successful verify).
     */
    fun verifyPhoneCode() {
        val snapshot = _state.value
        if (!snapshot.canVerifyPhoneCode) return
        _state.update { it.copy(phoneVerifying = true, phoneError = null) }
        viewModelScope.launch {
            when (val result = userRepository.verifyPhoneChange(snapshot.phoneCode)) {
                is NetworkResult.Success -> {
                    sessionRepository.refresh()
                    _state.update {
                        it.copy(
                            phoneVerifying = false,
                            phoneSent = false,
                            isEditingPhone = false,
                            phoneCode = "",
                            newPhone = "",
                        )
                    }
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(phoneVerifying = false, phoneError = result.error.toPhoneVerifyErrorKind())
                }
            }
        }
    }

    override fun onCleared() {
        resendTickJob?.cancel()
        super.onCleared()
    }
}

private fun ApiError.toPhoneVerifyErrorKind(): AccountContactErrorKind =
    if (httpStatus == 400) AccountContactErrorKind.PHONE_VERIFY_INVALID else AccountContactErrorKind.PHONE_VERIFY_GENERIC
