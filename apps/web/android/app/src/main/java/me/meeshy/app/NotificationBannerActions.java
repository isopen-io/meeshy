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
 * Une action in-app ouvre {@link MainActivity} sur son lien `meeshy://`, et
 * {@link MeeshyWidgetsPlugin} retire la banniere ({@link #dismiss}) ; la carte
 * part a l'app de cartes du telephone.
 */
final class NotificationBannerActions {

    private static final String TAG = "MeeshyBannerActions";
    private static final int OFFER_ATTEMPTS = 8;
    private static final long OFFER_RETRY_MS = 250;

    private NotificationBannerActions() {}

    /** Les actions de cette charge — pour une banniere qui porte deja « Ecouter ». */
    static List<Notification.Action> of(Context context, Map<String, String> data) {
        List<Notification.Action> actions = new ArrayList<>();
        for (NotificationBannerRules.Action action : NotificationBannerRules.actionsOf(data)) actions.add(build(context, action));
        return actions;
    }

    /** Apres l'affichage par FCM : pose les actions que ce push offre. */
    static void offer(Context context, Map<String, String> data) {
        List<NotificationBannerRules.Action> actions = NotificationBannerRules.actionsOf(data);
        if (actions.isEmpty()) return;
        offerUntilShown(context.getApplicationContext(), actions, OFFER_ATTEMPTS);
    }

    /** Le toucher d'une action in-app : la banniere qui la portait s'en va. */
    static void dismiss(Context context, Intent intent) {
        String tag = intent == null ? null : intent.getStringExtra(NotificationBannerRules.EXTRA_BANNER_TAG);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (tag == null || tag.isEmpty() || manager == null) return;
        manager.cancel(tag, 0);
    }

    private static void offerUntilShown(Context context, List<NotificationBannerRules.Action> actions, int attemptsLeft) {
        if (place(context, actions) || attemptsLeft <= 1) return;
        new Handler(Looper.getMainLooper()).postDelayed(
            () -> offerUntilShown(context, actions, attemptsLeft - 1), OFFER_RETRY_MS);
    }

    /** `false` seulement quand aucune banniere ne porte encore ce tag (a rechercher). */
    private static boolean place(Context context, List<NotificationBannerRules.Action> actions) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return true;
        String tag = actions.get(0).tag;
        Notification shown = NotificationVoiceBanner.find(manager, tag);
        if (shown == null) return false;
        // Une banniere qui porte deja ses actions (un vocal, ou un push plus recent
        // du meme fil) ne perd jamais les siennes.
        if (shown.actions != null && shown.actions.length > 0) return true;
        try {
            Notification.Builder builder = Notification.Builder.recoverBuilder(context, shown);
            Notification.Action[] built = new Notification.Action[actions.size()];
            for (int i = 0; i < built.length; i++) built[i] = build(context, actions.get(i));
            builder.setActions(built);
            builder.setOnlyAlertOnce(true);
            manager.notify(tag, 0, builder.build());
        } catch (RuntimeException failure) {
            Log.w(TAG, "actions de banniere non posees", failure);
        }
        return true;
    }

    private static Notification.Action build(Context context, NotificationBannerRules.Action action) {
        Intent intent = action.inApp
            ? new Intent(Intent.ACTION_VIEW, Uri.parse(action.link), context, MainActivity.class)
                .putExtra(NotificationBannerRules.EXTRA_BANNER_TAG, action.tag)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            : new Intent(Intent.ACTION_VIEW, Uri.parse(action.link)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pending = PendingIntent.getActivity(context, (action.tag + action.link).hashCode(), intent, flags);
        int glyph = action.inApp ? android.R.drawable.ic_menu_send : android.R.drawable.ic_dialog_map;
        return new Notification.Action.Builder(Icon.createWithResource(context, glyph), action.label, pending).build();
    }
}
