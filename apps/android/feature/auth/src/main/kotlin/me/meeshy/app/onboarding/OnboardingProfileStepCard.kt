package me.meeshy.app.onboarding

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import java.io.File
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.ImageUploadTarget
import me.meeshy.sdk.model.onboarding.OnboardingProfilePrimary
import me.meeshy.sdk.model.onboarding.OnboardingProfileSlot
import me.meeshy.sdk.util.resolveServedImageUrl
import me.meeshy.ui.component.LocalMediaBaseUrl
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.meeshyText

private val AvatarSize = 96.dp
private val BannerRadius = 16.dp
private const val BANNER_RATIO = 3f

/**
 * « Montre-toi » (#17238) : l'aperçu du profil tel que les autres le verront — bannière 3:1, avatar rond qui la chevauche,
 * nom et pseudo. Toucher la bannière ou l'avatar ouvre le sélecteur et l'éditeur PARTAGÉS avec l'écran Profil ; l'image
 * s'affiche aussitôt pendant son envoi. Aucune image choisie : un seul bouton, « Plus tard » ; une image posée ou en cours
 * d'envoi : « Continuer », et « Plus tard » passe en second (iOS `OnboardingProfileCard`, règle de « Trouve ta bande »).
 */
@Composable
internal fun OnboardingProfileStepCard(state: OnboardingUiState, actions: OnboardingCardActions) {
    val card = state.profileCard
    val primary = when (card.primary) {
        OnboardingProfilePrimary.LATER -> OnboardingAction(
            title = stringResource(R.string.onboarding_later),
            tag = "onboarding.profile.primary",
            isBusy = card.isUploading,
            perform = actions.continueFromProfile,
        )
        OnboardingProfilePrimary.CONTINUE -> OnboardingAction(
            title = stringResource(R.string.onboarding_card_continue),
            tag = "onboarding.profile.primary",
            isBusy = card.isUploading,
            perform = actions.continueFromProfile,
        )
    }
    OnboardingCardLayout(
        title = stringResource(R.string.onboarding_profile_title),
        message = stringResource(R.string.onboarding_profile_body),
        primary = primary,
        secondary = if (card.primary == OnboardingProfilePrimary.CONTINUE) laterAction(actions) else null,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
            ProfileBenefits()
            ProfilePreview(state, actions)
            ProfileFailures(state, actions)
        }
    }
}

@Composable
private fun ProfileBenefits() {
    Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        BenefitPill(MeeshyIcons.Eye, stringResource(R.string.onboarding_profile_benefit_visibility), Modifier.weight(1f))
        BenefitPill(MeeshyIcons.Groups, stringResource(R.string.onboarding_profile_benefit_contacts), Modifier.weight(1f))
    }
}

