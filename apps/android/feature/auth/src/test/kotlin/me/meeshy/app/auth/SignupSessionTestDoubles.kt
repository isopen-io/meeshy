package me.meeshy.app.auth

import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.auth.ArrivalCelebrating
import me.meeshy.sdk.auth.ProvenSessionOpener
import me.meeshy.sdk.auth.ProvenSessionPort
import me.meeshy.sdk.model.AuthSession
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.net.SessionTransitionFlags

/** Le port d'ouverture de session de l'inscription, observable : ce qui est installé, ce qui est refermé côté passerelle. */
internal class FakeProvenSessionPort(
    override var isAuthenticated: Boolean = false,
    override var activeUserId: String? = null,
) : ProvenSessionPort {
    val installed = mutableListOf<Pair<AuthSession, SessionOrigin>>()
    val closedJwts = mutableListOf<String>()

    override fun install(session: AuthSession, origin: SessionOrigin) {
        installed += session to origin
    }

    override suspend fun closeServerSession(jwt: String, sessionToken: String?): Boolean {
        closedJwts += jwt
        return true
    }
}

internal fun provenOpener(
    port: ProvenSessionPort = FakeProvenSessionPort(),
    flags: SessionTransitionFlags = SessionTransitionFlags(),
    scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Unconfined),
    nowMs: () -> Long = System::currentTimeMillis,
): ProvenSessionOpener = ProvenSessionOpener(port, flags, scope, nowMs)

internal fun arrivalCelebration(): ArrivalCelebrating = mockk(relaxed = true)
