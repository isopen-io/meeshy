package me.meeshy.app.contacts

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.component.people.PersonAvatar
import me.meeshy.ui.component.people.PersonRowLabels
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.theme.MeeshyControlSize
import me.meeshy.ui.theme.MeeshyFontSize
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Un résultat du clavier : avatar (présence SERVIE seulement), nom, @identifiant — le toucher ouvre la fiche ;
 * le bouton d'appel ouvre le menu Appel vocal / vidéo quand une conversation directe existe, sinon la fiche
 * (iOS `CallRowDialButton.onUnavailable`).
 */
@Composable
internal fun KeypadResultRow(
    row: KeypadRow,
    onOpenProfile: () -> Unit,
    onCall: (conversationId: String, name: String, video: Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val tokens = MeeshyTheme.tokens
    val user = row.user
    val name = user.displayName?.takeIf { it.isNotBlank() } ?: user.username.ifBlank { "?" }
    val presence = rememberPresence(user.id, user.servedPresence())
    val onlineLabel = stringResource(R.string.keypad_online_lower).takeIf { presence == PresenceState.ONLINE }
    val rowLabel = PersonRowLabels.accessibility(name, user.username, onlineLabel)
    val openProfileHint = stringResource(R.string.keypad_result_open_profile_a11y)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.xl, vertical = MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
    ) {
        Row(
            modifier = Modifier
                .weight(1f)
                .defaultMinSize(minHeight = MeeshyControlSize.minTouchTarget)
                .clickable(role = Role.Button, onClick = onOpenProfile)
                .clearAndSetSemantics {
                    contentDescription = rowLabel
                    role = Role.Button
                    onClick(label = openProfileHint) { onOpenProfile(); true }
                },
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.mdPlus),
        ) {
            PersonAvatar(name = name, imageUrl = user.avatar, presence = presence, userId = user.id)
            Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxs)) {
                Text(
                    text = name,
                    color = tokens.textPrimary,
                    fontSize = MeeshyFontSize.subhead,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (user.username.isNotBlank()) {
                    Text(
                        text = "@${user.username}",
                        color = tokens.textMuted,
                        fontSize = MeeshyFontSize.small,
                        fontWeight = FontWeight.Medium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        DialButton(
            conversationId = row.directConversationId,
            onUnavailable = onOpenProfile,
            onCall = { video -> row.directConversationId?.let { onCall(it, name, video) } },
        )
    }
}

@Composable
private fun DialButton(
    conversationId: String?,
    onUnavailable: () -> Unit,
    onCall: (video: Boolean) -> Unit,
) {
    var menuOpen by remember { mutableStateOf(false) }
    Box {
        IconButton(
            onClick = { if (conversationId == null) onUnavailable() else menuOpen = true },
            modifier = Modifier.defaultMinSize(MeeshyControlSize.minTouchTarget, MeeshyControlSize.minTouchTarget),
        ) {
            Icon(
                imageVector = Icons.Filled.Call,
                contentDescription = stringResource(R.string.keypad_call),
                tint = MeeshyPalette.Indigo500,
            )
        }
        DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.keypad_call_audio)) },
                leadingIcon = { Icon(Icons.Filled.Call, contentDescription = null) },
                onClick = { menuOpen = false; onCall(false) },
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.keypad_call_video)) },
                leadingIcon = { Icon(Icons.Filled.Videocam, contentDescription = null) },
                onClick = { menuOpen = false; onCall(true) },
            )
        }
    }
}
