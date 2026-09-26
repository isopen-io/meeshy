package me.meeshy.app;

import android.content.Context;
import android.content.Intent;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.WindowManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * L'APPEL NATIF DE LA COQUE (#8049) — ce que la WebView ne sait pas faire
 * seule pendant un appel, pilote par `src/lib/calls/shell-call.ts` :
 *
 * - `startCallService({ video })` / `stopCallService()` : service au premier
 *   plan (J2, D16), ecran maintenu allume, mode audio de communication,
 *   sortie par defaut, capteur de proximite (D15) ;
 * - `getAudioRoutes()` / `setAudioRoute({ route })` : ecouteur, haut-parleur,
 *   filaire, Bluetooth (D6) — `setCommunicationDevice` a partir de l'API 31,
 *   drapeau haut-parleur et SCO en dessous ({@link CallAudioRoutes}) ;
 * - `haptic({ kind })` : la vibration courte d'une transition (D19) ;
 * - `dismissIncomingCall({ callId })` : retire la notification d'un appel qui
 *   ne sonne plus dans l'app ;
 * - `setCredential` / `clearCredential` : ce qu'il faut au refus sans socket
 *   ({@link CallShellStore}).
 *
 * Evenement `callAnswer { callId }` : « Repondre » touche sur la notification.
 * RETENU jusqu'a l'abonnement de la page (`retainUntilConsumed`), comme les
 * liens de `MeeshyLinksPlugin` : un lancement a froid ne le perd pas.
 */
@CapacitorPlugin(name = "MeeshyCall")
public class MeeshyCallPlugin extends Plugin {

