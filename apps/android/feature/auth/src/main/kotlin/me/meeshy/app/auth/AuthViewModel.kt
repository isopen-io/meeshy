package me.meeshy.app.auth

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.feature.auth.R
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.SavedAccountsStore
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.CredentialRefusal
import me.meeshy.sdk.model.auth.EmailVerificationRequest
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.PendingEmailVerification
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.SavedAccounts
import me.meeshy.sdk.model.auth.ServerEnvironment
import me.meeshy.sdk.model.auth.ServerEnvironmentResolver
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.ServerEnvironmentStore
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import javax.inject.Inject

data class AuthUiState(
    val username: String = "",
    val password: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    @get:StringRes val errorRes: Int? = null,
    val isAuthenticated: Boolean = false,
    val savedAccounts: List<SavedAccount> = emptyList(),
    val selectedAccount: SavedAccount? = null,
    val showNormalLogin: Boolean = false,
    val selectedEnvironment: ServerEnvironment = ServerEnvironment.PRODUCTION,
    val customHostInput: String = "",
    val showEnvironmentSelector: Boolean = false,
    /**
     * Le serveur choisi n'est pas celui du client réseau en cours, construit une fois par
     * processus : l'écran redémarre l'app pour l'appliquer — sinon la connexion partirait vers
     * l'ancien serveur sous l'étiquette du nouveau.
     */
    val restartToApplyEnvironment: Boolean = false,
    /** iOS `AuthManager.twoFactorToken` : le défi d'un compte protégé, l'écran passe à l'étape du code. */
    val twoFactorToken: String? = null,
    val twoFactorCode: String = "",
    /** La passerelle demande de prouver l'adresse (`verification-required`) : l'écran passe à l'étape du code reçu. */
    val pendingVerification: PendingEmailVerification? = null,
    val verificationCode: String = "",
    val verificationResend: VerificationResend = VerificationResend.IDLE,
) {
    val canSubmit: Boolean get() = username.isNotBlank() && password.isNotBlank() && !isSubmitting

    /** iOS `LoginView` : « Se connecter » de l'étape 2FA reste grisé sous 6 caractères. */
    val canSubmitTwoFactor: Boolean get() = twoFactorCode.trim().length >= CODE_LENGTH && !isSubmitting

    val canSubmitVerification: Boolean get() = verificationCode.trim().length >= CODE_LENGTH && !isSubmitting

    private companion object {
        const val CODE_LENGTH = 6
    }

    /** iOS `LoginView.showPicker` — the remembered-account list instead of the credential form. */
    val showPicker: Boolean get() = SavedAccounts.showPicker(savedAccounts, showNormalLogin)

    /** iOS `LoginView`'s `showCustomInput || selectedEnv == .custom` — reveals the host field. */
    val showCustomHostInput: Boolean get() = selectedEnvironment == ServerEnvironment.CUSTOM

    /** iOS `LoginView`'s apply-button `.disabled(customHost.trimmingCharacters(...).isEmpty)`. */
    val canApplyCustomHost: Boolean get() = ServerEnvironmentResolver.canApplyCustomHost(customHostInput)

    /** iOS `LoginView`'s "Connecté à : %@" label — `MeeshyConfig.shared.serverOrigin`. */
    val serverOriginLabel: String
        get() = ServerEnvironmentResolver.serverOrigin(
            ServerEnvironmentResolver.apiBaseUrl(selectedEnvironment, customHostInput),
        )
}

