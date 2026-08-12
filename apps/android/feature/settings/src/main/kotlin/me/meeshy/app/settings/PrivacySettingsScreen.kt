package me.meeshy.app.settings

import androidx.compose.foundation.background
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
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.PrivacyCatalog
import me.meeshy.sdk.model.PrivacyCategory
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Privacy & visibility settings screen (feature-parity §L) — port of iOS `PrivacySettingsView`.
 * One accent-coherent section per [PrivacyCategory], each a list of Material switch rows driven by
 * the pure `PrivacyCatalog.sections` projection, plus a non-interactive "coming soon" encryption
 * section mirroring iOS's greyed-out block. Pure glue over [PrivacySettingsViewModel]; the
 * persisted block and the write logic live in the tested store + ViewModel SSOTs.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacySettingsScreen(
    onBack: () -> Unit,
    viewModel: PrivacySettingsViewModel = hiltViewModel(),
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
                    title = { Text(stringResource(R.string.privacy_title)) },
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
                PrivacyCategory.entries.forEach { category ->
                    PrivacySection(
                        title = stringResource(categoryTitle(category)),
                        icon = categoryIcon(category),
                        iconColor = categoryColor(category),
                    ) {
                        togglesFor(category).forEach { toggle ->
                            PrivacyToggleRow(
                                label = stringResource(toggleLabel(toggle)),
                                checked = PrivacyCatalog.isEnabled(state.preferences, toggle),
                                onCheckedChange = { viewModel.setToggle(toggle, it) },
                            )
                        }
                    }
                }
                EncryptionComingSoonSection()
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
}

@Composable
private fun PrivacySection(
    title: String,
    icon: ImageVector,
    iconColor: Color,
    content: @Composable () -> Unit,
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
        content()
        Spacer(Modifier.height(MeeshySpacing.sm))
    }
}

@Composable
private fun PrivacyToggleRow(
    label: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = checked, onCheckedChange = onCheckedChange)
    }
}

@Composable
private fun EncryptionComingSoonSection() {
    // Mirrors iOS: E2EE is not yet operational, so the section is shown greyed-out and
    // non-interactive with a "coming soon / disabled" status — never editable.
    PrivacySection(
        title = stringResource(R.string.privacy_section_encryption),
        icon = Icons.Filled.Lock,
        iconColor = MeeshyPalette.Info,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .alpha(0.55f)
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = stringResource(R.string.privacy_encryption_coming_soon),
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.weight(1f),
            )
            Text(
                text = stringResource(R.string.privacy_encryption_disabled),
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}

private fun togglesFor(category: PrivacyCategory): List<PrivacyToggle> =
    PrivacyCatalog.descriptors
        .filter { it.category == category }
        .map { it.toggle }

private fun categoryTitle(category: PrivacyCategory): Int = when (category) {
    PrivacyCategory.VISIBILITY -> R.string.privacy_section_visibility
    PrivacyCategory.CONTACTS_GROUPS -> R.string.privacy_section_contacts
    PrivacyCategory.MEDIA_DATA -> R.string.privacy_section_media
}

private fun categoryIcon(category: PrivacyCategory): ImageVector = when (category) {
    PrivacyCategory.VISIBILITY -> Icons.Filled.Visibility
    PrivacyCategory.CONTACTS_GROUPS -> Icons.Filled.Group
    PrivacyCategory.MEDIA_DATA -> Icons.Filled.Photo
}

private fun categoryColor(category: PrivacyCategory): Color = when (category) {
    PrivacyCategory.VISIBILITY -> MeeshyPalette.Purple600
    PrivacyCategory.CONTACTS_GROUPS -> MeeshyPalette.Indigo500
    PrivacyCategory.MEDIA_DATA -> MeeshyPalette.Warning
}

private fun toggleLabel(toggle: PrivacyToggle): Int = when (toggle) {
    PrivacyToggle.SHOW_ONLINE_STATUS -> R.string.privacy_online_status
    PrivacyToggle.SHOW_LAST_SEEN -> R.string.privacy_last_seen
    PrivacyToggle.SHOW_READ_RECEIPTS -> R.string.privacy_read_receipts
    PrivacyToggle.SHOW_TYPING_INDICATOR -> R.string.privacy_typing_indicator
    PrivacyToggle.HIDE_PROFILE_FROM_SEARCH -> R.string.privacy_hide_from_search
    PrivacyToggle.ALLOW_CONTACT_REQUESTS -> R.string.privacy_contact_requests
    PrivacyToggle.ALLOW_GROUP_INVITES -> R.string.privacy_group_invites
    PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS -> R.string.privacy_calls_non_contacts
    PrivacyToggle.SAVE_MEDIA_TO_GALLERY -> R.string.privacy_save_media
    PrivacyToggle.ALLOW_ANALYTICS -> R.string.privacy_analytics
    PrivacyToggle.SHARE_USAGE_DATA -> R.string.privacy_share_data
    PrivacyToggle.BLOCK_SCREENSHOTS -> R.string.privacy_block_screenshots
}
