package me.meeshy.core.database

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.core.database.entity.MessageEntity
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MessageDaoInsertIfAbsentTest {
    private lateinit var db: MeeshyDatabase

    private fun row(id: String, payload: String) =
        MessageEntity(id = id, conversationId = "c1", seq = null, payload = payload, createdAt = 1L, cachedAt = 1L)

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries().build()
    }

    @After
    fun tearDown() = db.close()

    @Test
    fun `an absent row is inserted`() = runTest {
        val written = db.messageDao().insertIfAbsent(listOf(row("m1", "{a}")))

        assertThat(written.single()).isNotEqualTo(-1L)
        assertThat(db.messageDao().find("m1")?.payload).isEqualTo("{a}")
    }

    @Test
    fun `an existing row is never replaced`() = runTest {
        db.messageDao().upsertAll(listOf(row("m1", "{rich}")))

        val written = db.messageDao().insertIfAbsent(listOf(row("m1", "{minimal}"), row("m2", "{new}")))

        assertThat(written[0]).isEqualTo(-1L)
        assertThat(db.messageDao().find("m1")?.payload).isEqualTo("{rich}")
        assertThat(db.messageDao().find("m2")?.payload).isEqualTo("{new}")
    }
}
