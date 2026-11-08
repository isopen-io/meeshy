package me.meeshy.ui.component.bubble

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.MessageSticker
import me.meeshy.sdk.model.StickerPicture
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14345 — la bulle d'un sticker reçu redessine le sticker (iOS `BubbleSticker`), jamais la photo de son repli. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleStickerRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun content(sticker: MessageSticker) = BubbleContent(
        messageId = "m1",
        text = "",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = "Ada",
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = "2026-11-02T10:00:00Z",
        images = listOf(BubbleImage(attachmentId = "a1", url = "https://cdn/s.png", alt = "photo-de-repli")),
        sticker = BubbleStickerSpec(sticker, StickerPicture("https://cdn/s.png")),
    )

    @Test
    fun `un Instant recu se redessine avec ses mots, sans la grille d'images`() {
        val instant = MessageSticker(templateId = "mee.instant-bonjour", slots = mapOf("message" to "Coucou"), emoji = "🌅")
        compose.setContent { MeeshyTheme { MessageBubble(content = content(instant)) } }
        compose.onNodeWithContentDescription("Bonjour — Coucou").assertExists()
        compose.onNodeWithContentDescription("photo-de-repli").assertDoesNotExist()
    }

    @Test
    fun `un film de Mee recu se dit par son titre`() {
        compose.setContent { MeeshyTheme { MessageBubble(content = content(MessageSticker(templateId = "mee.mee-coucou"))) } }
        compose.onNodeWithContentDescription("photo-de-repli").assertDoesNotExist()
        compose.onNodeWithContentDescription(me.meeshy.sdk.model.sticker.MeeStickerCatalog.stickerById("mee-coucou")!!.title).assertExists()
    }
}
