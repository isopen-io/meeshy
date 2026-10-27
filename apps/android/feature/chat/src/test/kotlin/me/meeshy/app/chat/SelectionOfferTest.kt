package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import org.junit.Test

class SelectionOfferTest {

    private val viewOnceExit = MessageExitOffer(
        law = ContentExitLaw.of(ContentExitLaw.Subject(isViewOnce = true)),
        holdsBlur = false,
        isEncrypted = false,
    )

    private fun bubble(
        id: String,
        text: String = "texte $id",
        isOutgoing: Boolean = false,
        isStarred: Boolean = false,
        status: DeliveryStatus = DeliveryStatus.Sent,
        exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
        sealed: Boolean = false,
    ) = BubbleContent(
        messageId = id,
        text = text,
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        deliveryStatus = status,
        isStarred = isStarred,
        exitOffer = exitOffer,
        isEndToEndSealed = sealed,
    )

    private fun offer(vararg bubbles: BubbleContent) = SelectionOffer.of(bubbles.toList(), canWrite = true, nowMillis = 0)

    @Test
    fun `an empty selection offers nothing`() {
        assertThat(offer()).isEqualTo(SelectionOffer.None)
    }

    @Test
    fun `forward is offered as soon as ONE message may leave Meeshy`() {
        assertThat(offer(bubble("m1", exitOffer = viewOnceExit), bubble("m2")).forward).isTrue()
        assertThat(offer(bubble("m1", exitOffer = viewOnceExit)).forward).isFalse()
    }

    @Test
    fun `a sealed or unconfirmed message is never forwarded`() {
        assertThat(offer(bubble("m1", sealed = true)).forward).isFalse()
        assertThat(offer(bubble("cid_1")).forward).isFalse()
    }

    @Test
    fun `delete for everyone needs EVERY message to be mine`() {
        assertThat(offer(bubble("m1", isOutgoing = true), bubble("m2", isOutgoing = true)).deleteForEveryone).isTrue()
        assertThat(offer(bubble("m1", isOutgoing = true), bubble("m2")).deleteForEveryone).isFalse()
    }

    @Test
    fun `delete for me is offered when one message admits it, never for a failed send alone`() {
        assertThat(offer(bubble("m1")).deleteForMe).isTrue()
        assertThat(offer(bubble("m1", isOutgoing = true, status = DeliveryStatus.Failed)).deleteForMe).isFalse()
    }

    @Test
    fun `copy gathers the copyable texts in thread order and skips what the law keeps in`() {
        val bubbles = listOf(bubble("m1", text = "un"), bubble("m2", text = "deux", sealed = true), bubble("m3", text = "trois"))
        assertThat(SelectionOffer.copyText(bubbles, canWrite = true, nowMillis = 0)).isEqualTo("un\ntrois")
        assertThat(offer(bubble("m2", sealed = true)).copy).isFalse()
    }

    @Test
    fun `star unstars only when every starrable message is already starred`() {
        val mixed = listOf(bubble("m1", isStarred = true), bubble("m2"))
        assertThat(SelectionOffer.starTargets(mixed, true, 0).map { it.messageId }).containsExactly("m2")
        val allStarred = listOf(bubble("m1", isStarred = true), bubble("m2", isStarred = true))
        assertThat(SelectionOffer.starTargets(allStarred, true, 0).map { it.messageId }).containsExactly("m1", "m2")
    }

    @Test
    fun `idsOffering reads the same law as the menu, in the received order`() {
        val bubbles = listOf(bubble("m1", exitOffer = viewOnceExit), bubble("m2"), bubble("m3"))
        assertThat(SelectionOffer.idsOffering(MessageAction.Forward, bubbles, true, 0)).containsExactly("m2", "m3").inOrder()
    }
}
