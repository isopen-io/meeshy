package me.meeshy.ui.profile

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import me.meeshy.ui.component.viewer.MeeshyImageViewer

/** Une image de profil (bannière ou photo) ouverte en plein écran ; `null` sans image : rien ne s'ouvre. */
@Immutable
public data class ProfileFullscreenImage(val url: String, val fallbackText: String) {
    public companion object {
        public fun opening(url: String?, fallbackText: String): ProfileFullscreenImage? =
            url?.takeIf { it.isNotBlank() }?.let { ProfileFullscreenImage(it, fallbackText) }
    }
}

/** La visionneuse plein écran (dialogue noir immersif, pincer, double tap, glisser pour fermer) de [image]. */
@Composable
public fun ProfileFullscreenImageViewer(image: ProfileFullscreenImage, onDismiss: () -> Unit) {
    MeeshyImageViewer(
        imageUrls = listOf(image.url),
        initialIndex = 0,
        onDismiss = onDismiss,
    )
}
