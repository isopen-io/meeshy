package me.meeshy.ui.component.talkie

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.relation.TalkieHeaderBarLook
import me.meeshy.sdk.model.relation.TalkieHeaderBarMotif
import me.meeshy.sdk.model.relation.TalkieHeaderChrome
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieHeaderVoice
import me.meeshy.sdk.model.relation.TalkieWaveLaw
import me.meeshy.sdk.talkie.TalkieLevelMeter
import me.meeshy.sdk.talkie.TalkieLevelReading
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshySpacing

public const val TALKIE_HEADER_BAR_TAG: String = "talkie.header.bar"

/** Le motif dessiné par la bande, exposé aux tests sans rien dire à TalkBack (la bande lui est cachée). */
public val TalkieHeaderBarMotifKey: SemanticsPropertyKey<TalkieHeaderBarMotif> = SemanticsPropertyKey("TalkieHeaderBarMotif")

/** La taille de texte plafonnée dans la bande : le chrono et la pastille tiennent sur la barre (iOS `accessibility1`). */
private const val MAX_FONT_SCALE = 1.5f

/**
 * Ce que le bouton talkie de l'en-tête publie à la bande (#17315, iso `TalkieHeaderLive`) : la voix en cours, ce qu'elle
 * devient (direct ou gardée pour plus tard) et les couleurs de la conversation.
 */
@Immutable
public data class TalkieHeaderLive(
    val voice: TalkieHeaderVoice,
    val delivery: TalkieHeaderDelivery,
    val accent: Color,
    val secondary: Color,
) {
    val chrome: TalkieHeaderChrome get() = TalkieHeaderChrome.resolve(voice)

    public companion object {
        public val Rest: TalkieHeaderLive =
            TalkieHeaderLive(TalkieHeaderVoice.NONE, TalkieHeaderDelivery.LIVE, Color.Transparent, Color.Transparent)
    }
}

/**
 * Le talkie élargi sur toute la barre d'en-tête (#17315), et ce qu'il dit AVANT la fin (#17339) :
 * - **en direct**, un spectre miroir lumineux suit la voix à l'instant, sous une pastille « En direct » qui pulse ;
 * - **hors ligne** (réveil, ou repli en message vocal), une bande d'enregistrement défile vers une tête rouge, un point
 *   rouge clignote et le chrono tourne.
 * Il ne prend aucun toucher : le doigt qui tient le bouton dessous reste le sien, et le relâcher termine.
 */
@Composable
public fun TalkieHeaderLiveBar(
    live: TalkieHeaderLive,
    modifier: Modifier = Modifier,
    announcer: AccessibilityAnnouncer? = null,
) {
    val look = TalkieHeaderBarLook.resolve(live.delivery)
    val meter = if (live.voice == TalkieHeaderVoice.INCOMING) TalkieLevelMeter.incoming else TalkieLevelMeter.outgoing
    TalkieDeliveryAnnouncement(live, announcer)
    val density = LocalDensity.current
    val capped = Density(density.density, density.fontScale.coerceAtMost(MAX_FONT_SCALE))
    CompositionLocalProvider(LocalDensity provides capped) {
        Row(
            modifier
                .talkieGlow(live.accent.copy(alpha = look.glowAlpha), look.glowRadiusDp)
                .talkieBarBackground(live.accent, live.secondary, look)
                .clearAndSetSemantics {
                    testTag = TALKIE_HEADER_BAR_TAG
                    set(TalkieHeaderBarMotifKey, look.motif)
                }
                .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
        ) {
            TalkieDeliveryBadge(live.delivery, live.voice, look)
            TalkieBarMotif(look.motif, meter, Modifier.weight(1f).fillMaxHeight())
            TalkieElapsedClock()
        }
    }
}

private fun Modifier.talkieGlow(glow: Color, radiusDp: Float): Modifier =
    shadow(radiusDp.dp, CircleShape, clip = false, ambientColor = glow, spotColor = glow)

/** Le spectre en direct, la bande hors ligne ; le passage de l'un à l'autre se voit, sauf animations réduites. */
@Composable
private fun TalkieBarMotif(motif: TalkieHeaderBarMotif, meter: TalkieLevelReading, modifier: Modifier) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedContent(
        targetState = motif,
        modifier = modifier,
        transitionSpec = {
            when {
                reduceMotion -> EnterTransition.None togetherWith ExitTransition.None
                targetState == TalkieHeaderBarMotif.SPECTRUM -> (fadeIn() + scaleIn(initialScale = 0.6f)) togetherWith fadeOut()
                else -> (fadeIn() + slideInHorizontally { it }) togetherWith fadeOut()
            }
        },
        label = "talkie-motif",
    ) { shown ->
        Box(Modifier.fillMaxHeight(), contentAlignment = Alignment.Center) {
            when (shown) {
                TalkieHeaderBarMotif.SPECTRUM -> TalkieLiveSpectrum(meter)
                TalkieHeaderBarMotif.TAPE -> TalkieRecordingTape(meter)
            }
        }
    }
}

/** Le chrono `m:ss` de la prise ; il ne recompose que lui-même, une fois par seconde. */
@Composable
private fun TalkieElapsedClock() {
    var seconds by remember { mutableLongStateOf(0L) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1_000L)
            seconds += 1
        }
    }
    Text(
        text = TalkieWaveLaw.elapsed(seconds.toDouble()),
        style = MaterialTheme.typography.labelMedium.copy(fontFeatureSettings = "tnum"),
        fontWeight = FontWeight.SemiBold,
        color = Color.White.copy(alpha = 0.92f),
        maxLines = 1,
        softWrap = false,
        textAlign = TextAlign.End,
    )
}

/** La voix qui part dit à TalkBack ce qu'elle devient, à l'apparition puis à chaque changement de mode. */
@Composable
private fun TalkieDeliveryAnnouncement(live: TalkieHeaderLive, injected: AccessibilityAnnouncer?) {
    val view = LocalView.current
    val context = LocalContext.current
    val announcer = remember(view, injected) { injected ?: AccessibilityAnnouncer.forView(view) }
    LaunchedEffect(live.voice, live.delivery) {
        if (TalkieHeaderBarLook.announces(live.voice)) {
            announcer.announce(context.getString(TalkieWording.announcement(live.delivery)))
        }
    }
}
