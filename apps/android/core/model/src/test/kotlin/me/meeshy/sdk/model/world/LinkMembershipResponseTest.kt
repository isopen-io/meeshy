package me.meeshy.sdk.model.world

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class LinkMembershipResponseTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    @Test
    fun `la reponse d'un invite forme une session aux droits durcis`() {
        val response = json.decodeFromString<LinkMembershipResponse>(
            """{"sessionToken":"tok","conversationId":"c1","participantId":"p1",
               "entry":{"outcome":"joined","rights":{"canSendMessages":true,"canSendFiles":true,"canSendImages":true,"canSendVideos":true}}}""",
        )

        val context = response.toSessionContext("mshy_world")!!

        assertThat(context.sessionToken).isEqualTo("tok")
        assertThat(context.linkId).isEqualTo("mshy_world")
        assertThat(context.conversationId).isEqualTo("c1")
        assertThat(context.permissions.canSendMessages).isTrue()
        assertThat(context.permissions.canSendVideos).isFalse()
        assertThat(context.permissions.canSendLinks).isFalse()
    }

    @Test
    fun `un droit non nomme n'est pas accorde`() {
        val response = json.decodeFromString<LinkMembershipResponse>(
            """{"sessionToken":"tok","conversationId":"c1","participantId":"p1","entry":{"rights":{}}}""",
        )

        val permissions = response.toSessionContext("k")!!.permissions

        assertThat(permissions.canSendFiles).isFalse()
        assertThat(permissions.canSendImages).isFalse()
    }

    @Test
    fun `une reponse sans jeton, conversation ou participant ne forme aucune session`() {
        assertThat(LinkMembershipResponse(sessionToken = " ", conversationId = "c", participantId = "p").toSessionContext("k")).isNull()
        assertThat(LinkMembershipResponse(sessionToken = "t", conversationId = "", participantId = "p").toSessionContext("k")).isNull()
        assertThat(LinkMembershipResponse(sessionToken = "t", conversationId = "c", participantId = "").toSessionContext("k")).isNull()
        assertThat(LinkMembershipResponse(sessionToken = null, conversationId = "c", participantId = "p").toSessionContext("k")).isNull()
    }

    @Test
    fun `l'entree servie decode sans effectif`() {
        val entry = json.decodeFromString<WorldEntry>("""{"identifier":"world","title":"World Wide","shareLinkIdentifier":"mshy_x"}""")

        assertThat(entry.memberCount).isEqualTo(0)
        assertThat(entry.avatar).isNull()
    }

    @Test
    fun `sans bloc de droits l'invite peut ecrire mais rien d'autre`() {
        val permissions = LinkMembershipResponse(sessionToken = "t", conversationId = "c", participantId = "p")
            .toSessionContext("k")!!.permissions

        assertThat(permissions.canSendMessages).isTrue()
        assertThat(permissions.canSendFiles).isFalse()
        assertThat(permissions.canSendImages).isFalse()
    }
}
