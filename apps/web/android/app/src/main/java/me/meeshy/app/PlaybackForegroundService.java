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
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;
import androidx.core.content.ContextCompat;

/**
 * Le message vocal ecoute tient la lecture au PREMIER PLAN (#9257). Sans lui,
 * Android gele le processus mis en cache des que l'utilisateur quitte l'app :
 * le vocal s'arrete au milieu d'une phrase. Chrome Android tient lui-meme la
 * lecture d'un audio en arriere-plan, iOS a son mode d'arriere-plan `audio` ;
 * c'est ici la meme chose pour la coque, comme `RecordingForegroundService`
 * (#9238) pour l'enregistrement.
 *
 * Demarre et arrete par `MeeshyPlaybackPlugin`, que
 * `src/lib/view/shell-playback.ts` pilote tant qu'un `<audio>` de la page
 * joue ; sa notification discrete rouvre l'application, et sa « Pause »
 * (#9301) — celle de la notification media de Chrome Android — est remise a
 * la page, qui met ses `<audio>` en pause.
 *
 * Le bouton d'un casque ou d'ecouteurs Bluetooth suit la meme voie (#9344) :
 * le service porte une `MediaSession` active, en lecture, qui n'accepte que
 * la pause — celle que Chrome Android ouvre pour un `<audio>` qui joue.
 *
 * Et sa notification est un LECTEUR lie a cette session (#9367), comme celle
 * de Chrome : le systeme la montre sur l'ecran verrouille et dans les
 * reglages rapides, la Pause visible sans deplier.
 *
 * Une pause demandee ici GARE la lecture (#9394), comme Chrome garde son
 * lecteur : la session passe en pause, la notification offre « Lecture » et
 * quitte le premier plan, donc se balaie. « Lecture », a la notification ou
 * au casque, repasse au premier plan et remet la reprise a la page.
 *
 * Un casque debranche ou deconnecte pendant la lecture (#9946) met le vocal
 * en pause par la meme voie, comme Chrome : sans cela il repartait sur le
 * haut-parleur du telephone.
 */
public class PlaybackForegroundService extends Service {

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(ShellLocale.wrap(base));
    }

    private static final String CHANNEL_PLAYBACK = "meeshy_playback";
    private static final int NOTIFICATION_ID = 0x4d50; // "MP"
    private static final String TAG = "MeeshyPlayback";
    static final String ACTION_PAUSE = "me.meeshy.app.playback.PAUSE";
    static final String ACTION_PLAY = "me.meeshy.app.playback.PLAY";

    private static volatile PlaybackForegroundService running;

    static void start(Context context) {
        Intent intent = new Intent(context, PlaybackForegroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException refused) {
            // API 31+ : un service au premier plan ne demarre pas depuis l'arriere-plan.
            Log.w(TAG, "service de lecture refuse", refused);
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, PlaybackForegroundService.class));
    }

    static void park() {
        PlaybackForegroundService service = running;
        if (service != null) new Handler(Looper.getMainLooper()).post(() -> service.parked());
    }

    private MediaSession session;
    private boolean playing = true;

    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!playing) return;
            if (!MeeshyPlaybackPlugin.pauseRequested()) stopSelf();
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        session = new MediaSession(this, TAG);
        session.setCallback(new MediaSession.Callback() {
            @Override
            public void onPause() {
                if (!MeeshyPlaybackPlugin.pauseRequested()) stopSelf();
            }

            @Override
            public void onPlay() {
                resume();
            }
        });
        session.setPlaybackState(state(true));
        session.setActive(true);
        ContextCompat.registerReceiver(this, noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private static PlaybackState state(boolean playing) {
        return new PlaybackState.Builder()
            .setActions(playing
                ? PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                : PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PLAY_PAUSE)
            .setState(
                playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                PlaybackState.PLAYBACK_POSITION_UNKNOWN,
                playing ? 1f : 0f)
            .build();
    }

    /** La page a mis ses vocaux en pause a la demande de la coque. */
    void parked() {
        MediaSession current = session;
        if (current == null) return;
        playing = false;
        current.setPlaybackState(state(false));
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(false));
        stopForeground(Service.STOP_FOREGROUND_DETACH);
    }

    /** « Lecture » : repasser au premier plan, puis remettre la reprise a la page. */
    void resume() {
        if (!MeeshyPlaybackPlugin.playRequested()) {
            // Plus de page pour reprendre : la notification garee s'en va aussi.
            stopSelf();
            return;
        }
        playing = true;
        if (session != null) session.setPlaybackState(state(true));
        foreground();
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        unregisterReceiver(noisy);
        if (session != null) session.release();
        // Une notification garee a quitte le premier plan : elle ne part pas seule.
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(NOTIFICATION_ID);
        session = null;
        super.onDestroy();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_PAUSE.equals(intent.getAction())) {
            // Une page sans ecoute (plus ancienne que la Pause) : rendre la main.
            if (!MeeshyPlaybackPlugin.pauseRequested()) stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_PLAY.equals(intent.getAction())) {
            resume();
            return START_NOT_STICKY;
        }
        playing = true;
        if (session != null) session.setPlaybackState(state(true));
        foreground();
        return START_NOT_STICKY;
    }

    private void foreground() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification(true), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification(true));
            }
        } catch (RuntimeException refused) {
            Log.w(TAG, "premier plan refuse", refused);
            stopSelf();
        }
    }

    /** L'app balayee des recentes emporte la WebView, donc la lecture. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @SuppressWarnings("deprecation")
    private Notification notification(boolean playing) {
        PendingIntent open = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent toggle = PendingIntent.getService(
            this,
            playing ? NOTIFICATION_ID + 1 : NOTIFICATION_ID + 2,
            new Intent(this, PlaybackForegroundService.class).setAction(playing ? ACTION_PAUSE : ACTION_PLAY),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_PLAYBACK,
                getString(R.string.playback_channel_name),
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setShowBadge(false);
            if (manager != null) manager.createNotificationChannel(channel);
            builder = new Notification.Builder(this, CHANNEL_PLAYBACK);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(getString(playing ? R.string.playback_ongoing : R.string.playback_paused))
            .setContentText(getString(R.string.playback_return))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(playing)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0))
            .addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
                getString(playing ? R.string.playback_pause : R.string.playback_play),
                toggle
            ).build())
            .build();
    }
}
