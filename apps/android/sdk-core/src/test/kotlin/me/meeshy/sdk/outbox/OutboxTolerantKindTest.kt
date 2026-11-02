package me.meeshy.sdk.outbox

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import org.junit.Test

class OutboxTolerantKindTest {

    private fun row(kind: String) = OutboxEntity(
        cmid = "c1", lane = "l", kind = kind, targetId = "t", payload = "{}", dependsOn = null,
        attempts = 0, state = "PENDING", createdAt = 0, updatedAt = 0,
    )

    @Test
    fun `a kind written by a newer build is ignored without throwing`() {
        assertThat(row("REPORT_STORY_VIEW_V2").kindEnum).isNull()
    }

    @Test
    fun `a known kind decodes`() {
        assertThat(row("LIKE_POST").kindEnum).isEqualTo(OutboxKind.LIKE_POST)
    }
}
