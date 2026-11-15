package me.meeshy.sdk.model.conversationcard

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import org.junit.Test

class ConversationCardTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val shareLinkPayload = """
        {
          "kind": "share-link",
          "conversationId": null,
          "title": "Club des polyglottes",
          "description": "On parle de tout",
          "avatarUrl": "https://static.meeshy.me/a.png",
          "bannerUrl": null,
          "conversationType": "group",
          "stats": { "memberCount": 42, "onlineCount": null, "messageCount": null, "languages": ["fr", "en"] },
          "viewer": { "isMember": false, "canJoin": true, "requiresAccount": false, "canJoinAnonymously": true },
          "link": { "identifier": "mshy_club", "isActive": true, "expiresAt": null },
          "inviter": { "displayName": "Awa", "username": "awa", "avatarUrl": null },
          "inviteMessage": "Viens !"
        }
    """.trimIndent()

    private fun card(
        kind: ConversationCardKind = ConversationCardKind.SHARE_LINK,
        conversationId: String? = null,
        viewer: ConversationCardViewer = ConversationCardViewer(canJoin = true),
        link: ConversationCardLink? = ConversationCardLink(identifier = "mshy_club", isActive = true),
        memberCount: Int = 10,
    ) = ConversationCard(
        kind = kind,
        conversationId = conversationId,
        title = "Club",
        stats = ConversationCardStats(memberCount = memberCount),
        viewer = viewer,
        link = link,
    )

    @Test
    fun `the gateway payload decodes field by field`() {
        val decoded = json.decodeFromString(ConversationCard.serializer(), shareLinkPayload)

        assertThat(decoded.kind).isEqualTo(ConversationCardKind.SHARE_LINK)
        assertThat(decoded.conversationId).isNull()
        assertThat(decoded.title).isEqualTo("Club des polyglottes")
        assertThat(decoded.description).isEqualTo("On parle de tout")
        assertThat(decoded.avatarUrl).isEqualTo("https://static.meeshy.me/a.png")
        assertThat(decoded.stats).isEqualTo(ConversationCardStats(memberCount = 42, messageCount = null, languages = listOf("fr", "en")))
        assertThat(decoded.viewer).isEqualTo(ConversationCardViewer(isMember = false, canJoin = true, requiresAccount = false, canJoinAnonymously = true))
        assertThat(decoded.link).isEqualTo(ConversationCardLink(identifier = "mshy_club", isActive = true, expiresAt = null))
        assertThat(decoded.inviter).isEqualTo(ConversationCardInviter(displayName = "Awa", username = "awa", avatarUrl = null))
        assertThat(decoded.inviteMessage).isEqualTo("Viens !")
    }

    @Test
    fun `an older gateway that omits the later fields still yields a card`() {
        val decoded = json.decodeFromString(ConversationCard.serializer(), """{ "kind": "direct", "conversationId": "c1" }""")

        assertThat(decoded.kind).isEqualTo(ConversationCardKind.DIRECT)
        assertThat(decoded.title).isEmpty()
        assertThat(decoded.conversationType).isEqualTo("group")
        assertThat(decoded.stats).isEqualTo(ConversationCardStats(memberCount = 0, messageCount = null, languages = emptyList()))
        assertThat(decoded.viewer).isEqualTo(ConversationCardViewer())
        assertThat(decoded.link).isNull()
        assertThat(decoded.inviter).isNull()
        assertThat(decoded.inviteMessage).isNull()
    }

    @Test
    fun `a closed link is expired, an open or absent one is not`() {
        assertThat(card(link = ConversationCardLink("l", isActive = false)).isLinkExpired).isTrue()
        assertThat(card(link = ConversationCardLink("l", isActive = true)).isLinkExpired).isFalse()
        assertThat(card(kind = ConversationCardKind.DIRECT, link = null).isLinkExpired).isFalse()
    }

    @Test
    fun `joining makes the reader a member, counts them and takes the served id`() {
        val joined = card(viewer = ConversationCardViewer(canJoin = true, canJoinAnonymously = true))
            .withMembership(isMember = true, conversationId = "c9")

        assertThat(joined.viewer.isMember).isTrue()
        assertThat(joined.viewer.canJoin).isFalse()
        assertThat(joined.viewer.canJoinAnonymously).isFalse()
        assertThat(joined.stats.memberCount).isEqualTo(11)
        assertThat(joined.conversationId).isEqualTo("c9")
    }

    @Test
    fun `leaving uncounts the reader, never below zero, and keeps the id when none is given`() {
        val member = card(conversationId = "c1", viewer = ConversationCardViewer(isMember = true), memberCount = 0)

        val left = member.withMembership(isMember = false, conversationId = null)

        assertThat(left.viewer.isMember).isFalse()
        assertThat(left.viewer.canJoin).isTrue()
        assertThat(left.stats.memberCount).isEqualTo(0)
        assertThat(left.conversationId).isEqualTo("c1")
    }

    @Test
    fun `an unchanged membership leaves the count alone`() {
        val member = card(viewer = ConversationCardViewer(isMember = true), memberCount = 5)

        assertThat(member.withMembership(isMember = true, conversationId = null).stats.memberCount).isEqualTo(5)
    }

    @Test
    fun `the accent seed is the conversation id, then the link, then the title`() {
        assertThat(card(conversationId = "c1").accentSeed).isEqualTo("c1")
        assertThat(card(conversationId = null).accentSeed).isEqualTo("mshy_club")
        assertThat(card(conversationId = null, link = null).accentSeed).isEqualTo("Club")
    }

    @Test
    fun `a resolution survives the cache round trip`() {
        val resolutions = listOf(
            ConversationCardResolution.Card(card(conversationId = "c1")),
            ConversationCardResolution.PrivateConversation,
            ConversationCardResolution.Unavailable,
        )

        resolutions.forEach { resolution ->
            val encoded = json.encodeToString(ConversationCardResolution.serializer(), resolution)
            assertThat(json.decodeFromString(ConversationCardResolution.serializer(), encoded)).isEqualTo(resolution)
        }
    }

    @Test
    fun `a refusal on a direct link is a private card, never the title`() {
        val direct = ConversationCardTarget.Direct("c1")

        assertThat(ConversationCardResolution.definitiveVerdict(404, direct)).isEqualTo(ConversationCardResolution.PrivateConversation)
        assertThat(ConversationCardResolution.definitiveVerdict(403, direct)).isEqualTo(ConversationCardResolution.PrivateConversation)
        assertThat(ConversationCardResolution.definitiveVerdict(400, direct)).isEqualTo(ConversationCardResolution.Unavailable)
    }

    @Test
    fun `a refusal on a share link falls back to the plain preview`() {
        val share = ConversationCardTarget.ShareLink("l")

        assertThat(ConversationCardResolution.definitiveVerdict(404, share)).isEqualTo(ConversationCardResolution.Unavailable)
        assertThat(ConversationCardResolution.definitiveVerdict(401, share)).isEqualTo(ConversationCardResolution.Unavailable)
    }

    @Test
    fun `an outage is not a verdict`() {
        val share = ConversationCardTarget.ShareLink("l")

        assertThat(ConversationCardResolution.definitiveVerdict(null, share)).isNull()
        assertThat(ConversationCardResolution.definitiveVerdict(500, share)).isNull()
        assertThat(ConversationCardResolution.definitiveVerdict(503, ConversationCardTarget.Direct("c1"))).isNull()
    }
}
