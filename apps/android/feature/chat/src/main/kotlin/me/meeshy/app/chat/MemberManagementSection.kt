package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MemberActionPolicy
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.displayLabel
import me.meeshy.sdk.model.role
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Section « Gestion des membres » des réglages de conversation — port de iOS `MemberManagementSection`.
 * Les droits viennent de [MemberActionPolicy] (clé d'adresse comprise), la recherche est locale
 * ([MemberActionPolicy.filter]) et l'état de la liste de [ConversationMembersViewModel] : l'action est
 * optimiste et revient en arrière si le serveur refuse.
 */
@Composable
internal fun MemberManagementSection(
    conversationId: String,
    query: String,
    onQueryChange: (String) -> Unit,
    viewerRole: MemberRole,
    accentColor: Color,
    modifier: Modifier = Modifier,
    viewModel: ConversationMembersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(conversationId) { viewModel.load(conversationId) }
    var pendingDestructive by remember { mutableStateOf<Pair<MemberActionPolicy.Action, PaginatedParticipant>?>(null) }
    var showAdd by remember { mutableStateOf(false) }
    val visible = MemberActionPolicy.filter(state.members, query)
    val sectionColor = MeeshyPalette.Indigo600

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        val base = stringResource(R.string.member_management_title)
        val count = state.memberCount
        Text(
            text = if (count > 0) "$base ($count)" else base,
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(top = MeeshySpacing.md).semantics { heading() },
        )
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MeeshyTheme.tokens.backgroundSecondary, RoundedCornerShape(12.dp)),
        ) {
            OutlinedTextField(
                value = query,
                onValueChange = onQueryChange,
                singleLine = true,
                leadingIcon = { Icon(MeeshyIcons.Search, contentDescription = null) },
                trailingIcon = if (query.isEmpty()) null else {
                    {
                        IconButton(onClick = { onQueryChange("") }) {
                            Icon(MeeshyIcons.Close, contentDescription = stringResource(R.string.chat_search_clear))
                        }
                    }
                },
                placeholder = { Text(stringResource(R.string.member_management_search)) },
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = sectionColor, cursorColor = sectionColor),
                modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.sm),
            )
            when {
                state.showSkeleton -> ConversationMembersSkeleton()
                visible.isEmpty() -> Text(
                    text = stringResource(R.string.member_management_empty),
                    color = MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.fillMaxWidth().padding(vertical = MeeshySpacing.xl),
                    textAlign = TextAlign.Center,
                )
                else -> visible.forEachIndexed { index, member ->
                    if (index > 0) HorizontalDivider(color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f))
                    ManagedMemberRow(
                        member = member,
                        actions = MemberActionPolicy.actions(member, viewerRole),
                        onAction = { action ->
                            if (action.kind.isDestructive) {
                                pendingDestructive = action to member
                            } else {
                                viewModel.requestRoleChange(member, roleActionFor(action.kind))
                            }
                        },
                    )
                }
            }
            if (MemberActionPolicy.mayAddMember(viewerRole)) {
                val addDescription = stringResource(R.string.member_management_add_a11y)
                HorizontalDivider(color = sectionColor.copy(alpha = 0.2f))
                TextButton(
                    onClick = { showAdd = true },
                    modifier = Modifier.fillMaxWidth().semantics { contentDescription = addDescription },
                ) {
                    Icon(MeeshyIcons.PersonAdd, contentDescription = null, modifier = Modifier.size(18.dp), tint = sectionColor)
                    Text(
                        text = stringResource(R.string.add_participant_title),
                        color = sectionColor,
                        modifier = Modifier.padding(start = MeeshySpacing.sm),
                    )
                }
            }
        }
    }

    pendingDestructive?.let { (action, member) ->
        val isBan = action.kind == MemberActionPolicy.Kind.BAN
        AlertDialog(
            onDismissRequest = { pendingDestructive = null },
            title = {
                Text(stringResource(if (isBan) R.string.conversation_members_ban_title else R.string.conversation_members_remove_title))
            },
            text = {
                Text(
                    stringResource(
                        if (isBan) R.string.conversation_members_ban_message else R.string.conversation_members_remove_message,
                        member.displayLabel,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    if (isBan) viewModel.banMember(member) else viewModel.removeMember(member)
                    pendingDestructive = null
                }) {
                    Text(
                        stringResource(if (isBan) R.string.conversation_members_ban_confirm else R.string.conversation_members_remove_confirm),
                        color = MeeshyPalette.Error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDestructive = null }) {
                    Text(stringResource(R.string.conversation_members_remove_cancel))
                }
            },
        )
    }

    state.pendingRoleChange?.let { pending ->
        AlertDialog(
            onDismissRequest = viewModel::cancelRoleChange,
            title = { Text(stringResource(R.string.members_sheet_role_title)) },
            text = { Text(stringResource(R.string.members_sheet_role_message, stringResource(pending.action.target.labelRes))) },
            confirmButton = {
                TextButton(onClick = viewModel::confirmRoleChange) { Text(stringResource(R.string.members_sheet_role_confirm)) }
            },
            dismissButton = {
                TextButton(onClick = viewModel::cancelRoleChange) { Text(stringResource(R.string.conversation_members_remove_cancel)) }
            },
        )
    }

    if (showAdd) {
        AddParticipantSheet(
            conversationId = conversationId,
            existingMemberIds = state.members.mapNotNull { it.userId ?: it.id }.toSet(),
            accentColor = accentColor,
            onDismiss = { showAdd = false },
            onAdded = { viewModel.refresh() },
        )
    }
}

