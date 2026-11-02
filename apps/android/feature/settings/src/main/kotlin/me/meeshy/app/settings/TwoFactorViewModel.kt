package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.TwoFactorCode
import me.meeshy.sdk.model.TwoFactorSetupFlow
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.TwoFactorSetupInfo
import javax.inject.Inject

/** Which screen/step of the 2FA flow is showing. */
enum class TwoFactorStage { STATUS, SETUP, BACKUP_CODES, DISABLE, REGENERATE_CODES }

/**
 * The reason the last action failed — localized by the screen with a fixed per-action
 * string (mirrors iOS's `TwoFactorViewModel`, which never surfaces the raw server
 * message either).
 */
enum class TwoFactorErrorKind { STATUS, SETUP, INVALID_CODE, DISABLE, BACKUP_CODES }

/** Effets ponctuels : le presse-papiers et les haptiques sont du ressort de l'écran. */
sealed interface TwoFactorEffect {
    data class CopySecret(val text: String) : TwoFactorEffect
    data class CopyBackupCodes(val text: String) : TwoFactorEffect
    data object HapticSuccess : TwoFactorEffect
    data object HapticError : TwoFactorEffect
}

data class TwoFactorUiState(
    val stage: TwoFactorStage = TwoFactorStage.STATUS,
    val flow: TwoFactorSetupFlow = TwoFactorSetupFlow(),
    val copiedKey: Boolean = false,
    val copiedCodes: Boolean = false,
    val isEnabled: Boolean = false,
    val backupCodesCount: Int = 0,
    val isLoading: Boolean = false,
    val isSubmitting: Boolean = false,
    val error: TwoFactorErrorKind? = null,
    val setupData: TwoFactorSetupInfo? = null,
    val codeInput: String = "",
    val backupCodes: List<String> = emptyList(),
    val disablePassword: String = "",
    val disableCode: String = "",
) {
    /** Gate for confirming a setup/regenerate TOTP code — exactly 6 digits, no request in flight. */
    val canConfirmCode: Boolean
        get() = TwoFactorCode.isValidTotp(codeInput) && !isSubmitting

    /** Gate for confirming disable — a password plus a TOTP-or-backup code, no request in flight. */
    val canConfirmDisable: Boolean
        get() = disablePassword.isNotEmpty() && TwoFactorCode.isValidDisableCode(disableCode) && !isSubmitting
}

/**
 * Drives the 2FA settings screen (feature-parity §L). The gateway's `auth/2fa` routes
 * are real (`services/gateway/src/routes/two-factor.ts`) and iOS already ships
 * this flow (`TwoFactorViewModel`/`TwoFactorSetupView`) — this is the Android port,
 * restoring the settings row that was removed on the incorrect assumption that no
 * gateway route existed.
 */
