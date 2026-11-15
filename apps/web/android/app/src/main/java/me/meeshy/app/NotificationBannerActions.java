package me.meeshy.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Les actions posees sur la banniere d'un message, comme sur le web (#8860)
 * et iOS (#8858) : « Ouvrir la carte » ou « Rejoindre » (#10906), puis
 * « Repondre » (#10891) — decidees par {@link NotificationBannerRules}. FCM
 * affiche la banniere lui-meme ({@link MeeshyMessagingService#handleIntent}) ;
 * la coque la RETROUVE par son tag et la reprend telle quelle, comme
 * {@link NotificationVoiceBanner} pour « Ecouter » : seules les actions
 * s'ajoutent, sans re-sonner.
 *
 * Toute action passe par le relais {@link NotificationActionActivity}
 * (#11052) : il note `opened` et retire la banniere, comme
 * `notificationclick` sur le web, puis ouvre {@link MainActivity} sur son lien
 * `meeshy://` — ou l'app de cartes du telephone pour la carte.
 */
final class NotificationBannerActions {

    private static final String TAG = "MeeshyBannerActions";
    private static final int OFFER_ATTEMPTS = 8;
    private static final long OFFER_RETRY_MS = 250;

    private NotificationBannerActions() {}

    /** Les actions de cette charge — pour une banniere qui porte deja « Ecouter ». */
    static List<Notification.Action> of(Context context, Map<String, String> data) {
        List<Notification.Action> actions = new ArrayList<>();
        for (NotificationBannerRules.Action action : NotificationBannerRules.actionsOf(data)) actions.add(build(context, action, data));
        return actions;
    }

    /**
     * Apres l'affichage par FCM : pose les actions que ce push offre, et
     * l'intention de balayage qui note `dismissed` (#10921) — une banniere sans
     * action est reprise pour elle seule.
     */
    static void offer(Context context, Map<String, String> data) {
        List<NotificationBannerRules.Action> actions = NotificationBannerRules.actionsOf(data);
        PendingIntent dismissal = NotificationDismissReceiver.intentFor(context, data);
        if (actions.isEmpty() && dismissal == null) return;
        String tag = actions.isEmpty() ? NotificationFunnelRules.bannerTag(data) : actions.get(0).tag;
        offerUntilShown(context.getApplicationContext(), tag, data, actions, dismissal, OFFER_ATTEMPTS);
    }

    /** #10989 — la marque qui dit a une correction a quelle notification la banniere appartient. */
    static Bundle marked(String notificationId) {
        Bundle extras = new Bundle();
        String id = notificationId == null ? "" : notificationId.trim();
        if (!id.isEmpty()) extras.putString(NotificationCorrectionRules.EXTRA_NOTIFICATION_ID, id);
        return extras;
    }

    /** Le toucher d'une action in-app : la banniere qui la portait s'en va. */
    static void dismiss(Context context, Intent intent) {
        String tag = intent == null ? null : intent.getStringExtra(NotificationBannerRules.EXTRA_BANNER_TAG);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (tag == null || tag.isEmpty() || manager == null) return;
        manager.cancel(tag, 0);
    }

    private static void offerUntilShown(
        Context context, String tag, Map<String, String> data, List<NotificationBannerRules.Action> actions, PendingIntent dismissal, int attemptsLeft) {
        if (place(context, tag, data, actions, dismissal) || attemptsLeft <= 1) return;
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> offerUntilShown(context, tag, data, actions, dismissal, attemptsLeft - 1), OFFER_RETRY_MS);
    }

    /** `false` seulement quand aucune banniere ne porte encore ce tag (a rechercher). */
    private static boolean place(
        Context context, String tag, Map<String, String> data, List<NotificationBannerRules.Action> actions, PendingIntent dismissal) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return true;
        Notification shown = NotificationVoiceBanner.find(manager, tag);
        if (shown == null) return false;
        // Une banniere qui porte deja ses actions (un vocal, ou un push plus recent
        // du meme fil) ne perd jamais les siennes.
        if (shown.actions != null && shown.actions.length > 0) return true;
        try {
            Notification.Builder builder = Notification.Builder.recoverBuilder(context, shown);
            if (!actions.isEmpty()) {
                Notification.Action[] built = new Notification.Action[actions.size()];
                for (int i = 0; i < built.length; i++) built[i] = build(context, actions.get(i), data);
                builder.setActions(built);
            }
            if (dismissal != null) builder.setDeleteIntent(dismissal);
            builder.addExtras(marked(data.get("notificationId")));
            builder.setOnlyAlertOnce(true);
            manager.notify(tag, 0, builder.build());
        } catch (RuntimeException failure) {
            Log.w(TAG, "actions de banniere non posees", failure);
        }
        return true;
    }

    private static Notification.Action build(Context context, NotificationBannerRules.Action action, Map<String, String> data) {
        Intent intent = NotificationActionActivity.intentFor(context, action, data);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(context, (action.tag + action.link).hashCode(), intent, flags);
        int glyph = action.inApp ? android.R.drawable.ic_menu_send : android.R.drawable.ic_dialog_map;
        return new Notification.Action.Builder(Icon.createWithResource(context, glyph), action.label, pending).build();
    }
}
