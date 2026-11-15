package me.meeshy.sdk.model.notification

import me.meeshy.sdk.model.media.MediaPermissionState

/**
 * Quand demander `POST_NOTIFICATIONS` (Android 13+) : sans cette demande, les pushes arrivent
 * mais ne s'affichent jamais. Comme iOS (`OnboardingPushPermissionGate`), la fenêtre système ne
 * sert qu'une fois : elle se propose à l'arrivée dans un compte si elle n'a jamais été montrée,
 * et ne revient ensuite que par un geste (l'interrupteur des Réglages).
 */
public object NotificationPermissionPrompt {

    private const val RUNTIME_PERMISSION_SDK = 33

    public fun asksOnArrival(sdkInt: Int, state: MediaPermissionState, alreadyRequested: Boolean): Boolean =
        sdkInt >= RUNTIME_PERMISSION_SDK && state == MediaPermissionState.NOT_DETERMINED && !alreadyRequested

    /** L'interrupteur « Notifications push » dit ce qui arrivera vraiment : coupé si le système bloque. */
    public fun pushSwitchOn(preferenceEnabled: Boolean, systemAllows: Boolean): Boolean = preferenceEnabled && systemAllows
}
