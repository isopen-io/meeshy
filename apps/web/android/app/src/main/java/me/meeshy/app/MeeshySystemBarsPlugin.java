package me.meeshy.app;

import android.app.Activity;
import android.os.Build;
import android.view.Window;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #9533 — le fond des barres systeme suit le theme CHOISI dans l'app, la ou
 * le systeme les peint encore (`SystemBarPaint`). La couleur vient de la meta
 * `theme-color` du schema peint (`src/lib/scheme.ts`), seule source.
 */
@CapacitorPlugin(name = "MeeshySystemBars")
public class MeeshySystemBarsPlugin extends Plugin {

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void paint(PluginCall call) {
        Activity activity = getActivity();
        Integer color = SystemBarPaint.opaque(call.getString("color"));
        if (activity == null || color == null) {
            call.reject("system-bars-unpainted");
            return;
        }
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            if (SystemBarPaint.paintsStatus(Build.VERSION.SDK_INT)) window.setStatusBarColor(color);
            if (SystemBarPaint.paintsNavigation(Build.VERSION.SDK_INT)) window.setNavigationBarColor(color);
            call.resolve();
        });
    }
}
