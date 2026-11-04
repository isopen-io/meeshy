package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import org.junit.Test

class ConversationMergeRulesTest {

    private fun group(last: ApiConversationLastMessage? = lastMessage()) =
        ApiConversation(id = "c1", type = "group", title = "Team", lastMessage = last)

    private fun lastMessage(id: String = "m1", at: String = "2026-10-01T10:00:00.000Z") =
        ApiConversationLastMessage(id = id, content = "old", senderName = "Alice", createdAt = at)

    private fun update(
        identity: PreviewFieldUpdate<String> = PreviewFieldUpdate.Unchanged,
        preview: String? = null,
        at: String? = null,
        title: String? = null,
    ) = ConversationUpdatedSocketEvent(
        conversationId = "c1", lastMessageId = identity, lastMessagePreview = preview, lastMessageAt = at, title = title,
    )

    @Test
    fun `une cle absente laisse l apercu en place pendant que le titre change`() {
        val merged = ConversationMergeRules.updated(group(), update(title = "Renamed"), "me", "Vous")!!
        assertThat(merged.title).isEqualTo("Renamed")
        assertThat(merged.lastMessage?.content).isEqualTo("old")
    }

    @Test
    fun `un nouveau message remonte la ligne avec son apercu`() {
        val merged = ConversationMergeRules.updated(
            group(),
            update(PreviewFieldUpdate.Replaced("m2"), preview = "Hello", at = "2026-10-01T11:00:00.000Z"),
            "me",
            "Vous",
        )!!
        assertThat(merged.lastMessage?.id).isEqualTo("m2")
        assertThat(merged.lastMessage?.content).isEqualTo("Hello")
        assertThat(merged.lastMessage?.createdAt).isEqualTo("2026-10-01T11:00:00.000Z")
    }

    @Test
    fun `une identite nulle efface l apercu`() {
        val merged = ConversationMergeRules.updated(group(), update(PreviewFieldUpdate.Replaced(null)), "me", "Vous")!!
        assertThat(merged.lastMessage?.content).isNull()
        assertThat(merged.lastMessage?.id).isNull()
    }

    @Test
    fun `l identite tri etat distingue absent, nomme et plus rien`() {
        assertThat(LastMessageIdentity.of(PreviewFieldUpdate.Unchanged)).isEqualTo(LastMessageIdentity.Unchanged)
        assertThat(LastMessageIdentity.of(PreviewFieldUpdate.Replaced("m9"))).isEqualTo(LastMessageIdentity.Replaced("m9"))
        assertThat(LastMessageIdentity.of(PreviewFieldUpdate.Replaced(null))).isEqualTo(LastMessageIdentity.ReplacedByNothing)
    }

    @Test
    fun `un message plus ancien est ignore sauf recalcul serveur`() {
        val stale = update(PreviewFieldUpdate.Replaced("m0"), preview = "ancien", at = "2026-10-01T09:00:00.000Z")
        assertThat(ConversationMergeRules.updated(group(), stale, "me", "Vous")).isNull()
        val recalculated = stale.copy(previewRecalculated = true)
        assertThat(ConversationMergeRules.updated(group(), recalculated, "me", "Vous")!!.lastMessage?.id).isEqualTo("m0")
    }

    @Test
    fun `user updated repeint nom et avatar du contact dans la ligne directe`() {
        val direct = ApiConversation(
            id = "c1",
            type = "direct",
            participants = listOf(ApiParticipant(id = "p1", userId = "u2", displayName = "Old", username = "old")),
        )
        val event = UserUpdatedEvent(
            userId = "u2", displayName = "Nouveau", username = "nouveau", hasNameGroup = true,
            avatar = UserUpdatedEvent.OptionalMediaChange.Replaced("https://a/b.png"),
        )
        val merged = ConversationMergeRules.userUpdated(direct, event)!!
        assertThat(merged.participants.single().displayName).isEqualTo("Nouveau")
        assertThat(merged.participants.single().avatar).isEqualTo("https://a/b.png")
        assertThat(ConversationMergeRules.userUpdated(direct, event.copy(userId = "u3"))).isNull()
    }

    @Test
    fun `la garde de version ignore un evenement de preferences plus ancien`() {
        val local = group().copy(preferences = ApiConversationPreferences(isPinned = true, version = 5))
        fun event(version: Int) = UserPreferencesConversationUpdatedSocketData(
            userId = "me", conversationId = "c1", version = version,
            preferences = ConversationPreferencesWirePayload(isPinned = false),
        )
        assertThat(ConversationMergeRules.preferences(local, event(4))).isNull()
        assertThat(ConversationMergeRules.preferences(local, event(5))).isNull()
        val newer = ConversationMergeRules.preferences(local, event(6))!!
        assertThat(newer.preferences?.isPinned).isFalse()
        assertThat(newer.preferences?.version).isEqualTo(6)
    }

    @Test
    fun `seul moi pour sujet retire la ligne`() {
        assertThat(ConversationMergeRules.removesRowForMe("me", "me")).isTrue()
        assertThat(ConversationMergeRules.removesRowForMe("other", "me")).isFalse()
        assertThat(ConversationMergeRules.removesRowForMe(null, "me")).isFalse()
        assertThat(ConversationMergeRules.removesRowForMe("me", null)).isFalse()
    }
}
