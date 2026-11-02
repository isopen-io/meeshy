package me.meeshy.ui.theme

import android.content.res.AssetManager
import android.graphics.Typeface

/**
 * Les polices d'apparat des cadres de gloire, chargées à la demande depuis `assets/fonts/glory`
 * (jamais au démarrage, jamais par `res/font`). Les axes variables (wght, opsz, SOFT, WONK) sont
 * appliqués par `Typeface.Builder` (API 26) ; un échec rend [fallback] (la police du thème).
 */
public class GloryFrameFonts(
    private val assets: AssetManager,
    private val fallback: Typeface = Typeface.DEFAULT,
) {
    private val loader = GloryFrameFontLoader(fallback) { path, variation -> build(path, variation) }

    public fun typeface(
        family: String,
        weight: Int,
        italic: Boolean = false,
        opticalSize: Float = 14f,
        text: String = "",
    ): Typeface = loader.resolve(family, weight, italic, opticalSize, text)

    private fun build(path: String, variation: String?): Typeface? {
        val builder = Typeface.Builder(assets, path)
        if (variation != null) builder.setFontVariationSettings(variation)
        return builder.build()
    }
}
