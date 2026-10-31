package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.Person;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.util.TypedValue;
import java.util.List;
import java.util.Map;

/**
 * #12473 — la banniere d'une conversation montre le visage de l'expediteur et
 * empile ses messages ({@link NotificationConversationRules}).
 *
 * Tout se passe dans `handleIntent`, sur l'executeur de FCM, jamais sur le fil
 * principal, et dans cet ordre : {@link #previous} AVANT que FCM ne remplace la
 * banniere du tag, puis l'affichage par FCM, puis {@link #restyle} — le visage
 * telecharge (sous-echantillonne, `WidgetAvatars`), la banniere reposee en
 * `MessagingStyle`. Les actions (« Ecouter », « Repondre ») la reprennent
 * ensuite par `recoverBuilder`, qui garde le style : aucune course entre deux
 * reprises.
 */
final class NotificationConversationStyle {

    private static final String TAG = "MeeshyConversationBanner";
    static final String EXTRA_LINE_IDS = "me.meeshy.app.conversation.LINE_IDS";
    static final String EXTRA_LINE_SENDERS = "me.meeshy.app.conversation.LINE_SENDERS";
    static final String EXTRA_LINE_TEXTS = "me.meeshy.app.conversation.LINE_TEXTS";
    static final String EXTRA_LINE_TIMES = "me.meeshy.app.conversation.LINE_TIMES";
    private static final int AVATAR_DP = 48;
    private static final int SHOWN_ATTEMPTS = 8;
    private static final long SHOWN_RETRY_MS = 250;

    private NotificationConversationStyle() {}

    /** Seuls les messages d'une conversation s'empilent ; une demande d'ami garde sa banniere. */
    static boolean applies(Map<String, String> data) {
        return data != null
            && !blank(data.get("conversationId"))
            && !blank(data.get("messageId"))
            && !NotificationFunnelRules.bannerTag(data).isEmpty()
            && NotificationFunnelRules.fcmDisplays(data);
    }

    /** Les lignes de la banniere que FCM va remplacer — vides s'il n'y en a pas. */
    static List<NotificationConversationRules.Line> previous(Context context, Map<String, String> data) {
        try {
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            if (manager == null) return java.util.Collections.emptyList();
            Notification shown = NotificationVoiceBanner.find(manager, NotificationFunnelRules.bannerTag(data));
            return shown == null ? java.util.Collections.emptyList() : linesOf(shown);
        } catch (RuntimeException failure) {
            Log.w(TAG, "lignes precedentes non lues", failure);
            return java.util.Collections.emptyList();
        }
    }

    /**
     * Reprend la banniere que FCM vient de poser : visage, lignes empilees.
     * Bloque l'executeur de FCM au plus le temps du telechargement et de
     * quelques recherches de la banniere (`notify` est asynchrone).
     */
    static void restyle(Context context, Map<String, String> data, List<NotificationConversationRules.Line> previous) {
        String tag = NotificationFunnelRules.bannerTag(data);
        Bitmap avatar = avatarOf(context, data);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        for (int attempt = 0; attempt < SHOWN_ATTEMPTS; attempt++) {
            Notification shown = NotificationVoiceBanner.find(manager, tag);
            if (shown != null) {
                place(context, manager, tag, shown, data, previous, avatar);
                return;
            }
            SystemClock.sleep(SHOWN_RETRY_MS);
        }
        Log.w(TAG, "banniere introuvable sous son tag, laissee a FCM");
    }

