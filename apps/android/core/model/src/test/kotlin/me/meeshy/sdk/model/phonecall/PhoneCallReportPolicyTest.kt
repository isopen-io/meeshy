package me.meeshy.sdk.model.phonecall

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Ce que le téléphone rapporte (#18753) : le mode audio seul, sans permission — `MODE_IN_CALL` (2) et
 * `MODE_IN_COMMUNICATION` (3) disent « en appel » (téléphone et VoIP confondus) ; et un rapport ne part que quand la
 * valeur CHANGE par rapport à la dernière acceptée, jamais hors session ni partage coupé.
 */
class PhoneCallReportPolicyTest {

    @Test
    fun `seuls les modes d'appel disent en appel, la sonnerie non`() {
        assertThat(PhoneCallReportPolicy.isInCall(PhoneCallReportPolicy.MODE_IN_CALL)).isTrue()
        assertThat(PhoneCallReportPolicy.isInCall(PhoneCallReportPolicy.MODE_IN_COMMUNICATION)).isTrue()
        assertThat(PhoneCallReportPolicy.MODE_IN_CALL).isEqualTo(2)
        assertThat(PhoneCallReportPolicy.MODE_IN_COMMUNICATION).isEqualTo(3)
        assertThat(PhoneCallReportPolicy.isInCall(0)).isFalse()
        assertThat(PhoneCallReportPolicy.isInCall(1)).isFalse()
        assertThat(PhoneCallReportPolicy.isInCall(-2)).isFalse()
    }

    @Test
    fun `le premier rapport part toujours, meme faux, pour clore un appel que l'app n'a pas vu finir`() {
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = null, current = false, signedIn = true, sharingEnabled = true)).isTrue()
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = null, current = true, signedIn = true, sharingEnabled = null)).isTrue()
    }

    @Test
    fun `un rapport ne part que quand la valeur change`() {
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = true, current = true, signedIn = true, sharingEnabled = true)).isFalse()
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = false, current = false, signedIn = true, sharingEnabled = true)).isFalse()
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = false, current = true, signedIn = true, sharingEnabled = true)).isTrue()
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = true, current = false, signedIn = true, sharingEnabled = true)).isTrue()
    }

    @Test
    fun `rien ne part hors session ni quand le partage est coupe`() {
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = null, current = true, signedIn = false, sharingEnabled = true)).isFalse()
        assertThat(PhoneCallReportPolicy.shouldReport(lastAccepted = false, current = true, signedIn = true, sharingEnabled = false)).isFalse()
    }
}
