package me.meeshy.app.game.pages

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoted
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Une phrase d'orientation VISIBLE au repos, suivie de son (i) (#18122, règle 7) : le nom accessible du (i) est la
 * [question] à laquelle le [detail] répond ; le détail secondaire se déplie sous la phrase et reste lu par le lecteur
 * d'écran même replié. La phrase dit ce que fait le bloc ; le (i) ne porte jamais l'unique explication.
 */
@Composable
internal fun GameNoteWithInfo(text: String, question: String, detail: String) {
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    MeeshyInfoNoted(
        note = MeeshyInfoNote(question = question, text = detail),
        openNoteId = open,
        onOpenNoteIdChange = { open = it },
        tint = MeeshyTheme.tokens.textMuted,
    ) { GameNote(text) }
}
