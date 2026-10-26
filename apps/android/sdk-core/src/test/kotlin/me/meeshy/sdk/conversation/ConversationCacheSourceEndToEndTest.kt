package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.core.database.dao.SearchIndexDao
import me.meeshy.core.database.entity.ConversationEntity
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.e2ee.InMemoryEndToEndRegimeLedger
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.search.LocalSearchIndex
import me.meeshy.sdk.sync.SyncAccountProvider
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #12956 — UNE CONVERSATION VUE CHIFFRÉE DE BOUT EN BOUT RESTE FERMÉE AU CLAIR sur l'Android
 * natif : la ligne Room garde le mode e2ee quoi que la passerelle serve ensuite, le composeur, le
 * transfert, le partage et les stories la tiennent fermée (`ChatUiState.isEndToEnd`,
 * `mayCurrentUserWrite`), et l'outbox n'y laisse partir aucun clair.
 */
@RunWith(RobolectricTestRunner::class)
class ConversationCacheSourceEndToEndTest {

    private lateinit var db: MeeshyDatabase
    private val account = SyncAccountProvider { "u-moi" }
    private val ledger = InMemoryEndToEndRegimeLedger(account)

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private val clock = object : CacheClock {
        override fun nowMillis() = 1_700_000_000_000L
    }

    private fun source() = ConversationCacheSource(
        database = db,
        conversationDao = db.conversationDao(),
        syncMetaDao = db.syncMetaDao(),
        conversationApi = mockk<ConversationApi>(),
        clock = clock,
        searchIndex = LocalSearchIndex(SearchIndexDao(db)),
        accountProvider = account,
        endToEnd = ledger,
    )

    private suspend fun cachedMode(id: String): String? =
        db.conversationDao().find(id)?.payload?.let { MeeshyApi.json.decodeFromString<ApiConversation>(it).encryptionMode }

    @Test
    fun `servie e2ee puis sans mode : la ligne garde le mode e2ee`() = runTest {
        source().remember(ApiConversation(id = "c1", encryptionMode = "e2ee"))
        source().remember(ApiConversation(id = "c1", encryptionMode = null))

        assertThat(cachedMode("c1")).isEqualTo("e2ee")
        assertThat(ledger.isSealed("c1")).isTrue()
    }

    @Test
    fun `apprise par le registre : une rétrogradation vers server est ignorée`() = runTest {
        ledger.learn("c2")
        source().remember(ApiConversation(id = "c2", encryptionMode = "server"))

        assertThat(cachedMode("c2")).isEqualTo("e2ee")
    }

    @Test
    fun `une ligne e2ee rangée avant le registre est apprise, et ne se rétrograde pas`() = runTest {
        db.conversationDao().upsertAll(
            listOf(ConversationEntity("c3", MeeshyApi.json.encodeToString(ApiConversation(id = "c3", encryptionMode = "e2ee")), 1L, 1L, 0)),
        )
        source().remember(ApiConversation(id = "c3", encryptionMode = null))

        assertThat(cachedMode("c3")).isEqualTo("e2ee")
    }

    @Test
    fun `une conversation jamais vue e2ee passe telle que servie`() = runTest {
        source().remember(ApiConversation(id = "c4", encryptionMode = "server"))

        assertThat(cachedMode("c4")).isEqualTo("server")
        assertThat(ledger.isSealed("c4")).isFalse()
    }

    @Test
    fun `apprise par le temps réel : la ligne Room ferme le fil ouvert à l'instant`() = runTest {
        source().remember(ApiConversation(id = "c5", encryptionMode = null))

        EndToEndRegimeKeeper(ledger, db.conversationDao()).learn("c5")

        assertThat(cachedMode("c5")).isEqualTo("e2ee")
        assertThat(ledger.isSealed("c5")).isTrue()
    }
}
