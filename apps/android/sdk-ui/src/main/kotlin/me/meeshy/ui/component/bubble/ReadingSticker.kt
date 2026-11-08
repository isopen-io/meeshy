package me.meeshy.ui.component.bubble

import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.StickerBoxLaw

/**
 * **Le sticker que ce message DESSINE, dans tout mode de lecture** (#14534) — Bulles, Script, Focal et Rivière posent
 * le même [me.meeshy.ui.sticker.MessageStickerArtwork] sur cette seule réponse, comme iOS `FocalRow.stickerBlock` et
 * `BubbleSticker` : le message-sticker n'est jamais rendu par sa photo de repli ni par l'emoji de son gabarit. Un
 * message supprimé ne dessine rien ; `null` ⇒ le mode garde son rendu habituel.
 */
public val BubbleContent.drawnSticker: BubbleStickerSpec?
    get() = sticker?.takeUnless { isDeleted }

/**
 * Le style d'un emoji en grand de corps [fontSize] (emoji libre, emoji seul de la rangée plate, emoji-sticker) : sans la
 * réserve de police d'Android, sur une ligne de [StickerBoxLaw.EMOJI_LINE_HEIGHT_RATIO] fois le corps, glyphe centré.
 * L'encre d'un emoji couleur (🥳, 🤯) dépasse les métriques de sa police : une ligne rognée à ces métriques le coupait
 * d'un à deux pixels en haut et en bas (mesuré, #14534) ; la ligne lui donne sa place, sans rétrécir le glyphe.
 */
internal fun largeEmojiTextStyle(fontSize: TextUnit): TextStyle = TextStyle(
    fontSize = fontSize,
    lineHeight = fontSize * StickerBoxLaw.EMOJI_LINE_HEIGHT_RATIO,
    platformStyle = PlatformTextStyle(includeFontPadding = false),
    lineHeightStyle = LineHeightStyle(
        alignment = LineHeightStyle.Alignment.Center,
        trim = LineHeightStyle.Trim.None,
    ),
)
