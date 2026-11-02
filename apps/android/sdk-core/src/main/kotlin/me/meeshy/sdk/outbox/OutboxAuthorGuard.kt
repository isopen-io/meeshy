package me.meeshy.sdk.outbox

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.session.SessionRepository
import javax.inject.Inject

/** The account on whose behalf the outbox acts right now, or `null` when nobody is signed in. */
public fun interface OutboxOwnerSource {
    public fun currentOwnerId(): String?
}

/** What the flusher does with one row given who wrote it and who is signed in. */
public enum class AuthorVerdict {
    /** The row belongs to the signed-in account: deliver it. */
    SEND,

    /** Another account (or nobody) is signed in: leave the row untouched, charge no attempt. */
    WAIT,

    /** A row written before authorship existed: it can never be attributed, so it gives up unsent. */
    EXHAUST_NO_AUTHOR,
}

/**
 * A mutation never leaves under another account than the one that enqueued it. Account A's
 * rows survive B's session untouched and leave when A comes back.
 */
public object OutboxAuthorGuard {

    public fun verdict(rowOwnerId: String?, currentOwnerId: String?): AuthorVerdict = when {
        currentOwnerId == null -> AuthorVerdict.WAIT
        rowOwnerId == null -> AuthorVerdict.EXHAUST_NO_AUTHOR
        rowOwnerId == currentOwnerId -> AuthorVerdict.SEND
        else -> AuthorVerdict.WAIT
    }

    public const val REASON_NO_AUTHOR: String = "Queued before authorship existed; cannot be attributed"
}

/** Reads the signed-in account from the session, falling back to the persisted id on a cold start. */
public class SessionOutboxOwnerSource @Inject constructor(
    private val session: SessionRepository,
    private val tokens: TokenStore,
) : OutboxOwnerSource {
    override fun currentOwnerId(): String? =
        (session.currentUserId ?: tokens.userId)?.takeIf { it.isNotBlank() }
}

@Module
@InstallIn(SingletonComponent::class)
public interface OutboxOwnerModule {
    @Binds
    public fun ownerSource(impl: SessionOutboxOwnerSource): OutboxOwnerSource
}
