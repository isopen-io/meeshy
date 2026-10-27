package me.meeshy.sdk.auth

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.auth.EmailProofRules
import me.meeshy.sdk.net.EmailGateReason
import me.meeshy.sdk.net.EmailVerificationGateRegistry
import me.meeshy.sdk.net.EmailVerificationGating
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que la feuille de validation doit montrer : pourquoi, et pour quelle adresse. */
data class EmailGateRequest(val reason: EmailGateReason, val email: String)

/**
 * **Le gardien de l'e-mail de l'app** (#8365) — le contrat que l'intercepteur réseau consulte pour les
 * cinq routes qui exigent une adresse prouvée. Miroir de `EmailVerificationGateController` (iOS).
 *
 * - « Connue non prouvée » se lit sur l'utilisateur COURANT, sans aller-retour ([EmailProofRules]).
 * - La validation se présente PAR-DESSUS tout : l'écran qui attend sa réponse reste là, son brouillon avec lui.
 * - Toutes les demandes en cours partagent UNE présentation et UN verdict ([settle]).
 * - Une demande annulée (l'appel a été abandonné) se retire ; la dernière retirée referme la feuille.
 */
@Singleton
class EmailVerificationGateController @Inject constructor(
    private val sessions: SessionRepository,
    registry: EmailVerificationGateRegistry,
) : EmailVerificationGating {

    private val lock = Any()
    private val waiters = mutableListOf<CompletableDeferred<Boolean>>()
    private var provenUserId: String? = null

    private val _request = MutableStateFlow<EmailGateRequest?>(null)

    /** La validation à présenter, `null` quand rien n'attend. */
    val request: StateFlow<EmailGateRequest?> = _request.asStateFlow()

    init {
        registry.current = this
    }

    override suspend fun emailKnownUnproven(): Boolean =
        EmailProofRules.knownUnproven(sessions.currentUser.value, provenUserId)

    override suspend fun verifyEmail(reason: EmailGateReason): Boolean {
        val email = EmailProofRules.address(sessions.currentUser.value) ?: return false
        val waiter = CompletableDeferred<Boolean>()
        synchronized(lock) {
            if (_request.value == null) _request.value = EmailGateRequest(reason, email)
            waiters += waiter
        }
        return try {
            waiter.await()
        } catch (canceled: CancellationException) {
            synchronized(lock) {
                waiters -= waiter
                if (waiters.isEmpty()) _request.value = null
            }
            throw canceled
        }
    }

    /** Le verdict de la feuille : le code est validé (`true`), ou « Plus tard » / feuille glissée (`false`). */
    fun settle(verified: Boolean) {
        val released = synchronized(lock) {
            if (_request.value == null && waiters.isEmpty()) return
            if (verified) provenUserId = sessions.currentUser.value?.id
            _request.value = null
            waiters.toList().also { waiters.clear() }
        }
        released.forEach { it.complete(verified) }
    }
}
