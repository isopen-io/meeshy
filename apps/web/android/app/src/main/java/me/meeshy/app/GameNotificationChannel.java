package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;

/**
 * Le canal des notifications du JEU (#10266). Depuis Android 8, une alerte se
 * coupe par canal : tant que « moments a immortaliser », les duos, la ligue et
 * la mission du jour partageaient `meeshy_notifications` avec les messages,
 * couper le jeu dans les reglages du systeme coupait aussi les messages. La
 * passerelle adresse donc toute notification du jeu a ce canal
 * (`services/gateway/src/services/android-push-config.ts`), sauf quand le son
 * est coupe dans Meeshy : le canal muet l'emporte.
 *
 * Il se comporte comme le canal par defaut (banniere, son, vibration) : seule
 * la possibilite de le couper change. Cree ici plutot que par
 * `@capacitor/push-notifications`, pour que son nom suive la langue de la coque.
 */
final class GameNotificationChannel {

    static final String ID = "meeshy_game";

    private GameNotificationChannel() {}

    static void ensure(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
            ID,
            context.getString(R.string.push_channel_game_name),
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(context.getString(R.string.push_channel_game_description));
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
