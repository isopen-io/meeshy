package me.meeshy.sdk.session

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import me.meeshy.core.database.dao.OutboxDao
import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.model.UpdateProfileRequest
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.OutboxLanes
import me.meeshy.sdk.outbox.OutboxState
import me.meeshy.sdk.outbox.kindEnum
import me.meeshy.sdk.outbox.stateEnum
import javax.inject.Inject

/**
 * The profile edits of an account that the gateway has not confirmed yet, oldest first.
 *
 * The outbox row IS the persisted pending profile: it survives a restart, so a re-read of the
 * identity at start-up re-applies it ([me.meeshy.sdk.model.ProfileSnapshot.resolveServerUserWithOptimistic])
 * instead of flashing the old server value until the flush delivers. An exhausted row is no
 * longer pending — the rollback has already happened.
 */
public fun interface PendingProfileEdits {

    /** Pending edits of [userId], oldest first, excluding the row [excludingCmid] (just delivered). */
    public suspend fun pendingFor(userId: String, excludingCmid: String?): List<UpdateProfileRequest>

    public companion object {
        /** No outbox: nothing is ever pending (tests, previews). */
        public val NONE: PendingProfileEdits = PendingProfileEdits { _, _ -> emptyList() }

        /**
         * Decodes the `UPDATE_PROFILE` rows of [userId] among [rows], keeping only [states]. A payload
         * that does not decode is skipped — it can never be delivered, the outbox discards it.
         */
        public fun decode(
            rows: List<OutboxEntity>,
            userId: String,
            json: Json,
            states: Set<OutboxState> = setOf(OutboxState.PENDING, OutboxState.INFLIGHT),
            excludingCmid: String? = null,
        ): List<UpdateProfileRequest> = rows
            .asSequence()
            .filter { it.kindEnum == OutboxKind.UPDATE_PROFILE && it.targetId == userId }
            .filter { it.stateEnum in states && it.cmid != excludingCmid }
            .sortedBy { it.createdAt }
            .mapNotNull { row -> runCatching { json.decodeFromString(UpdateProfileRequest.serializer(), row.payload) }.getOrNull() }
            .toList()
    }
}

/** [PendingProfileEdits] read from the durable outbox, profile lane. */
public class OutboxPendingProfileEdits @Inject constructor(
    private val outboxDao: OutboxDao,
    private val json: Json,
) : PendingProfileEdits {

    override suspend fun pendingFor(userId: String, excludingCmid: String?): List<UpdateProfileRequest> =
        PendingProfileEdits.decode(
            rows = outboxDao.deliverableForLane(OutboxLanes.PROFILE),
            userId = userId,
            json = json,
            excludingCmid = excludingCmid,
        )
}

@Module
@InstallIn(SingletonComponent::class)
public interface PendingProfileEditsModule {
    @Binds
    public fun pendingProfileEdits(impl: OutboxPendingProfileEdits): PendingProfileEdits
}
