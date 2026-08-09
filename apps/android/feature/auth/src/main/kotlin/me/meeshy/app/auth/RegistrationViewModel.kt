package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.auth.AvailabilityIntent
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.LanguageSelectionState
import me.meeshy.sdk.model.auth.RegistrationFields
import me.meeshy.sdk.model.auth.RegistrationNav
import me.meeshy.sdk.model.auth.RegistrationNavModel
import me.meeshy.sdk.model.auth.RegistrationProgressBar
import me.meeshy.sdk.model.auth.RegistrationStep
import me.meeshy.sdk.model.auth.RegistrationStepGate
import me.meeshy.sdk.model.auth.RegistrationStepNavigator
import me.meeshy.sdk.model.auth.RegistrationSummary
import me.meeshy.sdk.model.auth.RegistrationSummaryInput
import me.meeshy.sdk.model.auth.RegistrationSummaryRow
import me.meeshy.sdk.model.auth.SignupAvailabilityPolicy
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

    /**
     * The wizard's navigation chrome (top-bar leading control, primary button
     * label/icon/action/enabled, skip visibility, position counter) for [currentStep]
     * — [RegistrationNav]. The Compose wizard renders this model and dispatches its
     * [RegistrationNavModel.primaryAction] to [RegistrationViewModel.next] /
     * [RegistrationViewModel.register] and its leading control to
     * [RegistrationViewModel.previous] / dismiss.
     */
    val nav: RegistrationNavModel
        get() = RegistrationNav.model(
            current = currentStep,
            canProceed = canProceed,
            isSubmitting = isSubmitting,
        )

    /** Progress-bar role of [step] relative to [currentStep] — [RegistrationProgressBar]. */
    fun fill(step: RegistrationStep): StepFill = RegistrationProgressBar.fill(step, currentStep)

    /**
     * The two content-language choices the LANGUAGE step edits, as the read-model the
     * step's picker consumes (highlighting via [me.meeshy.sdk.model.auth.LanguageStepSelection.isSelected]).
     * Derived from [fields] — the pair iOS exposes as `systemLanguage` / `regionalLanguage`.
     */
    val languageSelection: LanguageSelectionState
        get() = LanguageSelectionState(
            systemLanguage = fields.systemLanguage,
            regionalLanguage = fields.regionalLanguage,
        )

    /**
     * The recap card's rows for the RECAP step — [RegistrationSummary] over the
     * fields already collected. Bio isn't gathered by the wizard yet, so its
     * optional row stays collapsed until the PROFILE step is wired; the pure core
     * supports it the moment it is.
     */
    val summary: List<RegistrationSummaryRow>
        get() = RegistrationSummary.rows(
            RegistrationSummaryInput(
                username = fields.username,
                email = fields.email,
                firstName = fields.firstName,
                lastName = fields.lastName,
                phoneDialCode = CountryCatalog.dialCode(fields.countryIso).orEmpty(),
                phoneNumber = fields.phoneNumber,
                skipPhone = fields.skipPhone,
                systemLanguage = fields.systemLanguage,
                regionalLanguage = fields.regionalLanguage,
            ),
        )
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
@OptIn(FlowPreview::class)
@HiltViewModel
class RegistrationViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
) : ViewModel() {

    private val _state = MutableStateFlow(RegistrationUiState())
    val state: StateFlow<RegistrationUiState> = _state.asStateFlow()

    private val usernameInput = MutableStateFlow("")
    private val emailInput = MutableStateFlow("")
    private val phoneInput = MutableStateFlow("")

    init {
        launchProbe(usernameInput, SignupAvailabilityPolicy::usernameIntent, ::onUsernameAvailability) {
            authRepository.checkAvailability(username = it).getOrNull()?.usernameAvailable
        }
        launchProbe(emailInput, SignupAvailabilityPolicy::emailIntent, ::onEmailAvailability) {
            authRepository.checkAvailability(email = it).getOrNull()?.emailAvailable
        }
        launchProbe(phoneInput, SignupAvailabilityPolicy::phoneIntent, ::onPhoneAvailability) { digits ->
            val dialCode = CountryCatalog.dialCode(_state.value.fields.countryIso).orEmpty()
            authRepository.checkAvailability(phoneNumber = dialCode + digits).getOrNull()?.phoneNumberAvailable
        }
    }

    fun onUsernameChange(value: String) {
        usernameInput.value = value
        editFields { it.copy(username = value, usernameAvailable = null) }
    }

    fun onEmailChange(value: String) {
        emailInput.value = value
        editFields { it.copy(email = value, emailAvailable = null) }
    }

    fun onPhoneChange(value: String) {
        phoneInput.value = value
        editFields { it.copy(phoneNumber = value, phoneAvailable = null) }
    }

    /**
     * The PHONE step's country picker: picking a country changes the E.164 number a
     * previously-confirmed [RegistrationFields.phoneAvailable] was probed for, so — like
     * every other `on…Change` edit — it invalidates that stale verdict rather than letting
     * the gate proceed on an answer that belonged to a different dial code. SOTA over iOS:
     * `RegistrationViewModel.selectedCountry` never invalidates `phoneAvailable`, so a
     * country switch after an already-confirmed number can silently proceed under the wrong
     * country there. No new probe is fired automatically here (mirrors iOS); editing the
     * phone field again re-triggers the debounced pipeline.
     */
    fun onCountryChange(iso: String) = editFields { it.copy(countryIso = iso, phoneAvailable = null) }

    fun onFirstNameChange(value: String) = editFields { it.copy(firstName = value) }

    fun onLastNameChange(value: String) = editFields { it.copy(lastName = value) }

    fun onPasswordChange(value: String) = editFields { it.copy(password = value) }

    fun onConfirmPasswordChange(value: String) = editFields { it.copy(confirmPassword = value) }

    fun onSystemLanguageChange(value: String) = editFields { it.copy(systemLanguage = value) }

    /** iOS `regionalLanguage` picker: the optional secondary content language. */
    fun onRegionalLanguageChange(value: String) = editFields { it.copy(regionalLanguage = value) }

    fun onAcceptTermsChange(value: Boolean) = editFields { it.copy(acceptTerms = value) }

    /**
     * Network-probe seam: the availability layer reports the username verdict.
     * A background verdict must NOT clear a surfaced [RegistrationUiState.errorMessage]
     * (only a user field edit does), so this goes through [updateFields], not [editFields].
     */
    fun onUsernameAvailability(available: Boolean?) = updateFields { it.copy(usernameAvailable = available) }

    fun onEmailAvailability(available: Boolean?) = updateFields { it.copy(emailAvailable = available) }

    fun onPhoneAvailability(available: Boolean?) = updateFields { it.copy(phoneAvailable = available) }

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
        if (outcome.clearPhone) phoneInput.value = ""
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

    /** A user field edit — clears any surfaced [RegistrationUiState.errorMessage]. */
    private fun editFields(transform: (RegistrationFields) -> RegistrationFields) {
        _state.update { it.copy(fields = transform(it.fields), errorMessage = null) }
    }

    /** A background field update (e.g. an availability verdict) — leaves errorMessage intact. */
    private fun updateFields(transform: (RegistrationFields) -> RegistrationFields) {
        _state.update { it.copy(fields = transform(it.fields)) }
    }

    /**
     * The debounced availability probe for one field — the app-side realisation of
     * iOS's `.debounce(1s).removeDuplicates().sink { … }` chain. The *decision*
     * (locally-invalid → clear, locally-valid → probe the normalized query) is
     * deferred to the pure [SignupAvailabilityPolicy]; this only supplies the
     * reactive plumbing and the network call.
     *
     * The source is a conflated [kotlinx.coroutines.flow.StateFlow], so the
     * `removeDuplicates` semantics are already provided by the source (it only
     * re-emits on an actual change); [distinctUntilChanged] after the debounce keeps
     * that guarantee explicit. The policy is therefore called with `previous = null`
     * — it never needs its `Unchanged` arm here, which is exercised by its own unit
     * tests. A failed probe yields `null` → the gate stays blocked on an "unknown"
     * verdict rather than a stale one.
     */
    private fun launchProbe(
        source: Flow<String>,
        intent: (current: String, previous: String?) -> AvailabilityIntent,
        apply: (Boolean?) -> Unit,
        probe: suspend (query: String) -> Boolean?,
    ) {
        viewModelScope.launch {
            source
                .debounce(AVAILABILITY_DEBOUNCE_MS)
                .distinctUntilChanged()
                .collect { value ->
                    val decision = intent(value, null)
                    apply(if (decision is AvailabilityIntent.Check) probe(decision.query) else null)
                }
        }
    }

    private companion object {
        const val AVAILABILITY_DEBOUNCE_MS = 1_000L
    }
}

/**
 * iOS `register()`'s `fullPhone = phoneNumber.isEmpty ? nil : selectedCountry.dialCode +
 * phoneNumber.filter(isNumber)`: a skipped or never-filled number sends neither wire field,
 * otherwise the E.164 dial-code-prefixed number travels with the selected country's ISO code.
 */
private fun RegistrationFields.toRegisterRequest(): RegisterRequest {
    val digits = SignupFieldValidation.phoneDigits(phoneNumber)
    val hasPhone = !skipPhone && digits.isNotEmpty()
    return RegisterRequest(
        username = SignupFieldValidation.normalizedUsername(username),
        email = SignupFieldValidation.normalizedEmail(email),
        password = password,
        firstName = firstName.trim().ifBlank { null },
        lastName = lastName.trim().ifBlank { null },
        systemLanguage = systemLanguage.ifBlank { null },
        regionalLanguage = regionalLanguage.trim().ifBlank { null },
        phoneNumber = if (hasPhone) CountryCatalog.dialCode(countryIso).orEmpty() + digits else null,
        phoneCountryCode = if (hasPhone) countryIso else null,
    )
}
