package me.meeshy.sdk.session

import com.google.common.truth.Truth.assertThat
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxState
import org.junit.Test

/**
 * The pending profile is the outbox row itself: persisted until confirmation, then gone. Only the
 * account's own `UPDATE_PROFILE` rows count, oldest first, and an exhausted (rolled back) row no longer does.
 */
class PendingProfileStoreTest {

    private fun row(
        cmid: String,
        request: UpdateProfileRequest?,
        state: OutboxState = OutboxState.PENDING,
        kind: OutboxKind = OutboxKind.UPDATE_PROFILE,
        targetId: String = "u1",
        createdAt: Long = 1L,
    ) = OutboxEntity(
        cmid = cmid,
        lane = OutboxLanes.PROFILE,
        kind = kind.name,
        targetId = targetId,
        payload = request?.let { MeeshyApi.json.encodeToString(UpdateProfileRequest.serializer(), it) } ?: "[]",
        dependsOn = null,
        attempts = 0,
        state = state.name,
        createdAt = createdAt,
        updatedAt = createdAt,
    )

    private fun decode(rows: List<OutboxEntity>, excluding: String? = null) =
        PendingProfileEdits.decode(rows, userId = "u1", json = MeeshyApi.json, excludingCmid = excluding)

    @Test
    fun `pending and in-flight edits are kept, oldest first`() {
        val pending = decode(
            listOf(
                row("b", UpdateProfileRequest(displayName = "Second"), createdAt = 2L),
                row("a", UpdateProfileRequest(bio = ""), state = OutboxState.INFLIGHT, createdAt = 1L),
            ),
        )

        assertThat(pending).containsExactly(
            UpdateProfileRequest(bio = ""),
            UpdateProfileRequest(displayName = "Second"),
        ).inOrder()
    }

    @Test
    fun `a confirmed or abandoned edit is no longer pending`() {
        val pending = decode(
            listOf(row("a", UpdateProfileRequest(bio = "x"), state = OutboxState.EXHAUSTED)),
        )

        assertThat(pending).isEmpty()
        assertThat(decode(emptyList())).isEmpty()
    }

    @Test
    fun `the delivered row, another account, another kind and an unreadable payload are skipped`() {
        val pending = decode(
            listOf(
                row("delivered", UpdateProfileRequest(bio = "sent")),
                row("other", UpdateProfileRequest(bio = "theirs"), targetId = "u2"),
                row("settings", UpdateProfileRequest(bio = "nope"), kind = OutboxKind.UPDATE_SETTINGS),
                row("broken", null),
                row("kept", UpdateProfileRequest(displayName = "Kept")),
            ),
            excluding = "delivered",
        )

        assertThat(pending).containsExactly(UpdateProfileRequest(displayName = "Kept"))
    }
}