@Composable
private fun BenefitPill(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, modifier: Modifier) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(MeeshyPalette.Indigo500.copy(alpha = 0.12f))
            .heightIn(min = 44.dp)
            .padding(horizontal = MeeshySpacing.md)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyPalette.Indigo500, modifier = Modifier.size(18.dp))
        Text(
            text = label,
            color = MeeshyTheme.tokens.textPrimary,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
private fun ProfilePreview(state: OnboardingUiState, actions: OnboardingCardActions) {
    val card = state.profileCard
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
            BannerSlot(card.banner) { actions.chooseProfileImage(ImageUploadTarget.BANNER) }
            AvatarSlot(
                slot = card.avatar,
                name = state.userDisplayName,
                modifier = Modifier.offset(y = AvatarSize / 2),
            ) { actions.chooseProfileImage(ImageUploadTarget.AVATAR) }
        }
        Box(Modifier.heightIn(min = AvatarSize / 2 + MeeshySpacing.sm))
        Text(
            text = state.userDisplayName,
            color = MeeshyTheme.tokens.textPrimary,
            style = meeshyText(MeeshyFontSize.headline, FontWeight.Bold, rounded = true),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        if (state.userHandle.isNotEmpty()) {
            Text(
                text = "@${state.userHandle}",
                color = MeeshyTheme.tokens.textMuted,
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
private fun BannerSlot(slot: OnboardingProfileSlot, onChoose: () -> Unit) {
    val description = stringResource(R.string.onboarding_profile_banner_a11y)
    val uploading = stringResource(R.string.onboarding_profile_uploading_a11y)
    val shape = RoundedCornerShape(BannerRadius)
    Box(
        modifier = Modifier
            .testTag("onboarding.profile.banner")
            .fillMaxWidth()
            .aspectRatio(BANNER_RATIO)
            .clip(shape)
            .background(MeeshyGradients.brand)
            .clickable(enabled = !slot.isUploading, role = Role.Button, onClick = onChoose)
            .semantics {
                contentDescription = description
                if (slot.isUploading) stateDescription = uploading
            },
        contentAlignment = Alignment.Center,
    ) {
        val model = slotModel(slot)
        if (model != null) {
            AsyncImage(model = model, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
                Icon(MeeshyIcons.AddPhoto, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(20.dp))
                Text(
                    text = stringResource(R.string.onboarding_profile_banner_add),
                    color = MeeshyPalette.White,
                    style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
                )
            }
        }
        if (slot.isUploading) UploadSpinner(Modifier.align(Alignment.TopEnd).padding(MeeshySpacing.sm))
    }
}

@Composable
private fun AvatarSlot(slot: OnboardingProfileSlot, name: String, modifier: Modifier, onChoose: () -> Unit) {
    val description = stringResource(R.string.onboarding_profile_avatar_a11y)
    val uploading = stringResource(R.string.onboarding_profile_uploading_a11y)
    val ring = MeeshyTheme.tokens.backgroundPrimary
    Box(
        modifier = modifier
            .testTag("onboarding.profile.avatar")
            .size(AvatarSize)
            .clip(CircleShape)
            .clickable(enabled = !slot.isUploading, role = Role.Button, onClick = onChoose)
            .semantics {
                contentDescription = description
                if (slot.isUploading) stateDescription = uploading
            },
    ) {
        val local = slot.pending?.let(::localPreview)
        if (local != null) {
            AsyncImage(model = local, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            MeeshyAvatar(name = name, size = AvatarSize, imageUrl = slot.confirmed)
        }
        Box(Modifier.fillMaxSize().border(3.dp, ring, CircleShape))
        if (slot.isUploading) UploadSpinner(Modifier.align(Alignment.Center))
    }
    AvatarBadge(modifier.size(AvatarSize))
}

/** Le badge « + » posé au bas de l'avatar : il dit qu'on peut y toucher. Décoratif pour le lecteur d'écran. */
@Composable
private fun AvatarBadge(modifier: Modifier) {
    Box(modifier = modifier, contentAlignment = Alignment.BottomEnd) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(MeeshyGradients.brand)
                .border(2.dp, MeeshyTheme.tokens.backgroundPrimary, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.PhotoCameraOutlined, contentDescription = null, tint = MeeshyPalette.White, modifier = Modifier.size(16.dp))
        }
    }
}

@Composable
private fun UploadSpinner(modifier: Modifier, size: Dp = 22.dp) {
    Box(
        modifier = modifier.size(size + 8.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.35f)),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(Modifier.size(size), color = MeeshyPalette.White, strokeWidth = 2.dp)
    }
}

/** Un échec se dit en une ligne ; « Réessayer » renvoie chaque image qui a échoué, telle quelle (iOS `failureNotice`). */
@Composable
private fun ProfileFailures(state: OnboardingUiState, actions: OnboardingCardActions) {
    if (state.profileCard.failedTargets.isEmpty()) return
    Row(
        modifier = Modifier.fillMaxWidth().testTag("onboarding.profile.failed"),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Icon(MeeshyIcons.Error, contentDescription = null, tint = MeeshyTheme.tokens.errorInk, modifier = Modifier.size(18.dp))
        Text(
            text = stringResource(R.string.onboarding_profile_failed),
            modifier = Modifier.weight(1f),
            color = MeeshyTheme.tokens.errorInk,
            style = meeshyText(MeeshyFontSize.subhead, FontWeight.Medium),
        )
        Box(
            modifier = Modifier
                .heightIn(min = 44.dp)
                .clip(CircleShape)
                .clickable(role = Role.Button, onClick = actions.retryFailedProfileImages)
                .padding(horizontal = MeeshySpacing.md)
                .testTag("onboarding.profile.retry"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = stringResource(R.string.onboarding_profile_retry),
                color = MeeshyPalette.Indigo500,
                style = meeshyText(MeeshyFontSize.subhead, FontWeight.SemiBold),
            )
        }
    }
}

/** Ce que la bannière montre : l'aperçu local pendant l'envoi, sinon l'image servie (résolue au site unique). */
@Composable
private fun slotModel(slot: OnboardingProfileSlot): Any? {
    slot.pending?.let(::localPreview)?.let { return it }
    return resolveServedImageUrl(slot.confirmed, LocalMediaBaseUrl.current)
}

private fun localPreview(path: String): File? = path.takeIf { it.isNotEmpty() }?.let(::File)?.takeIf { it.exists() }
