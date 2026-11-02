package me.meeshy.app.push

import android.content.Context
import me.meeshy.app.launchExtras
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(application = android.app.Application::class, sdk = [28, 34])
class PushTapIntentFactoryTest {

    private val context: Context = ApplicationProvider.getApplicationContext()
    private val factory = PushTapIntentFactory(context)

    private val data = mapOf(
        "notificationId" to "n1",
        "type" to "post_comment",
        "conversationId" to "c1",
        "messageId" to "m1",
        "postId" to "p1",
        "postType" to "REEL",
        "commentId" to "cm1",
        "parentCommentId" to "pc1",
        "senderId" to "u2",
    )

    @Test
    fun `le toucher porte toute la charge utile et la retrouve a la lecture`() {
        val intent = shadowOf(factory.contentIntent(data, requestCode = 7)).savedIntent
        val (payload, _) = PushTapExtras.read(intent)

        assertThat(payload.notificationId).isEqualTo("n1")
        assertThat(payload.type).isEqualTo("post_comment")
        assertThat(payload.conversationId).isEqualTo("c1")
        assertThat(payload.messageId).isEqualTo("m1")
        assertThat(payload.postId).isEqualTo("p1")
        assertThat(payload.postType).isEqualTo("REEL")
        assertThat(payload.commentId).isEqualTo("cm1")
        assertThat(payload.parentCommentId).isEqualTo("pc1")
        assertThat(payload.senderId).isEqualTo("u2")
    }

    @Test
    fun `le toucher ouvre l activite directement et reste immuable`() {
        val pending = factory.contentIntent(data, requestCode = 7)
        val shadow = shadowOf(pending)

        assertThat(shadow.isActivityIntent).isTrue()
        assertThat(shadow.requestCode).isEqualTo(7)
        assertThat(shadow.flags and android.app.PendingIntent.FLAG_IMMUTABLE).isNotEqualTo(0)
    }

    @Test
    fun `le balayage previent le recepteur avec l identifiant serveur`() {
        val pending = factory.deleteIntent("n1", requestCode = 3)
        val shadow = shadowOf(pending)

        assertThat(shadow.isBroadcastIntent).isTrue()
        assertThat(shadow.savedIntent.action).isEqualTo(PushDismissReceiver.ACTION_DISMISSED)
        assertThat(shadow.savedIntent.getStringExtra("notificationId")).isEqualTo("n1")
        assertThat(shadow.flags and android.app.PendingIntent.FLAG_IMMUTABLE).isNotEqualTo(0)
    }

    @Test
    fun `deux notifications ont deux intents de balayage distincts`() {
        val first = factory.deleteIntent("n1", requestCode = 1)
        val second = factory.deleteIntent("n2", requestCode = 2)

        assertThat(shadowOf(first).requestCode).isNotEqualTo(shadowOf(second).requestCode)
        assertThat(shadowOf(second).savedIntent.getStringExtra("notificationId")).isEqualTo("n2")
    }

    @Test
    fun `l activite lit l intent de push en extras de lancement et route vers le post`() {
        val intent = shadowOf(factory.contentIntent(data, requestCode = 7)).savedIntent
        val extras = intent.launchExtras()

        assertThat(extras.tap.notificationId).isEqualTo("n1")
        assertThat(extras.callId).isNull()
        assertThat(me.meeshy.app.navigation.LaunchRouter.route(extras)).isEqualTo(me.meeshy.app.navigation.Routes.reels("p1"))
    }
}
