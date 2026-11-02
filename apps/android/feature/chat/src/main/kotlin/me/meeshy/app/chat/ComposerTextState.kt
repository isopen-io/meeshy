package me.meeshy.app.chat

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.SentimentAnalyzer
import me.meeshy.sdk.model.SentimentLevel

/**
 * Le texte du composeur, SORTI de [ChatUiState] : une frappe n'en change pas l'égalité, donc la
 * liste de messages ne se recompose pas à chaque caractère (miroir d'iOS
 * `ConversationComposerTextModel`, lu par son seul hôte). [revision] ne bouge que lorsque le
 * texte est remplacé de l'extérieur (envoi, édition, brouillon restauré, mention) : le champ
 * se resynchronise alors, sans jamais écraser ce que l'utilisateur est en train de taper.
 */
@Immutable
data class ComposerTextState(
    val text: String = "",
    val revision: Int = 0,
) {
    val hasText: Boolean get() = text.isNotBlank()

    /** Le glyphe de sentiment du texte courant ; absent pour un champ vide. */
    val sentiment: SentimentLevel?
        get() = text.takeIf { it.isNotBlank() }?.let { SentimentLevel.from(SentimentAnalyzer.score(it)) }
}

/** Le détenteur du [ComposerTextState] d'une conversation : un flux à lui, hors de l'état d'écran. */
internal class ComposerTextHolder(initial: String = "") {

    private val source = MutableStateFlow(ComposerTextState(text = initial))

    val flow: StateFlow<ComposerTextState> = source.asStateFlow()

    val state: ComposerTextState get() = source.value

    val text: String get() = source.value.text

    /** La frappe de l'utilisateur : le texte change, la révision non. */
    fun typed(value: String) {
        source.update { it.copy(text = value) }
    }

    /** Un remplacement venu de l'extérieur : le champ doit se resynchroniser. */
    fun replace(value: String) {
        source.update { it.copy(text = value, revision = it.revision + 1) }
    }

    fun clear() = replace("")
}
