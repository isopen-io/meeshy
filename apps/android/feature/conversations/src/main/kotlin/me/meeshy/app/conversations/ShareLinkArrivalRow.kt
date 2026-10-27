package me.meeshy.app.conversations

import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CountryFlag
import me.meeshy.sdk.model.LanguageData
import me.meeshy.sdk.model.ShareLinkArrivalEntry
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import java.util.Locale

/**
 * Un arrivant : avatar, nom, drapeau du pays, badge « sans compte », langue, ancienneté relative. La MÊME
 * ligne sert la carte « Arrivés récemment » et la liste complète ; TalkBack la lit d'un seul tenant.
 * Miroir de `ShareLinkArrivalRow` (iOS). L'avatar est demandé à sa plus petite taille (36 dp).
 */
@Composable
internal fun ShareLinkArrivalRow(entry: ShareLinkArrivalEntry, modifier: Modifier = Modifier) {
    val badge = stringResource(R.string.shareLink_detail_noAccountBadge)
    val flag = remember(entry.country) { entry.country?.let(CountryFlag::emoji)?.takeIf { it.isNotEmpty() } }
    val language = remember(entry.language) { entry.language?.takeIf { it.isNotBlank() }?.let(LanguageData::autonym) }
    val age = remember(entry.joinedAt) { relativeAge(entry.joinedAtMillis) }
    val countryName = remember(entry.country) {
        entry.country?.takeIf { it.length == 2 }?.let { Locale("", it).displayCountry }?.takeIf { it.isNotBlank() }
    }
    val spoken = remember(entry, badge, countryName, language, age) {
        listOfNotNull(entry.displayName, badge.takeIf { entry.isAnonymous }, countryName, language, age)
            .filter { it.isNotEmpty() }.joinToString(", ")
    }
    Row(
        modifier = modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(name = entry.displayName, size = 36.dp, imageUrl = entry.avatar)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = entry.displayName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                flag?.let { Text(it) }
                if (entry.isAnonymous) {
                    Text(
                        text = badge,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MeeshyPalette.Indigo400,
                        maxLines = 1,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(MeeshyPalette.Indigo400.copy(alpha = 0.14f))
                            .padding(horizontal = MeeshySpacing.sm, vertical = MeeshySpacing.xxs),
                    )
                }
            }
            language?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary, maxLines = 1)
            }
        }
        Text(age, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary, maxLines = 1)
    }
}

private fun relativeAge(epochMillis: Long): String =
    if (epochMillis <= 0L) {
        ""
    } else {
        DateUtils.getRelativeTimeSpanString(
            epochMillis,
            System.currentTimeMillis(),
            DateUtils.MINUTE_IN_MILLIS,
            DateUtils.FORMAT_ABBREV_RELATIVE,
        ).toString()
    }

/** La silhouette d'une arrivée, à la taille de la vraie ligne : rien ne saute quand la page arrive. */
@Composable
internal fun ShareLinkArrivalSkeletonRow(modifier: Modifier = Modifier) {
    val loading = stringResource(R.string.shareLink_arrivals_loading)
    Row(
        modifier = modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = loading },
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshySkeletonBox(Modifier.size(36.dp), shape = CircleShape)
        Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
            MeeshySkeletonBox(Modifier.size(140.dp, 14.dp))
            MeeshySkeletonBox(Modifier.size(80.dp, 11.dp))
        }
        Row(Modifier.weight(1f).height(11.dp), horizontalArrangement = Arrangement.End) {
            MeeshySkeletonBox(Modifier.size(44.dp, 11.dp))
        }
    }
}
