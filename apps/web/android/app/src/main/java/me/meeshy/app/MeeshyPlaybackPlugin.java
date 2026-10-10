package me.meeshy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import androidx.core.content.ContextCompat;
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

    /** #9847 — le bouton lecture/pause de la fenetre flottante d'une video ({@link MainActivity}). */
    static final String ACTION_FLOAT_TOGGLE = "me.meeshy.app.VIDEO_PIP_TOGGLE";

    private BroadcastReceiver floatToggle;

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
        floatToggle = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                notifyListeners("floatToggleRequested", new JSObject());
            }
        };
        ContextCompat.registerReceiver(getContext(), floatToggle, new IntentFilter(ACTION_FLOAT_TOGGLE), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    /** #9847 — la page dit si la video qui flotte joue ; le bouton de la fenetre suit. */
    @PluginMethod
    public void setFloatPlaying(PluginCall call) {
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        getActivity()
            .runOnUiThread(() -> {
                if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).floatPlaying(playing);
                call.resolve();
            });
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

    /**
     * #9410 — l'image dans l'image d'une video, la WebView n'ayant pas l'API :
     * la page passe la video en plein ecran, puis l'activite flotte. `floated`
     * faux : le systeme refuse, la page rend la video.
     */
    @PluginMethod
    public void floatVideo(PluginCall call) {
        int width = call.getInt("width", 0);
        int height = call.getInt("height", 0);
        getActivity()
            .runOnUiThread(() -> {
                JSObject result = new JSObject();
                result.put("floated", getActivity() instanceof MainActivity && ((MainActivity) getActivity()).floatVideo(width, height));
                call.resolve(result);
            });
    }

    @PluginMethod
    public void releasePlayback(PluginCall call) {
        PlaybackForegroundService.stop(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (live == this) live = null;
        if (floatToggle != null) {
            getContext().unregisterReceiver(floatToggle);
            floatToggle = null;
        }
        PlaybackForegroundService.stop(getContext());
        super.handleOnDestroy();
    }
}
