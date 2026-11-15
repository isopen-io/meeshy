package me.meeshy.app.ongoing

import android.Manifest
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import me.meeshy.sdk.model.ongoing.ForegroundTypeLaw
import me.meeshy.sdk.model.ongoing.LiveActivityPlan
import me.meeshy.sdk.model.ongoing.OngoingActivityKind
import timber.log.Timber
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/** Ouvre et ferme le service de premier plan de l'hôte ; séparé pour que la coordination se joue sans système. */
internal interface OngoingServiceLauncher {
    /** `true` si le système a accepté de démarrer le service. */
    fun start(): Boolean

    fun stop()
}

internal class AndroidOngoingServiceLauncher @Inject constructor(
    @ApplicationContext private val context: Context,
) : OngoingServiceLauncher {

    override fun start(): Boolean = try {
        ContextCompat.startForegroundService(context, Intent(context, OngoingActivityService::class.java))
        true
    } catch (refused: RuntimeException) {
        Timber.w(refused, "service des notifications en cours refusé")
        false
    }

    override fun stop() {
        context.stopService(Intent(context, OngoingActivityService::class.java))
    }
}

/** Les permissions d'exécution qui conditionnent les types `microphone` et `camera`. */
internal fun interface ForegroundPermissionSource {
    fun current(): ForegroundTypeLaw.Permissions
}

internal class AndroidForegroundPermissionSource @Inject constructor(
    @ApplicationContext private val context: Context,
) : ForegroundPermissionSource {
    override fun current() = ForegroundTypeLaw.Permissions(
        microphone = granted(Manifest.permission.RECORD_AUDIO),
        camera = granted(Manifest.permission.CAMERA),
    )

    private fun granted(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
}

/** Ce que le service passe à `startForeground`. */
internal data class ForegroundSpec(val notificationId: Int, val notification: Notification, val typeMask: Int)

/**
 * **Qui tient le premier plan.** Suit les plans des activités que le service de l'hôte porte, calcule le
 * masque de types par [ForegroundTypeLaw] (activités ET permissions) et élit la notification du premier
 * plan par priorité. Un démarrage de service refusé (Android 12+ : app en arrière-plan) est retenté au
 * retour au premier plan ([retryPending]).
 */
@Singleton
internal class OngoingForeground @Inject constructor(
    private val launcher: OngoingServiceLauncher,
    private val permissions: ForegroundPermissionSource,
    private val notifier: LiveActivityNotifier,
) {
    private val plans = ConcurrentHashMap<OngoingActivityKind, LiveActivityPlan>()

    @Volatile
    private var pending = false

    fun track(plan: LiveActivityPlan) {
        if (!plan.kind.servedByHostService) return
        plans[plan.kind] = plan
        refresh()
    }

    fun release(kind: OngoingActivityKind) {
        if (plans.remove(kind) == null) return
        refresh()
    }

    fun retryPending() {
        if (pending) refresh()
    }

    /** `null` quand plus aucune activité ne peut tenir le premier plan. */
    fun spec(): ForegroundSpec? {
        val result = ForegroundTypeLaw.resolve(plans.keys.toSet(), isVideoCall = false, permissions = permissions.current())
        val primary = result.primary ?: return null
        val plan = plans[primary] ?: return null
        return ForegroundSpec(primary.notificationId, notifier.build(plan), result.mask)
    }

    fun onRefused() {
        pending = plans.isNotEmpty()
    }

    private fun refresh() {
        if (plans.isEmpty()) {
            pending = false
            launcher.stop()
            return
        }
        pending = !launcher.start()
    }
}
