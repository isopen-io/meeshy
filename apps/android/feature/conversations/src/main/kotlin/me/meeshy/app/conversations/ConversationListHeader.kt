package me.meeshy.app.conversations

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AddLink
import androidx.compose.material.icons.filled.LockOpen
import androidx.compose.material.icons.filled.LockReset
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.NoEncryption
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.conversations.R
import me.meeshy.ui.component.chrome.CollapsibleHeader
import me.meeshy.ui.component.chrome.CollapsibleHeaderActionButton

@Composable
internal fun ConversationListHeader(
    state: ConversationListUiState,
    scrollProgress: Float,
    actionsVisible: Boolean,
    onUnlockAll: () -> Unit,
    onChangeMasterPin: () -> Unit,
    onRemoveMasterPin: () -> Unit,
    onOpenShareLinkPicker: () -> Unit,
    onNewConversation: () -> Unit,
) {
    CollapsibleHeader(
        title = stringResource(R.string.conversations_title),
        scrollProgress = scrollProgress,
        actionsVisible = actionsVisible,
    ) {
        conversationHeaderActions(state.canUnlockAll, state.hasMasterPin).forEach { action ->
            when (action) {
                // A global "unlock all" affordance surfaces only while at least one
                // conversation is locked (parity iOS Settings, which offers unlock-all
                // contextually); hidden otherwise so the header stays quiet.
                ConversationHeaderAction.UNLOCK_ALL -> CollapsibleHeaderActionButton(
                    icon = Icons.Filled.LockOpen,
                    contentDescription = stringResource(R.string.conversations_unlock_all),
                    onClick = onUnlockAll,
                    enabled = actionsVisible,
                )
                // Master-PIN management (parity iOS Settings): surfaces once a master PIN
                // exists; "Remove" additionally hides while any conversation is locked.
                ConversationHeaderAction.LOCK_SECURITY_MENU -> LockSecurityMenu(
                    canChange = state.canChangeMasterPin,
                    canRemove = state.canRemoveMasterPin,
                    onChange = onChangeMasterPin,
                    onRemove = onRemoveMasterPin,
                    enabled = actionsVisible,
                )
                ConversationHeaderAction.CREATE_SHARE_LINK -> CollapsibleHeaderActionButton(
                    icon = Icons.Filled.AddLink,
                    contentDescription = stringResource(R.string.conversations_create_share_link),
                    onClick = onOpenShareLinkPicker,
                    enabled = actionsVisible,
                )
                ConversationHeaderAction.NEW_CONVERSATION -> CollapsibleHeaderActionButton(
                    icon = Icons.Filled.Add,
                    contentDescription = stringResource(R.string.conversations_new),
                    onClick = onNewConversation,
                    enabled = actionsVisible,
                )
            }
        }
    }
}

/**
 * Master-PIN management overflow (parity iOS Settings → change / remove master PIN).
 * A dumb renderer: the enablement decisions live on [ConversationListUiState]
 * ([ConversationListUiState.canChangeMasterPin] / [canRemoveMasterPin]); this only draws
 * the menu and forwards the intent. Menu-open is local UI state, closed after each pick.
 */
@Composable
internal fun LockSecurityMenu(
    canChange: Boolean,
    canRemove: Boolean,
    onChange: () -> Unit,
    onRemove: () -> Unit,
    enabled: Boolean = true,
) {
    var expanded by remember { mutableStateOf(false) }
    CollapsibleHeaderActionButton(
        icon = Icons.Filled.MoreVert,
        contentDescription = stringResource(R.string.conversations_lock_security_menu),
        onClick = { expanded = true },
        enabled = enabled,
    )
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        if (canChange) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_change_master_pin)) },
                leadingIcon = { Icon(Icons.Filled.LockReset, contentDescription = null) },
                onClick = {
                    expanded = false
                    onChange()
                },
            )
        }
        if (canRemove) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversations_remove_master_pin)) },
                leadingIcon = { Icon(Icons.Filled.NoEncryption, contentDescription = null) },
                onClick = {
                    expanded = false
                    onRemove()
                },
            )
        }
    }
}
