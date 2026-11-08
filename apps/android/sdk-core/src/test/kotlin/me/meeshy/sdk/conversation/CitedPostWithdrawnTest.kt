package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiPostReplyTarget
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CitedPostWithdrawnTest {

    private fun citing(id: String, postId: String = "p1", conversationId: String = "c1") = ApiMessage(
        id = id, conversationId = conversationId,
        postReplyTo = ApiPostReplyTarget(id = postId, previewText = "Plage", reactionCount = 4),
    )

    @Test
    fun `every citation of the withdrawn post becomes unavailable in a single write`() = runHarnessTest { harness ->
        listOf(citing("m1"), citing("m2"), citing("m3", postId = "p2"), citing("m4", conversationId = "c2")).forEach { harness.seedSynced(it) }
        val versions = listOf("m1", "m2", "m3", "m4").associateWith { harness.database.messageDao().find(it)!!.changeVersion }

        val written = CitedPostWithdrawn(harness.database, harness.updater).apply("c1", "p1")

        assertThat(written).containsExactly("c1")
        assertThat(harness.cachedMessage("m1").postReplyTo).isEqualTo(ApiPostReplyTarget(id = "p1", unavailable = true))
        assertThat(harness.cachedMessage("m2").postReplyTo!!.unavailable).isTrue()
        assertThat(harness.cachedMessage("m3").postReplyTo!!.unavailable).isFalse()
        assertThat(harness.cachedMessage("m4").postReplyTo!!.unavailable).isFalse()
        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isEqualTo(versions.getValue("m1") + 1)
        assertThat(harness.database.messageDao().find("m3")!!.changeVersion).isEqualTo(versions.getValue("m3"))
    }

    @Test
    fun `a second withdrawal writes nothing`() = runHarnessTest { harness ->
        harness.seedSynced(citing("m1"))
        val withdrawal = CitedPostWithdrawn(harness.database, harness.updater)
        withdrawal.apply("c1", "p1")
        val version = harness.database.messageDao().find("m1")!!.changeVersion

        assertThat(withdrawal.apply("c1", "p1")).isEmpty()
        assertThat(harness.database.messageDao().find("m1")!!.changeVersion).isEqualTo(version)
    }
}
