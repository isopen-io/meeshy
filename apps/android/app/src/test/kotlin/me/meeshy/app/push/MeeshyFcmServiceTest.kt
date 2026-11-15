package me.meeshy.app.push

import android.os.Bundle
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Un push `notification + data` n'est plus laissé au rendu générique du système (#13394). */
@RunWith(RobolectricTestRunner::class)
class MeeshyFcmServiceTest {

    @Test
    fun `l intent d un message a bloc notification est reconnu`() {
        assertThat(MeeshyFcmService.carriesNotificationBlock(Bundle().apply { putString("gcm.n.e", "1") })).isTrue()
        assertThat(MeeshyFcmService.carriesNotificationBlock(Bundle().apply { putString("gcm.notification.e", "1") })).isTrue()
    }

    @Test
    fun `un push de donnees seules suit le chemin ordinaire`() {
        assertThat(MeeshyFcmService.carriesNotificationBlock(Bundle().apply { putString("type", "incoming_call") })).isFalse()
        assertThat(MeeshyFcmService.carriesNotificationBlock(Bundle())).isFalse()
    }
}
