package me.meeshy.app.stories

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import me.meeshy.feature.stories.R

private val FRAME_OFFSET = 3.dp
private val FRAME_STROKE = 2.dp
private val FRAME_CORNER = 8.dp

/**
 * Le cadre de l'élément sélectionné (#13836) : un trait blanc plein décalé de 3 dp, aux bornes du calque — le pointillé
 * reste aux guides de composition, il ne désigne jamais une sélection (#14042). Il se dessine dans le calque lui-même,
 * SOUS son `graphicsLayer` : il suit le pincer et la rotation sans recomposer, et son trait garde son épaisseur quelle que
 * soit l'échelle de l'objet ([scale]). TalkBack annonce la sélection. Rien n'est dessiné pendant une capture d'export :
 * l'appelant passe [selected] à faux.
 */
@Composable
internal fun Modifier.sceneSelectionFrame(selected: Boolean, scale: Float): Modifier {
    if (!selected) return this
    val label = stringResource(R.string.composer_selection_selected)
    val safeScale = scale.takeIf { it > 0f } ?: 1f
    return semantics {
        this.selected = true
        stateDescription = label
    }.drawWithContent {
        drawContent()
        val offset = FRAME_OFFSET.toPx() / safeScale
        drawRoundRect(
            color = SELECTION_FRAME_COLOR,
            topLeft = Offset(-offset, -offset),
            size = Size(size.width + 2 * offset, size.height + 2 * offset),
            cornerRadius = CornerRadius(FRAME_CORNER.toPx() / safeScale),
            style = sceneSelectionFrameStroke(density = this, scale = safeScale),
        )
    }
}

internal val SELECTION_FRAME_COLOR = Color.White

internal fun sceneSelectionFrameStroke(density: Density, scale: Float): Stroke = with(density) {
    Stroke(width = FRAME_STROKE.toPx() / scale)
}
