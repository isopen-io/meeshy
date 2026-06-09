package me.meeshy.app.push

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.notification.NotificationRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Registers/re-registers the FCM device token with the gateway (ARCHITECTURE.md §8).
 */
@Singleton
class PushTokenHandler @Inject constructor(
    private val notificationRepository: NotificationRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun onTokenRefresh(token: String) {
        scope.launch {
            runCatching {
                notificationRepository.registerDeviceToken(token)
            }.onFailure { Timber.e(it, "Failed to register FCM token") }
        }
    }
}
