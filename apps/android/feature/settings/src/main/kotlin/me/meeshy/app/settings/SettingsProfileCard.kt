package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** iOS `SettingsView.profileCard` : avatar, nom affiché, @pseudo, chevron ; un tap ouvre son propre profil. Aucun anneau de décor tant que le modèle ne le porte pas. */
@Composable
internal fun SettingsProfileCard(state: SettingsUiState, onOpenProfile: (String) -> Unit) {
    val haptics = rememberMeeshyHaptics()
    SettingsCard(tint = MeeshyPalette.Indigo500) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(enabled = state.userId != null) {
                    haptics.light()
                    state.userId?.let(onOpenProfile)
                }
                .semantics { role = Role.Button }
                .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            MeeshyAvatar(
                name = state.profileTitle.ifEmpty { "?" },
                imageUrl = state.avatar,
                modifier = Modifier.size(48.dp),
            )
            Spacer(Modifier.width(MeeshySpacing.md))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.profileTitle,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                state.profileHandle?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.bodySmall,
                        color = MeeshyTheme.tokens.textSecondary,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Icon(
                MeeshyIcons.ChevronForward,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

