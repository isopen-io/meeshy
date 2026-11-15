package me.meeshy.sdk.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.auth.EmailProvenSession
import me.meeshy.sdk.model.auth.ProvenOpenResult
import me.meeshy.sdk.model.auth.ProvenRefusal
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.SessionTransitionFlags
import javax.inject.Inject
import javax.inject.Singleton

/** Ce que l'ouverture d'une session prouvée demande à l'authentification, sans en dépendre. */
interface ProvenSessionPort {
    val isAuthenticated: Boolean
    val activeUserId: String?

    /** Écrit les jetons et adopte le profil, comme une connexion réussie. */
    fun install(session: AuthSession, origin: SessionOrigin)

    /** Ferme la session côté passerelle ; `false` si la passerelle n'a pas répondu. */
    suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean
}

/**
 * Le point UNIQUE par lequel une session prouvée par e-mail s'ouvre (miroir de
 * `AuthManager.openSession` / `discardProvenSession`, iOS `AuthManager+EmailAccess.swift`).
 *
 * - elle s'INSTALLE hors changement de compte, dans sa fenêtre d'adoption, et sans prendre la
 *   place d'un autre utilisateur ;
 * - toute session refusée ou écartée est REFERMÉE côté passerelle, sans faire attendre l'appelant,
 *   avec des réessais comme la déconnexion ;
 * - l'inscription peut TENIR sa session tant que le code n'est pas saisi ([hold]), puis l'installer
 *   ([installHeld]) ou l'écarter ([discardHeld]).
 */
@Singleton
class ProvenSessionOpener(
    private val port: ProvenSessionPort,
    private val transition: SessionTransitionFlags,
    private val scope: CoroutineScope,
    private val nowMs: () -> Long,
) {
    @Inject
    constructor(port: ProvenSessionPort, transition: SessionTransitionFlags) :
        this(port, transition, CoroutineScope(SupervisorJob() + Dispatchers.IO), System::currentTimeMillis)

    private val lock = Any()
    private var held: EmailProvenSession? = null
    private var holdExpiry: Job? = null

    /** Pose la session si rien ne s'y oppose ; sinon la refuse avec son motif et la referme côté passerelle. */
    fun open(proven: EmailProvenSession): ProvenOpenResult {
        val refusal = refusalFor(proven)
        if (refusal != null) {
            closeRefused(proven)
            return ProvenOpenResult.Refused(refusal)
        }
        port.install(proven.session, proven.origin)
        return ProvenOpenResult.Opened
    }

    /** Écarte une session prouvée que l'utilisateur a refusée : elle est refermée côté passerelle. */
    suspend fun discard(proven: EmailProvenSession) {
        repeat(CLOSE_ATTEMPTS) { attempt ->
            if (port.closeServerSession(proven.session.token, proven.session.sessionToken)) return
            if (attempt < CLOSE_ATTEMPTS - 1) delay(CLOSE_RETRY_DELAY_MS * (attempt + 1))
        }
    }

    /** Tient la session le temps que le code soit saisi ; une session déjà tenue est écartée. */
    fun hold(proven: EmailProvenSession) {
        val previous = synchronized(lock) {
            val replaced = held
            holdExpiry?.cancel()
            held = proven
            holdExpiry = scheduleExpiry(proven)
            replaced
        }
        previous?.let { closeRefused(it) }
    }

    /** Installe la session tenue ; `null` quand rien n'est tenu. */
    fun installHeld(): ProvenOpenResult? {
        val proven = takeHeld() ?: return null
        return open(proven)
    }

    /** Écarte la session tenue (saisie abandonnée) : refermée côté passerelle. */
    fun discardHeld() {
        takeHeld()?.let { closeRefused(it) }
    }

    val hasHeldSession: Boolean get() = synchronized(lock) { held != null }

    private fun takeHeld(): EmailProvenSession? = synchronized(lock) {
        holdExpiry?.cancel()
        holdExpiry = null
        held.also { held = null }
    }

    private fun scheduleExpiry(proven: EmailProvenSession): Job = scope.launch {
        val remaining = proven.receivedAtMs + proven.adoptableForMs - nowMs()
        delay(remaining.coerceAtLeast(0L) + HOLD_GRACE_MS)
        val expired = synchronized(lock) {
            if (held === proven) {
                held = null
                holdExpiry = null
                proven
            } else {
                null
            }
        }
        expired?.let { discard(it) }
    }

    private fun refusalFor(proven: EmailProvenSession): ProvenRefusal? = when {
        proven.hasLapsedAdoptionWindow(nowMs()) -> ProvenRefusal.WindowLapsed
        transition.isSwitchingAccount -> ProvenRefusal.AccountSwitchUnderway
        port.isAuthenticated && port.activeUserId != proven.userId ->
            ProvenRefusal.SessionReplacementRefused(port.activeUserId, proven.userId)
        else -> null
    }

    private fun closeRefused(proven: EmailProvenSession) {
        scope.launch { discard(proven) }
    }

    companion object {
        const val CLOSE_ATTEMPTS: Int = 3
        const val CLOSE_RETRY_DELAY_MS: Long = 1_000L

        /** Marge après la fin de la fenêtre avant d'écarter une session tenue : un geste qui frôle l'expiration se résout d'abord. */
        const val HOLD_GRACE_MS: Long = 2_000L
    }
}
