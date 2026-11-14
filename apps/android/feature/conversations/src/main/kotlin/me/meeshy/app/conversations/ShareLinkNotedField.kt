package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoteButton
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Un champ de formulaire de lien dont le libellé NOMME seul (épure #17697, règle 1) : la précision passe
 * derrière un (i) en fin de champ, nommé par la QUESTION, et la note se déplie sous le champ.
 */
@Composable
internal fun ShareLinkNotedField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    note: MeeshyInfoNote,
    openNoteId: String?,
    onOpenNoteIdChange: (String?) -> Unit,
    singleLine: Boolean,
    modifier: Modifier = Modifier,
) {
    val expanded = openNoteId == note.id
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            label = { Text(label) },
            singleLine = singleLine,
            minLines = if (singleLine) 1 else 2,
            maxLines = if (singleLine) 1 else 6,
            trailingIcon = {
                MeeshyInfoNoteButton(
                    note = note,
                    expanded = expanded,
                    onToggle = { onOpenNoteIdChange(MeeshyInfoNote.toggled(openNoteId, note.id)) },
                    tint = MeeshyTheme.tokens.textSecondary,
                )
            },
            modifier = Modifier.fillMaxWidth(),
        )
        if (expanded) {
            Text(
                text = note.text,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.semantics { dismiss { onOpenNoteIdChange(MeeshyInfoNote.closed(openNoteId, note.id)); true } },
            )
        }
    }
}
