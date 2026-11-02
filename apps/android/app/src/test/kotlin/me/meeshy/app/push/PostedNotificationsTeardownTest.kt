package me.meeshy.app.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class PostedNotificationsTeardownTest {

    @Test
    fun `a la deconnexion les bannieres du compte quitte disparaissent`() = runTest {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel("c", "c", NotificationManager.IMPORTANCE_HIGH))
        manager.notify(1, NotificationCompat.Builder(context, "c").setSmallIcon(android.R.drawable.ic_dialog_info).setContentText("Salut").build())
        manager.notify(2, NotificationCompat.Builder(context, "c").setSmallIcon(android.R.drawable.ic_dialog_info).setContentText("Tu es là ?").build())

        PostedNotificationsTeardown(context).clear()

        assertThat(manager.activeNotifications).isEmpty()
    }
}
