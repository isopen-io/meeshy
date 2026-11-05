package me.meeshy.app.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import me.meeshy.sdk.model.MemberRowFormat
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.from
import me.meeshy.sdk.model.displayLabel
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
internal fun ConversationMembersSheet(
    conversationId: String,
    accentColor: Color,
    onDismiss: () -> Unit,
    onLeft: () -> Unit = onDismiss,
    viewModel: ConversationMembersViewModel = hiltViewModel(),
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MeeshyTheme.tokens.backgroundPrimary,
    ) {
        ConversationMembersContent(conversationId, accentColor, onLeft = onLeft, viewModel = viewModel)
    }
}

/** La liste des membres et sa modération, montée par la feuille ou par l'onglet Membres de la fiche (#13785). */
@Composable
internal fun ConversationMembersContent(
    conversationId: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    onLeft: () -> Unit = {},
    viewModel: ConversationMembersViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    var confirmLeave by remember { mutableStateOf(false) }
    var pendingRemoval by remember { mutableStateOf<PaginatedParticipant?>(null) }
    var pendingBan by remember { mutableStateOf<PaginatedParticipant?>(null) }
    var showAddSheet by remember { mutableStateOf(false) }
    // Taper une ligne n'ouvrait RIEN avant #3943 : la fiche d'un participant
    // n'existait pas sur Android, alors que iOS et web la rendent depuis #3877.
    var openProfileFor by remember { mutableStateOf<PaginatedParticipant?>(null) }
    val profileTap = rememberProfileTap(conversationId, accentColor, state.readerRole)

    LaunchedEffect(conversationId) { viewModel.load(conversationId) }
    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is MembersEffect.Haptic -> haptics.performHapticFeedback(
                    if (effect.kind == FeedbackHaptic.SUCCESS) HapticFeedbackType.LongPress else HapticFeedbackType.TextHandleMove,
                )
                MembersEffect.Left -> onLeft()
            }
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
            avatarUrl = member.avatar,
            readerRole = state.readerRole,
        )
    }

        Column(modifier = modifier.fillMaxWidth().padding(bottom = MeeshySpacing.lg)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.sm),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = if (state.isCapped) {
                        pluralStringResource(R.plurals.members_sheet_title_capped, state.memberCount, MemberRowFormat.countText(state.memberCount, capped = true))
                    } else {
                        pluralStringResource(R.plurals.conversation_members_title, state.memberCount, state.memberCount)
                    },
                    style = MaterialTheme.typography.titleMedium,
                    color = MeeshyTheme.tokens.textPrimary,
                    modifier = Modifier.semantics { heading() },
                )
                if (state.mayInvite) {
                    TextButton(onClick = { showAddSheet = true }) {
                        Icon(
                            imageVector = Icons.Filled.PersonAdd,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                        )
                        Spacer(Modifier.width(MeeshySpacing.xs))
                        Text(stringResource(R.string.conversation_members_add))
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
                state.showSkeleton -> ConversationMembersSkeleton()

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
                    itemsIndexed(state.members, key = { _, member -> member.id }, contentType = { _, _ -> "member" }) { index, member ->
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
                        SwipeToRemoveRow(
                            enabled = state.canRemove(member),
                            onRemove = { pendingRemoval = member },
                        ) {
                            MemberRow(
                                member = member,
                                conversationId = conversationId,
                                isSelf = state.isSelf(member),
                                accentColor = accentColor,
                                roleActions = state.roleActions(member),
                                canRemove = state.canRemove(member),
                                canBan = state.canBan(member),
                                onRoleAction = { action -> viewModel.requestRoleChange(member, action) },
                                onRemove = { pendingRemoval = member },
                                onBan = { pendingBan = member },
                                onOpenProfile = {
                                    when {
                                        member.userId == null || state.isSelf(member) -> openProfileFor = member
                                        else -> profileTap(ProfileSheetUser.from(member))
                                    }
                                },
                                onOpenParticipation = { openProfileFor = member },
                            )
                        }
                    }
                    if (state.isLoadingMore) {
                        item { CenteredProgress(accentColor) }
                    }
                }
            }

            TextButton(
                onClick = { confirmLeave = true },
                modifier = Modifier.align(Alignment.CenterHorizontally),
            ) {
                Text(
                    text = stringResource(R.string.members_sheet_leave),
                    color = MeeshyPalette.Error,
                )
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

    state.pendingRoleChange?.let { pending ->
        AlertDialog(
            onDismissRequest = viewModel::cancelRoleChange,
            title = { Text(stringResource(R.string.members_sheet_role_title)) },
            text = {
                Text(
                    stringResource(
                        R.string.members_sheet_role_message,
                        stringResource(pending.action.target.labelRes),
                    ),
                )
            },
            confirmButton = {
                TextButton(onClick = viewModel::confirmRoleChange) {
                    Text(stringResource(R.string.members_sheet_role_confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = viewModel::cancelRoleChange) {
                    Text(stringResource(R.string.conversation_members_remove_cancel))
                }
            },
        )
    }

    if (confirmLeave) {
        AlertDialog(
            onDismissRequest = { confirmLeave = false },
            title = { Text(stringResource(R.string.members_sheet_leave_title)) },
            text = { Text(stringResource(R.string.members_sheet_leave_message)) },
            confirmButton = {
                TextButton(onClick = {
                    confirmLeave = false
                    viewModel.leaveGroup()
                }) {
                    Text(stringResource(R.string.members_sheet_leave_confirm), color = MeeshyPalette.Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmLeave = false }) {
                    Text(stringResource(R.string.conversation_members_remove_cancel))
                }
            },
        )
    }

    if (state.actionFailed) {
        AlertDialog(
            onDismissRequest = viewModel::dismissActionError,
            title = { Text(stringResource(R.string.members_sheet_error_title)) },
            text = { Text(stringResource(R.string.conversation_members_action_failed)) },
            confirmButton = {
                TextButton(onClick = viewModel::dismissActionError) {
                    Text(stringResource(R.string.members_sheet_error_ok))
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

/** Balayage à gauche = Retirer : la ligne revient toujours à sa place, le dialogue de confirmation décide. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SwipeToRemoveRow(enabled: Boolean, onRemove: () -> Unit, content: @Composable () -> Unit) {
    if (!enabled) {
        content()
        return
    }
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) onRemove()
            false
        },
    )
    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        backgroundContent = {
            Box(
                modifier = Modifier.fillMaxSize().background(MeeshyPalette.Error).padding(horizontal = MeeshySpacing.lg),
                contentAlignment = Alignment.CenterEnd,
            ) {
                Text(
                    text = stringResource(R.string.members_sheet_swipe_remove),
                    style = MaterialTheme.typography.labelLarge,
                    color = MeeshyPalette.White,
                )
            }
        },
    ) { content() }
}
