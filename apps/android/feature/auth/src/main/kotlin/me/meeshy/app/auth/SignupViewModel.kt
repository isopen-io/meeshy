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
import me.meeshy.sdk.auth.InMemoryPendingReferralStore
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.auth.PendingReferralStore
import me.meeshy.sdk.auth.RegisterOutcome
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.auth.SignupErrorRouter
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupFieldMessage
import me.meeshy.sdk.model.auth.SignupFieldIssue
import me.meeshy.sdk.model.auth.SignupFieldMessages
import me.meeshy.sdk.model.auth.SignupCardStage
import me.meeshy.sdk.model.auth.SignupPhase
import me.meeshy.sdk.model.auth.SignupPrimaryAction
import me.meeshy.sdk.model.auth.RegistrationIdentity
import me.meeshy.sdk.model.auth.LoginEmailCandidate
import me.meeshy.sdk.model.auth.SignupFieldValidation
import me.meeshy.sdk.model.auth.SignupForm
import me.meeshy.sdk.model.auth.SignupPhoneRefusal
import me.meeshy.sdk.model.auth.SignupPhases
import me.meeshy.sdk.model.auth.SignupProgress
import me.meeshy.sdk.model.auth.SignupRefusal
import me.meeshy.sdk.model.auth.SignupSubmitError
import me.meeshy.sdk.model.auth.SignupValidation
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.notification.PushPermissionDeferralStore
import me.meeshy.sdk.socket.RealtimeSessionCoordinator
import javax.inject.Inject

/**
 * L'état de l'écran d'inscription — la saisie, le vol en cours, et le refus.
 *
 * Aucune décision n'est prise ici : le verdict local, le bouton et le message de
 * chaque champ sont des PROJECTIONS des cœurs purs ([SignupForm],
 * [SignupFieldMessages]). L'état ne porte que ce qui ne se déduit pas — ce que
 * l'utilisateur a tapé et ce que le serveur a répondu.
 */
data class SignupUiState(
    val form: SignupForm,
    val isSubmitting: Boolean = false,
    val isRegistered: Boolean = false,
    val submitError: SignupSubmitError? = null,
    /** Ce qui est PARU — monotone : une phase apparue ne disparaît jamais. */
    val progress: SignupProgress = SignupProgress.INITIAL,
    /** Le refus du numéro se dit : champ quitté avec une saisie, ou envoi tenté. */
    val phoneChecked: Boolean = false,
    /** Le mot de passe facultatif est paru (identité définie) et ne se referme plus. */
    val passwordRevealed: Boolean = false,
    /** Le nom affiché a été touché : sinon il SUIT l'adresse en direct. */
    val displayNameEdited: Boolean = false,
) {
    /** Les refus locaux qu'on AFFICHE — un champ encore vide n'en porte aucun. */
    val validation: SignupValidation get() = form.visibleValidation()

    /** La phase courante (téléphone, adresse, carte) — loi `SignupPhases`. */
    val phase: SignupPhase get() = SignupPhases.phase(progress, SignupCardStage.Editing)

    /** Le bouton est actif dès la carte et un formulaire prêt ; aucune attente réseau n'y entre. */
    val canSubmit: Boolean
        get() = SignupPhases.primaryAction(progress, SignupCardStage.Editing, form.canSubmitPhased && !isSubmitting)
            .let { it is SignupPrimaryAction.SignUp && it.enabled }

    /** Le refus qu'aucun champ ne porte — rendu au-dessus du bouton. */
    val globalError: SignupSubmitError?
        get() = submitError?.takeIf { it !is SignupSubmitError.Field }

    /** Le texte du champ du nom : la frappe (même vidée) s'il a été touché, la dérivation sinon. */
    val displayNameInput: String get() = if (displayNameEdited) form.displayName else form.effectiveDisplayName

    /** Le texte du champ du pseudo : la frappe (même vidée) s'il a été touché, la dérivation sinon. */
    val usernameInput: String get() = form.username ?: form.effectiveUsername

    /** Le filigrane du nom vidé : la dérivation de l'adresse, celle qui part alors (iOS `placeholder: effectiveDisplayName`). */
    val displayNamePlaceholder: String get() = form.derivedDisplayName

    /** Le filigrane du pseudo vidé : la dérivation de l'adresse, celle qui part alors (iOS `placeholder: effectiveUsername`). */
    val usernamePlaceholder: String get() = form.derivedUsername

    /** Le nom que la carte MONTRE — texte, ou filigrane quand le champ est blanc — c'est celui qui part. */
    val shownDisplayName: String get() = form.effectiveDisplayName

    /** Le pseudo que la carte MONTRE — texte, ou filigrane quand le champ est blanc — c'est celui qui part. */
    val shownUsername: String get() = form.effectiveUsername

    /** Les pseudos LIBRES que la passerelle propose quand le pseudo envoyé est pris. */
    val usernameSuggestions: List<String>
        get() = (submitError as? SignupSubmitError.Field)
            ?.takeIf { it.refusal == SignupRefusal.NAME_TAKEN }
            ?.suggestions
            .orEmpty()

    /** Le refus du numéro à dire sous le champ, ou `null` : jamais pendant la première frappe. */
    val shownPhoneRefusal: SignupPhoneRefusal?
        get() = form.phoneRefusal?.takeIf { SignupPhases.phoneRefusalShown(true, phoneChecked, progress) }

    /** Le refus EN DIRECT du pseudo qui partira, ou `null`. */
    val usernameRefusal: RegistrationIdentity.UsernameRefusal? get() = form.usernameRefusal

    /** Le nom affiché saisi mais trop court : le cas où le minimum se DIT sous le champ. */
    val displayNameTooShort: Boolean
        get() = displayNameEdited && RegistrationIdentity.isNameTooShort(form.displayName)

    /** Le message que [field] affiche sous lui, refus serveur d'abord. */
    fun messageFor(field: SignupField): SignupFieldMessage? {
        val refused = SignupFieldMessages.resolve(field, SignupValidation(), submitError)
        if (refused != null) return refused
        return when (field) {
            SignupField.PHONE -> shownPhoneRefusal.localIssue()?.let { SignupFieldMessage.Local(it) }
            SignupField.EMAIL -> null
            else -> SignupFieldMessages.resolve(field, validation, null)
        }
    }

    /** Le numéro est REQUIS et refusé pour absence : le message dédié, distinct d'un refus local. */
    val phoneRequiredShown: Boolean
        get() = shownPhoneRefusal == SignupPhoneRefusal.Missing && messageFor(SignupField.PHONE) == null

    private fun SignupPhoneRefusal?.localIssue(): SignupFieldIssue? = when (this) {
        null, SignupPhoneRefusal.Missing -> null
        is SignupPhoneRefusal.Implausible -> validation.phone
    }
}

