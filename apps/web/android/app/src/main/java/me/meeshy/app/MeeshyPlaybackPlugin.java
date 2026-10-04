package me.meeshy.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * La lecture d'un message vocal tenue hors de l'ecran (#9257) :
 * `holdPlayback()` des qu'un `<audio>` de la page joue, puis
 * `releasePlayback()` quand le dernier s'arrete
 * ({@link PlaybackForegroundService}). La page disparue rend la lecture avec
 * elle : aucun service ne survit a la WebView qui l'a demande.
 */
@CapacitorPlugin(name = "MeeshyPlayback")
public class MeeshyPlaybackPlugin extends Plugin {

    @PluginMethod
    public void holdPlayback(PluginCall call) {
        PlaybackForegroundService.start(getContext());
        call.resolve();
    }

    @PluginMethod
    public void releasePlayback(PluginCall call) {
        PlaybackForegroundService.stop(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        PlaybackForegroundService.stop(getContext());
        super.handleOnDestroy();
    }
}
