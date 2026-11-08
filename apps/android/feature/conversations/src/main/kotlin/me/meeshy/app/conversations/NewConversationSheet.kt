package me.meeshy.app.conversations

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CreationEncryptionMode
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Identifiers of the sheet's sections, mirroring iOS `accessibilityIdentifier`s (`new-conversation-*`). */
internal object NewConversationTags {
    const val CLOSE = "new-conversation-close"
    const val CREATE = "new-conversation-create"
    const val SEARCH = "new-conversation-search"
    const val SEARCH_RETRY = "new-conversation-search-retry"
    const val GROUP_TOGGLE = "new-conversation-group-toggle"
    const val SOLO_HINT = "new-conversation-group-solo-hint"
    const val GROUP_TITLE = "new-conversation-group-title"
    const val ENCRYPTION_ROW = "new-conversation-encryption-toggle"
    const val ENCRYPTION_OPTIONS = "new-conversation-encryption"
    const val OPENING = "new-conversation-opening"

    fun row(userId: String): String = "new-conversation-user-$userId"
}

/** Every gesture the sheet answers; the screen binds them to [NewConversationViewModel]. */
internal data class NewConversationActions(
    val onClose: () -> Unit,
    val onCreate: () -> Unit,
    val onQueryChange: (String) -> Unit,
    val onToggleGroup: () -> Unit,
    val onGroupTitleChange: (String) -> Unit,
    val onToggleEncryption: () -> Unit,
    val onSelectEncryption: (CreationEncryptionMode) -> Unit,
    val onToggleUser: (String) -> Unit,
    val onTapUser: (String) -> Unit,
    val onRowShown: (String) -> Unit,
    val onRetrySearch: () -> Unit = {},
    val onDismissError: () -> Unit = {},
)

/**
 * The « New conversation » sheet, laid out as iOS `NewConversationView` (#14660): (X) · title · « Create »
 * (once the selection draws something); search; the « New group » switch; the group's required name; the
 * picked chips; then the list, opened by the folded « Encryption · <mode> » row, over contacts or results.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun NewConversationSheet(state: NewConversationUiState, actions: NewConversationActions) {
    Scaffold(
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
        topBar = {
            CenterAlignedTopAppBar(
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(containerColor = MeeshyTheme.tokens.backgroundPrimary),
                title = { Text(stringResource(R.string.new_conversation_title), fontWeight = FontWeight.Bold) },
                navigationIcon = { CloseButton(onClick = actions.onClose) },
                actions = { if (state.showsCreate) CreateAction(state = state, onCreate = actions.onCreate) },
            )
        },
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            SearchField(state = state, onQueryChange = actions.onQueryChange)
            GroupToggleRow(state = state, onToggle = actions.onToggleGroup)
            AnimatedVisibility(visible = state.isGroup) {
                GroupTitleField(title = state.groupTitle, onChange = actions.onGroupTitleChange)
            }
            if (state.selected.isNotEmpty()) {
                SelectedChips(selected = state.selected, onRemove = actions.onToggleUser)
            }
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                if (state.showsEncryption) encryptionItems(state, actions)
                if (state.showsContacts) contactItems(state, actions.onTapUser) else resultItems(state, actions)
            }
        }
    }
}

@Composable
private fun CloseButton(onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.testTag(NewConversationTags.CLOSE)) {
        Box(
            modifier = Modifier
                .size(30.dp)
                .clip(CircleShape)
                .background(MeeshyTheme.tokens.textPrimary.copy(alpha = 0.08f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                MeeshyIcons.Close,
                contentDescription = stringResource(R.string.new_conversation_close),
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(18.dp),
            )
        }
    }
}

@Composable
private fun CreateAction(state: NewConversationUiState, onCreate: () -> Unit) {
    if (state.isCreating) {
        CircularProgressIndicator(
            color = MeeshyPalette.Indigo400,
            strokeWidth = 2.dp,
            modifier = Modifier.padding(horizontal = MeeshySpacing.md).size(20.dp),
        )
        return
    }
    TextButton(onClick = onCreate, enabled = state.canCreate, modifier = Modifier.testTag(NewConversationTags.CREATE)) {
        Text(stringResource(R.string.new_conversation_create), fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun SearchField(state: NewConversationUiState, onQueryChange: (String) -> Unit) {
    OutlinedTextField(
        value = state.query,
        onValueChange = onQueryChange,
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        placeholder = { Text(stringResource(R.string.new_conversation_search_placeholder)) },
        leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null, tint = MeeshyTheme.tokens.textMuted) },
        trailingIcon = {
            when {
                state.isSearching -> CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                state.query.isNotEmpty() -> IconButton(onClick = { onQueryChange("") }) {
                    Icon(
                        MeeshyIcons.CloseCircleFilled,
                        contentDescription = stringResource(R.string.conversations_search_clear),
                        tint = MeeshyTheme.tokens.textMuted,
                    )
                }
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
            .testTag(NewConversationTags.SEARCH),
    )
}

/**
 * « New group » (iOS `groupToggleRow`): a group is created even with nobody invited — alone, for an
 * audit or to collect opinions — and its name then becomes required. Two peers and more already make
 * a group: the row says so, checked, and does not turn off.
 */
