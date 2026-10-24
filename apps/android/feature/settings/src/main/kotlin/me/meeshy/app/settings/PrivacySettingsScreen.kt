package me.meeshy.app.settings

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Group
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Photo
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.PrivacyCatalog
import me.meeshy.sdk.model.PrivacyCategory
import me.meeshy.sdk.model.PrivacyInfoTopic
import me.meeshy.sdk.model.PrivacyToggle
import me.meeshy.ui.component.chrome.CollapsibleHeaderPage
import me.meeshy.ui.component.chrome.MeeshyBackground
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsInfo
import me.meeshy.ui.component.settings.SettingsInfoOverlay
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSectionHeader
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.component.settings.SettingsSwitchRow
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Privacy & visibility settings screen — port of iOS `PrivacySettingsView`. Tinted cards, one per
 * [PrivacyCategory], each row a coloured icon tile with an optional "(i)" explanation; the five
 * toggles without any effect yet are greyed out ("coming soon", 0.55, inert). The Location section
 * is a composable slot inserted between Contacts and Media; Encryption closes the page, dimmed.
 * Pure projection of [PrivacySettingsViewModel]; the rules live in `PrivacyCatalog`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrivacySettingsScreen(
    onBack: () -> Unit,
    viewModel: PrivacySettingsViewModel = hiltViewModel(),
    locationSection: @Composable (PrivacyUiState) -> Unit = { state ->
        PrivacyLocationSection(state, viewModel)
    },
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    MeeshyBackground {
        CollapsibleHeaderPage(
            title = stringResource(R.string.privacy_title),
            onBack = onBack,
            titleColor = MeeshyTheme.tokens.textPrimary,
            backArrowColor = MeeshyPalette.Indigo500,
            backgroundColor = MeeshyTheme.tokens.backgroundPrimary,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.xl),
            ) {
                PrivacyCategory.entries.forEach { category ->
                    PrivacyCategoryCard(category, state, viewModel)
                    if (category == PrivacyCategory.CONTACTS_GROUPS) locationSection(state)
                }
                EncryptionComingSoonSection()
                Spacer(Modifier.height(MeeshySpacing.xl))
            }
        }
    }
    SettingsInfoOverlay(
        info = state.presentedInfo?.let { settingsInfo(it) },
        onDismiss = viewModel::dismissInfo,
    )
}

@Composable
private fun PrivacyLocationSection(state: PrivacyUiState, viewModel: PrivacySettingsViewModel) {
    Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.md)) {
        SettingsSectionHeader(
            title = stringResource(R.string.location_settings_title),
            icon = Icons.Filled.LocationOn,
            color = MeeshyPalette.Info,
        )
        SettingsCard(tint = MeeshyPalette.Info) {
            LocationSharingSettingsSection(
                preferences = state.locationSharing,
                accent = MeeshyPalette.Indigo500,
                onSelectPrecision = viewModel::setLocationPrecision,
                onSelectMapStyle = viewModel::setLocationMapStyle,
            )
        }
    }
}

@Composable
private fun PrivacyCategoryCard(
    category: PrivacyCategory,
    state: PrivacyUiState,
    viewModel: PrivacySettingsViewModel,
) {
    val tint = categoryColor(category)
    val toggles = PrivacyCatalog.descriptors.filter { it.category == category }.map { it.toggle }
    Column(verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.md)) {
        SettingsSectionHeader(
            title = stringResource(categoryTitle(category)),
            icon = categoryIcon(category),
            color = tint,
        )
        SettingsCard(tint = tint) {
            toggles.forEachIndexed { index, toggle ->
                if (index > 0) SettingsSeparator(tint = tint)
                PrivacyToggleRow(toggle, PrivacyCatalog.isEnabled(state.preferences, toggle), viewModel)
            }
        }
    }
}

