package me.meeshy.sdk.conversation

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.runBlocking
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.SessionTransitionFlags
import me.meeshy.sdk.net.api.TranslateResponse
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.session.AccountFence
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * #13560 — a translation asked on demand by A (the viewer tapped a language) and answered after A signed out never
 * lands in B's row of the same message: the ticket is the one taken when the request left, not when it answered.
 */
@RunWith(RobolectricTestRunner::class)
class OnDemandTranslationAccountRaceTest {

    private class Owner(var id: String?) : OutboxOwnerSource {
        override fun currentOwnerId(): String? = id
    }

    private lateinit var db: MeeshyDatabase
    private val owner = Owner("A")
    private val transition = SessionTransitionFlags()
    private val fence = AccountFence(owner, transition)
    private val translationApi: TranslationApi = mockk()

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), MeeshyDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private suspend fun seed() = db.messageDao().upsertAll(
        listOf(
            MessageEntityFactory.cached(
                ApiMessage(id = "m1", conversationId = "c1", content = "bonjour", originalLanguage = "fr"),
                1L,
            ),
        ),
    )

    private suspend fun signOutThenSignInAsB() {
        owner.id = null
        transition.bumpGeneration()
        fence.close { db.clearAllTables() }
        owner.id = "B"
        transition.bumpGeneration()
        seed()
    }

    private fun writer() = MessageEnrichmentWriter(CachedMessageUpdater(db, db.messageDao(), fence), translationApi)

    private suspend fun cachedTranslations() =
        MeeshyApi.json.decodeFromString<ApiMessage>(db.messageDao().find("m1")!!.payload).translations

    @Test
    fun `a translation asked by A and answered after B signed in leaves B's row alone`(): Unit = runBlocking {
        seed()
        coEvery { translationApi.translate(any()) } coAnswers {
            signOutThenSignInAsB()
            ApiResponse(success = true, data = TranslateResponse(translatedText = "hello"))
        }

        val stored = writer().requestTranslation("m1", "en")

        assertThat(stored).isFalse()
        assertThat(cachedTranslations()).isEmpty()
    }

    @Test
    fun `a translation answered while A is still signed in is stored`(): Unit = runBlocking {
        seed()
        coEvery { translationApi.translate(any()) } returns
            ApiResponse(success = true, data = TranslateResponse(translatedText = "hello"))

        val stored = writer().requestTranslation("m1", "en")

        assertThat(stored).isTrue()
        assertThat(cachedTranslations().map { it.targetLanguage }).containsExactly("en")
    }
}
