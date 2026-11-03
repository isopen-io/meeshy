package me.meeshy.app.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Star
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/** Outils (iOS `toolsSection`) : favoris, enregistrés, statistiques, progression, liens de partage. */
@Composable
internal fun SettingsToolsSection(
    rows: List<SettingsHubRow>,
    onOpenStarred: () -> Unit,
    onOpenSaved: () -> Unit,
    onOpenProgression: () -> Unit,
    onOpenStats: () -> Unit,
    onOpenShareLinks: () -> Unit,
) {
    val tint = MeeshyPalette.Success
    SettingsGroup(stringResource(R.string.settings_section_tools), Icons.Filled.Build, tint) {
        SettingsRows(rows, tint) { row ->
            when (row.id) {
                SettingsHubRowId.STARRED -> SettingsChevronRow(Icons.Filled.Star, stringResource(R.string.settings_starred_messages), MeeshyPalette.Warning, onOpenStarred)
                SettingsHubRowId.SAVED -> SettingsChevronRow(Icons.Filled.Bookmark, stringResource(R.string.settings_saved_posts), MeeshyPalette.Indigo400, onOpenSaved)
                SettingsHubRowId.STATS -> SettingsChevronRow(MeeshyIcons.ChartBar, stringResource(R.string.settings_tools_stats), MeeshyPalette.Indigo300, onOpenStats)
                SettingsHubRowId.PROGRESSION -> SettingsChevronRow(MeeshyIcons.Trophy, stringResource(R.string.settings_tools_progression), MeeshyPalette.Warning, onOpenProgression)
                SettingsHubRowId.SHARE_LINKS -> SettingsChevronRow(Icons.Filled.Link, stringResource(R.string.settings_share_links), tint, onOpenShareLinks)
                else -> Unit
            }
        }
    }
}
