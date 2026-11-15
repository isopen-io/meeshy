package me.meeshy.ui.component.kit

import androidx.compose.foundation.layout.Box
import androidx.compose.material3.LocalTextStyle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.layout.SubcomposeLayout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import kotlin.math.roundToInt
import me.meeshy.ui.theme.MeeshyFontSize

private enum class Role {
    Exit,
    Center,
    Accessory,
    Confirm,
}

/** La clé d'un emplacement : le vrai (composé UNE fois par passe) ou une sonde de largeur du centre (sans sémantique). */
private sealed interface SlotKey {
    data class Real(val role: Role) : SlotKey

    data class CenterProbe(val reducesToGlyph: Boolean, val labelScale: Float) : SlotKey
}

/**
 * La rangée de l'en-tête : Quitter au bord de début, l'accessoire puis la validation au bord de fin, le centre au milieu
 * DU CADRE (pas de la place restante). Les positions sont miroitées en RTL par `placeRelative`.
 *
 * Le pas d'ajustement ([MeeshyModeHeaderFit], les quatre candidats dans l'ordre) se décide AVANT de composer les vrais
 * emplacements, pour qu'un seul exemplaire de chacun existe dans l'arbre (jamais de doublon pour le lecteur d'écran) :
 * la largeur de Quitter et de la validation vient de leur titre MESURÉ par la loi des capsules (`capsuleWidth`), celle de
 * l'accessoire de sa mesure intrinsèque, celle du centre de sondes sans sémantique (le centre est un emplacement de
 * l'hôte : sa largeur réduite n'est connue que composée). Les sondes ne sont composées que pour un centre garni, et
 * seulement quand le pas plein ne tient pas. Une clé ne se compose qu'une fois par passe : le vrai centre est donc
 * composé une seule fois, au pas retenu.
 */
