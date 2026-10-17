package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.Map;

/**
 * #10891 — l'action « Repondre » posee sur la banniere d'un message, comme
 * sur le web (#8860) et iOS (#8858). FCM affiche la banniere lui-meme
 * ({@link MeeshyMessagingService#handleIntent}) ; la coque la RETROUVE par son
 * tag et la reprend telle quelle, comme {@link NotificationVoiceBanner} pour
 * « Ecouter » : seule l'action s'ajoute, sans re-sonner.
 *
 * Le toucher ouvre {@link MainActivity} sur le lien du widget de reponse
 * (`meeshy://c/<id>?compose=1`) : le fil s'ouvre, le curseur y est, et
 * {@link MeeshyWidgetsPlugin} retire la banniere ({@link #dismiss}).
 */
final class NotificationReplyAction {

    private static final String TAG = "MeeshyNotificationReply";
    private static final int OFFER_ATTEMPTS = 8;
    private static final long OFFER_RETRY_MS = 250;

    private NotificationReplyAction() {}

    /** L'action de cette charge, ou null — pour une banniere qui porte deja d'autres actions. */
    static Notification.Action of(Context context, Map<String, String> data) {
        NotificationReplyRules.Reply reply = NotificationReplyRules.replyOf(data);
        return reply == null ? null : action(context, reply);
    }

    /** Apres l'affichage par FCM : pose « Repondre » si ce push l'offre. */
    static void offer(Context context, Map<String, String> data) {
        NotificationReplyRules.Reply reply = NotificationReplyRules.replyOf(data);
        if (reply == null) return;
        offerUntilShown(context.getApplicationContext(), reply, OFFER_ATTEMPTS);
    }

    /** Le toucher de l'action : la banniere qui la portait s'en va. */
    static void dismiss(Context context, Intent intent) {
        String tag = intent == null ? null : intent.getStringExtra(NotificationReplyRules.EXTRA_BANNER_TAG);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (tag == null || tag.isEmpty() || manager == null) return;
        manager.cancel(tag, 0);
    }

    private static void offerUntilShown(Context context, NotificationReplyRules.Reply reply, int attemptsLeft) {
        if (place(context, reply) || attemptsLeft <= 1) return;
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> offerUntilShown(context, reply, attemptsLeft - 1), OFFER_RETRY_MS);
    }

    /** `false` seulement quand aucune banniere ne porte encore ce tag (a rechercher). */
    private static boolean place(Context context, NotificationReplyRules.Reply reply) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return true;
        Notification shown = NotificationVoiceBanner.find(manager, reply.tag);
        if (shown == null) return false;
        // Une banniere qui porte deja ses actions (un vocal, ou un push plus recent
        // du meme fil) ne perd jamais les siennes.
        if (shown.actions != null && shown.actions.length > 0) return true;
        try {
            Notification.Builder builder = Notification.Builder.recoverBuilder(context, shown);
            builder.setActions(action(context, reply));
            builder.setOnlyAlertOnce(true);
            manager.notify(reply.tag, 0, builder.build());
        } catch (RuntimeException failure) {
            Log.w(TAG, "action de reponse non posee", failure);
        }
        return true;
    }

    private static Notification.Action action(Context context, NotificationReplyRules.Reply reply) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(reply.link), context, MainActivity.class)
            .putExtra(NotificationReplyRules.EXTRA_BANNER_TAG, reply.tag)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(context, reply.tag.hashCode(), intent, flags);
        Icon icon = Icon.createWithResource(context, android.R.drawable.ic_menu_send);
        return new Notification.Action.Builder(icon, reply.label, pending).build();
    }
}
