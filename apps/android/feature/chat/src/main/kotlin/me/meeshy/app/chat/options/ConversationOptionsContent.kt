package me.meeshy.app.chat.options

import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.conversationoptions.ArchiveGesture
import me.meeshy.ui.component.ReactionCategorySheet
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSectionHeader
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.component.settings.SettingsSwitchRow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les deux places que les Options occupent dans la fiche : sous l'en-tête, et en bas (l'onglet Options d'iOS). */
@Stable
internal class ConversationOptionsSlots(
    val header: @Composable () -> Unit,
    val body: @Composable () -> Unit,
)

private enum class OptionsDialog { FAVORITE, ARCHIVE, LEAVE_GROUP, DELETE, LEAVE, BLOCK }

/**
 * Les Options de la fiche Conversation (#13777) : « Bloquer cet utilisateur », « Partager » et
 * « Quitter » sous l'en-tête (iOS `blockUserButton`, `actionButtons`), puis Mon affichage,
 * Organisation, Notifications et Actions (iOS `ConversationPreferencesTab`), avec les mêmes
 * confirmations. [onExit] est appelé une fois la conversation quittée, supprimée ou le pair bloqué.
 */
@Composable
internal fun rememberConversationOptionsSlots(
    conversationId: String,
    peerUserId: String?,
    title: String,
    accentColor: Color,
    onOpenAppearance: () -> Unit,
    onShare: () -> Unit,
    onExit: (ConversationOptionsExit) -> Unit,
    viewModel: ConversationOptionsViewModel = hiltViewModel(key = "conversation-options"),
): ConversationOptionsSlots {
    LaunchedEffect(conversationId, peerUserId) { viewModel.start(conversationId, peerUserId) }
    val ui by viewModel.state.collectAsStateWithLifecycle()
    var dialog by remember { mutableStateOf<OptionsDialog?>(null) }
    val context = LocalContext.current
    val blockedMessage = stringResource(R.string.conversation_options_block_success)
    val exit = ui.exit
    LaunchedEffect(exit) {
        if (exit == null) return@LaunchedEffect
        viewModel.consumeExit()
        if (exit == ConversationOptionsExit.BLOCKED) Toast.makeText(context, blockedMessage, Toast.LENGTH_SHORT).show()
        onExit(exit)
    }
    OptionsDialogHost(dialog, ui, title, accentColor, viewModel) { dialog = null }
    return ConversationOptionsSlots(
        header = { OptionsHeaderActions(ui, onShare = onShare, onAsk = { dialog = it }) },
        body = {
            OptionsSections(
                ui = ui,
                accentColor = accentColor,
                viewModel = viewModel,
                onOpenAppearance = onOpenAppearance,
                onAsk = { dialog = it },
            )
        },
    )
}

@Composable
private fun OptionsHeaderActions(ui: ConversationOptionsUiState, onShare: () -> Unit, onAsk: (OptionsDialog) -> Unit) {
    val plan = ui.plan ?: return
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        if (plan.blockUserId != null) {
            OptionsPillButton(
                icon = MeeshyIcons.GppMaybe,
                label = stringResource(R.string.conversation_options_block_title),
                color = MeeshyPalette.Error,
                modifier = Modifier.fillMaxWidth(),
                onClick = { onAsk(OptionsDialog.BLOCK) },
            )
        }
        if (plan.share || plan.leave) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
                if (plan.share) {
                    OptionsPillButton(
                        icon = MeeshyIcons.AddLink,
                        label = stringResource(R.string.conversation_options_share),
                        color = MeeshyPalette.Info,
                        modifier = Modifier.weight(1f),
                        onClick = onShare,
                    )
                }
                if (plan.leave) {
                    OptionsPillButton(
                        icon = MeeshyIcons.SignOut,
                        label = stringResource(R.string.conversation_options_leave),
                        color = MeeshyPalette.Error,
                        modifier = Modifier.weight(1f),
                        onClick = { onAsk(OptionsDialog.LEAVE) },
                    )
                }
            }
        }
    }
}

