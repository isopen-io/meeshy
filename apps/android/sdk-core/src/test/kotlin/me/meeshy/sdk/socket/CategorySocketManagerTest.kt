package me.meeshy.sdk.socket

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.CategoryEvent
import me.meeshy.sdk.model.CategoryOption
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Behavioural spec for the category socket bridge: each gateway broadcast decodes to
 * its wire payload and emerges on the unified [CategorySocketManager.categoryEvents]
 * flow as the pure [CategoryEvent] the catalogue reducer applies.
 */
@RunWith(RobolectricTestRunner::class)
class CategorySocketManagerTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun managerWithHandlers(): Pair<CategorySocketManager, Map<String, (Array<Any>) -> Unit>> {
        val socket: SocketManager = mockk(relaxed = true)
        val handlers = mutableMapOf<String, (Array<Any>) -> Unit>()
        every { socket.on(any(), any()) } answers {
            handlers[firstArg()] = secondArg()
        }
        val manager = CategorySocketManager(socket, json)
        manager.attach()
        return manager to handlers
    }

    @Test
    fun `a created broadcast emits an Upserted event with the narrowed option`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryEvents.test {
            handlers.getValue("category:created").invoke(
                arrayOf(
                    JSONObject(
                        """{"userId":"u1","category":{"id":"work","userId":"u1","name":"Work",""" +
                            """"color":"#FF0000","icon":"briefcase","order":2,"isExpanded":true}}""",
                    ),
                ),
            )
            assertThat(awaitItem())
                .isEqualTo(CategoryEvent.Upserted(CategoryOption(id = "work", name = "Work", order = 2)))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `an updated broadcast emits an Upserted event`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryEvents.test {
            handlers.getValue("category:updated").invoke(
                arrayOf(JSONObject("""{"userId":"u1","category":{"id":"fam","name":"Family","order":1}}""")),
            )
            assertThat(awaitItem())
                .isEqualTo(CategoryEvent.Upserted(CategoryOption(id = "fam", name = "Family", order = 1)))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a deleted broadcast emits a Deleted event`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryEvents.test {
            handlers.getValue("category:deleted").invoke(
                arrayOf(JSONObject("""{"userId":"u1","categoryId":"gone"}""")),
            )
            assertThat(awaitItem()).isEqualTo(CategoryEvent.Deleted("gone"))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a reordered broadcast emits a Reordered event as an id-to-order map`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryEvents.test {
            handlers.getValue("categories:reordered").invoke(
                arrayOf(
                    JSONObject(
                        """{"userId":"u1","updates":[{"categoryId":"a","order":0},{"categoryId":"b","order":2}]}""",
                    ),
                ),
            )
            assertThat(awaitItem()).isEqualTo(CategoryEvent.Reordered(mapOf("a" to 0, "b" to 2)))
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `a malformed category payload is ignored without emitting`() = runTest {
        val (manager, handlers) = managerWithHandlers()
        manager.categoryEvents.test {
            handlers.getValue("category:deleted").invoke(
                arrayOf(JSONObject("""{"userId":"u1"}""")),
            )
            expectNoEvents()
        }
    }
}