@HiltViewModel
class TwoFactorViewModel @Inject constructor(
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(TwoFactorUiState())
    val state: StateFlow<TwoFactorUiState> = _state.asStateFlow()

    private val _effects = Channel<TwoFactorEffect>(Channel.BUFFERED)
    val effects: Flow<TwoFactorEffect> = _effects.receiveAsFlow()

    init {
        loadStatus()
    }

    fun loadStatus() {
        _state.update { it.copy(isLoading = true, error = null) }
        viewModelScope.launch {
            when (val result = authRepository.getTwoFactorStatus()) {
                is NetworkResult.Success -> _state.update {
                    it.copy(
                        isLoading = false,
                        isEnabled = result.data.enabled,
                        backupCodesCount = result.data.backupCodesCount,
                    )
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isLoading = false, error = TwoFactorErrorKind.STATUS)
                }
            }
        }
    }

    fun beginSetup() {
        val snapshot = _state.value
        if (snapshot.stage == TwoFactorStage.SETUP && snapshot.isSubmitting) return
        _state.update {
            it.copy(
                stage = TwoFactorStage.SETUP,
                flow = it.flow.started(),
                isSubmitting = true,
                error = null,
                codeInput = "",
                setupData = null,
            )
        }
        viewModelScope.launch {
            when (val result = authRepository.beginTwoFactorSetup()) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isSubmitting = false, setupData = result.data, flow = it.flow.setupLoaded())
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, flow = it.flow.setupFailed(), error = TwoFactorErrorKind.SETUP)
                }
            }
        }
    }

    fun onCodeChange(value: String) {
        _state.update {
            it.copy(
                codeInput = value.filter(Char::isDigit).take(TOTP_LENGTH),
                flow = it.flow.codeEdited(),
                error = null,
            )
        }
    }

    /** « Suivant » : du QR vers la saisie du code. */
    fun onNext() {
        _state.update { it.copy(flow = it.flow.next(), error = null) }
    }

    /** « Retour au QR code ». */
    fun onBackToQr() {
        _state.update { it.copy(flow = it.flow.backToQr(), error = null) }
    }

    /** Copie la clé secrète : un seul effet par fenêtre de 2 s (la coche verte). */
    fun copySecret() {
        val secret = _state.value.setupData?.secret ?: return
        if (_state.value.copiedKey) return
        _state.update { it.copy(copiedKey = true) }
        _effects.trySend(TwoFactorEffect.CopySecret(secret))
        viewModelScope.launch {
            delay(COPIED_FEEDBACK_MS)
            _state.update { it.copy(copiedKey = false) }
        }
    }

    /** Copie tous les codes de secours, un par ligne. */
    fun copyBackupCodes() {
        val codes = _state.value.backupCodes
        if (codes.isEmpty() || _state.value.copiedCodes) return
        _state.update { it.copy(copiedCodes = true) }
        _effects.trySend(TwoFactorEffect.CopyBackupCodes(codes.joinToString("\n")))
        viewModelScope.launch {
            delay(COPIED_FEEDBACK_MS)
            _state.update { it.copy(copiedCodes = false) }
        }
    }

    fun confirmSetup() {
        val snapshot = _state.value
        if (snapshot.stage != TwoFactorStage.SETUP || !snapshot.canConfirmCode) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = authRepository.enableTwoFactor(snapshot.codeInput)) {
                is NetworkResult.Success -> updateAndCue(TwoFactorEffect.HapticSuccess) {
                    it.copy(
                        isSubmitting = false,
                        isEnabled = true,
                        stage = TwoFactorStage.BACKUP_CODES,
                        flow = it.flow.verified(),
                        backupCodes = result.data.backupCodes,
                        setupData = null,
                        codeInput = "",
                    )
                }
                is NetworkResult.Failure -> {
                    _state.update {
                        it.copy(isSubmitting = false, flow = it.flow.codeInvalid(), error = TwoFactorErrorKind.INVALID_CODE)
                    }
                    _effects.trySend(TwoFactorEffect.HapticError)
                }
            }
        }
    }

    fun beginRegenerateCodes() {
        _state.update { it.copy(stage = TwoFactorStage.REGENERATE_CODES, codeInput = "", error = null) }
    }

    fun confirmRegenerateCodes() {
        val snapshot = _state.value
        if (snapshot.stage != TwoFactorStage.REGENERATE_CODES || !snapshot.canConfirmCode) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = authRepository.regenerateTwoFactorBackupCodes(snapshot.codeInput)) {
                is NetworkResult.Success -> updateAndCue(TwoFactorEffect.HapticSuccess) {
                    it.copy(
                        isSubmitting = false,
                        stage = TwoFactorStage.BACKUP_CODES,
                        backupCodes = result.data.backupCodes,
                        codeInput = "",
                    )
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(isSubmitting = false, error = TwoFactorErrorKind.BACKUP_CODES) }
                    _effects.trySend(TwoFactorEffect.HapticError)
                }
            }
        }
    }

    fun acknowledgeBackupCodes() {
        _state.update {
            it.copy(
                stage = TwoFactorStage.STATUS,
                flow = TwoFactorSetupFlow(),
                backupCodes = emptyList(),
                codeInput = "",
                setupData = null,
                copiedCodes = false,
            )
        }
    }

    fun beginDisable() {
        _state.update {
            it.copy(stage = TwoFactorStage.DISABLE, disablePassword = "", disableCode = "", error = null)
        }
    }

    fun onDisablePasswordChange(value: String) {
        _state.update { it.copy(disablePassword = value, error = null) }
    }

    fun onDisableCodeChange(value: String) {
        _state.update { it.copy(disableCode = value, error = null) }
    }

    fun confirmDisable() {
        val snapshot = _state.value
        if (snapshot.stage != TwoFactorStage.DISABLE || !snapshot.canConfirmDisable) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (authRepository.disableTwoFactor(snapshot.disablePassword, snapshot.disableCode)) {
                is NetworkResult.Success -> updateAndCue(TwoFactorEffect.HapticSuccess) {
                    it.copy(
                        isSubmitting = false,
                        isEnabled = false,
                        stage = TwoFactorStage.STATUS,
                        disablePassword = "",
                        disableCode = "",
                    )
                }
                is NetworkResult.Failure -> {
                    _state.update { it.copy(isSubmitting = false, error = TwoFactorErrorKind.DISABLE) }
                    _effects.trySend(TwoFactorEffect.HapticError)
                }
            }
        }
    }

    private var startStepConsumed = false

    /**
     * Ouvre directement l'étape demandée par la page Sécurité (`setup` / `backup` / `disable`) ;
     * une valeur inconnue ou absente laisse l'écran de statut. Appliquée une seule fois
     * (la recomposition ou une rotation ne rejoue pas l'étape).
     */
    fun openAtStep(step: String?) {
        if (startStepConsumed || step == null) return
        startStepConsumed = true
        when (step) {
            "setup" -> beginSetup()
            "backup" -> beginRegenerateCodes()
            "disable" -> beginDisable()
        }
    }

    /** Backs out of any sub-stage without a network call, clearing that stage's transient buffers. */
    fun cancel() {
        _state.update {
            it.copy(
                stage = TwoFactorStage.STATUS,
                flow = TwoFactorSetupFlow(),
                setupData = null,
                codeInput = "",
                disablePassword = "",
                disableCode = "",
                error = null,
            )
        }
    }

    private inline fun updateAndCue(
        effect: TwoFactorEffect,
        crossinline transform: (TwoFactorUiState) -> TwoFactorUiState,
    ) {
        _state.update { transform(it) }
        _effects.trySend(effect)
    }

    private companion object {
        const val TOTP_LENGTH = 6
        const val COPIED_FEEDBACK_MS = 2_000L
    }
}
