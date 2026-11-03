package me.meeshy.app.chat.camera

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import me.meeshy.ui.component.capture.CameraXCaptureEngine

/**
 * Pré-chauffe la caméra à l'ouverture du composeur (iOS `ComposerCameraPreparedInputs`) : le fournisseur CameraX
 * est déjà prêt quand le viseur s'arme, et la première trame journalise « prewarmed » au lieu de « cold ».
 */
@Composable
internal fun ComposerCameraPrewarm(offered: Boolean) {
    val context = LocalContext.current
    LaunchedEffect(offered) {
        if (offered) CameraXCaptureEngine.prewarm(context)
    }
}