    private static void place(
        Context context, NotificationManager manager, String tag, Notification shown,
        Map<String, String> data, List<NotificationConversationRules.Line> previous, Bitmap avatar) {
        try {
            Bundle extras = shown.extras == null ? new Bundle() : shown.extras;
            String title = textOf(extras.getCharSequence(Notification.EXTRA_TITLE));
            String body = textOf(extras.getCharSequence(Notification.EXTRA_TEXT));
            String sender = blank(data.get("senderDisplayName")) ? title : data.get("senderDisplayName").trim();
            NotificationConversationRules.Line current =
                new NotificationConversationRules.Line(data.get("notificationId"), sender, body, System.currentTimeMillis());
            List<NotificationConversationRules.Line> lines = NotificationConversationRules.stack(previous, current);
            if (lines.isEmpty()) return;

            Notification.Builder builder = Notification.Builder.recoverBuilder(context, shown);
            if (avatar != null) builder.setLargeIcon(avatar);
            builder.setStyle(style(context, data, lines, sender, avatar));
            Bundle stored = new Bundle();
            stored.putStringArray(EXTRA_LINE_IDS, NotificationConversationRules.ids(lines));
            stored.putStringArray(EXTRA_LINE_SENDERS, NotificationConversationRules.senders(lines));
            stored.putStringArray(EXTRA_LINE_TEXTS, NotificationConversationRules.texts(lines));
            stored.putLongArray(EXTRA_LINE_TIMES, NotificationConversationRules.times(lines));
            builder.addExtras(stored);
            builder.addExtras(NotificationBannerActions.marked(data.get("notificationId")));
            builder.setOnlyAlertOnce(true);
            manager.notify(tag, 0, builder.build());
        } catch (RuntimeException failure) {
            Log.w(TAG, "banniere de conversation non reposee", failure);
        }
    }

    private static Notification.MessagingStyle style(
        Context context, Map<String, String> data, List<NotificationConversationRules.Line> lines, String currentSender, Bitmap avatar) {
        String me = context.getString(R.string.notification_conversation_me);
        Notification.MessagingStyle style;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            style = new Notification.MessagingStyle(new Person.Builder().setName(me).build());
        } else {
            style = new Notification.MessagingStyle(me);
        }
        String conversation = data.get("conversationTitle");
        boolean group = !blank(conversation) && !"direct".equals(data.get("conversationType"));
        if (group) {
            style.setConversationTitle(conversation.trim());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) style.setGroupConversation(true);
        }
        for (NotificationConversationRules.Line line : lines) {
            String name = blank(line.sender) ? currentSender : line.sender;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                Person.Builder person = new Person.Builder().setName(name);
                // Le visage telecharge est celui de l'expediteur de CE push.
                if (avatar != null && name != null && name.equals(currentSender)) person.setIcon(Icon.createWithBitmap(avatar));
                style.addMessage(new Notification.MessagingStyle.Message(line.text, line.timeMs, person.build()));
            } else {
                style.addMessage(new Notification.MessagingStyle.Message(line.text, line.timeMs, name));
            }
        }
        return style;
    }

    /** Les lignes que la coque a deja posees, sinon le titre et le texte de la banniere de FCM. */
    private static List<NotificationConversationRules.Line> linesOf(Notification shown) {
        Bundle extras = shown.extras;
        if (extras == null) return java.util.Collections.emptyList();
        List<NotificationConversationRules.Line> stored = NotificationConversationRules.decode(
            extras.getStringArray(EXTRA_LINE_IDS), extras.getStringArray(EXTRA_LINE_SENDERS),
            extras.getStringArray(EXTRA_LINE_TEXTS), extras.getLongArray(EXTRA_LINE_TIMES));
        if (!stored.isEmpty()) return stored;
        String text = textOf(extras.getCharSequence(Notification.EXTRA_TEXT));
        if (blank(text)) return java.util.Collections.emptyList();
        return java.util.Collections.singletonList(new NotificationConversationRules.Line(
            extras.getString(NotificationCorrectionRules.EXTRA_NOTIFICATION_ID),
            textOf(extras.getCharSequence(Notification.EXTRA_TITLE)),
            text,
            shown.when));
    }

    private static Bitmap avatarOf(Context context, Map<String, String> data) {
        String url = NotificationConversationRules.avatarUrl(data, CallShellStore.apiBase(context), NotificationVoiceBanner.debuggable(context));
        if (url == null) return null;
        try {
            int sizePx = Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, AVATAR_DP, context.getResources().getDisplayMetrics()));
            return WidgetAvatars.photoCircle(context, url, sizePx);
        } catch (RuntimeException failure) {
            Log.w(TAG, "visage de l'expediteur non telecharge", failure);
            return null;
        }
    }

    private static String textOf(CharSequence value) {
        return value == null ? null : value.toString();
    }

    private static boolean blank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
