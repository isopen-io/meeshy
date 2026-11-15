package me.meeshy.sdk.battery

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.battery.BatteryReading
import me.meeshy.sdk.model.battery.BatteryReportBody
import me.meeshy.sdk.model.battery.BatteryReportTrigger
import org.junit.Test

/** Mes relevés (#14147) : la cadence décide, un refus n'est pas retenu, rien ne part hors session ni partage coupé. */
class BatteryReporterTest {
    private class Harness {
        var reading: BatteryReading? = BatteryReading(87, charging = false, lowPower = false)
        var accept = true
        var signedIn = true
        var sharing: Boolean? = null
        var now = 0L
        val sent = mutableListOf<BatteryReportBody>()
        val reporter = BatteryReporter(
            BatteryReporterPorts(
                reader = object : DeviceBatteryReader {
                    override fun read(): BatteryReading? = reading
                    override val deviceLabel: String? = "Pixel"
                },
                send = { sent += it; accept },
                signedIn = { signedIn },
                sharingEnabled = { sharing },
                now = { now },
            ),
        )
    }

    @Test
    fun `le premier releve part, le suivant dans la meme tranche non`() = runTest {
        val h = Harness()
        assertThat(h.reporter.report(BatteryReportTrigger.CHANGE)).isTrue()
        h.reading = BatteryReading(86, charging = false, lowPower = false)
        assertThat(h.reporter.report(BatteryReportTrigger.CHANGE)).isFalse()
        assertThat(h.sent.single().measuredAt).isEqualTo("1970-01-01T00:00:00Z")
        assertThat(h.sent.single().deviceLabel).isEqualTo("Pixel")
    }

    @Test
    fun `un releve refuse n'est pas retenu, le suivant repart`() = runTest {
        val h = Harness()
        h.accept = false
        h.reporter.report(BatteryReportTrigger.CHANGE)
        h.accept = true
        assertThat(h.reporter.report(BatteryReportTrigger.CHANGE)).isTrue()
        assertThat(h.sent).hasSize(2)
    }

    @Test
    fun `une demande part toujours`() = runTest {
        val h = Harness()
        h.reporter.report(BatteryReportTrigger.CHANGE)
        assertThat(h.reporter.report(BatteryReportTrigger.PULL)).isTrue()
    }

    @Test
    fun `rien ne part hors session ni quand j'ai coupe le partage`() = runTest {
        val h = Harness()
        h.signedIn = false
        assertThat(h.reporter.report(BatteryReportTrigger.PULL)).isFalse()
        h.signedIn = true
        h.sharing = false
        assertThat(h.reporter.report(BatteryReportTrigger.PULL)).isFalse()
        assertThat(h.sent).isEmpty()
    }

    @Test
    fun `le battement s'arme en critique debranche`() = runTest {
        val h = Harness()
        h.reading = BatteryReading(4, charging = false, lowPower = false)
        h.reporter.report(BatteryReportTrigger.CHANGE)
        h.now = 20_000L
        assertThat(h.reporter.heartbeatDelayMs()).isEqualTo(40_000L)
        h.now = 60_000L
        assertThat(h.reporter.report(BatteryReportTrigger.HEARTBEAT)).isTrue()
    }

    @Test
    fun `le changement de compte oublie le dernier releve`() = runTest {
        val h = Harness()
        h.reporter.report(BatteryReportTrigger.CHANGE)
        h.reporter.clear()
        assertThat(h.reporter.report(BatteryReportTrigger.CHANGE)).isTrue()
    }
}
