package me.meeshy.app.feed

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.CommentMenuAction
import me.meeshy.sdk.model.CommentMenuPolicy
import me.meeshy.sdk.model.ContentRemovalReason
import me.meeshy.ui.haptics.MeeshyHaptics
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Ce que l'hôte (la feuille ou le détail — UN seul moteur) met derrière le « … » d'un commentaire : qui regarde, et les
 * gestes qu'il sait faire. Un geste absent retire son entrée du menu ; l'hôte ne sait rien de plus que ce que la loi
 * [CommentMenuPolicy] lui demande.
 */
internal class CommentMenuHost(
    val viewerId: String?,
    val viewerRole: String?,
    val onEdit: ((String) -> Unit)? = null,
    val onRequestReport: ((String) -> Unit)? = null,
    val onRequestRemove: ((String) -> Unit)? = null,
)

internal val LocalCommentMenuHost = staticCompositionLocalOf<CommentMenuHost?> { null }

/** Une entrée du menu, déjà libellée et câblée : le « … » la dessine, TalkBack la propose en action personnalisée. */
internal class CommentMenuEntry(val action: CommentMenuAction, val label: String, val run: () -> Unit) {
    val destructive: Boolean get() = action == CommentMenuAction.DELETE || action == CommentMenuAction.REMOVE
}

/** Les entrées de [comment] pour ce lecteur, dans l'ordre d'iOS — la même liste pour le menu et pour TalkBack. */
@Composable
internal fun rememberCommentMenuEntries(
    comment: CommentPresentation,
    onDelete: (String) -> Unit,
    imaging: CommentImaging?,
): List<CommentMenuEntry> {
    val host = LocalCommentMenuHost.current
    val clipboard = LocalClipboardManager.current
    val haptics = rememberMeeshyHaptics()
    val card = imaging?.cardOf?.invoke(comment.id)
    val authorKey = comment.authorId ?: comment.id
    val viewerKey = if (comment.isOwn) authorKey else host?.viewerId ?: UNKNOWN_VIEWER
    val actions = CommentMenuPolicy.actions(
        authorId = authorKey,
        viewerId = viewerKey,
        platformRole = host?.viewerRole,
        servedText = comment.content,
        effectFlags = comment.effectFlags,
        canImagine = imaging != null && card != null,
        editable = host?.onEdit != null,
        deletable = true,
        removable = host?.onRequestRemove != null,
    ).filter { it != CommentMenuAction.REPORT || host?.onRequestReport != null }
    val labels = CommentMenuLabels(
        copy = stringResource(R.string.post_comments_copy_text),
        imagine = stringResource(R.string.feed_comment_imagine),
        edit = stringResource(R.string.comment_menu_edit),
        report = stringResource(R.string.comment_menu_report),
        delete = stringResource(R.string.post_comments_delete_action),
        remove = stringResource(R.string.comment_menu_remove),
    )
    return actions.map { action ->
        CommentMenuEntry(action, labels.of(action)) {
            runCommentMenuAction(action, comment, host, haptics, onDelete) {
                when (action) {
                    CommentMenuAction.COPY -> clipboard.setText(AnnotatedString(comment.content))
                    CommentMenuAction.IMAGINE -> if (imaging != null && card != null) imaging.open(comment.id, card)
                    else -> Unit
                }
            }
        }
    }
}

private const val UNKNOWN_VIEWER = "viewer"

private class CommentMenuLabels(val copy: String, val imagine: String, val edit: String, val report: String, val delete: String, val remove: String) {
    fun of(action: CommentMenuAction): String = when (action) {
        CommentMenuAction.COPY -> copy
        CommentMenuAction.IMAGINE -> imagine
        CommentMenuAction.EDIT -> edit
        CommentMenuAction.REPORT -> report
        CommentMenuAction.DELETE -> delete
        CommentMenuAction.REMOVE -> remove
    }
}

private fun runCommentMenuAction(
    action: CommentMenuAction,
    comment: CommentPresentation,
    host: CommentMenuHost?,
    haptics: MeeshyHaptics,
    onDelete: (String) -> Unit,
    local: () -> Unit,
) {
    when (action) {
        CommentMenuAction.COPY, CommentMenuAction.IMAGINE -> { haptics.selection(); local() }
        CommentMenuAction.EDIT -> { haptics.light(); host?.onEdit?.invoke(comment.id) }
        CommentMenuAction.REPORT -> { haptics.light(); host?.onRequestReport?.invoke(comment.id) }
        CommentMenuAction.DELETE -> { haptics.warning(); onDelete(comment.id) }
        CommentMenuAction.REMOVE -> { haptics.warning(); host?.onRequestRemove?.invoke(comment.id) }
    }
}

/** Les mêmes entrées en actions personnalisées TalkBack de la ligne : un lecteur d'écran n'a pas à viser le « … ». */
internal fun Modifier.commentMenuCustomActions(entries: List<CommentMenuEntry>): Modifier =
    if (entries.isEmpty()) this else semantics {
        customActions = entries.map { entry -> CustomAccessibilityAction(entry.label) { entry.run(); true } }
    }

/**
 * Pose l'hôte du menu sous [content] et dessine ce qu'il ouvre : le motif d'un signalement, le motif d'un retrait.
 * Modifier, signaler et retirer sont des gestes du MÊME [PostCommentsViewModel] que la feuille et le détail partagent.
 */
@Composable
internal fun ProvideCommentMenu(state: PostCommentsUiState, viewModel: PostCommentsViewModel, content: @Composable () -> Unit) {
    var reporting by remember { mutableStateOf<String?>(null) }
    var removing by remember { mutableStateOf<String?>(null) }
    val host = remember(state.viewerId, state.viewerRole, viewModel) {
        CommentMenuHost(
            viewerId = state.viewerId,
            viewerRole = state.viewerRole,
            onEdit = viewModel::beginEdit,
            onRequestReport = { reporting = it },
            onRequestRemove = { removing = it },
        )
    }
    reporting?.let { id ->
        ReportPostDialog(
            onDismiss = { reporting = null },
            onReport = { reason -> reporting = null; viewModel.reportComment(id, reason) },
            titleRes = R.string.comment_menu_report_title,
        )
    }
    removing?.let { id ->
        RemoveCommentDialog(onDismiss = { removing = null }, onConfirm = { reason -> removing = null; viewModel.removeComment(id, reason) })
    }
    CompositionLocalProvider(LocalCommentMenuHost provides host, content = content)
}

/** Le retrait par la modération : le motif est exigé (3 à 500 caractères), sans quoi rien ne part. */
@Composable
internal fun RemoveCommentDialog(onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    var reason by remember { mutableStateOf("") }
    val valid = ContentRemovalReason.normalized(reason) != null
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.comment_menu_remove_title)) },
        text = {
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it.take(ContentRemovalReason.MAX_LENGTH) },
                placeholder = { Text(stringResource(R.string.comment_menu_remove_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )
        },
        confirmButton = {
            TextButton(enabled = valid, onClick = { onConfirm(reason) }) {
                Text(stringResource(R.string.comment_menu_remove), color = MeeshyPalette.Error)
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.feed_delete_cancel)) } },
    )
}
