package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreHoriz
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « Imager » un commentaire (#13922, iOS `CommentMenuPolicy`) : [cardOf] compose sa carte — `null` : rien ne s'image, et
 * l'entrée n'existe pas — et [open] monte l'atelier dessus.
 */
internal class CommentImaging(
    val cardOf: (commentId: String) -> PostCommentCardSubject?,
    val open: (commentId: String, card: PostCommentCardSubject) -> Unit,
)

/**
 * The « … » of a comment (iOS `CommentMoreMenu`): a 44 dp target that opens Copy text for
 * every comment, Imager when the comment composes a card, and Delete for one's own — in iOS's
 * order. Replaces the 16 dp trash icon that deleted on the first touch.
 */
@Composable
internal fun CommentMoreMenu(comment: CommentPresentation, onDelete: (String) -> Unit, imaging: CommentImaging? = null) {
    var expanded by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    Box {
        IconButton(onClick = { expanded = true }, enabled = !comment.isPending, modifier = Modifier.size(44.dp)) {
            Icon(
                imageVector = Icons.Filled.MoreHoriz,
                contentDescription = stringResource(R.string.post_comments_more_options),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.post_comments_copy_text)) },
                onClick = {
                    expanded = false
                    clipboard.setText(AnnotatedString(comment.content))
                },
            )
            val card = imaging?.cardOf?.invoke(comment.id)
            if (imaging != null && card != null) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.feed_comment_imagine)) },
                    onClick = {
                        expanded = false
                        imaging.open(comment.id, card)
                    },
                )
            }
            if (comment.isOwn) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.post_comments_delete_action), color = MeeshyPalette.Error) },
                    onClick = {
                        expanded = false
                        onDelete(comment.id)
                    },
                )
            }
        }
    }
}
