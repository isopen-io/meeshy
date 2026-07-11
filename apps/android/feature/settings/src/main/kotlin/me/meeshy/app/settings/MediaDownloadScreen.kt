package me.meeshy.app.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Audiotrack
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.AutoDownloadPolicy
import me.meeshy.sdk.model.MediaKind
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Media auto-download settings screen (feature-parity §L) — port of iOS
 * `MediaDownloadSettingsView`. One accent-coherent section per [MediaKind], each a
 * single-choice list of the four [AutoDownloadPolicy] options. Pure glue over
 * [MediaDownloadViewModel]; the persisted policy block and the write logic live in the
 * tested store + ViewModel SSOTs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MediaDownloadScreen(
    onBack: () -> Unit,
    viewModel: MediaDownloadViewModel = hiltViewModel(),
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
                    title = { Text(stringResource(R.string.media_download_title)) },
                    navigationIcon = {
                        IconButton(onClick = onBack) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.settings_back),
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
                    .verticalScroll(rememberScrollState()),
            ) {
                InfoBanner()
                MediaKindSection(
                    title = stringResource(R.string.media_download_images),
                    icon = Icons.Filled.Image,
                    iconColor = MeeshyPalette.Indigo500,
                    selected = state.preferences.image,
                    onSelect = { viewModel.setPolicy(MediaKind.IMAGE, it) },
                )
                MediaKindSection(
                    title = stringResource(R.string.media_download_audio),
                    icon = Icons.Filled.Audiotrack,
                    iconColor = MeeshyPalette.Purple500,
                    selected = state.preferences.audio,
                    onSelect = { viewModel.setPolicy(MediaKind.AUDIO, it) },
                )
                MediaKindSection(
                    title = stringResource(R.string.media_download_audio_translation),
                    icon = Icons.Filled.RecordVoiceOver,
                    iconColor = MeeshyPalette.Warning,
                    selected = state.preferences.audioTranslation,
                    onSelect = { viewModel.setPolicy(MediaKind.AUDIO_TRANSLATION, it) },
                )
                MediaKindSection(
                    title = stringResource(R.string.media_download_video),
                    icon = Icons.Filled.Videocam,
                    iconColor = MeeshyPalette.Error,
                    selected = state.preferences.video,
                    onSelect = { viewModel.setPolicy(MediaKind.VIDEO, it) },
                )
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun InfoBanner() {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.Info,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.size(18.dp),
        )
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.media_download_info),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}

@Composable
private fun MediaKindSection(
    title: String,
    icon: ImageVector,
    iconColor: Color,
    selected: AutoDownloadPolicy,
    onSelect: (AutoDownloadPolicy) -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        ) {
            Box(
                modifier = Modifier
                    .size(28.dp)
                    .clip(RoundedCornerShape(MeeshyRadius.sm))
                    .background(iconColor),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = MeeshyPalette.White,
                    modifier = Modifier.size(16.dp),
                )
            }
            Spacer(Modifier.width(MeeshySpacing.sm))
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Indigo500,
            )
        }
        AutoDownloadPolicy.entries.forEach { policy ->
            PolicyRow(
                label = policyLabel(policy),
                selected = policy == selected,
                onClick = { onSelect(policy) },
            )
        }
        Spacer(Modifier.height(MeeshySpacing.sm))
    }
}

@Composable
private fun PolicyRow(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        RadioButton(selected = selected, onClick = null)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun policyLabel(policy: AutoDownloadPolicy): String = stringResource(
    when (policy) {
        AutoDownloadPolicy.ALWAYS -> R.string.media_policy_always
        AutoDownloadPolicy.WIFI_AND_GOOD_CELLULAR -> R.string.media_policy_wifi_good_cellular
        AutoDownloadPolicy.WIFI_ONLY -> R.string.media_policy_wifi_only
        AutoDownloadPolicy.NEVER -> R.string.media_policy_never
    },
)
