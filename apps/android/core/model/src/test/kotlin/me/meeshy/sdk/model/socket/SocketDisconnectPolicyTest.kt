package me.meeshy.sdk.model.socket

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SocketDisconnectPolicyTest {

    @Test
    fun `une fermeture decidee par la passerelle rearme`() {
        assertThat(SocketDisconnectPolicy.retries("Got Disconnect")).isTrue()
        assertThat(SocketDisconnectPolicy.retries("io server disconnect")).isTrue()
        assertThat(SocketDisconnectPolicy.retries("Reconnect Failed")).isTrue()
    }

    @Test
    fun `une fermeture voulue par l'app ou un transport perdu ne rearme pas`() {
        listOf("io client disconnect", "Namespace leave", "Disconnect", "transport close", "ping timeout", "", null)
            .forEach { assertThat(SocketDisconnectPolicy.retries(it)).isFalse() }
    }
}
