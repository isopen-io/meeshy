package me.meeshy.sdk.notification

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * L'état observable « les notifications peuvent s'afficher » : permission accordée (API 33+)
 * ET notifications activées au niveau système. Les Réglages en tirent le bandeau
 * « Notifications désactivées ». À rafraîchir au retour au premier plan.
 */
public class PushPermissionStatus(
    private val context: Context,
    private val sdkInt: Int = Build.VERSION.SDK_INT,
) {
    private val _isAuthorized = MutableStateFlow(read())
    public val isAuthorized: StateFlow<Boolean> = _isAuthorized.asStateFlow()

    /** Relit le système ; renvoie la valeur fraîche. */
    public fun refresh(): Boolean = read().also { _isAuthorized.value = it }

    private fun read(): Boolean {
        val permitted = sdkInt < RUNTIME_PERMISSION_SDK ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        return permitted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    private companion object {
        private const val RUNTIME_PERMISSION_SDK = 33
    }
}
