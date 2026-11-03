package me.meeshy.app.push

import android.os.Build
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import me.meeshy.sdk.model.auth.SessionOrigin
import me.meeshy.sdk.model.push.PushPermissionDecision
import me.meeshy.sdk.model.push.PushPermissionTiming
import me.meeshy.sdk.model.push.PushPermissionTrigger
import me.meeshy.sdk.notification.OnboardingPushPermissionHold
import me.meeshy.sdk.notification.PushPermissionDeferralStore
import me.meeshy.sdk.notification.PushPermissionStatus

/**
 * Le site UNIQUE qui décide quand la boîte système des notifications part (miroir de
 * `PushPermissionPrompt` iOS). Il ne la montre pas : il émet une demande que l'hôte Compose
 * honore. Une seule demande en attente à la fois (canal conflaté), jamais deux simultanées.
 */
@Singleton
class PushPermissionGate @Inject constructor(
    private val deferral: PushPermissionDeferralStore,
    private val holds: Set<@JvmSuppressWildcards OnboardingPushPermissionHold>,
    val status: PushPermissionStatus,
) {
    private val requestChannel = Channel<Unit>(Channel.CONFLATED)
    private val decisions = Mutex()

    /** Chaque émission = « montre la boîte système maintenant ». */
    val requests: Flow<Unit> = requestChannel.receiveAsFlow()

    /** Une session s'ouvre : connexion, inscription ou restauration au démarrage à froid. */
    suspend fun onSessionOpened(origin: SessionOrigin?, sdkInt: Int = Build.VERSION.SDK_INT) = decisions.withLock {
        val pending = deferral.isPending()
        when (PushPermissionTiming.decide(PushPermissionTrigger.SessionOpened(origin), pending, onboardingHolds(pending), sdkInt)) {
            PushPermissionDecision.ASK_NOW -> requestChannel.trySend(Unit)
            PushPermissionDecision.POSTPONE -> deferral.postpone()
            PushPermissionDecision.NOTHING -> Unit
        }
    }

    /**
     * Un message vient d'être accepté. Le marqueur est effacé AVANT l'attente (deux envois en
     * vol qui se croisent n'empilent pas deux boîtes), puis reposé si l'onboarding garde la fenêtre.
     */
    suspend fun onFirstMessageAccepted(sdkInt: Int = Build.VERSION.SDK_INT) = decisions.withLock {
        if (!deferral.isPending()) return@withLock
        deferral.resolve()
        when (PushPermissionTiming.decide(PushPermissionTrigger.FirstMessageAccepted, true, onboardingHolds(false), sdkInt)) {
            PushPermissionDecision.ASK_NOW -> requestChannel.trySend(Unit)
            PushPermissionDecision.POSTPONE -> deferral.postpone()
            PushPermissionDecision.NOTHING -> Unit
        }
    }

    private suspend fun onboardingHolds(reportPending: Boolean): Boolean = holds.any { it.holds(reportPending) }
}
