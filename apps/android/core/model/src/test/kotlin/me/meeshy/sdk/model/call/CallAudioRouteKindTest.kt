package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallAudioRouteKindTest {
    @Test
    fun `les types de périphérique deviennent des genres`() {
        assertThat(CallAudioRouteKind.fromDeviceType(1)).isEqualTo(CallAudioRouteKind.Earpiece)
        assertThat(CallAudioRouteKind.fromDeviceType(2)).isEqualTo(CallAudioRouteKind.Speaker)
        assertThat(CallAudioRouteKind.fromDeviceType(7)).isEqualTo(CallAudioRouteKind.Bluetooth)
        assertThat(CallAudioRouteKind.fromDeviceType(26)).isEqualTo(CallAudioRouteKind.Bluetooth)
        assertThat(CallAudioRouteKind.fromDeviceType(3)).isEqualTo(CallAudioRouteKind.Wired)
        assertThat(CallAudioRouteKind.fromDeviceType(22)).isEqualTo(CallAudioRouteKind.Usb)
        assertThat(CallAudioRouteKind.fromDeviceType(23)).isEqualTo(CallAudioRouteKind.HearingAid)
        assertThat(CallAudioRouteKind.fromDeviceType(21)).isEqualTo(CallAudioRouteKind.Car)
        assertThat(CallAudioRouteKind.fromDeviceType(999)).isEqualTo(CallAudioRouteKind.Other)
    }

    @Test
    fun `seules les sorties hors de l'appareil sont externes`() {
        assertThat(CallAudioRouteKind.Bluetooth.isExternal).isTrue()
        assertThat(CallAudioRouteKind.HearingAid.isExternal).isTrue()
        assertThat(CallAudioRouteKind.Earpiece.isExternal).isFalse()
        assertThat(CallAudioRouteKind.Speaker.isExternal).isFalse()
    }
}
