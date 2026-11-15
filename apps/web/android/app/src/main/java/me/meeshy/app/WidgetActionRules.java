package me.meeshy.app;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;

/**
 * #10626 — ce que touchent les widgets. Ouvrir passe par le lien court
 * `meeshy://` que le routeur web lit deja (`shell-deep-links.ts`) ; « marquer
 * lu » s'inscrit dans une file que la page vide au retour au premier plan,
 * comme `WidgetActionFlusher` sur iOS — le widget n'a pas de jeton pour
 * appeler la passerelle.
 */
final class WidgetActionRules {

    static final String LIST_LINK = "meeshy://chats";
    static final int MAX_QUEUE = 100;
    private static final String COMPOSE = "compose=1";

    private WidgetActionRules() {}

    static String conversationLink(String conversationId) {
        try {
            return "meeshy://c/" + URLEncoder.encode(conversationId, "UTF-8");
        } catch (UnsupportedEncodingException impossible) {
            return LIST_LINK;
        }
    }

    static String replyLink(String conversationId) {
        return conversationLink(conversationId) + "?" + COMPOSE;
    }

    /** La conversation dont le widget demande le composeur, ou `null`. */
    static String composeTarget(String link) {
        if (link == null) return null;
        try {
            URI uri = new URI(link);
            if (!"meeshy".equals(uri.getScheme()) || !"c".equals(uri.getHost())) return null;
            if (!COMPOSE.equals(uri.getRawQuery())) return null;
            String path = uri.getPath();
            if (path == null || path.length() < 2 || path.indexOf('/', 1) >= 0) return null;
            return path.substring(1);
        } catch (URISyntaxException unreadable) {
            return null;
        }
    }

    static List<String> withId(List<String> ids, String id) {
        if (id == null || id.isEmpty()) return ids;
        List<String> next = new ArrayList<>(ids);
        next.remove(id);
        next.add(id);
        while (next.size() > MAX_QUEUE) next.remove(0);
        return Collections.unmodifiableList(next);
    }

    static String encodeIds(List<String> ids) {
        return new JSONArray(ids).toString();
    }

    static List<String> parseIds(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isEmpty()) return out;
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                Object value = array.opt(i);
                if (value instanceof String && !((String) value).isEmpty()) out.add((String) value);
            }
        } catch (JSONException unreadable) {
            return new ArrayList<>();
        }
        return out;
    }
}
