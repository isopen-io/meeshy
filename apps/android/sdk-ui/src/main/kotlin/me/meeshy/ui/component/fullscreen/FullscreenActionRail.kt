package me.meeshy.ui.component.fullscreen

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.fullscreen.FullscreenChromeMetrics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Deux habillages pour une même action, et une raison pour chacun.
 */
public sealed interface FullscreenActionStyle {

    public val tone: FullscreenChromeTone

    /**
     * Le disque de verre du chrome : colonne COURTE (3 actions au plus, sans compteur) posée à côté
     * d'un média cadré — la galerie de pièces jointes.
     */
    public data class Disc(override val tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia) :
        FullscreenActionStyle

    /**
     * Le glyphe NU sous son halo, libellé ou compteur dessous : le rail SOCIAL (story, réel) posé
     * sur un média plein cadre, où une pile de disques pèserait sur l'image. Le glyphe est blanc
     * par défaut (les voiles sombres le détachent) ; un hôte qui pose son thème d'après la
     * luminance du média passe [FullscreenChromeTone.Adaptive].
     */
    public data class Floating(override val tone: FullscreenChromeTone = FullscreenChromeTone.OnMedia) :
        FullscreenActionStyle

    /**
     * Ce que la cellule écrit sous le glyphe. Un disque n'écrit rien : son libellé est pour
     * TalkBack.
     */
    public fun showsCaption(caption: String?): Boolean = this is Floating && !caption.isNullOrEmpty()
}

/**
 * Une action du rail plein écran — Réagir, Répondre, Commentaires, Republier…
 *
 * [caption] est le libellé visible (story) ou le compteur déjà formaté (réel) ; [label] reste le
 * verbe lu par TalkBack, et [accessibilityValue] y ajoute le compteur. [hint] est le verbe de
 * l'action de clic.
 *
 * [outlineTint] est le CONTOUR et le HALO d'une action flottante : le même glyphe agrandi derrière
 * le glyphe, dans cette teinte, et une lueur colorée — le son ouvert, le cœur posé, chaque geste
 * déjà fait. `null` : aucun contour. Le glyphe garde son encre, le contour l'entoure.
 *
 * [handlesTapViaGesture] est pour la cellule qui porte AUSSI un geste séquencé de l'hôte (appui
 * long puis glisser) : le tap bref reste servi sans consommer le toucher à la place de l'hôte.
 */
@Composable
public fun FullscreenActionButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    hint: String? = null,
    style: FullscreenActionStyle = FullscreenActionStyle.Floating(),
    caption: String? = null,
    accessibilityValue: String? = null,
    badge: ImageVector? = null,
    isActive: Boolean = false,
    activeTint: Color? = null,
    outlineTint: Color? = null,
    handlesTapViaGesture: Boolean = false,
) {
    val semanticsModifier = Modifier.semantics {
        contentDescription = label
        if (accessibilityValue != null) stateDescription = accessibilityValue
        if (isActive) selected = true
    }
    when (style) {
        is FullscreenActionStyle.Disc -> FullscreenChromeDisc(
            icon = icon,
            badge = badge,
            tone = style.tone,
            activeTint = if (isActive) activeTint else null,
            modifier = modifier
                .clip(CircleShape)
                .fullscreenTappable(onClickLabel = hint, viaGesture = handlesTapViaGesture, onClick = onClick)
                .then(semanticsModifier),
        )

        is FullscreenActionStyle.Floating -> FloatingActionCell(
            icon = icon,
            tone = style.tone,
            caption = caption.takeIf { style.showsCaption(it) },
            badge = badge,
            isActive = isActive,
            activeTint = activeTint,
            outlineTint = outlineTint,
            modifier = modifier
                .clip(RoundedCornerShape(MeeshyRadius.md))
                .fullscreenTappable(onClickLabel = hint, viaGesture = handlesTapViaGesture, onClick = onClick)
                .then(semanticsModifier),
        )
    }
}

