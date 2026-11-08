package me.meeshy.ui.component.audio

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.AudioPlayerChrome
import me.meeshy.sdk.model.AudioPlayerChromePlan
import me.meeshy.sdk.model.AudioTranscriptionBlock
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.TranscriptionKaraokeResolver
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

/**
 * **Le bloc de transcription sous l'onde** : change d'état en fondu — le squelette devient le texte sans saut ni action de
 * l'utilisateur (ressort 0,4 / 0,85, iOS `springDefault` du bloc). Chaque état est fourni par l'hôte ; [kind] vient de la loi
 * pure [AudioTranscriptionBlock].
 */
@Composable
internal fun AudioTranscriptionSlot(
    kind: AudioTranscriptionBlock.Kind,
    skeleton: @Composable () -> Unit,
    request: @Composable () -> Unit,
    transcript: @Composable () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    AnimatedContent(
        targetState = kind,
        transitionSpec = {
            if (reduceMotion) {
                fadeIn(tween(REDUCED_FADE_MILLIS)) togetherWith fadeOut(tween(REDUCED_FADE_MILLIS))
            } else {
                fadeIn(spring(dampingRatio = BLOCK_DAMPING, stiffness = MeeshyMotion.stiffnessForResponse(BLOCK_RESPONSE))) togetherWith
                    fadeOut(spring(dampingRatio = BLOCK_DAMPING, stiffness = MeeshyMotion.stiffnessForResponse(BLOCK_RESPONSE)))
            }
        },
        label = "audioTranscriptionBlock",
    ) { state ->
        when (state) {
            AudioTranscriptionBlock.Kind.SKELETON -> skeleton()
            AudioTranscriptionBlock.Kind.REQUEST -> request()
            AudioTranscriptionBlock.Kind.TRANSCRIPT -> transcript()
            AudioTranscriptionBlock.Kind.NONE -> Unit
        }
    }
}

/**
 * **Le texte de la transcription selon la posture du lecteur** (iOS `transcriptionBlock` / `flatTranscriptionBlock`) :
 *  - carte : le flux karaoké coupé à 255 caractères, « Voir plus » le déplie EN LIGNE ;
 *  - bande minimale : une citation plate en italique, 2 lignes, sans geste ;
 *  - bande enrichie : le flux karaoké de segments tappables coupé à ~30 mots, « Voir plus » ouvre le plein écran.
 * Les segments reçus sont déjà ceux de la langue servie par le Prisme (traduction du rang le plus haut, sinon l'original).
 */
@Composable
internal fun AudioTranscriptionText(
    segments: List<MessageTranscriptionSegment>,
    chrome: AudioPlayerChrome,
    activeIndex: Int?,
    ink: Color,
    accent: Color,
    onSeek: ((Double) -> Unit)?,
    onFullscreen: (() -> Unit)?,
    modifier: Modifier = Modifier,
    cardText: @Composable (List<MessageTranscriptionSegment>, Boolean) -> Unit,
) {
    val plan = AudioPlayerChromePlan.plan(chrome)
    when {
        chrome == AudioPlayerChrome.Card -> CardTranscription(segments, ink, modifier, cardText)
        !plan.flatTranscriptionFollowsPlayback -> FlatQuote(segments, plan.flatTranscriptionLineLimit, ink, modifier)
        else -> FocusedTranscription(segments, activeIndex, ink, accent, plan.transcriptionWordLimit, onSeek, onFullscreen, modifier)
    }
}

@Composable
private fun CardTranscription(
    segments: List<MessageTranscriptionSegment>,
    ink: Color,
    modifier: Modifier,
    cardText: @Composable (List<MessageTranscriptionSegment>, Boolean) -> Unit,
) {
    val truncates = TranscriptionKaraokeResolver.exceedsCardLimit(segments)
    var expanded by remember(segments) { mutableStateOf(false) }
    Column(modifier) {
        val shown = if (truncates && !expanded) TranscriptionKaraokeResolver.cardSegments(segments) else segments
        cardText(shown, expanded || !truncates)
        if (truncates) {
            SeeMoreButton(
                label = stringResource(R.string.media_audio_transcription_see_more),
                description = stringResource(if (expanded) R.string.audio_transcription_collapse_a11y else R.string.audio_transcription_expand_a11y),
                icon = if (expanded) MeeshyIcons.ChevronUp else MeeshyIcons.ChevronDown,
                ink = ink,
                onClick = { expanded = !expanded },
            )
        }
    }
}

@Composable
private fun FlatQuote(segments: List<MessageTranscriptionSegment>, lineLimit: Int?, ink: Color, modifier: Modifier) {
    val text = remember(segments) { flatTranscriptionQuote(segments.joinToString(" ") { it.text }) }
    Text(
        text = text,
        style = MaterialTheme.typography.bodySmall,
        fontStyle = FontStyle.Italic,
        color = ink.copy(alpha = QUOTE_ALPHA),
        maxLines = lineLimit ?: Int.MAX_VALUE,
        overflow = TextOverflow.Ellipsis,
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun FocusedTranscription(
    segments: List<MessageTranscriptionSegment>,
    activeIndex: Int?,
    ink: Color,
    accent: Color,
    wordLimit: Int?,
    onSeek: ((Double) -> Unit)?,
    onFullscreen: (() -> Unit)?,
    modifier: Modifier,
) {
    val cuts = onFullscreen != null && wordLimit != null
    val shown = if (cuts) TranscriptionKaraokeResolver.limitedSegments(segments, wordLimit!!) else segments
    val truncated = cuts && TranscriptionKaraokeResolver.exceedsWordLimit(segments, wordLimit!!)
    val haptics = rememberMeeshyHaptics()
    Column(modifier) {
        AudioKaraokeFlow(
            segments = shown,
            activeIndex = activeIndex,
            accent = accent,
            ink = ink,
            onSeek = { seconds -> onSeek?.invoke(seconds) },
            modifier = Modifier.fillMaxWidth(),
        )
        if (truncated) {
            SeeMoreButton(
                label = stringResource(R.string.media_audio_transcription_see_more),
                description = stringResource(R.string.media_audio_transcription_see_more_a11y),
                icon = MeeshyIcons.OpenInFull,
                ink = accent,
                onClick = {
                    haptics.light()
                    onFullscreen?.invoke()
                },
            )
        }
    }
}

@Composable
private fun SeeMoreButton(label: String, description: String, icon: androidx.compose.ui.graphics.vector.ImageVector, ink: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(MeeshyRadius.sm))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = description }
            .padding(vertical = MeeshySpacing.xsPlus),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        Text(text = label, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold, color = ink)
        Icon(imageVector = icon, contentDescription = null, tint = ink, modifier = Modifier.padding(start = MeeshySpacing.xs).size(12.dp))
    }
}

/** Habillage typographique de la transcription à plat : guillemets français, espaces insécables (iOS `flatTranscriptionQuote`). */
public fun flatTranscriptionQuote(text: String): String = "« $text »"

private const val BLOCK_RESPONSE = 0.4f
private const val BLOCK_DAMPING = 0.85f
private const val REDUCED_FADE_MILLIS = 150
private const val QUOTE_ALPHA = 0.6f
