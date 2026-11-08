package me.meeshy.app.auth

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.ArrivalCelebrating
import me.meeshy.sdk.auth.AuthRepository
import me.meeshy.sdk.auth.LoginHandoffs
import me.meeshy.sdk.auth.ProvenSessionOpener
import me.meeshy.sdk.model.auth.EmailCodeDispatch
import me.meeshy.sdk.model.auth.EmailProof
import me.meeshy.sdk.model.auth.EmailProvenSession
import me.meeshy.sdk.model.auth.LoginOutcome
import me.meeshy.sdk.model.auth.MagicLinkCountdown
import me.meeshy.sdk.model.auth.MagicLinkEmail
import me.meeshy.sdk.model.auth.ProvenOpenResult
import me.meeshy.sdk.model.auth.SentEmailCode
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

@Immutable
data class MagicLinkUiState(
    val email: String = "",
    val isSubmitting: Boolean = false,
    val errorMessage: String? = null,
    /** L'adresse à laquelle le code et le lien SONT partis ; `null` tant que rien n'est parti (l'étape de saisie). */
    val sentTo: String? = null,
    val countdown: MagicLinkCountdown? = null,
    /** Le jeton d'attente de CET envoi : la saisie du code surveille avec lui une preuve faite ailleurs. */
    val pendingSessionToken: String? = null,
    /** Un par envoi (ou reprise) : la saisie du code repart de zéro à chaque nouvel envoi. */
    val dispatchCount: Int = 0,
) {
    val isWaiting: Boolean get() = sentTo != null
    val canSend: Boolean get() = !isSubmitting && MagicLinkEmail.isValid(email.trim())
    val canResend: Boolean get() = countdown?.canResend(isSubmitting) == true
}

sealed interface MagicLinkEvent {
    data class EmailChanged(val value: String) : MagicLinkEvent

    /** « Recevoir le lien » et « Renvoyer » : la même demande. */
    data object Send : MagicLinkEvent

    /** « Annuler » de l'attente : retour à la saisie de l'adresse. */
    data object Cancel : MagicLinkEvent

    /** Le code saisi a prouvé l'adresse : la session s'ouvre une fois la feuille refermée. */
    data class CodeVerified(val outcome: LoginOutcome, val onSessionOpened: () -> Unit) : MagicLinkEvent
}

sealed interface MagicLinkEffect {
    /** La feuille se referme ; la session, si elle doit s'ouvrir, s'ouvre alors ([SessionOpeningGate]). */
    data object Close : MagicLinkEffect

    /** Le code a ouvert un défi de second facteur : la connexion le suit. */
    data class SecondFactor(val outcome: LoginOutcome) : MagicLinkEffect
}

/**
 * La connexion par e-mail (iOS `MagicLinkView`) : la demande envoie un code ET un lien ([AuthRepository.requestEmailCode]),
 * liés à CET appareil par l'empreinte d'un secret qui reste au coffre ; l'attente décompte la validité
 * ([MagicLinkCountdown], transitions pures) jusqu'à l'expiration, où le renvoi se débloque. Le code saisi ouvre la
 * session comme le lien : la preuve passe par le [ProvenSessionOpener], à l'instant où la feuille est refermée.
 *
 * Une demande déjà faite par l'inscription ([LoginHandoffs.sentEmailCode]) est reprise : l'écran s'ouvre sur son attente.
 */
