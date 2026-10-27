package me.meeshy.app.auth

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.ProvenSessionOpener
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.auth.EmailProof
import me.meeshy.sdk.model.auth.EmailProvenSession
import me.meeshy.sdk.model.auth.LinkSignInConfirmationContent
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.ProvenOpenResult
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

data class MagicLinkValidateUiState(
    val isValidating: Boolean = true,
    val isAuthenticated: Boolean = false,
    val errorMessage: String? = null,
    /** #10872 : le lien n'a pas été demandé par cet appareil — la question « Se connecter en tant que @x ? » attend un oui. */
    val confirmation: LinkSignInConfirmationContent? = null,
    /** Le « oui » est parti : la preuve est rejouée, le second appui est sans effet. */
    val isConfirming: Boolean = false,
    /** L'utilisateur a refusé : rien n'est ouvert, le jeton n'est pas consommé, l'écran se referme. */
    val declined: Boolean = false,
)

/**
 * Valide le token du magic link des l'arrivee sur l'ecran (miroir de `SignInLinkOpener`, iOS).
 *
 * Un lien que cet appareil n'a PAS demande n'ouvre RIEN sans « oui » (#10872) : la passerelle rend
 * l'identite du compte, sans session et sans consommer le jeton ([LoginOutcome.LinkConfirmationRequired]) ;
 * la feuille nomme ce compte (et celui qui est ouvert), et seul le « oui » rejoue la preuve avec
 * `confirm`. Le meme compte que celui qui est ouvert se confirme seul — rien a usurper.
 *
 * Un lien tape alors qu'un AUTRE compte est ouvert referme celui-ci (teardown caches/sockets/cles) AVANT de
 * poser la session prouvee : `storeSession(B)` par dessus la session A ferait fuiter les caches et le JWT
 * de A dans la session B. Ce n'est fait qu'apres la preuve — un lien invalide ou refuse ne deconnecte personne.
 */
@HiltViewModel
class MagicLinkValidateViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val opener: ProvenSessionOpener,
    private val gate: SessionOpeningGate,
    private val sessionRepository: SessionRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val token: String = savedStateHandle.get<String>(TOKEN_ARG).orEmpty()

    private val _state = MutableStateFlow(MagicLinkValidateUiState())
    val state: StateFlow<MagicLinkValidateUiState> = _state.asStateFlow()

    init {
        validate()
    }

    private fun validate() {
        if (token.isBlank()) {
            _state.update { it.copy(isValidating = false, errorMessage = null) }
            return
        }
        viewModelScope.launch { prove(confirmed = false) }
    }

    /** « Annuler » (ou la feuille glissee) refuse ; « Se connecter » rejoue la preuve confirmee. */
    fun answerConfirmation(accepted: Boolean) {
        val current = _state.value
        if (current.confirmation == null || current.isConfirming || current.declined) return
        if (!accepted) {
            _state.update { it.copy(confirmation = null, declined = true) }
            return
        }
        _state.update { it.copy(isConfirming = true) }
        viewModelScope.launch { prove(confirmed = true) }
    }

    private suspend fun prove(confirmed: Boolean) {
        when (val result = authRepository.verifyMagicLink(token, confirmed = confirmed)) {
            is NetworkResult.Success -> follow(result.data, confirmed)
            is NetworkResult.Failure -> _state.update {
                // Le gateway renvoie parfois un message vide (token expire) :
                // ne garder que le non-blanc, l'ecran a un libelle par defaut.
                it.copy(
                    isValidating = false,
                    isConfirming = false,
                    confirmation = null,
                    errorMessage = result.error.message.takeIf { m -> m.isNotBlank() },
                )
            }
        }
    }

    private suspend fun follow(outcome: LoginOutcome, confirmed: Boolean) {
        when (val proof = EmailProof.served(outcome, receivedAtMs = System.currentTimeMillis())) {
            is EmailProof.Session -> openProven(proof.proven)
            is EmailProof.LinkConfirmation -> if (confirmed) stop() else ask(proof.required)
            is EmailProof.SecondFactor, null -> stop()
        }
    }

    private suspend fun ask(question: LoginOutcome.LinkConfirmationRequired) {
        val signedIn = signedInUser()
        if (signedIn?.id == question.account.id) {
            prove(confirmed = true)
            return
        }
        _state.update {
            it.copy(
                isValidating = false,
                isConfirming = false,
                confirmation = LinkSignInConfirmationContent.of(question, signedIn),
            )
        }
    }

    private fun stop() {
        _state.update { it.copy(isValidating = false, isConfirming = false, confirmation = null) }
    }

    private fun signedInUser(): MeeshyUser? =
        if (authRepository.isAuthenticated) sessionRepository.currentUser.value else null

    /**
     * Le lien ne pose jamais la session lui-même : la preuve passe par le [ProvenSessionOpener]
     * (fenêtre d'adoption, garde de changement de compte), à l'instant où aucune feuille d'accès
     * n'est plus affichée ([SessionOpeningGate]).
     */
    private suspend fun openProven(proven: EmailProvenSession) {
        if (authRepository.isAuthenticated && signedInUser()?.id != proven.userId) {
            authRepository.logout()
        }
        gate.open {
            val opened = opener.open(proven) == ProvenOpenResult.Opened
            _state.update { it.copy(isValidating = false, isConfirming = false, confirmation = null, isAuthenticated = opened) }
        }
    }

    companion object {
        const val TOKEN_ARG: String = "token"
    }
}
