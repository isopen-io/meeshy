package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Le canal des bannieres SANS SON (#8678). Un lecteur qui coupe le son de ses
 * notifications recoit une charge `muted` : le web pose `silent`, iOS retire
 * `aps.sound`. Depuis Android 8, le son d'une bannière est celui de son
 * CANAL — retirer la clé `sound` ne coupait rien, `meeshy_notifications` est
 * sonore. La passerelle adresse donc les charges `muted` a ce canal
 * (`services/gateway/src/services/android-push-config.ts`) : importance haute
 * (la banniere s'affiche), ni son ni vibration.
 *
 * Cree ici plutot que par `@capacitor/push-notifications` : son
 * `createChannel` garde le son par defaut quand aucun n'est donne.
 */
final class SilentNotificationChannel {

    static final String ID = "meeshy_notifications_silent";

    private SilentNotificationChannel() {}

    static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            ID,
            context.getString(R.string.push_channel_silent_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.push_channel_silent_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.setSound(null, null);
        channel.enableVibration(false);
        manager.createNotificationChannel(channel);
    }
}
