package me.meeshy.app.chat

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.displayLabel
import me.meeshy.sdk.model.role
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Conversation members bottom sheet (feature-parity §Chat — paginated member list +
 * member moderation), the Android port of iOS `ParticipantsView`.
 *
 * Every rule it renders is tested elsewhere: paging/dedup in [me.meeshy.sdk.model.MemberRoster],
 * who may promote/demote/remove in [me.meeshy.sdk.model.MemberModeration], and the
 * load/search/optimistic-action sequencing in [ConversationMembersViewModel]. This
 * file is therefore coverage-exempt Compose glue.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConversationMembersSheet(
    conversationId: String,
    accentColor: Color,
    onDismiss: () -> Unit,
    viewModel: ConversationMembersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var pendingRemoval by remember { mutableStateOf<PaginatedParticipant?>(null) }
    var pendingBan by remember { mutableStateOf<PaginatedParticipant?>(null) }
    var showAddSheet by remember { mutableStateOf(false) }
    // Taper une ligne n'ouvrait RIEN avant #3943 : la fiche d'un participant
    // n'existait pas sur Android, alors que iOS et web la rendent depuis #3877.
    var openProfileFor by remember { mutableStateOf<PaginatedParticipant?>(null) }

    LaunchedEffect(conversationId) { viewModel.load(conversationId) }
    LaunchedEffect(state.actionFailed) {
        if (state.actionFailed) {
            Toast.makeText(
                context,
                context.getString(R.string.conversation_members_action_failed),
                Toast.LENGTH_SHORT,
            ).show()
            viewModel.dismissActionError()
        }
    }

    openProfileFor?.let { member ->
        ParticipantProfileSheet(
            conversationId = conversationId,
            // Le `Participant.id`, jamais le `User.id` : le sujet de la fiche
            // est souvent un visiteur venu par un lien, qui n'a aucune ligne
            // `User`. Les gestes du menu voisin visent l'autre colonne.
            participantId = member.id,
            displayName = member.displayLabel,
            accentColor = accentColor,
            onDismiss = { openProfileFor = null },
        )
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        Column(modifier = Modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = stringResource(R.string.conversation_members_title, state.memberCount),
                    style = MaterialTheme.typography.titleMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                )
                if (state.viewerRole.hasMinimumRole(MemberRole.MODERATOR)) {
                    IconButton(onClick = { showAddSheet = true }) {
                        Icon(
                            imageVector = Icons.Filled.PersonAdd,
                            contentDescription = stringResource(R.string.conversation_members_add_a11y),
                        )
                    }
                }
            }

            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = viewModel::onSearchQueryChange,
                singleLine = true,
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                placeholder = { Text(stringResource(R.string.conversation_members_search_hint)) },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = accentColor,
                    cursorColor = accentColor,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )

            when {
                state.isLoading -> CenteredProgress(accentColor)

                state.hasError -> MembersMessage(
                    text = stringResource(R.string.conversation_members_error),
                    action = stringResource(R.string.conversation_members_retry),
                    onAction = viewModel::refresh,
                )

                state.isEmpty -> MembersMessage(
                    text = stringResource(R.string.conversation_members_empty),
                    action = null,
                    onAction = {},
                )

                else -> LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 460.dp)) {
                    itemsIndexed(state.members, key = { _, member -> member.id }) { index, member ->
                        if (index > 0) {
                            HorizontalDivider(
                                modifier = Modifier.padding(horizontal = MeeshySpacing.lg),
                                color = MeeshyTheme.tokens.backgroundTertiary.copy(alpha = 0.5f),
                            )
                        }
                        // The last row asking for the next page is the established
                        // infinite-scroll trigger; the ViewModel guards the repeats.
                        if (index == state.members.lastIndex) {
                            LaunchedEffect(member.id) { viewModel.loadMore() }
                        }
                        MemberRow(
                            member = member,
                            isSelf = state.isSelf(member),
                            accentColor = accentColor,
                            roleActions = state.roleActions(member),
                            canRemove = state.canRemove(member),
                            canBan = state.canBan(member),
                            onRoleAction = { action -> viewModel.changeRole(member, action) },
                            onRemove = { pendingRemoval = member },
                            onBan = { pendingBan = member },
                            onOpenProfile = { openProfileFor = member },
                        )
                    }
                    if (state.isLoadingMore) {
                        item { CenteredProgress(accentColor) }
                    }
                }
            }
        }
    }

    val removalTarget = pendingRemoval
    if (removalTarget != null) {
        AlertDialog(
            onDismissRequest = { pendingRemoval = null },
            title = { Text(stringResource(R.string.conversation_members_remove_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.conversation_members_remove_message,
                        removalTarget.displayLabel,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.removeMember(removalTarget)
                    pendingRemoval = null
                }) {
                    Text(
                        text = stringResource(R.string.conversation_members_remove_confirm),
                        color = MeeshyPalette.Error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingRemoval = null }) {
                    Text(stringResource(R.string.conversation_members_remove_cancel))
                }
            },
        )
    }

    val banTarget = pendingBan
    if (banTarget != null) {
        AlertDialog(
            onDismissRequest = { pendingBan = null },
            title = { Text(stringResource(R.string.conversation_members_ban_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.conversation_members_ban_message,
                        banTarget.displayLabel,
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.banMember(banTarget)
                    pendingBan = null
                }) {
                    Text(
                        text = stringResource(R.string.conversation_members_ban_confirm),
                        color = MeeshyPalette.Error,
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingBan = null }) {
                    Text(stringResource(R.string.conversation_members_remove_cancel))
                }
            },
        )
    }

    if (showAddSheet) {
        AddParticipantSheet(
            conversationId = conversationId,
            existingMemberIds = state.members.mapNotNull { it.userId ?: it.id }.toSet(),
            accentColor = accentColor,
            onDismiss = { showAddSheet = false },
            onAdded = { viewModel.refresh() },
        )
    }
}

