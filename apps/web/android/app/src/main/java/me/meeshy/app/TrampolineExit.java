package me.meeshy.app;

import android.app.Activity;
import android.os.Build;

/**
 * Les relais invisibles (widget, actions de banniere) se ferment sans
 * animation : `overrideActivityTransition` a partir de l'API 34, la voie
 * historique avant.
 */
final class TrampolineExit {

    private TrampolineExit() {}

    static void finishWithoutAnimation(Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            activity.overrideActivityTransition(Activity.OVERRIDE_TRANSITION_CLOSE, 0, 0);
            activity.finish();
            return;
        }
        activity.finish();
        legacyNoAnimation(activity);
    }

    // overrideActivityTransition n'existe qu'a partir de l'API 34 (minSdk 24).
    @SuppressWarnings("deprecation")
    private static void legacyNoAnimation(Activity activity) {
        activity.overridePendingTransition(0, 0);
    }
}
