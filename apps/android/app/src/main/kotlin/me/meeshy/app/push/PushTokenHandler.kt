package me.meeshy.app.push

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.app.BuildConfig
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import me.meeshy.sdk.notification.NotificationRepository
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Registers/re-registers the FCM device token with the gateway (ARCHITECTURE.md §8), declaring
 * the data-only rendering capability of the push pipeline.
 */
@Singleton
class PushTokenHandler @Inject constructor(
    private val notificationRepository: NotificationRepository,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun onTokenRefresh(token: String) {
        scope.launch {
            runCatching {
                notificationRepository.registerDeviceToken(
                    dataOnlyCapableRequest(token, appVersion = BuildConfig.VERSION_NAME, bundleId = BuildConfig.APPLICATION_ID),
                )
            }.onFailure { Timber.e(it, "Failed to register FCM token") }
        }
    }
}

/**
 * The FCM token request declaring that this client renders data-only pushes itself — and WHICH client it is.
 *
 * `appVersion` + `bundleId` are what the gateway's push routing reads (`services/gateway/src/services/push-type-routing.ts`) :
 * a push type with a version floor only reaches a token whose bundle says « native » (`me.meeshy.app…`) and whose
 * version reaches that floor. Without them the native app received NO floored type at all — `bring_stopped` (#13936)
 * among them, which left a Bring ringing until its expiry after the sender cancelled it.
 */
internal fun dataOnlyCapableRequest(
    token: String,
    appVersion: String? = null,
    bundleId: String? = null,
): RegisterDeviceTokenRequest =
    RegisterDeviceTokenRequest.fcm(token, appVersion = appVersion, bundleId = bundleId).copy(
        capabilities = listOf(RegisterDeviceTokenRequest.CAPABILITY_DATA_ONLY),
    )
