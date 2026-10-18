package me.meeshy.app;

import java.io.UnsupportedEncodingException;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Les actions que la banniere d'un message offre, aux memes conditions que le
 * service worker web (`sw-push.js`, `offreContenu`) :
 *
 * - « Repondre » (#10891) — un type de message de conversation, le libelle que
 *   la passerelle a deja localise (`contentActionPushFields.ts`) et la
 *   conversation. Un message protege l'offre aussi : le libelle ne dit rien du
 *   contenu. Le lien est celui du widget de reponse
 *   ({@link WidgetActionRules#replyLink}) : le fil s'ouvre, le composeur prend
 *   le focus (`compose-focus.ts`).
 * - « Ouvrir la carte » / « Rejoindre » (#10906) — sous `contentActionLabel`,
 *   jamais pour un message protege. La carte part a l'app de cartes par l'URI
 *   `geo:`, celle d'une position dans le fil (`mapsUrlOf`, plateforme
 *   `android`) ; l'invitation n'ouvre que l'ecran d'invitation de CETTE app,
 *   et seulement depuis un lien Meeshy (`cheminInvitation`).
 */
final class NotificationBannerRules {

    /** La banniere a retirer quand une action in-app est touchee. */
    static final String EXTRA_BANNER_TAG = "me.meeshy.app.banner.TAG";

    /** JUMEAU de `REPLYABLE_TYPES` (`sw-push.js`, `contentActionPushFields.ts`). */
    private static final List<String> TYPES = Arrays.asList(
        "new_message", "message_reply", "reply", "user_mentioned", "message_forwarded");
    /** JUMEAU de `SHARE_LINK_KEY` (`sw-push.js`) : un identifiant, jamais un chemin. */
    private static final Pattern KEY = Pattern.compile("^[A-Za-z0-9_-]{1,100}$");
    /** JUMEAU de `INVITE_FORMS` (`sw-push.js`). */
    private static final List<String> INVITE_FORMS = Arrays.asList("chat", "join");

    private NotificationBannerRules() {}

    static final class Action {
        final String label;
        final String link;
        final String tag;
        /** Vrai : le lien s'ouvre dans {@link MainActivity}, qui retire la banniere. */
        final boolean inApp;

        Action(String label, String link, String tag, boolean inApp) {
            this.label = label;
            this.link = link;
            this.tag = tag;
            this.inApp = inApp;
        }
    }

    /** Les actions de cette charge, dans l'ordre du web : le contenu, puis « Repondre ». */
    static List<Action> actionsOf(Map<String, String> data) {
        List<Action> actions = new ArrayList<>();
        Action content = contentOf(data);
        if (content != null) actions.add(content);
        Action reply = replyOf(data);
        if (reply != null) actions.add(reply);
        return actions;
    }

    /** L'action « Repondre » de cette charge, ou null si la banniere ne l'offre pas. */
    static Action replyOf(Map<String, String> data) {
        if (data == null || !TYPES.contains(text(data.get("type")))) return null;
        String label = text(data.get("replyActionLabel"));
        String conversationId = text(data.get("conversationId"));
        String tag = tagOf(data);
        if (label.isEmpty() || tag.isEmpty() || !KEY.matcher(conversationId).matches()) return null;
        return new Action(label, WidgetActionRules.replyLink(conversationId), tag, true);
    }

    /** « Ouvrir la carte » ou « Rejoindre », ou null. */
    static Action contentOf(Map<String, String> data) {
        if (data == null || !text(data.get("notificationLocKey")).isEmpty()) return null;
        String label = text(data.get("contentActionLabel"));
        String tag = tagOf(data);
        if (label.isEmpty() || tag.isEmpty()) return null;
        String map = mapOf(data);
        if (map != null) return new Action(label, map, tag, false);
        String invite = inviteOf(text(data.get("inviteUrl")));
        return invite == null ? null : new Action(label, invite, tag, true);
    }

    private static String mapOf(Map<String, String> data) {
        Double lat = coordinate(data.get("locationLat"), 90);
        Double lon = coordinate(data.get("locationLon"), 180);
        if (lat == null || lon == null) return null;
        String ll = String.format(Locale.ROOT, "%.5f,%.5f", lat, lon);
        String name = text(data.get("locationName"));
        return "geo:" + ll + "?q=" + ll + (name.isEmpty() ? "" : "(" + geoLabel(name) + ")");
    }

    private static String inviteOf(String raw) {
        if (raw.isEmpty()) return null;
        try {
            URI url = new URI(raw);
            String scheme = url.getScheme() == null ? "" : url.getScheme().toLowerCase(Locale.ROOT);
            String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.ROOT);
            List<String> segments = segmentsOf(url.getPath());
            boolean meeshyScheme = "meeshy".equals(scheme);
            boolean meeshyWeb = "https".equals(scheme) && (host.equals("meeshy.me") || host.endsWith(".meeshy.me"));
            if (!meeshyScheme && !meeshyWeb) return null;
            String form = meeshyScheme ? host : (segments.isEmpty() ? "" : segments.get(0));
            int keyAt = meeshyScheme ? 0 : 1;
            String key = segments.size() > keyAt ? segments.get(keyAt) : "";
            if (!INVITE_FORMS.contains(form.toLowerCase(Locale.ROOT)) || !KEY.matcher(key).matches()) return null;
            return "meeshy://chat/" + key;
        } catch (URISyntaxException unreadable) {
            return null;
        }
    }

    private static List<String> segmentsOf(String path) {
        List<String> segments = new ArrayList<>();
        if (path == null) return segments;
        for (String segment : path.split("/")) {
            if (!segment.isEmpty()) segments.add(segment);
        }
        return segments;
    }

    private static Double coordinate(String value, double bound) {
        String raw = text(value);
        if (raw.isEmpty()) return null;
        try {
            double parsed = Double.parseDouble(raw);
            return Double.isFinite(parsed) && Math.abs(parsed) <= bound ? parsed : null;
        } catch (NumberFormatException unreadable) {
            return null;
        }
    }

    /** JUMEAU de `geoLabel` (`message-body.ts`) : les parentheses delimitent le nom. */
    private static String geoLabel(String name) {
        try {
            return URLEncoder.encode(name, "UTF-8").replace("+", "%20");
        } catch (UnsupportedEncodingException impossible) {
            return "";
        }
    }

    private static String tagOf(Map<String, String> data) {
        String tag = text(data.get("gcm.notification.tag"));
        return tag.isEmpty() ? text(data.get("gcm.n.tag")) : tag;
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }
}
