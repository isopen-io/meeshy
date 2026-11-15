package me.meeshy.app.chat.export

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleFile
import me.meeshy.ui.component.bubble.BubbleImage
import org.junit.Test

/** #14330 — la carte d'« Imager » peint les photos et les vidéos d'un message, sous la réponse, sans jamais écraser le texte. */
class CardMediaTest {

    private val now = 1_800_000_000_000L
    private val viewer = CardViewer(id = "me", displayName = "Moi", username = "moi")
    private val measure: CardMeasure = { text, font -> text.length * font.size * 0.5 }

    private fun photo(id: String = "a1", width: Int? = 800, height: Int? = 600) =
        BubbleImage(attachmentId = id, url = "https://cdn.test/$id.jpg", width = width, height = height)

    private val video = BubbleFile(
        attachmentId = "v1", name = "v.mp4", url = "https://cdn.test/v1.mp4", isVideo = true,
        thumbnailUrl = "https://cdn.test/v1.jpg", width = 1080, height = 1920,
    )

    private fun bubble(text: String = "", images: List<BubbleImage> = emptyList(), files: List<BubbleFile> = emptyList()) = BubbleContent(
        messageId = "507f1f77bcf86cd799439011", text = text, isOutgoing = false, isTranslated = false, originalText = null,
        senderName = "Awa", showSenderName = true, isEdited = false, isDeleted = false, createdAtIso = "2026-10-27T10:00:00.000Z",
        images = images, files = files,
    )

    private fun media(id: String, aspect: Double? = 1.0) = CardMedia(id, CardMediaKind.IMAGE, "https://cdn.test/$id.jpg", aspect = aspect)

    @Test
    fun `a photo and a video become the media of the card, the video by its poster`() {
        val subject = requireNotNull(CardSubjects.of(bubble(images = listOf(photo()), files = listOf(video)), viewer, now))

        assertThat(subject.reply.text).isEmpty()
        assertThat(subject.media).containsExactly(
            CardMedia("a1", CardMediaKind.IMAGE, "https://cdn.test/a1.jpg", aspect = 800.0 / 600),
            CardMedia("v1", CardMediaKind.VIDEO, "https://cdn.test/v1.mp4", posterUrl = "https://cdn.test/v1.jpg", aspect = 1080.0 / 1920),
        ).inOrder()
    }

    @Test
    fun `a protected piece refuses the whole message and an empty message stays refused`() {
        assertThat(CardSubjects.refusal(bubble(text = "texte", images = listOf(photo().copy(isProtected = true))), now)).isEqualTo(CardRefusal.PROTECTED)
        assertThat(CardSubjects.refusal(bubble(), now)).isEqualTo(CardRefusal.EMPTY)
        assertThat(CardSubjects.refusal(bubble(images = listOf(photo())), now)).isNull()
    }

    @Test
    fun `a lone visual keeps its ratio and never takes more than its share of the card`() {
        val wide = CardMediaLayout.plan(listOf(media("w", aspect = 2.0)), columnWidth = 888.0, budget = 1648.0)
        assertThat(wide.tiles.single().width).isEqualTo(888.0)
        assertThat(wide.height).isEqualTo(444.0)

        val tall = CardMediaLayout.plan(listOf(media("t", aspect = 0.5)), columnWidth = 888.0, budget = 1648.0)
        assertThat(tall.height).isWithin(1e-9).of(1648.0 * CardMediaLayout.VISUAL_SHARE)
        assertThat(tall.tiles.single().width).isWithin(1e-9).of(tall.height * 0.5)
        assertThat(tall.tiles.single().x).isWithin(1e-9).of((888.0 - tall.tiles.single().width) / 2)
    }

    @Test
    fun `two visuals sit side by side and five fill a grid of four that counts the hidden one`() {
        val pair = CardMediaLayout.plan(listOf(media("a"), media("b")), columnWidth = 888.0, budget = 1648.0)
        assertThat(pair.tiles.map { it.y }).containsExactly(0.0, 0.0)
        assertThat(pair.tiles[1].x).isGreaterThan(pair.tiles[0].x + pair.tiles[0].width)

        val grid = CardMediaLayout.plan((1..5).map { media("m$it") }, columnWidth = 888.0, budget = 1648.0)
        assertThat(grid.tiles).hasSize(4)
        assertThat(grid.tiles.last().overflow).isEqualTo(1)
        assertThat(grid.height).isAtMost(1648.0 * CardMediaLayout.VISUAL_SHARE)
    }

    @Test
    fun `the card paints its media under the reply and grows to hold them`() {
        val text = CardInput(quoted = null, reply = CardPart("Awa", "Bonjour"), template = CardTemplates.defaultId, handle = "moi")
        val withPhoto = text.copy(media = listOf(media("a1", aspect = 4.0 / 3)))

        val bare = CardLayoutEngine.layout(text, measure)
        val painted = CardLayoutEngine.layout(withPhoto, measure)

        val picture = painted.ops.filterIsInstance<CardOp.Picture>().single()
        val reply = painted.regions.first { it.part == CardPartId.REPLY }
        assertThat(picture.media.id).isEqualTo("a1")
        assertThat(picture.y).isAtLeast(reply.y + reply.height)
        assertThat(picture.y + picture.height).isAtMost(painted.height)
        assertThat(painted.height).isGreaterThan(bare.height)
        assertThat(bare.ops.filterIsInstance<CardOp.Picture>()).isEmpty()
    }

    @Test
    fun `a card of a photo alone paints the author and the photo, no empty text line`() {
        val input = CardInput(quoted = null, reply = CardPart("Awa", ""), template = CardTemplates.defaultId, handle = "moi", media = listOf(media("a1")))

        val card = CardLayoutEngine.layout(input, measure)

        assertThat(card.ops.filterIsInstance<CardOp.Picture>()).hasSize(1)
        assertThat(card.ops.filterIsInstance<CardOp.Text>().map { it.text }).containsExactly("Awa")
    }
}
