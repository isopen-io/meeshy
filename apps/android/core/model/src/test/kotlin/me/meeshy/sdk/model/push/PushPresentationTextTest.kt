package me.meeshy.sdk.model.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserNotificationPreferences
import org.junit.Test

class PushPresentationTextTest {

    private val labels = PushPresentationLabels(
        newMessage = "New message",
        someone = "Someone",
        voiceMessage = "Voice message",
        senderInGroup = "%1\$s in %2\$s",
    )

    private fun group(type: String = "group") = PushPayload(
        type = "new_message", conversationId = "c1", senderDisplayName = "Ana",
        conversationTitle = "Team", conversationType = type,
    )

    private fun present(payload: PushPayload, prefs: UserNotificationPreferences = UserNotificationPreferences(), body: String? = "Hello") =
        PushPresentationText.present(payload, "served", body, prefs, labels)

    @Test
    fun `un groupe dit Nom dans Groupe avec le repere du type`() {
        assertThat(present(group("group")).title).isEqualTo("Ana in 👥 Team")
        assertThat(present(group("public")).title).isEqualTo("Ana in 🌐 Team")
        assertThat(present(group("global")).title).isEqualTo("Ana in 📢 Team")
    }

    @Test
    fun `un message direct dit le nom sans repere`() {
        val direct = group("direct")
        assertThat(present(direct).title).isEqualTo("Ana")
        assertThat(PushPresentationText.groupMarker("direct")).isEmpty()
        assertThat(PushPresentationText.groupMarker(null)).isEmpty()
    }

    @Test
    fun `nom coupe en direct donne le libelle neutre et en groupe le seul groupe`() {
        val prefs = UserNotificationPreferences(showSenderName = false)
        assertThat(present(group("direct"), prefs).title).isEqualTo("Someone")
        assertThat(present(group("group"), prefs).title).isEqualTo("👥 Team")
    }

    @Test
    fun `apercu coupe donne Nouveau message et le corps servi reste sinon intact`() {
        assertThat(present(group(), UserNotificationPreferences(showPreview = false)).body).isEqualTo("New message")
        assertThat(present(group()).body).isEqualTo("Hello")
    }

    @Test
    fun `un message protege garde son placeholder meme apercu coupe`() {
        val protectedPayload = group().copy(notificationLocKey = "notification.view_once_message")
        val out = present(protectedPayload, UserNotificationPreferences(showPreview = false), body = "placeholder")
        assertThat(out.body).isEqualTo("placeholder")
    }

    @Test
    fun `un vocal vide dit Message vocal et la duree sans ecraser une legende`() {
        val voice = group().copy(attachmentMimeType = "audio/mp4", attachmentDurationMs = 12_000)
        assertThat(present(voice, body = null).body).isEqualTo("Voice message · 0:12")
        assertThat(present(voice, body = "  ").body).isEqualTo("Voice message · 0:12")
        assertThat(present(voice, body = "Legende").body).isEqualTo("Legende")
    }

    @Test
    fun `un type hors conversation n est pas touche`() {
        val like = PushPayload(type = "post_like", senderDisplayName = "Ana")
        assertThat(present(like, UserNotificationPreferences(showPreview = false, showSenderName = false)))
            .isEqualTo(PresentedText("served", "Hello"))
    }

    @Test
    fun `sans expediteur connu le titre servi reste`() {
        val anonymous = PushPayload(type = "new_message")
        assertThat(PushPresentationText.present(anonymous, null, "x", UserNotificationPreferences(), labels).title).isNull()
    }
}