@Composable
private fun OptionsSections(
    ui: ConversationOptionsUiState,
    accentColor: Color,
    viewModel: ConversationOptionsViewModel,
    onOpenAppearance: () -> Unit,
    onAsk: (OptionsDialog) -> Unit,
) {
    val values = ui.values
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg)) {
        OptionsSection(R.string.conversation_options_section_display, MeeshyIcons.Palette, accentColor) {
            ConversationCustomNameField(ui.customNameDraft, accentColor, viewModel::editCustomName)
            SettingsSeparator(accentColor)
            SettingsRow(
                icon = MeeshyIcons.StarFilled,
                title = stringResource(R.string.conversation_options_favorite),
                color = accentColor,
                value = values.reaction ?: stringResource(R.string.conversation_options_reaction_none),
                modifier = Modifier.clickable(role = Role.Button) { onAsk(OptionsDialog.FAVORITE) },
            ) {
                Text(
                    text = values.reaction ?: stringResource(R.string.conversation_options_reaction_none),
                    fontSize = if (values.reaction != null) 22.sp else 14.sp,
                    color = MeeshyTheme.tokens.textMuted,
                )
                Chevron()
            }
            SettingsSeparator(accentColor)
            SettingsRow(
                icon = MeeshyIcons.Wallpaper,
                title = stringResource(R.string.conversation_appearance_entry_title),
                color = accentColor,
                modifier = Modifier.clickable(role = Role.Button, onClick = onOpenAppearance),
            ) { Chevron() }
        }
        OptionsSection(R.string.conversation_options_section_organization, MeeshyIcons.FolderFilled, MeeshyPalette.Info) {
            SettingsSwitchRow(
                icon = MeeshyIcons.PinFilled,
                title = stringResource(R.string.conversation_options_pin),
                color = MeeshyPalette.Info,
                checked = values.isPinned,
                onCheckedChange = viewModel::setPinned,
            )
            SettingsSeparator(MeeshyPalette.Info)
            ConversationCategoryField(
                categories = ui.categories,
                selectedId = values.categoryId,
                color = MeeshyPalette.Info,
                onSelect = viewModel::selectCategory,
                onCreate = viewModel::createCategory,
            )
            SettingsSeparator(MeeshyPalette.Info)
            ConversationTagsField(
                tags = values.tags,
                knownTags = ui.knownTags,
                color = MeeshyPalette.Info,
                onAdd = viewModel::addTag,
                onRemove = viewModel::removeTag,
            )
        }
        OptionsSection(R.string.conversation_options_section_notifications, MeeshyIcons.BellFilled, MeeshyPalette.TileCoral) {
            SettingsSwitchRow(
                icon = MeeshyIcons.BellOff,
                title = stringResource(R.string.conversation_options_muted),
                color = MeeshyPalette.TileCoral,
                checked = values.isMuted,
                onCheckedChange = viewModel::setMuted,
            )
            SettingsSeparator(MeeshyPalette.TileCoral)
            SettingsSwitchRow(
                icon = MeeshyIcons.Mention,
                title = stringResource(R.string.conversation_options_mentions_only),
                color = MeeshyPalette.TileCoral,
                checked = values.mentionsOnly,
                enabled = values.mentionsOnlyEnabled,
                onCheckedChange = viewModel::setMentionsOnly,
            )
        }
        OptionsActionsSection(ui, onAsk)
        ui.error?.let { error ->
            Text(
                text = stringResource(error.messageRes()),
                color = MeeshyPalette.Error,
                fontSize = 14.sp,
                modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl),
            )
        }
    }
}

@Composable
private fun OptionsActionsSection(ui: ConversationOptionsUiState, onAsk: (OptionsDialog) -> Unit) {
    val plan = ui.plan ?: return
    if (!plan.toggleArchive && !plan.leaveGroup && !plan.deleteForMe) return
    val rows = buildList<@Composable () -> Unit> {
        if (plan.toggleArchive) {
            add {
                val archived = ui.values.archiveGesture == ArchiveGesture.UNARCHIVE
                SettingsRow(
                    icon = MeeshyIcons.Inbox,
                    title = stringResource(if (archived) R.string.conversation_options_unarchive else R.string.conversation_options_archive),
                    color = MeeshyPalette.Amber500,
                    modifier = Modifier.clickable(role = Role.Button) { onAsk(OptionsDialog.ARCHIVE) },
                )
            }
        }
        if (plan.leaveGroup) {
            add {
                SettingsRow(
                    icon = MeeshyIcons.SignOut,
                    title = stringResource(R.string.conversation_options_leave_group),
                    color = MeeshyPalette.Orange500,
                    modifier = Modifier.clickable(role = Role.Button) { onAsk(OptionsDialog.LEAVE_GROUP) },
                )
            }
        }
        if (plan.deleteForMe) {
            add {
                SettingsRow(
                    icon = MeeshyIcons.DeleteFilled,
                    title = stringResource(R.string.conversation_options_delete_for_me),
                    color = MeeshyPalette.Error,
                    modifier = Modifier.clickable(role = Role.Button) { onAsk(OptionsDialog.DELETE) },
                )
            }
        }
    }
    OptionsSection(R.string.conversation_options_section_actions, MeeshyIcons.MoreHorizontal, MeeshyPalette.Neutral500) {
        rows.forEachIndexed { index, row ->
            if (index > 0) SettingsSeparator(MeeshyPalette.Neutral500)
            row()
        }
    }
}

