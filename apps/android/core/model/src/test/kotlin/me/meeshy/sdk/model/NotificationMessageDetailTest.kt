package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationMessageDetailTest {

    private val labels = NotificationMessageDetail.Labels(sharedLocation = "Position partagée", invitation = "Invitation")

    private fun read(vararg fields: Pair<String, String>): NotificationMessageDetail? =
        NotificationMessageDetail.of(fields.toMap()::get)

    @Test
    fun `une position se lit depuis des nombres en chaines`() {
        val detail = read("locationLat" to "48.8584", "locationLon" to "2.2945", "locationName" to "Tour Eiffel")

        assertThat(detail).isEqualTo(
            NotificationMessageDetail.Location(48.8584, 2.2945, name = "Tour Eiffel", address = null),
        )
    }

    @Test
    fun `une latitude hors bornes n'est pas une position`() {
        assertThat(read("locationLat" to "91", "locationLon" to "2")).isNull()
        assertThat(read("locationLat" to "10", "locationLon" to "181")).isNull()
        assertThat(read("locationLat" to "abc", "locationLon" to "2")).isNull()
        assertThat(read("locationLat" to "NaN", "locationLon" to "2")).isNull()
    }

    @Test
    fun `la position passe avant le contact l'invitation et le lien`() {
        val detail = read(
            "locationLat" to "1", "locationLon" to "2", "contactName" to "Alice",
            "inviteUrl" to "https://meeshy.me/join/x", "linkUrl" to "https://example.com",
        )
        assertThat(detail).isInstanceOf(NotificationMessageDetail.Location::class.java)
    }

    @Test
    fun `le contact passe avant l'invitation et le lien`() {
        val detail = read("contactName" to "Alice", "inviteUrl" to "https://meeshy.me/join/x", "linkUrl" to "https://example.com")
        assertThat(detail).isEqualTo(NotificationMessageDetail.Contact("Alice", phone = null, email = null))
    }

    @Test
    fun `l'invitation passe avant le lien et lit le nombre de membres en chaine`() {
        val detail = read(
            "inviteUrl" to "meeshy://join/x", "inviteConversationTitle" to "Équipe", "inviteMemberCount" to "12",
            "linkUrl" to "https://example.com",
        )
        assertThat(detail).isEqualTo(NotificationMessageDetail.Invite("meeshy://join/x", "Équipe", 12))
    }

    @Test
    fun `un lien ne retient que http et https`() {
        assertThat(read("linkUrl" to "javascript:alert(1)")).isNull()
        assertThat(read("linkUrl" to "ftp://example.com")).isNull()
        assertThat(read("linkUrl" to "https://example.com/a", "linkTitle" to "Titre", "linkImageUrl" to "https://i/x.png"))
            .isEqualTo(NotificationMessageDetail.Link("https://example.com/a", "example.com", "Titre", "https://i/x.png"))
    }

    @Test
    fun `le domaine servi l'emporte sur celui de l'adresse`() {
        val detail = read("linkUrl" to "https://example.com/a", "linkDomain" to "exemple.fr") as NotificationMessageDetail.Link
        assertThat(detail.domain).isEqualTo("exemple.fr")
    }

    @Test
    fun `les valeurs blanches sont absentes`() {
        assertThat(read("contactName" to "   ", "locationName" to "")).isNull()
    }

    @Test
    fun `les resumes suivent le contrat`() {
        assertThat(NotificationMessageDetail.Location(1.0, 2.0, "Tour", "Paris").summary(labels)).isEqualTo("📍 Tour · Paris")
        assertThat(NotificationMessageDetail.Location(1.0, 2.0, null, null).summary(labels)).isEqualTo("📍 Position partagée")
        assertThat(NotificationMessageDetail.Contact("Alice", null, null).summary(labels)).isEqualTo("👤 Alice")
        assertThat(NotificationMessageDetail.Invite("https://x", "Équipe", null).summary(labels)).isEqualTo("✉️ Invitation · Équipe")
        assertThat(NotificationMessageDetail.Invite("https://x", null, null).summary(labels)).isEqualTo("✉️ Invitation")
        assertThat(NotificationMessageDetail.Link("https://x.io", "x.io", "Titre", null).summary(labels)).isEqualTo("🔗 x.io — Titre")
    }

    @Test
    fun `un corps vide cede au resume, un corps compose est garde`() {
        val link = NotificationMessageDetail.Link("https://x.io/a", "x.io", null, null)
        assertThat(link.resolvedBody(served = null, labels = labels)).isEqualTo("🔗 x.io")
        assertThat(link.resolvedBody(served = "https://x.io/a/", labels = labels)).isEqualTo("🔗 x.io")
        assertThat(link.resolvedBody(served = "regarde ça", labels = labels)).isEqualTo("regarde ça")
        val place = NotificationMessageDetail.Location(1.0, 2.0, "Tour", null)
        assertThat(place.resolvedBody(served = "📍 Tour", labels = labels)).isEqualTo("📍 Tour")
    }

    @Test
    fun `un message protege n'a aucun detail`() {
        val fields = mapOf("contactName" to "Alice", "notificationLocKey" to "message.viewOnce")
        assertThat(NotificationMessageDetail.ofUnprotected(fields::get)).isNull()
        assertThat(NotificationMessageDetail.ofUnprotected(mapOf("contactName" to "Alice")::get)).isNotNull()
    }
}
