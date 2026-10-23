package me.meeshy.sdk.profile

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.category.InMemoryCategorySnapshotStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.session.DefaultSessionTeardown
import me.meeshy.sdk.story.InMemoryStoryComposerDraftStore
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ProfileCardTeardownTest {
    @Test
    fun `la deconnexion efface les fiches profile_card du compte precedent`() = runTest {
        val db = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            MeeshyDatabase::class.java,
        ).allowMainThreadQueries().build()
        val profiles = ProfileCacheRepository(db.keyedJsonCacheDao())
        profiles.store(MeeshyUser(id = "64b7f0a1c2d3e4f5a6b7c8d9", username = "bob"), "bob")
        assertThat(profiles.cachedProfile("bob")).isNotNull()

        DefaultSessionTeardown(
            db,
            InMemoryCategorySnapshotStore(),
            InMemoryConversationDraftStore(),
            InMemoryConversationLockStore(),
            InMemoryStoryComposerDraftStore(),
            FriendshipCache(),
            NotificationRepository(mockk(relaxed = true)),
            BlockCache(),
        ).wipe()

        assertThat(profiles.cachedProfile("bob")).isNull()
        assertThat(db.keyedJsonCacheDao().findAll(ProfileCacheRepository.NAMESPACE)).isEmpty()
        db.close()
    }
}
