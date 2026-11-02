package me.meeshy.ui.component.game

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.game.MeeshCoinFace
import me.meeshy.sdk.model.game.MeeshCoinGeometry
import me.meeshy.sdk.model.game.MeeshCoinLayout
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Vrai quand les éclats de la pièce scintillent : le repère des témoins, aucun sens pour le lecteur d'écran. */
public val MeeshCoinTwinkling: SemanticsPropertyKey<Boolean> = SemanticsPropertyKey("MeeshCoinTwinkling")
private var SemanticsPropertyReceiver.twinkling by MeeshCoinTwinkling

/** L'édition dessinée, lue par les témoins. */
public val MeeshCoinEditionKey: SemanticsPropertyKey<MeeshEdition> = SemanticsPropertyKey("MeeshCoinEdition")
private var SemanticsPropertyReceiver.coinEdition by MeeshCoinEditionKey

/**
 * LA MEESH, avers et revers (#9380, épopée § 6, #11176, Android #13892) — LA MÊME pièce que le web (`meesh-coin.tsx`)
 * et iOS (`MeeshCoinView`), rejouée depuis la géométrie partagée `packages/shared/design/meesh-coin.json`
 * ([MeeshCoinGeometry]) :
 *  · AVERS, pour toutes les éditions : la Signature frappée, la couronne UNIVERSELLE « MEESHY · 1 MEESH » (jamais
 *    traduite), la tranche cannelée ;
 *  · REVERS : Mee (argent), Meo (or), Mee et Meo face à face (prisme), GRAVÉS et colorés, l'année et « Nº » ;
 *  · FLAN : la pièce avant la frappe, sans couronne ni Signature.
 * Trois éditions : argent veiné d'or, SOBRE ; or PUR, RAFFINÉ ; or mêlé de diamant à la tranche irisée, ROYAL.
 *
 * La brique DESSINE, et fait scintiller les éclats du prisme — immobiles sous « réduire les animations » ou quand la
 * pièce a quitté l'écran ([gameOnScreen]). Seul le calque des éclats se redessine à chaque image. [contentDescription]
 * nul : décorative ; l'hôte dit « Meesh n° 13 ».
 */
@Composable
public fun MeeshCoin(
    modifier: Modifier = Modifier,
    face: MeeshCoinFace = MeeshCoinFace.Obverse,
    edition: MeeshEdition = MeeshEdition.Silver,
    contentDescription: String? = null,
) {
    val geometry = MeeshCoinGeometry.shared
    val painter = remember(face, edition) { MeeshCoinPainter(geometry, geometry.edition(edition), face) }
    val measurer = rememberTextMeasurer()
    val reduceMotion = LocalReduceMotion.current
    var onScreen by remember { mutableStateOf(true) }
    val twinkles = MeeshCoinLayout.twinkles(painter.decor, reduceMotion = reduceMotion, onScreen = onScreen)
    Box(
        modifier
            .aspectRatio(1f)
            .gameOnScreen { onScreen = it }
            .semantics {
                twinkling = twinkles
                coinEdition = edition
            },
    ) {
        Box(Modifier.fillMaxSize().gameAccessibility(contentDescription)) {
            Canvas(Modifier.fillMaxSize()) { with(painter) { drawCoin(measurer, twinkling = twinkles) } }
            if (twinkles) TwinkleLayer(painter)
        }
    }
}

@Composable
private fun TwinkleLayer(painter: MeeshCoinPainter) {
    val period = MeeshCoinLayout.TWINKLE_PERIOD.toFloat()
    val time by rememberInfiniteTransition(label = "meesh-twinkle").animateFloat(
        initialValue = 0f,
        targetValue = period,
        animationSpec = infiniteRepeatable(tween((period * MILLIS).toInt(), easing = LinearEasing), RepeatMode.Restart),
        label = "meesh-twinkle-time",
    )
    Canvas(Modifier.fillMaxSize()) { with(painter) { drawTwinkle(time.toDouble()) } }
}

private const val MILLIS = 1000
