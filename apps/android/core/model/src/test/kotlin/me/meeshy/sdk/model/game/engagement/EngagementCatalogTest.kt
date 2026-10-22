package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EngagementCatalogTest {

    @Test
    fun `le catalogue compte vingt axes dans cinq familles`() {
        assertThat(EngagementCatalog.axes).hasSize(20)
        assertThat(EngagementCatalog.families.map { it.wire })
            .containsExactly("content", "comment", "conversation", "tool", "social").inOrder()
        assertThat(EngagementAxisKey.entries.map { it.wire }.toSet()).hasSize(20)
    }

    @Test
    fun `la famille d un axe est le prefixe de sa cle`() {
        EngagementAxisKey.entries.forEach {
            assertThat(it.wire).startsWith(it.family.wire + ".")
        }
    }

    @Test
    fun `les echelles ont les tailles du TypeScript`() {
        assertThat(EngagementCatalog.badgeThresholds).containsExactly(1, 10, 50, 100, 500, 1000, 5000).inOrder()
        assertThat(EngagementCatalog.legacyBadgeThresholds).containsExactly(1, 10, 50, 100, 500).inOrder()
        assertThat(EngagementCatalog.streakThresholds).containsExactly(3, 7, 14, 30, 60, 100).inOrder()
        assertThat(EngagementCatalog.levelThresholds).containsExactly(10, 50, 150, 400, 1000, 2500).inOrder()
    }

    @Test
    fun `les poids par axe suivent le bareme`() {
        assertThat(EngagementAxisKey.TEXT_MESSAGE.weight).isEqualTo(9)
        assertThat(EngagementAxisKey.TEXT_COMMENT.weight).isEqualTo(3)
        assertThat(EngagementAxisKey.PRIVATE_CONVERSATION.weight).isEqualTo(5)
        assertThat(EngagementAxisKey.GROUP_CREATED.weight).isEqualTo(1)
        assertThat(EngagementAxisKey.STICKER.weight).isEqualTo(1)
        assertThat(EngagementAxisKey.FRIENDSHIP.weight).isEqualTo(7)
    }

    @Test
    fun `les familles se trient par poids decroissant`() {
        assertThat(EngagementCatalog.familiesByWeight()).containsExactly(
            EngagementAxisFamily.CONTENT, EngagementAxisFamily.SOCIAL, EngagementAxisFamily.CONVERSATION,
            EngagementAxisFamily.COMMENT, EngagementAxisFamily.TOOL,
        ).inOrder()
    }

    @Test
    fun `le tri par gain maximal est decroissant et stable`() {
        assertThat(EngagementCatalog.familiesByTopPoints()).containsExactly(
            EngagementAxisFamily.CONTENT, EngagementAxisFamily.COMMENT, EngagementAxisFamily.SOCIAL,
            EngagementAxisFamily.CONVERSATION, EngagementAxisFamily.TOOL,
        ).inOrder()
    }

    @Test
    fun `les cles de palier sont celles que la passerelle grave`() {
        assertThat(EngagementCatalog.badgeMilestoneKey(EngagementAxisKey.POST, 50)).isEqualTo("content.post:50")
        assertThat(EngagementCatalog.streakMilestoneKey(14)).isEqualTo("streak:14")
        assertThat(EngagementCatalog.levelMilestoneKey(400)).isEqualTo("level:400")
    }

    @Test
    fun `une cle inconnue se lit null`() {
        assertThat(EngagementAxisKey.fromWire("alien.axis")).isNull()
        assertThat(EngagementAxisKey.fromWire(null)).isNull()
    }
}
