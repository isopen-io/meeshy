package me.meeshy.app.conversations.links

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import me.meeshy.feature.conversations.R
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La feuille « Nouveau lien de tracking » (iOS `CreateTrackingLinkView`) : URL, nom, UTM repliable, jeton personnalisé. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CreateTrackingLinkSheet(sheet: TrackingCreateSheet, accent: Color, viewModel: TrackingLinksViewModel) {
    var showUtm by rememberSaveable { mutableStateOf(false) }
    val form = sheet.form
    ModalBottomSheet(
        onDismissRequest = viewModel::dismissCreate,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = MeeshySpacing.lg)
                .padding(bottom = MeeshySpacing.lg),
            verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
        ) {
            Text(
                stringResource(R.string.links_tracking_create_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            LinkField(
                label = stringResource(R.string.links_tracking_create_field_url),
                value = form.destinationUrl,
                onValueChange = { value -> viewModel.editForm { it.copy(destinationUrl = value) } },
                accent = accent,
                placeholder = "https://meeshy.me",
                keyboardType = KeyboardType.Uri,
                lowercase = true,
            )
            LinkField(
                label = stringResource(R.string.links_tracking_create_field_name),
                value = form.name,
                onValueChange = { value -> viewModel.editForm { it.copy(name = value) } },
                accent = accent,
                placeholder = stringResource(R.string.links_tracking_create_field_name_placeholder),
            )
            UtmToggle(expanded = showUtm, onToggle = { showUtm = !showUtm })
            AnimatedVisibility(
                visible = showUtm,
                enter = expandVertically() + fadeIn(),
                exit = shrinkVertically() + fadeOut(),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
                    LinkField(
                        stringResource(R.string.links_tracking_create_utm_campaign), form.campaign,
                        { value -> viewModel.editForm { it.copy(campaign = value) } }, accent,
                        placeholder = stringResource(R.string.links_tracking_create_utm_campaign_placeholder), lowercase = true,
                    )
                    LinkField(
                        stringResource(R.string.links_tracking_create_utm_source), form.source,
                        { value -> viewModel.editForm { it.copy(source = value) } }, accent,
                        placeholder = stringResource(R.string.links_tracking_create_utm_source_placeholder), lowercase = true,
                    )
                    LinkField(
                        stringResource(R.string.links_tracking_create_utm_medium), form.medium,
                        { value -> viewModel.editForm { it.copy(medium = value) } }, accent,
                        placeholder = stringResource(R.string.links_tracking_create_utm_medium_placeholder), lowercase = true,
                    )
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                LinkField(
                    stringResource(R.string.links_tracking_create_token_title), form.customToken,
                    { value -> viewModel.editForm { it.copy(customToken = value) } }, accent,
                    placeholder = stringResource(R.string.links_tracking_create_token_placeholder), lowercase = true,
                )
                Text(
                    stringResource(R.string.links_tracking_create_token_help),
                    style = MaterialTheme.typography.labelSmall,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.padding(start = MeeshySpacing.xs),
                )
            }
            sheet.error?.let { LinkFormError(it) }
            LinkPrimaryButton(
                text = stringResource(R.string.links_tracking_create_button),
                enabled = form.isValid,
                isLoading = sheet.isCreating,
                accent = accent,
                inProgressDescription = stringResource(R.string.links_tracking_create_in_progress),
                onClick = viewModel::create,
            )
        }
    }
}

@Composable
private fun UtmToggle(expanded: Boolean, onToggle: () -> Unit) {
    val state = stringResource(if (expanded) R.string.links_section_expanded else R.string.links_section_collapsed)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onToggle)
            .semantics { stateDescription = state },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            stringResource(R.string.links_tracking_create_utm_title),
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Medium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Icon(
            if (expanded) MeeshyIcons.ChevronUp else MeeshyIcons.ChevronDown,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
        )
    }
}
