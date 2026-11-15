package me.meeshy.app.calls

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallAudioRoute
import me.meeshy.sdk.model.call.CallAudioRouteKind
import org.junit.Test

class TelecomAudioSyncTest {

    private val earpiece = CallAudioRoute(1, "Ecouteur", CallAudioRouteKind.Earpiece)
    private val speaker = CallAudioRoute(2, "Haut-parleur", CallAudioRouteKind.Speaker)
    private val bluetooth = CallAudioRoute(3, "Casque", CallAudioRouteKind.Bluetooth)

    private fun snapshot(activeId: Int?) = CallAudioRouteSnapshot(listOf(earpiece, speaker, bluetooth), activeId)
    private fun endpoint(kind: CallAudioRouteKind) = TelecomEndpoint(kind, Any())

    @Test
    fun `une sortie choisie depuis le systeme devient la route de l application`() {
        assertThat(TelecomAudioSync.routeToSelect(CallAudioRouteKind.Bluetooth, snapshot(activeId = 1))).isEqualTo(3)
    }

    @Test
    fun `rien n est choisi quand l application est deja sur cette sortie`() {
        assertThat(TelecomAudioSync.routeToSelect(CallAudioRouteKind.Earpiece, snapshot(activeId = 1))).isNull()
    }

    @Test
    fun `une sortie inconnue ou absente du systeme ne change rien`() {
        assertThat(TelecomAudioSync.routeToSelect(null, snapshot(1))).isNull()
        assertThat(TelecomAudioSync.routeToSelect(CallAudioRouteKind.Other, snapshot(1))).isNull()
        assertThat(TelecomAudioSync.routeToSelect(CallAudioRouteKind.Car, snapshot(1))).isNull()
    }

    @Test
    fun `une route choisie dans l application est demandee au systeme`() {
        val bluetoothEndpoint = endpoint(CallAudioRouteKind.Bluetooth)
        val wanted = TelecomAudioSync.endpointToRequest(
            snapshot(activeId = 3),
            current = endpoint(CallAudioRouteKind.Earpiece),
            available = listOf(endpoint(CallAudioRouteKind.Earpiece), bluetoothEndpoint),
        )
        assertThat(wanted).isSameInstanceAs(bluetoothEndpoint)
    }

    @Test
    fun `rien n est demande quand le systeme est deja d accord`() {
        val wanted = TelecomAudioSync.endpointToRequest(
            snapshot(activeId = 3),
            current = endpoint(CallAudioRouteKind.Bluetooth),
            available = listOf(endpoint(CallAudioRouteKind.Bluetooth)),
        )
        assertThat(wanted).isNull()
    }

    @Test
    fun `rien n est demande quand le systeme ne propose pas cette sortie`() {
        val wanted = TelecomAudioSync.endpointToRequest(
            snapshot(activeId = 3),
            current = endpoint(CallAudioRouteKind.Earpiece),
            available = listOf(endpoint(CallAudioRouteKind.Earpiece)),
        )
        assertThat(wanted).isNull()
    }
}
