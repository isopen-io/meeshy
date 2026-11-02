package me.meeshy.app.community

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.hexColor

/** Le dégradé d'accent d'une communauté — la couleur du fond de sa carte quand elle n'a pas de bannière. */
internal fun accentBrush(hex: String): Brush {
    val base = hexColor(hex)
    return Brush.linearGradient(listOf(base, base.copy(alpha = 0.6f)))
}

/**
 * La bannière d'une communauté : le dégradé d'accent d'abord (jamais un trou pendant le chargement),
 * l'image servie par-dessus quand elle existe. La référence se résout par le site unique
 * [resolveServedImageUrl] ; Coil décode à la taille du conteneur.
 */
@Composable
internal fun CommunityBanner(bannerUrl: String?, accentHex: String, modifier: Modifier = Modifier) {
    val baseUrl = LocalMediaBaseUrl.current
    val model = remember(bannerUrl, baseUrl) { resolveServedImageUrl(bannerUrl, baseUrl) }
    Box(modifier.background(accentBrush(accentHex))) {
        if (model != null) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(model).crossfade(true).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.matchParentSize(),
            )
        }
    }
}

/**
 * Un clic avec le ressort de pression d'iOS : la cible se réduit à [pressedScale] pendant l'appui et
 * revient en ressort. La mise à l'échelle se lit dans le bloc `graphicsLayer` (phase de dessin) : un
 * appui ne recompose rien.
 */
@Composable
internal fun Modifier.pressableScale(
    onClick: () -> Unit,
    pressedScale: Float = 0.95f,
    role: Role? = Role.Button,
    enabled: Boolean = true,
): Modifier {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) pressedScale else 1f,
        animationSpec = MeeshyMotion.springFast(),
        label = "pressScale",
    )
    return this
        .graphicsLayer {
            scaleX = scale
            scaleY = scale
        }
        .clickable(interactionSource = interaction, indication = null, enabled = enabled, role = role, onClick = onClick)
}

/** Un bouton rond à glyphe (retour, plus, menu) : cible tactile de 48 dp, disque visuel de [visual]. */
@Composable
internal fun CommunityRoundButton(
    icon: ImageVector,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = Color.White,
    fill: Color = Color.Black.copy(alpha = 0.35f),
    visual: Dp = 40.dp,
    border: BorderStroke? = null,
) {
    Box(
        modifier = modifier
            .size(48.dp)
            .pressableScale(onClick = onClick, pressedScale = 0.9f)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.size(visual).clip(CircleShape).background(fill),
            contentAlignment = Alignment.Center,
        ) {
            Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(visual * 0.5f))
        }
    }
}

internal val MemberRole.communityRoleColor: Color
    get() = when (this) {
        MemberRole.CREATOR -> Color(0xFFF59E0B)
        MemberRole.ADMIN -> Color(0xFFEF4444)
        MemberRole.MODERATOR -> Color(0xFF6366F1)
        MemberRole.MEMBER -> Color.Unspecified
    }