@Composable
private fun MemberRow(
    member: PaginatedParticipant,
    isSelf: Boolean,
    accentColor: Color,
    roleActions: List<MemberRoleAction>,
    canRemove: Boolean,
    canBan: Boolean,
    onRoleAction: (MemberRoleAction) -> Unit,
    onRemove: () -> Unit,
    onBan: () -> Unit,
    onOpenProfile: () -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val name = member.displayLabel

    val openProfileLabel = stringResource(R.string.participant_profile_open_a11y, name)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClickLabel = openProfileLabel, onClick = onOpenProfile)
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(name = name, size = 40.dp, containerColor = accentColor)

        Column(modifier = Modifier.weight(1f)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
            ) {
                Text(
                    text = if (isSelf) stringResource(R.string.conversation_members_you, name) else name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MeeshyTheme.tokens.textPrimary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (member.role != MemberRole.MEMBER) {
                    RoleBadge(member.role)
                }
            }
            member.username?.takeIf { it.isNotBlank() }?.let { username ->
                Text(
                    text = "@$username",
                    style = MaterialTheme.typography.labelMedium,
                    color = MeeshyTheme.tokens.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }

        if (roleActions.isNotEmpty() || canRemove || canBan) {
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(
                        imageVector = Icons.Filled.MoreVert,
                        contentDescription = stringResource(R.string.conversation_members_actions, name),
                    )
                }
                DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                    roleActions.forEach { action ->
                        DropdownMenuItem(
                            text = { Text(stringResource(action.labelRes)) },
                            onClick = {
                                menuOpen = false
                                onRoleAction(action)
                            },
                        )
                    }
                    if (canRemove) {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    text = stringResource(R.string.conversation_members_remove),
                                    color = MeeshyPalette.Error,
                                )
                            },
                            onClick = {
                                menuOpen = false
                                onRemove()
                            },
                        )
                    }
                    if (canBan) {
                        DropdownMenuItem(
                            text = {
                                Text(
                                    text = stringResource(R.string.conversation_members_ban),
                                    color = MeeshyPalette.Error,
                                )
                            },
                            onClick = {
                                menuOpen = false
                                onBan()
                            },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RoleBadge(role: MemberRole) {
    Text(
        text = stringResource(role.labelRes),
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyPalette.White,
        modifier = Modifier
            .background(MeeshyPalette.Indigo500, RoundedCornerShape(percent = 50))
            .padding(horizontal = MeeshySpacing.xs, vertical = 1.dp),
    )
}

@Composable
private fun CenteredProgress(accentColor: Color) {
    Box(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator(color = accentColor, strokeWidth = 2.dp, modifier = Modifier.size(24.dp))
    }
}

@Composable
private fun MembersMessage(text: String, action: String?, onAction: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
        if (action != null) {
            TextButton(onClick = onAction) { Text(action) }
        }
    }
}

private val MemberRoleAction.labelRes: Int
    get() = when (this) {
        MemberRoleAction.PROMOTE_MODERATOR -> R.string.conversation_members_promote_moderator
        MemberRoleAction.PROMOTE_ADMIN -> R.string.conversation_members_promote_admin
        MemberRoleAction.DEMOTE_MODERATOR -> R.string.conversation_members_demote_moderator
        MemberRoleAction.DEMOTE_MEMBER -> R.string.conversation_members_demote_member
    }

private val MemberRole.labelRes: Int
    get() = when (this) {
        MemberRole.CREATOR -> R.string.conversation_members_role_creator
        MemberRole.ADMIN -> R.string.conversation_members_role_admin
        MemberRole.MODERATOR -> R.string.conversation_members_role_moderator
        MemberRole.MEMBER -> R.string.conversation_members_role_member
    }
