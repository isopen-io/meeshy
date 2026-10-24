package me.meeshy.sdk.model.health

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConnectionDiagnosisTest {

    @Test
    fun `aucune reponse du serveur est injoignable`() {
        assertThat(ConnectionDiagnosis.resolve(null, null, transportFailed = true))
            .isEqualTo(ConnectionDiagnosis.UNREACHABLE)
    }

    @Test
    fun `un 503 not-ready est un serveur degrade`() {
        assertThat(ConnectionDiagnosis.resolve(null, 503, transportFailed = false))
            .isEqualTo(ConnectionDiagnosis.DEGRADED)
    }

    @Test
    fun `un 200 sans verdict ready est degrade`() {
        assertThat(ConnectionDiagnosis.resolve("not-ready", 200, transportFailed = false))
            .isEqualTo(ConnectionDiagnosis.DEGRADED)
        assertThat(ConnectionDiagnosis.resolve(null, null, transportFailed = false))
            .isEqualTo(ConnectionDiagnosis.DEGRADED)
    }

    @Test
    fun `un 200 ready est sain`() {
        assertThat(ConnectionDiagnosis.resolve("ready", 200, transportFailed = false))
            .isEqualTo(ConnectionDiagnosis.HEALTHY)
    }
}
