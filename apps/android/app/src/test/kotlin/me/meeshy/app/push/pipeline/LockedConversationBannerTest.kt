package me.meeshy.app.push.pipeline

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.app.R
import me.meeshy.app.push.IncomingPush
import me.meeshy.app.push.LaunchIntentProof
import me.meeshy.app.push.PushTapExtras
import me.meeshy.app.push.enrich.RichMediaEnricher
import me.meeshy.app.push.media.PushMediaFetcher
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.net.InMemoryTokenStore
import me.meeshy.sdk.notification.ActiveConversationStore
import me.meeshy.sdk.notification.InMemoryNotificationPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.io.File

/**
 * Le verrou PIN protège le CONTENU de la bannière (miroir de la NSE iOS, `NSEAttachmentPolicy.sealingLockedConversation`) :
 * une conversation verrouillée affiche un libellé localisé, jamais le texte, la photo, l'avatar ni une action.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class LockedConversationBannerTest {

    private lateinit var context: Context
    private lateinit var manager: NotificationManager

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.cancelAll()
    }

    private val secret = "mon code de porte est 4471"
    private val avatar = "https://gate.meeshy.me/u/bob.jpg"
    private val photo = "https://gate.meeshy.me/a/photo.jpg"

    private val fetcher = mockk<PushMediaFetcher>().also {
        coEvery { it.fetch(any(), any(), any(), any(), any()) } answers { imageFile() }
    }

    private fun imageFile(): File = File.createTempFile("push", ".png").also { file ->
        file.outputStream().use { Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    private val session = mockk<SessionRepository>(relaxed = true) { every { currentUserId } returns "me" }

    private fun lockedStore(vararg ids: String) = InMemoryConversationLockStore().also { store ->
        ids.forEach { store.setLock(it, "1234") }
    }

    private fun pipeline(locks: ConversationLockStore) = PushNotificationPipeline(
        context = context,
        preferencesStore = InMemoryNotificationPreferencesStore(),
        activeConversationStore = ActiveConversationStore(),
        environment = object : PushEnvironment {
            override fun isAppInForeground() = false
            override fun isSocketConnected() = false
            override fun interruptionFilter() = 1
            override suspend fun localUnreadConversations(): Int? = null
        },
        enrichers = setOf(
            MessagingStyleEnricher(context, fetcher),
            BigTextEnricher(),
            RichMediaEnricher(context, fetcher),
            MessageActionsEnricher(context, session, LaunchIntentProof(context), InMemoryTokenStore(), locks),
        ),
        summaryNotifier = PushSummaryNotifier(context),
        lockStore = locks,
    )

    private fun message(conversationId: String = "c1", id: String = "n1", vararg extra: Pair<String, String>) = IncomingPush.of(
        mapOf(
            "type" to "new_message",
            "notificationId" to id,
            "conversationId" to conversationId,
            "messageId" to "m-$id",
            "senderId" to "u1",
            "senderDisplayName" to "Bob",
            "title" to "Bob",
            "body" to secret,
            *extra,
        ),
    )

    private fun banners(): List<Notification> =
        manager.activeNotifications.map { it.notification }.filter { (it.flags and Notification.FLAG_GROUP_SUMMARY) == 0 }

    private fun child(): Notification = banners().single()

    private fun shownText(n: Notification): List<String> {
        val extras = n.extras
        val keys = listOf(
            NotificationCompat.EXTRA_TITLE, NotificationCompat.EXTRA_TEXT, NotificationCompat.EXTRA_BIG_TEXT,
            NotificationCompat.EXTRA_SUMMARY_TEXT, NotificationCompat.EXTRA_SUB_TEXT, NotificationCompat.EXTRA_TITLE_BIG,
        )
        val plain = keys.mapNotNull { extras.getCharSequence(it)?.toString() }
        val styled = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
            ?.messages.orEmpty().map { it.text.toString() }
        return plain + styled
    }

    private val lockedLabel get() = context.getString(R.string.push_placeholder_locked)

    @Test
    fun `une conversation verrouillee n affiche ni son texte ni son avatar ni une action`() = runTest {
        pipeline(lockedStore("c1")).renderNow(
            message("c1", "n1", "senderAvatar" to avatar, "imageURL" to avatar, "subtitle" to secret),
        )

        val banner = child()
        assertThat(shownText(banner).filter { secret in it || "4471" in it }).isEmpty()
        assertThat(shownText(banner)).contains(lockedLabel)
        assertThat(banner.actions).isNull()
        assertThat(banner.extras.containsKey(NotificationCompat.EXTRA_PICTURE)).isFalse()
        coVerify(exactly = 0) { fetcher.fetch(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `la photo d une conversation verrouillee ne voyage pas jusqu a la banniere`() = runTest {
        pipeline(lockedStore("c1")).renderNow(
            message(
                "c1", "n1",
                "senderAvatar" to avatar,
                "attachmentUrl" to photo, "attachmentMimeType" to "image/jpeg", "firstAttachmentUrl" to photo,
                "thumbnailUrl" to photo,
            ),
        )

        val banner = child()
        assertThat(banner.extras.containsKey(NotificationCompat.EXTRA_PICTURE)).isFalse()
        assertThat(banner.getLargeIcon()).isNull()
        coVerify(exactly = 0) { fetcher.fetch(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `sans verrou le texte est servi et la photo est demandee`() = runTest {
        pipeline(lockedStore("autre")).renderNow(message("c1", "n1", "senderAvatar" to avatar))

        assertThat(shownText(child())).contains(secret)
        coVerify(exactly = 1) { fetcher.fetch(avatar, any(), any(), any(), any()) }
    }

    @Test
    fun `seule la conversation verrouillee est scellee`() = runTest {
        val pipeline = pipeline(lockedStore("c1"))
        pipeline.renderNow(message("c1", "n1"))
        pipeline.renderNow(message("c2", "n2"))

        val texts = banners().map(::shownText)
        assertThat(texts.count { list -> list.any { "4471" in it } }).isEqualTo(1)
        assertThat(texts.count { list -> lockedLabel in list }).isEqualTo(1)
    }

    @Test
    fun `le toucher d une banniere verrouillee ouvre toujours la conversation`() = runTest {
        pipeline(lockedStore("c1")).renderNow(message("c1", "n1"))

        val (payload, _) = PushTapExtras.read(shadowOf(child().contentIntent).savedIntent)
        assertThat(payload.conversationId).isEqualTo("c1")
        assertThat(payload.messageId).isEqualTo("m-n1")
    }

    @Test
    fun `un message verrouille ne recopie pas l historique en clair de la banniere deja posee`() = runTest {
        val locks = InMemoryConversationLockStore()
        val pipeline = pipeline(locks)
        pipeline.renderNow(message("c1", "n1"))
        locks.setLock("c1", "1234")
        pipeline.renderNow(message("c1", "n2", "body" to "second secret 8842"))

        val everything = shownText(child())
        assertThat(everything.filter { "4471" in it || "8842" in it }).isEmpty()
        assertThat(everything).contains(lockedLabel)
    }

    @Test
    fun `un push de synchronisation silencieuse d une conversation verrouillee ne poste rien`() = runTest {
        val silent = IncomingPush.of(mapOf("type" to "new_message", "notificationId" to "n1", "conversationId" to "c1"))

        val posted = pipeline(lockedStore("c1")).renderNow(silent)

        assertThat(posted).isFalse()
        assertThat(manager.activeNotifications).isEmpty()
    }

    @Test
    fun `le bloc notification d un push legacy est scelle lui aussi`() = runTest {
        val legacy = IncomingPush.of(
            data = mapOf("type" to "new_message", "notificationId" to "n1", "conversationId" to "c1", "senderId" to "u1", "senderDisplayName" to "Bob"),
            notificationTitle = "Bob",
            notificationBody = secret,
            hasNotificationBlock = true,
        )

        pipeline(lockedStore("c1")).renderNow(legacy)

        assertThat(shownText(child()).filter { "4471" in it }).isEmpty()
        assertThat(shownText(child())).contains(lockedLabel)
    }

    @Test
    fun `un verrou illisible scelle la banniere plutot que de la laisser fuir`() = runTest {
        val broken = mockk<ConversationLockStore> { every { isLocked(any()) } throws IllegalStateException("keystore") }

        pipeline(broken).renderNow(message("c1", "n1", "senderAvatar" to avatar))

        assertThat(shownText(child()).filter { "4471" in it }).isEmpty()
        assertThat(child().actions).isNull()
        coVerify(exactly = 0) { fetcher.fetch(any(), any(), any(), any(), any()) }
    }
}
