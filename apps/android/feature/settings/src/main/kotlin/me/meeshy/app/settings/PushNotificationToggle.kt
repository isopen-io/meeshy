package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.launch
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.notification.NotificationPermissionPrompt
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.component.permission.PermissionFlowHost
import me.meeshy.ui.component.permission.rememberPermissionFlow

/**
 * « Notifications push » dit ce qui arrivera vraiment : coupé quand le système bloque les
 * notifications de Meeshy, même si la préférence est active. L'activer alors passe par la porte
 * unique (explication, boîte système, ou carte « Ouvrir les Réglages » après un refus définitif).
 */
@Composable
internal fun PushNotificationToggle(
    pushEnabled: Boolean,
    onSetPushEnabled: (Boolean) -> Unit,
    color: Color = MeeshyPalette.Error,
) {
    val context = LocalContext.current
    val permissions = rememberPermissionFlow()
    PermissionFlowHost(permissions)
    val scope = rememberCoroutineScope()
    var systemAllows by remember { mutableStateOf(NotificationManagerCompat.from(context).areNotificationsEnabled()) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, context) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                systemAllows = NotificationManagerCompat.from(context).areNotificationsEnabled()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    NotificationToggleRow(
        label = stringResource(R.string.settings_push_notifications),
        color = color,
        checked = NotificationPermissionPrompt.pushSwitchOn(pushEnabled, systemAllows),
        onCheckedChange = { on ->
            if (on && !systemAllows) {
                scope.launch {
                    if (permissions.ensure(PermissionNature.NOTIFICATIONS)) {
                        systemAllows = NotificationManagerCompat.from(context).areNotificationsEnabled()
                        onSetPushEnabled(true)
                    }
                }
            } else {
                onSetPushEnabled(on)
            }
        },
    )
}
