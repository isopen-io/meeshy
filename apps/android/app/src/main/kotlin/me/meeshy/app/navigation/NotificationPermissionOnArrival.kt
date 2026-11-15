package me.meeshy.app.navigation

import android.os.Build
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import me.meeshy.app.push.PushPermissionViewModel
import me.meeshy.sdk.model.AndroidPermissions
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.notification.NotificationPermissionPrompt
import me.meeshy.sdk.permission.PermissionRequestHistory
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow

/** Laisse le rideau de démarrage et la liste se poser avant l'explication. */
private const val ARRIVAL_SETTLE_MS = 1_500L

/**
 * Honore les demandes de permission de notification décidées par `PushPermissionGate` : à
 * l'ouverture d'une session de connexion ou restaurée, ou, pour un compte tout juste créé,
 * après son premier message accepté. Jamais avant l'authentification ; la boîte ne sert
 * qu'une fois (Android ne repropose plus après deux refus) ; l'état d'autorisation se
 * rafraîchit à chaque retour au premier plan.
 */
@Composable
internal fun NotificationPermissionOnArrival(isAuthenticated: Boolean) {
    val context = LocalContext.current
    val permissions = rememberPermissionFlow()
    val viewModel: PushPermissionViewModel = hiltViewModel()
    PermissionFlowHost(permissions)

    LaunchedEffect(isAuthenticated) {
        if (!isAuthenticated) return@LaunchedEffect
        delay(ARRIVAL_SETTLE_MS)
        viewModel.onSessionOpened()
    }

    LaunchedEffect(isAuthenticated) {
        if (!isAuthenticated) return@LaunchedEffect
        viewModel.requests.collect {
            val asked = PermissionRequestHistory.shared(context).wasRequested(AndroidPermissions.POST_NOTIFICATIONS)
            val state = permissions.stateOf(PermissionNature.NOTIFICATIONS)
            if (NotificationPermissionPrompt.asksOnArrival(Build.VERSION.SDK_INT, state, asked)) {
                permissions.ensure(PermissionNature.NOTIFICATIONS, announcesRefusal = false)
            }
            viewModel.refreshAuthorization()
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) viewModel.refreshAuthorization()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}
