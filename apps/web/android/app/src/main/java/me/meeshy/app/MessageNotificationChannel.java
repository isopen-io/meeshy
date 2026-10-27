package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Le canal PAR DEFAUT (#13212) : messages, mentions, reponses, activite. La
 * passerelle y adresse toute banniere qui n'est ni muette ni du jeu
 * (`services/gateway/src/services/android-push-config.ts`), et le manifeste en
 * fait le canal par defaut de FCM. Le JS le creait sous le nom « Meeshy », dans
 * toutes les langues et sans description, au milieu de canaux traduits.
 *
 * Banniere, son par defaut, vibration (#12566), contenu masque sur l'ecran
 * verrouille : les reglages qu'il avait. Seuls le nom et la description
 * changent, et `createNotificationChannel` les met a jour sur un canal deja
 * cree.
 */
final class MessageNotificationChannel {

    static final String ID = "meeshy_notifications";

    private MessageNotificationChannel() {}

    static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            ID,
            context.getString(R.string.push_channel_messages_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.push_channel_messages_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
