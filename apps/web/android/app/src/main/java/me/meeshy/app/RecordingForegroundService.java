package me.meeshy.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * Le message vocal en cours tient le micro au PREMIER PLAN (#9238). Sans lui,
 * Android coupe le micro de la WebView des que l'utilisateur quitte l'app ou
 * eteint l'ecran : `MediaRecorder` continue, mais n'enregistre que du silence
 * jusqu'au retour. Un navigateur tient lui-meme le micro d'un onglet masque,
 * iOS a son mode d'arriere-plan `audio` ; c'est ici la meme chose pour la
 * coque, comme `CallForegroundService` (#8049) pour un appel.
 *
 * Demarre et arrete par `MeeshyRecorderPlugin`, que
 * `src/lib/view/shell-microphone.ts` pilote depuis l'enregistreur du
 * composeur ; sa notification discrete rouvre l'application.
 */
public class RecordingForegroundService extends Service {

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(ShellLocale.wrap(base));
    }

    private static final String CHANNEL_RECORDING = "meeshy_recording";
    private static final int NOTIFICATION_ID = 0x4d52; // "MR"
    private static final String TAG = "MeeshyRecording";

    /** Sans micro accorde, aucun enregistrement n'a lieu : rien a tenir. */
    static void start(Context context) {
        if (context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        Intent intent = new Intent(context, RecordingForegroundService.class);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException refused) {
            // API 31+ : un service au premier plan ne demarre pas depuis l'arriere-plan.
            Log.w(TAG, "service du vocal refuse", refused);
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, RecordingForegroundService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                startForeground(NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
            } else {
                startForeground(NOTIFICATION_ID, notification());
            }
        } catch (RuntimeException refused) {
            Log.w(TAG, "premier plan refuse", refused);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /** L'app balayee des recentes emporte la WebView, donc l'enregistrement. */
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
                CHANNEL_RECORDING,
                getString(R.string.recording_channel_name),
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setShowBadge(false);
            if (manager != null) manager.createNotificationChannel(channel);
            builder = new Notification.Builder(this, CHANNEL_RECORDING);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle(getString(R.string.recording_ongoing))
            .setContentText(getString(R.string.recording_return))
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOngoing(true)
            .setUsesChronometer(true)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setContentIntent(open)
            .build();
    }
}
