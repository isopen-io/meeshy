package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/** Données (iOS `dataSection`) : stockage, téléchargement des médias, packs, export. */
@Composable
internal fun SettingsDataSection(
    rows: List<SettingsHubRow>,
    onOpenMediaCache: () -> Unit,
    onOpenAutoDownload: () -> Unit,
    onOpenPacks: () -> Unit,
    onOpenDataExport: () -> Unit,
) {
    val tint = MeeshyPalette.Warning
    SettingsGroup(stringResource(R.string.settings_section_data), MeeshyIcons.Storage, tint) {
        SettingsRows(rows, tint) { row ->
            when (row.id) {
                SettingsHubRowId.STORAGE -> SettingsChevronRow(MeeshyIcons.Storage, stringResource(R.string.settings_storage), tint, onOpenMediaCache)
                SettingsHubRowId.MEDIA_DOWNLOAD -> SettingsChevronRow(MeeshyIcons.Download, stringResource(R.string.settings_media_download), tint, onOpenAutoDownload)
                SettingsHubRowId.PACKS -> SettingsChevronRow(MeeshyIcons.Shopping, stringResource(R.string.settings_packs_title), tint, onOpenPacks)
                SettingsHubRowId.EXPORT_DATA -> SettingsChevronRow(MeeshyIcons.Share, stringResource(R.string.settings_export_data), tint, onOpenDataExport)
                else -> Unit
            }
        }
    }
}
