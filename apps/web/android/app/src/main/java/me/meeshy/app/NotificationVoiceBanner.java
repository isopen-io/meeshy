package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;
import android.util.Log;
import java.util.HashMap;
import java.util.Map;

/**
 * L'action « Ecouter » ⇄ « Pause » posee sur la notification d'un vocal
 * (#10641).
 *
 * La banniere d'un message n'est pas rendue par la coque : la passerelle
 * envoie un bloc `notification`, que FCM affiche lui-meme app fermee, sans
 * jamais appeler `onMessageReceived`. {@link MeeshyMessagingService} laisse
 * donc FCM l'afficher, puis la RETROUVE par son tag (celui que la passerelle
 * pose, `android-push-config.ts` § bannerTag) et la reprend telle quelle
 * (`Notification.Builder.recoverBuilder`) : titre, corps servi par le Prisme,
 * canal, ouverture au toucher — rien n'est recompose, seule l'action
 * s'ajoute, sans re-sonner (`setOnlyAlertOnce`).
 *
 * L'action ne porte que les cles de la charge qu'il faut pour rejouer la
 * decision : le service la RE-EVALUE ({@link NotificationVoiceRules#listenable})
 * avant tout telechargement.
 */
final class NotificationVoiceBanner {

    private static final String TAG = "MeeshyNotificationVoice";
    static final String EXTRA_PAYLOAD = "me.meeshy.app.voice.PAYLOAD";

    /** Les cles de la charge qui decrivent le vocal — et elles seules. */
    private static final String[] KEYS = {
        "type", "conversationId", "conversationTitle", "messageId", "senderDisplayName", "senderUsername",
        "attachmentUrl", "attachmentMimeType", "attachmentDurationMs", "attachmentId", "attachmentLanguage",
        "notificationLocKey", "encryptedContent", "gcm.notification.tag", "gcm.n.tag",
    };

    private NotificationVoiceBanner() {}

    static boolean debuggable(Context context) {
        return (context.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    /** La charge d'un push, reduite a ce que la decision lit. */
    static Map<String, String> payloadOf(Bundle extras) {
        Map<String, String> data = new HashMap<>();
        if (extras == null) return data;
        for (String key : KEYS) {
            Object value = extras.get(key);
            if (value != null) data.put(key, String.valueOf(value));
        }
        return data;
    }

    static Bundle bundleOf(Map<String, String> data) {
        Bundle bundle = new Bundle();
        for (String key : KEYS) {
            String value = data.get(key);
            if (value != null) bundle.putString(key, value);
        }
        return bundle;
    }

    /** Apres l'affichage par FCM : pose « Ecouter » si ce push est un vocal ecoutable. */
    static void offer(Context context, Map<String, String> data) {
        NotificationVoiceRules.Voice voice = NotificationVoiceRules.listenable(
            data, CallShellStore.apiBase(context), debuggable(context));
        if (voice == null || voice.tag.isEmpty()) return;
        show(context, data, voice, false);
    }

    /**
     * Reprend la banniere affichee sous le tag du vocal et lui donne l'action
     * de l'etat courant. Sans banniere (balayee, ou app au premier plan : FCM
     * n'en a pas pose), rien n'est cree.
     */
    static void show(Context context, Map<String, String> data, NotificationVoiceRules.Voice voice, boolean playing) {
        show(context, data, voice, playing, null);
    }

    /** `note` remplace la duree sous le titre — l'echec d'une lecture s'y dit. */
    static void show(Context context, Map<String, String> data, NotificationVoiceRules.Voice voice, boolean playing, String note) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null || voice.tag.isEmpty()) return;
        Notification shown = find(manager, voice.tag);
        if (shown == null) return;
        try {
            Notification.Builder builder = Notification.Builder.recoverBuilder(context, shown);
            builder.setActions(action(context, data, playing));
            builder.setOnlyAlertOnce(true);
            String sub = note != null ? note : NotificationVoiceRules.duration(voice.durationMs);
            if (!sub.isEmpty()) builder.setSubText(sub);
            manager.notify(voice.tag, 0, builder.build());
        } catch (RuntimeException failure) {
            Log.w(TAG, "action d'ecoute non posee", failure);
        }
    }

    private static Notification find(NotificationManager manager, String tag) {
        for (StatusBarNotification active : manager.getActiveNotifications()) {
            if (active.getId() == 0 && tag.equals(active.getTag())) return active.getNotification();
        }
        return null;
    }

    private static Notification.Action action(Context context, Map<String, String> data, boolean playing) {
        Intent intent = new Intent(context, NotificationVoiceService.class)
            .setAction(playing ? NotificationVoiceService.ACTION_PAUSE : NotificationVoiceService.ACTION_PLAY)
            .putExtra(EXTRA_PAYLOAD, bundleOf(data));
        String messageId = data.get("messageId");
        int request = (messageId == null ? 0 : messageId.hashCode()) * 2 + (playing ? 1 : 0);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? PendingIntent.getForegroundService(context, request, intent, flags)
            : PendingIntent.getService(context, request, intent, flags);
        int icon = playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String label = context.getString(playing ? R.string.notification_voice_pause : R.string.notification_voice_listen);
        return new Notification.Action.Builder(Icon.createWithResource(context, icon), label, pending).build();
    }
}
