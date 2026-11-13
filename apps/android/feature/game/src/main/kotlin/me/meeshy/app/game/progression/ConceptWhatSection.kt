package me.meeshy.app.game.progression

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.ui.component.MeeshyInfoNote
import me.meeshy.ui.component.MeeshyInfoNoted
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * « C'EST QUOI ? » d'une fiche de concept, épuré (#17688) : le titre, UNE phrase — ce que c'est — et, à côté du titre,
 * un (i) dont le nom accessible est la question « Comment m'en servir ? » ; la note dépliée dit l'usage, et le lecteur
 * d'écran la lit même repliée. Le sens du concept reste visible au repos ; seul l'usage secondaire se range derrière
 * le (i), jamais l'unique explication de la fonction.
 */
@Composable
internal fun ConceptWhatSection(title: String, what: String, useQuestion: String, use: String) {
    val note = MeeshyInfoNote(question = useQuestion, text = use)
    var openNote by rememberSaveable { mutableStateOf<String?>(null) }
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        MeeshyInfoNoted(
            note = note,
            openNoteId = openNote,
            onOpenNoteIdChange = { openNote = it },
            tint = MeeshyTheme.tokens.textMuted,
        ) {
            Text(
                title.uppercase(),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
        Text(
            what,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
        )
    }
}
