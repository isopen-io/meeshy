package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallLiveFrameBudgetTest {
    @Test
    fun `le budget suit le cout du cadre`() {
        assertThat(CallLiveFrameBudget.limitMs(null)).isEqualTo(0.5)
        assertThat(CallLiveFrameBudget.limitMs(CallFrameCost.LIGHT)).isEqualTo(0.5)
        assertThat(CallLiveFrameBudget.limitMs(CallFrameCost.STANDARD)).isEqualTo(1.0)
        assertThat(CallLiveFrameBudget.limitMs(CallFrameCost.RICH)).isEqualTo(2.5)
    }

    @Test
    fun `le p95 d'une fenetre vide n'existe pas et celui d'une fenetre pleine ignore les 5 pour cent les plus lents`() {
        assertThat(CallLiveFrameBudget.percentile95(emptyList())).isNull()
        val window = List(94) { 0.4 } + List(6) { 9.0 }
        assertThat(CallLiveFrameBudget.percentile95(window.shuffled())).isEqualTo(9.0)
        val calm = List(95) { 0.4 } + List(5) { 9.0 }
        assertThat(CallLiveFrameBudget.percentile95(calm)).isEqualTo(0.4)
        assertThat(CallLiveFrameBudget.percentile95(listOf(3.0))).isEqualTo(3.0)
    }

    @Test
    fun `le releve ne sort qu'a la fermeture de la fenetre et se rearme`() {
        val meter = CallLiveFrameBudgetMeter(limitMs = 1.0)
        repeat(CallLiveFrameBudget.WINDOW_SIZE - 1) { assertThat(meter.record(0.2)).isNull() }
        val report = meter.record(0.2)!!
        assertThat(report.p95Ms).isEqualTo(0.2)
        assertThat(report.isOverBudget).isFalse()
        assertThat(meter.record(0.2)).isNull()
    }

    @Test
    fun `un depassement du p95 est signale et une mesure invalide est ignoree`() {
        val meter = CallLiveFrameBudgetMeter(limitMs = 0.5)
        assertThat(meter.record(Double.NaN)).isNull()
        assertThat(meter.record(-1.0)).isNull()
        repeat(CallLiveFrameBudget.WINDOW_SIZE - 1) { meter.record(2.0) }
        assertThat(meter.record(2.0)!!.isOverBudget).isTrue()
    }

    @Test
    fun `changer de cadre vide la fenetre et change la limite`() {
        val meter = CallLiveFrameBudgetMeter()
        repeat(50) { meter.record(5.0) }
        meter.reset(limitMs = CallLiveFrameBudget.limitMs(CallFrameCost.RICH))
        repeat(CallLiveFrameBudget.WINDOW_SIZE - 1) { meter.record(1.0) }
        val report = meter.record(1.0)!!
        assertThat(report.limitMs).isEqualTo(2.5)
        assertThat(report.isOverBudget).isFalse()
    }
}
