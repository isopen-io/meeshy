package me.meeshy.feature.kit

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import me.meeshy.ui.component.kit.MeeshyField
import me.meeshy.ui.component.kit.MeeshyFieldCounterPlacement
import me.meeshy.ui.component.kit.MeeshyFieldInput
import me.meeshy.ui.component.kit.MeeshyFieldLeading
import me.meeshy.ui.component.kit.MeeshyGlassTone
import me.meeshy.ui.component.kit.MeeshyKitCatalogBackdrop
import me.meeshy.ui.component.kit.MeeshyKitCatalogEntry
import me.meeshy.ui.component.kit.MeeshyKitCatalogState
import me.meeshy.ui.icons.MeeshyIcons
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

/** La largeur d'une feuille de la planche, celle de l'échantillon iOS. */
private val SAMPLE_WIDTH = 342.dp

private const val MOOD_LIMIT = 60
private const val DESCRIPTION_LIMIT = 1000

/** Les textes de l'échantillon, ceux de la planche et d'iOS : des identifiants de développement (fiche K00 §1). */
private object FieldSampleTexts {
    const val SEARCH = "Rechercher"
    const val SEARCH_PERSON = "Rechercher une personne"
    const val SEARCH_PLACE = "Rechercher un lieu"
    const val PLACE = "Plage de Ngor"
    const val HASHTAG = "Hashtag"
    const val HASHTAG_GLYPH = "#"
    const val HASHTAG_TEXT = "coucher"
    const val MOOD = "Humeur"
    const val MOOD_PROMPT = "Une phrase courte"
    const val MOOD_TEXT = "Enfin en vacances"
    const val MOOD_LIMIT_TEXT = "Enfin en vacances au bord de la mer, le soleil se couche"
    const val DESCRIPTION = "Description"
    const val DESCRIPTION_CAPTION = "Décrire l’image pour les personnes qui ne la voient pas"
    const val DESCRIPTION_TEXT = "Coucher de soleil sur la plage de Ngor, un palmier à gauche, la mer calme."
    const val START = "Début"
    const val END = "Fin"
    const val START_TEXT = "0:02"
    const val END_TEXT = "0:08"
}

/** Les états de K08, ceux d'iOS (`MeeshyKitCatalog+K08.swift`) : mêmes identifiants, mêmes vues, mêmes fonds. */
internal val entryK08: MeeshyKitCatalogEntry = MeeshyKitCatalogEntry(
    key = "K08",
    name = "MeeshyField",
    states = listOf(
        MeeshyKitCatalogState(id = STATE_SEARCH_EMPTY, boardView = "A16", backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_SEARCH_TEXT, boardView = "A18", backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_BUSY, backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_HASHTAG, boardView = "A17", backdrop = MeeshyKitCatalogBackdrop.Dark),
        MeeshyKitCatalogState(id = STATE_PHRASE_COUNTER, boardView = "P5", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_LIMIT, backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_PARAGRAPH, boardView = "O9", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_TIME, boardView = "O10", backdrop = MeeshyKitCatalogBackdrop.Media),
        MeeshyKitCatalogState(id = STATE_THEME, backdrop = MeeshyKitCatalogBackdrop.Light),
        MeeshyKitCatalogState(id = STATE_DISABLED, backdrop = MeeshyKitCatalogBackdrop.Dark),
    ),
)