@Composable
private fun PrivacyToggleRow(toggle: PrivacyToggle, checked: Boolean, viewModel: PrivacySettingsViewModel) {
    val title = stringResource(toggleLabel(toggle))
    val icon = toggleIcon(toggle)
    val color = toggleColor(toggle)
    if (PrivacyCatalog.isComingSoon(toggle)) {
        val spoken = "$title — ${stringResource(R.string.settings_privacy_coming_soon_a11y)}"
        SettingsRow(
            icon = icon,
            title = title,
            color = color,
            modifier = Modifier
                .alpha(COMING_SOON_ALPHA)
                .clearAndSetSemantics { contentDescription = spoken },
            trailing = {
                Text(
                    text = stringResource(R.string.settings_privacy_coming_soon),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                )
            },
        )
        return
    }
    val topic = PrivacyCatalog.infoTopic(toggle)
    SettingsSwitchRow(
        icon = icon,
        title = title,
        color = color,
        checked = checked,
        onCheckedChange = { viewModel.setToggle(toggle, it) },
        info = topic?.let { settingsInfo(it, title) },
        onInfo = topic?.let { shown -> { _: SettingsInfo -> viewModel.showInfo(shown) } },
    )
}

@Composable
private fun EncryptionComingSoonSection() {
    // Mirrors iOS: E2EE is not yet operational, so the section is shown dimmed (0.55) and
    // non-interactive with a "coming soon / disabled" status — never editable.
    val tint = MeeshyPalette.TileBlue
    val spoken = stringResource(R.string.settings_privacy_encryption_coming_soon_a11y)
    Column(
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(MeeshySpacing.md),
        modifier = Modifier
            .fillMaxWidth()
            .alpha(COMING_SOON_ALPHA)
            .clearAndSetSemantics { contentDescription = spoken },
    ) {
        SettingsSectionHeader(
            title = stringResource(R.string.privacy_section_encryption),
            icon = Icons.Filled.Security,
            color = tint,
        )
        SettingsCard(tint = tint) {
            SettingsRow(
                icon = Icons.Filled.HourglassEmpty,
                title = stringResource(R.string.privacy_encryption_coming_soon),
                color = tint,
                trailing = {
                    Text(
                        text = stringResource(R.string.privacy_encryption_disabled),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MeeshyTheme.tokens.textSecondary,
                    )
                },
            )
        }
    }
}

@Composable
private fun settingsInfo(topic: PrivacyInfoTopic, title: String? = null): SettingsInfo {
    val (titleRes, messageRes) = infoStrings(topic)
    return SettingsInfo(
        id = "privacy.${topic.name.lowercase()}",
        title = title ?: stringResource(titleRes),
        message = stringResource(messageRes),
    )
}

private fun infoStrings(topic: PrivacyInfoTopic): Pair<Int, Int> = when (topic) {
    PrivacyInfoTopic.ONLINE_STATUS ->
        R.string.privacy_online_status to R.string.settings_privacy_online_status_info
    PrivacyInfoTopic.NOTIFY_CONTACTS_ON_RETURN ->
        R.string.settings_privacy_notify_contacts_on_return to R.string.settings_privacy_notify_contacts_on_return_info
    PrivacyInfoTopic.READ_RECEIPTS ->
        R.string.privacy_read_receipts to R.string.settings_privacy_read_receipts_info
    PrivacyInfoTopic.HIDE_FROM_CONTACT_SEARCH ->
        R.string.settings_privacy_hide_from_contact_search to R.string.settings_privacy_hide_from_contact_search_info
    PrivacyInfoTopic.CALLS_NON_CONTACTS ->
        R.string.privacy_calls_non_contacts to R.string.settings_privacy_calls_non_contacts_info
    PrivacyInfoTopic.ANALYTICS ->
        R.string.privacy_analytics to R.string.settings_privacy_analytics_info
}

private const val COMING_SOON_ALPHA = 0.55f

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
    PrivacyCategory.VISIBILITY -> MeeshyPalette.TileAmethyst
    PrivacyCategory.CONTACTS_GROUPS -> MeeshyPalette.Indigo500
    PrivacyCategory.MEDIA_DATA -> MeeshyPalette.TileSaffron
}

