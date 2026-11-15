package me.meeshy.app.auth.invite

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.InviteFacts
import me.meeshy.ui.theme.MeeshySpacing
import java.text.NumberFormat

/** Les tuiles « personnes / langues parlées » puis la barre des langues. Miroir de `InviteGroupFacts` (iOS). */
@Composable
internal fun InviteGroupFacts(facts: InviteFacts, isDark: Boolean, modifier: Modifier = Modifier) {
    if (facts.isEmpty) return
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        if (facts.people != null || facts.languages != null) {
            Row(
                modifier = Modifier.height(IntrinsicSize.Min),
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus),
            ) {
                facts.people?.let { count ->
                    Tile(count, stringResource(if (count == 1) R.string.invite_landing_facts_person else R.string.invite_landing_facts_people), isDark, Modifier.weight(1f))
                }
                facts.languages?.let { count ->
                    Tile(count, stringResource(if (count == 1) R.string.invite_landing_facts_language else R.string.invite_landing_facts_languages), isDark, Modifier.weight(1f))
                }
            }
        }
        if (facts.shares.isNotEmpty()) {
            Column(
                modifier = Modifier.fillMaxWidth().inviteCardSurface(isDark).padding(MeeshySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                InviteSectionTitle(stringResource(R.string.invite_landing_languages_title), isDark)
                LanguageShareBar(facts.shares, isDark)
            }
        }
    }
}

@Composable
private fun Tile(value: Int, label: String, isDark: Boolean, modifier: Modifier) {
    Column(
        modifier = modifier.height(IntrinsicSize.Min).inviteCardSurface(isDark).padding(MeeshySpacing.lg).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs),
    ) {
        Text(
            text = NumberFormat.getIntegerInstance().format(value),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.ExtraBold,
            fontFamily = FontFamily.SansSerif,
            color = InviteInk.title(isDark),
        )
        Text(label, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.SemiBold, color = InviteInk.muted(isDark))
    }
}
