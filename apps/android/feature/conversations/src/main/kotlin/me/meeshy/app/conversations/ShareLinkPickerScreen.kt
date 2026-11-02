package me.meeshy.app.conversations

import me.meeshy.sdk.model.displayedAvatar
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ShareLinkPickerSection
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.sdk.theme.displayTitle
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * The in-form conversation picker (iOS `ConversationPickerSheet`): a searchable
 * sheet whose eligible conversations are split into Groups, Communities,
 * Channels and Public sections. Loading shows a spinner only while the cache is
 * still empty; an empty list carries a real CTA rather than a blank sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ShareLinkConversationPickerSheet(
    state: ShareLinkPickerUiState,
    selectedConversationId: String,
    onQueryChange: (String) -> Unit,
    onSelect: (String) -> Unit,
    onRetry: () -> Unit,
    onNewConversation: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
    ) {
        Column(modifier = Modifier.fillMaxWidth().heightIn(min = 320.dp)) {
            Text(
                text = stringResource(R.string.share_link_picker_title),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
            )
            OutlinedTextField(
                value = state.query,
                onValueChange = onQueryChange,
                placeholder = { Text(stringResource(R.string.share_link_picker_search)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            )
            Box(modifier = Modifier.fillMaxWidth().weight(1f, fill = false)) {
                when {
                    state.isLoading -> CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center).padding(MeeshySpacing.xl),
                        color = MeeshyPalette.Indigo500,
                    )

                    state.errorMessage != null && state.eligibleConversations.isEmpty() ->
                        PickerMessage(
                            title = stringResource(R.string.conversations_error_title),
                            body = stringResource(R.string.conversations_error_subtitle),
                            cta = stringResource(R.string.conversations_retry),
                            ctaIcon = null,
                            onCta = onRetry,
                        )

                    state.sections.isEmpty() -> PickerMessage(
                        title = stringResource(R.string.share_link_picker_empty_title),
                        body = stringResource(R.string.share_link_picker_empty_body),
                        cta = stringResource(R.string.share_link_picker_empty_cta),
                        ctaIcon = Icons.Filled.Add,
                        onCta = onNewConversation,
                    )

                    else -> PickerSections(state, selectedConversationId, onSelect)
                }
            }
        }
    }
}

@Composable
private fun PickerSections(
    state: ShareLinkPickerUiState,
    selectedConversationId: String,
    onSelect: (String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(bottom = MeeshySpacing.xl),
    ) {
        state.sections.forEach { group ->
            item(key = "header-${group.section.name}", contentType = "header") {
                Text(
                    text = stringResource(sectionTitleRes(group.section)),
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(
                        start = MeeshySpacing.lg,
                        end = MeeshySpacing.lg,
                        top = MeeshySpacing.md,
                        bottom = MeeshySpacing.xs,
                    ),
                )
            }
            items(group.conversations, key = { it.id }, contentType = { "row" }) { conversation ->
                PickerRow(
                    conversation = conversation,
                    currentUserId = state.currentUserId,
                    selected = conversation.id == selectedConversationId,
                    onClick = { onSelect(conversation.id) },
                )
            }
        }
    }
}

@Composable
private fun PickerRow(
    conversation: ApiConversation,
    currentUserId: String?,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val title = conversation.displayTitle(currentUserId)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .semantics(mergeDescendants = true) { this.selected = selected }
            .clickable(onClick = onClick)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MeeshyAvatar(
            name = title,
            containerColor = hexColor(conversation.accentColorPalette().primary),
            imageUrl = conversation.displayedAvatar(currentUserId),
        )
        Column(modifier = Modifier.weight(1f).padding(horizontal = MeeshySpacing.md)) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = stringResource(conversationTypeLabelRes(conversation.type)),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
        if (selected) {
            Icon(
                Icons.Filled.CheckCircle,
                contentDescription = null,
                tint = MeeshyPalette.ShareAccent,
                modifier = Modifier.size(24.dp),
            )
        }
    }
}

@Composable
private fun PickerMessage(
    title: String,
    body: String,
    cta: String,
    ctaIcon: androidx.compose.ui.graphics.vector.ImageVector?,
    onCta: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(
            Icons.Filled.Link,
            contentDescription = null,
            tint = MeeshyPalette.ShareAccent,
            modifier = Modifier.size(32.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.md),
        )
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = MeeshySpacing.sm),
        )
        Button(onClick = onCta, modifier = Modifier.padding(top = MeeshySpacing.lg)) {
            ctaIcon?.let { Icon(it, contentDescription = null, modifier = Modifier.size(18.dp)) }
            Text(text = cta, modifier = Modifier.padding(start = if (ctaIcon != null) MeeshySpacing.xs else 0.dp))
        }
    }
}

internal fun sectionTitleRes(section: ShareLinkPickerSection): Int = when (section) {
    ShareLinkPickerSection.Groups -> R.string.share_link_section_groups
    ShareLinkPickerSection.Communities -> R.string.share_link_section_communities
    ShareLinkPickerSection.Channels -> R.string.conversations_filter_channels
    ShareLinkPickerSection.Public -> R.string.share_link_type_public
}

internal fun conversationTypeLabelRes(type: String): Int = when (type.lowercase()) {
    "community" -> R.string.share_link_type_community
    "channel" -> R.string.share_link_type_channel
    "broadcast" -> R.string.share_link_type_broadcast
    "public" -> R.string.share_link_type_public
    "global" -> R.string.share_link_type_global
    else -> R.string.share_link_type_group
}

