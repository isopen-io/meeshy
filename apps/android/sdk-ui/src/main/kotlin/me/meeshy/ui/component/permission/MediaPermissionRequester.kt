package me.meeshy.ui.component.permission

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import me.meeshy.sdk.model.PermissionFacts
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.PermissionRequestPlan
import me.meeshy.sdk.model.PermissionSnapshot
import me.meeshy.sdk.model.media.MediaPermissionState
import me.meeshy.sdk.permission.PermissionRequestHistory

/**
 * L'adaptateur Android de la porte unique d'accès : il ne fait que RELEVER les faits (permission
 * accordée, explication encore possible, historique des demandes, notifications coupées,
 * politique de l'appareil) et les remet à [PermissionRequestPlan], qui décide en Kotlin pur.
 *
 * Les relevés sont des paramètres pour que les tests posent n'importe quel scénario sans appareil ;
 * leurs valeurs par défaut sont les vrais appels système.
 */
public class MediaPermissionRequester(
    private val context: Context,
    private val history: PermissionRequestHistory,
    private val sdkInt: Int = Build.VERSION.SDK_INT,
    private val isGranted: (String) -> Boolean = { permission ->
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    },
    private val rationaleSuggested: (String) -> Boolean = { permission ->
        context.findActivity()?.let { ActivityCompat.shouldShowRequestPermissionRationale(it, permission) } ?: false
    },
    private val notificationsEnabled: () -> Boolean = {
        NotificationManagerCompat.from(context).areNotificationsEnabled()
    },
    private val blockedByPolicy: (PermissionNature) -> Boolean = { nature -> context.isBlockedByPolicy(nature) },
) {

    /** L'état de [nature] maintenant, sans jamais déclencher de boîte système. */
    public suspend fun snapshot(nature: PermissionNature): PermissionSnapshot {
        val request = nature.requirements(sdkInt).request
        val facts = PermissionFacts(
            grantedPermissions = request.filter(isGranted).toSet(),
            rationalePermissions = request.filter(rationaleSuggested).toSet(),
            requestedPermissions = history.requestedAmong(request),
            appNotificationsEnabled = notificationsEnabled(),
            blockedByPolicy = blockedByPolicy(nature),
        )
        return PermissionRequestPlan.snapshot(nature, sdkInt, facts)
    }

    public suspend fun state(nature: PermissionNature): MediaPermissionState = snapshot(nature).state

    /** Les permissions à soumettre à la boîte système pour [nature] sur cet appareil. */
    public fun systemPermissions(nature: PermissionNature): Array<String> =
        nature.requirements(sdkInt).request.toTypedArray()

    /** À appeler AVANT d'afficher la boîte : c'est la trace qui distingue un refus définitif d'une première demande. */
    public suspend fun markRequested(nature: PermissionNature) {
        history.markRequested(nature.requirements(sdkInt).request)
    }

    public fun openSettings(): Boolean = context.openAppSettings()
}

internal tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun Context.isBlockedByPolicy(nature: PermissionNature): Boolean = when (nature) {
    PermissionNature.CAMERA -> runCatching {
        (getSystemService(Context.DEVICE_POLICY_SERVICE) as? DevicePolicyManager)?.getCameraDisabled(null) == true
    }.getOrDefault(false)
    else -> false
}
