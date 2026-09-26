package me.meeshy.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Les sorties audio d'un appel (#8049, D6, D15) — decisions PURES que
 * {@link MeeshyCallPlugin} execute sur `AudioManager`. Modele : `CallAudioRoute`
 * du Kotlin gele, etendu a l'ecouteur, au filaire et au Bluetooth.
 *
 * Les types d'appareil sont ceux de `android.media.AudioDeviceInfo`, recopies
 * pour que ces decisions se testent sur la JVM seule.
 */
public final class CallAudioRoutes {

    public static final String EARPIECE = "earpiece";
    public static final String SPEAKER = "speaker";
    public static final String WIRED = "wired";
    public static final String BLUETOOTH = "bluetooth";

    static final int TYPE_BUILTIN_EARPIECE = 1;
    static final int TYPE_BUILTIN_SPEAKER = 2;
    static final int TYPE_WIRED_HEADSET = 3;
    static final int TYPE_WIRED_HEADPHONES = 4;
    static final int TYPE_BLUETOOTH_SCO = 7;
    static final int TYPE_USB_HEADSET = 22;
    static final int TYPE_BLE_HEADSET = 26;
    static final int TYPE_BLE_SPEAKER = 27;

    /** `Build.VERSION_CODES.S` : `setCommunicationDevice` existe a partir d'ici. */
    public static final int API_COMMUNICATION_DEVICE = 31;

    private static final List<String> ORDER = Arrays.asList(EARPIECE, SPEAKER, WIRED, BLUETOOTH);

    private CallAudioRoutes() {}

    public static String routeOf(int deviceType) {
        switch (deviceType) {
            case TYPE_BUILTIN_EARPIECE:
                return EARPIECE;
            case TYPE_BUILTIN_SPEAKER:
                return SPEAKER;
            case TYPE_WIRED_HEADSET:
            case TYPE_WIRED_HEADPHONES:
            case TYPE_USB_HEADSET:
                return WIRED;
            case TYPE_BLUETOOTH_SCO:
            case TYPE_BLE_HEADSET:
            case TYPE_BLE_SPEAKER:
                return BLUETOOTH;
            default:
                return null;
        }
    }

    /** Les sorties offertes, dans un ordre stable, sans doublon. */
    public static List<String> available(int[] deviceTypes) {
        List<String> found = new ArrayList<>();
        for (int type : deviceTypes) {
            String route = routeOf(type);
            if (route != null && !found.contains(route)) found.add(route);
        }
        List<String> ordered = new ArrayList<>();
        for (String route : ORDER) {
            if (found.contains(route)) ordered.add(route);
        }
        return ordered;
    }

    /**
     * La sortie d'un appel qui commence : un casque branche l'emporte (on l'a
     * mis pour ca), sinon la video au haut-parleur (le telephone est tenu
     * devant soi) et la voix a l'ecouteur — le haut-parleur quand l'appareil
     * n'a pas d'ecouteur (tablette).
     */
    public static String defaultRoute(boolean video, List<String> available) {
        if (available.contains(BLUETOOTH)) return BLUETOOTH;
        if (available.contains(WIRED)) return WIRED;
        if (!video && available.contains(EARPIECE)) return EARPIECE;
        return SPEAKER;
    }

    /** Le premier appareil de la sortie demandee, ou -1 si elle n'est pas offerte. */
    public static int deviceTypeFor(String route, int[] deviceTypes) {
        for (int type : deviceTypes) {
            if (route.equals(routeOf(type))) return type;
        }
        return -1;
    }

    /** Le capteur de proximite eteint l'ecran contre l'oreille : appel VOCAL a l'ecouteur seulement. */
    public static boolean holdsProximity(boolean video, String route) {
        return !video && EARPIECE.equals(route);
    }

    /** Avant l'API 31 : le haut-parleur est un drapeau, le Bluetooth passe par SCO. */
    public static boolean legacySpeakerphone(String route) {
        return SPEAKER.equals(route);
    }

    public static boolean legacyBluetoothSco(String route) {
        return BLUETOOTH.equals(route);
    }
}
