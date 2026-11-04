package me.meeshy.app.game.photo

import android.content.Context
import android.content.res.AssetManager
import android.graphics.Typeface
import androidx.compose.ui.text.font.FontFamily
import me.meeshy.ui.theme.GloryFrameFontLoader

/**
 * LES POLICES D'APPARAT DES CADRES (iOS `GloryFrameFonts`) — cinq familles SIL OFL, chargées À LA DEMANDE : aucun asset
 * n'est ouvert avant le premier cadre qui emploie une famille. Un texte d'une autre écriture que le latin (ou un emoji)
 * et une famille qui ne se charge pas prennent la pile système, jamais une police choisie par le hasard du système.
 * Le choix suit les PLAGES UNICODE du texte, jamais la langue de l'interface.
 */
class GloryFrameFonts(assets: AssetManager) {

    constructor(context: Context) : this(context.applicationContext.assets)

    private val loader = GloryFrameFontLoader<Typeface>(fallback = Typeface.DEFAULT) { path, variation ->
        Typeface.Builder(assets, path).apply { variation?.let(::setFontVariationSettings) }.build()
    }

    /** Les familles réellement ouvertes depuis le démarrage. */
    val loadedCount: Int get() = loader.loadedCount

    fun typeface(family: String, weight: Int, italic: Boolean = false, opticalSize: Float = 14f, text: String): Typeface =
        loader.resolve(family, weight, italic, opticalSize, text)

    fun fontFamily(family: String, weight: Int, italic: Boolean = false, opticalSize: Float = 14f, text: String): FontFamily =
        FontFamily(typeface(family, weight, italic, opticalSize, text))
}
