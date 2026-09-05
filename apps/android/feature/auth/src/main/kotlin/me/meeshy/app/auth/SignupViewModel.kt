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
import me.meeshy.sdk.auth.RegisterOutcome
import me.meeshy.sdk.locale.DeviceLocaleProvider
import me.meeshy.sdk.model.auth.CountryCatalog
import me.meeshy.sdk.model.auth.LanguageStepSelection
import me.meeshy.sdk.model.auth.SignupErrorRouter
import me.meeshy.sdk.model.auth.SignupField
import me.meeshy.sdk.model.auth.SignupFieldMessage
import me.meeshy.sdk.model.auth.SignupFieldMessages
import me.meeshy.sdk.model.auth.SignupForm
import me.meeshy.sdk.model.auth.SignupSubmitError
import me.meeshy.sdk.model.auth.SignupValidation
import me.meeshy.sdk.net.NetworkResult
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
) {
    /** Les refus locaux qu'on AFFICHE — un champ encore vide n'en porte aucun. */
    val validation: SignupValidation get() = form.visibleValidation()

    /**
     * « Créer mon compte » s'allume dès que nom, e-mail et mot de passe sont
     * valides. Rien d'autre ne le retient : aucune sonde de disponibilité, aucun
     * délai, aucun verdict serveur à attendre.
     */
    val canSubmit: Boolean get() = form.canSubmit && !isSubmitting

    /** Le refus qu'aucun champ ne porte — rendu au-dessus du bouton. */
    val globalError: SignupSubmitError?
        get() = submitError?.takeIf { it !is SignupSubmitError.Field }

    /** Le message que [field] affiche sous lui, refus serveur d'abord. */
    fun messageFor(field: SignupField): SignupFieldMessage? =
        SignupFieldMessages.resolve(field, validation, submitError)
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

    fun onDisplayNameChange(value: String) = editForm { it.copy(displayName = value) }

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
        if (!current.form.canSubmit || current.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, submitError = null) }
        val request = current.form.toRegisterRequest()
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
    private fun applyOutcome(outcome: RegisterOutcome) {
        when (outcome) {
            is RegisterOutcome.Created -> {
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
        _state.update { it.copy(form = transform(it.form), submitError = null) }
    }
}
