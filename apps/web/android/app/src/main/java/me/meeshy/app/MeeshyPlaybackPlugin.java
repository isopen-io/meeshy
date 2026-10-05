package me.meeshy.app;

import com.getcapacitor.JSObject;
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

    private static volatile MeeshyPlaybackPlugin live;

    /**
     * La « Pause » de la notification (#9301) remise a la page. Rend `false`
     * quand aucune page ne l'ecoute : le service se retire alors de lui-meme.
     */
    static boolean pauseRequested() {
        MeeshyPlaybackPlugin plugin = live;
        if (plugin == null || !plugin.hasListeners("pauseRequested")) return false;
        plugin.notifyListeners("pauseRequested", new JSObject());
        return true;
    }

    /**
     * La « Lecture » d'une pause garee (#9394), a la notification ou au
     * casque, remise a la page qui relance ses vocaux.
     */
    static boolean playRequested() {
        MeeshyPlaybackPlugin plugin = live;
        if (plugin == null || !plugin.hasListeners("playRequested")) return false;
        plugin.notifyListeners("playRequested", new JSObject());
        return true;
    }

    @Override
    public void load() {
        live = this;
    }

    @PluginMethod
    public void holdPlayback(PluginCall call) {
        PlaybackForegroundService.start(getContext());
        call.resolve();
    }

    /** La pause demandee par la coque garde le lecteur et offre « Lecture » (#9394). */
    @PluginMethod
    public void parkPlayback(PluginCall call) {
        PlaybackForegroundService.park();
        call.resolve();
    }

    @PluginMethod
    public void releasePlayback(PluginCall call) {
        PlaybackForegroundService.stop(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
        PlaybackForegroundService.stop(getContext());
        super.handleOnDestroy();
    }
}
