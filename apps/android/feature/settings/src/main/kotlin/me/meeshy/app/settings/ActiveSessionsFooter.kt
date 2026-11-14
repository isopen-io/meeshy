package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.session.GeolocationAttribution
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoteButton
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La licence CC-BY 4.0 de DB-IP Lite : l'attribution accompagne chaque lieu tiré d'une adresse et reste
 * visible. Que la ville soit approximative se lit derrière le (i) « D'où vient le lieu d'une session ? ».
 */
@Composable
internal fun ActiveSessionsFooter(
    attribution: GeolocationAttribution,
    note: MeeshyInfoNote,
    noteHost: NoteHost,
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current
    val link = attribution.url?.takeIf { it.isNotBlank() }
    Column(modifier = modifier.padding(horizontal = MeeshySpacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = attribution.text,
                style = MaterialTheme.typography.bodySmall,
                color = if (link != null) MeeshyPalette.Indigo500 else MeeshyTheme.tokens.textMuted,
                textDecoration = if (link != null) TextDecoration.Underline else null,
                modifier = Modifier
                    .weight(1f)
                    .then(
                        if (link == null) {
                            Modifier
                        } else {
                            Modifier
                                .heightIn(min = 48.dp)
                                .clickable(role = Role.Button) { runCatching { uriHandler.openUri(link) } }
                                .padding(vertical = MeeshySpacing.sm)
                        },
                    ),
            )
            MeeshyInfoNoteButton(note = note, expanded = noteHost.isOpen(note), onToggle = { noteHost.toggle(note) })
        }
        if (noteHost.isOpen(note)) {
            Text(
                text = note.text,
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
            )
        }
    }
}
