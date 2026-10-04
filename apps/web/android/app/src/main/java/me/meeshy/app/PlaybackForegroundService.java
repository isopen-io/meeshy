package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

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
 * joue ; sa notification discrete rouvre l'application.
 */
public class PlaybackForegroundService extends Service {

    private static final String CHANNEL_PLAYBACK = "meeshy_playback";
    private static final int NOTIFICATION_ID = 0x4d50; // "MP"
    private static final String TAG = "MeeshyPlayback";

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

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification());
            }
        } catch (RuntimeException refused) {
            Log.w(TAG, "premier plan refuse", refused);
            stopSelf();
        }
        return START_NOT_STICKY;
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
    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(
            this,
            NOTIFICATION_ID,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
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
            .setContentTitle(getString(R.string.playback_ongoing))
            .setContentText(getString(R.string.playback_return))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(open)
            .build();
    }
}