/** Un champ réel par état, dans la forme que la vue lui donne ; aucune couleur : tout vient du composant. */
@Composable
@Suppress("UNUSED_PARAMETER")
internal fun ContentK08(state: MeeshyKitCatalogState, isPressed: Boolean) {
    val modifier = Modifier.width(SAMPLE_WIDTH)
    when (state.id) {
        STATE_SEARCH_EMPTY -> SearchSample(FieldSampleTexts.SEARCH_PERSON, "", modifier)
        STATE_SEARCH_TEXT -> SearchSample(FieldSampleTexts.SEARCH_PLACE, FieldSampleTexts.PLACE, modifier)
        STATE_BUSY -> SearchSample(FieldSampleTexts.SEARCH_PLACE, FieldSampleTexts.PLACE, modifier, isBusy = true)
        STATE_HASHTAG -> HashtagSample(modifier)
        STATE_PHRASE_COUNTER -> MoodSample(FieldSampleTexts.MOOD_TEXT, modifier)
        STATE_LIMIT -> MoodSample(FieldSampleTexts.MOOD_LIMIT_TEXT, modifier)
        STATE_PARAGRAPH -> DescriptionSample(modifier)
        STATE_TIME -> TimeSample(modifier)
        STATE_THEME -> SearchSample(FieldSampleTexts.SEARCH, "", modifier, tone = MeeshyGlassTone.Theme)
        else -> SearchSample(FieldSampleTexts.SEARCH_PERSON, "", modifier, enabled = false)
    }
}

@Composable
private fun SearchSample(
    prompt: String,
    initial: String,
    modifier: Modifier,
    isBusy: Boolean = false,
    enabled: Boolean = true,
    tone: MeeshyGlassTone? = null,
) {
    var text by remember { mutableStateOf(initial) }
    MeeshyField(
        label = FieldSampleTexts.SEARCH,
        text = text,
        onChange = { text = it },
        modifier = modifier,
        input = MeeshyFieldInput.Search,
        prompt = prompt,
        leading = MeeshyFieldLeading.Icon(MeeshyIcons.Search),
        isBusy = isBusy,
        enabled = enabled,
        tone = tone,
    )
}

@Composable
private fun HashtagSample(modifier: Modifier) {
    var text by remember { mutableStateOf(FieldSampleTexts.HASHTAG_TEXT) }
    MeeshyField(
        label = FieldSampleTexts.HASHTAG,
        text = text,
        onChange = { text = it },
        modifier = modifier,
        input = MeeshyFieldInput.Token,
        leading = MeeshyFieldLeading.Glyph(FieldSampleTexts.HASHTAG_GLYPH),
    )
}

@Composable
private fun MoodSample(initial: String, modifier: Modifier) {
    var text by remember { mutableStateOf(initial) }
    MeeshyField(
        label = FieldSampleTexts.MOOD,
        text = text,
        onChange = { text = it },
        modifier = modifier,
        prompt = FieldSampleTexts.MOOD_PROMPT,
        limit = MOOD_LIMIT,
    )
}

@Composable
private fun DescriptionSample(modifier: Modifier) {
    var text by remember { mutableStateOf(FieldSampleTexts.DESCRIPTION_TEXT) }
    MeeshyField(
        label = FieldSampleTexts.DESCRIPTION,
        text = text,
        onChange = { text = it },
        modifier = modifier,
        input = MeeshyFieldInput.Paragraph,
        caption = FieldSampleTexts.DESCRIPTION_CAPTION,
        limit = DESCRIPTION_LIMIT,
        counter = MeeshyFieldCounterPlacement.Hosted,
    )
}

@Composable
private fun TimeSample(modifier: Modifier) {
    var start by remember { mutableStateOf(FieldSampleTexts.START_TEXT) }
    var end by remember { mutableStateOf(FieldSampleTexts.END_TEXT) }
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.smPlus)) {
        MeeshyField(
            label = FieldSampleTexts.START,
            text = start,
            onChange = { start = it },
            modifier = Modifier.weight(1f),
            input = MeeshyFieldInput.Numeric,
            caption = FieldSampleTexts.START,
            onStep = {},
        )
        MeeshyField(
            label = FieldSampleTexts.END,
            text = end,
            onChange = { end = it },
            modifier = Modifier.weight(1f),
            input = MeeshyFieldInput.Numeric,
            caption = FieldSampleTexts.END,
            onStep = {},
        )
    }
}
