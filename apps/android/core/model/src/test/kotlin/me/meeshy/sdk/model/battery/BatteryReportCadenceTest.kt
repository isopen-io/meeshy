package me.meeshy.sdk.model.battery

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BatteryReportCadenceTest {
    private fun r(level: Int, charging: Boolean = false, lowPower: Boolean = false) = BatteryReading(level, charging, lowPower)

    private fun report(last: BatteryReading?, current: BatteryReading, trigger: BatteryReportTrigger = BatteryReportTrigger.CHANGE, elapsed: Long = 1_000L) =
        BatteryReportCadence.shouldReport(last, last?.let { 0L }, current, trigger, nowMs = elapsed)

    @Test
    fun `le premier releve part toujours`() {
        assertThat(report(null, r(87))).isTrue()
    }

    @Test
    fun `au dessus de 30 pour cent seule une nouvelle tranche de 5 part`() {
        assertThat(report(r(87), r(86))).isFalse()
        assertThat(report(r(86), r(85))).isTrue()
        assertThat(report(r(85), r(84))).isFalse()
        assertThat(report(r(81), r(80))).isTrue()
    }

    @Test
    fun `franchir 30 est un palier`() {
        assertThat(report(r(31), r(30))).isTrue()
    }

    @Test
    fun `sous 30 chaque palier part et rien entre deux`() {
        assertThat(report(r(30), r(27))).isFalse()
        assertThat(report(r(26), r(25))).isTrue()
        assertThat(report(r(14), r(11))).isFalse()
        assertThat(report(r(11), r(10))).isTrue()
    }

    @Test
    fun `a 5 pour cent ou moins chaque point part`() {
        assertThat(report(r(5), r(4))).isTrue()
        assertThat(report(r(4), r(3))).isTrue()
    }

    @Test
    fun `en critique un battement part toutes les 60 s debranche`() {
        assertThat(report(r(4), r(4), BatteryReportTrigger.HEARTBEAT, elapsed = 30_000L)).isFalse()
        assertThat(report(r(4), r(4), BatteryReportTrigger.HEARTBEAT, elapsed = 60_000L)).isTrue()
        assertThat(report(r(4, charging = true), r(4, charging = true), BatteryReportTrigger.HEARTBEAT, elapsed = 120_000L)).isFalse()
    }

    @Test
    fun `brancher ou basculer le mode economie part a tout niveau`() {
        assertThat(report(r(62), r(62, charging = true))).isTrue()
        assertThat(report(r(62), r(62, lowPower = true))).isTrue()
    }

    @Test
    fun `une demande ou la tache periodique part toujours`() {
        assertThat(report(r(62), r(62), BatteryReportTrigger.PULL)).isTrue()
        assertThat(report(r(62), r(62), BatteryReportTrigger.PERIODIC)).isTrue()
    }

    @Test
    fun `le battement ne s'arme qu'en critique debranche`() {
        assertThat(BatteryReportCadence.heartbeatDelayMs(r(40), 0L, 10_000L)).isNull()
        assertThat(BatteryReportCadence.heartbeatDelayMs(r(3, charging = true), 0L, 10_000L)).isNull()
        assertThat(BatteryReportCadence.heartbeatDelayMs(r(3), 0L, 10_000L)).isEqualTo(50_000L)
        assertThat(BatteryReportCadence.heartbeatDelayMs(r(3), 0L, 90_000L)).isEqualTo(0L)
    }

    @Test
    fun `la tranche est fermee a droite`() {
        assertThat(BatteryReportCadence.band(30)).isEqualTo(6)
        assertThat(BatteryReportCadence.band(26)).isEqualTo(6)
        assertThat(BatteryReportCadence.band(25)).isEqualTo(5)
        assertThat(BatteryReportCadence.band(0)).isEqualTo(0)
    }
}
