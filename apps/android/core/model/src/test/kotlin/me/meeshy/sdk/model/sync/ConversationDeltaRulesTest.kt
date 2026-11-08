package me.meeshy.sdk.model.sync

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

class ConversationDeltaRulesTest {

    private fun cached(
        id: String = "c1",
        type: String = "group",
        title: String? = "Ancien titre",
        participants: List<ApiParticipant> = listOf(ApiParticipant(id = "p1", userId = "u1", role = "ADMIN")),
    ) = ApiConversation(
        id = id,
        type = type,
        title = title,
        description = "ancienne",
        avatar = "old.png",
        participants = participants,
        lastMessage = ApiConversationLastMessage(id = "m1", content = "Bonjour", createdAt = "2026-10-01T10:00:00.000Z"),
        lastMessageTranslations = mapOf("en" to "Hello"),
        lastMessageOriginalLanguage = "fr",
        unreadCount = 4,
        currentUserRole = "ADMIN",
        userPreferences = listOf(ApiConversationPreferences(isPinned = true)),
        tags = listOf("work"),
        updatedAt = "2026-10-01T10:00:00.000Z",
    )

    private fun row(
        id: String = "c1",
        title: String? = "Nouveau titre",
        lastMessageAt: String? = "2026-10-01T10:00:00.000Z",
        isActive: Boolean? = true,
        type: String? = "group",
        participants: List<SyncPeerRow> = emptyList(),
    ) = SyncConversationRow(
        id = id,
        type = type,
        title = title,
        description = "nouvelle",
        avatar = "new.png",
        banner = "b.png",
        communityId = "com1",
        isActive = isActive,
        memberCount = 12,
        slowModeSeconds = 30,
        encryptionMode = "server",
        autoTranslateEnabled = true,
        updatedAt = "2026-10-02T10:00:00.000Z",
        lastMessageAt = lastMessageAt,
        participants = participants,
    )

    private fun fused(row: SyncConversationRow = row(), known: ApiConversation = cached()) =
        ConversationDeltaRules.fuse(known, row)

    @Test fun `le titre servi avance`() = assertThat(fused().title).isEqualTo("Nouveau titre")
    @Test fun `un titre efface cote serveur est une valeur`() = assertThat(fused(row(title = null)).title).isNull()
    @Test fun `la description avance`() = assertThat(fused().description).isEqualTo("nouvelle")
    @Test fun `l'avatar avance`() = assertThat(fused().avatar).isEqualTo("new.png")
    @Test fun `la banniere avance`() = assertThat(fused().banner).isEqualTo("b.png")
    @Test fun `la communaute avance`() = assertThat(fused().communityId).isEqualTo("com1")
    @Test fun `l'effectif servi avance`() = assertThat(fused().memberCount).isEqualTo(12)
    @Test fun `le mode lent avance`() = assertThat(fused().slowModeSeconds).isEqualTo(30)
    @Test fun `le regime de chiffrement avance`() = assertThat(fused().encryptionMode).isEqualTo("server")
    @Test fun `la traduction automatique avance`() = assertThat(fused().autoTranslateEnabled).isTrue()
    @Test fun `updatedAt avance`() = assertThat(fused().updatedAt).isEqualTo("2026-10-02T10:00:00.000Z")

    @Test
    fun `l'apercu et ses traductions restent au cache`() {
        val result = fused()
        assertThat(result.lastMessage?.content).isEqualTo("Bonjour")
        assertThat(result.lastMessageTranslations).containsExactly("en", "Hello")
        assertThat(result.lastMessageOriginalLanguage).isEqualTo("fr")
    }

    @Test fun `le non-lu reste au cache`() = assertThat(fused().unreadCount).isEqualTo(4)
    @Test fun `les preferences restent au cache`() = assertThat(fused().userPreferences.single().isPinned).isTrue()
    @Test fun `le role courant reste au cache`() = assertThat(fused().currentUserRole).isEqualTo("ADMIN")
    @Test fun `les etiquettes restent au cache`() {
        assertThat(fused().tags).containsExactly("work")
    }

    @Test
    fun `un groupe sans pair servi garde ses participants`() {
        assertThat(fused().participants.single().role).isEqualTo("ADMIN")
    }

    @Test
    fun `un direct sans interlocuteur servi garde son titre et ses participants`() {
        val result = fused(row(type = "direct", title = "Generique"), cached(type = "direct", title = "Alice"))
        assertThat(result.title).isEqualTo("Alice")
        assertThat(result.participants.single().userId).isEqualTo("u1")
    }

    @Test
    fun `un direct avec interlocuteur servi avance avec lui et garde le role des autres`() {
        val peer = SyncPeerRow(id = "p2", userId = "u2", displayName = "Bob", user = SyncPeerUser(username = "bob"))
        val result = fused(
            row(type = "direct", title = "Bob", participants = listOf(peer)),
            cached(type = "direct", title = "Alice"),
        )
        assertThat(result.title).isEqualTo("Bob")
        assertThat(result.participants.map { it.userId }).containsExactly("u2", "u1").inOrder()
        assertThat(result.participants.first().username).isEqualTo("bob")
        assertThat(result.participants.last().role).isEqualTo("ADMIN")
    }

    @Test
    fun `une ligne dont l'activite a bouge demande la route riche`() {
        val merge = ConversationDeltaRules.merge(mapOf("c1" to cached()), listOf(row(lastMessageAt = "2026-10-03T10:00:00.000Z")))
        assertThat(merge.needsRichRefresh).isTrue()
        assertThat(merge.upserts.single().lastMessage?.content).isEqualTo("Bonjour")
    }

    @Test
    fun `une ligne a activite inchangee ne demande rien de plus`() {
        val merge = ConversationDeltaRules.merge(mapOf("c1" to cached()), listOf(row()))
        assertThat(merge.needsRichRefresh).isFalse()
        assertThat(merge.upserts).hasSize(1)
    }

    @Test
    fun `une conversation inconnue n'entre pas maigre, elle demande la route riche`() {
        val merge = ConversationDeltaRules.merge(emptyMap(), listOf(row(id = "neuve")))
        assertThat(merge.upserts).isEmpty()
        assertThat(merge.needsRichRefresh).isTrue()
    }

    @Test
    fun `une ligne inactive et un tombstone retirent, une seule fois`() {
        val merge = ConversationDeltaRules.merge(
            existing = mapOf("c1" to cached(), "c2" to cached("c2"), "c3" to cached("c3")),
            rows = listOf(row("c1", isActive = false), row("c2")),
            tombstoneIds = listOf("c1", "c2"),
        )
        assertThat(merge.removedIds).containsExactly("c1", "c2")
        assertThat(merge.upserts).isEmpty()
    }
}
