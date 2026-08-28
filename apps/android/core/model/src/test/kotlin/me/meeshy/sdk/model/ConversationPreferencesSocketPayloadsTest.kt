package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Behavioural spec for the conversation-scope `user:preferences-updated` wire
 * payload and for [applyRemote], the pure arbiter the repository wraps.
 *
 * Every witness below feeds the REAL emitter payload — the object
 * `writeConversationPreferences` hands `broadcastToUser`
 * (`services/gateway/src/services/conversationPreferencesSync.ts`), copied key by
 * key — through the REAL decoder, rather than a Kotlin literal written in this
 * client's own vocabulary: a payload invented here would agree with a decoder that
 * disagrees with the gateway, which is exactly how the Android list spent every
 * cycle since the event existed rendering a stale pin (#4127).
 */
class ConversationPreferencesSocketPayloadsTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    /**
     * `writeConversationPreferences` → `toPreferencesPayload(row)` for a row that
     * has every column set. Reproduced verbatim, `null`s included: socket.io ships
     * the TS `null`s on the wire, so the decoder has to tolerate the KEY being
     * present and null, not merely absent.
     */
    private val fullBroadcast = """
        {
          "userId": "u1",
          "conversationId": "c1",
          "version": 4,
          "reset": false,
          "preferences": {
            "isPinned": true,
            "isMuted": true,
            "mentionsOnly": true,
            "isArchived": true,
            "tags": ["work", "urgent"],
            "categoryId": "cat-1",
            "orderInCategory": 3,
            "customName": "Sany",
            "reaction": "❤️",
            "readingMode": "focal",
            "deletedForUserAt": null,
            "clearHistoryBefore": "2026-08-28T10:00:00.000Z"
          }
        }
    """.trimIndent()

    private fun decode(raw: String) =
        json.decodeFromString<UserPreferencesConversationUpdatedSocketData>(raw)

    @Test
    fun `the emitter's full payload decodes key by key`() {
        val event = decode(fullBroadcast)

        assertThat(event.userId).isEqualTo("u1")
        assertThat(event.conversationId).isEqualTo("c1")
        assertThat(event.version).isEqualTo(4)
        assertThat(event.reset).isFalse()
        val prefs = requireNotNull(event.preferences)
        assertThat(prefs.isPinned).isTrue()
        assertThat(prefs.isMuted).isTrue()
        assertThat(prefs.mentionsOnly).isTrue()
        assertThat(prefs.isArchived).isTrue()
        assertThat(prefs.tags).containsExactly("work", "urgent").inOrder()
        assertThat(prefs.categoryId).isEqualTo("cat-1")
        assertThat(prefs.orderInCategory).isEqualTo(3)
        assertThat(prefs.customName).isEqualTo("Sany")
        assertThat(prefs.reaction).isEqualTo("❤️")
        assertThat(prefs.readingMode).isEqualTo("focal")
        assertThat(prefs.deletedForUserAt).isNull()
        assertThat(prefs.clearHistoryBefore).isEqualTo("2026-08-28T10:00:00.000Z")
    }

    @Test
    fun `a pin set on another device lands on the cached row`() {
        val next = ApiConversationPreferences().applyRemote(decode(fullBroadcast))

        assertThat(next).isEqualTo(
            ApiConversationPreferences(
                isPinned = true,
                isMuted = true,
                isArchived = true,
                deletedForUserAt = null,
                customName = "Sany",
                categoryId = "cat-1",
                mentionsOnly = true,
                reaction = "❤️",
                tags = listOf("work", "urgent"),
                version = 4,
            ),
        )
    }

    /**
     * The row is per USER, so the device that just wrote receives its own broadcast
     * back. It carries the version it produced, never a higher one, so the local
     * snapshot must stand.
     */
    @Test
    fun `a broadcast at the local version is dropped`() {
        val local = ApiConversationPreferences(isPinned = true, version = 4)

        assertThat(local.applyRemote(decode(fullBroadcast))).isNull()
    }

    @Test
    fun `a broadcast older than the local snapshot is dropped rather than rewinding it`() {
        val local = ApiConversationPreferences(isPinned = false, customName = "newer", version = 9)

        assertThat(local.applyRemote(decode(fullBroadcast))).isNull()
    }

    /**
     * The `0` baseline is what makes the gateway's first upsert start at version 1:
     * an absent local snapshot and "nothing has happened yet" have to be the same
     * value, or the first broadcast of a conversation's life would be indiscernible
     * from a stale one.
     */
    @Test
    fun `an absent local snapshot counts as version zero, so the first broadcast applies`() {
        val next = (null as ApiConversationPreferences?).applyRemote(decode(fullBroadcast))

        assertThat(next?.version).isEqualTo(4)
        assertThat(next?.isPinned).isTrue()
    }

    /** `DELETE /user-preferences/conversations/:id` — defaults restored, counter kept. */
    @Test
    fun `a reset restores the defaults while keeping the version monotone`() {
        val local = ApiConversationPreferences(isPinned = true, customName = "Sany", version = 4)
        val reset = decode("""{"userId":"u1","conversationId":"c1","version":5,"reset":true}""")

        assertThat(local.applyRemote(reset)).isEqualTo(ApiConversationPreferences(version = 5))
    }

    @Test
    fun `a reset that lost the version arbitration is dropped like any other`() {
        val local = ApiConversationPreferences(isPinned = true, version = 7)
        val reset = decode("""{"userId":"u1","conversationId":"c1","version":5,"reset":true}""")

        assertThat(local.applyRemote(reset)).isNull()
    }

    /**
     * A snapshot-less non-reset teaches nothing, and advancing the counter on it
     * would make the NEXT broadcast — the one that carries the state — fall. Web
     * guards this explicitly; iOS advances the version instead. The gateway emits
     * the shape on no path today, so the divergence is latent, and Android takes
     * the side that cannot lose an update.
     */
    @Test
    fun `a non-reset carrying no snapshot is dropped without advancing the counter`() {
        val local = ApiConversationPreferences(isPinned = true, version = 4)
        val empty = decode("""{"userId":"u1","conversationId":"c1","version":5,"reset":false}""")

        assertThat(local.applyRemote(empty)).isNull()
        assertThat(local.applyRemote(decode(fullBroadcast).copy(version = 5))?.version).isEqualTo(5)
    }

    /**
     * The gateway sends `tags: []`, `categoryId: null`, `customName: null` on a row
     * whose columns were cleared — an unpin-and-uncategorise from another device has
     * to land as a CLEAR, never as "leave what you had".
     */
    @Test
    fun `cleared columns clear the cached row rather than leaving the previous value`() {
        val local = ApiConversationPreferences(
            isPinned = true,
            customName = "Sany",
            categoryId = "cat-1",
            reaction = "❤️",
            tags = listOf("work"),
            version = 4,
        )
        val cleared = decode(
            """
            {
              "userId": "u1", "conversationId": "c1", "version": 5, "reset": false,
              "preferences": {
                "isPinned": false, "isMuted": false, "mentionsOnly": false, "isArchived": false,
                "tags": [], "categoryId": null, "orderInCategory": null, "customName": null,
                "reaction": null, "readingMode": "auto",
                "deletedForUserAt": null, "clearHistoryBefore": null
              }
            }
            """.trimIndent(),
        )

        assertThat(local.applyRemote(cleared)).isEqualTo(ApiConversationPreferences(version = 5))
    }

    /**
     * `delete-for-me` writes `deletedForUserAt` through the same single writer, so
     * it travels on this event too — the one column of the payload that Android
     * already reads.
     */
    @Test
    fun `a delete-for-me performed elsewhere carries its timestamp`() {
        val deleted = decode(
            """
            {
              "userId": "u1", "conversationId": "c1", "version": 2, "reset": false,
              "preferences": {
                "isPinned": false, "isMuted": false, "mentionsOnly": false, "isArchived": false,
                "tags": [], "categoryId": null, "orderInCategory": null, "customName": null,
                "reaction": null, "readingMode": "auto",
                "deletedForUserAt": "2026-08-28T12:30:00.000Z", "clearHistoryBefore": null
              }
            }
            """.trimIndent(),
        )

        assertThat(ApiConversationPreferences().applyRemote(deleted)?.deletedForUserAt)
            .isEqualTo("2026-08-28T12:30:00.000Z")
    }

    /**
     * A REST-hydrated row carries no version (`conversationUserPreferencesSelect`
     * does not select it), so it lands at the `0` baseline and the first broadcast
     * after a cold start applies — the behaviour the two other clients already have.
     */
    @Test
    fun `a REST-hydrated conversation decodes its preferences at the version zero baseline`() {
        val conversation = json.decodeFromString<ApiConversation>(
            """
            {
              "id": "c1",
              "userPreferences": [
                { "isPinned": true, "isMuted": false, "isArchived": false, "tags": [] }
              ]
            }
            """.trimIndent(),
        )

        assertThat(conversation.resolvedPreferences?.version).isEqualTo(0)
        assertThat(conversation.resolvedPreferences.applyRemote(decode(fullBroadcast))?.version)
            .isEqualTo(4)
    }
}