@Composable
internal fun MeeshyModeHeaderRow(
    exit: MeeshyModeActionValues,
    onExit: () -> Unit,
    confirm: MeeshyModeActionValues?,
    onConfirm: () -> Unit,
    center: (@Composable () -> Unit)?,
    accessory: (@Composable () -> Unit)?,
) {
    val density = LocalDensity.current
    val measurer = rememberTextMeasurer()
    val titleStyle = LocalTextStyle.current.merge(TextStyle(fontSize = MeeshyFontSize.body, fontWeight = FontWeight.Bold))
    val pixelsPerDp = density.density
    SubcomposeLayout { constraints ->
        fun natural(measurable: Measurable): Float = measurable.maxIntrinsicWidth(0) / pixelsPerDp

        fun item(values: MeeshyModeActionValues): MeeshyModeHeaderFit.Item {
            val text = measurer.measure(values.title, titleStyle, maxLines = 1, softWrap = false).size.width / pixelsPerDp
            return MeeshyModeHeaderFit.Item(textWidth = text, hasGlyph = values.icon != null, display = values.display)
        }

        val gap = MeeshyModeChromeRecipe.itemGap
        val available = if (constraints.hasBoundedWidth) constraints.maxWidth / pixelsPerDp else Float.MAX_VALUE
        val accessoryMeasurable = accessory?.let {
            subcompose(SlotKey.Real(Role.Accessory)) { Slot(MeeshyModeCapsuleFit(), hidden = false, content = it) }.first()
        }
        val accessoryWidth = accessoryMeasurable?.let(::natural)
        val exitItem = item(exit)
        val confirmItem = confirm?.let(::item)

        val probes = HashMap<SlotKey.CenterProbe, Float>()
        fun centerWidth(step: MeeshyModeHeaderFit.Step): Float? {
            if (center == null) return null
            val key = SlotKey.CenterProbe(step.reducesCenter, step.labelScale)
            return probes.getOrPut(key) {
                val fit = MeeshyModeCapsuleFit(reducesToGlyph = key.reducesToGlyph, labelScale = key.labelScale)
                natural(subcompose(key) { Slot(fit, hidden = true, content = center) }.first())
            }
        }

        val chosen = MeeshyModeHeaderFit.Step.entries.firstOrNull { step ->
            MeeshyModeHeaderFit.requiredWidth(
                exit = exitItem.width(reducedToGlyph = false, labelScale = step.labelScale),
                center = centerWidth(step),
                accessory = accessoryWidth,
                confirm = confirmItem?.width(reducedToGlyph = step.reducesConfirm, labelScale = step.labelScale),
                gap = gap,
            ) <= available
        } ?: MeeshyModeHeaderFit.Step.Compact

        val scale = chosen.labelScale
        val exitMeasurable = subcompose(SlotKey.Real(Role.Exit)) {
            Slot(MeeshyModeCapsuleFit(labelScale = scale), hidden = false) {
                MeeshyModeCapsuleContent(values = exit, kind = MeeshyModeCapsuleKind.Glass, onClick = onExit)
            }
        }.first()
        val centerMeasurable = center?.let {
            subcompose(SlotKey.Real(Role.Center)) {
                Slot(MeeshyModeCapsuleFit(reducesToGlyph = chosen.reducesCenter, labelScale = scale), hidden = false, content = it)
            }.first()
        }
        val confirmMeasurable = confirm?.let {
            subcompose(SlotKey.Real(Role.Confirm)) {
                Slot(MeeshyModeCapsuleFit(reducesToGlyph = chosen.reducesConfirm, labelScale = scale), hidden = false) {
                    MeeshyModeCapsuleContent(values = it, kind = MeeshyModeCapsuleKind.Solid, onClick = onConfirm)
                }
            }.first()
        }

        val shares = MeeshyModeHeaderFit.allocate(
            available = available,
            exit = natural(exitMeasurable),
            center = centerMeasurable?.let(::natural),
            accessory = accessoryWidth,
            confirm = confirmMeasurable?.let(::natural),
            gap = gap,
        )

        fun placeable(measurable: Measurable?, share: Float?): Placeable? =
            measurable?.measure(Constraints(maxWidth = ((share ?: 0f) * pixelsPerDp).roundToInt().coerceAtLeast(0)))

        val exitPlaceable = placeable(exitMeasurable, shares.exit)!!
        val centerPlaceable = placeable(centerMeasurable, shares.center)
        val accessoryPlaceable = placeable(accessoryMeasurable, shares.accessory)
        val confirmPlaceable = placeable(confirmMeasurable, shares.confirm)

        val required = MeeshyModeHeaderFit.requiredWidth(
            exit = natural(exitMeasurable), center = centerMeasurable?.let(::natural), accessory = accessoryWidth,
            confirm = confirmMeasurable?.let(::natural), gap = gap,
        )
        val width = if (constraints.hasBoundedWidth) constraints.maxWidth else (required * pixelsPerDp).roundToInt()
        val height = listOfNotNull(exitPlaceable, centerPlaceable, accessoryPlaceable, confirmPlaceable).maxOf { it.height }
        val gapPixels = (gap * pixelsPerDp).roundToInt()
        layout(width, height) {
            fun y(placeable: Placeable) = (height - placeable.height) / 2
            exitPlaceable.placeRelative(0, y(exitPlaceable))
            confirmPlaceable?.placeRelative(width - confirmPlaceable.width, y(confirmPlaceable))
            accessoryPlaceable?.let {
                val confirmSpan = confirmPlaceable?.let { placed -> placed.width + gapPixels } ?: 0
                it.placeRelative(width - confirmSpan - it.width, y(it))
            }
            centerPlaceable?.placeRelative((width - centerPlaceable.width) / 2, y(centerPlaceable))
        }
    }
}

/**
 * Un emplacement : la réduction qu'il subit est dite à ses capsules, et il n'émet qu'UNE racine. [hidden] : une sonde de
 * mesure, jamais posée, que le lecteur d'écran ne voit pas.
 */
@Composable
private fun Slot(fit: MeeshyModeCapsuleFit, hidden: Boolean, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalMeeshyModeFit provides fit) {
        Box(if (hidden) Modifier.clearAndSetSemantics { } else Modifier) { content() }
    }
}
