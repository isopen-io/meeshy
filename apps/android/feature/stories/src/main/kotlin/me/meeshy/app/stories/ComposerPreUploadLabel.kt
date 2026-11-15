package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.core.os.ConfigurationCompat
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerPreUploadCopy
import me.meeshy.sdk.model.composer.ComposerPreUploadState

/** « MONTÉE EN COURS · 34 % — 4,8 / 14,2 Mo » pour la tuile d'un média ; `null` hors montée (jamais de spinner modal). */
@Composable
internal fun rememberPreUploadLabel(state: ComposerPreUploadState): String? {
    val header = stringResource(R.string.composer_preupload_uploading)
    val units = ComposerPreUploadCopy.ByteUnits(
        kb = stringResource(R.string.composer_preupload_unit_kb),
        mb = stringResource(R.string.composer_preupload_unit_mb),
        gb = stringResource(R.string.composer_preupload_unit_gb),
    )
    val configuration = LocalConfiguration.current
    val locale = remember(configuration) { ConfigurationCompat.getLocales(configuration)[0] ?: java.util.Locale.getDefault() }
    return remember(state, header, units, locale) { ComposerPreUploadCopy.label(state, header, units, locale) }
}