private fun roleActionFor(kind: MemberActionPolicy.Kind): MemberRoleAction = when (kind) {
    MemberActionPolicy.Kind.PROMOTE_TO_ADMIN -> MemberRoleAction.PROMOTE_ADMIN
    MemberActionPolicy.Kind.PROMOTE_TO_MODERATOR -> MemberRoleAction.PROMOTE_MODERATOR
    else -> MemberRoleAction.DEMOTE_MEMBER
}

@Composable
private fun ManagedMemberRow(
    member: PaginatedParticipant,
    actions: List<MemberActionPolicy.Action>,
    onAction: (MemberActionPolicy.Action) -> Unit,
) {
    val name = member.displayLabel
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = name,
            size = 36.dp,
            containerColor = hexColor(DynamicColorGenerator.colorForName(name)),
            imageUrl = member.avatar,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textPrimary, maxLines = 1)
            RoleLabel(member.role)
        }
        if (actions.isNotEmpty()) {
            var open by remember { mutableStateOf(false) }
            val description = stringResource(R.string.member_management_options_a11y, name)
            Box {
                IconButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = description }) {
                    Icon(MeeshyIcons.MoreHorizontal, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary)
                }
                DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                    actions.forEach { action ->
                        val tint = if (action.kind.isDestructive) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary
                        DropdownMenuItem(
                            text = { Text(stringResource(actionLabel(action.kind)), color = tint) },
                            onClick = {
                                open = false
                                onAction(action)
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RoleLabel(role: MemberRole) {
    val (label, color) = when (role) {
        MemberRole.CREATOR -> R.string.member_management_role_creator to MeeshyPalette.Amber500
        MemberRole.ADMIN -> R.string.member_management_role_admin to MeeshyPalette.Error
        MemberRole.MODERATOR -> R.string.member_management_role_moderator to MeeshyPalette.Indigo500
        MemberRole.MEMBER -> return
    }
    Text(stringResource(label), style = MaterialTheme.typography.labelSmall, color = color)
}

private fun actionLabel(kind: MemberActionPolicy.Kind): Int = when (kind) {
    MemberActionPolicy.Kind.PROMOTE_TO_ADMIN -> R.string.member_management_action_promote_admin
    MemberActionPolicy.Kind.PROMOTE_TO_MODERATOR -> R.string.member_management_action_promote_moderator
    MemberActionPolicy.Kind.DEMOTE_TO_MEMBER -> R.string.member_management_action_demote_member
    MemberActionPolicy.Kind.EXPEL -> R.string.member_management_action_expel
    MemberActionPolicy.Kind.BAN -> R.string.member_management_action_ban
}
