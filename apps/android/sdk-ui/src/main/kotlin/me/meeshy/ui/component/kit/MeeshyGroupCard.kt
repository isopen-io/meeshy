package me.meeshy.ui.component.kit

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **La carte de groupe** (K43) : ce qui va ensemble tient dans UNE surface arrondie, avec ses filets en retrait, son en-tête et
 * son pied. Elle rassemble, elle ne décide de rien : « une carte, une idée, jamais une carte dans une carte ».
 *
 * Agnostique : des emplacements. Sept fonds et cinq gabarits (voir `MeeshyGroupCardRecipe`) ; le verre ne vient que de K01 ;
 * `Danger` teinte fond, bord ET filets. Avec [onPress], toute la carte se touche (carte d'action) ; verrouillée ([isLocked]),
 * elle est annoncée désactivée et ne répond plus. Les filets entre enfants sont posés par [MeeshyGroupCardDivider]. Jumeau iOS :
 * `MeeshyGroupCard`.
 */
@Composable
@Suppress("LongParameterList", "LongMethod")
public fun MeeshyGroupCard(
    modifier: Modifier = Modifier,
    surface: MeeshyGroupCardSurface = MeeshyGroupCardSurface.Raised,
    layout: MeeshyGroupCardLayout = MeeshyGroupCardLayout.Content,
    overline: String? = null,
    isLocked: Boolean = false,
    isFeatured: Boolean = false,
    isBubble: Boolean = false,
    tint: Color? = null,
    onPress: (() -> Unit)? = null,
    accessory: (@Composable () -> Unit)? = null,
    footer: (@Composable () -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val source = remember { MutableInteractionSource() }
    val isPressed by source.collectIsPressedAsState()
    val values = MeeshyGroupCardRecipe.resolve(surface, layout, onPress != null, isPressed, isLocked, isFeatured, isBubble)
    val accent = tint ?: MeeshyPalette.Indigo500
    val shape = RoundedCornerShape(
        topStart = values.cornerRadius.dp,
        topEnd = values.cornerRadius.dp,
        bottomEnd = values.cornerRadius.dp,
        bottomStart = values.bubbleCornerRadius.dp,
    )
    val washBase = when (surface) {
        MeeshyGroupCardSurface.Danger -> tokens.error
        else -> accent
    }
    val fill = when (surface) {
        MeeshyGroupCardSurface.Raised -> tokens.surfaceFill
        MeeshyGroupCardSurface.Ground -> tokens.backgroundSecondary
        MeeshyGroupCardSurface.Accent, MeeshyGroupCardSurface.Danger -> washBase.copy(alpha = values.washOpacity.toFloat())
        MeeshyGroupCardSurface.Solid -> accent
        MeeshyGroupCardSurface.Glass, MeeshyGroupCardSurface.Dashed -> Color.Transparent
    }
    val borderColor = when (surface) {
        MeeshyGroupCardSurface.Accent, MeeshyGroupCardSurface.Danger -> washBase.copy(alpha = values.borderOpacity.toFloat())
        else -> tokens.hairline
    }
    val lifted = if (values.lighten > 0.0) lerp(fill, Color.White, values.lighten.toFloat()) else fill
    val press = if (onPress != null) {
        Modifier.clickable(interactionSource = source, indication = null, enabled = values.isActive, role = Role.Button, onClick = onPress)
    } else {
        Modifier
    }
    val inner: @Composable () -> Unit = {
        Column(Modifier.alpha(values.contentOpacity.toFloat()).heightIn(min = values.minHeight.dp).padding(vertical = values.verticalPadding.dp)) {
            if (MeeshyGroupCardRecipe.showsHeader(overline != null, accessory != null)) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = values.headerHeight.dp).padding(horizontal = values.dividerInset.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    if (overline != null) Text(overline.uppercase(), color = tokens.textSecondary, fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
                    if (accessory != null) accessory()
                }
            }
            content()
            if (footer != null) Box(Modifier.padding(horizontal = values.dividerInset.dp, vertical = 12.dp)) { footer() }
        }
    }
    Box(
        modifier
            .fillMaxWidth()
            .graphicsLayer {
                scaleX = values.scale.toFloat()
                scaleY = values.scale.toFloat()
            }
            .then(
                if (values.haloWidth > 0.0) {
                    Modifier.border(BorderStroke(values.haloWidth.dp, accent.copy(alpha = values.haloOpacity.toFloat())), shape)
                } else {
                    Modifier
                },
            )
            .clip(shape)
            .then(if (values.hasFill) Modifier.background(lifted) else Modifier)
            .then(
                if (values.isBorderDashed) {
                    Modifier.drawBehind {
                        drawOutline(
                            shape.createOutline(this.size, layoutDirection, this),
                            borderColor,
                            style = Stroke(values.borderWidth.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx()))),
                        )
                    }
                } else if (values.borderWidth > 0.0) {
                    Modifier.border(BorderStroke(values.borderWidth.dp, borderColor), shape)
                } else {
                    Modifier
                },
            )
            .then(press)
            .semantics { if (!values.isActive) disabled() },
    ) {
        if (values.usesGlass) MeeshyGlass(Modifier.fillMaxWidth(), shape = shape) { inner() } else inner()
    }
}

/** Le filet en retrait entre deux enfants d'une carte de groupe ; `Danger` le rougit et l'affaiblit. */
@Composable
public fun MeeshyGroupCardDivider(modifier: Modifier = Modifier, surface: MeeshyGroupCardSurface = MeeshyGroupCardSurface.Raised) {
    val tokens = MeeshyTheme.tokens
    val values = MeeshyGroupCardRecipe.resolve(surface = surface)
    val color = if (surface == MeeshyGroupCardSurface.Danger) tokens.error.copy(alpha = values.dividerOpacity.toFloat()) else tokens.hairline
    Box(modifier.padding(start = values.dividerInset.dp).fillMaxWidth().height(1.dp).background(color))
}
