package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Person;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;

/**
 * La notification d'un appel entrant, application fermee (#8049, C10, C11) :
 * plein ecran, canal a sonnerie, Repondre / Refuser. API du SYSTEME seule
 * (pas d'androidx) : `Notification.CallStyle` a partir de l'API 31, deux
 * actions nommees par la passerelle en dessous. Modele :
 * `MeeshyFcmService.showIncomingCallNotification` du Kotlin gele.
 *
 * - Repondre ouvre `MainActivity` avec {@link #EXTRA_ANSWER_CALL_ID} :
 *   `MeeshyCallPlugin` le remet a la page (`callAnswer`), et
 *   `src/lib/calls/shell-call.ts` decroche l'appel quand il sonne dans l'app
 *   (`call:check-active` le rejoue a la connexion).
 * - Refuser passe par {@link DeclineCallReceiver} — sans page, sans socket.
 * - Le toucher du corps et l'intention plein ecran ouvrent l'app qui sonne.
 */
final class IncomingCallNotifier {

    static final String CHANNEL_INCOMING = "meeshy_calls_incoming";
    static final String EXTRA_CALL_ID = "me.meeshy.app.call.id";
    static final String EXTRA_ANSWER_CALL_ID = "me.meeshy.app.call.answer";

    /** La sonnerie serveur dure 60 s : la notification ne lui survit pas. */
    private static final long RING_TIMEOUT_MS = 70_000L;

    private IncomingCallNotifier() {}

    @SuppressWarnings("deprecation")
    static void show(Context context, CallPush push) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        ensureChannel(context, manager);

        int id = CallPush.notificationId(push.callId);
        PendingIntent open = PendingIntent.getActivity(
            context,
            id,
            activityIntent(context, push.callId, false),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent answer = PendingIntent.getActivity(
            context,
            ("answer:" + push.callId).hashCode(),
            activityIntent(context, push.callId, true),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent decline = PendingIntent.getBroadcast(
            context,
            ("decline:" + push.callId).hashCode(),
            new Intent(context, DeclineCallReceiver.class).putExtra(EXTRA_CALL_ID, push.callId),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String title = push.title != null ? push.title : context.getString(R.string.call_incoming_fallback_title);
        String body = push.body != null
            ? push.body
            : context.getString(push.video ? R.string.call_incoming_video : R.string.call_incoming_audio);

        Notification.Builder builder = builder(context)
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(title)
            .setContentText(body)
            .setCategory(Notification.CATEGORY_CALL)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setFullScreenIntent(open, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setTimeoutAfter(RING_TIMEOUT_MS);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Person caller = new Person.Builder().setName(push.callerName != null ? push.callerName : title).setImportant(true).build();
            builder.setStyle(Notification.CallStyle.forIncomingCall(caller, decline, answer));
        } else {
            String declineLabel = push.declineLabel != null ? push.declineLabel : context.getString(R.string.call_action_decline);
            String answerLabel = push.answerLabel != null ? push.answerLabel : context.getString(R.string.call_action_answer);
            builder
                .setPriority(Notification.PRIORITY_MAX)
                .addAction(new Notification.Action.Builder(null, declineLabel, decline).build())
                .addAction(new Notification.Action.Builder(null, answerLabel, answer).build());
        }
        manager.notify(id, builder.build());
    }

    static void dismiss(Context context, String callId) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null && callId != null) manager.cancel(CallPush.notificationId(callId));
    }

    private static Intent activityIntent(Context context, String callId, boolean answer) {
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA_CALL_ID, callId);
        return answer ? intent.putExtra(EXTRA_ANSWER_CALL_ID, callId) : intent;
    }

    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, CHANNEL_INCOMING)
            : new Notification.Builder(context);
    }

    /**
     * Canal HAUTE importance a sonnerie d'APPAREIL (volume sonnerie, mode
     * silencieux respecte). Les canaux sont immuables apres creation : ce qui
     * change de son change d'identifiant.
     */
    private static void ensureChannel(Context context, NotificationManager manager) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_INCOMING,
            context.getString(R.string.call_channel_incoming_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.call_channel_incoming_description));
        channel.setShowBadge(false);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] {0, 1_000, 800, 1_000, 800});
        manager.createNotificationChannel(channel);
    }
}
