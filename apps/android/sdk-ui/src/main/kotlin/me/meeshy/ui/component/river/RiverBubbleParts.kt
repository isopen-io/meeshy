package me.meeshy.ui.component.river

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.sp
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleStoryReply
import me.meeshy.ui.component.bubble.StoryReplyPreview
import me.meeshy.ui.component.bubble.hasRenderedAttachments
import me.meeshy.ui.component.bubble.largeEmojiTextStyle
import me.meeshy.ui.component.focal.FocalAttachmentBlock
import me.meeshy.ui.component.focal.FocalStoryCitationQuote

/** Ce message porte au moins une pièce que le corps rend (photos, fichiers, lieux, vocaux, pièces scellées). */
public val BubbleContent.riverRendersAttachments: Boolean
    get() = hasRenderedAttachments

/**
 * Les pièces d'une bulle de la Rivière — les MÊMES atomes que la rangée plate du fil (grille
 * visuelle puis blocs non-média), jamais une seconde version. La protection du message est posée par
 * l'appelant ; chaque case porte la sienne.
 */
@Composable
public fun RiverAttachmentBlock(
    content: BubbleContent,
    ink: Color,
    callbacks: BubbleCallbacks,
    audioPlayback: BubbleAudioPlayback?,
    accentColor: Color,
) {
    FocalAttachmentBlock(content, ink, callbacks, audioPlayback, accentColor)
}

/** La story citée : une humeur reste une ligne, une scène est rendue en carte (comme la rangée plate). */
@Composable
public fun RiverStoryCitation(
    story: BubbleStoryReply,
    accentColor: Color,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    if (story.isMood) {
        StoryReplyPreview(story = story, accentColor = accentColor, modifier = modifier)
    } else {
        FocalStoryCitationQuote(story = story, railColor = accentColor, accentColor = accentColor, onOpen = onOpen, modifier = modifier)
    }
}

/** Un emoji envoyé SEUL, agrandi (×4 / ×3 / ×2 selon leur nombre, iOS `MeeshyFont.emoji`) — la taille vient de `EmojiDetector`. */
@Composable
public fun RiverEmojiText(text: String, fontSizeSp: Int, modifier: Modifier = Modifier) {
    Text(text = text.trim(), style = largeEmojiTextStyle(fontSizeSp.sp), modifier = modifier)
}
