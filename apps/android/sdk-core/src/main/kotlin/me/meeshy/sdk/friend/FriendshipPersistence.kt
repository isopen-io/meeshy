package me.meeshy.sdk.friend

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RoomPersistedFriendCaches @Inject constructor(
    private val friends: FriendListRepository,
    private val requests: FriendRequestListRepository,
) : PersistedFriendCaches {
    /**
     * The three persisted rosters read ignoring their age — a stale roster beats a wrong "Add"
     * button on a cold, offline start. `null` when none was ever synced.
     */
    override suspend fun seed(): FriendshipSeed? {
        val friendRoster = friends.cachedSnapshot()
        val received = requests.cachedReceived()
        val sent = requests.cachedSent()
        if (friendRoster == null && received == null && sent == null) return null
        return FriendshipSeed(
            friends = friendRoster.orEmpty(),
            received = received.orEmpty(),
            sent = sent.orEmpty(),
        )
    }

    override suspend fun invalidate() {
        friends.invalidate()
        requests.invalidate()
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class FriendshipPersistenceModule {
    @Binds
    abstract fun bindPersistedFriendCaches(impl: RoomPersistedFriendCaches): PersistedFriendCaches
}
