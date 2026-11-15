package me.meeshy.ui.component.permission

import android.content.ActivityNotFoundException

/**
 * Runs [launch] (a system `ACTION_IMAGE_CAPTURE`/`ACTION_VIDEO_CAPTURE` start) only once [ensureAccess]
 * says the camera is usable. The manifest DECLARES `CAMERA`, so the system refuses those intents with a
 * `SecurityException` the moment the user has not granted it — [ensureAccess] (in practice
 * `PermissionFlow.ensure(PermissionNature.CAMERA)`) is where the explanation sheet, the system prompt
 * or the « Open Settings » card live, and the exception handler is the last line of defence
 * (permission revoked between the check and the start, no camera app installed).
 * Returns whether the capture was started; never throws. Shared by every capture site (feed composer,
 * chat composer) so no camera launch can bypass the gate.
 */
public suspend fun launchWithCameraAccess(ensureAccess: suspend () -> Boolean, launch: () -> Unit): Boolean {
    if (!ensureAccess()) return false
    return try {
        launch()
        true
    } catch (_: SecurityException) {
        false
    } catch (_: ActivityNotFoundException) {
        false
    }
}