@Composable
private fun FloatingActionCell(
    icon: ImageVector,
    tone: FullscreenChromeTone,
    caption: String?,
    badge: ImageVector?,
    isActive: Boolean,
    activeTint: Color?,
    outlineTint: Color?,
    modifier: Modifier,
) {
    val ink = fullscreenChromeInk(tone, if (isActive) activeTint else null)
    val bounce = remember { Animatable(1f) }
    var bounceArmed by remember { mutableStateOf(false) }
    val isOutlined = outlineTint != null
    LaunchedEffect(isActive, isOutlined) {
        if (!bounceArmed) {
            bounceArmed = true
            return@LaunchedEffect
        }
        bounce.animateTo(BOUNCE_PEAK, tween(durationMillis = BOUNCE_UP_MILLIS))
        bounce.animateTo(1f, MeeshyMotion.bouncySpring())
    }
    Column(
        modifier = modifier
            .width(FullscreenChromeDimens.floatingCellWidth)
            .heightIn(min = FullscreenChromeDimens.tapTarget),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs / 2, Alignment.CenterVertically),
    ) {
        Box(
            Modifier
                .size(FullscreenChromeDimens.floatingGlyph)
                .glow(outlineTint)
                .graphicsLayer {
                    scaleX = bounce.value
                    scaleY = bounce.value
                },
        ) {
            if (outlineTint != null) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = outlineTint,
                    modifier = Modifier
                        .size(FullscreenChromeDimens.floatingGlyph)
                        .graphicsLayer {
                            scaleX = FullscreenChromeMetrics.OUTLINE_SCALE
                            scaleY = FullscreenChromeMetrics.OUTLINE_SCALE
                        },
                )
            }
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = ink,
                modifier = Modifier.size(FullscreenChromeDimens.floatingGlyph),
            )
            if (badge != null) {
                Icon(
                    imageVector = badge,
                    contentDescription = null,
                    tint = ink,
                    modifier = Modifier
                        .size(10.dp)
                        .align(Alignment.TopEnd)
                        .offset(x = 6.dp, y = (-4).dp),
                )
            }
        }
        if (caption != null) {
            Text(
                text = caption,
                style = MaterialTheme.typography.labelMedium.copy(
                    fontWeight = FontWeight.SemiBold,
                    shadow = Shadow(color = Color.Black.copy(alpha = CAPTION_SHADOW_ALPHA), offset = Offset(0f, 1f), blurRadius = 4f),
                ),
                color = ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clearAndSetSemantics { testTag = FLOATING_CAPTION_TAG },
            )
        }
    }
}

private const val CAPTION_SHADOW_ALPHA: Float = 0.45f

/**
 * La légende est muette pour TalkBack (le compteur est lu en valeur du libellé) : sa sémantique est
 * effacée, et son texte avec elle — aucun test ne peut plus la trouver par son texte. Ce repère,
 * posé dans le même bloc, la garde observable.
 */
internal const val FLOATING_CAPTION_TAG: String = "fullscreen-floating-caption"

/** La lueur d'un contour : un halo radial de la teinte, derrière le glyphe. */
private fun Modifier.glow(tint: Color?): Modifier =
    if (tint == null) {
        this
    } else {
        drawBehind {
            val radius = size.minDimension / 2f + FullscreenChromeMetrics.OUTLINE_GLOW_RADIUS_DP.dp.toPx()
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(tint.copy(alpha = FullscreenChromeMetrics.OUTLINE_GLOW_OPACITY), Color.Transparent),
                    center = center,
                    radius = radius,
                ),
                radius = radius,
                center = center,
            )
        }
    }

/**
 * Le rebond d'une action flottante ne joue qu'à un CHANGEMENT de son état actif ou de son contour
 * (le son allumé, le cœur posé, un commentaire laissé), jamais au montage.
 */
private const val BOUNCE_PEAK: Float = 1.18f
private const val BOUNCE_UP_MILLIS: Int = 80

/**
 * Le rail d'actions — au bord de FIN, ancré en bas, l'ordre fixé par la charte § 6 : Réagir (ou
 * J'aime), Répondre (ou Commentaires), puis ce que la surface ajoute. Les actions forment un
 * groupe de parcours TalkBack : le doigt les lit dans l'ordre, sans sauter vers la légende.
 */
@Composable
public fun FullscreenActionRail(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier.semantics { isTraversalGroup = true },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(FullscreenChromeDimens.railSpacing),
        content = content,
    )
}
