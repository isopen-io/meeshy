package me.meeshy.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import java.text.SimpleDateFormat;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.UUID;

/**
 * Le magasin borne de l'entonnoir natif (#10938) : ce que `handleIntent` note
 * app fermee (recue, affichee) et ce qu'un balayage note (ecartee, #10921), que la page vide au demarrage
 * (`MeeshyNotificationSettings.drainNotificationEvents`). Jumeau de la file
 * IndexedDB de `sw-push.js` ; la regle vit dans {@link NotificationFunnelRules}.
 */
final class NotificationFunnelStore {

    private static final String PREFS = "meeshy_notification_funnel";
    private static final String KEY_EVENTS = "events";

    private NotificationFunnelStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** `java.time` n'existe qu'a partir de l'API 26 ; la coque descend a 24. */
    private static String nowIso() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    static Map<String, String> extrasOf(Bundle extras) {
        Map<String, String> data = new HashMap<>();
        if (extras == null) return data;
        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            if (value != null) data.put(key, String.valueOf(value));
        }
        return data;
    }

    static synchronized void noteShown(Context context, Map<String, String> extras, boolean inForeground, boolean displayed) {
        List<String> lines = NotificationFunnelRules.eventsFor(
            extras, inForeground, displayed, nowIso(), () -> UUID.randomUUID().toString());
        if (lines.isEmpty()) return;
        append(context, lines);
    }

    static synchronized void noteDismissed(Context context, Map<String, String> data) {
        String line = NotificationFunnelRules.dismissedLine(data, nowIso(), () -> UUID.randomUUID().toString());
        if (line == null) return;
        append(context, Collections.singletonList(line));
    }

    static synchronized void noteOpened(Context context, Map<String, String> data) {
        String line = NotificationFunnelRules.openedLine(data, nowIso(), () -> UUID.randomUUID().toString());
        if (line == null) return;
        append(context, Collections.singletonList(line));
    }

    private static void append(Context context, List<String> lines) {
        SharedPreferences prefs = prefs(context);
        String stored = prefs.getString(KEY_EVENTS, null);
        prefs.edit().putString(KEY_EVENTS, NotificationFunnelRules.appended(stored, lines, NotificationFunnelRules.CAP)).apply();
    }

    /** Vide le magasin AVANT de le rendre : un double demarrage ne verse rien deux fois. */
    static synchronized List<String> drain(Context context) {
        SharedPreferences prefs = prefs(context);
        String stored = prefs.getString(KEY_EVENTS, null);
        if (stored == null || stored.isEmpty()) return Collections.emptyList();
        prefs.edit().remove(KEY_EVENTS).commit();
        return NotificationFunnelRules.lines(stored);
    }
}
