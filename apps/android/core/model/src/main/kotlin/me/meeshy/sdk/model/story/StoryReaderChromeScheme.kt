package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.sdk.model.theme.ChromeScheme

/**
 * Le schéma épinglé sur le chrome du lecteur (en-tête, rail) : il suit la luminance du FOND de la slide
 * affichée, pas le thème de l'app — même règle que le compositeur (`CanvasChromeScheme`).
 */
object StoryReaderChromeScheme {
    fun resolve(background: String?, hasMediaBackground: Boolean, mediaLuminance: Double? = null): ChromeScheme =
        CanvasChromeScheme.scheme(background, hasMediaBackground, mediaLuminance)
}
