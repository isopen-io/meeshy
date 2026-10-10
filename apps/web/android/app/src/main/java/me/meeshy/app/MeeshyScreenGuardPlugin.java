package me.meeshy.app;

import android.app.Activity;
import android.os.Build;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.function.Consumer;

/**
 * #9574, #9617 — la capture d'un contenu qui disparait (decision porteur du
 * 2026-10-07).
 *
 * - `setSecure` : la page pose `FLAG_SECURE` tant qu'une vue unique est
 *   affichee et le retire quand il n'y en a plus (`src/lib/capture/capture-shield.ts`
 *   tient le COMPTE ; la coque n'applique que l'etat). Capture, enregistrement,
 *   recopie et vignette des recents rendent alors du noir, sur toutes les
 *   versions. Un document qui recharge repart sans drapeau : son compte repart
 *   de zero.
 * - `screenCaptured` (API 34+) : une capture aux boutons materiels pendant que
 *   l'activite est visible. D'apres AOSP android14-release,
 *   `WindowManagerService.notifyScreenshotListeners` ne lit pas `FLAG_SECURE` :
 *   le signal part aussi sur une vue unique noircie (la tentative s'annonce).
 * - `recordingChanged` (API 35+) : l'application entre dans un enregistrement
 *   ou une recopie d'ecran (MediaProjection), ou en sort.
 * - `getState` : ce qui est REELLEMENT a l'ecoute (rappel inscrit, donc version
 *   suffisante ET activite demarree), et l'etat courant. La page n'epargne
 *   `FLAG_SECURE` a un ephemere que si les deux ecoutes sont actives
 *   (`src/lib/capture/capture-policy.ts`, « annonce ou noir »).
 */
@CapacitorPlugin(name = "MeeshyScreenGuard")
public class MeeshyScreenGuardPlugin extends Plugin {

    private Object screenshotWatch;
    private Object recordingWatch;
    private boolean recording;

    @Override
    public void load() {
        getBridge()
            .addWebViewListener(
                new WebViewListener() {
                    @Override
                    public void onPageStarted(WebView webView) {
                        applySecure(false);
                    }
                }
            );
    }

    @PluginMethod
    public void setSecure(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("activity-unavailable");
            return;
        }
        boolean secure = ScreenGuardRules.secure(call.getBoolean("secure"));
        activity.runOnUiThread(() -> {
            applySecure(secure);
            call.resolve();
        });
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject state = new JSObject();
        state.put("screenshotDetection", screenshotWatch != null);
        state.put("recordingDetection", recordingWatch != null);
        state.put("recording", recording);
        call.resolve(state);
    }

    private void applySecure(boolean secure) {
        Activity activity = getActivity();
        if (activity == null) return;
        if (secure) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
    }

    @Override
    protected void handleOnStart() {
        Activity activity = getActivity();
        if (activity == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && screenshotWatch == null) {
            screenshotWatch = ScreenshotWatch.start(activity, () -> notifyListeners("screenCaptured", new JSObject()));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM && recordingWatch == null) {
            recordingWatch = RecordingWatch.start(activity, this::recordingStateChanged);
        }
    }

    @Override
    protected void handleOnStop() {
        Activity activity = getActivity();
        if (activity == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && screenshotWatch != null) {
            ScreenshotWatch.stop(activity, screenshotWatch);
            screenshotWatch = null;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM && recordingWatch != null) {
            RecordingWatch.stop(activity, recordingWatch);
            recordingWatch = null;
        }
    }

    private void recordingStateChanged(Integer state) {
        boolean now = ScreenGuardRules.recorded(state);
        if (now == recording) return;
        recording = now;
        JSObject data = new JSObject();
        data.put("recording", now);
        notifyListeners("recordingChanged", data);
    }

    /** Les types de l'API 34 restent dans cette classe : une version anterieure ne les resout jamais. */
    @RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
    private static final class ScreenshotWatch {

        static Object start(Activity activity, Runnable onCapture) {
            Activity.ScreenCaptureCallback callback = onCapture::run;
            activity.registerScreenCaptureCallback(activity.getMainExecutor(), callback);
            return callback;
        }

        static void stop(Activity activity, Object callback) {
            activity.unregisterScreenCaptureCallback((Activity.ScreenCaptureCallback) callback);
        }
    }

    /** L'etat initial est rendu a l'inscription : un enregistrement deja en cours se signale aussitot. */
    @RequiresApi(Build.VERSION_CODES.VANILLA_ICE_CREAM)
    private static final class RecordingWatch {

        static Object start(Activity activity, Consumer<Integer> onState) {
            Consumer<Integer> callback = onState::accept;
            int initial = activity.getWindowManager().addScreenRecordingCallback(activity.getMainExecutor(), callback);
            onState.accept(initial);
            return callback;
        }

        @SuppressWarnings("unchecked")
        static void stop(Activity activity, Object callback) {
            activity.getWindowManager().removeScreenRecordingCallback((Consumer<Integer>) callback);
        }
    }
}