@Composable
private fun OptionsSection(
    titleRes: Int,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SettingsSectionHeader(title = stringResource(titleRes), icon = icon, color = color)
        SettingsCard(tint = color, modifier = Modifier.fillMaxWidth(), content = content)
    }
}

@Composable
private fun Chevron() {
    Icon(
        MeeshyIcons.ChevronForward,
        contentDescription = null,
        tint = MeeshyTheme.tokens.textMuted,
        modifier = Modifier.padding(start = MeeshySpacing.xs).size(14.dp),
    )
}

@Composable
private fun OptionsDialogHost(
    dialog: OptionsDialog?,
    ui: ConversationOptionsUiState,
    title: String,
    accentColor: Color,
    viewModel: ConversationOptionsViewModel,
    onDismiss: () -> Unit,
) {
    when (dialog) {
        null -> Unit
        OptionsDialog.FAVORITE -> Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            Box(Modifier.fillMaxSize().clickable(onClick = onDismiss)) {
                ReactionCategorySheet(
                    onReact = { emoji -> viewModel.setReaction(emoji); onDismiss() },
                    onDismiss = onDismiss,
                    accentColor = accentColor,
                    modifier = Modifier.align(Alignment.BottomCenter).navigationBarsPadding(),
                )
            }
        }
        OptionsDialog.ARCHIVE -> {
            val unarchive = ui.values.archiveGesture == ArchiveGesture.UNARCHIVE
            ConfirmDialog(
                title = stringResource(if (unarchive) R.string.conversation_options_unarchive_title else R.string.conversation_options_archive_title),
                message = null,
                confirm = stringResource(if (unarchive) R.string.conversation_options_unarchive else R.string.conversation_options_archive),
                destructive = !unarchive,
                onConfirm = viewModel::toggleArchive,
                onDismiss = onDismiss,
            )
        }
        OptionsDialog.LEAVE_GROUP -> ConfirmDialog(
            title = stringResource(R.string.conversation_options_leave_group_title),
            message = stringResource(R.string.conversation_options_leave_group_message),
            confirm = stringResource(R.string.conversation_options_leave_group_confirm),
            onConfirm = viewModel::leave,
            onDismiss = onDismiss,
        )
        OptionsDialog.LEAVE -> ConfirmDialog(
            title = stringResource(R.string.conversation_options_leave_title),
            message = stringResource(R.string.conversation_options_leave_message),
            confirm = stringResource(R.string.conversation_options_leave),
            onConfirm = viewModel::leave,
            onDismiss = onDismiss,
        )
        OptionsDialog.DELETE -> ConfirmDialog(
            title = stringResource(R.string.conversation_options_delete_title),
            message = stringResource(R.string.conversation_options_delete_message),
            confirm = stringResource(R.string.conversation_options_delete_confirm),
            onConfirm = viewModel::deleteForMe,
            onDismiss = onDismiss,
        )
        OptionsDialog.BLOCK -> ConfirmDialog(
            title = stringResource(R.string.conversation_options_block_title),
            message = stringResource(R.string.conversation_options_block_message, title),
            confirm = stringResource(R.string.conversation_options_block_confirm),
            onConfirm = viewModel::blockPeer,
            onDismiss = onDismiss,
        )
    }
}

@Composable
private fun ConfirmDialog(
    title: String,
    message: String?,
    confirm: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = true,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = message?.let { { Text(it) } },
        confirmButton = {
            TextButton(onClick = { onDismiss(); onConfirm() }) {
                Text(confirm, color = if (destructive) MeeshyPalette.Error else MeeshyTheme.tokens.textPrimary)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.conversation_options_cancel)) }
        },
    )
}

private fun ConversationOptionsError.messageRes(): Int = when (this) {
    ConversationOptionsError.SAVE -> R.string.conversation_options_error_save
    ConversationOptionsError.CREATE_CATEGORY -> R.string.conversation_options_error_create_category
    ConversationOptionsError.LEAVE -> R.string.conversation_options_error_leave
    ConversationOptionsError.DELETE -> R.string.conversation_options_error_delete
}
