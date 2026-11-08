package me.meeshy.app.talkie

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.app.R
import me.meeshy.app.startup.AppOverlay
import me.meeshy.sdk.model.relation.TalkieSpeaker
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

internal const val TALKIE_INDICATOR_TAG = "talkie.incoming"
internal const val TALKIE_MUTE_TAG = "talkie.incoming.mute"

private const val PULSE_MS = 600

/**
 * L'indicateur d'un talkie reçu (#16675, iso `TalkieIndicator.swift`) : qui parle, et UN geste pour le faire taire ICI.
 * NON MODAL — le Bring prend l'écran, le talkie jamais : il se pose en haut, sous la barre d'état, et l'app reste
 * utilisable dessous. TalkBack l'annonce.
 */
class TalkieOverlay @Inject constructor(
    private val center: TalkieCenter,
) : AppOverlay {
    override val order: Int = 700

    @Composable
    override fun Content(navController: NavHostController) {
        val floor by center.floor.collectAsStateWithLifecycle()
        TalkieIndicatorHost(speaker = floor.active.firstOrNull(), onMute = center::mute)
    }
}

/** La dernière prise de parole montrée, gardée le temps que l'indicateur sorte de l'écran. */
private class LastShown(var speaker: TalkieSpeaker? = null)

@Composable
internal fun TalkieIndicatorHost(speaker: TalkieSpeaker?, onMute: (String) -> Unit) {
    val last = remember { LastShown() }
    if (speaker != null) last.speaker = speaker
    Box(modifier = Modifier.fillMaxWidth().statusBarsPadding(), contentAlignment = Alignment.TopCenter) {
        AnimatedVisibility(
            visible = speaker != null,
            enter = slideInVertically { -it } + fadeIn(),
            exit = slideOutVertically { -it } + fadeOut(),
        ) {
            val shown = last.speaker ?: return@AnimatedVisibility
            TalkieIndicator(speaker = shown, onMute = { onMute(shown.talkieId) })
        }
    }
}

@Composable
internal fun TalkieIndicator(speaker: TalkieSpeaker, onMute: () -> Unit) {
    val tokens = MeeshyTheme.tokens
    val name = speaker.name ?: stringResource(R.string.talkie_incoming_someone)
    val title = stringResource(R.string.talkie_incoming_title, name)
    val muteLabel = stringResource(R.string.talkie_incoming_mute_named, name)
    val pulse = if (LocalReduceMotion.current) {
        1f
    } else {
        val transition = rememberInfiniteTransition(label = "talkie-pulse")
        val alpha by transition.animateFloat(
            initialValue = 1f,
            targetValue = 0.45f,
            animationSpec = infiniteRepeatable(tween(PULSE_MS), RepeatMode.Reverse),
            label = "talkie-pulse-alpha",
        )
        alpha
    }
    Row(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .widthIn(max = 480.dp)
            .fillMaxWidth()
            .clip(CircleShape)
            .background(tokens.backgroundSecondary)
            .padding(start = 16.dp, end = 4.dp)
            .heightIn(min = 48.dp)
            .semantics { liveRegion = LiveRegionMode.Polite }
            .testTag(TALKIE_INDICATOR_TAG),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.GraphicEq,
            contentDescription = null,
            tint = MeeshyPalette.Indigo500,
            modifier = Modifier.alpha(pulse),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = tokens.textPrimary,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        TextButton(
            onClick = onMute,
            modifier = Modifier
                .heightIn(min = 48.dp)
                .widthIn(min = 48.dp)
                .semantics { contentDescription = muteLabel }
                .testTag(TALKIE_MUTE_TAG),
        ) {
            Text(
                text = stringResource(R.string.talkie_incoming_mute),
                fontWeight = FontWeight.Bold,
                color = MeeshyPalette.Indigo500,
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface TalkieOverlayModule {
    @Binds
    @IntoSet
    fun bind(overlay: TalkieOverlay): AppOverlay
}
