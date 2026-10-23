package me.meeshy.app.navigation

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.AndroidPermissions
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.notification.NotificationPermissionPrompt
import me.meeshy.sdk.permission.PermissionRequestHistory
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow

/** Laisse le rideau de démarrage et la liste se poser avant l'explication. */
private const val ARRIVAL_SETTLE_MS = 1_500L

/**
 * À l'arrivée dans un compte, propose une fois les notifications (explication puis boîte
 * système) si elles n'ont jamais été demandées : sans `POST_NOTIFICATIONS`, Android 13+ reçoit
 * les pushes sans jamais les afficher.
 */
@Composable
internal fun NotificationPermissionOnArrival(isAuthenticated: Boolean) {
    val context = LocalContext.current
    val permissions = rememberPermissionFlow()
    PermissionFlowHost(permissions)
    LaunchedEffect(isAuthenticated) {
        if (!isAuthenticated) return@LaunchedEffect
        delay(ARRIVAL_SETTLE_MS)
        val asked = PermissionRequestHistory.shared(context).wasRequested(AndroidPermissions.POST_NOTIFICATIONS)
        val state = permissions.stateOf(PermissionNature.NOTIFICATIONS)
        if (NotificationPermissionPrompt.asksOnArrival(Build.VERSION.SDK_INT, state, asked)) {
            permissions.ensure(PermissionNature.NOTIFICATIONS, announcesRefusal = false)
        }
    }
}