    private PowerManager.WakeLock proximity;
    private boolean callActive;
    private boolean video;
    private String route;

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;
        String ringing = intent.getStringExtra(IncomingCallNotifier.EXTRA_CALL_ID);
        if (ringing != null) showOverLockScreen(true);
        String answered = intent.getStringExtra(IncomingCallNotifier.EXTRA_ANSWER_CALL_ID);
        if (answered == null || answered.trim().isEmpty()) return;
        IncomingCallNotifier.dismiss(getContext(), answered);
        CallShellStore.silence(getContext(), answered);
        JSObject event = new JSObject();
        event.put("callId", answered);
        notifyListeners("callAnswer", event, true);
    }

    @PluginMethod
    public void startCallService(PluginCall call) {
        boolean wantsVideo = Boolean.TRUE.equals(call.getBoolean("video", false));
        AudioManager audio = audio();
        boolean starting = !callActive;
        callActive = true;
        video = wantsVideo;
        CallForegroundService.start(getContext(), wantsVideo);
        keepScreenOn(true);
        if (starting && audio != null) {
            audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
            applyRoute(audio, CallAudioRoutes.defaultRoute(wantsVideo, CallAudioRoutes.available(deviceTypes(audio))));
        }
        updateProximity();
        call.resolve(routesPayload(audio));
    }

    @PluginMethod
    public void stopCallService(PluginCall call) {
        release();
        call.resolve();
    }

    @PluginMethod
    public void getAudioRoutes(PluginCall call) {
        call.resolve(routesPayload(audio()));
    }

    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        String wanted = call.getString("route");
        AudioManager audio = audio();
        if (audio == null || wanted == null || !CallAudioRoutes.available(deviceTypes(audio)).contains(wanted)) {
            call.reject("unavailable");
            return;
        }
        applyRoute(audio, wanted);
        updateProximity();
        call.resolve(routesPayload(audio));
    }

    @PluginMethod
    @SuppressWarnings("deprecation")
    public void haptic(PluginCall call) {
        long[] pattern = CallShellRules.hapticPattern(call.getString("kind"));
        Vibrator vibrator = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
        if (pattern != null && vibrator != null && vibrator.hasVibrator()) vibrate(vibrator, pattern);
        call.resolve();
    }

    @PluginMethod
    public void dismissIncomingCall(PluginCall call) {
        String callId = call.getString("callId");
        IncomingCallNotifier.dismiss(getContext(), callId);
        CallShellStore.silence(getContext(), callId);
        if (!callActive) showOverLockScreen(false);
        call.resolve();
    }

    @PluginMethod
    public void setCredential(PluginCall call) {
        String apiBase = call.getString("apiBase");
        String kind = call.getString("kind");
        String token = call.getString("token");
        if (apiBase == null || CallShellRules.credentialHeader(kind, token) == null) {
            CallShellStore.clearCredential(getContext());
        } else {
            CallShellStore.saveCredential(getContext(), apiBase, kind, token);
        }
        call.resolve();
    }

    @PluginMethod
    public void clearCredential(PluginCall call) {
        CallShellStore.clearCredential(getContext());
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        release();
        super.handleOnDestroy();
    }

    private void release() {
        boolean wasActive = callActive;
        callActive = false;
        CallForegroundService.stop(getContext());
        keepScreenOn(false);
        showOverLockScreen(false);
        updateProximity();
        AudioManager audio = audio();
        if (wasActive && audio != null) restoreAudio(audio);
        route = null;
    }

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private static int[] deviceTypes(AudioManager audio) {
        if (audio == null) return new int[0];
        if (Build.VERSION.SDK_INT >= CallAudioRoutes.API_COMMUNICATION_DEVICE) {
            List<AudioDeviceInfo> devices = audio.getAvailableCommunicationDevices();
            int[] types = new int[devices.size()];
            for (int i = 0; i < types.length; i++) types[i] = devices.get(i).getType();
            return types;
        }
        AudioDeviceInfo[] outputs = audio.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
        int[] types = new int[outputs.length];
        for (int i = 0; i < types.length; i++) types[i] = outputs[i].getType();
        return types;
    }

    @SuppressWarnings("deprecation")
    private void applyRoute(AudioManager audio, String wanted) {
        if (Build.VERSION.SDK_INT >= CallAudioRoutes.API_COMMUNICATION_DEVICE) {
            int type = CallAudioRoutes.deviceTypeFor(wanted, deviceTypes(audio));
            for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
                if (device.getType() == type && audio.setCommunicationDevice(device)) {
                    route = wanted;
                    return;
                }
            }
            return;
        }
        boolean sco = CallAudioRoutes.legacyBluetoothSco(wanted);
        if (sco) {
            audio.startBluetoothSco();
        } else {
            audio.stopBluetoothSco();
        }
        audio.setBluetoothScoOn(sco);
        audio.setSpeakerphoneOn(CallAudioRoutes.legacySpeakerphone(wanted));
        route = wanted;
    }

    @SuppressWarnings("deprecation")
    private static void restoreAudio(AudioManager audio) {
        if (Build.VERSION.SDK_INT >= CallAudioRoutes.API_COMMUNICATION_DEVICE) {
            audio.clearCommunicationDevice();
        } else {
            audio.stopBluetoothSco();
            audio.setBluetoothScoOn(false);
            audio.setSpeakerphoneOn(false);
        }
        audio.setMode(AudioManager.MODE_NORMAL);
    }

    private JSObject routesPayload(AudioManager audio) {
        JSObject payload = new JSObject();
        payload.put("routes", new JSArray(CallAudioRoutes.available(deviceTypes(audio))));
        if (route != null) payload.put("route", route);
        return payload;
    }

    /** Le capteur de proximite n'eteint l'ecran que pour un appel VOCAL a l'ecouteur. */
    private void updateProximity() {
        boolean hold = callActive && CallAudioRoutes.holdsProximity(video, route);
        if (hold && proximity == null) {
            PowerManager power = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (power == null || !power.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return;
            proximity = power.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "meeshy:call-proximity");
            proximity.setReferenceCounted(false);
            proximity.acquire();
            return;
        }
        if (!hold && proximity != null) {
            if (proximity.isHeld()) proximity.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY);
            proximity = null;
        }
    }

    private void keepScreenOn(boolean on) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            if (on) {
                getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } else {
                getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            }
        });
    }

    /**
     * L'ecran d'appel s'affiche PAR-DESSUS l'ecran verrouille le temps d'une
     * sonnerie ou d'un appel — jamais au-dela : l'application ne reste pas
     * lisible sans deverrouiller une fois l'appel fini.
     */
    @SuppressWarnings("deprecation")
    private void showOverLockScreen(boolean show) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                getActivity().setShowWhenLocked(show);
                getActivity().setTurnScreenOn(show);
                return;
            }
            int flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (show) {
                getActivity().getWindow().addFlags(flags);
            } else {
                getActivity().getWindow().clearFlags(flags);
            }
        });
    }

    @SuppressWarnings("deprecation")
    private static void vibrate(Vibrator vibrator, long[] pattern) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
        } else {
            vibrator.vibrate(pattern, -1);
        }
    }
}
