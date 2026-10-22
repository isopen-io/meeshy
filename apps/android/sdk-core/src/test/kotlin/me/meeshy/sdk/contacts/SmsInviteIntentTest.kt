package me.meeshy.sdk.contacts

import android.content.Intent
import android.content.pm.ResolveInfo
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class SmsInviteIntentTest {

    private fun ready(number: String?, body: String = "Salut"): Intent {
        val result = SmsInviteIntent.build(number, body)
        assertThat(result).isInstanceOf(SmsInviteResult.Ready::class.java)
        return (result as SmsInviteResult.Ready).intent
    }

    @Test
    fun `l'intent est un SENDTO smsto portant le corps`() {
        val intent = ready("+33 6 12 34 56 78", "Salut Awa")

        assertThat(intent.action).isEqualTo(Intent.ACTION_SENDTO)
        assertThat(intent.data?.scheme).isEqualTo("smsto")
        assertThat(intent.data?.schemeSpecificPart).isEqualTo("+33612345678")
        assertThat(intent.getStringExtra("sms_body")).isEqualTo("Salut Awa")
    }

    @Test
    fun `un numero vide ou absent est une erreur typee`() {
        assertThat(SmsInviteIntent.build("  ", "x"))
            .isEqualTo(SmsInviteResult.Failed(SmsInviteFailure.MissingNumber))
        assertThat(SmsInviteIntent.build(null, "x"))
            .isEqualTo(SmsInviteResult.Failed(SmsInviteFailure.MissingNumber))
    }

    @Test
    fun `sans application SMS la resolution est absente`() {
        val pm = ApplicationProvider.getApplicationContext<android.app.Application>().packageManager
        assertThat(SmsInviteIntent.canResolve(pm, ready("0612345678"))).isFalse()
    }

    @Test
    fun `avec une application SMS la resolution reussit`() {
        val app = ApplicationProvider.getApplicationContext<android.app.Application>()
        val intent = ready("0612345678")
        shadowOf(app.packageManager).addResolveInfoForIntent(intent, ResolveInfo())
        assertThat(SmsInviteIntent.canResolve(app.packageManager, intent)).isTrue()
    }
}
