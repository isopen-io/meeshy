package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.profile.LocalProfileGameSlot
import me.meeshy.ui.profile.ProfileFullscreenImage
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.profile.ProfileAvatar as SocialProfileAvatar

/** Les mesures de l'en-tête de MA page (iOS `bannerAndAvatarSection`). */
internal object OwnProfileHeaderMetrics {
    val BannerHeight: Dp = 120.dp
    val AvatarSize: Dp = 90.dp
    val AvatarRing: Dp = 4.dp

    /** L'avatar chevauche la bannière de la moitié de sa taille. */
    val AvatarOverlap: Dp = AvatarSize / 2
}

/**
 * L'en-tête de MA page : bannière 120 dp (coins lg) avec l'emplacement niveau / rang, avatar 90 dp qui la
 * chevauche avec un anneau de fond de 4 dp, mon humeur, puis nom et @pseudo. En édition, la bannière porte
 * la capsule « Modifier » et l'avatar son crayon ; l'humeur et le nom s'effacent, comme sur iOS.
 * [banner] peint le fond (photo, design équipé, cadre) — un emplacement, pour que l'en-tête reste testable.
 */
@Composable
internal fun OwnProfileHeader(
    user: MeeshyUser,
    isEditing: Boolean,
    moodEmoji: String?,
    uploading: ImageUploadTarget?,
    onPickBanner: () -> Unit,
    onPickAvatar: () -> Unit,
    onOpenImage: (ProfileFullscreenImage) -> Unit,
    onMoodTap: (() -> Unit)?,
    banner: @Composable BoxScope.() -> Unit,
) {
    val name = user.effectiveDisplayName
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        OwnProfileBannerFrame(
            user = user,
            name = name,
            isEditing = isEditing,
            isUploading = uploading == ImageUploadTarget.BANNER,
            canPick = uploading == null,
            onPickBanner = onPickBanner,
            onOpenImage = onOpenImage,
            banner = banner,
        )
        Box(Modifier.overlapUp(OwnProfileHeaderMetrics.AvatarOverlap), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(OwnProfileHeaderMetrics.AvatarSize + OwnProfileHeaderMetrics.AvatarRing * 2)
                    .clip(CircleShape)
                    .background(MeeshyTheme.tokens.backgroundPrimary),
            )
            if (isEditing) {
                OwnProfileEditableAvatar(
                    user = user,
                    isUploading = uploading == ImageUploadTarget.AVATAR,
                    canPick = uploading == null,
                    onPick = onPickAvatar,
                )
            } else {
                SocialProfileAvatar(
                    name = name,
                    avatarUrl = user.avatar,
                    accent = MeeshyPalette.Indigo500,
                    size = OwnProfileHeaderMetrics.AvatarSize,
                    moodEmoji = OwnProfileMood.shown(moodEmoji, isEditing = false),
                    onOpenImage = onOpenImage,
                    onMoodTap = onMoodTap ?: {},
                )
            }
        }
        if (!isEditing) {
            Column(
                modifier = Modifier.padding(top = MeeshySpacing.sm),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                user.username.takeIf { it.isNotBlank() }?.let { username ->
                    Text(
                        text = "@$username",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Medium,
                        color = MeeshyPalette.Indigo500,
                    )
                }
            }
        }
    }
}

@Composable
private fun OwnProfileBannerFrame(
    user: MeeshyUser,
    name: String,
    isEditing: Boolean,
    isUploading: Boolean,
    canPick: Boolean,
    onPickBanner: () -> Unit,
    onOpenImage: (ProfileFullscreenImage) -> Unit,
    banner: @Composable BoxScope.() -> Unit,
) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    val photo = if (isEditing) null else ProfileFullscreenImage.opening(user.banner, name)
    val tap = photo?.let { Modifier.clickable(role = Role.Button) { onOpenImage(it) } } ?: Modifier
    Box(
        Modifier
            .fillMaxWidth()
            .height(OwnProfileHeaderMetrics.BannerHeight)
            .clip(shape)
            .background(MeeshyTheme.tokens.backgroundTertiary)
            .then(tap),
    ) {
        banner()
        if (!isEditing) OwnProfileGameBadges(userId = user.id, displayName = name)
        if (isEditing) {
            Row(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(MeeshySpacing.sm)
                    .clip(RoundedCornerShape(MeeshyRadius.pill))
                    .background(MeeshyMediaChromeColors.Scrim)
                    .clickable(enabled = canPick, role = Role.Button, onClick = onPickBanner)
                    .padding(horizontal = MeeshySpacing.smPlus, vertical = MeeshySpacing.xsPlus),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Icon(
                    imageVector = Icons.Filled.Image,
                    contentDescription = stringResource(R.string.profile_change_banner),
                    tint = MeeshyMediaChromeColors.OnMedia,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = stringResource(R.string.profile_edit),
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyMediaChromeColors.OnMedia,
                )
            }
        }
        if (isUploading) {
            Box(
                Modifier.matchParentSize().background(MeeshyMediaChromeColors.ScrimSoft),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(28.dp))
            }
        }
    }
}

/** Le niveau (coin bas, début) et le rang (coin bas, fin), fournis par l'app ; le doigt les traverse. */
@Composable
private fun BoxScope.OwnProfileGameBadges(userId: String, displayName: String) {
    val slot = LocalProfileGameSlot.current ?: return
    if (userId.isBlank()) return
    Box(Modifier.matchParentSize().padding(horizontal = MeeshySpacing.md)) {
        Box(Modifier.align(Alignment.BottomStart)) { slot.level(userId, displayName) }
        Box(Modifier.align(Alignment.BottomEnd)) { slot.rank(userId, displayName) }
    }
}

/** L'avatar en édition : toucher choisit une photo, le crayon le signale, un voile pendant le téléversement. */
@Composable
private fun OwnProfileEditableAvatar(
    user: MeeshyUser,
    isUploading: Boolean,
    canPick: Boolean,
    onPick: () -> Unit,
) {
    val size = OwnProfileHeaderMetrics.AvatarSize
    Box(Modifier.size(size)) {
        MeeshyAvatar(
            name = user.effectiveDisplayName,
            size = size,
            imageUrl = user.avatar,
            modifier = Modifier
                .clip(CircleShape)
                .clickable(enabled = canPick, role = Role.Button, onClick = onPick),
        )
        if (isUploading) {
            Box(
                Modifier.matchParentSize().clip(CircleShape).background(MeeshyMediaChromeColors.ScrimSoft),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator(color = MeeshyMediaChromeColors.OnMedia, modifier = Modifier.size(24.dp))
            }
        } else {
            Box(
                Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = MeeshySpacing.xs, y = MeeshySpacing.xs)
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(MeeshyPalette.Indigo500)
                    .clickable(enabled = canPick, role = Role.Button, onClick = onPick),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Edit,
                    contentDescription = stringResource(R.string.profile_avatar_edit),
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

/** Remonte le contenu de [overlap] et rend autant de place : l'avatar chevauche la bannière (iOS `offset` + `padding`). */
private fun Modifier.overlapUp(overlap: Dp): Modifier = layout { measurable, constraints ->
    val placeable = measurable.measure(constraints)
    val shift = overlap.roundToPx()
    layout(placeable.width, (placeable.height - shift).coerceAtLeast(0)) {
        placeable.place(0, -shift)
    }
}
