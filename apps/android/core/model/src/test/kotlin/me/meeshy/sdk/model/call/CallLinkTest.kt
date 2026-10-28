package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

/** `meeshy://call?contactId=…&type=…` est une DEMANDE (#13465), miroir de `DeepLinkParser` + `CallLinkConfirmationController` (iOS). */
class CallLinkTest {

    @Test
    fun `le lien d'appel du schema meeshy porte la conversation et le mode`() {
        assertThat(CallLinkRequest.parse("meeshy://call?contactId=c1&type=video")).isEqualTo(CallLinkRequest("c1", isVideo = true))
        assertThat(CallLinkRequest.parse("meeshy://call?contactId=c1&type=audio")).isEqualTo(CallLinkRequest("c1", isVideo = false))
        assertThat(CallLinkRequest.parse("meeshy://call?contactId=c1")).isEqualTo(CallLinkRequest("c1", isVideo = false))
        assertThat(CallLinkRequest.parse("MEESHY://call?type=video&contactId=c%201")).isEqualTo(CallLinkRequest("c 1", isVideo = true))
    }

    @Test
    fun `seul le schema meeshy porte un lien d'appel`() {
        listOf(
            "https://meeshy.me/call?contactId=c1",
            "http://call?contactId=c1",
            "tel://call?contactId=c1",
            "meeshy://chat?contactId=c1",
            "meeshy://call/extra?contactId=c1",
            "meeshy://user@call?contactId=c1",
            "meeshy://call:80?contactId=c1",
            "meeshy:call?contactId=c1",
        ).forEach { assertThat(CallLinkRequest.parse(it)).isNull() }
    }

    @Test
    fun `sans conversation lisible le lien n'ouvre rien`() {
        listOf(null, "", "meeshy://call", "meeshy://call?", "meeshy://call?contactId=", "meeshy://call?contactId=%20", "meeshy://call?type=video")
            .forEach { assertThat(CallLinkRequest.parse(it)).isNull() }
    }

    @Test
    fun `une adresse illisible n'ouvre rien et ne leve rien`() {
        assertThat(CallLinkRequest.parse("meeshy://call?contactId=%ZZ")).isNull()
        assertThat(CallLinkRequest.parse("meeshy://call ?contactId=c1")).isNull()
        assertThat(CallLinkRequest.parse("not a url")).isNull()
    }

    private val reader = "me"
    private fun direct(vararg others: ApiParticipant) =
        ApiConversation(id = "c1", type = "direct", participants = listOf(ApiParticipant(id = "p0", userId = reader)) + others)

    private val ada = ApiParticipant(id = "p1", userId = "u1", displayName = "Ada Lovelace", username = "ada", avatar = "https://meeshy.me/a.png")

    @Test
    fun `un contact connu se montre avec son nom, son pseudo et son avatar`() {
        val verdict = CallLinkRule.resolve(CallLinkRequest("c1", true), direct(ada), reader) { false }
        assertThat(verdict).isEqualTo(
            CallLinkVerdict.Confirm(
                CallLinkTarget(
                    conversationId = "c1", userId = "u1", displayName = "Ada Lovelace", username = "ada",
                    avatarUrl = "https://meeshy.me/a.png", isVideo = true, accountId = reader,
                ),
            ),
        )
    }

    @Test
    fun `le titre nomme le pseudo, a defaut le nom`() {
        val withHandle = CallLinkTarget("c", "u", "Ada", "ada", null, true, reader)
        val withoutHandle = withHandle.copy(username = null)
        assertThat(withHandle.handle).isEqualTo("@ada")
        assertThat(withoutHandle.handle).isEqualTo("Ada")
    }

    @Test
    fun `conversation absente, de groupe ou sans autre compte donnent un refus propre`() {
        val request = CallLinkRequest("c1", false)
        assertThat(CallLinkRule.resolve(request, null, reader) { false }).isEqualTo(CallLinkVerdict.UnknownContact)
        assertThat(CallLinkRule.resolve(request, direct(ada).copy(type = "group"), reader) { false })
            .isEqualTo(CallLinkVerdict.UnknownContact)
        assertThat(CallLinkRule.resolve(request, direct(), reader) { false }).isEqualTo(CallLinkVerdict.UnknownContact)
        assertThat(CallLinkRule.resolve(request, direct(ApiParticipant(id = "p9", userId = null)), reader) { false })
            .isEqualTo(CallLinkVerdict.UnknownContact)
    }

    @Test
    fun `un lecteur inconnu n'elit personne`() {
        assertThat(CallLinkRule.resolve(CallLinkRequest("c1", false), direct(ada), null) { false })
            .isEqualTo(CallLinkVerdict.UnknownContact)
    }

    @Test
    fun `un contact bloque donne son refus et rien ne se compose`() {
        val verdict = CallLinkRule.resolve(CallLinkRequest("c1", false), direct(ada), reader) { it == "u1" }
        assertThat(verdict).isEqualTo(CallLinkVerdict.Blocked)
    }

    @Test
    fun `la confirmation ne vaut que pour le compte, le contact et l'etat qu'elle montrait`() {
        val shown = CallLinkTarget("c1", "u1", "Ada", "ada", null, false, reader)
        assertThat(CallLinkRule.mayDial(shown, accountNow = reader, isBlocked = false)).isTrue()
        assertThat(CallLinkRule.mayDial(shown, accountNow = "other", isBlocked = false)).isFalse()
        assertThat(CallLinkRule.mayDial(shown, accountNow = null, isBlocked = false)).isFalse()
        assertThat(CallLinkRule.mayDial(shown, accountNow = reader, isBlocked = true)).isFalse()
    }
}
