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

    /** Une demande absente ou illisible RETIRE le drapeau : la page tient seule le compte. */
    static boolean secure(Boolean requested) {
        return Boolean.TRUE.equals(requested);
    }
}
