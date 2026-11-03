package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import coil.request.ImageRequest
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import me.meeshy.ui.component.retouch.storyMediaLook

/**
 * **LES LOOKS D'UNE SCÈNE PAS ENCORE PUBLIÉE** (#13841, miroir du `StoryMediaLookPainterRegistry` d'iOS) : le filtre,
 * l'effet et le cadre posés sur chacun de ses médias, par l'adresse que le lecteur charge, et l'auteur que les cadres
 * écrivent. Seuls l'aperçu et l'export du compositeur en portent : une story publiée n'en a aucun, ses octets sont
 * déjà cuits.
 */
@Immutable
data class StorySceneMediaLooks(val byUrl: Map<String, StoryMediaLook>, val author: ComposerLookAuthor) {
    fun of(url: String?): StoryMediaLook? = url?.let(byUrl::get)

    companion object {
        /** `null` quand aucun média ne porte de look qui peigne : la scène se joue telle quelle. */
        fun of(byUrl: Map<String, StoryMediaLook>, author: ComposerLookAuthor): StorySceneMediaLooks? =
            byUrl.filterValues(StoryMediaLookMapping::paints).takeIf { it.isNotEmpty() }?.let { StorySceneMediaLooks(it, author) }
    }
}

/** Ce que le lecteur charge pour l'image [url] : l'adresse telle quelle, ou la requête qui y peint son look. */
@Composable
internal fun rememberSceneMediaModel(url: String, looks: StorySceneMediaLooks?): Any {
    val context = LocalContext.current
    val look = looks?.of(url)
    return remember(url, look, looks?.author) {
        if (look == null || looks == null) url else ImageRequest.Builder(context).data(url).storyMediaLook(look, looks.author).build()
    }
}
