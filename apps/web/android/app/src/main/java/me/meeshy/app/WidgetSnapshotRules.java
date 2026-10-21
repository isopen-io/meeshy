package me.meeshy.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * #10626 — l'instantane que la page publie pour les widgets
 * (`src/lib/shell-widgets/snapshot.ts`), relu cote natif. Les widgets n'ont
 * ni API, ni session, ni cache : tout ce qui demande une loi de l'app (nom,
 * apercu servi par le Prisme, non-lu effectif, presence servie) a ete tranche
 * par la page ; ici on ne fait que decoder, superposer les lectures faites
 * depuis le widget, et choisir quoi montrer.
 */
final class WidgetSnapshotRules {

    static final int MAX_ROWS = 50;
    static final int MAX_FAVORITES = 8;
    static final int BRAND = 0xFF6366F1;
    private static final int VERSION = 1;

    private WidgetSnapshotRules() {}

    static final class Row {
        final String id;
        final String name;
        final String initials;
        final String preview;
        final long at;
        final int unread;
        final boolean muted;
        final boolean pinned;
        final boolean group;
        final int accent;
        final String avatar;

        Row(String id, String name, String initials, String preview, long at, int unread, boolean muted,
            boolean pinned, boolean group, int accent, String avatar) {
            this.id = id;
            this.name = name;
            this.initials = initials;
            this.preview = preview;
            this.at = at;
            this.unread = unread;
            this.muted = muted;
            this.pinned = pinned;
            this.group = group;
            this.accent = accent;
            this.avatar = avatar;
        }

        Row read() {
            return new Row(id, name, initials, preview, at, 0, muted, pinned, group, accent, avatar);
        }
    }

    static final class Favorite {
        final String id;
        final String name;
        final String initials;
        final int accent;
        final String avatar;
        final String presence;

        Favorite(String id, String name, String initials, int accent, String avatar, String presence) {
            this.id = id;
            this.name = name;
            this.initials = initials;
            this.accent = accent;
            this.avatar = avatar;
            this.presence = presence;
        }
    }

    static final class Snapshot {
        /** Faux tant que la page n'a rien publie, ou apres une deconnexion. */
        final boolean published;
        final int unread;
        final List<Row> conversations;
        final List<Favorite> favorites;

        Snapshot(boolean published, int unread, List<Row> conversations, List<Favorite> favorites) {
            this.published = published;
            this.unread = unread;
            this.conversations = Collections.unmodifiableList(conversations);
            this.favorites = Collections.unmodifiableList(favorites);
        }
    }

    static final Snapshot NONE = new Snapshot(false, 0, new ArrayList<>(), new ArrayList<>());

    static Snapshot decode(String json) {
        if (json == null || json.isEmpty()) return NONE;
        try {
            JSONObject root = new JSONObject(json);
            if (root.optInt("v", 0) != VERSION) return NONE;
            return new Snapshot(
                true,
                Math.max(0, root.optInt("unread", 0)),
                rows(root.optJSONArray("conversations")),
                favorites(root.optJSONArray("favorites")));
        } catch (JSONException unreadable) {
            return NONE;
        }
    }

    private static String text(JSONObject o, String key) {
        return o.isNull(key) ? "" : o.optString(key, "");
    }

    private static String url(JSONObject o, String key) {
        String value = text(o, key);
        return value.isEmpty() ? null : value;
    }

    private static List<Row> rows(JSONArray array) {
        List<Row> out = new ArrayList<>();
        if (array == null) return out;
        for (int i = 0; i < array.length() && out.size() < MAX_ROWS; i++) {
            JSONObject o = array.optJSONObject(i);
            if (o == null || text(o, "id").isEmpty()) continue;
            out.add(new Row(
                text(o, "id"),
                text(o, "name"),
                text(o, "initials"),
                text(o, "preview"),
                o.isNull("at") ? -1L : o.optLong("at", -1L),
                Math.max(0, o.optInt("unread", 0)),
                o.optBoolean("muted", false),
                o.optBoolean("pinned", false),
                o.optBoolean("group", false),
                parseColor(text(o, "accent"), BRAND),
                url(o, "avatar")));
        }
        return out;
    }

