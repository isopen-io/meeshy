package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import me.meeshy.sdk.model.game.LeagueKey

/** La couleur de la gemme : les huit teintes de la planche, du gris de Quartz à l'irisé (violet) du Prisme. */
public val LeagueKey.gemColor: Color
    get() = when (this) {
        LeagueKey.Quartz -> gameHex(0xe5e7eb)
        LeagueKey.Ambre -> gameHex(0xf59e0b)
        LeagueKey.Jade -> gameHex(0x10b981)
        LeagueKey.Saphir -> gameHex(0x3b82f6)
        LeagueKey.Rubis -> gameHex(0xe11d48)
        LeagueKey.Amethyste -> gameHex(0x8b5cf6)
        LeagueKey.Diamant -> gameHex(0xbae6fd)
        LeagueKey.Prisme -> gameHex(0xa855f7)
    }

private const val GEM_CUT_D = "M36 6 l26 20 -26 42 -26 -42 z"
private const val GEM_TABLE_D = "M10 26 h52"

/**
 * La gemme de ligue (miroir de `LeagueGemView`, iOS) : une gemme taillée à la teinte de la ligue, la Signature
 * gravée en creux ; la gemme Prisme irise (dégradé de la matière Prisme). [accessibilityLabel] nul : décorative.
 */
@Composable
public fun LeagueGemView(
    league: LeagueKey,
    modifier: Modifier = Modifier,
    accessibilityLabel: String? = null,
) {
    Canvas(modifier.aspectRatio(1f).gameAccessibility(accessibilityLabel)) {
        val k = size.width / 72f
        val cut = cachedGamePath(GEM_CUT_D)
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            if (league == LeagueKey.Prisme) {
                drawPath(cut, GamePalette.diagonal(GamePalette.prismStops, cut.getBounds()))
            } else {
                drawPath(cut, league.gemColor)
            }
            drawPath(cut, GamePalette.ink.copy(alpha = 0.3f), style = Stroke(width = 1f))
            drawPath(
                cachedGamePath(GEM_TABLE_D), Color.White.copy(alpha = 0.6f),
                style = Stroke(width = 1.4f, cap = StrokeCap.Butt),
            )
            drawGameSignature(Offset(36f, 38f), 26f, GamePalette.ink, SignatureStyle.Engraved, 110f)
        }
    }
}
