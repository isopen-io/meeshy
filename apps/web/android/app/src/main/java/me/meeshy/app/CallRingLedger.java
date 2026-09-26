package me.meeshy.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Les appels qui ne doivent plus sonner (#8049) : deja sonnes, refuses,
 * decroches ou arretes par `call_cancel` / `call_answered_elsewhere`. FCM ne
 * garantit pas l'ordre : un `call_cancel` peut arriver AVANT la poussee
 * d'appel qu'il annule, et une poussee retentee rejouerait la sonnerie. Miroir
 * de `SeenCallRing` du Kotlin gele (`apps/android`, modele seulement).
 *
 * Immuable et pur : la persistance (SharedPreferences) passe par
 * {@link #encode()} / {@link #decode(String)}.
 */
public final class CallRingLedger {

    /** La fenetre de sonnerie serveur (60 s) et sa marge. */
    public static final long TTL_MS = 3 * 60 * 1000L;
    public static final int CAPACITY = 32;

    private final Map<String, Long> entries;

    private CallRingLedger(Map<String, Long> entries) {
        this.entries = Collections.unmodifiableMap(entries);
    }

    public static CallRingLedger empty() {
        return new CallRingLedger(new LinkedHashMap<>());
    }

    public boolean silenced(String callId, long now) {
        Long at = entries.get(callId);
        return at != null && now - at <= TTL_MS;
    }

    public CallRingLedger with(String callId, long now) {
        LinkedHashMap<String, Long> next = new LinkedHashMap<>();
        for (Map.Entry<String, Long> entry : entries.entrySet()) {
            if (!entry.getKey().equals(callId) && now - entry.getValue() <= TTL_MS) {
                next.put(entry.getKey(), entry.getValue());
            }
        }
        next.put(callId, now);
        List<String> keys = new ArrayList<>(next.keySet());
        for (int i = 0; i < keys.size() - CAPACITY; i++) {
            next.remove(keys.get(i));
        }
        return new CallRingLedger(next);
    }

    public String encode() {
        StringBuilder out = new StringBuilder();
        for (Map.Entry<String, Long> entry : entries.entrySet()) {
            if (out.length() > 0) out.append(',');
            out.append(entry.getKey()).append(':').append(entry.getValue());
        }
        return out.toString();
    }

    public static CallRingLedger decode(String encoded) {
        LinkedHashMap<String, Long> parsed = new LinkedHashMap<>();
        if (encoded == null || encoded.isEmpty()) return new CallRingLedger(parsed);
        for (String item : encoded.split(",")) {
            int colon = item.lastIndexOf(':');
            if (colon <= 0) continue;
            try {
                parsed.put(item.substring(0, colon), Long.parseLong(item.substring(colon + 1)));
            } catch (NumberFormatException ignored) {
                // Une entree illisible est une entree absente : jamais une sonnerie perdue.
            }
        }
        return new CallRingLedger(parsed);
    }
}
