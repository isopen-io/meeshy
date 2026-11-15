package me.meeshy.app;

/**
 * #9617, #9574 — ce que la coque sait de la capture d'ecran, selon la version
 * d'Android. Testee sur la JVM seule.
 *
 * - API 34 (Android 14) : `Activity.registerScreenCaptureCallback` signale la
 *   capture faite aux boutons materiels (ni `adb`, ni un test instrumente).
 * - API 35 (Android 15) : `WindowManager.addScreenRecordingCallback` dit si une
 *   activite de l'application est dans un enregistrement ou une recopie
 *   (MediaProjection, ecran entier ou application seule).
 * - Avant : aucune detection. `FLAG_SECURE`, lui, noircit sur toutes les versions.
 */
final class ScreenGuardRules {

    /** `WindowManager.SCREEN_RECORDING_STATE_VISIBLE`. */
    static final int SCREEN_RECORDING_STATE_VISIBLE = 1;

    private ScreenGuardRules() {}

    static boolean recorded(Integer state) {
        return state != null && state == SCREEN_RECORDING_STATE_VISIBLE;
    }

    /** API 34 : `Activity.registerScreenCaptureCallback`. */
    static final int SCREENSHOT_MIN_SDK = 34;

    /** API 35 : `WindowManager.addScreenRecordingCallback`. */
    static final int RECORDING_MIN_SDK = 35;

    /** #10508 — la coque sait-elle qu'une capture d'ecran a eu lieu ? Meme seuil que la garde `UPSIDE_DOWN_CAKE` du greffon (garde `android-screen-guard.test.ts`). */
    static boolean detectsScreenshots(int sdk) {
        return sdk >= SCREENSHOT_MIN_SDK;
    }

    /** #10508 — la coque sait-elle qu'un enregistrement ou une recopie commence ou finit ? */
    static boolean detectsRecording(int sdk) {
        return sdk >= RECORDING_MIN_SDK;
    }

    /** Une demande absente ou illisible RETIRE le drapeau : la page tient seule le compte. */
    static boolean secure(Boolean requested) {
        return Boolean.TRUE.equals(requested);
    }
}
