package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.TwoFactorCode
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

data class TwoFactorUiState(
    val stage: TwoFactorStage = TwoFactorStage.STATUS,
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
        _state.update {
            it.copy(stage = TwoFactorStage.SETUP, isSubmitting = true, error = null, codeInput = "")
        }
        viewModelScope.launch {
            when (val result = authRepository.beginTwoFactorSetup()) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isSubmitting = false, setupData = result.data)
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, stage = TwoFactorStage.STATUS, error = TwoFactorErrorKind.SETUP)
                }
            }
        }
    }

    fun onCodeChange(value: String) {
        _state.update { it.copy(codeInput = value, error = null) }
    }

    fun confirmSetup() {
        val snapshot = _state.value
        if (snapshot.stage != TwoFactorStage.SETUP || !snapshot.canConfirmCode) return
        _state.update { it.copy(isSubmitting = true, error = null) }
        viewModelScope.launch {
            when (val result = authRepository.enableTwoFactor(snapshot.codeInput)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(
                        isSubmitting = false,
                        isEnabled = true,
                        stage = TwoFactorStage.BACKUP_CODES,
                        backupCodes = result.data.backupCodes,
                        setupData = null,
                        codeInput = "",
                    )
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, error = TwoFactorErrorKind.INVALID_CODE)
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
                is NetworkResult.Success -> _state.update {
                    it.copy(
                        isSubmitting = false,
                        stage = TwoFactorStage.BACKUP_CODES,
                        backupCodes = result.data.backupCodes,
                        codeInput = "",
                    )
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, error = TwoFactorErrorKind.BACKUP_CODES)
                }
            }
        }
    }

    fun acknowledgeBackupCodes() {
        _state.update {
            it.copy(stage = TwoFactorStage.STATUS, backupCodes = emptyList(), codeInput = "", setupData = null)
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
                is NetworkResult.Success -> _state.update {
                    it.copy(
                        isSubmitting = false,
                        isEnabled = false,
                        stage = TwoFactorStage.STATUS,
                        disablePassword = "",
                        disableCode = "",
                    )
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, error = TwoFactorErrorKind.DISABLE)
                }
            }
        }
    }

    /** Backs out of any sub-stage without a network call, clearing that stage's transient buffers. */
    fun cancel() {
        _state.update {
            it.copy(
                stage = TwoFactorStage.STATUS,
                setupData = null,
                codeInput = "",
                disablePassword = "",
                disableCode = "",
                error = null,
            )
        }
    }
}
