package me.meeshy.ui.component.bubble

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.ui.sticker.MessageStickerArtwork
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Un sticker de conversation, SANS chrome de bulle (#14345, iOS `BubbleSticker`) : ni fond, ni coin, ni bordure — le
 * sticker EST le message, comme un emoji libre. Son dessin ([MessageStickerArtwork]) et la méta-ligne compacte (heure,
 * coche) forment un bloc posé sur la même base, collé au bord de l'auteur ; l'appui long ouvre le menu du message.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun BubbleStickerBody(content: BubbleContent, sticker: BubbleStickerSpec, onLongPress: (() -> Unit)?) {
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xsPlus),
        modifier = if (onLongPress == null) Modifier else Modifier.combinedClickable(onClick = {}, onLongClick = onLongPress),
    ) {
        MessageStickerArtwork(sticker)
        BubbleMetaTrailing(content = content, metaColor = MeeshyTheme.tokens.textMuted)
    }
}
