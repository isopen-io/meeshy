package me.meeshy.app.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.setValue
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoted
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.mediacache.ByteSizeFormatter
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.chrome.leadingNavigationIcon
import me.meeshy.ui.component.chrome.leadingNavigationLabel
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsSectionHeader
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Stockage (iOS `DataStorageView`) : la carte « Cache média » (taille totale mesurée fichier par fichier) puis la purge
 * sélective par type et par domaine. Première mesure = squelette ; les suivantes gardent l'ancienne taille visible.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DataStorageScreen(
    onBack: () -> Unit,
    viewModel: SelectiveCachePurgeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    MeeshyBackground {
        Scaffold(
            containerColor = Color.Transparent,
            topBar = {
                TopAppBar(
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Transparent,
                        scrolledContainerColor = Color.Transparent,
                        titleContentColor = MeeshyTheme.tokens.textPrimary,
                        navigationIconContentColor = MeeshyTheme.tokens.textPrimary,
                    ),
                    title = { Text(stringResource(R.string.data_storage_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                leadingNavigationIcon(),
                                contentDescription = leadingNavigationLabel(stringResource(R.string.settings_back)),
                            )
                        }
                    },
                )
            },
        ) { padding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                MediaCacheCard(totalBytes = state.report?.totalDiskBytes)
                SelectiveCachePurgeContent(state = state, onEvent = viewModel::onEvent)
            }
        }
    }
}

@Composable
private fun MediaCacheCard(totalBytes: Long?) {
    val tint = MeeshyPalette.Indigo500
    var openNote by rememberOpenNote()
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        MeeshyInfoNoted(
            note = MeeshyInfoNote(
                question = stringResource(R.string.data_storage_cache_question),
                text = stringResource(R.string.data_storage_cache_description),
            ),
            openNoteId = openNote,
            onOpenNoteIdChange = { openNote = it },
        ) {
            SettingsSectionHeader(stringResource(R.string.data_storage_section_cache), MeeshyIcons.Storage, tint)
        }
        SettingsCard(tint = tint) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
                verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                    Icon(MeeshyIcons.Storage, contentDescription = null, tint = tint, modifier = Modifier.size(24.dp))
                    Text(
                        text = stringResource(R.string.data_storage_cache_size),
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textPrimary,
                        modifier = Modifier.weight(1f),
                    )
                    if (totalBytes == null) {
                        MeeshySkeletonBox(modifier = Modifier.size(width = 56.dp, height = 18.dp))
                    } else {
                        Text(
                            text = ByteSizeFormatter.format(totalBytes),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MeeshyTheme.tokens.textPrimary,
                        )
                    }
                }
            }
        }
    }
}
