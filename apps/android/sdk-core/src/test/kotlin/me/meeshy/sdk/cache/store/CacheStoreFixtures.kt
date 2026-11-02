package me.meeshy.sdk.cache.store

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import kotlinx.serialization.Serializable
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CachePolicy

@Serializable
data class Row(val id: String, val label: String = "")

class FakeClock(var now: Long = 1_000_000L) : CacheClock {
    override fun nowMillis(): Long = now
}

val TestPolicy = CachePolicy(freshForMillis = 1_000, keepForMillis = 10_000, maxItemCount = 3)

fun inMemoryDatabase(): MeeshyDatabase = Room.inMemoryDatabaseBuilder(
    ApplicationProvider.getApplicationContext(),
    MeeshyDatabase::class.java,
).allowMainThreadQueries().build()

fun rowStore(db: MeeshyDatabase, clock: CacheClock, namespace: String = "test", policy: CachePolicy = TestPolicy) =
    RoomCacheStore(db.cacheEntryDao(), namespace, policy, Row.serializer(), { it.id }, clock)
