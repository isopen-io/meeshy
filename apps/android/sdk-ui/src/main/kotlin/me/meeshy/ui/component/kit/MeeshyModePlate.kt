package me.meeshy.ui.component.kit

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * **La plaque basse de verre d'un mode plein écran** (K16) : UNE plaque de verre `dense` de K01 qui porte les réglages de
 * l'outil. Elle épouse la hauteur de son contenu jusqu'à 42 % de la fenêtre (jamais moins de 160), puis défile. Le
 * contenu du mode reste manipulable derrière ; la plaque garde ses propres touchers.
 *
 * - Le contenu est un emplacement : un réglage qui glisse ne recompose pas la plaque. La hauteur n'est jamais mesurée
 *   image par image : la plaque est bornée par son plafond (calculé une fois par taille de fenêtre) et le défilement
 *   fait le reste.
 * - [scrollLocked] : un geste du contenu (un curseur, un glisser) tient la plaque, elle ne défile pas.
 * - Les boutons posés dedans sont des K02 emboîtés : aucun verre sur du verre.
 * - [contentKey] : quand il change, l'ancien contenu se fond dans le nouveau en 150 ms.
 * - [windowHeight] : la hauteur sur laquelle le plafond se calcule ; par défaut celle de l'écran. Un hôte qui n'est pas
 *   dans une fenêtre (un catalogue, un instantané) la donne.
 *
 * La plaque ne pose ni marge basse ni largeur : le cadre ([MeeshyModeChrome]) ou l'hôte la place. Pendant iOS :
 * `MeeshyModePlate`.
 */
@Composable
public fun MeeshyModePlate(
    label: String,
    modifier: Modifier = Modifier,
    maxWidth: Dp? = null,
    scrollLocked: Boolean = false,
    presence: MeeshyModeChromePresence = MeeshyModeChromePresence.Shown,
    tone: MeeshyGlassTone? = null,
    contentKey: Any? = null,
    windowHeight: Dp? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    require(label.isNotEmpty()) { "MeeshyModePlate : le nom du groupe est obligatoire et non vide" }
    val window = windowHeight ?: LocalConfiguration.current.screenHeightDp.dp
    val ceiling = remember(window) { MeeshyModePlateMetrics.maxHeight(window.value).dp }
    MeeshyModePresence(presence = presence, edge = MeeshyModeEdge.Bottom, modifier = modifier) {
        MeeshyModeToned(tone) {
            MeeshyGlass(
                modifier = Modifier
                    .then(if (maxWidth != null) Modifier.widthIn(max = maxWidth) else Modifier)
                    .fillMaxWidth()
                    .heightIn(max = ceiling)
                    .pointerInput(Unit) {}
                    .semantics {
                        contentDescription = label
                        isTraversalGroup = true
                    },
                shape = PlateShape,
                density = MeeshyGlassDensity.Dense,
            ) {
                PlateScroller(scrollLocked = scrollLocked, contentKey = contentKey, content = content)
            }
        }
    }
}

private val PlateShape = RoundedCornerShape(MeeshyModeChromeRecipe.plateRadius.dp)

/** Le défilement et le fondu du contenu : la hauteur suit le contenu jusqu'au plafond que le verre pose. */
@Composable
private fun PlateScroller(scrollLocked: Boolean, contentKey: Any?, content: @Composable ColumnScope.() -> Unit) {
    val scroll = rememberScrollState()
    val reduceMotion = LocalReduceMotion.current
    Column(
        modifier = Modifier
            .verticalScroll(scroll, enabled = !scrollLocked)
            .padding(
                horizontal = MeeshyModeChromeRecipe.plateHorizontalPadding.dp,
                vertical = MeeshyModeChromeRecipe.plateVerticalPadding.dp,
            ),
    ) {
        if (contentKey == null) {
            PlateColumn(content)
        } else {
            Crossfade(
                targetState = contentKey,
                animationSpec = if (reduceMotion) snap() else tween(MeeshyModeChromeRecipe.CONTENT_FADE_MILLIS),
                label = "meeshyModePlateContent",
            ) { _ -> PlateColumn(content) }
        }
    }
}

@Composable
private fun PlateColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(MeeshyModeChromeRecipe.plateGap.dp),
        content = content,
    )
}
