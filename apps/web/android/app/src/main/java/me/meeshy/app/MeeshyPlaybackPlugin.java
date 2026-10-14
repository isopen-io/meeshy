package me.meeshy.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.SystemClock;
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
     * #9985 — un casque debranche ou deconnecte, remis a la page qui met en
     * pause la video qui s'entend, comme Chrome. Le vocal suit la voie de
     * {@link PlaybackForegroundService} (#9946).
     */
    private BroadcastReceiver noisy;

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

    /**
     * #10624 — la barre glissee ou les ±15 s de la carte : la position visee
     * part a la page, qui la pose sur l'audio qui joue. `false` sans page a
     * l'ecoute (plus ancienne que la carte decrite) : la carte n'avance rien.
     */
    static boolean seekRequested(long positionMs) {
        MeeshyPlaybackPlugin plugin = live;
        if (plugin == null || !plugin.hasListeners("seekRequested")) return false;
        JSObject data = new JSObject();
        data.put("positionMs", positionMs);
        plugin.notifyListeners("seekRequested", data);
        return true;
    }

    /** #10624 — suivant / precedent, offerts seulement quand la page declare une file (#10627). */
    static boolean skipRequested(boolean next) {
        MeeshyPlaybackPlugin plugin = live;
        String event = next ? "nextRequested" : "previousRequested";
        if (plugin == null || !plugin.hasListeners(event)) return false;
        plugin.notifyListeners(event, new JSObject());
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
        noisy = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                notifyListeners("becomingNoisy", new JSObject());
            }
        };
        ContextCompat.registerReceiver(getContext(), noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
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

    /** #10641 — la page reprend la lecture : le vocal lu depuis une notification se tait, jamais deux sons. */
    @PluginMethod
    public void holdPlayback(PluginCall call) {
        NotificationVoiceService.yieldToPage();
        PlaybackForegroundService.start(getContext());
        call.resolve();
    }

    /**
     * #10624 — la page decrit le vocal qui joue (auteur, conversation, date,
     * avatar, duree, position, vitesse), aux seules ruptures : la carte de
     * lecture le montre et extrapole la position. Un champ absent garde le
     * libelle generique.
     */
    @PluginMethod
    public void nowPlaying(PluginCall call) {
        JSObject data = call.getData();
        Object sentAt = data.opt("sentAtMs");
        PlaybackForegroundService.describe(new PlaybackRules.Track(
            call.getString("key", ""),
            call.getString("sender"),
            call.getString("conversation"),
            sentAt instanceof Number ? Long.valueOf(PlaybackRules.millis(sentAt, 0)) : null,
            call.getString("artworkUrl"),
            Boolean.TRUE.equals(call.getBoolean("protected", false)),
            PlaybackRules.millis(data.opt("durationMs"), 0),
            PlaybackRules.millis(data.opt("positionMs"), 0),
            PlaybackRules.rate(data.opt("rate")),
            Boolean.TRUE.equals(call.getBoolean("playing", true)),
            Boolean.TRUE.equals(call.getBoolean("buffering", false)),
            Boolean.TRUE.equals(call.getBoolean("canNext", false)),
            Boolean.TRUE.equals(call.getBoolean("canPrevious", false)),
            SystemClock.elapsedRealtime()
        ));
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
        if (noisy != null) {
            getContext().unregisterReceiver(noisy);
            noisy = null;
        }
        PlaybackForegroundService.stop(getContext());
        super.handleOnDestroy();
    }
}
