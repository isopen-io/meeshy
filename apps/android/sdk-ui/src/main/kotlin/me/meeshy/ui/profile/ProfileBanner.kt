package me.meeshy.ui.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette

/** Ce que peint la bannière : la photo gagne toujours, le design équipé ne vient qu'à son défaut, sinon le dégradé d'accent. */
@Immutable
public sealed interface ProfileBannerPaint {
    public data class Photo(val url: String) : ProfileBannerPaint
    public data class Design(val key: String) : ProfileBannerPaint
    public data object Plain : ProfileBannerPaint

    /** Un dégradé ou un design n'est pas une image : seule la photo s'ouvre en plein écran. */
    public val opensFullscreen: Boolean get() = this is Photo

    public companion object {
        public fun resolve(
            photoUrl: String?,
            designKey: String?,
            isBlockedByTarget: Boolean = false,
            photoFailed: Boolean = false,
        ): ProfileBannerPaint {
            val photo = photoUrl?.takeIf { it.isNotBlank() }
            if (photo != null) return if (photoFailed) Plain else Photo(photo)
            val design = designKey?.takeIf { it.isNotBlank() && !isBlockedByTarget }
            return if (design != null) Design(design) else Plain
        }
    }
}

public val ProfileBannerHeight: androidx.compose.ui.unit.Dp = 130.dp

/**
 * La bannière d'un profil (130 dp). Photo via Coil (échec silencieux → dégradé), sinon [design] puis dégradé d'accent
 * et deux orbes décoratifs. [decor] (cadre, contour) se pose par-dessus sans capter le toucher ; le niveau / rang
 * vient de [LocalProfileGameSlot]. Toucher la bannière appelle [onOpenImage] seulement s'il y a une photo.
 */
@Composable
public fun ProfileBanner(
    photoUrl: String?,
    accent: Color,
    modifier: Modifier = Modifier,
    designKey: String? = null,
    design: (@Composable BoxScope.(key: String) -> Unit)? = null,
    decor: (@Composable BoxScope.() -> Unit)? = null,
    isBlockedByTarget: Boolean = false,
    userId: String? = null,
    displayName: String = "",
    onOpenImage: (ProfileFullscreenImage) -> Unit = {},
) {
    val context = LocalContext.current
    var failedUrl by remember { mutableStateOf<String?>(null) }
    val paint = ProfileBannerPaint.resolve(
        photoUrl = photoUrl,
        designKey = designKey,
        isBlockedByTarget = isBlockedByTarget,
        photoFailed = photoUrl != null && failedUrl == photoUrl,
    )
    val photoTarget = (paint as? ProfileBannerPaint.Photo)?.let { ProfileFullscreenImage.opening(it.url, displayName) }
    val label = ProfileImageCopy.bannerLabel(context)
    val hint = ProfileImageCopy.openFullscreenActionLabel(context)
    val tap = if (photoTarget != null) {
        Modifier
            .semantics { contentDescription = label }
            .clickable(onClickLabel = hint, role = Role.Button) { onOpenImage(photoTarget) }
    } else {
        Modifier
    }

    Box(modifier.fillMaxWidth().height(ProfileBannerHeight).then(tap)) {
        when (paint) {
            is ProfileBannerPaint.Photo -> {
                BannerGradient(accent, isBlockedByTarget, Modifier.decorative())
                AsyncImage(
                    model = ImageRequest.Builder(context).data(paint.url).crossfade(true).build(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.fillMaxWidth().height(ProfileBannerHeight),
                    onError = { failedUrl = paint.url },
                )
            }
            is ProfileBannerPaint.Design -> Box(Modifier.fillMaxWidth().height(ProfileBannerHeight).decorative()) {
                design?.invoke(this, paint.key) ?: BannerGradient(accent, false, Modifier)
            }
            ProfileBannerPaint.Plain -> BannerGradient(accent, isBlockedByTarget, Modifier.decorative())
        }
        if (!isBlockedByTarget && decor != null) decor()
        if (!isBlockedByTarget) ProfileGameBadges(userId, displayName, LocalProfileGameSlot.current)
    }
}

@Composable
private fun BannerGradient(accent: Color, blocked: Boolean, modifier: Modifier) {
    val base = if (blocked) MeeshyPalette.BlockedNeutral else accent
    Box(
        modifier
            .fillMaxWidth()
            .height(ProfileBannerHeight)
            .background(
                Brush.linearGradient(
                    listOf(base.copy(alpha = if (blocked) MeeshyOpacity.strong else 0.6f), base.copy(alpha = if (blocked) MeeshyOpacity.medium else 0.2f)),
                ),
            ),
    ) {
        Box(
            Modifier.align(Alignment.Center).offset(x = (-80).dp, y = (-30).dp).size(200.dp).clip(CircleShape)
                .background(base.copy(alpha = MeeshyOpacity.light)).decorative(),
        )
        Box(
            Modifier.align(Alignment.Center).offset(x = 100.dp, y = 20.dp).size(150.dp).clip(CircleShape)
                .background(base.copy(alpha = MeeshyOpacity.subtle)).decorative(),
        )
    }
}
