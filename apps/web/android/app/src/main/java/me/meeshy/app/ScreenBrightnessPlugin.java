package me.meeshy.app;

import android.app.Activity;
import android.view.Window;
import android.view.WindowManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * #9531 — le flash du selfie (camera avant du studio de story) est un ecran
 * blanc : la page pousse la luminosite au maximum pendant la prise, puis rend
 * celle d'avant (`maxBrightness`, `src/lib/stories/studio-camera-engine.ts`),
 * comme `ComposerCameraFlash` sur iPhone. Seule la luminosite de la FENETRE
 * change : aucune permission, et le reglage du systeme reste intact.
 */
@CapacitorPlugin(name = "ScreenBrightness")
public class ScreenBrightnessPlugin extends Plugin {

    @PluginMethod
    public void getBrightness(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("activity-unavailable");
            return;
        }
        JSObject result = new JSObject();
        result.put("brightness", activity.getWindow().getAttributes().screenBrightness);
        call.resolve(result);
    }

    @PluginMethod
    public void setBrightness(PluginCall call) {
        Activity activity = getActivity();
        Float requested = call.getFloat("brightness");
        if (activity == null || requested == null) {
            call.reject("brightness-unavailable");
            return;
        }
        float brightness = ScreenBrightnessRules.window(requested);
        activity.runOnUiThread(() -> {
            Window window = activity.getWindow();
            WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.screenBrightness = brightness;
            window.setAttributes(attributes);
            call.resolve();
        });
    }
}
