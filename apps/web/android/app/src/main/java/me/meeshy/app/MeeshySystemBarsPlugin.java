package me.meeshy.app;

import android.app.Activity;
import android.graphics.drawable.ColorDrawable;
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
 *
 * #10085 — le fond de la fenetre aussi, a toute version : sous une WebView
 * < 140, `SystemBars` rembourre la fenetre et ce fond se voit derriere les
 * barres. Laisse au theme `DayNight`, il suivait le schema du systeme.
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
            window.setBackgroundDrawable(new ColorDrawable(color));
            if (SystemBarPaint.paintsStatus(Build.VERSION.SDK_INT)) window.setStatusBarColor(color);
            if (SystemBarPaint.paintsNavigation(Build.VERSION.SDK_INT)) window.setNavigationBarColor(color);
            call.resolve();
        });
    }
}
