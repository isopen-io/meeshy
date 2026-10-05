package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import org.junit.Test;

/** Haut-parleur, écouteur, filaire, Bluetooth : la sortie d'un appel dans la coque (#8049, D6, D15). */
public class CallAudioRoutesTest {

    private static final int[] PHONE = {CallAudioRoutes.TYPE_BUILTIN_EARPIECE, CallAudioRoutes.TYPE_BUILTIN_SPEAKER};
    private static final int[] PHONE_WITH_HEADSET = {
        CallAudioRoutes.TYPE_BUILTIN_SPEAKER,
        CallAudioRoutes.TYPE_BLUETOOTH_SCO,
        CallAudioRoutes.TYPE_BUILTIN_EARPIECE,
        CallAudioRoutes.TYPE_BLE_HEADSET,
    };

    @Test
    public void theOfferedRoutesAreOrderedAndUnique() {
        assertEquals(Arrays.asList("earpiece", "speaker"), CallAudioRoutes.available(PHONE));
        assertEquals(Arrays.asList("earpiece", "speaker", "bluetooth"), CallAudioRoutes.available(PHONE_WITH_HEADSET));
    }

    @Test
    public void unknownDevicesAreNotRoutes() {
        assertEquals(Collections.emptyList(), CallAudioRoutes.available(new int[] {99, 0}));
    }

    @Test
    public void wiredHeadsetsAndUsbAreOneWiredRoute() {
        int[] devices = {CallAudioRoutes.TYPE_WIRED_HEADSET, CallAudioRoutes.TYPE_USB_HEADSET, CallAudioRoutes.TYPE_WIRED_HEADPHONES};
        assertEquals(Collections.singletonList("wired"), CallAudioRoutes.available(devices));
    }

    @Test
    public void aVoiceCallStartsAtTheEarpieceAndAVideoCallOnTheSpeaker() {
        assertEquals("earpiece", CallAudioRoutes.defaultRoute(false, CallAudioRoutes.available(PHONE)));
        assertEquals("speaker", CallAudioRoutes.defaultRoute(true, CallAudioRoutes.available(PHONE)));
    }

    @Test
    public void aConnectedHeadsetWinsOverTheBuiltInRoutes() {
        assertEquals("bluetooth", CallAudioRoutes.defaultRoute(true, CallAudioRoutes.available(PHONE_WITH_HEADSET)));
        assertEquals("wired", CallAudioRoutes.defaultRoute(false, Arrays.asList("earpiece", "speaker", "wired")));
    }

    @Test
    public void aTabletWithoutEarpieceStartsOnTheSpeaker() {
        assertEquals("speaker", CallAudioRoutes.defaultRoute(false, Collections.singletonList("speaker")));
    }

    @Test
    public void theDeviceOfARouteIsTheFirstMatchingOne() {
        assertEquals(CallAudioRoutes.TYPE_BLUETOOTH_SCO, CallAudioRoutes.deviceTypeFor("bluetooth", PHONE_WITH_HEADSET));
        assertEquals(-1, CallAudioRoutes.deviceTypeFor("wired", PHONE_WITH_HEADSET));
    }

    @Test
    public void onlyAVoiceCallAtTheEarpieceHoldsTheProximitySensor() {
        assertTrue(CallAudioRoutes.holdsProximity(false, "earpiece"));
        assertFalse(CallAudioRoutes.holdsProximity(true, "earpiece"));
        assertFalse(CallAudioRoutes.holdsProximity(false, "speaker"));
        assertFalse(CallAudioRoutes.holdsProximity(false, "bluetooth"));
    }

    @Test
    public void beforeApi31TheSpeakerIsAFlagAndBluetoothGoesThroughSco() {
        assertTrue(CallAudioRoutes.legacySpeakerphone("speaker"));
        assertFalse(CallAudioRoutes.legacySpeakerphone("earpiece"));
        assertTrue(CallAudioRoutes.legacyBluetoothSco("bluetooth"));
        assertFalse(CallAudioRoutes.legacyBluetoothSco("speaker"));
    }
}
