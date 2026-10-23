package me.meeshy.app;

import android.app.Activity;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #9533 — le fond derriere les barres systeme suit le theme CHOISI dans
 * l'app. La couleur vient de la meta `theme-color` du schema peint
 * (`src/lib/scheme.ts`), seule source.
 *
 * #12447 — la coque est bord a bord a toute version (`MainActivity`,
 * `EdgeToEdge.enable`) : les barres sont transparentes et c'est la page, ou
 * ce fond de fenetre, qui se voit derriere. Plus aucun appel a
 * `setStatusBarColor` / `setNavigationBarColor`, obsoletes depuis l'API 35.
 *
 * #10085 — le fond de la fenetre aussi, a toute version : sous une WebView
 * < 140, `SystemBars` rembourre la fenetre et ce fond se voit derriere les
 * barres. Laisse au theme `DayNight`, il suivait le schema du systeme.
 */
@CapacitorPlugin(name = "MeeshySystemBars")
public class MeeshySystemBarsPlugin extends Plugin {

    @PluginMethod
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
            call.resolve();
        });
    }
}
