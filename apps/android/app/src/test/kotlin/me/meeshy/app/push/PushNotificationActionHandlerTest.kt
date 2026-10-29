package me.meeshy.app.push

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.outbox.EndToEndOutboxAdmission
import me.meeshy.sdk.outbox.OutboxAdmissionVerdict
import me.meeshy.sdk.outbox.OutboxOwnerSource
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.AccountClosedException
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket
import me.meeshy.sdk.session.AccountTicketContext
import me.meeshy.sdk.session.SessionRepository
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PushNotificationActionHandlerTest {

    private val me = MeeshyUser(id = "me", username = "me")

    private class Fixture(
        user: MeeshyUser?,
        verdict: OutboxAdmissionVerdict = OutboxAdmissionVerdict.ADMIT,
        locked: Set<String> = emptySet(),
        fence: AccountFence? = null,
        val drafts: ConversationDraftStore = InMemoryConversationDraftStore(),
    ) {
        constructor(user: MeeshyUser?, sealed: Boolean) :
            this(user, if (sealed) OutboxAdmissionVerdict.WITHHOLD else OutboxAdmissionVerdict.ADMIT)

        val messages = mockk<MessageRepository>(relaxed = true)
        val conversations = mockk<ConversationRepository>(relaxed = true)
        val session = mockk<SessionRepository>(relaxed = true) {
            every { currentUser } returns MutableStateFlow(user)
        }
        val admission = mockk<EndToEndOutboxAdmission> {
            coEvery { verdictFor(any()) } returns verdict
        }
        val posts = mockk<PostRepository>(relaxed = true) {
            coEvery { queueComment(any(), any(), any(), any()) } returns "cmid_c1"
        }
        val notifications = mockk<NotificationRepository>(relaxed = true)
        val locks = InMemoryConversationLockStore().also { store -> locked.forEach { store.setLock(it, "1234") } }
        val handler = PushNotificationActionHandler(
            ApplicationProvider.getApplicationContext<Context>(), session, messages, conversations, admission, posts, notifications, locks, drafts, fence,
        )
    }

    @Test
    fun `une reponse passe par la file d envoi et la banniere s en va`() = runTest {
        val f = Fixture(me, sealed = false)

        val outcome = f.handler.reply("c1", "  Je suis en route  ")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.SENT)
        assertThat(outcome.dismissesBanner).isTrue()
        coVerify { f.messages.sendOptimistic(conversationId = "c1", content = "Je suis en route", originalLanguage = any(), sender = me) }
    }

    @Test
    fun `une reponse en conversation chiffree ne part jamais en clair`() = runTest {
        val f = Fixture(me, sealed = true)

        val outcome = f.handler.reply("c1", "secret")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.END_TO_END)
        assertThat(outcome.dismissesBanner).isFalse()
        coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `une reponse vide ne part pas`() = runTest {
        val f = Fixture(me, sealed = false)

        assertThat(f.handler.reply("c1", "   ")).isEqualTo(PushNotificationActionHandler.Outcome.EMPTY)
    }

    @Test
    fun `marquer comme lu passe par la file optimiste`() = runTest {
        val f = Fixture(me, sealed = false)

        val outcome = f.handler.markRead("c1")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.MARKED_READ)
        coVerify { f.conversations.markReadOptimistic("c1") }
    }

    @Test
    fun `une erreur garde la banniere`() = runTest {
        val f = Fixture(me, sealed = false)
        coEvery { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } throws IllegalStateException("db")

        val outcome = f.handler.reply("c1", "salut")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.FAILED)
        assertThat(outcome.dismissesBanner).isFalse()
    }

    @Test
    fun `la banniere d un autre compte ne repond pas avec la session du compte connecte`() = runTest {
        val f = Fixture(me, sealed = false)

        val outcome = f.handler.reply("c1", "salut", accountId = "previous-account")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        assertThat(outcome.dismissesBanner).isTrue()
        coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `la banniere d un autre compte ne marque rien comme lu`() = runTest {
        val f = Fixture(me, sealed = false)

        assertThat(f.handler.markRead("c1", accountId = "previous-account"))
            .isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        coVerify(exactly = 0) { f.conversations.markReadOptimistic(any()) }
    }

    @Test
    fun `la banniere du compte connecte repond normalement`() = runTest {
        val f = Fixture(me, sealed = false)

        assertThat(f.handler.reply("c1", "salut", accountId = "me")).isEqualTo(PushNotificationActionHandler.Outcome.SENT)
    }

    @Test
    fun `la reponse cite le message de la notification`() = runTest {
        val f = Fixture(me, sealed = false)

        f.handler.reply("c1", "ok", replyToId = "m42")

        coVerify { f.messages.sendOptimistic(conversationId = "c1", content = "ok", originalLanguage = any(), sender = me, replyToId = "m42") }
    }

    @Test
    fun `un mode inconnu et illisible ne fait naitre aucune bulle, la reponse est gardee en brouillon et la banniere reste`() = runTest {
        listOf(OutboxAdmissionVerdict.WAIT, OutboxAdmissionVerdict.UNREACHABLE).forEach { verdict ->
            val f = Fixture(me, verdict)

            val outcome = f.handler.reply("c1", "  ma reponse ", accountId = "me", replyToId = "m42")

            assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.DRAFT_KEPT)
            assertThat(outcome.dismissesBanner).isFalse()
            val draft = f.drafts.load("c1")
            assertThat(draft?.text).isEqualTo("ma reponse")
            assertThat(draft?.replyToId).isEqualTo("m42")
            coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
            coVerify(exactly = 0) { f.conversations.markReadOptimistic(any()) }
        }
    }

    @Test
    fun `la reponse gardee s ajoute au brouillon deja commence sans l ecraser`() = runTest {
        val drafts = InMemoryConversationDraftStore(mapOf("c1" to ConversationDraft("c1", text = "Salut,")))
        val f = Fixture(me, OutboxAdmissionVerdict.WAIT, drafts = drafts)

        f.handler.reply("c1", "je suis en route")

        assertThat(drafts.load("c1")?.text).isEqualTo("Salut,\nje suis en route")
    }

    @Test
    fun `une relecture du mode qui ne rend rien a temps vaut un mode inconnu, rien ne part en clair`() = runTest {
        val f = Fixture(me, OutboxAdmissionVerdict.ADMIT)
        coEvery { f.admission.verdictFor("c1") } coAnswers { kotlinx.coroutines.awaitCancellation() }

        val outcome = f.handler.reply("c1", "texte")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.DRAFT_KEPT)
        assertThat(testScheduler.currentTime).isEqualTo(PushNotificationActionHandler.MODE_READ_BUDGET_MILLIS)
        coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun `une conversation chiffree ne garde rien en brouillon`() = runTest {
        val f = Fixture(me, OutboxAdmissionVerdict.WITHHOLD)

        assertThat(f.handler.reply("c1", "secret")).isEqualTo(PushNotificationActionHandler.Outcome.END_TO_END)
        assertThat(f.drafts.load("c1")).isNull()
    }

    @Test
    fun `un compte qui change pendant la relecture du mode ne recoit pas le brouillon de l autre`() = runTest {
        var owner: String? = "me"
        val fence = AccountFence(OutboxOwnerSource { owner })
        val f = Fixture(me, fence = fence)
        coEvery { f.admission.verdictFor("c1") } coAnswers {
            owner = "other"
            OutboxAdmissionVerdict.WAIT
        }

        val outcome = f.handler.reply("c1", "les mots de me", accountId = "me")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        assertThat(f.drafts.load("c1")).isNull()
    }

    @Test
    fun `un brouillon qui ne s ecrit pas laisse la banniere intacte`() = runTest {
        val broken = mockk<ConversationDraftStore>(relaxed = true) {
            coEvery { load(any()) } throws IllegalStateException("disk")
        }
        val f = Fixture(me, OutboxAdmissionVerdict.WAIT, drafts = broken)

        assertThat(f.handler.reply("c1", "texte")).isEqualTo(PushNotificationActionHandler.Outcome.MODE_UNKNOWN)
    }

    @Test
    fun `le travail du recepteur tient sous le delai de goAsync, session et relecture du mode comprises`() = runTest {
        val worst = PushNotificationActionHandler.SESSION_BUDGET_MILLIS + PushNotificationActionHandler.MODE_READ_BUDGET_MILLIS
        assertThat(worst).isLessThan(PushNotificationActionHandler.GO_ASYNC_WINDOW_MILLIS - 1_000L)

        val signedLate = MutableStateFlow<MeeshyUser?>(null)
        val f = Fixture(me, OutboxAdmissionVerdict.ADMIT)
        every { f.session.currentUser } returns signedLate
        coEvery { f.session.refresh() } coAnswers { kotlinx.coroutines.delay(PushNotificationActionHandler.SESSION_BUDGET_MILLIS - 100); signedLate.value = me }
        coEvery { f.admission.verdictFor("c1") } coAnswers { kotlinx.coroutines.awaitCancellation() }

        val outcome = f.handler.reply("c1", "texte")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.DRAFT_KEPT)
        assertThat(testScheduler.currentTime).isAtMost(worst)
        assertThat(testScheduler.currentTime).isLessThan(PushNotificationActionHandler.GO_ASYNC_WINDOW_MILLIS)
    }

    @Test
    fun `une session qui ne revient pas rend la main au bout du budget`() = runTest {
        val f = Fixture(null)
        coEvery { f.session.refresh() } coAnswers { kotlinx.coroutines.awaitCancellation() }

        assertThat(f.handler.reply("c1", "texte")).isEqualTo(PushNotificationActionHandler.Outcome.NOT_SIGNED_IN)
        assertThat(testScheduler.currentTime).isEqualTo(PushNotificationActionHandler.SESSION_BUDGET_MILLIS)
    }

    @Test
    fun `une conversation verrouillee par code n agit ni en reponse ni en lecture`() = runTest {
        val f = Fixture(me, locked = setOf("c1"))

        assertThat(f.handler.reply("c1", "salut")).isEqualTo(PushNotificationActionHandler.Outcome.LOCKED)
        assertThat(f.handler.markRead("c1")).isEqualTo(PushNotificationActionHandler.Outcome.LOCKED)

        coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { f.conversations.markReadOptimistic(any()) }
        assertThat(f.handler.reply("c2", "salut")).isEqualTo(PushNotificationActionHandler.Outcome.SENT)
    }

    @Test
    fun `apres la reponse la conversation est marquee lue, comme iOS`() = runTest {
        val f = Fixture(me, sealed = false)

        f.handler.reply("c1", "ok")

        coVerify(exactly = 1) { f.conversations.markReadOptimistic("c1") }
    }

    @Test
    fun `un marquage lu qui echoue apres l envoi n annule pas la reponse`() = runTest {
        val f = Fixture(me, sealed = false)
        coEvery { f.conversations.markReadOptimistic(any()) } throws IllegalStateException("db")

        assertThat(f.handler.reply("c1", "ok")).isEqualTo(PushNotificationActionHandler.Outcome.SENT)
    }

    @Test
    fun `commenter un commentaire de fil repond a celui de la notification puis marque la cloche lue`() = runTest {
        val f = Fixture(me)

        val outcome = f.handler.comment("p1", "  Bravo ", accountId = "me", type = "post_comment", notifiedCommentId = "c9", serverNotificationId = "n7")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.COMMENT_QUEUED)
        assertThat(outcome.dismissesBanner).isTrue()
        coVerify(exactly = 1) { f.posts.queueComment("p1", "Bravo", "c9", null) }
        coVerify(exactly = 1) { f.notifications.markAsRead("n7") }
    }

    @Test
    fun `commenter la publication d un ami est un commentaire racine`() = runTest {
        val f = Fixture(me)

        f.handler.comment("p1", "Joli", type = "friend_new_post", notifiedCommentId = "c9")

        coVerify(exactly = 1) { f.posts.queueComment("p1", "Joli", null, null) }
    }

    @Test
    fun `un commentaire d un autre compte, vide ou anonyme n entre pas dans la file`() = runTest {
        val f = Fixture(me)
        assertThat(f.handler.comment("p1", "Bravo", accountId = "previous-account"))
            .isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        assertThat(f.handler.comment("p1", "   ")).isEqualTo(PushNotificationActionHandler.Outcome.EMPTY)
        assertThat(Fixture(me.copy(isAnonymous = true)).handler.comment("p1", "Bravo"))
            .isEqualTo(PushNotificationActionHandler.Outcome.NOT_SIGNED_IN)

        coVerify(exactly = 0) { f.posts.queueComment(any(), any(), any(), any()) }
        coVerify(exactly = 0) { f.notifications.markAsRead(any()) }
    }

    @Test
    fun `une file qui refuse garde la banniere et ne marque pas la cloche`() = runTest {
        val f = Fixture(me)
        coEvery { f.posts.queueComment(any(), any(), any(), any()) } returns null

        val outcome = f.handler.comment("p1", "Bravo", serverNotificationId = "n7")

        assertThat(outcome).isEqualTo(PushNotificationActionHandler.Outcome.FAILED)
        assertThat(outcome.dismissesBanner).isFalse()
        coVerify(exactly = 0) { f.notifications.markAsRead(any()) }
    }

    @Test
    fun `une cloche impossible a marquer ne defait pas le commentaire garde`() = runTest {
        val f = Fixture(me)
        coEvery { f.notifications.markAsRead(any()) } throws IllegalStateException("offline")

        assertThat(f.handler.comment("p1", "Bravo", serverNotificationId = "n7"))
            .isEqualTo(PushNotificationActionHandler.Outcome.COMMENT_QUEUED)
    }
    @Test
    fun `une reponse part sous le compte de la banniere meme si un autre compte s ouvre pendant la relecture du mode`() = runTest {
        var owner: String? = "me"
        val fence = AccountFence(OutboxOwnerSource { owner })
        val f = Fixture(me, fence = fence)
        coEvery { f.admission.verdictFor("c1") } coAnswers {
            owner = "other"
            OutboxAdmissionVerdict.ADMIT
        }
        var queuedUnder: AccountTicket? = null
        coEvery { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } coAnswers {
            queuedUnder = currentCoroutineContext()[AccountTicketContext]?.ticket
            "cid"
        }

        f.handler.reply("c1", "les mots de me", accountId = "me")

        assertThat(queuedUnder?.ownerId).isEqualTo("me")
        assertThat(fence.isCurrent(queuedUnder!!)).isFalse()
    }

    @Test
    fun `un commentaire entre dans la file sous le compte de la banniere`() = runTest {
        var owner: String? = "me"
        val fence = AccountFence(OutboxOwnerSource { owner })
        val f = Fixture(me, fence = fence)
        var queuedUnder: AccountTicket? = null
        coEvery { f.posts.queueComment(any(), any(), any(), any()) } coAnswers {
            queuedUnder = currentCoroutineContext()[AccountTicketContext]?.ticket
            "cmid_c1"
        }

        f.handler.comment("p1", "Bravo", accountId = "me")

        assertThat(queuedUnder?.ownerId).isEqualTo("me")
    }

    @Test
    fun `une session dont le compte de la file n est pas celui de l utilisateur ne repond ni ne commente`() = runTest {
        val fence = AccountFence(OutboxOwnerSource { "other" })
        val f = Fixture(me, fence = fence)

        assertThat(f.handler.reply("c1", "salut", accountId = "me")).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        assertThat(f.handler.comment("p1", "Bravo", accountId = "me")).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        assertThat(f.handler.markRead("c1", accountId = "me")).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        coVerify(exactly = 0) { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) }
        coVerify(exactly = 0) { f.posts.queueComment(any(), any(), any(), any()) }
        coVerify(exactly = 0) { f.conversations.markReadOptimistic(any()) }
    }

    @Test
    fun `un compte clos pendant l action rend une issue qui retire la banniere au lieu de la laisser en attente`() = runTest {
        val f = Fixture(me)
        coEvery { f.messages.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any()) } throws AccountClosedException()
        coEvery { f.posts.queueComment(any(), any(), any(), any()) } throws AccountClosedException()

        assertThat(f.handler.reply("c1", "salut")).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        assertThat(f.handler.comment("p1", "Bravo", serverNotificationId = "n7")).isEqualTo(PushNotificationActionHandler.Outcome.ACCOUNT_CHANGED)
        coVerify(exactly = 0) { f.notifications.markAsRead(any()) }
    }
}
