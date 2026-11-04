package me.meeshy.ui.component.focal

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.reading.focal.FocalAttachmentShape
import me.meeshy.sdk.model.reading.focal.FocalAudioMode
import me.meeshy.sdk.model.reading.focal.FocalAudioRouting
import me.meeshy.sdk.model.reading.focal.FocalAudioRoutingInput
import me.meeshy.ui.R
import me.meeshy.ui.component.audio.AudioConsentNotice
import me.meeshy.ui.component.bubble.AudioBubble
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFooterBuilder
import me.meeshy.sdk.model.AudioTranscriptionReveal
import me.meeshy.ui.component.bubble.LocalAutoRevealTranscription
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les faits du routage audio d'une rangée (iOS `FocalAudioRouting.mode(for:)`) : la forme des pièces, le nombre de
 * pistes, la citation et le texte. Un audio PUR dont le texte est sa transcription n'a PAS de « texte ou pièce
 * non-média » — il reste « seul avec pied » ; seul le mixte (audio avec fichier, lieu ou visuel) en porte.
 */
internal fun BubbleContent.focalAudioInput(): FocalAudioRoutingInput {
    val visualCount = images.size + videos.size
    val nonMediaCount = files.count { f -> videos.none { it.attachmentId == f.attachmentId } } + locations.size + sealedPieceIds.size
    val shape = when {
        audios.isEmpty() -> FocalAttachmentShape.None
        visualCount == 0 && nonMediaCount == 0 -> FocalAttachmentShape.Audio
        else -> FocalAttachmentShape.Mixed
    }
    return FocalAudioRoutingInput(
        shape = shape,
        audioCount = audios.size,
        visualCount = visualCount,
        isEmojiOnly = BubbleFooterBuilder.isEmojiOnly(this),
        hasTextOrNonMediaContent = shape != FocalAttachmentShape.Audio && (text.isNotBlank() || nonMediaCount > 0),
        hasReply = replyToText != null || replyToDeleted,
    )
}

internal fun BubbleContent.focalAudioMode(): FocalAudioMode = FocalAudioRouting.mode(focalAudioInput())

/** Le consentement vocal manquant ne se propose que sous un message qui porte un audio (jamais seul). */
internal fun BubbleContent.showsVoiceConsentNotice(): Boolean = voiceConsentMissing && audios.isNotEmpty()

/**
 * Le bloc audio de la rangée plate (iOS `FocalAudioBlock`), à la colonne du nom : une PILE de plusieurs pistes se
 * feuillette en carrousel, tout autre mode pose les lecteurs l'un sous l'autre — la citation et la légende restent
 * rendues par la rangée, jamais dupliquées. Les pistes traduites et la transcription arrivent déjà élues par le Prisme
 * dans chaque [BubbleAudio] ; l'avis de consentement vocal est cliquable.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FocalAudioBlock(
    content: BubbleContent,
    onColor: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    modifier: Modifier = Modifier,
    accentColor: Color = Color.Unspecified,
) {
    val mode = remember(content.audios, content.images, content.videos, content.files, content.locations, content.text, content.replyToText) {
        content.focalAudioMode()
    }
    if (mode == FocalAudioMode.None) return
    val autoReveal = AudioTranscriptionReveal.autoReveals(content.isOutgoing, LocalAutoRevealTranscription.current)
    val player: @Composable (BubbleAudio, Modifier) -> Unit = { audio, itemModifier ->
        AudioBubble(
            audio = audio,
            playback = audioPlayback?.takeIf { it.attachmentId == audio.attachmentId },
            onColor = onColor,
            autoRevealTranscription = autoReveal,
            onClick = callbacks.onAudioClick?.takeIf { audio.isPlayable }?.let { click -> { click(audio) } },
            onSeek = callbacks.onAudioSeek?.let { seek -> { seconds: Double -> seek(audio, seconds) } },
            modifier = itemModifier,
        )
    }
    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
        if (mode == FocalAudioMode.Stack) {
            val pager = rememberPagerState(pageCount = { content.audios.size })
            HorizontalPager(state = pager, key = { content.audios[it].attachmentId }, pageSpacing = MeeshySpacing.sm) { page ->
                player(content.audios[page], Modifier.fillMaxWidth())
            }
            Row(Modifier.align(Alignment.CenterHorizontally), horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs)) {
                repeat(content.audios.size) { index ->
                    Box(
                        Modifier.size(6.dp).clip(CircleShape)
                            .background(onColor.copy(alpha = if (index == pager.currentPage) 0.9f else 0.3f)),
                    )
                }
            }
        } else {
            content.audios.forEach { audio -> player(audio, Modifier) }
        }
        if (content.showsVoiceConsentNotice()) {
            AudioConsentNotice(
                message = stringResource(R.string.audio_consent_notice_message),
                actionTitle = stringResource(R.string.audio_consent_notice_action),
                accentHex = "#%06X".format(accentColor.takeIf { it != Color.Unspecified }.let { it ?: MeeshyTheme.tokens.textSecondary }.toArgb() and 0xFFFFFF),
                onTap = callbacks.onTapConsentNotice ?: {},
                modifier = Modifier.padding(top = MeeshySpacing.xs),
            )
        }
    }
}
