package me.meeshy.ui.profile

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.accessibility.decorative
import me.meeshy.ui.accessibility.meeshyTapTarget
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

public val ProfileAvatarSize: Dp = 80.dp
private val RingExtra = 8.dp

/**
 * L'avatar photo d'un profil : photo (initiales tant qu'elle manque), anneau de story réel, humeur, pastille de
 * présence et emplacement de [decor] (contour). Toucher la photo appelle [onOpenImage] seulement s'il y a une image ;
 * l'anneau appelle [onViewStory], l'humeur [onMoodTap]. L'entrée en ressort respecte « Réduire les animations ».
 */
@Composable
public fun ProfileAvatar(
    name: String,
    avatarUrl: String?,
    accent: Color,
    modifier: Modifier = Modifier,
    size: Dp = ProfileAvatarSize,
    storyRing: StoryRingState = StoryRingState.None,
    moodEmoji: String? = null,
    presence: PresenceState? = null,
    isBlockedByMe: Boolean = false,
    isBlockedByTarget: Boolean = false,
    decor: (@Composable BoxScope.() -> Unit)? = null,
    onOpenImage: (ProfileFullscreenImage) -> Unit = {},
    onViewStory: () -> Unit = {},
    onMoodTap: () -> Unit = {},
) {
    val context = LocalContext.current
    val signs = ProfileAvatarSigns.of(storyRing, moodEmoji, presence, isBlockedByMe, isBlockedByTarget, accent)
    val photoTarget = ProfileFullscreenImage.opening(avatarUrl, name)
    val reduceMotion = remember { isReduceMotionEnabled(context) }
    val entrance = remember { Animatable(if (reduceMotion) 1f else 0.85f) }
    LaunchedEffect(Unit) { if (!reduceMotion) entrance.animateTo(1f, MeeshyMotion.springBouncy()) }

    val hint = ProfileImageCopy.openFullscreenHint(context)
    val photoTap = if (photoTarget != null) {
        Modifier.clickable(onClickLabel = ProfileImageCopy.openFullscreenActionLabel(context), role = Role.Button) {
            onOpenImage(photoTarget)
        }.semantics { contentDescription = "$name. $hint" }
    } else {
        Modifier
    }
    val gray = if (signs.isGrayedOut) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) else null
    val outer = size + RingExtra

    Box(modifier.size(outer).scale(entrance.value), contentAlignment = Alignment.Center) {
        if (signs.isRingTappable) {
            val ringColor = if (signs.storyRing == StoryRingState.Unread) MeeshyPalette.Indigo500 else signs.accent.copy(alpha = MeeshyOpacity.medium)
            Box(
                Modifier.size(outer).clip(CircleShape)
                    .border(if (signs.storyRing == StoryRingState.Unread) 3.dp else 1.5.dp, ringColor, CircleShape)
                    .clickable(role = Role.Button, onClick = onViewStory),
            )
        }
        Box(Modifier.size(size).clip(CircleShape).then(photoTap)) {
            MeeshyAvatar(name = name, size = size, containerColor = signs.accent)
            if (photoTarget != null) {
                AsyncImage(
                    model = ImageRequest.Builder(context).data(photoTarget.url).crossfade(true).build(),
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    colorFilter = gray,
                    modifier = Modifier.size(size),
                )
            }
        }
        if (signs.showsDecor && decor != null) Box(Modifier.size(outer).decorative()) { decor() }
        signs.presenceDot?.let { dot ->
            Box(
                Modifier.align(Alignment.BottomEnd).size(size * 0.26f + 4.dp).clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundPrimary).decorative(),
                contentAlignment = Alignment.Center,
            ) { Box(Modifier.size(size * 0.26f).clip(CircleShape).background(dot)) }
        }
        signs.moodEmoji?.let { mood ->
            Box(
                Modifier.align(Alignment.TopEnd).meeshyTapTarget().clickable(role = Role.Button, onClick = onMoodTap),
                contentAlignment = Alignment.Center,
            ) {
                Text(mood, fontSize = with(LocalDensity.current) { (size * 0.3f).toSp() })
            }
        }
    }
}

private fun isReduceMotionEnabled(context: android.content.Context): Boolean =
    runCatching {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }.getOrDefault(false)
