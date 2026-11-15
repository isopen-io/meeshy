package me.meeshy.ui.component.bubble

import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerBoxLaw
import me.meeshy.sdk.model.StickerPicture
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import me.meeshy.sdk.model.sticker.MeeStickerCatalog
import me.meeshy.ui.component.game.MeeFigureBleedsKey
import me.meeshy.ui.sticker.MessageStickerArtwork
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14534 — un sticker se DESSINE dans chaque mode de lecture, jamais comme une photo, et rien ne le rogne. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReadingStickerRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private val meeTitle = MeeStickerCatalog.stickerById("mee-coucou")!!.title

    private fun content(sticker: MessageSticker, deleted: Boolean = false, outgoing: Boolean = false) = BubbleContent(
        messageId = "m1",
        text = sticker.emoji.orEmpty(),
        isOutgoing = outgoing,
        isTranslated = false,
        originalText = null,
        senderName = "Ada",
        showSenderName = false,
        isEdited = false,
        isDeleted = deleted,
        createdAtIso = "2026-11-02T10:00:00Z",
        images = listOf(BubbleImage(attachmentId = "a1", url = "https://cdn/s.png", alt = "photo-de-repli")),
        sticker = BubbleStickerSpec(sticker, StickerPicture("https://cdn/s.png")),
        isFirstInGroup = true,
    )

    private fun flat(content: BubbleContent) = compose.setContent {
        MeeshyTheme { FocalFlatRow(content = content, accentColor = Color.Blue) }
    }

    @Test
    fun `en Script et en Focal un film de Mee se dessine a la place de sa photo de repli`() {
        flat(content(MessageSticker(templateId = "mee.mee-coucou")))
        compose.onNodeWithContentDescription(meeTitle, useUnmergedTree = true).assertExists()
        compose.onNodeWithContentDescription("photo-de-repli", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `en Script et en Focal un emoji-sticker se dessine en grand, sans la photo jointe`() {
        flat(content(MessageSticker(emoji = "🥳")))
        compose.onNodeWithContentDescription("🥳", useUnmergedTree = true).assertExists()
        compose.onNodeWithContentDescription("photo-de-repli", useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    fun `en Script et en Focal le film prend le cote de la rangee, marge de debordement comprise`() {
        flat(content(MessageSticker(templateId = "mee.mee-coucou")))
        val bounds = compose.onNodeWithContentDescription(meeTitle, useUnmergedTree = true).getUnclippedBoundsInRoot()
        val side = FocalMetrics.Sticker.SIDE.toFloat()
        assertThat((bounds.right - bounds.left).value).isWithin(0.5f).of(StickerBoxLaw.filmFootprint(side))
    }

    @Test
    fun `un message supprime ne dessine aucun sticker`() {
        assertThat(content(MessageSticker(templateId = "mee.mee-coucou"), deleted = true).drawnSticker).isNull()
        assertThat(content(MessageSticker(templateId = "mee.mee-coucou")).drawnSticker).isNotNull()
    }

    @Test
    fun `un film de Mee dessine hors de son carre dans une boite qui lui reserve sa marge`() {
        val spec = BubbleStickerSpec(MessageSticker(templateId = "mee.mee-coucou"), null)
        compose.setContent { MeeshyTheme { MessageStickerArtwork(spec, Modifier.testTag("art")) } }
        val box = compose.onNodeWithTag("art").getUnclippedBoundsInRoot()
        val film = compose.onNode(SemanticsMatcher.expectValue(MeeFigureBleedsKey, true), useUnmergedTree = true)
        val filmBox = film.getUnclippedBoundsInRoot()
        val side = StickerBoxLaw.SIDE_DP
        val bleed = StickerBoxLaw.filmBleed(side)
        assertThat((filmBox.right - filmBox.left).value).isWithin(0.5f).of(side)
        assertThat((filmBox.left - box.left).value).isWithin(0.5f).of(bleed)
        assertThat((box.bottom - filmBox.bottom).value).isWithin(0.5f).of(bleed)
    }

    @Test
    fun `en Bulles le film garde lui aussi sa marge de debordement`() {
        compose.setContent { MeeshyTheme { MessageBubble(content = content(MessageSticker(templateId = "mee.mee-coucou"))) } }
        val bounds = compose.onNodeWithContentDescription(meeTitle, useUnmergedTree = true).getUnclippedBoundsInRoot()
        assertThat((bounds.bottom - bounds.top).value).isWithin(0.5f).of(StickerBoxLaw.filmFootprint())
    }
}