@HiltViewModel
class MagicLinkViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    loginHandoffs: LoginHandoffs,
    private val opener: ProvenSessionOpener,
    private val gate: SessionOpeningGate,
    private val arrival: ArrivalCelebrating,
) : ViewModel() {

    /** L'adresse tapée dans l'identifiant de la connexion l'attend ici (iOS `MagicLinkView(prefilledEmail:)`). */
    private val _state = MutableStateFlow(MagicLinkUiState(email = loginHandoffs.recoveryEmail.take().orEmpty()))
    val state: StateFlow<MagicLinkUiState> = _state.asStateFlow()

    private val effects = Channel<MagicLinkEffect>(Channel.BUFFERED)
    val effect = effects.receiveAsFlow()

    /** Un lien reçu de l'extérieur pendant la feuille demande à l'hôte de la refermer ([SessionOpeningGate]). */
    val dismissalRequested: StateFlow<Boolean> = gate.dismissalRequested

    private var tickJob: Job? = null

    init {
        loginHandoffs.sentEmailCode.take()?.let(::adoptAlreadySent)
    }

    fun onEvent(event: MagicLinkEvent) {
        when (event) {
            is MagicLinkEvent.EmailChanged -> _state.update { it.copy(email = event.value, errorMessage = null) }
            MagicLinkEvent.Send -> send()
            MagicLinkEvent.Cancel -> cancel()
            is MagicLinkEvent.CodeVerified -> follow(event)
        }
    }

    /** La feuille est affichée : une session prouvée attend qu'elle soit refermée pour s'ouvrir. */
    fun presentationBegan() = gate.presentationBegan()

    /** La feuille est refermée : l'ouverture en attente s'exécute. */
    fun presentationEnded() = gate.presentationEnded()

    /** L'envoi que l'inscription a DÉJÀ fait : l'écran s'ouvre sur l'attente (iOS `adoptAlreadySent`). Une seule fois. */
    fun adoptAlreadySent(sent: SentEmailCode) {
        if (_state.value.isWaiting) return
        _state.update { it.copy(email = sent.email) }
        enterWaiting(sent.email, sent.dispatch)
    }

    private fun send() {
        val email = _state.value.email.trim()
        val current = _state.value
        if (current.isSubmitting) return
        if (current.isWaiting) {
            if (!current.canResend) return
        } else if (!current.canSend) {
            return
        }
        _state.update { it.copy(isSubmitting = true, errorMessage = null) }
        viewModelScope.launch {
            when (val result = authRepository.requestEmailCode(email)) {
                is NetworkResult.Success -> enterWaiting(email, result.data)
                is NetworkResult.Failure -> _state.update {
                    it.copy(isSubmitting = false, errorMessage = result.error.message)
                }
            }
        }
    }

    /** L'attente d'UN envoi — le sien ou celui de l'inscription : son jeton d'attente, son compte à rebours. */
    private fun enterWaiting(email: String, dispatch: EmailCodeDispatch) {
        _state.update {
            it.copy(
                isSubmitting = false,
                errorMessage = null,
                sentTo = email,
                countdown = MagicLinkCountdown.start(dispatch.expiresInSeconds),
                pendingSessionToken = dispatch.pendingSessionToken,
                dispatchCount = it.dispatchCount + 1,
            )
        }
        startTicking()
    }

    private fun cancel() {
        tickJob?.cancel()
        _state.update { it.copy(sentTo = null, countdown = null, pendingSessionToken = null, errorMessage = null, isSubmitting = false) }
    }

    private fun follow(event: MagicLinkEvent.CodeVerified) {
        when (val proof = EmailProof.served(event.outcome, receivedAtMs = System.currentTimeMillis())) {
            is EmailProof.Session -> {
                tickJob?.cancel()
                gate.openWhenDismissed { open(proof.proven, event.onSessionOpened) }
                effects.trySend(MagicLinkEffect.Close)
            }
            is EmailProof.SecondFactor -> {
                tickJob?.cancel()
                effects.trySend(MagicLinkEffect.SecondFactor(event.outcome))
            }
            is EmailProof.LinkConfirmation, null -> Unit
        }
    }

    private fun open(proven: EmailProvenSession, onSessionOpened: () -> Unit) {
        if (opener.open(proven) != ProvenOpenResult.Opened) return
        arrival.prepare(proven.userId)
        onSessionOpened()
    }

    private fun startTicking() {
        tickJob?.cancel()
        tickJob = viewModelScope.launch {
            while (true) {
                delay(TICK_MS)
                val ticked = _state.value.countdown?.tick() ?: break
                _state.update { it.copy(countdown = ticked) }
                if (ticked.expired) break
            }
        }
    }

    private companion object {
        const val TICK_MS = 1_000L
    }
}
