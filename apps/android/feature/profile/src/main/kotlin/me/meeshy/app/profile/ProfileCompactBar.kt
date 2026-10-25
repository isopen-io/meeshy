package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.profile.ProfileHeaderMetrics
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

internal const val PROFILE_COMPACT_BAR_TAG = "profile-compact-bar"

/** Le retrait de début qui laisse la place au bouton Fermer (36 dp à 16 dp du bord, miroir iOS). */
internal val PROFILE_COMPACT_BAR_START_INSET = 56.dp

/**
 * Ce que la progression du repli fait de la barre compacte (miroir des modificateurs de
 * `compactPinnedBar` dans `collapsibleLayout` iOS) : elle apparaît avec la progression, ne reçoit le
 * doigt qu'au-delà de la moitié et reste muette pour TalkBack en dessous — l'identité étendue est
 * alors la seule lue, jamais les deux.
 */
@Immutable
internal data class ProfileCompactBarGating(
    val alpha: Float,
    val isInteractive: Boolean,
    val isHiddenFromAccessibility: Boolean,
) {
    companion object {
        fun of(progress: Float): ProfileCompactBarGating {
            val clamped = progress.coerceIn(0f, 1f)
            val owns = ProfileHeaderMetrics.compactBarOwnsIdentity(clamped)
            return ProfileCompactBarGating(alpha = clamped, isInteractive = owns, isHiddenFromAccessibility = !owns)
        }
    }
}

/**
 * La petite barre d'identité épinglée en haut une fois l'en-tête parti (miroir de `compactPinnedBar`
 * iOS) : avatar de 32 dp (présence, humeur), nom, `@pseudo` dans la couleur du profil, sur le fond
 * primaire, avec un retrait de 56 dp au début pour le bouton Fermer. Toucher la barre ramène en haut
 * de la fiche ; TalkBack la lit d'un bloc « nom, @pseudo ».
 */
@Composable
internal fun ProfileCompactBar(
    progress: Float,
    displayName: String,
    handle: String?,
    avatarUrl: String?,
    accent: Color,
    presence: PresenceState?,
    moodEmoji: String?,
    onTap: () -> Unit,
    onMoodTap: () -> Unit,
    modifier: Modifier = Modifier,
    insetForStatusBar: Boolean = false,
) {
    val gating = ProfileCompactBarGating.of(progress)
    val label = handle?.let { stringResource(R.string.profile_header_compact_label, displayName, it) } ?: displayName
    val semantics = if (gating.isHiddenFromAccessibility) {
        Modifier.clearAndSetSemantics { }
    } else {
        Modifier.clearAndSetSemantics {
            contentDescription = label
            role = Role.Button
            onClick { onTap(); true }
        }
    }
    val touch = if (gating.isInteractive) Modifier.clickable(onClick = onTap) else Modifier
    Column(
        modifier
            .fillMaxWidth()
            .graphicsLayer { alpha = gating.alpha }
            .then(semantics)
            .then(touch)
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .then(if (insetForStatusBar) Modifier.statusBarsPadding() else Modifier)
            .testTag(PROFILE_COMPACT_BAR_TAG),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = ProfileHeaderMetrics.COLLAPSED_BAR_DP.dp)
                .padding(start = PROFILE_COMPACT_BAR_START_INSET, end = MeeshySpacing.lg)
                .padding(vertical = MeeshySpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val moodTap = if (gating.isInteractive && moodEmoji != null) {
                Modifier.clip(CircleShape).clickable(onClick = onMoodTap)
            } else {
                Modifier
            }
            Box(moodTap) {
                MeeshyAvatar(
                    name = displayName,
                    size = 32.dp,
                    containerColor = accent,
                    presence = presence,
                    moodEmoji = moodEmoji,
                    imageUrl = avatarUrl,
                )
            }
            Spacer(Modifier.width(MeeshySpacing.smPlus))
            Column(Modifier.weight(1f)) {
                Text(
                    text = displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Bold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                handle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = accent,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = MeeshyOpacity.medium))
    }
}
