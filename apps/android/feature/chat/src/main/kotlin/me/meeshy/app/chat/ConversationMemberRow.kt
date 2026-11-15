package me.meeshy.app.chat

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.MemberRole
import me.meeshy.sdk.model.MemberRoleAction
import me.meeshy.sdk.model.MemberRoleBadge
import me.meeshy.sdk.model.MemberRowFormat
import me.meeshy.sdk.model.PaginatedParticipant
import me.meeshy.sdk.model.UserPresence
import me.meeshy.sdk.model.displayLabel
import me.meeshy.sdk.model.role
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberConversationHere
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une ligne de la feuille des membres, miroir de `ConversationInfoMemberRow` (iOS) : avatar et présence, nom
 * (« vous » sur sa propre ligne), capsule de rôle, @pseudo et colonne « Depuis ». Toucher ouvre la fiche, l'appui
 * long ouvre le menu contextuel (rôle, retrait, bannissement) limité par la modération du lecteur.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun MemberRow(
    member: PaginatedParticipant,
    conversationId: String,
    isSelf: Boolean,
    accentColor: Color,
    roleActions: List<MemberRoleAction>,
    canRemove: Boolean,
    canBan: Boolean,
    onRoleAction: (MemberRoleAction) -> Unit,
    onRemove: () -> Unit,
    onBan: () -> Unit,
    onOpenProfile: () -> Unit,
    onOpenParticipation: () -> Unit = onOpenProfile,
) {
    var menuOpen by remember { mutableStateOf(false) }
    val name = member.displayLabel
    val since = remember(member.joinedAt) {
        MemberRowFormat.sinceDate(member.joinedAt, Instant.now(), ZoneId.systemDefault(), Locale.getDefault())
    }

    val openProfileLabel = stringResource(R.string.participant_profile_open_a11y, name)
    val participationLabel = stringResource(R.string.conversation_members_open_participation_a11y, name)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MeeshyTheme.tokens.backgroundPrimary)
            .combinedClickable(
                onClickLabel = openProfileLabel,
                onLongClickLabel = participationLabel,
                onLongClick = { menuOpen = true },
                onClick = onOpenProfile,
            )
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        MeeshyAvatar(
            name = name,
            size = 40.dp,
            containerColor = accentColor,
            imageUrl = member.avatar,
            presence = rememberPresence(
                member.userId,
                UserPresence.served(member.isOnline, member.lastActiveAt),
            ),
            // Le compte courant n'a jamais de point : le serveur n'annonce que les autres.
            here = rememberConversationHere(member.userId.takeUnless { isSelf }, conversationId),
        )

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
                    modifier = Modifier.weight(1f, fill = false),
                )
                MemberRowFormat.badge(member.role)?.let { RoleBadge(it) }
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

        since?.let {
            Text(
                text = stringResource(R.string.members_sheet_since, it),
                style = MaterialTheme.typography.labelSmall,
                color = MeeshyTheme.tokens.textMuted,
                maxLines = 1,
            )
        }

        Box {
            IconButton(onClick = { menuOpen = true }) {
                Icon(
                    imageVector = MeeshyIcons.MoreVert,
                    contentDescription = stringResource(R.string.conversation_members_actions, name),
                )
            }
            MemberMenu(
                expanded = menuOpen,
                onDismiss = { menuOpen = false },
                participationLabel = participationLabel,
                roleActions = roleActions,
                canRemove = canRemove,
                canBan = canBan,
                onOpenParticipation = onOpenParticipation,
                onRoleAction = onRoleAction,
                onRemove = onRemove,
                onBan = onBan,
            )
        }
    }
}

@Composable
private fun MemberMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    participationLabel: String,
    roleActions: List<MemberRoleAction>,
    canRemove: Boolean,
    canBan: Boolean,
    onOpenParticipation: () -> Unit,
    onRoleAction: (MemberRoleAction) -> Unit,
    onRemove: () -> Unit,
    onBan: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        DropdownMenuItem(
            text = { Text(participationLabel) },
            onClick = {
                onDismiss()
                onOpenParticipation()
            },
        )
        roleActions.forEach { action ->
            DropdownMenuItem(
                text = { Text(stringResource(action.labelRes)) },
                onClick = {
                    onDismiss()
                    onRoleAction(action)
                },
            )
        }
        if (canRemove) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversation_members_remove), color = MeeshyPalette.Error) },
                onClick = {
                    onDismiss()
                    onRemove()
                },
            )
        }
        if (canBan) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.conversation_members_ban), color = MeeshyPalette.Error) },
                onClick = {
                    onDismiss()
                    onBan()
                },
            )
        }
    }
}

/** Capsule de rôle : Admin en rouge, Modo en orange — le texte la porte, jamais la seule couleur. */
@Composable
private fun RoleBadge(badge: MemberRoleBadge) {
    val (label, color) = when (badge) {
        MemberRoleBadge.ADMIN -> R.string.conversation_members_role_admin to MeeshyPalette.Error
        MemberRoleBadge.MODERATOR -> R.string.conversation_members_role_moderator to MeeshyPalette.Orange500
    }
    Text(
        text = stringResource(label),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        maxLines = 1,
        modifier = Modifier
            .background(color.copy(alpha = 0.15f), RoundedCornerShape(percent = 50))
            .padding(horizontal = MeeshySpacing.xs, vertical = 1.dp),
    )
}

internal val MemberRoleAction.labelRes: Int
    get() = when (this) {
        MemberRoleAction.PROMOTE_MODERATOR -> R.string.conversation_members_promote_moderator
        MemberRoleAction.PROMOTE_ADMIN -> R.string.conversation_members_promote_admin
        MemberRoleAction.DEMOTE_MODERATOR -> R.string.conversation_members_demote_moderator
        MemberRoleAction.DEMOTE_MEMBER -> R.string.conversation_members_demote_member
    }

internal val MemberRole.labelRes: Int
    get() = when (this) {
        MemberRole.CREATOR -> R.string.conversation_members_role_creator
        MemberRole.ADMIN -> R.string.conversation_members_role_admin
        MemberRole.MODERATOR -> R.string.conversation_members_role_moderator
        MemberRole.MEMBER -> R.string.conversation_members_role_member
    }
