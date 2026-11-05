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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.feed.R
import me.meeshy.sdk.model.card.PostCommentCardSubject
import me.meeshy.ui.haptics.rememberMeeshyHaptics
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
 * Le « … » d'un commentaire (iOS `CommentMoreMenu`) : UNE cible de 44 dp, UN menu dont la loi est
 * [me.meeshy.sdk.model.CommentMenuPolicy] — Copier, Imager, Modifier, Signaler, Supprimer, Retirer, dans l'ordre d'iOS —
 * et les mêmes entrées en actions personnalisées TalkBack. Sans entrée, aucun bouton.
 */
@Composable
internal fun CommentMoreMenu(comment: CommentPresentation, onDelete: (String) -> Unit, imaging: CommentImaging? = null) {
    var expanded by remember { mutableStateOf(false) }
    val haptics = rememberMeeshyHaptics()
    val entries = rememberCommentMenuEntries(comment, onDelete, imaging)
    if (entries.isEmpty()) return
    Box {
        IconButton(
            onClick = { haptics.light(); expanded = true },
            enabled = !comment.isPending,
            modifier = Modifier.size(44.dp),
        ) {
            Icon(
                imageVector = Icons.Filled.MoreHoriz,
                contentDescription = stringResource(R.string.post_comments_more_options),
                tint = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.size(18.dp),
            )
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            entries.forEach { entry ->
                DropdownMenuItem(
                    text = { Text(entry.label, color = if (entry.destructive) MeeshyPalette.Error else androidx.compose.ui.graphics.Color.Unspecified) },
                    onClick = {
                        expanded = false
                        entry.run()
                    },
                )
            }
        }
    }
}
