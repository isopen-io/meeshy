package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.preview.PreviewParam
import org.junit.Test

class ConversationWireDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String) = json.decodeFromString(ApiConversation.serializer(), raw)

    private fun row(extra: String) = """{"id":"c1","type":"group",$extra"unreadCount":1}"""

    @Test
    fun `memberCountCapped, communityId, bannerThumbHash, tags et recentMessages sont lus`() {
        val c = decode(
            row(
                """"memberCount":199,"memberCountCapped":true,"communityId":"com1","bannerThumbHash":"abc=",
                "tags":["a","b"],"recentMessages":[{"id":"m1","content":"x"},{"id":"m2","content":"y"}],""",
            ),
        )

        assertThat(c.memberCount).isEqualTo(199)
        assertThat(c.memberCountCapped).isTrue()
        assertThat(c.communityId).isEqualTo("com1")
        assertThat(c.bannerThumbHash).isEqualTo("abc=")
        assertThat(c.tags).containsExactly("a", "b").inOrder()
        assertThat(c.recentMessages.map { it.id }).containsExactly("m1", "m2").inOrder()
    }

    @Test
    fun `un appel mal forme ne jette pas la ligne et vaut null`() {
        val c = decode(row(""""activeCall":{"id":5,"kind":[]},"""))

        assertThat(c.activeCall).isNull()
        assertThat(c.id).isEqualTo("c1")
    }

    @Test
    fun `une reaction mal formee vaut null`() {
        val c = decode(row(""""lastReaction":"oops","""))

        assertThat(c.lastReaction).isNull()
    }

    @Test
    fun `une piece jointe illisible est ecartee et les autres gardees`() {
        val c = decode(
            row(
                """"lastMessage":{"id":"m1","attachments":[{"id":"a1","mimeType":"image/png"},{"nope":1},{"id":"a2"}],
                "attachmentSummary":{"count":"beaucoup"}},""",
            ),
        )

        assertThat(c.lastMessage?.attachments?.map { it.id }).containsExactly("a1", "a2").inOrder()
        assertThat(c.lastMessage?.attachmentSummary).isNull()
    }

    @Test
    fun `un recentMessages dont un element est casse garde les autres`() {
        val c = decode(row(""""recentMessages":[{"id":"m1"},42,{"id":"m3"}],"""))

        assertThat(c.recentMessages.map { it.id }).containsExactly("m1", "m3").inOrder()
    }

    @Test
    fun `un dernier message protege arrive sans texte ni traduction ni piece et rien n'est fabrique`() {
        val c = decode(
            row(""""lastMessage":{"id":"m1","isViewOnce":true,"isBlurred":false,"messageType":"image"},"""),
        )
        val last = checkNotNull(c.lastMessage)

        assertThat(last.content).isNull()
        assertThat(last.attachments).isNull()
        assertThat(last.attachmentSummary).isNull()
        assertThat(c.lastMessageTranslations).isNull()
        assertThat(last.isViewOnce).isTrue()
    }

    @Test
    fun `un message geolocalise sans texte expose son lieu hisse`() {
        val c = decode(
            row(""""lastMessage":{"id":"m1","content":"","location":{"latitude":48.85,"longitude":2.35,"name":"Tour Eiffel"}},"""),
        )

        assertThat(c.lastMessage?.location?.name).isEqualTo("Tour Eiffel")
        assertThat(c.lastMessage?.location?.latitude).isEqualTo(48.85)
    }

    @Test
    fun `un lieu mal forme vaut null sans jeter la ligne`() {
        val c = decode(row(""""lastMessage":{"id":"m1","location":{"latitude":"nord"}},"""))

        assertThat(c.lastMessage?.location).isNull()
        assertThat(c.lastMessage?.id).isEqualTo("m1")
    }

    @Test
    fun `un sticker hisse est expose et sa seule presence suffit`() {
        val full = decode(row(""""lastMessage":{"id":"m1","messageType":"image","sticker":{"templateId":"t1","emoji":"x"}},"""))
        val bare = decode(row(""""lastMessage":{"id":"m1","sticker":{"stickerId":"s9"}},"""))

        assertThat(full.lastMessage?.sticker?.templateId).isEqualTo("t1")
        assertThat(bare.lastMessage?.sticker).isNotNull()
        assertThat(bare.lastMessage?.nature?.sticker).isNotNull()
    }

    @Test
    fun `viewerWriteRestriction minor-global ferme le composeur et une valeur inconnue est gardee`() {
        val minor = decode(row(""""viewerWriteRestriction":"minor-global","""))
        val future = decode(row(""""viewerWriteRestriction":"under-review","""))
        val broken = decode(row(""""viewerWriteRestriction":{"x":1},"""))

        assertThat(minor.viewerWriteRestriction).isEqualTo(ConversationWriteRestriction.MinorGlobal)
        assertThat(minor.viewerWriteRestriction?.closesComposer).isTrue()
        assertThat(future.viewerWriteRestriction).isEqualTo(ConversationWriteRestriction.Unknown("under-review"))
        assertThat(future.viewerWriteRestriction?.closesComposer).isFalse()
        assertThat(broken.viewerWriteRestriction).isNull()
    }

    @Test
    fun `isWorldWide suit l'identifiant world et orderInCategory est lu`() {
        val world = decode("""{"id":"c","identifier":"world","userPreferences":[{"orderInCategory":3}]}""")

        assertThat(world.isWorldWide).isTrue()
        assertThat(world.resolvedPreferences?.orderInCategory).isEqualTo(3)
        assertThat(decode("""{"id":"c","identifier":"mshy_x"}""").isWorldWide).isFalse()
    }

    @Test
    fun `les preferences retombent sur l'accesseur resolvedPreferences inchange`() {
        val local = ApiConversationPreferences(isPinned = true)
        val c = decode("""{"id":"c","userPreferences":[{"isMuted":true}]}""").copy(preferences = local)

        assertThat(c.resolvedPreferences).isEqualTo(local)
    }

    @Test
    fun `les parametres d'un evenement systeme gardent texte et nombres, ecartent le reste`() {
        val c = decode(
            row(
                """"lastMessage":{"id":"m1","systemEvent":{"key":"system.member-joined","params":{"name":"Ana","count":3,"bad":{"x":1}}}},""",
            ),
        )
        val params = checkNotNull(c.lastMessage?.systemEvent).params

        assertThat(params["name"]).isEqualTo(PreviewParam.Text("Ana"))
        assertThat(params["count"]?.rendered).isEqualTo("3")
        assertThat(params).doesNotContainKey("bad")
    }
}
