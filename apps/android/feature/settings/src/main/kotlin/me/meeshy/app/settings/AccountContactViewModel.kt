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
import me.meeshy.sdk.model.account.PhoneChangeFlow
import me.meeshy.sdk.model.auth.PhonePlausibility
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

data class AccountContactUiState(
    val user: MeeshyUser? = null,

    val isEditingEmail: Boolean = false,
    val newEmail: String = "",
    val emailLoading: Boolean = false,
    val emailSent: Boolean = false,
    val emailError: AccountContactErrorKind? = null,
    val resendCooldown: MagicLinkCountdown? = null,

    val phone: PhoneChangeFlow = PhoneChangeFlow(),
    val phoneLoading: Boolean = false,
    val phoneVerifying: Boolean = false,
    val phoneError: AccountContactErrorKind? = null,
) {
    /** Local format gate before hitting the network (server has the final say). */
    val canSubmitEmail: Boolean
        get() = SignupFieldValidation.isEmailValidLocally(newEmail) && !emailLoading

    /** Resend is only offered once the 60 s gateway rate-limit window has drained. */
    val canResendEmail: Boolean
        get() = resendCooldown?.canResend(emailLoading) == true

    val isEditingPhone: Boolean get() = phone.isEditing
    val newPhone: String get() = phone.number
    val phoneSent: Boolean get() = phone.isCodeSent
    val phoneCode: String get() = phone.code

    /** Le motif du refus du numéro SAISI, `null` tant qu'il est vide ou plausible. */
    val phoneRefusal: PhonePlausibility.Refusal? get() = phone.numberRefusal

    val canSubmitPhone: Boolean
        get() = phone.canSendCode && !phoneLoading

    /** [PhoneChangeFlow.onCodeChange] already guarantees a digit-only, ≤6-char buffer. */
    val canVerifyPhoneCode: Boolean
        get() = phone.canVerify && !phoneVerifying
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
                _state.update {
                    val confirmed = it.emailSent && user?.emailVerifiedAt != null
                    it.copy(user = user, emailSent = it.emailSent && !confirmed, resendCooldown = if (confirmed) null else it.resendCooldown)
                }
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
        _state.update { it.copy(phone = it.phone.beginEdit(it.user?.phoneNumber), phoneError = null) }
    }

    fun onNewPhoneChange(value: String) {
        _state.update { it.copy(phone = it.phone.onNumberChange(value), phoneError = null) }
    }

    fun cancelEditPhone() {
        _state.update { it.copy(phone = it.phone.cancel(), phoneError = null) }
    }

    /** Sends a 6-digit SMS code to [AccountContactUiState.newPhone]. Double-tap safe. */
    fun submitPhoneChange() {
        val snapshot = _state.value
        if (!snapshot.canSubmitPhone) return
        _state.update { it.copy(phoneLoading = true, phoneError = null) }
        viewModelScope.launch {
            when (userRepository.changePhone(snapshot.newPhone.trim())) {
                is NetworkResult.Success -> _state.update {
                    it.copy(phoneLoading = false, phone = it.phone.codeSent())
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
        _state.update { it.copy(phone = it.phone.onNumberChange(phone)) }
        submitPhoneChange()
    }

    /** Digit-only, truncated-to-6 buffer — the field itself guarantees [AccountContactUiState.canVerifyPhoneCode]'s shape. */
    fun onPhoneCodeChange(value: String) {
        _state.update { it.copy(phone = it.phone.onCodeChange(value), phoneError = null) }
    }

    /** Backs out of the phone flow without a network call (mirrors [TwoFactorViewModel.cancel]). */
    fun cancelPhoneVerification() {
        _state.update { it.copy(phone = it.phone.cancel(), phoneError = null) }
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
                            phone = it.phone.verified(),
                        )
                    }
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(phoneVerifying = false, phoneError = result.error.toPhoneVerifyErrorKind())
                }
            }
        }
    }

    /**
     * Foreground return: a verification link opened in the mail app confirms the address
     * out-of-band, so while an email is pending the session is re-read and the badge flips
     * to Verified without any action. Inert when nothing is pending (no useless request).
     */
    fun onResume() {
        if (!_state.value.emailSent) return
        viewModelScope.launch { sessionRepository.refresh() }
    }

    override fun onCleared() {
        resendTickJob?.cancel()
        super.onCleared()
    }
}

private fun ApiError.toPhoneVerifyErrorKind(): AccountContactErrorKind =
    if (httpStatus == 400) AccountContactErrorKind.PHONE_VERIFY_INVALID else AccountContactErrorKind.PHONE_VERIFY_GENERIC
