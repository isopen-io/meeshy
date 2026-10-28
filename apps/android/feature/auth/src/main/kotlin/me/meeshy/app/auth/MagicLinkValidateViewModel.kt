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
import me.meeshy.sdk.model.auth.EmailVerificationRequest
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
    /** Le lien prouvé ouvre un AUTRE compte que celui qui est ouvert : « Ouvrir un autre compte ? » attend une réponse. */
    val replacement: AccountReplacementQuestion? = null,
)

/** La question posée avant qu'un lien ne remplace le compte ouvert (iOS `AccountReplacementAlert`, #10445). */
data class AccountReplacementQuestion(val incomingLabel: String, val currentLabel: String?)

/**
 * Valide le lien de connexion recu par e-mail des l'arrivee sur l'ecran (miroir de `SignInLinkOpener`, iOS) : le
 * lien de connexion (`token`) ou le lien de l'e-mail « code + lien » qui PROUVE l'adresse (`token` + `email`,
 * #8035) et ouvre la session. Meme sequence pour les deux : prouver, confirmer, refermer, ouvrir.
 *
 * Le jeton (et l'adresse) sont lus UNE fois de l'argument de navigation puis RETIRES de l'etat sauvegarde : ils ne
 * survivent pas a une restauration, et ne sont jamais journalises.
 *
 * Un lien dont la preuve ouvre un AUTRE compte que celui qui est ouvert, sans que l'utilisateur ait deja dit « oui »
 * a la question « Se connecter en tant que @x ? », demande « Ouvrir un autre compte ? » : refuser referme la session
 * prouvee cote passerelle et ne deconnecte personne (#10445).
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

    private val token: String = savedStateHandle.remove<String>(TOKEN_ARG).orEmpty()

    /** La route de verification d'adresse porte `email` ; celle du lien de connexion ne le porte pas du tout. */
    private val isVerificationLink: Boolean = savedStateHandle.contains(EMAIL_ARG)

    private val email: String? = savedStateHandle.remove<String>(EMAIL_ARG)?.takeIf { it.isNotBlank() }

    /** La session prouvee, tenue en memoire le temps de la question « Ouvrir un autre compte ? ». */
    private var provenAwaitingReplacement: EmailProvenSession? = null

    private val _state = MutableStateFlow(MagicLinkValidateUiState())
    val state: StateFlow<MagicLinkValidateUiState> = _state.asStateFlow()

    init {
        validate()
    }

    private fun validate() {
        if (token.isBlank() || (isVerificationLink && email == null)) {
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
        val proof = if (isVerificationLink) {
            authRepository.confirmEmail(EmailVerificationRequest.link(token, email.orEmpty(), confirmed))
        } else {
            authRepository.verifyMagicLink(token, confirmed = confirmed)
        }
        when (val result = proof) {
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
            is EmailProof.Session -> openProven(proof.proven, consented = confirmed)
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
     *
     * Un compte différent de celui qui est ouvert ne le remplace qu'après un « oui » explicite : celui de la question
     * « Se connecter en tant que @x ? » ([consented]), sinon celui de « Ouvrir un autre compte ? ».
     */
    private suspend fun openProven(proven: EmailProvenSession, consented: Boolean) {
        val signedIn = signedInUser()
        if (signedIn != null && signedIn.id != proven.userId && !consented) {
            provenAwaitingReplacement = proven
            _state.update {
                it.copy(
                    isValidating = false,
                    isConfirming = false,
                    confirmation = null,
                    replacement = AccountReplacementQuestion(
                        incomingLabel = LinkSignInConfirmationContent.accountLabel(proven.session.user.displayName, proven.session.user.username),
                        currentLabel = signedIn.username.takeIf { name -> name.isNotEmpty() }
                            ?.let { name -> LinkSignInConfirmationContent.accountLabel(signedIn.displayName, name) },
                    ),
                )
            }
            return
        }
        install(proven, replacing = signedIn != null && signedIn.id != proven.userId)
    }

    /** « Ouvrir ce compte » installe la session prouvee ; « Annuler » la referme cote passerelle, sans toucher au compte ouvert. */
    fun answerReplacement(accepted: Boolean) {
        val proven = provenAwaitingReplacement ?: return
        provenAwaitingReplacement = null
        _state.update { it.copy(replacement = null, isValidating = accepted) }
        viewModelScope.launch {
            if (accepted) {
                install(proven, replacing = true)
            } else {
                opener.discard(proven)
                _state.update { it.copy(isValidating = false, declined = true) }
            }
        }
    }

    private suspend fun install(proven: EmailProvenSession, replacing: Boolean) {
        if (replacing) authRepository.logout()
        gate.open {
            val opened = opener.open(proven) == ProvenOpenResult.Opened
            _state.update { it.copy(isValidating = false, isConfirming = false, confirmation = null, isAuthenticated = opened) }
        }
    }

    companion object {
        const val TOKEN_ARG: String = "token"
        const val EMAIL_ARG: String = "email"
    }
}
