package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class ConversationRoutesModelsTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }

    @Test
    fun `a receipts summary decodes tolerantly and keeps one row per message`() {
        val payload = json.decodeFromString<ReceiptsPayload>(
            """{"detail":"summary","messageIds":["m1","m2"],"futureField":1,
            "summary":{"m1":{"totalMembers":3,"receivedCount":3,"readCount":1,"deliveredToAllAt":"2026-01-01T00:00:00.000Z","readByAllAt":null},
                       "m2":{"totalMembers":3}}}""",
        )

        assertThat(payload.summary.keys).containsExactly("m1", "m2")
        assertThat(payload.summary.getValue("m2").readCount).isEqualTo(0)
        assertThat(payload.people).isEmpty()
        assertThat(payload.pagination).isNull()
    }

    @Test
    fun `a group message reads only once every recipient has read it`() {
        val partial = ReceiptSummaryRow(totalMembers = 3, receivedCount = 3, readCount = 2)
        val complete = partial.copy(readCount = 3)

        assertThat(partial.deliveryTier()).isEqualTo(DeliveryTier.Delivered)
        assertThat(complete.deliveryTier()).isEqualTo(DeliveryTier.Read)
    }

    @Test
    fun `a viewer who hides their own read receipts sees delivered instead of read`() {
        val read = ReceiptSummaryRow(totalMembers = 1, receivedCount = 1, readCount = 1)

        assertThat(read.deliveryTier(showReadReceipts = false)).isEqualTo(DeliveryTier.Delivered)
    }

    @Test
    fun `the tiers by message map every served row to its tick`() {
        val payload = ReceiptsPayload(
            summary = mapOf(
                "m1" to ReceiptSummaryRow(totalMembers = 1, receivedCount = 1, readCount = 1),
                "m2" to ReceiptSummaryRow(totalMembers = 1),
            ),
        )

        assertThat(payload.tiersByMessage()).containsExactly("m1", DeliveryTier.Read, "m2", DeliveryTier.Sent)
    }

    @Test
    fun `the people page decodes the nominative rows and the cursor`() {
        val payload = json.decodeFromString<ReceiptsPayload>(
            """{"detail":"people","people":[{"participantId":"p1","displayName":"Ana","avatar":null,"readAt":"2026-01-01T00:00:00.000Z","readDevice":"ios"}],
            "pagination":{"total":1,"limit":20,"offset":0,"hasMore":false,"nextCursor":null}}""",
        )

        assertThat(payload.people.single().readDevice).isEqualTo("ios")
        assertThat(payload.pagination?.hasMore).isFalse()
    }

    @Test
    fun `a write result from an old gateway without unreadCount still decodes`() {
        val result = json.decodeFromString<ReceiptWriteResult>("""{"markedCount":4}""")

        assertThat(result.markedCount).isEqualTo(4)
        assertThat(result.unreadCount).isEqualTo(0)
    }
}
