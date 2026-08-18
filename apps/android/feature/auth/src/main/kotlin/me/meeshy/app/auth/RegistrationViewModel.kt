package me.meeshy.app.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
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
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.media.MediaRepository
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.ImageUploadValidation
import me.meeshy.sdk.model.ImageUploadValidator
import me.meeshy.sdk.model.AvatarBannerUpload
import me.meeshy.sdk.model.RegisterRequest
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.model.auth.AvailabilityIntent
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.LanguageSelectionState
import me.meeshy.sdk.model.auth.LanguageStepSelection
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
import me.meeshy.sdk.model.auth.SignupRegionInference
import me.meeshy.sdk.model.auth.StepFill
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import me.meeshy.sdk.user.UserRepository
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
    /**
     * The PROFILE step's picked avatar/banner, already read into bytes at pick
     * time (mirrors iOS `RegistrationViewModel.profileImage`/`bannerImage`,
     * `@Published UIImage?`). Kept outside [fields] — like the images, unlike
     * [RegistrationFields.bio] — because nothing in [RegistrationStepGate] or
     * [RegistrationSummary] ever reads them; they only feed the post-registration
     * best-effort upload in [RegistrationViewModel.register].
     */
    val profileImage: MediaUploadItem? = null,
    val bannerImage: MediaUploadItem? = null,
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
     * The recap card's rows — [RegistrationSummary] over the fields already
     * collected, reused verbatim by both the PROFILE step's own preview card and
     * the RECAP step (iOS reuses the same `summaryItems` for both
     * `StepProfileView` and `StepRecapView`). The bio row appears the moment
     * [RegistrationFields.bio] is non-blank, regardless of which step set it.
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
                bio = fields.bio,
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
    private val mediaRepository: MediaRepository,
    private val userRepository: UserRepository,
    private val workManager: WorkManager,
    private val deviceLocaleProvider: DeviceLocaleProvider,
) : ViewModel() {

    private val _state = MutableStateFlow(RegistrationUiState())
    val state: StateFlow<RegistrationUiState> = _state.asStateFlow()

    private val usernameInput = MutableStateFlow("")
    private val emailInput = MutableStateFlow("")
    private val phoneInput = MutableStateFlow("")

    init {
        applyDeviceLocaleDefaults()
        launchProbe(usernameInput, SignupAvailabilityPolicy::usernameIntent, ::onUsernameAvailability) {
            // Sets both the verdict and its accompanying suggestions from the one round-trip
            // (mirrors iOS `checkUsernameAvailability`, which assigns `usernameAvailable` and
            // `usernameSuggestions` from the same response) — the shared `launchProbe` plumbing
            // only carries the verdict back to `apply`, so the suggestions ride along as a
            // side effect of this probe closure instead of a second channel.
            val result = authRepository.checkAvailability(username = it).getOrNull()
            onUsernameSuggestions(result?.suggestions.orEmpty())
            result?.usernameAvailable
        }
        launchProbe(emailInput, SignupAvailabilityPolicy::emailIntent, ::onEmailAvailability) {
            authRepository.checkAvailability(email = it).getOrNull()?.emailAvailable
        }
        launchProbe(phoneInput, SignupAvailabilityPolicy::phoneIntent, ::onPhoneAvailability) { digits ->
            val dialCode = CountryCatalog.dialCode(_state.value.fields.countryIso).orEmpty()
            authRepository.checkAvailability(phoneNumber = dialCode + digits).getOrNull()?.phoneNumberAvailable
        }
    }

    /**
     * iOS `init()` → `detectCountry()` + `detectLanguages()`: pre-selects the LANGUAGE step's
     * system/regional pair and the PHONE step's country from the device locale, via the pure
     * [SignupRegionInference] core. [deviceLocaleProvider] supplies the two raw, `Locale`-free
     * inputs the core needs; this method owns nothing but applying its result to [_state].
     *
     * The country only overrides [RegistrationFields]'s static default
     * (`CountryCatalog.priority.first()`) when the device region resolves to a known one — mirrors
     * iOS `detectCountry()`, which leaves `selectedCountry` at its `countries[0]` default on a
     * `nil`/unmatched region rather than clearing it.
     */
    private fun applyDeviceLocaleDefaults() {
        val supportedLanguages = LanguageStepSelection.pickerLanguages.map { it.code }.toSet()
        val languages = SignupRegionInference.inferLanguages(
            deviceLanguage = deviceLocaleProvider.languageTag(),
            deviceRegion = deviceLocaleProvider.regionTag(),
            supportedLanguageCodes = supportedLanguages,
        )
        val countryIso = SignupRegionInference.inferCountryIso(
            deviceRegion = deviceLocaleProvider.regionTag(),
            knownCountryCodes = CountryCatalog.dialCodes.keys,
        )
        updateFields {
            it.copy(
                systemLanguage = languages.systemLanguage,
                regionalLanguage = languages.regionalLanguage,
                countryIso = countryIso ?: it.countryIso,
            )
        }
    }

    fun onUsernameChange(value: String) {
        // Point d'étranglement unique : le champ Compose est piloté par l'état, donc
        // filtrer ici renvoie la valeur épurée au `OutlinedTextField` — frappe et
        // collage passent tous deux par là.
        val sanitized = SignupFieldValidation.sanitizedUsername(value)
        usernameInput.value = sanitized
        editFields { it.copy(username = sanitized, usernameAvailable = null, usernameSuggestions = emptyList()) }
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

    /** The PROFILE step's optional bio text — see [RegistrationUiState.summary]. */
    fun onBioChange(value: String) = editFields { it.copy(bio = value) }

    /** The PROFILE step's avatar picker — `null` when the user has not picked one. */
    fun onProfileImagePicked(item: MediaUploadItem?) = _state.update { it.copy(profileImage = item) }

    /** The PROFILE step's banner picker — `null` when the user has not picked one. */
    fun onBannerImagePicked(item: MediaUploadItem?) = _state.update { it.copy(bannerImage = item) }

    /**
     * Network-probe seam: the availability layer reports the username verdict.
     * A background verdict must NOT clear a surfaced [RegistrationUiState.errorMessage]
     * (only a user field edit does), so this goes through [updateFields], not [editFields].
     */
    fun onUsernameAvailability(available: Boolean?) = updateFields { it.copy(usernameAvailable = available) }

    fun onEmailAvailability(available: Boolean?) = updateFields { it.copy(emailAvailable = available) }

    fun onPhoneAvailability(available: Boolean?) = updateFields { it.copy(phoneAvailable = available) }

    /**
     * Network-probe seam: the availability layer reports the alternate handles the
     * server offered alongside a taken-username verdict (iOS `usernameSuggestions`).
     * Same [updateFields] rationale as [onUsernameAvailability] — a background verdict
     * must not clear a surfaced [RegistrationUiState.errorMessage].
     */
    fun onUsernameSuggestions(suggestions: List<String>) = updateFields { it.copy(usernameSuggestions = suggestions) }

    /**
     * The PSEUDO step's suggestion-strip tap (iOS `RegistrationViewModel.selectSuggestion`):
     * adopts a server-offered handle as the username. The server already confirmed this
     * exact value is available when it offered it, so this optimistically marks
     * [RegistrationFields.usernameAvailable] `true` immediately — mirroring iOS, which does
     * the same — rather than waiting a full debounce window to re-confirm a verdict already
     * known. [usernameInput] is updated too so a later edit's `distinctUntilChanged` compares
     * against this value, not the stale one the user typed before tapping a suggestion.
     */
    fun selectUsernameSuggestion(suggestion: String) {
        usernameInput.value = suggestion
        editFields { it.copy(username = suggestion, usernameAvailable = true, usernameSuggestions = emptyList()) }
    }

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
            if (result is NetworkResult.Success) {
                realtimeCoordinator.onAuthenticatedChanged(true)
                uploadProfileCompletionAssets(current.profileImage, current.bannerImage, fields.bio)
            }
            _state.update {
                when (result) {
                    is NetworkResult.Success -> it.copy(isSubmitting = false, isRegistered = true)
                    is NetworkResult.Failure -> it.copy(isSubmitting = false, errorMessage = result.error.message)
                }
            }
        }
    }

    /**
     * Best-effort post-registration upload of the PROFILE step's optional assets
     * — port of iOS `OnboardingFlowView.uploadProfileCompletionAssets` +
     * `ProfileCompletionUploader`. `POST /auth/register` carries none of these
     * (avatar/banner/bio aren't [RegisterRequest] fields — verified against iOS's
     * own `register()`), so they can only be sent once authenticated, i.e. right
     * after [authRepository]'s register call above resolves successfully (by
     * which point [AuthRepository.storeSession] has already adopted the session,
     * so [mediaRepository]/[userRepository] calls are authenticated).
     *
     * Each asset fails independently and silently: registration has already
     * succeeded, and the user can complete their profile later from Settings/
     * Profile, which already own this exact avatar/banner validate -> upload ->
     * confirm pipeline ([me.meeshy.app.profile.AvatarBannerUploadViewModel]) —
     * not called directly here since that ViewModel is scoped to the profile
     * screen's own UI state (uploading/error), which this fire-and-forget call
     * has no use for. The bio goes through [UserRepository.enqueueProfileEdit],
     * the same optimistic + offline-durable path `SettingsViewModel`/
     * `ProfileViewModel` already use, waking [OutboxFlushWorker] on a successful
     * enqueue so it is not left waiting for an unrelated network edge (`NOTES.md`
     * "a persistent queue must not wake only on a network edge").
     *
     * Awaited inline (unlike iOS's detached `Task`) rather than launched as a
     * sibling coroutine: [viewModelScope] is cancelled the moment this screen's
     * nav destination is popped, which [RegistrationScreen] does immediately on
     * `isRegistered` flipping true — a detached-looking `launch` here would race
     * that teardown and could silently drop a picked photo. Awaiting first means
     * the upload always finishes (or is caught) before `isRegistered` flips,
     * trading iOS's slightly earlier UI handoff for never losing the asset.
     */
    private suspend fun uploadProfileCompletionAssets(
        profileImage: MediaUploadItem?,
        bannerImage: MediaUploadItem?,
        bio: String,
    ) {
        try {
            profileImage?.let { uploadAndApply(ImageUploadTarget.AVATAR, it) }
            bannerImage?.let { uploadAndApply(ImageUploadTarget.BANNER, it) }
            val trimmedBio = bio.trim()
            if (trimmedBio.isNotEmpty()) {
                val cmid = userRepository.enqueueProfileEdit(UpdateProfileRequest(bio = trimmedBio))
                if (cmid != null) workManager.enqueue(OutboxFlushWorker.buildRequest())
            }
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // Best-effort — see kdoc above.
        }
    }

    /** Validate -> upload -> confirm for one avatar/banner pick, reusing the exact pure cores [AvatarBannerUploadViewModel] uses. */
    private suspend fun uploadAndApply(target: ImageUploadTarget, item: MediaUploadItem) {
        val validation = ImageUploadValidator.validate(target, item.bytes.size, item.mimeType)
        if (validation !is ImageUploadValidation.Accepted) return
        val uploaded = (mediaRepository.upload(listOf(item)) as? NetworkResult.Success)?.data ?: return
        val url = AvatarBannerUpload.firstUploadedUrl(uploaded) ?: return
        when (target) {
            ImageUploadTarget.AVATAR -> userRepository.updateAvatar(url)
            ImageUploadTarget.BANNER -> userRepository.updateBanner(url)
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
