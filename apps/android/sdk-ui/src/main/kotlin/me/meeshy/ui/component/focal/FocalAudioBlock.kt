package me.meeshy.ui.component.focal

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import me.meeshy.sdk.model.reading.focal.FocalAttachmentShape
import me.meeshy.sdk.model.reading.focal.FocalAudioMode
import me.meeshy.sdk.model.reading.focal.FocalAudioRouting
import me.meeshy.sdk.model.reading.focal.FocalAudioRoutingInput
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleAudioStack
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFooterBuilder
import me.meeshy.sdk.model.AudioTranscriptionReveal
import me.meeshy.ui.component.bubble.LocalAutoRevealTranscription
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

/**
 * Le bloc audio de la rangée plate (iOS `FocalAudioBlock`), à la colonne du nom : les lecteurs se posent l'un sous
 * l'autre ([BubbleAudioStack], plus de carrousel depuis #10654) — la citation et la légende restent
 * rendues par la rangée, jamais dupliquées. Les pistes traduites et la transcription arrivent déjà élues par le Prisme
 * dans chaque [BubbleAudio] ; l'avis de consentement vocal est cliquable.
 */
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
    BubbleAudioStack(
        content = content,
        playback = audioPlayback,
        onColor = onColor,
        accent = accentColor.takeIf { it != Color.Unspecified } ?: MeeshyTheme.tokens.textSecondary,
        callbacks = callbacks,
        autoRevealTranscription = autoReveal,
        modifier = modifier,
    )
}
