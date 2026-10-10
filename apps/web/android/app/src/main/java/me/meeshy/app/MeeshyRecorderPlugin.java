package me.meeshy.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Le micro d'un message vocal tenu hors de l'ecran (#9238) :
 * `holdMicrophone()` des que l'enregistreur du composeur capte, puis
 * `releaseMicrophone()` a l'envoi, a l'annulation ou a la fermeture du
 * composeur ({@link RecordingForegroundService}). La page disparue rend le
 * micro avec elle : aucun service ne survit a la WebView qui l'a demande.
 */
@CapacitorPlugin(name = "MeeshyRecorder")
public class MeeshyRecorderPlugin extends Plugin {

    @PluginMethod
    public void holdMicrophone(PluginCall call) {
        RecordingForegroundService.start(getContext());
        call.resolve();
    }

    @PluginMethod
    public void releaseMicrophone(PluginCall call) {
        RecordingForegroundService.stop(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        RecordingForegroundService.stop(getContext());
        super.handleOnDestroy();
    }
}
