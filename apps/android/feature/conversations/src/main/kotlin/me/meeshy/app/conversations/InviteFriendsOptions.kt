package me.meeshy.app.conversations

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CreateShareLinkForm
import me.meeshy.sdk.model.InviteLinkDraft
import me.meeshy.sdk.model.ShareLinkExpiration
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

private const val DISABLED_ALPHA = 0.4f

internal fun ShareLinkExpiration.labelRes(): Int = when (this) {
    ShareLinkExpiration.Never -> R.string.share_link_expiration_never
    ShareLinkExpiration.Hours24 -> R.string.my_share_links_expiry_24h
    ShareLinkExpiration.Days7 -> R.string.my_share_links_expiry_7d
    ShareLinkExpiration.Days30 -> R.string.my_share_links_expiry_30d
    ShareLinkExpiration.Months3 -> R.string.my_share_links_expiry_3m
}

/** Phase 2 d'iOS : identité, limites, permissions, accès. Chaque réglage passe par un seul puits d'événements. */
@Composable
internal fun InviteFriendsOptionsPanel(
    draft: InviteLinkDraft,
    defaultLinkName: String,
    accent: Color,
    onEvent: (InviteFriendsUiEvent) -> Unit,
    modifier: Modifier = Modifier,
) {
    val form = draft.form
    fun edit(transform: (CreateShareLinkForm) -> CreateShareLinkForm) = onEvent(InviteFriendsUiEvent.EditForm(transform))
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        FormSection(stringResource(R.string.invite_section_identity), MeeshyIcons.EditFilled, accent) {
            OutlinedTextField(
                value = form.name,
                onValueChange = { value -> edit { it.withName(value) } },
                label = { Text(stringResource(R.string.invite_linkName)) },
                placeholder = { Text(defaultLinkName) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md),
            )
        }
        FormSection(stringResource(R.string.invite_section_limits), MeeshyIcons.Speed, accent) {
            ExpirationRow(form.expiration, accent) { value -> edit { it.withExpiration(value) } }
            FormDivider()
            InviteToggleRow(
                title = stringResource(R.string.invite_limitUses),
                subtitle = if (form.maxUsesEnabled) "${form.maxUses} max" else stringResource(R.string.invite_unlimited),
                icon = MeeshyIcons.GroupFilled,
                iconColor = MeeshyTheme.tokens.info,
                accent = accent,
                checked = form.maxUsesEnabled,
                onCheckedChange = { value -> edit { it.withMaxUsesEnabled(value) } },
            )
            if (form.maxUsesEnabled) {
                MaxUsesStepper(form.maxUses, accent, onStep = { onEvent(InviteFriendsUiEvent.StepMaxUses(it)) })
            }
        }
        FormSection(stringResource(R.string.invite_section_permissions), MeeshyIcons.Tune, accent) {
            val tokens = MeeshyTheme.tokens
            InviteToggleRow(stringResource(R.string.invite_perm_messages), null, MeeshyIcons.ChatBubble, accent, accent, form.allowAnonymousMessages) { v -> edit { it.withAllowAnonymousMessages(v) } }
            FormDivider()
            InviteToggleRow(stringResource(R.string.invite_perm_images), null, MeeshyIcons.PhotoFilled, tokens.success, accent, form.allowAnonymousImages) { v -> edit { it.withAllowAnonymousImages(v) } }
            FormDivider()
            InviteToggleRow(stringResource(R.string.invite_perm_files), null, MeeshyIcons.AttachFile, tokens.warning, accent, form.allowAnonymousFiles) { v -> edit { it.withAllowAnonymousFiles(v) } }
            FormDivider()
            InviteToggleRow(stringResource(R.string.invite_perm_history), null, MeeshyIcons.ScheduleFilled, tokens.info, accent, form.allowViewHistory) { v -> edit { it.withAllowViewHistory(v) } }
        }
        FormSection(stringResource(R.string.invite_section_access), MeeshyIcons.LockFilled, accent) {
            val tokens = MeeshyTheme.tokens
            InviteToggleRow(stringResource(R.string.invite_access_account), null, MeeshyIcons.Badge, accent, accent, form.requireAccount) { v -> edit { it.withRequireAccount(v) } }
            FormDivider()
            InviteToggleRow(stringResource(R.string.invite_access_nickname), null, MeeshyIcons.PersonFilled, tokens.textSecondary, accent, form.effectiveRequireNickname, enabled = form.guestRequirementsEditable) { v -> edit { it.withRequireNickname(v) } }
            FormDivider()
            InviteToggleRow(stringResource(R.string.invite_access_email), null, MeeshyIcons.MailFilled, tokens.warning, accent, form.effectiveRequireEmail, enabled = form.guestRequirementsEditable) { v -> edit { it.withRequireEmail(v) } }
        }
    }
}

@Composable
private fun ExpirationRow(selected: ShareLinkExpiration, accent: Color, onSelect: (ShareLinkExpiration) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        IconBadge(MeeshyIcons.Timer, MeeshyTheme.tokens.error)
        Text(
            stringResource(R.string.invite_expiration_title),
            style = MaterialTheme.typography.titleSmall,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        OutlinedButton(onClick = { open = true }) {
            Text(stringResource(selected.labelRes()), color = accent)
            DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
                ShareLinkExpiration.entries.forEach { option ->
                    DropdownMenuItem(
                        text = { Text(stringResource(option.labelRes())) },
                        onClick = {
                            open = false
                            onSelect(option)
                        },
                    )
                }
            }
        }
    }
}

@Composable
private fun MaxUsesStepper(value: Int, accent: Color, onStep: (Int) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text("$value", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = accent)
        Row(horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
            OutlinedButton(onClick = { onStep(-1) }, enabled = value > CreateShareLinkForm.MIN_MAX_USES) { Text("−") }
            OutlinedButton(onClick = { onStep(1) }, enabled = value < CreateShareLinkForm.MAX_MAX_USES) { Text("+") }
        }
    }
}

@Composable
private fun InviteToggleRow(
    title: String,
    subtitle: String?,
    icon: ImageVector,
    iconColor: Color,
    accent: Color,
    checked: Boolean,
    enabled: Boolean = true,
    onCheckedChange: (Boolean) -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .alpha(if (enabled) 1f else DISABLED_ALPHA)
            .heightIn(min = 56.dp)
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
            .semantics(mergeDescendants = true) { subtitle?.let { stateDescription = it } }
            .padding(MeeshySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        IconBadge(icon, iconColor)
        Column(modifier = Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium, color = MeeshyTheme.tokens.textPrimary)
            subtitle?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary) }
        }
        Switch(checked = checked, onCheckedChange = null, enabled = enabled, colors = SwitchDefaults.colors(checkedTrackColor = accent))
    }
}
