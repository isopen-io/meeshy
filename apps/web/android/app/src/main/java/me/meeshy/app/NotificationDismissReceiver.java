package me.meeshy.app;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import java.util.Map;

/**
 * #10921 — l'intention de suppression d'une banniere posee par FCM : le
 * systeme l'appelle quand l'utilisateur la balaie (ou efface tout), jamais au
 * toucher ni a un retrait par la coque. Elle note `dismissed` dans l'entonnoir
 * ({@link NotificationFunnelStore}), comme `notificationclose` dans
 * `sw-push.js`.
 */
public class NotificationDismissReceiver extends BroadcastReceiver {

    private static final String TAG = "MeeshyBannerDismiss";

    /** `null` quand la banniere n'a pas d'identifiant que la passerelle puisse verifier. */
    static PendingIntent intentFor(Context context, Map<String, String> data) {
        if (data == null || !NotificationFunnelRules.tracksDismissal(data)) return null;
        Intent intent = new Intent(context, NotificationDismissReceiver.class);
        for (Map.Entry<String, String> entry : NotificationFunnelRules.lineExtras(data).entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, NotificationFunnelRules.bannerTag(data).hashCode(), intent, flags);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            NotificationFunnelStore.noteDismissed(context, NotificationFunnelStore.extrasOf(intent == null ? null : intent.getExtras()));
        } catch (RuntimeException failure) {
            Log.w(TAG, "balayage non note", failure);
        }
    }
}
