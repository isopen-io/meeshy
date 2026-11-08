package me.meeshy.app.conversations

import android.os.Build
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.preview.PreviewEffect
import me.meeshy.sdk.model.preview.PreviewEntrance
import me.meeshy.sdk.model.preview.PreviewFinish
import me.meeshy.sdk.model.preview.shouldPlayEntrance
import me.meeshy.sdk.model.text.RainbowLetters
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.rememberPowerSaver
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.hexColor

/*
 * Le RENDU de l'effet appliqué à la ligne 2 (#16975), sous la loi d'énergie du composeur partagé :
 * le voile et le fini sont FIGÉS (aucune transition infinie dans une liste), l'apparition se joue
 * une fois, en `graphicsLayer` seul, quand le dernier message change sur une rangée composée.
 * La décision (quel effet, faut-il jouer) est pure et testée dans `:core:model`
 * (`previewEffectOf`, `shouldPlayEntrance`) ; ce fichier est de la colle Compose.
 */

private const val SHAKE_MS = 360
private const val POP_MS = 280
private const val POP_SCALE = 1.06f
private const val SHAKE_DP = 3f
private const val GLOW_BLUR = 10f
private const val GLOW_ALPHA = 0.75f
private const val VEIL_ALPHA = 0.28f

/** Ce que l'id de la rangée a déjà montré : vit dans l'item, donc repart à l'id courant au recyclage. */
private class ShownMessage(var id: String?)

/**
 * L'apparition de [entrance], jouée UNE fois quand [messageId] change pendant que la rangée est
 * composée — jamais au premier rendu (le témoin démarre à l'id courant), ni au recyclage de la liste
 * (l'item recyclé se recompose avec un `remember` neuf), ni sous « réduire les animations » ou en
 * économie d'énergie.
 */
@Composable
internal fun rememberPreviewEntrance(messageId: String?, entrance: PreviewEntrance?): Modifier {
    val reduceMotion = LocalReduceMotion.current
    val powerSave = rememberPowerSaver()
    val shakePx = with(LocalDensity.current) { SHAKE_DP.dp.toPx() }
    val shown = remember { ShownMessage(messageId) }
    val shift = remember { Animatable(0f) }
    val scale = remember { Animatable(1f) }
    LaunchedEffect(messageId) {
        val previous = shown.id
        shown.id = messageId
        if (entrance == null || !shouldPlayEntrance(previous, messageId, reduceMotion, powerSave)) return@LaunchedEffect
        when (entrance) {
            PreviewEntrance.SHAKE -> shift.animateTo(
                targetValue = 0f,
                animationSpec = keyframes {
                    durationMillis = minOf(SHAKE_MS, PreviewEffect.ENTRANCE_MAX_MS)
                    -shakePx at 72
                    shakePx at 162
                    -shakePx * 0.66f at 252
                },
            )
            PreviewEntrance.POP -> scale.animateTo(
                targetValue = 1f,
                animationSpec = keyframes {
                    durationMillis = minOf(POP_MS, PreviewEffect.ENTRANCE_MAX_MS)
                    POP_SCALE at 126
                },
            )
        }
    }
    return Modifier.graphicsLayer {
        translationX = shift.value
        scaleX = scale.value
        scaleY = scale.value
    }
}

/** Le style FIGÉ du texte : lueur = ombre statique à l'accent, arc-en-ciel = dégradé statique. */
internal fun TextStyle.withPreviewFinish(finish: PreviewFinish?, accent: Color, isDark: Boolean): TextStyle = when (finish) {
    PreviewFinish.GLOW -> copy(shadow = Shadow(color = accent.copy(alpha = GLOW_ALPHA), offset = Offset.Zero, blurRadius = GLOW_BLUR))
    PreviewFinish.RAINBOW -> copy(brush = Brush.linearGradient(RainbowLetters.paletteHex(isDark).map { hexColor(it) }))
    PreviewFinish.PULSE, PreviewFinish.SPARKLE, null -> this
}

/** La marque de tête d'un fini : ✨ teintée accent (paillettes), pastille accent fixe (pulsation). */
@Composable
internal fun PreviewFinishMark(finish: PreviewFinish?, accent: Color) {
    when (finish) {
        PreviewFinish.SPARKLE -> Icon(
            imageVector = Icons.Filled.AutoAwesome,
            contentDescription = null,
            tint = accent,
            modifier = Modifier
                .padding(end = MeeshySpacing.xs)
                .size(14.dp),
        )
        PreviewFinish.PULSE -> Box(
            modifier = Modifier
                .padding(end = MeeshySpacing.xs)
                .size(7.dp)
                .background(accent, CircleShape),
        )
        PreviewFinish.GLOW, PreviewFinish.RAINBOW, null -> Unit
    }
}

/**
 * Le substitut voilé d'un message flouté : des barres, AUCUN caractère. La teinte translucide suffit
 * seule sous l'API 31 (où `Modifier.blur` est sans effet) ; au-dessus, le flou adoucit les bords.
 * Aucune sémantique : TalkBack lit le libellé de la rangée, inchangé.
 */
@Composable
internal fun PreviewVeil(color: Color, modifier: Modifier = Modifier) {
    val soften = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Modifier.blur(2.dp) else Modifier
    Row(
        modifier = modifier.then(soften),
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        listOf(72.dp, 44.dp, 28.dp).forEach { barWidth ->
            Box(
                modifier = Modifier
                    .width(barWidth)
                    .height(8.dp)
                    .background(color.copy(alpha = VEIL_ALPHA), RoundedCornerShape(4.dp)),
            )
        }
    }
}
