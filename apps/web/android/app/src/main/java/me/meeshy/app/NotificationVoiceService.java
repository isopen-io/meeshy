package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Le vocal ecoute DEPUIS SA NOTIFICATION, sans ouvrir l'app (#10641) — le
 * pendant Android de `NotificationAudioPlayer.swift` (iOS, #8856).
 *
 * Lecteur SYSTEME (`MediaPlayer`), aucun SDK ni client d'API : la page n'est
 * peut-etre pas chargee, et l'adresse vient de la charge du push (la piste
 * que le serveur a elue pour ce lecteur, `servedAttachmentMedia`). Le fichier
 * est telecharge par la coque elle-meme, redirections non suivies d'office :
 * chaque saut est revalide ({@link NotificationVoiceRules#redirectTarget}),
 * le type servi doit etre audio et le corps borne. `MediaPlayer` ne lit
 * ensuite qu'un fichier LOCAL.
 *
 * Au premier plan (`mediaPlayback`) avec le focus audio : un appel, une autre
 * app qui joue, ou un casque debranche mettent en pause. JAMAIS DEUX SONS :
 * avant de jouer, la page est priee de mettre ses vocaux en pause
 * (`MeeshyPlaybackPlugin.pauseRequested`, sa propre voie) ; et la page qui
 * reprend la main appelle {@link #yieldToPage}.
 *
 * Une `MediaSession` porte auteur et conversation : l'ecran verrouille et les
 * reglages rapides montrent le lecteur. La notification du message passe en
 * « Pause » pendant la lecture, et revient a « Ecouter » ensuite.
 *
 * L'ECOUTE SE RAPPORTE comme dans la page (`use-media-playback.ts`) : a la
 * pause et a la fin, `POST /attachments/:id/status` avec le credential que la
 * page a pose ({@link CallShellStore}). Un rapport qui echoue est garde (borne)
 * et repart au rapport suivant.
 */
public class NotificationVoiceService extends Service {

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(ShellLocale.wrap(base));
    }

    static final String ACTION_PLAY = "me.meeshy.app.voice.PLAY";
    static final String ACTION_PAUSE = "me.meeshy.app.voice.PAUSE";
    static final String ACTION_STOP = "me.meeshy.app.voice.STOP";

    private static final String TAG = "MeeshyNotificationVoice";
    private static final String CHANNEL = "meeshy_notification_voice";
    private static final int NOTIFICATION_ID = 0x4e56; // "NV"
    private static final int TIMEOUT_MS = 15_000;
    private static final String PREFS = "meeshy_notification_voice";
    private static final String KEY_PENDING = "pendingReports";
    private static final int MAX_PENDING = 20;

    private static volatile NotificationVoiceService running;

    /** La page reprend la lecture : le vocal de la notification se tait (jamais deux sons). */
    static void yieldToPage() {
        NotificationVoiceService service = running;
        if (service != null) new Handler(Looper.getMainLooper()).post(() -> service.pause("superseded"));
    }

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private MediaSession session;
    private AudioManager audio;
    private AudioFocusRequest focusRequest;
    private MediaPlayer player;
    private File file;
    private Map<String, String> payload;
    private NotificationVoiceRules.Voice voice;
    private boolean playing;
    private boolean noisyRegistered;
    private long stretchStartMs = -1;
    private final List<NotificationVoiceRules.Stretch> stretches = new ArrayList<>();

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            pause("pause");
        }
    };

    private final AudioManager.OnAudioFocusChangeListener focus = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS
            || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
            || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            pause("pause");
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        audio = getSystemService(AudioManager.class);
        session = new MediaSession(this, TAG);
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                resume();
            }

            @Override
            public void onPause() {
                pause("pause");
            }

            @Override
            public void onStop() {
                finish("dismissed", false);
            }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Demarre par `getForegroundService` : le premier plan se prend AVANT
        // toute decision, meme celle de s'arreter aussitot.
        goForeground(notification());
        String action = intent == null ? null : intent.getAction();
        if (ACTION_PAUSE.equals(action)) {
            if (player == null) stopNow();
            else pause("pause");
        } else if (ACTION_STOP.equals(action)) {
            finish("dismissed", false);
        } else if (ACTION_PLAY.equals(action)) {
            Bundle extras = intent.getBundleExtra(NotificationVoiceBanner.EXTRA_PAYLOAD);
            play(extras == null ? new HashMap<>() : NotificationVoiceBanner.payloadOf(extras));
        } else {
            stopNow();
        }
        return START_NOT_STICKY;
    }

    private void play(Map<String, String> data) {
        NotificationVoiceRules.Voice requested = NotificationVoiceRules.listenable(
            data, CallShellStore.apiBase(this), NotificationVoiceBanner.debuggable(this));
        if (requested == null) {
            stopNow();
            return;
        }
        if (voice != null && requested.messageId.equals(voice.messageId) && player != null) {
            resume();
            return;
        }
        if (voice != null) finish("superseded", false);
        payload = data;
        voice = requested;
        stretches.clear();
        MeeshyPlaybackPlugin.pauseRequested();
        publish(true);
        io.execute(() -> download(requested));
    }

    private void download(NotificationVoiceRules.Voice target) {
        File fetched = fetch(target.url);
        main.post(() -> {
            if (voice != target) {
                if (fetched != null) fetched.delete();
                return;
            }
            if (fetched == null) {
                fail();
                return;
            }
            file = fetched;
            prepare(fetched);
        });
    }

    /** Le fichier, telecharge sans suivre d'office une redirection, ou null. */
    private File fetch(String url) {
        String apiBase = CallShellStore.apiBase(this);
        boolean debug = NotificationVoiceBanner.debuggable(this);
        String current = url;
        for (int hop = 0; hop <= NotificationVoiceRules.MAX_REDIRECTS; hop++) {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) URI.create(current).toURL().openConnection();
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(TIMEOUT_MS);
                connection.setReadTimeout(TIMEOUT_MS);
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    current = NotificationVoiceRules.redirectTarget(current, connection.getHeaderField("Location"), apiBase, debug);
                    if (current == null) return null;
                    continue;
                }
                if (status != 200) return null;
                if (!NotificationVoiceRules.servedAudio(connection.getContentType())) return null;
                if (!NotificationVoiceRules.lengthAcceptable(connection.getContentLengthLong())) return null;
                File out = File.createTempFile("voice", ".audio", getCacheDir());
                long total = 0;
                try (InputStream in = connection.getInputStream(); OutputStream sink = new FileOutputStream(out)) {
                    byte[] buffer = new byte[16 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) {
                        total += read;
                        if (total > NotificationVoiceRules.MAX_BYTES) {
                            out.delete();
                            return null;
                        }
                        sink.write(buffer, 0, read);
                    }
                }
                return out;
            } catch (Exception failure) {
                Log.w(TAG, "vocal non telecharge", failure);
                return null;
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
        return null;
    }

    private void prepare(File source) {
        MediaPlayer media = new MediaPlayer();
        media.setAudioAttributes(attributes());
        media.setOnCompletionListener(done -> finish("completed", true));
        media.setOnErrorListener((failed, what, extra) -> {
            fail();
            return true;
        });
        try {
            media.setDataSource(source.getAbsolutePath());
            media.prepare();
        } catch (Exception failure) {
            Log.w(TAG, "vocal illisible", failure);
            media.release();
            fail();
            return;
        }
        player = media;
        resume();
    }

    private void resume() {
        MediaPlayer media = player;
        if (media == null || playing) return;
        if (!requestFocus()) return;
        MeeshyPlaybackPlugin.pauseRequested();
        media.start();
        playing = true;
        stretchStartMs = media.getCurrentPosition();
        if (!noisyRegistered) {
            ContextCompat.registerReceiver(this, noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
            noisyRegistered = true;
        }
        publish(false);
        goForeground(notification());
    }

    void pause(String endedBy) {
        MediaPlayer media = player;
        if (media == null || !playing) return;
        media.pause();
        playing = false;
        closeStretch(media.getCurrentPosition(), endedBy);
        abandonFocus();
        unregisterNoisy();
        publish(false);
        report(media.getCurrentPosition(), false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification());
        stopForeground(Service.STOP_FOREGROUND_DETACH);
    }

    private void finish(String endedBy, boolean complete) {
        MediaPlayer media = player;
        if (media != null) {
            long position = complete ? Math.max(media.getDuration(), 0) : media.getCurrentPosition();
            if (playing) closeStretch(position, endedBy);
            if (complete || !stretches.isEmpty()) report(position, complete);
            media.release();
        }
        player = null;
        playing = false;
        abandonFocus();
        unregisterNoisy();
        NotificationVoiceRules.Voice ended = voice;
        Map<String, String> endedPayload = payload;
        voice = null;
        payload = null;
        if (file != null) file.delete();
        file = null;
        if (ended != null) NotificationVoiceBanner.show(this, endedPayload, ended, false);
        if (!"superseded".equals(endedBy)) stopNow();
    }

    /** Le vocal ne se lit pas : la notification le DIT et repropose « Ecouter ». */
    private void fail() {
        NotificationVoiceRules.Voice failed = voice;
        Map<String, String> failedPayload = payload;
        finish("dismissed", false);
        if (failed != null) {
            NotificationVoiceBanner.show(this, failedPayload, failed, false, getString(R.string.notification_voice_failed));
        }
    }

    private void stopNow() {
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    private void closeStretch(long endMs, String endedBy) {
        if (stretchStartMs >= 0) stretches.add(new NotificationVoiceRules.Stretch(stretchStartMs, endMs, endedBy));
        stretchStartMs = -1;
    }

    /** L'etat courant, sur la session, la notification du message et celle du lecteur. */
    private void publish(boolean loading) {
        NotificationVoiceRules.Voice current = voice;
        if (current == null) return;
        long position = player == null ? 0 : player.getCurrentPosition();
        long duration = player != null && player.getDuration() > 0 ? player.getDuration() : current.durationMs;
        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, NotificationVoiceRules.playerTitle(current, getString(R.string.notification_voice_title)))
            .putString(MediaMetadata.METADATA_KEY_ARTIST, NotificationVoiceRules.playerSubtitle(current))
            .putLong(MediaMetadata.METADATA_KEY_DURATION, Math.max(duration, 0))
            .build());
        int state = loading ? PlaybackState.STATE_BUFFERING : playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED;
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
            .setState(state, position, playing ? 1f : 0f, SystemClock.elapsedRealtime())
            .build());
        session.setActive(true);
        NotificationVoiceBanner.show(this, payload, current, playing || loading);
    }

    private Notification notification() {
        ensureChannel();
        NotificationVoiceRules.Voice current = voice;
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL)
            : new Notification.Builder(this);
        builder.setSmallIcon(R.drawable.ic_stat_meeshy)
            .setColor(ContextCompat.getColor(this, R.color.meeshy_notification_accent))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setDeleteIntent(foreground(new Intent(this, NotificationVoiceService.class).setAction(ACTION_STOP), 1))
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0));
        if (current == null) {
            builder.setContentTitle(getString(R.string.notification_voice_title));
            return builder.build();
        }
        builder.setContentTitle(NotificationVoiceRules.playerTitle(current, getString(R.string.notification_voice_title)))
            .setContentText(player == null ? getString(R.string.notification_voice_loading) : NotificationVoiceRules.playerSubtitle(current))
            .setOngoing(playing);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) builder.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE));
        if (player != null) {
            int icon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
            String label = getString(playing ? R.string.notification_voice_pause : R.string.notification_voice_resume);
            Intent toggle = new Intent(this, NotificationVoiceService.class)
                .setAction(playing ? ACTION_PAUSE : ACTION_PLAY)
                .putExtra(NotificationVoiceBanner.EXTRA_PAYLOAD, NotificationVoiceBanner.bundleOf(payload));
            builder.addAction(new Notification.Action.Builder(Icon.createWithResource(this, icon), label, foreground(toggle, 2)).build());
        }
        return builder.build();
    }

    private PendingIntent foreground(Intent intent, int request) {
        int flags = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? PendingIntent.getForegroundService(this, request, intent, flags)
            : PendingIntent.getService(this, request, intent, flags);
    }

    private void goForeground(Notification notification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (RuntimeException refused) {
            Log.w(TAG, "premier plan refuse", refused);
        }
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.notification_voice_channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setSound(null, null);
        channel.enableVibration(false);
        channel.setShowBadge(false);
        manager.createNotificationChannel(channel);
    }

    private static AudioAttributes attributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    }

    private boolean requestFocus() {
        if (audio == null) return true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(attributes())
                .setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener(focus, main)
                .build();
            return audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
            == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void abandonFocus() {
        if (audio == null) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (focusRequest != null) audio.abandonAudioFocusRequest(focusRequest);
            focusRequest = null;
        } else {
            audio.abandonAudioFocus(focus);
        }
    }

    private void unregisterNoisy() {
        if (!noisyRegistered) return;
        unregisterReceiver(noisy);
        noisyRegistered = false;
    }

    // ── Le rapport d'ecoute ─────────────────────────────────────────────────

    private void report(long positionMs, boolean complete) {
        NotificationVoiceRules.Voice current = voice;
        if (current == null) return;
        String url = NotificationVoiceRules.reportUrl(CallShellStore.apiBase(this), current.attachmentId);
        long duration = player != null && player.getDuration() > 0 ? player.getDuration() : current.durationMs;
        String body = NotificationVoiceRules.reportBody(positionMs, duration, complete, stretches, current.language);
        stretches.clear();
        if (url == null) return;
        Context context = getApplicationContext();
        io.execute(() -> {
            flushPending(context);
            if (!send(context, url, body)) keepPending(context, url, body);
        });
    }

    /** Best effort, comme l'accuse de remise : sans credential, rien ne part. */
    private static boolean send(Context context, String url, String body) {
        String[] header = CallShellStore.credentialHeader(context);
        if (header == null) return true;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) URI.create(url).toURL().openConnection();
            connection.setRequestMethod("POST");
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty(header[0], header[1]);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(body.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            // Un 4xx ne se rejoue pas : le serveur a juge le rapport.
            return status < 500;
        } catch (Exception failure) {
            Log.w(TAG, "ecoute non rapportee", failure);
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static synchronized void keepPending(Context context, String url, String body) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
            JSONArray pending = new JSONArray(prefs.getString(KEY_PENDING, "[]"));
            pending.put(new JSONObject().put("url", url).put("body", body));
            while (pending.length() > MAX_PENDING) pending.remove(0);
            prefs.edit().putString(KEY_PENDING, pending.toString()).apply();
        } catch (Exception ignored) {
            Log.w(TAG, "ecoute non gardee");
        }
    }

    private static synchronized void flushPending(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, MODE_PRIVATE);
        String stored = prefs.getString(KEY_PENDING, "[]");
        if ("[]".equals(stored)) return;
        prefs.edit().remove(KEY_PENDING).apply();
        try {
            JSONArray pending = new JSONArray(stored);
            for (int i = 0; i < pending.length(); i++) {
                JSONObject entry = pending.getJSONObject(i);
                String url = entry.getString("url");
                String body = entry.getString("body");
                if (!send(context, url, body)) keepPending(context, url, body);
            }
        } catch (Exception ignored) {
            Log.w(TAG, "ecoutes gardees illisibles");
        }
    }

    @Override
    public void onDestroy() {
        if (player != null) finish("dismissed", false);
        running = null;
        session.release();
        io.shutdown();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
