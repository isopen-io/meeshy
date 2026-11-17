package me.meeshy.app.push

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.app.R
import me.meeshy.app.navigation.ConversationNotificationCanceller
import me.meeshy.sdk.model.UnreadUpdateEvent
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Une conversation lue AILLEURS (autre appareil, « marquer comme lu » depuis la liste) ne laisse plus ses bannières ni
 * leur nombre dans le tiroir : le serveur dit « zéro non lu » (`unread:updated`), ou la lecture est locale.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28])
class ReadElsewhereBannerClearerTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val updates = MutableSharedFlow<UnreadUpdateEvent>(extraBufferCapacity = 8)
    private val reads = MutableSharedFlow<String>(extraBufferCapacity = 8)

    @Before
    fun setUp() {
        manager.cancelAll()
    }

    private fun banner(text: String) = NotificationCompat.Builder(context, "meeshy_messages_v2")
        .setSmallIcon(R.drawable.ic_stat_meeshy)
        .setContentText(text)
        .build()

    private fun postAppBanner(conversationId: String) {
        val id = MessageNotificationId.forConversation("new_message", conversationId)!!
        manager.notify(id, banner("posée par l'application"))
    }

    private fun postSystemBanner(conversationId: String) {
        manager.notify(conversationId, 0, banner("rendue par FCM"))
    }

    private fun remaining(): List<Pair<String?, Int>> = manager.activeNotifications.map { it.tag to it.id }

    private fun clearer() = ReadElsewhereBannerClearer(
        unreadUpdates = updates,
        localReads = reads,
        canceller = ConversationNotificationCanceller(context),
    )

    @Test
    fun `un zero non lu venu du serveur retire les bannieres de la conversation, celle de l application et celle de FCM`() =
        runTest(UnconfinedTestDispatcher()) {
            postAppBanner("c1")
            postSystemBanner("c1")
            clearer().start(backgroundScope)

            updates.emit(UnreadUpdateEvent(conversationId = "c1", unreadCount = 0))

            assertThat(remaining()).isEmpty()
        }

    @Test
    fun `un compte non nul ou une autre conversation laissent les bannieres de la conversation`() =
        runTest(UnconfinedTestDispatcher()) {
            postAppBanner("c1")
            postSystemBanner("c1")
            clearer().start(backgroundScope)

            updates.emit(UnreadUpdateEvent(conversationId = "c1", unreadCount = 2))
            updates.emit(UnreadUpdateEvent(conversationId = "c2", unreadCount = 0))

            assertThat(remaining()).hasSize(2)
        }

    @Test
    fun `une lecture locale retire les bannieres de la conversation`() = runTest(UnconfinedTestDispatcher()) {
        postAppBanner("c1")
        postAppBanner("c2")
        clearer().start(backgroundScope)

        reads.emit("c1")

        assertThat(remaining()).containsExactly(null to MessageNotificationId.forConversation("new_message", "c2")!!)
    }
}