/**
 * L'inscription en UN écran, sans délai ni vérification préalable.
 *
 * Ce qui a disparu par rapport au wizard en huit étapes n'est pas une
 * simplification de code, c'est une suppression d'ATTENTE : plus de sonde de
 * disponibilité déclenchée une seconde après la frappe, donc plus de bouton qui
 * reste gris alors que la saisie est finie ; plus de verdict serveur à franchir
 * pour atteindre le champ suivant ; et plus de refus découvert à la huitième
 * étape pour une valeur saisie à la première. Le seul appel réseau de l'écran
 * est l'envoi.
 *
 * Chaque refus revient TYPÉ et se pose sous son champ ([SignupErrorRouter]) —
 * y compris le conflit de numéro, que la passerelle sert sous un `200` sans
 * avoir créé de compte.
 */
@HiltViewModel
class SignupViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val realtimeCoordinator: RealtimeSessionCoordinator,
    deviceLocaleProvider: DeviceLocaleProvider,
    private val pushPermissionDeferral: PushPermissionDeferralStore,
    private val referrals: PendingReferralStore = InMemoryPendingReferralStore(),
    private val loginHandoffs: LoginHandoffs = LoginHandoffs(),
) : ViewModel() {

    private val _state = MutableStateFlow(
        SignupUiState(
            form = SignupForm.defaults(
                deviceLanguage = deviceLocaleProvider.languageTag(),
                deviceRegion = deviceLocaleProvider.regionTag(),
                supportedLanguageCodes = LanguageStepSelection.pickerLanguages.map { it.code }.toSet(),
                knownCountryCodes = CountryCatalog.dialCodes.keys,
            ),
        ),
    )
    val state: StateFlow<SignupUiState> = _state.asStateFlow()

    fun onDisplayNameChange(value: String) {
        editForm { it.copy(displayName = value) }
        _state.update { it.copy(displayNameEdited = true) }
    }

    /** Le pseudo tapé ; l'arobase de tête, que l'écran montre déjà, n'en fait pas partie. */
    fun onUsernameChange(value: String) = editForm { it.copy(username = value.trimStart('@')) }

    /** Une suggestion de pseudo libre : elle remplace la saisie refusée. */
    fun onUsernameSuggestionPicked(candidate: String) = onUsernameChange(candidate)

    /** Le champ du numéro est quitté : une saisie implausible dit désormais son refus. */
    fun onPhoneFieldLeft() {
        if (!_state.value.form.hasPhone) return
        _state.update { it.copy(phoneChecked = true) }
    }

    /**
     * « Se connecter » depuis le pied de page : l'adresse COMPLÈTE déjà tapée part à la
     * connexion (une seule fois), un début de saisie jamais.
     */
    fun onSwitchToLogin() {
        loginHandoffs.signupEmail.hold(LoginEmailCandidate.from(_state.value.form.email).takeIf { it.isNotEmpty() })
    }

    fun onEmailChange(value: String) = editForm { it.copy(email = value) }

    /**
     * Point d'étranglement unique du champ téléphone : le champ est piloté par
     * l'état, donc la valeur épurée par [SignupForm.withPhoneEntry] revient au
     * champ lui-même — frappe, collage et remplissage automatique passent tous
     * par là, et un numéro collé au format international y perd l'indicatif
     * qu'il porte déjà, au profit du bouton pays.
     */
    fun onPhoneEntryChange(value: String) = editForm { it.withPhoneEntry(value) }

    fun onDialCountryChange(iso: String) = editForm { it.copy(dialCountryIso = iso) }

    fun onPasswordChange(value: String) = editForm { it.copy(password = value) }

    /**
     * La langue de lecture (rang 1 du Prisme). La langue régionale, déduite de
     * la région à l'ouverture, n'est pas montrée et ne bouge pas : elle voyage
     * telle quelle, et [SignupForm.toRegisterRequest] l'omet si elle finit
     * identique à celle-ci.
     */
    fun onSystemLanguageChange(code: String) = editForm { it.copy(systemLanguage = code) }

    /**
     * Envoie la charge. Un seul vol à la fois ; un formulaire invalide n'appelle
     * rien (le bouton est déjà inactif, ceci garde l'invariant si l'appel vient
     * d'ailleurs — clavier, test, accessibilité).
     */
    fun register() {
        val current = _state.value
        if (current.isSubmitting) return
        if (!current.canSubmit) {
            _state.update { it.copy(phoneChecked = true) }
            return
        }
        _state.update { it.copy(isSubmitting = true, submitError = null) }
        val request = current.form.toPhasedRegisterRequest(referralCode = referrals.recall())
        viewModelScope.launch {
            when (val result = authRepository.register(request)) {
                is NetworkResult.Success -> applyOutcome(result.data)
                is NetworkResult.Failure -> _state.update {
                    it.copy(
                        isSubmitting = false,
                        submitError = SignupErrorRouter.route(
                            code = result.error.code,
                            fieldName = result.error.fieldName,
                            message = result.error.message,
                            violations = result.error.violations,
                            suggestions = result.error.suggestions,
                        ),
                    )
                }
            }
        }
    }

    /**
     * Le temps réel ne s'ouvre que sur un compte RÉELLEMENT créé — un conflit de
     * numéro arrive sous le même `200` sans qu'aucun compte existe, et brancher
     * les sockets dessus ouvrirait une session sur personne.
     */
    private suspend fun applyOutcome(outcome: RegisterOutcome) {
        when (outcome) {
            is RegisterOutcome.Created -> {
                referrals.forget()
                pushPermissionDeferral.postpone()
                realtimeCoordinator.onAuthenticatedChanged(true)
                _state.update { it.copy(isSubmitting = false, isRegistered = true) }
            }
            RegisterOutcome.PhoneOwnershipConflict -> _state.update {
                it.copy(isSubmitting = false, submitError = SignupErrorRouter.phoneOwnershipConflict)
            }
        }
    }

    /**
     * Toute modification efface le refus serveur : il porte sur la charge
     * PRÉCÉDENTE, et laisser « cette adresse est déjà prise » sous un champ que
     * l'utilisateur vient de corriger, c'est lui dire non deux fois pour une
     * seule faute. Le verdict local reprend alors la main.
     */
    private fun editForm(transform: (SignupForm) -> SignupForm) {
        _state.update { current ->
            val form = transform(current.form)
            val progress = current.progress.advanced(
                phoneGiven = form.isPhoneValid,
                emailValid = SignupFieldValidation.isEmailValidLocally(form.email.trim()),
            )
            current.copy(
                form = form,
                submitError = null,
                progress = progress,
                passwordRevealed = SignupPhases.passwordRevealed(current.passwordRevealed, form.isIdentityDefined),
            )
        }
    }
}
