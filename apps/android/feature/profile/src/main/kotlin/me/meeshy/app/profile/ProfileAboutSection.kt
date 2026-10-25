package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.NumberFormat

internal const val PROFILE_BIO_CARD_TAG = "profile-bio-card"
internal const val PROFILE_E2EE_BADGE_TAG = "profile-e2ee-badge"
internal const val PROFILE_COMPLETION_RING_TAG = "profile-completion-ring"

private const val BIO_MAX_LINES = 5
private const val CHIP_FILL_ALPHA = 0.12f
private const val CHIP_BORDER_ALPHA = 0.2f
private val COMPLETION_RING_SIZE = 100.dp

/**
 * Le contenu de « À propos » (miroir de `aboutSection` iOS) : carte de bio sur cinq lignes au plus,
 * pastilles de langue, puces fuseau et pays, badge E2EE vert, puis l'anneau de complétude centré
 * dans l'onglet. Chaque bloc absent de [about] n'est pas dessiné.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ProfileAboutSection(about: ProfileAboutPresentation, accent: Color) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        about.bio?.let { ProfileBioCard(it, accent) }
        if (about.languages.isNotEmpty()) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                about.languages.forEach { ProfileInfoChip(leadingText = it.flag, text = it.name, accent = accent) }
            }
        }
        if (about.timezone != null || about.country != null) {
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
            ) {
                about.timezone?.let { ProfileInfoChip(icon = true, text = it, accent = accent) }
                about.country?.let { ProfileInfoChip(leadingText = it.flag.ifEmpty { null }, text = it.name, accent = accent) }
            }
        }
        if (about.hasE2EE) ProfileE2eeBadge()
        about.completionPercent?.let { ProfileCompletionGauge(it, accent) }
    }
}

/** La carte de bio : texte secondaire sur fond teinté d'accent, cinq lignes au plus. */
@Composable
private fun ProfileBioCard(bio: String, accent: Color) {
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    val dark = MeeshyTheme.isDark
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(MeeshyGradients.surfaceGradient(accent, dark), shape)
            .border(1.dp, MeeshyGradients.tintedBorder(accent, dark), shape)
            .padding(MeeshySpacing.lg)
            .testTag(PROFILE_BIO_CARD_TAG),
    ) {
        Text(
            text = bio,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            maxLines = BIO_MAX_LINES,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * Une puce d'information (miroir de `infoChip` / `languagePill` iOS) : drapeau ou horloge, puis le
 * texte, dans une capsule teintée d'accent.
 */
@Composable
private fun ProfileInfoChip(text: String, accent: Color, leadingText: String? = null, icon: Boolean = false) {
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    Row(
        modifier = Modifier
            .clip(shape)
            .background(accent.copy(alpha = CHIP_FILL_ALPHA), shape)
            .border(1.dp, accent.copy(alpha = CHIP_BORDER_ALPHA), shape)
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xsPlus)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon) {
            Icon(imageVector = MeeshyIcons.ScheduleFilled, contentDescription = null, tint = accent, modifier = Modifier.size(12.dp))
        }
        leadingText?.let {
            Text(text = it, style = MaterialTheme.typography.labelLarge, modifier = Modifier.clearAndSetSemantics {})
        }
        Text(
            text = text,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}

/** Le badge vert « Chiffrement de bout en bout activé » (miroir de `e2eeBadge` iOS), en capsule. */
@Composable
private fun ProfileE2eeBadge() {
    val success = MeeshyTheme.tokens.success
    val shape = RoundedCornerShape(MeeshyRadius.pill)
    Row(
        modifier = Modifier
            .clip(shape)
            .background(success.copy(alpha = MeeshyOpacity.light), shape)
            .border(1.dp, success.copy(alpha = MeeshyOpacity.medium), shape)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.sm)
            .semantics(mergeDescendants = true) {}
            .testTag(PROFILE_E2EE_BADGE_TAG),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = MeeshyIcons.ShieldFilled, contentDescription = null, tint = success, modifier = Modifier.size(14.dp))
        Text(
            text = stringResource(R.string.profile_e2ee_enabled),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            color = success,
        )
    }
}

/** L'anneau de complétude centré dans l'onglet (miroir de `ProfileCompletionRing` iOS), « 42 % » au centre. */
@Composable
private fun ProfileCompletionGauge(percent: Int, accent: Color) {
    val locale = LocalConfiguration.current.locales[0]
    val label = remember(percent, locale) { NumberFormat.getPercentInstance(locale).format(percent / 100.0) }
    val spoken = stringResource(R.string.profile_completion, percent)
    Box(
        modifier = Modifier.fillMaxWidth().padding(top = MeeshySpacing.xs),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(COMPLETION_RING_SIZE)
                .testTag(PROFILE_COMPLETION_RING_TAG)
                .clearAndSetSemantics { contentDescription = spoken },
            contentAlignment = Alignment.Center,
        ) {
            ProfileCompletionRing(
                percent = percent,
                color = accent,
                track = MeeshyTheme.tokens.backgroundTertiary,
                modifier = Modifier.size(COMPLETION_RING_SIZE),
            )
            Text(
                text = label,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}
