package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.preview.PreviewEffect
import me.meeshy.sdk.model.preview.PreviewEntrance
import me.meeshy.sdk.model.preview.PreviewFinish
import org.junit.Test

/** Line 2 carries the last message's APPLIED effect (#16975) — and only on the last-message line. */
class ConversationRowPreviewEffectTest {

    private val labels = LastMessagePreviewLabels(
        photo = "📷 Photo",
        video = "🎬 Vidéo",
        voice = "🎵 Message vocal",
        file = "📎 Fichier",
        location = "📍 Localisation",
        none = "Aucun message",
        you = "Vous",
        senderFormat = "%1\$s : %2\$s",
        draftPrefix = "Brouillon : ",
        hidden = "Contenu masqué",
    )

    private val now = 1_700_000_000_000L

    private fun message(effectFlags: Int? = null, isBlurred: Boolean = false) = ApiConversationLastMessage(
        id = "m7",
        content = "Salut !",
        senderId = "other",
        senderName = "Alice",
        messageType = "text",
        isBlurred = isBlurred,
        effectFlags = effectFlags,
    )

    private fun summaryOf(message: ApiConversationLastMessage) =
        messageSummaryLine(message, currentUserId = "me", showSender = false, labels = labels, nowMillis = now)

    @Test
    fun `the summary carries the effect and the message id`() {
        val summary = summaryOf(message(effectFlags = (MessageEffectFlags.SHAKE or MessageEffectFlags.GLOW).toInt()))

        assertThat(summary.effect).isEqualTo(PreviewEffect(veil = false, finish = PreviewFinish.GLOW, entrance = PreviewEntrance.SHAKE))
        assertThat(summary.messageId).isEqualTo("m7")
        assertThat(summary.text).isEqualTo("Salut !")
    }

    @Test
    fun `a blurred summary is veiled and keeps its label for TalkBack`() {
        val summary = summaryOf(message(isBlurred = true))

        assertThat(summary.effect).isEqualTo(PreviewEffect.VEILED)
        assertThat(summary.text).isEqualTo("Contenu masqué")
    }

    @Test
    fun `the last-message line keeps the effect`() {
        val summary = summaryOf(message(effectFlags = MessageEffectFlags.SPARKLE.toInt()))

        val row = conversationRowPreview(typingLine = null, draft = null, summary = summary)

        assertThat(row.effect?.finish).isEqualTo(PreviewFinish.SPARKLE)
        assertThat(row.messageId).isEqualTo("m7")
    }

    @Test
    fun `typing and draft lines carry no effect`() {
        val summary = summaryOf(message(effectFlags = MessageEffectFlags.SPARKLE.toInt()))

        val typing = conversationRowPreview(typingLine = "Alice écrit…", draft = null, summary = summary)
        val draft = conversationRowPreview(typingLine = null, draft = DraftPreview("Brouillon :", "plus tard"), summary = summary)

        assertThat(typing.effect).isNull()
        assertThat(draft.effect).isNull()
    }
}
