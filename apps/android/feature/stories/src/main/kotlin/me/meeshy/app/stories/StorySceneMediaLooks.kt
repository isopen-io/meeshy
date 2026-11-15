package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import coil.request.ImageRequest
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping
import me.meeshy.ui.component.media.ComposerLiveEffects
import me.meeshy.ui.component.retouch.ComposerLookAuthor
import me.meeshy.ui.component.retouch.rememberStoryVideoLookEffects
import me.meeshy.ui.component.retouch.storyMediaLook

/**
 * **LES LOOKS D'UNE SCÈNE PAS ENCORE PUBLIÉE** (#13841, miroir du `StoryMediaLookPainterRegistry` d'iOS) : le filtre,
 * l'effet et le cadre posés sur chacun de ses médias, par l'adresse que le lecteur charge, et l'auteur que les cadres
 * écrivent, avec la taille des vidéos ([videoSizes]) que leurs cadres épousent. Seuls l'aperçu et l'export du compositeur en portent : une story publiée n'en a aucun, ses octets sont
 * déjà cuits.
 */
@Immutable
data class StorySceneMediaLooks(
    val byUrl: Map<String, StoryMediaLook>,
    val author: ComposerLookAuthor,
    val videoSizes: Map<String, Pair<Int, Int>> = emptyMap(),
) {
    fun of(url: String?): StoryMediaLook? = url?.let(byUrl::get)

    /** Ce que la vidéo [url] peint de son look : sans l'effet de visage, qu'une vidéo ne peint pas ([paintedOn]). */
    fun videoLookOf(url: String?): StoryMediaLook? = of(url)?.paintedOn(video = true)

    /** La taille debout de la vidéo [url], telle que le serveur la sert ; le cadre s'y peint. */
    fun sizeOf(url: String?): Pair<Int, Int>? = url?.let(videoSizes::get)

    companion object {
        /** `null` quand aucun média ne porte de look qui peigne : la scène se joue telle quelle. */
        fun of(
            byUrl: Map<String, StoryMediaLook>,
            author: ComposerLookAuthor,
            videoSizes: Map<String, Pair<Int, Int>> = emptyMap(),
        ): StorySceneMediaLooks? =
            byUrl.filterValues(StoryMediaLookMapping::paints).takeIf { it.isNotEmpty() }?.let { StorySceneMediaLooks(it, author, videoSizes) }
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

/**
 * Les effets que le lecteur pose sur la vidéo [url] réglée (#14848) : les MÊMES que la scène du compositeur
 * ([rememberStoryVideoLookEffects]) ; `null` hors aperçu ou sans look qui peigne une vidéo. [poster] : son affiche, d'où
 * certains cadres tirent leur fond.
 */
@Composable
internal fun rememberSceneVideoEffects(url: String, poster: String?, looks: StorySceneMediaLooks?): ComposerLiveEffects? {
    if (looks == null) return null
    return rememberStoryVideoLookEffects(looks.videoLookOf(url), url, looks.sizeOf(url), poster, looks.author)
}