/** Le renvoi du code de vérification : iOS `EmailVerificationView` (« Renvoyer le code », « Code renvoyé ! »). */
enum class VerificationResend { IDLE, SENDING, SENT }

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
    private val savedAccountsStore: SavedAccountsStore,
    private val cacheClock: CacheClock,
    private val config: MeeshyConfig,
    private val serverEnvironmentStore: ServerEnvironmentStore,
) : ViewModel() {

    private val _state = MutableStateFlow(
        AuthUiState(
            isAuthenticated = authRepository.isAuthenticated,
            savedAccounts = savedAccountsStore.accounts.value,
            selectedEnvironment = serverEnvironmentStore.selectedEnvironment,
            customHostInput = serverEnvironmentStore.customHost,
            // Reuses `config.enableLogging` (itself `BuildConfig.DEBUG`) as the
            // developer/QA-build signal — the Android equivalent of iOS
            // `LoginView`'s `Self.isSimulator` gate. A second, independently-sourced
            // "is this a debug build" flag would only ever agree with the existing
            // one, so this reuses rather than duplicates it.
            showEnvironmentSelector = config.enableLogging,
        ),
    )
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    init {
        realtimeCoordinator.onAuthenticatedChanged(authRepository.isAuthenticated)
        if (authRepository.isAuthenticated) {
            viewModelScope.launch { authRepository.restoreSession() }
        }
        viewModelScope.launch {
            savedAccountsStore.accounts.collect { accounts ->
                _state.update { it.copy(savedAccounts = accounts) }
            }
        }
    }

    fun onUsernameChange(value: String) {
        _state.update { it.copy(username = value, errorMessage = null, errorRes = null) }
    }

    fun onPasswordChange(value: String) {
        _state.update { it.copy(password = value, errorMessage = null, errorRes = null) }
    }

    /** A saved-account row was tapped — prefill its username, focus jumps to password. */
    fun selectAccount(account: SavedAccount) {
        _state.update {
            it.copy(
                selectedAccount = account,
                username = account.username,
                password = "",
                errorMessage = null,
                errorRes = null,
            )
        }
    }

    /** Back arrow on the selected-account view — returns to the picker list. */
    fun deselectAccount() {
        _state.update {
            it.copy(selectedAccount = null, password = "", errorMessage = null, errorRes = null)
        }
    }

    /** "Other account" — switches the picker to the normal username/password form. */
    fun useAnotherAccount() {
        _state.update { it.copy(showNormalLogin = true, selectedAccount = null) }
    }

    /** Back-to-picker link on the normal form — only reachable when accounts exist. */
    fun backToSavedAccounts() {
        _state.update { it.copy(showNormalLogin = false) }
    }

    /** Long-press/trailing "remove" affordance on a picker row. */
    fun removeAccount(userId: String) {
        savedAccountsStore.remove(userId)
    }

    /**
     * A pill tap on the developer/QA environment selector — iOS `LoginView`'s
     * `selectedEnv = env; if env != .custom { MeeshyConfig.shared.applyEnvironment(env) }`.
     * Selecting [ServerEnvironment.CUSTOM] only reveals the host field locally; it is
     * NOT persisted until [applyCustomHost] confirms a host, mirroring iOS leaving
     * `MeeshyConfig.shared.selectedEnvironment` untouched until the checkmark tap.
     */
    fun selectEnvironment(env: ServerEnvironment) {
        _state.update { it.copy(selectedEnvironment = env) }
        if (env != ServerEnvironment.CUSTOM) {
            serverEnvironmentStore.select(env)
        }
        _state.update { it.copy(restartToApplyEnvironment = selectionDiffersFromRunningServer()) }
    }

    private fun selectionDiffersFromRunningServer(): Boolean =
        ServerEnvironmentResolver.apiBaseUrl(serverEnvironmentStore.selectedEnvironment, serverEnvironmentStore.customHost)
            .trimEnd('/') != config.apiBaseUrl.trimEnd('/')

    /** Custom-host text field binding — iOS `LoginView`'s `$customHost`. */
    fun onCustomHostChange(value: String) {
        _state.update { it.copy(customHostInput = value) }
    }

    /**
     * The custom-host checkmark tap — iOS `LoginView.applyCustomHost()`. A blank/
     * whitespace-only host is inert, mirroring the disabled apply button.
     */
    fun applyCustomHost() {
        val host = _state.value.customHostInput
        if (!ServerEnvironmentResolver.canApplyCustomHost(host)) return
        serverEnvironmentStore.applyCustomHost(host.trim())
        _state.update {
            it.copy(selectedEnvironment = ServerEnvironment.CUSTOM, restartToApplyEnvironment = selectionDiffersFromRunningServer())
        }
    }

    fun login() {
        val current = _state.value
        if (current.username.isBlank() || current.password.isBlank()) {
            _state.update { it.copy(errorRes = R.string.login_error_required) }
            return
        }
        _state.update { it.copy(isSubmitting = true, errorMessage = null, errorRes = null) }
        viewModelScope.launch {
            when (val result = authRepository.loginOutcome(current.username.trim(), current.password, rememberDevice = false)) {
                is NetworkResult.Failure -> showRefusal(result.error.code, result.error.httpStatus, result.error.message)
                is NetworkResult.Success -> followOutcome(result.data)
            }
        }
    }

    fun onTwoFactorCodeChange(value: String) {
        _state.update { it.copy(twoFactorCode = value.take(MAX_CODE_INPUT), errorMessage = null, errorRes = null) }
    }

    /** iOS `LoginView.attempt2FALogin` → `AuthManager.completeLoginWith2FA`. */
    fun submitTwoFactor() {
        val current = _state.value
        val challenge = current.twoFactorToken ?: return
        if (!current.canSubmitTwoFactor) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null, errorRes = null) }
        viewModelScope.launch {
            when (val result = authRepository.completeLoginWith2FA(challenge, current.twoFactorCode.trim())) {
                is NetworkResult.Failure -> showRefusal(result.error.code, result.error.httpStatus, result.error.message)
                is NetworkResult.Success -> sessionOpened(result.data.user)
            }
        }
    }

    /** « Annuler » de l'étape 2FA : retour au formulaire, le défi est oublié. */
    fun cancelTwoFactor() {
        _state.update { it.copy(twoFactorToken = null, twoFactorCode = "", errorMessage = null, errorRes = null) }
    }

    fun onVerificationCodeChange(value: String) {
        _state.update {
            it.copy(verificationCode = value.filter(Char::isDigit).take(MAX_CODE_INPUT), errorMessage = null, errorRes = null)
        }
    }

    /**
     * iOS `EmailVerificationViewModel.verifyCode` : le code reçu, avec le mot de passe déjà
     * prouvé, ouvre la session — ou rend le défi de second facteur.
     */
    fun submitVerification() {
        val current = _state.value
        val pending = current.pendingVerification ?: return
        if (!current.canSubmitVerification) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null, errorRes = null) }
        viewModelScope.launch {
            val request = EmailVerificationRequest(
                email = pending.email,
                code = current.verificationCode.trim(),
                password = current.password.takeIf { it.isNotEmpty() },
            )
            when (val result = authRepository.confirmEmail(request)) {
                is NetworkResult.Failure ->
                    showRefusal(result.error.code, result.error.httpStatus, result.error.message, verifying = true)
                is NetworkResult.Success -> followOutcome(result.data, adopt = true)
            }
        }
    }

    /** « Renvoyer le code » : la passerelle répond succès même sans compte (anti-énumération). */
    fun resendVerification() {
        val pending = _state.value.pendingVerification ?: return
        if (_state.value.verificationResend == VerificationResend.SENDING) return
        _state.update { it.copy(verificationResend = VerificationResend.SENDING, errorMessage = null, errorRes = null) }
        viewModelScope.launch {
            val result = authRepository.resendEmailVerification(pending.email)
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(verificationResend = VerificationResend.SENT)
                    is NetworkResult.Failure ->
                        it.copy(verificationResend = VerificationResend.IDLE, errorRes = R.string.email_verification_error_resend_failed)
                }
            }
        }
    }

    /** « Fermer » de l'étape de vérification : retour au formulaire. */
    fun cancelVerification() {
        _state.update {
            it.copy(
                pendingVerification = null,
                verificationCode = "",
                verificationResend = VerificationResend.IDLE,
                errorMessage = null,
                errorRes = null,
            )
        }
    }

    private fun followOutcome(outcome: LoginOutcome, adopt: Boolean = false) {
        when (outcome) {
            is LoginOutcome.Authenticated -> {
                if (adopt) authRepository.adoptSession(outcome.session)
                sessionOpened(outcome.session.user)
            }
            is LoginOutcome.TwoFactorRequired -> _state.update {
                it.copy(
                    isSubmitting = false,
                    twoFactorToken = outcome.twoFactorToken,
                    twoFactorCode = "",
                    pendingVerification = null,
                    verificationCode = "",
                )
            }
            is LoginOutcome.VerificationRequired -> _state.update {
                it.copy(
                    isSubmitting = false,
                    pendingVerification = outcome.pending,
                    verificationCode = "",
                    verificationResend = VerificationResend.IDLE,
                )
            }
            is LoginOutcome.LinkConfirmationRequired ->
                _state.update { it.copy(isSubmitting = false, errorRes = R.string.common_error_generic) }
        }
    }

    private fun sessionOpened(user: MeeshyUser) {
        realtimeCoordinator.onAuthenticatedChanged(true)
        savedAccountsStore.upsert(
            SavedAccount(
                id = user.id,
                username = user.username,
                displayName = user.displayName,
                avatarUrl = user.avatar,
                lastActiveAtMillis = cacheClock.nowMillis(),
            ),
        )
        _state.update {
            it.copy(
                isSubmitting = false,
                isAuthenticated = true,
                twoFactorToken = null,
                twoFactorCode = "",
                pendingVerification = null,
                verificationCode = "",
            )
        }
    }

    private fun showRefusal(code: String?, httpStatus: Int?, message: String?, verifying: Boolean = false) {
        val refusal = CredentialRefusal.classify(code, httpStatus)
        val reason = refusal.serverReason(message)
        val res = when (refusal) {
            CredentialRefusal.OFFLINE -> R.string.email_verification_error_offline
            CredentialRefusal.TOO_MANY_ATTEMPTS -> R.string.email_verification_error_too_many_attempts
            CredentialRefusal.INVALID_CODE -> R.string.email_verification_error_invalid_code
            CredentialRefusal.EXPIRED_CODE -> R.string.email_verification_error_expired_code
            CredentialRefusal.REJECTED, CredentialRefusal.UNEXPECTED ->
                if (verifying) R.string.email_verification_error_generic else R.string.common_error_generic
        }
        _state.update {
            it.copy(isSubmitting = false, errorMessage = reason, errorRes = res.takeIf { reason == null })
        }
    }

    /**
     * Adopte une session ouverte HORS de ce VM — le magic link valide dans son
     * propre ecran via AuthRepository. Meme post-traitement que [login] :
     * sockets reveilles, compte memorise pour le picker, etat aligne.
     */
    fun onExternalSessionOpened() {
        realtimeCoordinator.onAuthenticatedChanged(authRepository.isAuthenticated)
        _state.update { it.copy(isAuthenticated = authRepository.isAuthenticated) }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
            realtimeCoordinator.onAuthenticatedChanged(false)
            // The saved-account list AND the developer/QA environment selection are
            // both device-level, cross-account state — neither is part of what a
            // logout should reset (SessionTeardown.wipe() doesn't touch either).
            _state.value = AuthUiState(
                savedAccounts = savedAccountsStore.accounts.value,
                selectedEnvironment = serverEnvironmentStore.selectedEnvironment,
                customHostInput = serverEnvironmentStore.customHost,
                showEnvironmentSelector = config.enableLogging,
            )
        }
    }

    private companion object {
        /** Un code TOTP (6 chiffres) ou de secours (`XXXX-XXXX`). */
        const val MAX_CODE_INPUT = 9
    }
}
