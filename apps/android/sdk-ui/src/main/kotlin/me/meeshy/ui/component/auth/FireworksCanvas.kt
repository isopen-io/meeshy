package me.meeshy.ui.component.auth

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableDoubleStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import me.meeshy.sdk.model.auth.ArrivalFireworks
import me.meeshy.ui.theme.MeeshyPalette

private val FireworksPalette: List<Color> = listOf(
    MeeshyPalette.Indigo400,
    MeeshyPalette.Purple500,
    MeeshyPalette.Success,
    MeeshyPalette.Warning,
    MeeshyPalette.Info,
)

/**
 * Le feu d'artifice DESSINÉ (miroir d'`ArrivalFireworksCanvas`, iOS), partagé par la célébration de l'arrivée
 * et la carte « Compte validé ! ». Sans état métier : la loi du temps est [ArrivalFireworks], le dessin la
 * rejoue à chaque image ([withFrameNanos]) et l'horloge S'ARRÊTE à la dernière gerbe. [clip] borne le dessin à
 * une forme (la carte), [maxSparks] plafonne les particules vivantes. Décoratif : caché à TalkBack.
 */
@Composable
public fun FireworksCanvas(
    modifier: Modifier = Modifier,
    clip: Shape = RectangleShape,
    maxSparks: Int = ArrivalFireworks.BURST_COUNT * ArrivalFireworks.SPARKS_PER_BURST,
) {
    var elapsedSeconds by remember { mutableDoubleStateOf(0.0) }
    LaunchedEffect(Unit) {
        val start = withFrameNanos { it }
        while (!ArrivalFireworks.isOver(elapsedSeconds)) {
            val now = withFrameNanos { it }
            elapsedSeconds = (now - start) / NANOS_PER_SECOND
        }
    }
    val density = LocalDensity.current
    Canvas(modifier = modifier.fillMaxSize().clip(clip).clearAndSetSemantics {}) {
        ArrivalFireworks.sparks(elapsedSeconds, maxSparks = maxSparks).forEach { spark ->
            drawCircle(
                color = FireworksPalette[spark.colorIndex % FireworksPalette.size].copy(alpha = spark.opacity.toFloat()),
                radius = with(density) { spark.radius.toFloat().dp.toPx() },
                center = Offset((spark.x * size.width).toFloat(), (spark.y * size.height).toFloat()),
            )
        }
    }
}

private const val NANOS_PER_SECOND: Double = 1_000_000_000.0
