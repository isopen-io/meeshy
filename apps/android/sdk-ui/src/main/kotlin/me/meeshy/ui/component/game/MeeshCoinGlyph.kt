package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshyPalette

/** Le tracé de la pièce d'argent des Meeshes : `coin-fill` de Phosphor, repère 256 — celui du web et d'iOS (`MeeshCoin.svg`). */
internal const val MEESH_COIN_GLYPH_PATH: String =
    "M207.58,63.84C186.85,53.48,159.33,48,128,48S69.15,53.48,48.42,63.84,16,88.78,16,104v48c0,15.22,11.82,29.85,32.42,40.16S96.67,208,128,208s58.85-5.48,79.58-15.84S240,167.22,240,152V104C240,88.78,228.18,74.15,207.58,63.84Zm-87.58,96v32c-19-.62-35-3.42-48-7.49V153.05A203.43,203.43,0,0,0,120,159.86Zm16,0a203.43,203.43,0,0,0,48-6.81v31.31c-13,4.07-29,6.87-48,7.49ZM32,152V133.53a82.88,82.88,0,0,0,16.42,10.63c2.43,1.21,5,2.35,7.58,3.43V178C40.17,170.16,32,160.29,32,152Zm168,26V147.59c2.61-1.08,5.15-2.22,7.58-3.43A82.88,82.88,0,0,0,224,133.53V152C224,160.29,215.83,170.16,200,178Z"

internal const val MEESH_COIN_GLYPH_FRAME: Float = 256f

/** La teinte du glyphe de pièce : l'argent des Meeshes, que l'ambre de la capsule ne remplace pas. */
public val MeeshCoinGlyphTint: Color get() = MeeshyPalette.MeeshSilver

/**
 * LA PIÈCE D'ARGENT du compteur de Meeshes (iOS `MeeshCoinGlyph`, #6427) : un vecteur en gabarit teinté
 * [tint] (`meeshSilver` par défaut). Décoratif : le solde est dit par le libellé de l'entrée qui la porte.
 */
@Composable
public fun MeeshCoinGlyph(
    modifier: Modifier = Modifier,
    size: Dp = 20.dp,
    tint: Color = MeeshCoinGlyphTint,
) {
    val path: Path = remember { GameSvgPath.make(MEESH_COIN_GLYPH_PATH) }
    Canvas(modifier.size(size)) {
        val factor = this.size.minDimension / MEESH_COIN_GLYPH_FRAME
        scale(factor, factor, pivot = androidx.compose.ui.geometry.Offset.Zero) { drawPath(path, tint) }
    }
}