@Composable
private fun GroupToggleRow(state: NewConversationUiState, onToggle: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .clip(RoundedCornerShape(12.dp))
            .toggleable(value = state.isGroup, enabled = state.groupToggleEnabled, role = Role.Switch, onValueChange = { onToggle() })
            .heightIn(min = 48.dp)
            .padding(horizontal = MeeshySpacing.mdPlus, vertical = MeeshySpacing.sm)
            .testTag(NewConversationTags.GROUP_TOGGLE),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Box(
            modifier = Modifier.size(32.dp).clip(CircleShape).background(MeeshyPalette.Indigo400.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(MeeshyIcons.GroupsFilled, contentDescription = null, tint = MeeshyPalette.Indigo400, modifier = Modifier.size(18.dp))
        }
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
            Text(
                text = stringResource(R.string.new_conversation_group_toggle),
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textPrimary,
            )
            if (state.showsSoloHint) {
                Text(
                    text = stringResource(R.string.new_conversation_group_solo_hint),
                    style = MaterialTheme.typography.bodySmall,
                    color = MeeshyTheme.tokens.textMuted,
                    modifier = Modifier.testTag(NewConversationTags.SOLO_HINT),
                )
            }
        }
        Icon(
            if (state.isGroup) MeeshyIcons.CheckCircleFilled else MeeshyIcons.RadioUnchecked,
            contentDescription = null,
            tint = if (state.isGroup) MeeshyPalette.Indigo400 else MeeshyTheme.tokens.textMuted.copy(alpha = 0.4f),
            modifier = Modifier.size(24.dp),
        )
    }
}

@Composable
private fun GroupTitleField(title: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = title,
        onValueChange = onChange,
        singleLine = true,
        shape = RoundedCornerShape(12.dp),
        placeholder = { Text(stringResource(R.string.new_conversation_group_title)) },
        leadingIcon = { Icon(MeeshyIcons.GroupsFilled, contentDescription = null, tint = MeeshyPalette.Indigo600) },
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs)
            .testTag(NewConversationTags.GROUP_TITLE),
    )
}

/** The folded « Encryption · <mode> » row, and under it, once touched, the modes (iOS `encryptionSection`). */
private fun LazyListScope.encryptionItems(state: NewConversationUiState, actions: NewConversationActions) {
    item(key = "encryption-row") { EncryptionRow(state = state, onToggle = actions.onToggleEncryption) }
    if (state.encryptionExpanded) {
        item(key = "encryption-options") {
            NewConversationEncryptionSection(
                offer = state.encryptionOffer,
                checked = state.encryptionMode,
                enabled = !state.isCreating,
                onSelect = actions.onSelectEncryption,
                modifier = Modifier.testTag(NewConversationTags.ENCRYPTION_OPTIONS),
            )
        }
    }
}

@Composable
private fun EncryptionRow(state: NewConversationUiState, onToggle: () -> Unit) {
    val folding = stringResource(
        if (state.encryptionExpanded) R.string.new_conversation_encryption_expanded else R.string.new_conversation_encryption_collapsed,
    )
    val chevron by animateFloatAsState(if (state.encryptionExpanded) 180f else 0f, label = "encryption-chevron")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg)
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onToggle)
            .semantics(mergeDescendants = true) {
                role = Role.Button
                stateDescription = folding
            }
            .heightIn(min = 48.dp)
            .padding(horizontal = MeeshySpacing.mdPlus)
            .testTag(NewConversationTags.ENCRYPTION_ROW),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.LockFilled, contentDescription = null, tint = MeeshyTheme.tokens.textMuted, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.encryption_create_header),
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textPrimary,
        )
        Spacer(Modifier.weight(1f).width(MeeshySpacing.sm))
        Text(
            text = stringResource(state.encryptionMode.labelRes()),
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textMuted,
            maxLines = 1,
        )
        Spacer(Modifier.width(MeeshySpacing.xs))
        Icon(
            MeeshyIcons.ChevronDown,
            contentDescription = null,
            tint = MeeshyTheme.tokens.textMuted,
            modifier = Modifier.size(18.dp).rotate(chevron),
        )
    }
}

/**
 * The surface the picker opens on (iOS `NewConversationView.contactsSection`): « Your contacts »,
 * served from the cache first; a loading state only on a cold cache; « No contacts » with a hint
 * to search once the roster answered with nobody.
 */
private fun LazyListScope.contactItems(state: NewConversationUiState, onTap: (String) -> Unit) {
    item(key = "contacts-header") {
        Text(
            text = stringResource(R.string.new_conversation_contacts_section),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm)
                .semantics { heading() },
        )
    }
    items(state.contacts, key = { "contact-${it.id}" }) { user ->
        PersonRow(state = state, user = user, onTap = onTap)
    }
    if (state.isLoadingContacts && state.contacts.isEmpty()) {
        item(key = "contacts-loading") { ListSpinner(labelRes = R.string.new_conversation_contacts_loading) }
    }
    if (state.showsNoContacts) {
        item(key = "contacts-empty") { NoContacts() }
    }
}

private fun LazyListScope.resultItems(state: NewConversationUiState, actions: NewConversationActions) {
    items(state.results, key = { it.id }) { user ->
        PersonRow(state = state, user = user, onTap = actions.onTapUser)
        actions.onRowShown(user.id)
    }
    if (state.isLoadingMore) {
        item(key = "results-more") { ListSpinner(labelRes = null) }
    }
    if (state.searchFailed) {
        item(key = "results-failed") { SearchFailed(onRetry = actions.onRetrySearch) }
    }
    if (state.showsNoResults) {
        item(key = "results-empty") { NoUserFound() }
    }
}

@Composable
private fun PersonRow(state: NewConversationUiState, user: SelectableUser, onTap: (String) -> Unit) {
    UserRow(
        user = user,
        onClick = { onTap(user.id) },
        enabled = !state.isCreating,
        opening = state.openingUserId == user.id,
        modifier = Modifier.testTag(NewConversationTags.row(user.id)),
    )
}

@Composable
private fun ListSpinner(labelRes: Int?) {
    val label = labelRes?.let { stringResource(it) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(MeeshySpacing.xl)
            .semantics { if (label != null) contentDescription = label },
    ) {
        CircularProgressIndicator(modifier = Modifier.align(Alignment.Center).size(24.dp))
    }
}
