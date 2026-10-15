package me.meeshy.app;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.List;

/**
 * #10626 — le `SharedPreferences` des widgets, miroir de l'App Group iOS :
 * l'instantane publie par la page, la file « marquer lu » qu'elle videra, et
 * la surcouche des lectures faites depuis le widget depuis la derniere
 * publication (la mise a jour optimiste tient jusqu'a ce que la page
 * republie l'etat confirme).
 */
final class WidgetStore {

    private static final String PREFS = "meeshy_widgets";
    private static final String KEY_SNAPSHOT = "snapshot";
    private static final String KEY_PENDING = "pending_mark_read";
    private static final String KEY_OVERLAY = "read_overlay";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void publish(Context context, String json) {
        prefs(context).edit().putString(KEY_SNAPSHOT, json).remove(KEY_OVERLAY).apply();
    }

    /** Deconnexion, changement de compte : rien du compte quitte ne reste. */
    static void clear(Context context) {
        prefs(context).edit().clear().apply();
    }

    static synchronized void queueMarkRead(Context context, String conversationId) {
        SharedPreferences p = prefs(context);
        List<String> pending = WidgetActionRules.withId(WidgetActionRules.parseIds(p.getString(KEY_PENDING, null)), conversationId);
        List<String> overlay = WidgetActionRules.withId(WidgetActionRules.parseIds(p.getString(KEY_OVERLAY, null)), conversationId);
        p.edit()
            .putString(KEY_PENDING, WidgetActionRules.encodeIds(pending))
            .putString(KEY_OVERLAY, WidgetActionRules.encodeIds(overlay))
            .apply();
    }

    static synchronized List<String> drainMarkRead(Context context) {
        SharedPreferences p = prefs(context);
        List<String> pending = WidgetActionRules.parseIds(p.getString(KEY_PENDING, null));
        p.edit().remove(KEY_PENDING).apply();
        return pending;
    }

    static WidgetSnapshotRules.Snapshot load(Context context) {
        SharedPreferences p = prefs(context);
        WidgetSnapshotRules.Snapshot snapshot = WidgetSnapshotRules.decode(p.getString(KEY_SNAPSHOT, null));
        return WidgetSnapshotRules.withReadOverlay(snapshot, WidgetActionRules.parseIds(p.getString(KEY_OVERLAY, null)));
    }
}
