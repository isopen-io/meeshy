package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.auth.RegistrationFields
import me.meeshy.sdk.model.auth.RegistrationProgressBar
import me.meeshy.sdk.model.auth.RegistrationStep
import me.meeshy.sdk.model.auth.RegistrationStepGate
import me.meeshy.sdk.model.auth.RegistrationStepNavigator
import me.meeshy.sdk.model.auth.SignupFieldValidation
import me.meeshy.sdk.model.auth.StepFill
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import javax.inject.Inject

/**
 * UDF snapshot of the 8-step gamified registration wizard.
 *
 * All the wizard's *decisions* are derived on demand from the shipped pure cores in
 * `:core:model/auth` — this state holds only the raw inputs ([currentStep] +
 * [fields] + the submit flags), never a re-implementation of a rule that already
 * lives in a core.
 */
data class RegistrationUiState(
    val currentStep: RegistrationStep = RegistrationStep.PSEUDO,
    val fields: RegistrationFields = RegistrationFields(),
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    val isRegistered: Boolean = false,
) {
    /** May the wizard advance from [currentStep]? — [RegistrationStepGate]. */
    val canProceed: Boolean get() = RegistrationStepGate.canProceed(currentStep, fields)

    val isFirstStep: Boolean get() = RegistrationStepNavigator.isFirst(currentStep)

    val isLastStep: Boolean get() = RegistrationStepNavigator.isLast(currentStep)

    /** Progress-bar role of [step] relative to [currentStep] — [RegistrationProgressBar]. */
    fun fill(step: RegistrationStep): StepFill = RegistrationProgressBar.fill(step, currentStep)
}

/**
 * The app-side ViewModel wiring the shipped registration cores into real UDF state.
 *
 * Parity: iOS `RegistrationViewModel`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Auth/RegistrationViewModel.swift`) +
 * `OnboardingFlowView`. iOS scatters the step navigation, per-step proceed gate,
 * phone-skip side effect and progress-bar jump across a stateful view model and a
 * SwiftUI view. Here every decision defers to a pure core
 * ([RegistrationStepNavigator], [RegistrationStepGate], [RegistrationProgressBar]),
 * leaving this class a thin caller that only applies the resulting immutable state.
 *
 * SOTA over iOS: editing an already-probed username / email / phone **invalidates
 * its stale availability answer** (`…Available = null`) so the proceed gate can
 * never pass on a server result that belongs to a since-changed value — the network
 * probe seam ([onUsernameAvailability] etc.) re-affirms it. iOS keeps the previous
 * `Bool?` until the debounced probe returns.
 *
 * The availability network probe itself (the 1 s debounce → `checkAvailability`
 * calls feeding [onUsernameAvailability] / [onEmailAvailability] /
 * [onPhoneAvailability]) is a separate follow-up slice; this ViewModel exposes those
 * setters as the seam and owns everything else.
 */
@HiltViewModel
class RegistrationViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
) : ViewModel() {

    private val _state = MutableStateFlow(RegistrationUiState())
    val state: StateFlow<RegistrationUiState> = _state.asStateFlow()

    fun onUsernameChange(value: String) = editFields { it.copy(username = value, usernameAvailable = null) }

    fun onEmailChange(value: String) = editFields { it.copy(email = value, emailAvailable = null) }

    fun onPhoneChange(value: String) = editFields { it.copy(phoneNumber = value, phoneAvailable = null) }

    fun onFirstNameChange(value: String) = editFields { it.copy(firstName = value) }

    fun onLastNameChange(value: String) = editFields { it.copy(lastName = value) }

    fun onPasswordChange(value: String) = editFields { it.copy(password = value) }

    fun onConfirmPasswordChange(value: String) = editFields { it.copy(confirmPassword = value) }

    fun onSystemLanguageChange(value: String) = editFields { it.copy(systemLanguage = value) }

    fun onAcceptTermsChange(value: Boolean) = editFields { it.copy(acceptTerms = value) }

    /** Network-probe seam: the availability layer reports the username verdict. */
    fun onUsernameAvailability(available: Boolean?) = editFields { it.copy(usernameAvailable = available) }

    fun onEmailAvailability(available: Boolean?) = editFields { it.copy(emailAvailable = available) }

    fun onPhoneAvailability(available: Boolean?) = editFields { it.copy(phoneAvailable = available) }

    /** iOS `nextStep()`: advance one step only when the proceed gate passes. */
    fun next() {
        val current = _state.value
        val target = RegistrationStepNavigator.advance(current.currentStep, current.canProceed) ?: return
        _state.update { it.copy(currentStep = target) }
    }

    /** iOS `previousStep()`: step back, inert on the first step. */
    fun previous() {
        val target = RegistrationStepNavigator.previous(_state.value.currentStep) ?: return
        _state.update { it.copy(currentStep = target) }
    }

    /** iOS `skipCurrentStep()`: forced advance; on PHONE, mark skipped + clear the number. */
    fun skip() {
        val outcome = RegistrationStepNavigator.skip(_state.value.currentStep)
        val target = outcome.target ?: return
        _state.update {
            val fields = if (outcome.clearPhone) {
                it.fields.copy(skipPhone = true, phoneNumber = "", phoneAvailable = null)
            } else {
                it.fields
            }
            it.copy(currentStep = target, fields = fields)
        }
    }

    /** iOS `onStepTapped`: jump back to a completed step (or re-select current); never forward. */
    fun jumpTo(step: RegistrationStep) {
        val target = RegistrationProgressBar.jumpTarget(step, _state.value.currentStep) ?: return
        _state.update { it.copy(currentStep = target) }
    }

    /** iOS `register()`: only fires from a passing RECAP gate; one flight at a time. */
    fun register() {
        val current = _state.value
        if (current.currentStep != RegistrationStep.RECAP || !current.canProceed || current.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        val fields = current.fields
        viewModelScope.launch {
            val result = authRepository.register(fields.toRegisterRequest())
            if (result is NetworkResult.Success) realtimeCoordinator.onAuthenticatedChanged(true)
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(isSubmitting = false, isRegistered = true)
                    is NetworkResult.Failure -> it.copy(isSubmitting = false, errorMessage = result.error.message)
                }
            }
        }
    }

    private fun editFields(transform: (RegistrationFields) -> RegistrationFields) {
        _state.update { it.copy(fields = transform(it.fields), errorMessage = null) }
    }
}

private fun RegistrationFields.toRegisterRequest(): RegisterRequest = RegisterRequest(
    username = SignupFieldValidation.normalizedUsername(username),
    email = SignupFieldValidation.normalizedEmail(email),
    password = password,
    firstName = firstName.trim().ifBlank { null },
    lastName = lastName.trim().ifBlank { null },
    systemLanguage = systemLanguage.ifBlank { null },
)
