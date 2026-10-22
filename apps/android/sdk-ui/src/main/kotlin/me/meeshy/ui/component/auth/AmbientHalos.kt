package me.meeshy.ui.component.auth

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.brand.AmbientHaloSpec
import me.meeshy.sdk.model.brand.AmbientHaloTone
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** La part du rayon qui reste franchement colorée avant que le bord ne s'efface. */
private const val SOLID_CORE = 0.65f

/** Le bord s'étend au-delà du disque, comme le flou d'un rayon de 20 % de sa taille sur iOS. */
private const val SOFT_EDGE = 1.35f

/**
 * Les halos ambiants du fond des écrans d'accès (iOS `ThemePalette.ambientOrbs` + le pouls
 * `glowPulse`) : quatre disques de la famille indigo, très discrets, qui respirent chacun à
 * son rythme sur deux secondes.
 *
 * Décor pur — masqué à l'accessibilité — qui se pose DERRIÈRE le formulaire. Le disque est un
 * dégradé radial et non un flou : même rendu doux sur tous les appareils, sans l'effet de flou
 * que seuls les téléphones récents savent faire, et sans coût de recomposition (la phase n'est
 * lue qu'au dessin).
 *
 * **Sous « Réduire les animations »** ([reduceMotion]) les halos restent à leur échelle de
 * repos : aucune transition infinie n'est créée, donc aucune image n'est demandée au système
 * pour un décor.
 */
@Composable
public fun AmbientHalos(
    modifier: Modifier = Modifier,
    isDark: Boolean = MeeshyTheme.isDark,
    reduceMotion: Boolean = rememberAnimationsReduced(),
) {
    val phase = rememberHaloPhase(reduceMotion)
    val halos = remember(isDark) { AmbientHaloSpec.halos(isDark) }

    Canvas(modifier = modifier.fillMaxSize().clearAndSetSemantics { }) {
        val pulse = phase.value
        halos.forEachIndexed { index, halo ->
            val center = Offset(
                x = size.width / 2f + halo.offsetXDp.dp.toPx(),
                y = size.height / 2f + halo.offsetYDp.dp.toPx(),
            )
            val coreRadius = halo.sizeDp.dp.toPx() / 2f * AmbientHaloSpec.scale(index, pulse)
            val softRadius = coreRadius * SOFT_EDGE
            val tint = halo.tone.color().copy(alpha = halo.alpha)
            drawCircle(
                brush = Brush.radialGradient(
                    0f to tint,
                    SOLID_CORE to tint,
                    1f to tint.copy(alpha = 0f),
                    center = center,
                    radius = softRadius,
                ),
                radius = softRadius,
                center = center,
            )
        }
    }
}

/**
 * Le pouls des halos, de 0 (repos) à 1 (gonflé). Sous « Réduire les animations » il reste à 0 et
 * AUCUNE transition infinie n'est créée.
 */
@Composable
internal fun rememberHaloPhase(reduceMotion: Boolean = rememberAnimationsReduced()): State<Float> =
    rememberPulsePhase(
        enabled = !reduceMotion,
        durationMillis = AmbientHaloSpec.PULSE_DURATION_MILLIS,
    )

private fun AmbientHaloTone.color(): Color = when (this) {
    AmbientHaloTone.INDIGO_500 -> MeeshyPalette.Indigo500
    AmbientHaloTone.INDIGO_700 -> MeeshyPalette.Indigo700
    AmbientHaloTone.INDIGO_400 -> MeeshyPalette.Indigo400
    AmbientHaloTone.INDIGO_300 -> MeeshyPalette.Indigo300
}
