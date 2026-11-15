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
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import androidx.core.content.ContextCompat;
import java.util.TimeZone;

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
 *
 * La carte DIT ce qui joue et SE PILOTE (#10624), comme la carte Now Playing
 * d'iOS : la page remet le vocal (`nowPlaying`) — auteur, conversation, date,
 * avatar, duree, position, vitesse — aux seules ruptures, et la session
 * EXTRAPOLE la position (position + vitesse + horodatage), la barre avancant
 * seule. Glisser la barre et les ±15 s reviennent a la page en position visee
 * (`seekRequested`) : la page reste le SEUL moteur, aucun lecteur natif ne
 * relit le fichier. Sans description (une page plus ancienne), la carte garde
 * ses libelles generiques. Les regles sont dans {@link PlaybackRules}.
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

    /** Le dernier vocal decrit par la page, applique des que le service vit. */
    private static volatile PlaybackRules.Track described;

    static void describe(PlaybackRules.Track track) {
        described = track;
        new Handler(Looper.getMainLooper()).post(() -> {
            PlaybackForegroundService service = running;
            if (service != null && described == track) service.show(track);
        });
    }

    private MediaSession session;
    private boolean playing = true;
    private PlaybackRules.Track track;

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

            @Override
            public void onSeekTo(long positionMs) {
                seek(positionMs);
            }

            @Override
            public void onCustomAction(String action, android.os.Bundle extras) {
                skip(action);
            }

            @Override
            public void onSkipToNext() {
                MeeshyPlaybackPlugin.skipRequested(true);
            }

            @Override
            public void onSkipToPrevious() {
                MeeshyPlaybackPlugin.skipRequested(false);
            }
        });
        session.setPlaybackState(state());
        session.setActive(true);
        PlaybackRules.Track pending = described;
        if (pending != null) show(pending);
        ContextCompat.registerReceiver(this, noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY), ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    private PlaybackState state() {
        long now = SystemClock.elapsedRealtime();
        PlaybackState.Builder builder = new PlaybackState.Builder();
        if (track == null) {
            return builder
                .setActions(PlaybackRules.actions(playing, 0, false, false))
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
                .build();
        }
        builder
            .setActions(PlaybackRules.actions(playing, track.durationMs, track.canNext, track.canPrevious))
            .setState(
                playing ? (track.buffering ? PlaybackState.STATE_BUFFERING : PlaybackState.STATE_PLAYING) : PlaybackState.STATE_PAUSED,
                track.position(now),
                playing && !track.buffering ? track.rate : 0f,
                now);
        if (track.durationMs > 0) {
            builder.addCustomAction(new PlaybackState.CustomAction.Builder(PlaybackRules.ACTION_BACK, getString(R.string.playback_back), android.R.drawable.ic_media_rew).build());
            builder.addCustomAction(new PlaybackState.CustomAction.Builder(PlaybackRules.ACTION_FORWARD, getString(R.string.playback_forward), android.R.drawable.ic_media_ff).build());
        }
        return builder.build();
    }

    private PlaybackRules.Labels labels(PlaybackRules.Track shown) {
        return PlaybackRules.labels(
            shown.sender,
            shown.conversation,
            shown.sentAtMs,
            shown.protectedTrack,
            getString(R.string.playback_voice_message),
            getString(R.string.playback_protected),
            getResources().getConfiguration().getLocales().get(0),
            TimeZone.getDefault()
        );
    }

    private MediaMetadata metadata(PlaybackRules.Track shown, Bitmap artwork) {
        PlaybackRules.Labels labels = labels(shown);
        MediaMetadata.Builder builder = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, labels.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, labels.artist)
            .putString(MediaMetadata.METADATA_KEY_ALBUM, labels.album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, shown.durationMs);
        if (artwork != null) builder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artwork);
        return builder.build();
    }

    /** La page decrit son vocal : la carte le montre, et va chercher son image s'il le faut. */
    void show(PlaybackRules.Track next) {
        if (session == null) return;
        track = next;
        playing = next.playing;
        Bitmap artwork = PlaybackArtwork.cached(next.artworkUrl);
        session.setMetadata(metadata(next, artwork));
        session.setPlaybackState(state());
        if (artwork == null) {
            PlaybackArtwork.load(this, next.artworkUrl, (url, loaded) -> {
                PlaybackRules.Track current = track;
                if (session == null || current == null || !current.key.equals(next.key)) return;
                session.setMetadata(metadata(current, loaded));
                refresh();
            });
        }
        refresh();
    }

    /** La notification suit ce que la carte montre, sans changer d'etat au premier plan. */
    private void refresh() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(NOTIFICATION_ID, notification(playing));
    }

    /** La barre glissee : la position visee part a la page, la carte la montre tout de suite. */
    void seek(long positionMs) {
        if (track == null) return;
        long now = SystemClock.elapsedRealtime();
        long target = PlaybackRules.clamp(positionMs, track.durationMs);
        if (!MeeshyPlaybackPlugin.seekRequested(target)) return;
        track = track.seek(target, now);
        if (session != null) session.setPlaybackState(state());
    }

    /** ±15 s, depuis la position extrapolee. */
    void skip(String action) {
        if (track == null) return;
        long offset = PlaybackRules.ACTION_BACK.equals(action) ? -PlaybackRules.SKIP_MS : PlaybackRules.ACTION_FORWARD.equals(action) ? PlaybackRules.SKIP_MS : 0;
        if (offset == 0) return;
        seek(PlaybackRules.skip(track.position(SystemClock.elapsedRealtime()), offset, track.durationMs));
    }

    /** La page a mis ses vocaux en pause a la demande de la coque. */
    void parked() {
        MediaSession current = session;
        if (current == null) return;
        playing = false;
        if (track != null) track = track.at(SystemClock.elapsedRealtime(), false);
        current.setPlaybackState(state());
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
        if (track != null) track = track.at(SystemClock.elapsedRealtime(), true);
        if (session != null) session.setPlaybackState(state());
        foreground();
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        described = null;
        track = null;
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
        if (intent != null && (PlaybackRules.ACTION_BACK.equals(intent.getAction()) || PlaybackRules.ACTION_FORWARD.equals(intent.getAction()))) {
            skip(intent.getAction());
            return START_NOT_STICKY;
        }
        playing = true;
        if (session != null) session.setPlaybackState(state());
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
        PlaybackRules.Track shown = track;
        PlaybackRules.Labels labels = shown == null ? null : labels(shown);
        boolean seekable = shown != null && shown.durationMs > 0;
        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(labels != null ? labels.title : getString(playing ? R.string.playback_ongoing : R.string.playback_paused))
            .setContentText(labels != null ? (labels.artist != null ? labels.artist : getString(R.string.playback_return)) : getString(R.string.playback_return))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(playing)
            .setShowWhen(false)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setContentIntent(open)
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(seekable ? new int[] { 0, 1, 2 } : new int[] { 0 }));
        Bitmap artwork = shown == null ? null : PlaybackArtwork.cached(shown.artworkUrl);
        if (artwork != null) builder.setLargeIcon(artwork);
        if (seekable) builder.addAction(skipAction(PlaybackRules.ACTION_BACK, android.R.drawable.ic_media_rew, R.string.playback_back, NOTIFICATION_ID + 3));
        builder.addAction(new Notification.Action.Builder(
                Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
                getString(playing ? R.string.playback_pause : R.string.playback_play),
                toggle
            ).build());
        if (seekable) builder.addAction(skipAction(PlaybackRules.ACTION_FORWARD, android.R.drawable.ic_media_ff, R.string.playback_forward, NOTIFICATION_ID + 4));
        return builder
            .build();
    }

    private Notification.Action skipAction(String action, int icon, int label, int requestCode) {
        PendingIntent intent = PendingIntent.getService(
            this,
            requestCode,
            new Intent(this, PlaybackForegroundService.class).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), getString(label), intent).build();
    }
}
