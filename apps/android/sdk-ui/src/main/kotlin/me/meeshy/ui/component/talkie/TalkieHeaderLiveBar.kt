package me.meeshy.ui.component.talkie

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import me.meeshy.sdk.model.relation.TalkieHeaderChrome
import me.meeshy.sdk.model.relation.TalkieHeaderDelivery
import me.meeshy.sdk.model.relation.TalkieHeaderVoice
import me.meeshy.sdk.talkie.TalkieLevelMeter
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.AccessibilityAnnouncer
import me.meeshy.ui.theme.MeeshySpacing

public const val TALKIE_HEADER_BAR_TAG: String = "talkie.header.bar"

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
 * Le talkie élargi sur toute la barre d'en-tête (#17315) : le dégradé de la conversation, l'onde qui suit la voix en
 * direct. Il ne prend aucun toucher : le doigt qui tient le bouton dessous reste le sien, et le relâcher termine.
 */
@Composable
public fun TalkieHeaderLiveBar(live: TalkieHeaderLive, modifier: Modifier = Modifier) {
    val meter = if (live.voice == TalkieHeaderVoice.INCOMING) TalkieLevelMeter.incoming else TalkieLevelMeter.outgoing
    val view = LocalView.current
    val announcer = remember(view) { AccessibilityAnnouncer.forView(view) }
    val announcement = stringResource(R.string.talkie_header_live)
    LaunchedEffect(live.voice) {
        if (live.voice == TalkieHeaderVoice.OUTGOING) announcer.announce(announcement)
    }
    Box(
        modifier
            .clip(CircleShape)
            .background(Brush.horizontalGradient(listOf(live.accent, live.secondary)))
            .testTag(TALKIE_HEADER_BAR_TAG)
            .clearAndSetSemantics { }
            .padding(horizontal = MeeshySpacing.md, vertical = MeeshySpacing.xs),
    ) {
        TalkieHeaderWave(meter = meter, color = Color.White, modifier = Modifier.fillMaxSize())
    }
}
