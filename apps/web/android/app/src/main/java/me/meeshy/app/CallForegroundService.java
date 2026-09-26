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
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

/**
 * L'appel en cours tient au PREMIER PLAN (#8049, J2, D16). Sans lui, Android
 * coupe le micro — et la camera — de la WebView des que l'ecran s'eteint ou
 * que l'utilisateur quitte l'application : l'appel continue, muet. Type
 * `microphone`, plus `camera` en video, chacun seulement si sa permission
 * d'execution est accordee ({@link CallShellRules#foregroundServiceTypes}).
 *
 * Demarre et arrete par `MeeshyCallPlugin` (`startCallService` /
 * `stopCallService`), que `src/lib/calls/shell-call.ts` pilote depuis le
 * magasin d'appel ; sa notification « Appel en cours » rouvre l'application.
 */
public class CallForegroundService extends Service {

    static final String EXTRA_VIDEO = "me.meeshy.app.call.video";
    private static final String CHANNEL_ONGOING = "meeshy_calls_ongoing";
    private static final int NOTIFICATION_ID = 0x4d43; // "MC"
    private static final String TAG = "MeeshyCallService";

    /**
     * Rien ne demarre sans un type accorde : `startForegroundService` engage a
     * appeler `startForeground`, et un service qui ne le peut pas ferait
     * tomber l'application a l'echeance.
     */
    static void start(Context context, boolean video) {
        int types = CallShellRules.foregroundServiceTypes(
            video,
            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED,
            context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        );
        if (types == 0) return;
        Intent intent = new Intent(context, CallForegroundService.class).putExtra(EXTRA_VIDEO, video);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (RuntimeException refused) {
            // API 31+ : un service au premier plan ne demarre pas depuis l'arriere-plan.
            Log.w(TAG, "service d'appel refuse", refused);
        }
    }

    static void stop(Context context) {
        context.stopService(new Intent(context, CallForegroundService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean video = intent != null && intent.getBooleanExtra(EXTRA_VIDEO, false);
        int types = CallShellRules.foregroundServiceTypes(
            video,
            granted(Manifest.permission.RECORD_AUDIO),
            granted(Manifest.permission.CAMERA)
        );
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && types != 0) {
                startForeground(NOTIFICATION_ID, notification(video), types);
            } else {
                startForeground(NOTIFICATION_ID, notification(video));
            }
        } catch (RuntimeException refused) {
            Log.w(TAG, "premier plan refuse", refused);
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    /** L'app balayee des recentes emporte la WebView, donc l'appel : le service n'a plus rien a tenir. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private boolean granted(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private Notification notification(boolean video) {
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
                CHANNEL_ONGOING,
                getString(R.string.call_channel_ongoing_name),
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setShowBadge(false);
            if (manager != null) manager.createNotificationChannel(channel);
            builder = new Notification.Builder(this, CHANNEL_ONGOING);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentTitle(getString(video ? R.string.call_ongoing_video : R.string.call_ongoing_audio))
            .setContentText(getString(R.string.call_ongoing_return))
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .setUsesChronometer(true)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setContentIntent(open)
            .build();
    }
}
