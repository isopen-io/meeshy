package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.profile.R
import me.meeshy.ui.component.settings.SettingsSectionHeader
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing

/**
 * L'onglet Détails de la fiche d'un tiers (miroir de `detailsTab` iOS) : « À propos », « Voix »,
 * puis la section « Actions » quand l'hôte en fournit une, puis « Statistiques ». Chaque section a
 * l'en-tête teinté des réglages, dans la couleur du PROFIL ([accent]) ; une section sans contenu
 * n'existe pas.
 *
 * [actions] est le point d'insertion de la section Actions : l'onglet n'en connaît ni les boutons ni
 * les règles, `null` = aucune section (ma propre fiche, plan pas encore résolu).
 */
@Composable
internal fun ProfileDetailsTab(
    details: ProfileDetailsPresentation,
    accent: Color,
    modifier: Modifier = Modifier,
    actions: (@Composable () -> Unit)? = null,
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl + MeeshySpacing.xs),
    ) {
        details.about?.let { about ->
            ProfileDetailsTabSection(R.string.profile_section_about, MeeshyIcons.PersonFilled, accent) {
                ProfileAboutSection(about, accent)
            }
        }
        details.voice?.let { sample ->
            ProfileDetailsTabSection(R.string.profile_voice_title, MeeshyIcons.Waveform, accent) {
                ProfileVoiceCard(sample, accent)
            }
        }
        actions?.let { content ->
            ProfileDetailsTabSection(R.string.profile_section_actions, MeeshyIcons.Touch, accent) { content() }
        }
        details.stats?.let { stats ->
            ProfileDetailsTabSection(R.string.profile_section_stats, MeeshyIcons.ChartBar, accent) {
                ProfileCompactStatsBand(stats, accent)
            }
        }
    }
}

/** En-tête teinté + contenu (miroir de `profileSection` iOS) ; les marges d'écran sont celles de l'hôte. */
@Composable
private fun ProfileDetailsTabSection(
    titleRes: Int,
    icon: ImageVector,
    accent: Color,
    content: @Composable () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SettingsSectionHeader(title = stringResource(titleRes), icon = icon, color = accent)
        content()
    }
}
