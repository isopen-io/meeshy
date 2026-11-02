package me.meeshy.app.conversations

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.flow.MutableSharedFlow
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.feedback.HapticKind
import me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities
import me.meeshy.sdk.theme.accentColorPalette
import me.meeshy.ui.component.FeedbackToastHost
import me.meeshy.ui.component.FeedbackToastRequest
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * L'hôte UNIQUE des dialogues de la liste : il rend [ConversationListDialogController.dialog]
 * (une confirmation, le champ de renommage, la feuille de signalement), joue ses effets
 * (haptique, toast, Réglages, recherche armée) et prend les navigations « Infos » / « Inviter »
 * une seule fois. Une destination absente de [rowNavigation] ferme simplement le dialogue.
 */
@Composable
internal fun ConversationListDialogHost(
    controller: ConversationListDialogController,
    rowNavigation: ConversationRowNavigation,
    onOpenSettings: () -> Unit,
    onOpenConversationSearch: (String) -> Unit,
) {
    val dialog by controller.dialog.collectAsStateWithLifecycle()
    val haptics = rememberMeeshyHaptics()
    val toasts = remember { MutableSharedFlow<FeedbackToastRequest>(extraBufferCapacity = 4) }
    val openSettings by rememberUpdatedState(onOpenSettings)
    val armSearch by rememberUpdatedState(onOpenConversationSearch)
    LaunchedEffect(controller) {
        controller.effects.collect { effect ->
            when (effect) {
                is ConversationListDialogEffect.Haptic -> haptics.play(effect.kind)
                is ConversationListDialogEffect.Toast -> toasts.tryEmit(effect.request)
                ConversationListDialogEffect.OpenSettings -> openSettings()
                is ConversationListDialogEffect.ArmSearch -> armSearch(effect.conversationId)
            }
        }
    }
    FeedbackToastHost(toasts = toasts)

    val current = dialog ?: return
    LaunchedEffect(current) { routeNavigation(current, controller, rowNavigation) }
    when (current) {
        is ConversationListDialog.Block -> ConfirmDialog(
            title = stringResource(R.string.dialogs_block_title),
            message = stringResource(R.string.dialogs_block_message),
            confirmLabel = stringResource(R.string.dialogs_block_confirm),
            onConfirm = controller::confirmBlock,
            onDismiss = controller::dismiss,
        )
        is ConversationListDialog.Removal -> ConfirmDialog(
            title = stringResource(current.removal.titleRes()),
            message = stringResource(R.string.dialogs_removal_message, current.conversationName),
            confirmLabel = stringResource(current.removal.labelRes()),
            onConfirm = controller::confirmRemoval,
            onDismiss = controller::dismiss,
        )
        is ConversationListDialog.Leave -> ConfirmDialog(
            title = stringResource(R.string.dialogs_leave_title),
            message = stringResource(R.string.dialogs_leave_message),
            confirmLabel = stringResource(R.string.dialogs_leave_confirm),
            onConfirm = controller::confirmLeave,
            onDismiss = controller::dismiss,
        )
        is ConversationListDialog.MasterPinRequired -> ConfirmDialog(
            title = stringResource(R.string.dialogs_master_pin_title),
            message = stringResource(R.string.dialogs_master_pin_message),
            confirmLabel = stringResource(R.string.dialogs_master_pin_configure),
            destructive = false,
            onConfirm = controller::confirmMasterPinRequired,
            onDismiss = controller::dismiss,
        )
        is ConversationListDialog.Rename -> RenameDialog(
            target = current,
            onSave = controller::confirmRename,
            onDismiss = controller::dismiss,
        )
        is ConversationListDialog.Report -> ConversationReportSheet(
            accent = controller.conversationOf(current.conversationId)
                ?.let { hexColor(it.accentColorPalette().primary, MeeshyPalette.Indigo500) }
                ?: MeeshyPalette.Indigo500,
            onSubmit = controller::submitReport,
            onDismiss = controller::dismiss,
        )
        is ConversationListDialog.Info, is ConversationListDialog.Invite -> Unit
    }
}

/** « Infos » et « Inviter » : pris une fois ([ConversationListDialogController.takeNavigation]), puis ouverts. */
private fun routeNavigation(
    dialog: ConversationListDialog,
    controller: ConversationListDialogController,
    navigation: ConversationRowNavigation,
) {
    val open = when (dialog) {
        is ConversationListDialog.Info -> navigation.onViewInfo
        is ConversationListDialog.Invite -> navigation.onCreateShareLink
        else -> return
    }
    if (controller.takeNavigation(dialog)) open?.invoke(dialog.conversationId)
}

@Composable
private fun ConfirmDialog(
    title: String,
    message: String,
    confirmLabel: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = true,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
        title = { Text(title, color = MeeshyTheme.tokens.textPrimary) },
        text = { Text(message, color = MeeshyTheme.tokens.textSecondary) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(confirmLabel, color = if (destructive) MeeshyTheme.tokens.error else MeeshyPalette.Indigo500)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.dialogs_cancel), color = MeeshyTheme.tokens.textSecondary)
            }
        },
    )
}

@Composable
private fun RenameDialog(
    target: ConversationListDialog.Rename,
    onSave: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by rememberSaveable(target.conversationId) { mutableStateOf(target.initialName) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = MeeshyTheme.tokens.backgroundSecondary,
        title = { Text(stringResource(R.string.dialogs_rename_title), color = MeeshyTheme.tokens.textPrimary) },
        text = {
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                singleLine = true,
                label = { Text(stringResource(R.string.dialogs_rename_placeholder)) },
            )
        },
        confirmButton = {
            TextButton(onClick = { onSave(text) }, enabled = text.isNotBlank()) {
                val tint = if (text.isNotBlank()) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textSecondary.copy(alpha = 0.5f)
                Text(stringResource(R.string.dialogs_save), color = tint)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.dialogs_cancel), color = MeeshyTheme.tokens.textSecondary)
            }
        },
    )
}

private fun ConversationRowMenuCapabilities.Removal.titleRes(): Int = when (this) {
    ConversationRowMenuCapabilities.Removal.DELETE -> R.string.dialogs_delete_title
    ConversationRowMenuCapabilities.Removal.HIDE -> R.string.dialogs_hide_title
}

private fun ConversationRowMenuCapabilities.Removal.labelRes(): Int = when (this) {
    ConversationRowMenuCapabilities.Removal.DELETE -> R.string.dialogs_removal_delete
    ConversationRowMenuCapabilities.Removal.HIDE -> R.string.dialogs_removal_hide
}

private fun MeeshyHaptics.play(kind: HapticKind) = when (kind) {
    HapticKind.LIGHT -> light()
    HapticKind.MEDIUM -> medium()
    HapticKind.HEAVY -> heavy()
    HapticKind.RIGID -> rigid()
    HapticKind.SUCCESS -> success()
    HapticKind.WARNING -> warning()
    HapticKind.ERROR -> error()
    HapticKind.SELECTION -> selection()
}
