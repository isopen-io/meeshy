package me.meeshy.app.push

import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.push.PushTapDestination
import me.meeshy.sdk.outbox.OutboxOwnerSource
import io.mockk.every
import io.mockk.mockk
import me.meeshy.sdk.outbox.SessionOutboxOwnerSource
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.net.TokenStore
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28, 34])
class UnsentCommentNotifierTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val notifier = UnsentCommentNotifier(context, OutboxOwnerSource { "me" })

    init {
        shadowOf(context as android.app.Application).grantPermissions(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    @Test
    fun `un commentaire refuse previent son auteur avec son texte et ouvre le post`() = runTest {
        manager.cancelAll()

        notifier.commentNotSent("me", "p1", "Bravo pour ce post")

        val posted = shadowOf(manager).allNotifications.single()
        assertThat(posted.extras.getCharSequence("android.title").toString()).isEqualTo(context.getString(me.meeshy.app.R.string.push_comment_unsent_title))
        assertThat(posted.extras.getCharSequence("android.bigText").toString()).isEqualTo("Bravo pour ce post")
        assertThat(posted.publicVersion.extras.getCharSequence("android.text")?.toString()).isNull()
        val tap = shadowOf(posted.contentIntent).savedIntent
        val (payload, _) = PushTapExtras.read(tap)
        assertThat(PushTapDestination.resolve(payload)).isEqualTo(PushTapDestination.Post("p1"))
    }

    @Test
    fun `le texte d un autre compte ne s affiche pas sous le compte connecte`() = runTest {
        manager.cancelAll()

        notifier.commentNotSent("someone-else", "p1", "mots du premier compte")

        assertThat(shadowOf(manager).allNotifications).isEmpty()
    }

    @Test
    fun `un processus reveille par la file, session pas encore relue, previent tout de meme l auteur`() = runTest {
        manager.cancelAll()
        val session = mockk<SessionRepository>(relaxed = true) { every { currentUserId } returns null }
        val tokens = mockk<TokenStore>(relaxed = true) { every { userId } returns "me" }
        val cold = UnsentCommentNotifier(context, SessionOutboxOwnerSource(session, tokens))

        cold.commentNotSent("me", "p1", "Bravo")

        assertThat(shadowOf(manager).allNotifications).hasSize(1)
    }

    @Test
    fun `une ligne sans auteur ne s affiche sous aucun compte`() = runTest {
        manager.cancelAll()

        notifier.commentNotSent(null, "p1", "mots de personne")

        assertThat(shadowOf(manager).allNotifications).isEmpty()
    }
}
