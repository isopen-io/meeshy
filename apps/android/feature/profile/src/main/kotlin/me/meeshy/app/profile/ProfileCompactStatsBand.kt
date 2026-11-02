package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.MeeshyShimmerPlaceholder
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyGradients
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

internal const val PROFILE_STATS_CHIPS_TAG = "profile-stats-chips"
internal const val PROFILE_STATS_SKELETON_TAG = "profile-stats-skeleton"

private const val SKELETON_BLOCKS = 4
private const val SKELETON_TINT_ALPHA = 0.1f
private val SKELETON_HEIGHT = 56.dp

/**
 * « Membre depuis » en date longue, dans la langue de l'appareil (« 14 novembre 2023 »,
 * « November 14, 2023 ») — jamais une langue figée.
 */
internal fun memberSinceLongDate(
    epochMillis: Long,
    locale: Locale,
    timeZone: TimeZone = TimeZone.getDefault(),
): String = DateFormat.getDateInstance(DateFormat.LONG, locale)
    .apply { this.timeZone = timeZone }
    .format(Date(epochMillis))

/** Ce que TalkBack lit d'une puce : « valeur libellé » (« 12 Messages »), comme VoiceOver. */
internal fun statChipSpokenLabel(value: Int, label: String): String = "$value $label"

/**
 * La bande compacte de statistiques d'un tiers (miroir de `compactStatsBand` iOS) : la ligne de
 * réglage « Membre depuis », puis quatre puces égales — ou leur squelette tant que les chiffres
 * chargent sur cache vide.
 */
@Composable
internal fun ProfileCompactStatsBand(stats: ProfileCompactStats, accent: Color) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        stats.memberSinceEpochMillis?.let { ProfileMemberSinceCard(it, accent) }
        when (val chips = stats.chips) {
            is ProfileStatChips.Shown -> ProfileStatChipsRow(chips.chips, accent)
            ProfileStatChips.Loading -> ProfileStatChipsSkeleton(accent)
            null -> Unit
        }
    }
}

@Composable
private fun ProfileMemberSinceCard(epochMillis: Long, accent: Color) {
    val locale = LocalConfiguration.current.locales[0]
    val date = remember(epochMillis, locale) { memberSinceLongDate(epochMillis, locale) }
    SettingsCard(tint = accent) {
        SettingsRow(
            icon = MeeshyIcons.History,
            title = stringResource(R.string.profile_stats_memberSince),
            color = accent,
            value = date,
        ) {
            Text(
                text = date,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
        }
    }
}

@Composable
private fun ProfileStatChipsRow(chips: List<ProfileStatChip>, accent: Color) {
    Row(
        modifier = Modifier.fillMaxWidth().testTag(PROFILE_STATS_CHIPS_TAG),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        chips.forEach { chip ->
            ProfileStatChipView(chip = chip, accent = accent, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun ProfileStatChipView(chip: ProfileStatChip, accent: Color, modifier: Modifier = Modifier) {
    val label = stringResource(chip.kind.labelRes())
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    val dark = MeeshyTheme.isDark
    Column(
        modifier = modifier
            .clip(shape)
            .background(MeeshyGradients.surfaceGradient(accent, dark), shape)
            .border(1.dp, MeeshyGradients.tintedBorder(accent, dark), shape)
            .padding(vertical = MeeshySpacing.smPlus, horizontal = MeeshySpacing.xs)
            .clearAndSetSemantics { contentDescription = statChipSpokenLabel(chip.value, label) },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Icon(imageVector = chip.kind.icon(), contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
        Text(
            text = chip.value.toString(),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MeeshyTheme.tokens.textMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** Quatre blocs de 56 dp qui respirent, annoncés « Chargement des statistiques ». */
@Composable
private fun ProfileStatChipsSkeleton(accent: Color) {
    val spoken = stringResource(R.string.profile_details_stats_loading)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .testTag(PROFILE_STATS_SKELETON_TAG)
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        repeat(SKELETON_BLOCKS) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .height(SKELETON_HEIGHT)
                    .clip(RoundedCornerShape(MeeshyRadius.smPlus)),
            ) {
                MeeshyShimmerPlaceholder(base = accent.copy(alpha = SKELETON_TINT_ALPHA))
            }
        }
    }
}

private fun ProfileStatChipKind.labelRes(): Int = when (this) {
    ProfileStatChipKind.MESSAGES -> R.string.profile_stats_messagesShort
    ProfileStatChipKind.TRANSLATIONS -> R.string.profile_stat_translations
    ProfileStatChipKind.LANGUAGES -> R.string.profile_stat_languages
    ProfileStatChipKind.DAYS -> R.string.profile_stats_daysShort
}

private fun ProfileStatChipKind.icon(): ImageVector = when (this) {
    ProfileStatChipKind.MESSAGES -> MeeshyIcons.Send
    ProfileStatChipKind.TRANSLATIONS -> MeeshyIcons.Translate
    ProfileStatChipKind.LANGUAGES -> MeeshyIcons.Globe
    ProfileStatChipKind.DAYS -> MeeshyIcons.CheckCircleFilled
}
