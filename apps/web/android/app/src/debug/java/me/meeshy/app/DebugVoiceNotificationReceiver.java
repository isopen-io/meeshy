package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.HashMap;
import java.util.Map;

/**
 * DEBUG SEULEMENT (#10641) — fabrique la banniere d'un vocal comme FCM
 * l'afficherait, app fermee, puis la remet a {@link NotificationVoiceBanner}
 * par le meme chemin que {@link MeeshyMessagingService#handleIntent}. Sert la
 * recette sur emulateur sans envoyer aucun message reel :
 *
 * <pre>
 * adb shell run-as me.meeshy.app am broadcast --user 0 -n me.meeshy.app/.DebugVoiceNotificationReceiver \
 *   --es url https://gate.meeshy.me/api/v1/attachments/file/... [--ez protected true]
 * </pre>
 *
 * Aucun `attachmentId` par defaut : la recette ne rapporte aucune ecoute.
 * Non exporte : seul l'uid de l'app (`run-as`) le declenche, jamais une
 * autre application installee a cote de l'APK debug.
 */
public class DebugVoiceNotificationReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent.getBooleanExtra("clear", false)) {
            // Le volet regroupe les bannieres d'une meme app : la recette repart d'un
            // volet vide et d'un lecteur arrete.
            try {
                context.startService(new Intent(context, NotificationVoiceService.class).setAction(NotificationVoiceService.ACTION_STOP));
            } catch (RuntimeException notRunning) {
                // Aucun lecteur a arreter.
            }
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager != null) manager.cancelAll();
            return;
        }
        if (intent.hasExtra("credential")) {
            // Un credential FACTICE (session anonyme inconnue du serveur) : la coque
            // n'offre l'ecoute qu'a un compte connecte. `--es credential ''` le retire.
            String token = intent.getStringExtra("credential");
            if (token == null || token.isEmpty()) CallShellStore.clearCredential(context);
            else CallShellStore.saveCredential(context, extra(intent, "apiBase", "https://gate.meeshy.me"), "anonymous", token);
            return;
        }
        boolean secret = intent.getBooleanExtra("protected", false);
        String tag = extra(intent, "conversationId", "debug-voice");
        Map<String, String> data = new HashMap<>();
        data.put("type", "new_message");
        data.put("conversationId", tag);
        data.put("conversationTitle", extra(intent, "conversationTitle", ""));
        data.put("messageId", extra(intent, "messageId", "debug-message"));
        data.put("senderDisplayName", extra(intent, "author", "Meeshy"));
        data.put("attachmentId", extra(intent, "attachmentId", ""));
        data.put("gcm.notification.tag", tag);
        if (secret) {
            // Ce que la passerelle pousse pour un vocal protege : la cle, aucune adresse.
            data.put("notificationLocKey", "notification.viewOnce");
            data.put("attachmentUrl", "");
            data.put("attachmentMimeType", "");
        } else {
            data.put("attachmentUrl", extra(intent, "url", ""));
            data.put("attachmentMimeType", extra(intent, "mime", "audio/mp4"));
            data.put("attachmentDurationMs", extra(intent, "durationMs", ""));
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        Notification.Builder builder = builder(context);
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        builder.setSmallIcon(R.drawable.ic_stat_meeshy)
            .setContentTitle(data.get("senderDisplayName"))
            .setContentText(extra(intent, "body", secret ? "👁️ 🎤" : "🎤"))
            .setAutoCancel(true);
        if (open != null) builder.setContentIntent(PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE));
        manager.notify(tag, 0, builder.build());
        NotificationVoiceBanner.offer(context, data);
    }

    // Le constructeur sans canal est la seule voie avant l'API 26 (minSdk 24).
    @SuppressWarnings("deprecation")
    private static Notification.Builder builder(Context context) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(context, "meeshy_notifications")
            : new Notification.Builder(context);
    }

    private static String extra(Intent intent, String key, String fallback) {
        String value = intent.getStringExtra(key);
        return value == null ? fallback : value;
    }
}