    private static List<Favorite> favorites(JSONArray array) {
        List<Favorite> out = new ArrayList<>();
        if (array == null) return out;
        for (int i = 0; i < array.length() && out.size() < MAX_FAVORITES; i++) {
            JSONObject o = array.optJSONObject(i);
            if (o == null || text(o, "id").isEmpty()) continue;
            out.add(new Favorite(
                text(o, "id"),
                text(o, "name"),
                text(o, "initials"),
                parseColor(text(o, "accent"), BRAND),
                url(o, "avatar"),
                text(o, "presence")));
        }
        return out;
    }

    /**
     * « Marquer lu » touche sur le widget, avant que la page ne l'ait rejoue :
     * la ligne s'eteint et le total baisse tout de suite (mise a jour
     * optimiste), seulement pour ce que le total comptait — une muette n'y
     * etait pas (loi du badge, D-L1).
     */
    static Snapshot withReadOverlay(Snapshot snapshot, List<String> readIds) {
        if (!snapshot.published || readIds.isEmpty()) return snapshot;
        Set<String> read = new HashSet<>(readIds);
        List<Row> rows = new ArrayList<>();
        int dimmed = 0;
        for (Row row : snapshot.conversations) {
            if (read.contains(row.id) && row.unread > 0) {
                if (!row.muted) dimmed++;
                rows.add(row.read());
            } else {
                rows.add(row);
            }
        }
        return new Snapshot(true, Math.max(0, snapshot.unread - dimmed), rows, snapshot.favorites);
    }

    /**
     * #11080 — le total non lu qu'un push porte (`data.unreadCount`, D-L1),
     * ou null : seul un entier positif ou nul compte, comme `poserBadge`
     * (`sw-push.js`) et `updateSharedUnreadCount` (NSE iOS).
     */
    static Integer unreadOf(Map<String, String> data) {
        String raw = data == null ? null : data.get("unreadCount");
        if (raw == null || !raw.matches("\\d{1,9}")) return null;
        return Integer.valueOf(raw);
    }

    /**
     * Le total d'un push est plus recent que la derniere publication de la
     * page, qui l'efface en republiant. Rien n'apparait sans instantane publie.
     */
    static Snapshot withPushedUnread(Snapshot snapshot, Integer pushed) {
        if (!snapshot.published || pushed == null) return snapshot;
        return new Snapshot(true, pushed, snapshot.conversations, snapshot.favorites);
    }

    /** Miroir de `QuickReplyWidgetView` : la premiere non lue, sinon la plus recente. */
    static Row quickReplyTarget(Snapshot snapshot) {
        for (Row row : snapshot.conversations) {
            if (row.unread > 0) return row;
        }
        return snapshot.conversations.isEmpty() ? null : snapshot.conversations.get(0);
    }

    static int parseColor(String hex, int fallback) {
        if (hex == null) return fallback;
        String digits = hex.startsWith("#") ? hex.substring(1) : hex;
        if (digits.length() != 6) return fallback;
        try {
            return 0xFF000000 | Integer.parseInt(digits, 16);
        } catch (NumberFormatException notHex) {
            return fallback;
        }
    }

    /** Regle 1/3/5 (`PRESENCE_HEX`) : hors ligne, aucun point. */
    static Integer presenceDot(String presence) {
        if ("online".equals(presence)) return 0xFF34D399;
        if ("away".equals(presence)) return 0xFFFBBF24;
        if ("idle".equals(presence)) return 0xFF9CA3AF;
        return null;
    }

    static String countLabel(int count) {
        return count > 99 ? "99+" : String.valueOf(count);
    }
}
