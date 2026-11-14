package me.meeshy.feature.kit

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.kit.MeeshyField
import me.meeshy.ui.component.kit.MeeshyFieldCounterPlacement
import me.meeshy.ui.component.kit.MeeshyFieldInput
import me.meeshy.ui.component.kit.MeeshyFieldLeading
import me.meeshy.ui.component.kit.MeeshyFieldTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.theme.MeeshySpacing

private const val STATE_SEARCH_EMPTY = "recherche-vide"
private const val STATE_SEARCH_TEXT = "recherche-texte"
private const val STATE_BUSY = "occupe"
private const val STATE_HASHTAG = "hashtag"
private const val STATE_PHRASE_COUNTER = "phrase-compteur"
private const val STATE_LIMIT = "plafond"
private const val STATE_PARAGRAPH = "paragraphe"
private const val STATE_TIME = "temps"
private const val STATE_THEME = "theme"
private const val STATE_DISABLED = "desactive"

/** Les textes de l'échantillon : des identifiants de développement, jamais des textes publiés (fiche K08 §8). */
private object SampleTexts {
    const val LABEL = "Champ d'exemple"
    const val SEARCH_PROMPT = "Rechercher"
    const val HASHTAG_PROMPT = "Mot-clé"
    const val PHRASE = "Une journée au bord de la mer"
    const val PARAGRAPH = "Un paragraphe de description qui tient sur quelques lignes."
    const val PARAGRAPH_CAPTION = "Description"
    const val START_CAPTION = "Début"
}

internal val entryK08: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K08",
    name = "MeeshyField",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_SEARCH_EMPTY, boardView = "A16", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_SEARCH_TEXT, boardView = "A18", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_BUSY, backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_HASHTAG, boardView = "A17", backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_PHRASE_COUNTER, boardView = "P5", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_LIMIT, backdrop = MeeshyKitCatalogBackdrop.Dark, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_PARAGRAPH, boardView = "O9", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_TIME, boardView = "O10", backdrop = MeeshyKitCatalogBackdrop.Media, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_THEME, boardView = "theme", backdrop = MeeshyKitCatalogBackdrop.Light, isTouchable = true),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Dark),
    ),
)

@Composable
@Suppress("UNUSED_PARAMETER")
internal fun ContentK08(state: MeeshyKitCatalogState, isPressed: Boolean) {
    var text by remember(state.id) { mutableStateOf(initialText(state.id)) }
    val enabled = state.id != STATE_DISABLED
    Column(modifier = Modifier.fillMaxWidth().padding(MeeshySpacing.md)) {
        MeeshyField(
            label = SampleTexts.LABEL,
            text = text,
            onChange = { text = it },
            input = inputFor(state.id),
            prompt = promptFor(state.id),
            caption = captionFor(state.id),
            leading = leadingFor(state.id),
            limit = limitFor(state.id),
            counter = if (state.id == STATE_PARAGRAPH) MeeshyFieldCounterPlacement.Hosted else MeeshyFieldCounterPlacement.Inline,
            isBusy = state.id == STATE_BUSY,
            enabled = enabled,
            tone = if (state.id == STATE_THEME) MeeshyFieldTone.Theme else null,
        )
    }
}

private fun inputFor(id: String): MeeshyFieldInput = when (id) {
    STATE_SEARCH_EMPTY, STATE_SEARCH_TEXT, STATE_BUSY -> MeeshyFieldInput.Search
    STATE_HASHTAG -> MeeshyFieldInput.Token
    STATE_PARAGRAPH -> MeeshyFieldInput.Paragraph
    STATE_TIME -> MeeshyFieldInput.Numeric
    else -> MeeshyFieldInput.Sentence
}

private fun initialText(id: String): String = when (id) {
    STATE_SEARCH_TEXT, STATE_BUSY, STATE_THEME, STATE_DISABLED -> SampleTexts.SEARCH_PROMPT
    STATE_HASHTAG -> "voyage"
    STATE_PHRASE_COUNTER -> SampleTexts.PHRASE
    STATE_PARAGRAPH -> SampleTexts.PARAGRAPH
    STATE_TIME -> "0:02"
    STATE_LIMIT -> "x".repeat(60)
    else -> ""
}

private fun promptFor(id: String): String? = when (id) {
    STATE_SEARCH_EMPTY -> SampleTexts.SEARCH_PROMPT
    STATE_HASHTAG -> SampleTexts.HASHTAG_PROMPT
    else -> null
}

private fun captionFor(id: String): String? = when (id) {
    STATE_PARAGRAPH -> SampleTexts.PARAGRAPH_CAPTION
    STATE_TIME -> SampleTexts.START_CAPTION
    else -> null
}

private fun leadingFor(id: String): MeeshyFieldLeading? = when (id) {
    STATE_HASHTAG -> MeeshyFieldLeading.Glyph("#")
    else -> null
}

private fun limitFor(id: String): Int? = when (id) {
    STATE_PHRASE_COUNTER -> 60
    STATE_PARAGRAPH -> 1000
    STATE_LIMIT -> 60
    else -> null
}
