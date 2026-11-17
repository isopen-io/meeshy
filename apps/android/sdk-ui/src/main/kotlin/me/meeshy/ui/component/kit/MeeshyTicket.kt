package me.meeshy.ui.component.kit

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

private const val CONTENT_PADDING_DP = 16
private const val GAP_DP = 12
private const val CAMERA_DISTANCE = 12f

/**
 * **Le billet** (K30) : une carte, deux encoches, un pointillé de coupe. Au-dessus, ce que c'est ; dessous, ce qu'on en fait ;
 * derrière, le verso.
 *
 * Agnostique : des chaînes déjà écrites, une teinte, un glyphe et cinq emplacements (`stub`, `leading`, `trailing`, `status`,
 * `back`). Il ne copie rien, n'ouvre rien, ne compte rien : [onPress] appartient à l'hôte, et les boutons du talon gardent leur
 * propre cible (la presse du billet est posée DERRIÈRE le contenu). [isFlipped] est la seule cause du retournement ; le côté caché
 * n'est ni touchable ni lu. Jumeau iOS : `MeeshyTicket`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod", "CyclomaticComplexMethod")
public fun MeeshyTicket(
    title: String,
    code: String,
    modifier: Modifier = Modifier,
    tint: Color? = null,
    size: MeeshyTicketSize = MeeshyTicketSize.Row,
    kind: MeeshyTicketKind = MeeshyTicketKind.Normal,
    isFlipped: Boolean = false,
    isSelected: Boolean = false,
    isDragging: Boolean = false,
    figure: String? = null,
    figureCaption: String? = null,
    label: String? = null,
    statusLabel: String? = null,
    onPress: (() -> Unit)? = null,
    leading: (@Composable () -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
    status: (@Composable () -> Unit)? = null,
    stub: (@Composable () -> Unit)? = null,
    back: (@Composable () -> Unit)? = null,
) {
    val tokens = MeeshyTheme.tokens
    val reduceMotion = LocalReduceMotion.current
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val values = MeeshyTicketRecipe.resolve(size, kind, isSelected, isPressed && onPress != null, false, isDragging, isFlipped, reduceMotion)
    val density = LocalDensity.current
    val shape = remember(values.cut, density) {
        MeeshyTicketShape(
            cornerPx = with(density) { values.cornerRadius.dp.toPx() },
            notchDiameterPx = with(density) { values.notchDiameter.dp.toPx() },
            cutPx = with(density) { values.cut.dp.toPx() },
        )
    }
    val accent = tint ?: MeeshyPalette.Indigo500
    val rotation by animateFloatAsState(values.flipRotation.toFloat(), tween(MeeshyTicketRecipe.FLIP_CROSSFADE_MILLIS * 2), label = "ticket-flip")
    val front = rotation <= 90f
    val ruleColor = tokens.hairline
    val borderColor = if (isSelected) accent else tokens.hairline
    val fill = when (values.fill) {
        MeeshyTicketFill.Raised -> tokens.surfaceFill
        MeeshyTicketFill.Field -> tokens.controlFill
        MeeshyTicketFill.None -> Color.Transparent
    }
    val width = values.width
    val press = if (onPress != null && !isFlipped) Modifier.clickable(source, null, role = Role.Button, onClick = onPress) else Modifier
    Box(
        modifier
            .then(if (width != null) Modifier.width(width.dp) else Modifier.fillMaxWidth())
            .graphicsLayer {
                scaleX = values.scale.toFloat()
                scaleY = values.scale.toFloat()
                rotationZ = values.tilt.toFloat()
                rotationY = rotation
                cameraDistance = CAMERA_DISTANCE * density.density
            }
            .clip(shape)
            .background(fill)
            .then(
                if (values.isBorderDashed) {
                    Modifier.drawBehind {
                        val outline = shape.createOutline(this.size, layoutDirection, this)
                        drawOutline(
                            outline,
                            borderColor,
                            style = Stroke(values.borderWidth.dp.toPx(), pathEffect = PathEffect.dashPathEffect(values.dashPattern.map { it.dp.toPx() }.toFloatArray())),
                        )
                    }
                } else {
                    Modifier.border(BorderStroke(values.borderWidth.dp, borderColor), shape)
                },
            )
            .then(press)
            .semantics(mergeDescendants = true) {
                val said = listOfNotNull(label, statusLabel).joinToString(", ")
                if (said.isNotEmpty()) contentDescription = said
            },
    ) {
        if (front) {
            Column(Modifier.alpha(if (values.showsContent) 1f else 0f)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = values.cut.dp).padding(CONTENT_PADDING_DP.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(GAP_DP.dp),
                ) {
                    if (values.pastilleSize > 0.0) {
                        Box(Modifier.size(values.pastilleSize.dp).clip(CircleShape).background(accent), contentAlignment = Alignment.Center) {
                            Text(title.take(1).uppercase(), color = MeeshyTicketRecipe.ink(accent), fontWeight = FontWeight.Bold)
                        }
                    }
                    Column(Modifier.weight(1f)) {
                        Text(
                            text = title,
                            color = tokens.textPrimary,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textDecoration = if (values.isStruck) TextDecoration.LineThrough else null,
                        )
                        Text(
                            text = code,
                            color = tokens.textSecondary,
                            fontFamily = FontFamily.Monospace,
                            fontSize = values.codeFontSize.coerceAtLeast(11.0).sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                            textDecoration = if (values.isStruck) TextDecoration.LineThrough else null,
                        )
                        if (figure != null) Text(figure, color = tokens.textPrimary, fontWeight = FontWeight.Bold)
                        if (figureCaption != null) Text(figureCaption, color = tokens.textMuted, fontSize = 12.sp)
                    }
                    if (status != null) status()
                    if (leading != null) leading()
                    if (trailing != null) trailing()
                }
                if (stub != null && values.cut > 0.0) {
                    Box(
                        Modifier.fillMaxWidth().drawBehind {
                            drawLine(
                                color = ruleColor,
                                start = Offset(values.cutMargin.dp.toPx(), 0f),
                                end = Offset(this.size.width - values.cutMargin.dp.toPx(), 0f),
                                strokeWidth = values.dashLineWidth.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(values.dashPattern.map { it.dp.toPx() }.toFloatArray()),
                            )
                        }.padding(CONTENT_PADDING_DP.dp),
                    ) { stub() }
                }
            }
        } else if (back != null) {
            Box(Modifier.graphicsLayer { rotationY = 180f }.padding(CONTENT_PADDING_DP.dp)) { back() }
        }
    }
}
