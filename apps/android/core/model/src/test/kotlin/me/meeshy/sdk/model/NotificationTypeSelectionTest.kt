package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * La sélection de types que la cloche envoie à la passerelle, en query CSV
 * (`GET /notifications?types=…&hideReadTypes=…`) et en corps
 * (`POST /notifications/read-by-types`).
 */
class NotificationTypeSelectionTest {

    @Test
    fun `an empty selection says nothing instead of writing an empty parameter`() {
        assertThat(NotificationTypeSelection.csv(emptyList())).isNull()
        assertThat(NotificationTypeSelection.csv(listOf("", "  "))).isNull()
    }

    @Test
    fun `types are joined in arrival order without duplicates`() {
        val csv = NotificationTypeSelection.csv(listOf("user_mentioned", "mention", "user_mentioned"))

        assertThat(csv).isEqualTo("user_mentioned,mention")
    }

    @Test
    fun `types are trimmed and blanks dropped`() {
        val csv = NotificationTypeSelection.csv(listOf(" friend_request ", "", "contact_request"))

        assertThat(csv).isEqualTo("friend_request,contact_request")
    }

    /** Une virgule dans un type casserait la liste CSV en deux types que personne n'a demandés. */
    @Test
    fun `a type carrying a comma is dropped rather than split`() {
        assertThat(NotificationTypeSelection.csv(listOf("a,b", "ok"))).isEqualTo("ok")
    }

    @Test
    fun `read batches of an empty selection send nothing`() {
        assertThat(NotificationTypeSelection.readBatches(emptyList())).isEmpty()
    }

    @Test
    fun `a selection within the gateway bound is a single body`() {
        val batches = NotificationTypeSelection.readBatches(listOf("friend_request", "contact_request"))

        assertThat(batches).hasSize(1)
        assertThat(batches.single().types).containsExactly("friend_request", "contact_request").inOrder()
    }

    /** La passerelle refuse plus de 30 types : une sélection plus longue part en tranches, aucun type n'est perdu. */
    @Test
    fun `a selection beyond the gateway bound is split into batches without losing a type`() {
        val types = (1..65).map { "type_$it" }

        val batches = NotificationTypeSelection.readBatches(types)

        assertThat(batches.map { it.types.size }).containsExactly(30, 30, 5).inOrder()
        assertThat(batches.flatMap { it.types }).containsExactlyElementsIn(types).inOrder()
    }

    @Test
    fun `the request refuses an empty or oversized list`() {
        assertThrows(IllegalArgumentException::class.java) { ReadNotificationsByTypesRequest(emptyList()) }
        assertThrows(IllegalArgumentException::class.java) {
            ReadNotificationsByTypesRequest((1..31).map { "t$it" })
        }
    }

    @Test
    fun `the read by types body is a types array`() {
        val body = Json.encodeToString(
            ReadNotificationsByTypesRequest.serializer(),
            ReadNotificationsByTypesRequest(listOf("friend_request")),
        )

        assertThat(body).isEqualTo("""{"types":["friend_request"]}""")
    }

    @Test
    fun `counts decode the gateway data object and tolerate a type map`() {
        val counts = Json { ignoreUnknownKeys = true }.decodeFromString(
            NotificationCounts.serializer(),
            """{"total":5,"unread":2,"byType":{"new_message":3,"friend_request":2}}""",
        )

        assertThat(counts.total).isEqualTo(5)
        assertThat(counts.unread).isEqualTo(2)
        assertThat(counts.byType).containsExactly("new_message", 3, "friend_request", 2)
    }

    @Test
    fun `counts of an older gateway default to zero`() {
        val counts = Json { ignoreUnknownKeys = true }.decodeFromString(NotificationCounts.serializer(), "{}")

        assertThat(counts).isEqualTo(NotificationCounts())
    }
}
