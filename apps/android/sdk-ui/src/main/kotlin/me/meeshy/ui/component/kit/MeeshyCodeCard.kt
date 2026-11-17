package me.meeshy.ui.component.kit

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyTheme

private const val ONE_SKELETON_ALPHA = 0.12f

/**
 * **La carte de code** (K31) : un QR sur une plaque toujours claire, dans une carte de verre qui suit l'inclinaison du
 * téléphone. Tu donnes une chaîne, une teinte et une légende ; elle ne sait pas ce que le code ouvre.
 *
 * Le [payload] n'est jamais lu, journalisé ni mis dans un nom accessible : la carte est UN élément nommé par [label], dont la
 * valeur est [caption], et l'hôte offre toujours la même adresse en texte. En `Mini`, aucune marge de carte : le code et sa plaque
 * remplissent la place ; en `Plain`, la carte est la plaque claire elle-même, lisible sur un fond sombre. L'inclinaison ([yaw], [pitch], lus par l'hôte au capteur ou au
 * pointeur) n'est jamais le seul moyen de rien voir : sous « réduire les animations », en `Mini` et en `Plain`, la carte reste
 * droite. Sans [payload], un squelette tient la place finale. Avec [onPress], c'est un bouton. UN seul générateur : `MeeshyQrModules`.
 * Jumeau iOS : `MeeshyCodeCard`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyCodeCard(
    payload: String?,
    label: String,
    modifier: Modifier = Modifier,
    caption: String? = null,
    tint: Color? = null,
    style: MeeshyCodeCardStyle = MeeshyCodeCardStyle.Glass,
    size: MeeshyCodeCardSize = MeeshyCodeCardSize.Compact,
    tilt: MeeshyCodeCardTilt = MeeshyCodeCardTilt.Device,
    yaw: Float = 0f,
    pitch: Float = 0f,
    onPress: (() -> Unit)? = null,
    center: (@Composable BoxScope.() -> Unit)? = null,
    header: (@Composable () -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val reduceMotion = LocalReduceMotion.current
    val matrix = remember(payload) { payload?.let { MeeshyQrModules.encode(it) } }
    val values = remember(style, size, tilt, matrix != null, reduceMotion) {
        MeeshyCodeCardRecipe.resolve(style, size, tilt, isReady = matrix != null, reduceMotion = reduceMotion)
    }
    val motion = if (values.tilt == MeeshyCodeCardTilt.None) MeeshyCodeCardMotion.Flat else MeeshyCodeCardRecipe.motion(yaw.toDouble(), pitch.toDouble())
    val plate = MeeshyCodeCardRecipe.plateColor(style)
    val ink = tint?.let { MeeshyCodeCardRecipe.servedTint(it, style) } ?: MeeshyCodeCardRecipe.inkColor(style)
    val press = if (onPress != null) Modifier.clickable(role = Role.Button, onClick = onPress) else Modifier
    val cardShape = RoundedCornerShape(MeeshyCodeCardRecipe.CARD_RADIUS.dp)
    val bodyPadding = if (size == MeeshyCodeCardSize.Mini) PaddingValues(0.dp) else PaddingValues(start = 24.dp, top = 22.dp, end = 24.dp, bottom = 20.dp)
    val body: @Composable () -> Unit = {
        Column(Modifier.fillMaxWidth().padding(bodyPadding), horizontalAlignment = Alignment.CenterHorizontally) {
            if (header != null && values.hasCaption) header()
            Box(
                Modifier
                    .size((values.side + values.plateMargin * 2).dp)
                    .graphicsLayer { translationX = motion.plateShift.toFloat() * density }
                    .clip(RoundedCornerShape(values.plateRadius.dp))
                    .background(plate)
                    .padding(values.plateMargin.dp),
                contentAlignment = Alignment.Center,
            ) {
                if (matrix == null) {
                    Box(Modifier.size(values.side.dp).background(MeeshyCodeCardRecipe.inkColor(style).copy(alpha = ONE_SKELETON_ALPHA)))
                } else {
                    Canvas(Modifier.size(values.side.dp).aspectRatio(1f).clearAndSetSemantics { }) { drawModules(matrix, ink) }
                    if (center != null && values.hasCenter) {
                        Box(
                            Modifier
                                .size(MeeshyCodeCardRecipe.centerSide(values.side).dp)
                                .graphicsLayer { translationX = (motion.centerShift - motion.plateShift).toFloat() * density }
                                .clip(CircleShape)
                                .background(plate, CircleShape),
                            contentAlignment = Alignment.Center,
                            content = center,
                        )
                    }
                }
            }
            if (caption != null && values.hasCaption) {
                Spacer(Modifier.height(12.dp))
                Text(
                    caption,
                    color = if (style == MeeshyCodeCardStyle.Plain) MeeshyCodeCardRecipe.inkColor(style) else tokens.textPrimary,
                    fontSize = 14.sp,
                    fontFamily = FontFamily.Monospace,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    modifier = Modifier.clearAndSetSemantics { },
                )
            }
        }
    }
    Box(
        modifier
            .graphicsLayer {
                rotationY = motion.yaw.toFloat()
                rotationX = -motion.pitch.toFloat()
                cameraDistance = 16f * density
            }
            .then(press)
            .semantics(mergeDescendants = true) {
                contentDescription = label
                if (caption != null) stateDescription = caption
            }
            .width(values.cardWidth.dp),
    ) {
        when {
            values.isGlass -> MeeshyGlass(Modifier.fillMaxWidth(), shape = cardShape) { body() }
            style == MeeshyCodeCardStyle.Plain -> Box(Modifier.fillMaxWidth().clip(cardShape).background(plate)) { body() }
            else -> Box(Modifier.fillMaxWidth()) { body() }
        }
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawModules(matrix: MeeshyQrMatrix, ink: Color) {
    val cell = this.size.minDimension / matrix.size
    val inset = cell * (1f - MeeshyCodeCardRecipe.MODULE_SHARE.toFloat()) / 2f
    val side = cell * MeeshyCodeCardRecipe.MODULE_SHARE.toFloat()
    val corner = CornerRadius(side * MeeshyCodeCardRecipe.MODULE_CORNER_SHARE.toFloat())
    for (y in 0 until matrix.size) {
        for (x in 0 until matrix.size) {
            if (!matrix[x, y]) continue
            val eye = MeeshyQrModules.isEye(x, y, matrix.size)
            val origin = if (eye) Offset(x * cell, y * cell) else Offset(x * cell + inset, y * cell + inset)
            val extent = if (eye) Size(cell, cell) else Size(side, side)
            drawRoundRect(ink, origin, extent, if (eye) CornerRadius.Zero else corner)
        }
    }
}