private fun toggleLabel(toggle: PrivacyToggle): Int = when (toggle) {
    PrivacyToggle.SHOW_ONLINE_STATUS -> R.string.privacy_online_status
    PrivacyToggle.NOTIFY_CONTACTS_ON_RETURN -> R.string.settings_privacy_notify_contacts_on_return
    PrivacyToggle.SHOW_LAST_SEEN -> R.string.privacy_last_seen
    PrivacyToggle.SHOW_READ_RECEIPTS -> R.string.privacy_read_receipts
    PrivacyToggle.SHOW_TYPING_INDICATOR -> R.string.privacy_typing_indicator
    PrivacyToggle.HIDE_PROFILE_FROM_SEARCH -> R.string.settings_privacy_hide_from_contact_search
    PrivacyToggle.ALLOW_CONTACT_REQUESTS -> R.string.privacy_contact_requests
    PrivacyToggle.ALLOW_GROUP_INVITES -> R.string.privacy_group_invites
    PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS -> R.string.privacy_calls_non_contacts
    PrivacyToggle.SAVE_MEDIA_TO_GALLERY -> R.string.privacy_save_media
    PrivacyToggle.ALLOW_ANALYTICS -> R.string.privacy_analytics
    PrivacyToggle.SHARE_USAGE_DATA -> R.string.privacy_share_data
    PrivacyToggle.BLOCK_SCREENSHOTS -> R.string.privacy_block_screenshots
}

private fun toggleIcon(toggle: PrivacyToggle): ImageVector = when (toggle) {
    PrivacyToggle.SHOW_ONLINE_STATUS -> Icons.Filled.Circle
    PrivacyToggle.NOTIFY_CONTACTS_ON_RETURN -> Icons.Filled.History
    PrivacyToggle.SHOW_LAST_SEEN -> Icons.Filled.Schedule
    PrivacyToggle.SHOW_READ_RECEIPTS -> Icons.Filled.DoneAll
    PrivacyToggle.SHOW_TYPING_INDICATOR -> Icons.Filled.MoreHoriz
    PrivacyToggle.HIDE_PROFILE_FROM_SEARCH -> Icons.Filled.Search
    PrivacyToggle.ALLOW_CONTACT_REQUESTS -> Icons.Filled.PersonAdd
    PrivacyToggle.ALLOW_GROUP_INVITES -> Icons.Filled.Groups
    PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS -> Icons.Filled.Phone
    PrivacyToggle.SAVE_MEDIA_TO_GALLERY -> Icons.Filled.Download
    PrivacyToggle.ALLOW_ANALYTICS -> Icons.Filled.BarChart
    PrivacyToggle.SHARE_USAGE_DATA -> Icons.Filled.Share
    PrivacyToggle.BLOCK_SCREENSHOTS -> Icons.Filled.CameraAlt
}

private fun toggleColor(toggle: PrivacyToggle): Color = when (toggle) {
    PrivacyToggle.SHOW_ONLINE_STATUS, PrivacyToggle.SAVE_MEDIA_TO_GALLERY -> MeeshyPalette.Success
    PrivacyToggle.NOTIFY_CONTACTS_ON_RETURN -> MeeshyPalette.TileTeal
    PrivacyToggle.SHOW_LAST_SEEN, PrivacyToggle.ALLOW_GROUP_INVITES, PrivacyToggle.ALLOW_ANALYTICS -> MeeshyPalette.Info
    PrivacyToggle.SHOW_READ_RECEIPTS -> MeeshyPalette.TileBlue
    PrivacyToggle.SHOW_TYPING_INDICATOR -> MeeshyPalette.TileSaffron
    PrivacyToggle.HIDE_PROFILE_FROM_SEARCH, PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS,
    PrivacyToggle.BLOCK_SCREENSHOTS -> MeeshyPalette.TileCoral
    PrivacyToggle.ALLOW_CONTACT_REQUESTS -> MeeshyPalette.Indigo500
    PrivacyToggle.SHARE_USAGE_DATA -> MeeshyPalette.TileAmethyst
}
