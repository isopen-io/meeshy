package me.meeshy.app.settings

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Identifiant de la note (i) ouverte sur l'écran : une seule à la fois (#17584). */
@Composable
internal fun rememberOpenNote(): MutableState<String?> = rememberSaveable { mutableStateOf<String?>(null) }

/**
 * Une phrase d'orientation, VISIBLE au repos (règle 7 de l'épure) : ce que le bloc est et ce que son geste
 * déclenche, pour qui n'a jamais vu l'écran. Le détail secondaire passe derrière un (i), jamais celle-ci.
 */
@Composable
internal fun SettingsOrientation(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        color = MeeshyTheme.tokens.textSecondary,
        modifier = modifier.padding(horizontal = MeeshySpacing.sm),
    )
}

/** L'écran tient l'identifiant de la note ouverte ; chaque rangée le lit et le change par ce relais. */
internal data class NoteHost(val openId: String?, val onChange: (String?) -> Unit) {
    fun isOpen(note: MeeshyInfoNote): Boolean = openId == note.id
    fun toggle(note: MeeshyInfoNote) = onChange(MeeshyInfoNote.toggled(openId, note.id))
}

@Composable
internal fun rememberNoteHost(): NoteHost {
    var open by rememberOpenNote()
    return NoteHost(open) { open = it }
}
