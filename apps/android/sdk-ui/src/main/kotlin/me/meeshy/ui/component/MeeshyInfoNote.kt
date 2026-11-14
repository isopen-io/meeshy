package me.meeshy.ui.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.dismiss
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.ui.icons.MeeshyIcons

/**
 * UNE NOTE DERRIÈRE UN (i) — l'atome de l'épure des interfaces (#17587, épure #17584), le même que
 * `InfoNoted` sur le web et `MeeshyInfoNote` dans MeeshyUI.
 *
 * Un libellé NOMME ; l'explication passe derrière un (i). Le nom accessible du bouton est la QUESTION
 * à laquelle la note répond (« Qui voit ma présence ? »), jamais « Plus d'infos ». Repliée, la note
 * reste LUE : le bouton la porte en description d'état. Un seul (i) ouvert par écran : l'hôte tient
 * l'identifiant de la note ouverte et [toggled] décide. Building block agnostique.
 */
public data class MeeshyInfoNote(val question: String, val text: String) {
    val id: String get() = question

    public companion object {
        /** Toucher la note ouverte la referme ; toucher une autre l'ouvre et referme la précédente. */
        public fun toggled(open: String?, tapped: String): String? = if (open == tapped) null else tapped

        /** Échap ou « fermer » du lecteur d'écran : seule la note ouverte se referme. */
        public fun closed(open: String?, closing: String): String? = if (open == closing) null else open
    }
}

/** Cible du (i) : celle de toute commande Android. */
public val MeeshyInfoNoteTarget = 48.dp

/** Le bouton (i) : cible 48 dp, nom = la question, état = la note. */
@Composable
public fun MeeshyInfoNoteButton(
    note: MeeshyInfoNote,
    expanded: Boolean,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    Box(
        modifier = modifier
            .size(MeeshyInfoNoteTarget)
            .clickable(role = Role.Button, onClick = onToggle)
            .semantics {
                contentDescription = note.question
                stateDescription = note.text
            },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (expanded) MeeshyIcons.InfoFilled else MeeshyIcons.Info,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
    }
}

/**
 * Un nom (titre de bloc, rangée de réglage) suivi de son (i), et la note dépliée DESSOUS. Sans note,
 * le nom seul. Échap referme la note ouverte.
 */
@Composable
public fun MeeshyInfoNoted(
    note: MeeshyInfoNote?,
    openNoteId: String?,
    onOpenNoteIdChange: (String?) -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = MaterialTheme.colorScheme.onSurfaceVariant,
    label: @Composable () -> Unit,
) {
    if (note == null) {
        Box(modifier) { label() }
        return
    }
    val expanded = openNoteId == note.id
    val close = { onOpenNoteIdChange(MeeshyInfoNote.closed(openNoteId, note.id)) }
    Column(
        modifier = modifier.onPreviewKeyEvent { event ->
            val isEscape = expanded && event.key == Key.Escape && event.type == KeyEventType.KeyUp
            if (isEscape) close()
            isEscape
        },
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f, fill = false)) { label() }
            MeeshyInfoNoteButton(
                note = note,
                expanded = expanded,
                onToggle = { onOpenNoteIdChange(MeeshyInfoNote.toggled(openNoteId, note.id)) },
                tint = tint,
            )
        }
        if (expanded) {
            Text(
                text = note.text,
                style = MaterialTheme.typography.bodySmall,
                color = tint,
                modifier = Modifier.semantics { dismiss { close(); true } },
            )
        }
    }
}
