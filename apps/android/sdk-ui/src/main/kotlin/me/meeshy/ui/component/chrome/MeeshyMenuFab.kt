package me.meeshy.ui.component.chrome

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.chrome.FloatingMenuLadder
import me.meeshy.sdk.model.chrome.unreadBadgeLabel
import me.meeshy.sdk.model.layout.PointDp
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette

/** One rung of the ladder — an icon, a label (spoken, not drawn), an accent colour and an
 *  optional badge. Opaque data so the atom stays product-agnostic. */
public data class RadialMenuItem(
    val icon: ImageVector,
    val label: String,
    val color: Color,
    val badgeCount: Int = 0,
    val onSelect: () -> Unit,
)

/** Etiquettes de test : le voile et chaque barreau (`menu-ladder-rung-<index>`). */
public const val MENU_LADDER_VEIL_TAG: String = "menu-ladder-veil"
public fun menuLadderRungTag(index: Int): String = "menu-ladder-rung-$index"

/** Cible tactile d'un barreau : le disque de 46 dp iOS, porte a 48 dp de toucher. */
private val RUNG_TARGET = 48.dp
private val RUNG_DISC = FloatingMenuLadder.ITEM_SIZE.dp

/**
 * Le voile TRANSPARENT de l'echelle ouverte — miroir du `Color.clear` plein ecran de
 * `RootFloatingChrome` : un tap n'importe ou hors des boutons et des barreaux referme le menu.
 * A poser SOUS les deux boutons flottants (le second tap sur l'avatar doit les atteindre).
 */
@Composable
public fun MeeshyMenuVeil(expanded: Boolean, onDismiss: () -> Unit, modifier: Modifier = Modifier) {
    if (!expanded) return
    Box(
        modifier = modifier
            .fillMaxSize()
            .testTag(MENU_LADDER_VEIL_TAG)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = onDismiss,
            )
            .clearAndSetSemantics { },
    )
}

/**
 * L'echelle verticale du bouton avatar — miroir de `RootFloatingChrome.menuLadder` iOS : des
 * disques de 46 dp a l'aplomb du bouton, vers le bas ou vers le haut ([opensDownward], decide
 * par `FloatingButtonGeometry.menuOpensDownward`), apparaissant en echelon de 0,04 s (echelle
 * 0,3 -> 1, fondu, rotation -30 deg -> 0, ressort 0,4 / 0,65 ; fermeture 0,25 d'un bloc).
 * Reduire les animations : un simple fondu.
 *
 * L'echelle reste MONTEE fermee (opacite 0, ni toucher ni TalkBack) pour que le ressort
 * d'ouverture parte d'un etat existant. [menuCenter] est en dp, dans le repere de l'ecran.
 * Le libelle n'est pas dessine : il est annonce, avec [itemHint] comme action du double-tap.
 */
@Composable
public fun MeeshyMenuLadder(
    items: List<RadialMenuItem>,
    expanded: Boolean,
    menuCenter: PointDp,
    opensDownward: Boolean,
    itemHint: String,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val reduceMotion = LocalReduceMotion.current
    Box(modifier = modifier.fillMaxSize()) {
        items.forEachIndexed { index, item ->
            LadderRung(
                item = item,
                index = index,
                expanded = expanded,
                center = PointDp(
                    x = menuCenter.x,
                    y = FloatingMenuLadder.itemCenterY(index, menuCenter.y, opensDownward),
                ),
                reduceMotion = reduceMotion,
                hint = itemHint,
                onClick = {
                    onDismiss()
                    item.onSelect()
                },
            )
        }
    }
}

@Composable
private fun LadderRung(
    item: RadialMenuItem,
    index: Int,
    expanded: Boolean,
    center: PointDp,
    reduceMotion: Boolean,
    hint: String,
    onClick: () -> Unit,
) {
    val haptics = rememberMeeshyHaptics()
    val progress = remember { Animatable(if (expanded) 1f else 0f) }
    LaunchedEffect(expanded, reduceMotion) {
        delay(FloatingMenuLadder.delayMillis(index, opening = expanded))
        val target = if (expanded) 1f else 0f
        if (reduceMotion) {
            progress.animateTo(target, tween(ScrollMotionVisibility.FADE_DURATION_MS))
        } else {
            val response = if (expanded) FloatingMenuLadder.OPEN_SPRING_RESPONSE else FloatingMenuLadder.CLOSE_SPRING_RESPONSE
            progress.animateTo(
                target,
                spring(dampingRatio = FloatingMenuLadder.SPRING_DAMPING, stiffness = MeeshyMotion.stiffnessForResponse(response)),
            )
        }
    }
    val half = RUNG_TARGET.value / 2f
    val interaction = if (expanded) {
        Modifier
            .semantics { contentDescription = item.label }
            .clickable(onClickLabel = hint, role = Role.Button) {
                haptics.light()
                onClick()
            }
    } else {
        Modifier.clearAndSetSemantics { }
    }
    Box(
        modifier = Modifier
            .offset { IntOffset((center.x - half).dp.roundToPx(), (center.y - half).dp.roundToPx()) }
            .size(RUNG_TARGET)
            .graphicsLayer {
                val frame = FloatingMenuLadder.frame(progress.value, reduceMotion)
                scaleX = frame.scale
                scaleY = frame.scale
                alpha = frame.alpha
                rotationZ = frame.rotationDegrees
            }
            .testTag(menuLadderRungTag(index))
            .then(interaction),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(RUNG_DISC)
                .shadow(
                    elevation = 8.dp,
                    shape = CircleShape,
                    ambientColor = item.color.copy(alpha = 0.45f),
                    spotColor = item.color.copy(alpha = 0.45f),
                )
                .background(Brush.linearGradient(listOf(item.color, item.color.copy(alpha = 0.7f))), CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = item.icon,
                contentDescription = null,
                tint = MeeshyPalette.White,
                modifier = Modifier.size((FloatingMenuLadder.ITEM_SIZE * 0.39f).dp),
            )
        }
        if (item.badgeCount > 0) {
            // Pastille blanche, chiffre dans la couleur du barreau, decalee de 33 % du disque.
            val shift = (FloatingMenuLadder.ITEM_SIZE * 0.33f).dp
            Box(
                modifier = Modifier
                    .offset(x = shift, y = -shift)
                    .defaultMinSize(minWidth = 16.dp, minHeight = 16.dp)
                    .background(MeeshyPalette.White, RoundedCornerShape(50))
                    .padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = unreadBadgeLabel(item.badgeCount),
                    color = item.color,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                )
            }
        }
    }
}
